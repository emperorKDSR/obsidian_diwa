import { moment, Notice, TFile, setIcon, Platform } from 'obsidian';
import type { DiwaView } from '../view';
import { BaseTab } from "./BaseTab";
import { EditEntryModal } from '../modals/EditEntryModal';
import { ConfirmModal } from '../modals/ConfirmModal';
import { parseContextString, isTablet } from '../utils';
import type { VoiceState, ReviewData } from '../types';

export class VoiceTab extends BaseTab {
    // State machine fields
    private state: VoiceState = 'idle';
    private reviewData: ReviewData | null = null;

    // Recording fields
    private mediaRecorder: MediaRecorder | null = null;
    private activeStream: MediaStream | null = null; // stored for cleanup
    private audioChunks: Blob[] = [];
    private timerInterval: number | null = null;
    private recordingStartTime: number = 0;

    // Waveform fields
    private waveformRAF: number | null = null;
    private analyser: AnalyserNode | null = null;
    private audioCtx: AudioContext | null = null;

    // DOM refs
    private shell: HTMLElement | null = null;
    private stage: HTMLElement | null = null;
    private ctaStrip: HTMLElement | null = null;
    private toastEl: HTMLElement | null = null;
    private keyboardHandler: ((e: KeyboardEvent) => void) | null = null;

    constructor(view: DiwaView) { super(view); }

    render(container: HTMLElement) {
        if (this.keyboardHandler) {
            document.removeEventListener('keydown', this.keyboardHandler);
            this.keyboardHandler = null;
        }
        this.stopWaveform();

        container.empty();
        this.shell = container.createEl('div', { cls: 'diwa-voice-shell' });
        this.shell.setAttribute('data-voice-state', this.state);

        // Header
        const header = this.shell.createEl('div', { cls: 'diwa-voice-header' });
        const navRow = header.createEl('div', { attr: { style: 'display:flex;align-items:center;gap:12px;margin-bottom:2px;' } });
        header.createEl('h2', { text: 'Voice', attr: { style: 'margin:0;font-size:1.4em;font-weight:800;color:var(--text-normal);letter-spacing:-0.02em;line-height:1.1;' } });

        // Stage
        this.stage = this.shell.createEl('div', { cls: 'diwa-voice-stage' });

        // CTA strip (persistent, shown/hidden per state)
        this.ctaStrip = this.shell.createEl('div', { cls: 'diwa-voice-cta' });
        this.buildCtaStrip(this.ctaStrip);

        // Toast
        this.toastEl = this.shell.createEl('div', { cls: 'diwa-voice-toast' });

        // Keyboard handler
        this.keyboardHandler = (e: KeyboardEvent) => this.handleKeyboard(e);
        document.addEventListener('keydown', this.keyboardHandler);

        this.renderState();
    }

    private renderState() {
        if (!this.shell || !this.stage) return;
        this.shell.setAttribute('data-voice-state', this.state);
        this.stage.empty();

        switch (this.state) {
            case 'idle':       this.renderIdle(this.stage);       break;
            case 'recording':  this.renderRecording(this.stage);  break;
            case 'processing': this.renderProcessing(this.stage); break;
            case 'reviewing':  this.renderReview(this.stage);     break;
            case 'confirmed':  this.renderReview(this.stage);     break;
        }

        if (this.ctaStrip) {
            if (this.state === 'reviewing' || this.state === 'confirmed') {
                this.ctaStrip.addClass('is-visible');
            } else {
                this.ctaStrip.removeClass('is-visible');
            }
        }
    }

    private setState(newState: VoiceState, data?: ReviewData) {
        this.state = newState;
        if (data) this.reviewData = data;
        this.renderState();
    }

    // ─── IDLE ───────────────────────────────────────────────────────────────────

    private renderIdle(stage: HTMLElement) {
        // Waveform placeholder
        const waveWrap = stage.createEl('div', { cls: 'diwa-wave-bars is-idle' });
        for (let i = 0; i < 7; i++) waveWrap.createEl('div', { cls: 'diwa-wave-bar' });

        // Mic button
        const micBtn = stage.createEl('button', {
            cls: 'diwa-mic-btn',
            attr: { 'aria-label': 'Start recording', title: 'Tap to start recording' }
        });
        setIcon(micBtn, 'mic');
        stage.createEl('div', { text: 'Tap to capture voice', cls: 'diwa-voice-status' });

        micBtn.addEventListener('click', () => this.startRecording());

        // Long-press to start
        let longPressTimer: number | null = null;
        micBtn.addEventListener('pointerdown', () => {
            longPressTimer = window.setTimeout(() => {
                longPressTimer = null;
                this.haptic('medium');
                this.startRecording();
            }, 500);
        });
        const cancelLP = () => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } };
        micBtn.addEventListener('pointerup', cancelLP);
        micBtn.addEventListener('pointercancel', cancelLP);

        this.renderClips(stage);
    }

    // ─── RECORDING ──────────────────────────────────────────────────────────────

    private renderRecording(stage: HTMLElement) {
        // Waveform
        const waveWrap = stage.createEl('div', { cls: 'diwa-waveform-wrap' });
        requestAnimationFrame(() => {
            if (this.analyser) {
                const canvas = waveWrap.createEl('canvas', { cls: 'diwa-waveform-canvas' }) as HTMLCanvasElement;
                canvas.width = (canvas.offsetWidth || 300) * devicePixelRatio;
                canvas.height = 80 * devicePixelRatio;
                canvas.style.height = '80px';
                waveWrap.addClass('is-live');
                this.startWaveformLoop(canvas);
            } else {
                const bars = waveWrap.createEl('div', { cls: 'diwa-wave-bars' });
                for (let i = 0; i < 7; i++) bars.createEl('div', { cls: 'diwa-wave-bar' });
                waveWrap.addClass('is-live');
            }
        });

        // Timer row
        const timerRow = stage.createEl('div', { cls: 'diwa-voice-timer-row is-visible', attr: { 'aria-live': 'polite' } });
        timerRow.createEl('div', { cls: 'diwa-rec-dot' });
        timerRow.createEl('span', { cls: 'diwa-rec-label', text: 'REC' });
        const timerEl = timerRow.createEl('span', { cls: 'diwa-voice-timer', text: '00:00' });

        this.timerInterval = window.setInterval(() => {
            const elapsed = Date.now() - this.recordingStartTime;
            const m = Math.floor(elapsed / 60000).toString().padStart(2, '0');
            const s = Math.floor((elapsed % 60000) / 1000).toString().padStart(2, '0');
            timerEl.setText(`${m}:${s}`);
            if (elapsed > 600000) timerEl.addClass('is-long');
        }, 1000);

        // Stop button
        const stopBtn = stage.createEl('button', {
            cls: 'diwa-mic-btn is-recording',
            attr: { 'aria-label': 'Stop recording', title: 'Tap to stop' }
        });
        setIcon(stopBtn, 'square');
        stage.createEl('div', { text: 'Tap to stop', cls: 'diwa-voice-status' });
        stopBtn.addEventListener('click', () => {
            this.haptic('double');
            this.stopRecording();
        });
    }

    // ─── PROCESSING ─────────────────────────────────────────────────────────────

    private renderProcessing(stage: HTMLElement) {
        const msgs = ['Parsing your audio...', 'Extracting signal...', 'Translating thought to text...'];
        stage.createEl('div', {
            cls: 'diwa-voice-spinner',
            attr: { role: 'status', 'aria-label': 'Transcribing audio' }
        });
        stage.createEl('div', { cls: 'diwa-processing-label', text: 'Transcribing your note...' });
        stage.createEl('div', { cls: 'diwa-processing-sub', text: msgs[Math.floor(Math.random() * msgs.length)] });
    }

    // ─── REVIEW ─────────────────────────────────────────────────────────────────

    private renderReview(stage: HTMLElement) {
        if (!this.reviewData) return;
        const { transcript, clipFileName } = this.reviewData;

        const reviewSection = stage.createEl('div', { cls: 'diwa-vs-reviewing' });
        reviewSection.createEl('div', { cls: 'diwa-transcript-section-label', text: 'Transcript' });

        // Source badge
        const badge = reviewSection.createEl('div', { cls: 'diwa-source-badge', title: 'Tap to play audio' });
        setIcon(badge.createEl('span'), 'play');
        badge.createEl('span', { text: clipFileName });
        badge.addEventListener('click', () => this.playAudio(clipFileName));

        // Transcript card
        const card = reviewSection.createEl('div', { cls: 'diwa-transcript-card' });
        const textarea = card.createEl('textarea', {
            cls: 'diwa-transcript-textarea',
            attr: { 'aria-label': 'Transcript — edit before saving' }
        }) as HTMLTextAreaElement;
        textarea.value = transcript;

        // Edit hint
        const editHint = reviewSection.createEl('div', { cls: 'diwa-edit-hint' });
        setIcon(editHint.createEl('span'), 'pencil');
        editHint.createEl('span', { text: 'Tap to edit transcript' });
        textarea.addEventListener('focus', () => editHint.addClass('is-hidden'), { once: true });

        // Swipe-left to discard
        this.attachSwipeDiscard(card);

        // Swipe-up on CTA → EditEntryModal (power user escape)
        if (this.ctaStrip) this.attachSwipeUpCta(this.ctaStrip, textarea);

        // Tablet override: skip inline CTA, use modal directly
        if (Platform.isMobile && isTablet()) {
            this.ctaStrip?.removeClass('is-visible');
            const tabletBtn = reviewSection.createEl('button', {
                text: 'Save & Route →',
                attr: { style: 'margin-top:16px;height:52px;background:var(--interactive-accent);color:var(--text-on-accent);border:none;border-radius:14px;font-weight:800;font-size:13px;cursor:pointer;width:100%;' }
            });
            tabletBtn.addEventListener('click', () => {
                new EditEntryModal(this.app, this.plugin, textarea.value, 'transcribed', null, false,
                    async (text, ctxs) => {
                        const contexts = parseContextString(ctxs);
                        await this.plugin.getThoughtController().addThought({ content: text, context: contexts });
                        this.showToast('✦ Saved as Thought');
                        this.resetToIdle();
                    }, 'Transcribed Note').open();
            });
        }
    }

    // ─── CTA STRIP ──────────────────────────────────────────────────────────────

    private buildCtaStrip(strip: HTMLElement) {
        const thoughtBtn = strip.createEl('button', { cls: 'diwa-cta-thought', attr: { title: 'Save as Thought (T)' } });
        thoughtBtn.createEl('span', { cls: 'diwa-cta-thought-icon', text: '💭' });
        thoughtBtn.createEl('span', { text: 'THOUGHT' });
        thoughtBtn.addEventListener('click', () => this.saveAsThought());

        const taskBtn = strip.createEl('button', { cls: 'diwa-cta-task', attr: { title: 'Create Task (K)' } });
        taskBtn.createEl('span', { cls: 'diwa-cta-task-icon', text: '✓' });
        taskBtn.createEl('span', { text: 'CREATE TASK' });
        taskBtn.addEventListener('click', () => this.createTask());

        const discardBtn = strip.createEl('button', { cls: 'diwa-cta-discard', attr: { title: 'Discard (Esc)' } });
        discardBtn.setText('✕');
        discardBtn.addEventListener('click', () => this.discardTranscript());
    }

    // ─── CLIPS ──────────────────────────────────────────────────────────────────

    private renderClips(parent: HTMLElement) {
        const voiceFolder = this.settings.voiceMemoFolder || '000 Bin/DIWA Voice';
        const clips = this.app.vault.getFiles()
            .filter(f => f.path.startsWith(voiceFolder) && ['m4a', 'mp3', 'webm', 'wav'].includes(f.extension))
            .sort((a, b) => b.stat.ctime - a.stat.ctime)
            .slice(0, 8);

        if (clips.length === 0) return;

        const section = parent.createEl('div', { cls: 'diwa-voice-clips-section' });
        section.createEl('div', { cls: 'diwa-voice-clips-label', text: 'RECENT CLIPS' });
        const list = section.createEl('div', { cls: 'diwa-voice-clips-list' });

        clips.forEach(file => {
            const row = list.createEl('div', { cls: 'diwa-clip-row' });
            row.createEl('span', { cls: 'diwa-clip-name', text: file.basename });

            const actions = row.createEl('div', { cls: 'diwa-clip-actions' });

            const transcribeBtn = actions.createEl('button', {
                cls: 'diwa-clip-transcribe-btn',
                text: 'Transcribe',
                attr: { title: `Transcribe ${file.basename}` }
            });
            transcribeBtn.addEventListener('click', async () => {
                transcribeBtn.setText('…');
                transcribeBtn.disabled = true;
                try {
                    const text = await this.ai.transcribeAudio(file);
                    this.setState('reviewing', { transcript: text, clipFile: file, durationMs: 0, clipFileName: file.name });
                } catch (e: any) {
                    console.error('[DIWA VoiceTab]', e);
                    new Notice('Transcription failed. Check the Gemini API key in settings.');
                    transcribeBtn.setText('Transcribe');
                    transcribeBtn.disabled = false;
                }
            });

            const deleteBtn = actions.createEl('button', { cls: 'diwa-clip-delete-btn', attr: { title: 'Delete clip' } });
            setIcon(deleteBtn, 'lucide-trash-2');
            deleteBtn.addEventListener('click', () => {
                new ConfirmModal(this.app, `Delete "${file.basename}"? This cannot be undone.`, async () => {
                    await this.deleteClip(file);
                    row.remove();
                    if (list.children.length === 0) section.remove();
                }).open();
            });
        });
    }

    private async deleteClip(audioFile: TFile) {
        const sidecarPath = audioFile.path.replace(/\.[^.]+$/, '.md');
        const sidecar = this.app.vault.getAbstractFileByPath(sidecarPath);
        if (sidecar instanceof TFile) {
            try { await this.app.vault.trash(sidecar, true); } catch { /* ignore */ }
        }
        await this.app.vault.trash(audioFile, true);
    }

    // ─── RECORDING CONTROL ──────────────────────────────────────────────────────

    private async startRecording() {
        this.haptic('light');
        let stream: MediaStream | null = null;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.activeStream = stream;

            // AudioContext for waveform — failures here must not leak the stream
            try {
                const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
                if (AudioCtx) {
                    this.audioCtx = new AudioCtx();
                    this.analyser = this.audioCtx.createAnalyser();
                    this.analyser.fftSize = 64;
                    this.analyser.smoothingTimeConstant = 0.8;
                    const src = this.audioCtx.createMediaStreamSource(stream);
                    src.connect(this.analyser);
                }
            } catch { this.analyser = null; }

            const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
                           : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');
            this.audioChunks = [];
            this.mediaRecorder = mimeType
                ? new MediaRecorder(stream, { mimeType })
                : new MediaRecorder(stream);
            const ext = mimeType.includes('mp4') ? 'm4a' : 'webm';

            this.mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) this.audioChunks.push(e.data); };
            this.mediaRecorder.onstop = async () => {
                // Always stop tracks in onstop — the definitive cleanup point for normal flow
                this.activeStream?.getTracks().forEach(t => t.stop());
                this.activeStream = null;
                this.stopWaveform();
                if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; }
                const blob = new Blob(this.audioChunks, { type: mimeType || 'audio/webm' });
                const durationMs = Date.now() - this.recordingStartTime;
                this.view.isRecording = false;
                this.setState('processing');
                try {
                    await this.processRecording(blob, ext, durationMs);
                } catch (e: any) {
                    console.error('[DIWA VoiceTab] processRecording', e);
                    new Notice('Recording saved but could not process. Check console.');
                    this.setState('idle');
                }
            };

            this.mediaRecorder.start();
            this.view.isRecording = true;
            this.recordingStartTime = Date.now();
            this.setState('recording');
        } catch (e: any) {
            // Ensure stream is released on any startup error
            stream?.getTracks().forEach(t => t.stop());
            this.activeStream = null;
            this.stopWaveform();
            console.error('[DIWA VoiceTab] mic access', e);
            const friendly = (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError')
                ? 'Microphone access denied — allow permission in your OS settings.'
                : 'Could not start recording. Ensure a microphone is connected.';
            new Notice(friendly);
        }
    }

    private stopRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
    }

    private async processRecording(blob: Blob, ext: string, durationMs: number) {
        const folder = this.settings.voiceMemoFolder || '000 Bin/DIWA Voice';
        if (!this.app.vault.getAbstractFileByPath(folder)) {
            await this.app.vault.createFolder(folder);
        }
        const filename = `voice-${moment().format('YYYYMMDD-HHmmss')}.${ext}`;
        const arrayBuffer = await blob.arrayBuffer();
        await this.app.vault.createBinary(`${folder}/${filename}`, arrayBuffer);

        // Auto-transcribe
        try {
            const clipFile = this.app.vault.getAbstractFileByPath(`${folder}/${filename}`) as TFile | null;
            let transcript = '';
            if (clipFile) {
                transcript = await this.ai.transcribeAudio(clipFile);
                await this.vault.createVoiceSidecar(filename, folder, durationMs, transcript);
            }
            this.setState('reviewing', { transcript, clipFile, durationMs, clipFileName: filename });
        } catch (e: any) {
            console.error('[DIWA VoiceTab] transcription', e);
            const clipFile = this.app.vault.getAbstractFileByPath(`${folder}/${filename}`) as TFile | null;
            this.setState('reviewing', { transcript: '', clipFile, durationMs, clipFileName: filename });
            new Notice('Auto-transcription failed — edit transcript manually or retry.');
        }
    }

    // ─── SAVE ACTIONS ───────────────────────────────────────────────────────────

    private getTranscript(): string {
        const ta = this.stage?.querySelector('.diwa-transcript-textarea') as HTMLTextAreaElement | null;
        return ta ? ta.value : (this.reviewData?.transcript || '');
    }

    private async saveAsThought() {
        const text = this.getTranscript().trim();
        if (!text) { new Notice('Transcript is empty — nothing to save.'); return; }
        this.haptic('success');
        await this.plugin.getThoughtController().addThought({ content: text, context: [] });
        this.showToast('✦ Saved as Thought');
        this.setState('confirmed');
        this.resetToIdle();
    }

    private async createTask() {
        const text = this.getTranscript().trim();
        if (!text) { new Notice('Transcript is empty — nothing to save.'); return; }
        this.haptic('success');
        await this.vault.createTaskFile(text, []);
        this.showToast('✓ Task created');
        this.setState('confirmed');
        this.resetToIdle();
    }

    private discardTranscript() {
        this.haptic('cancel');
        this.showToast('↩ Clip kept in Recent');
        this.setState('confirmed');
        this.resetToIdle();
    }

    // ─── HELPERS ────────────────────────────────────────────────────────────────

    private resetToIdle() {
        setTimeout(() => {
            this.reviewData = null;
            this.state = 'idle';
            this.renderState();
        }, 2600);
    }

    private showToast(message: string) {
        if (!this.toastEl) return;
        this.toastEl.empty();
        this.toastEl.createEl('span', { text: message });
        this.toastEl.addClass('is-visible');
        setTimeout(() => {
            this.toastEl?.addClass('is-dismissing');
            this.toastEl?.removeClass('is-visible');
            setTimeout(() => this.toastEl?.removeClass('is-dismissing'), 300);
        }, 2400);
    }

    private playAudio(filename: string) {
        const folder = this.settings.voiceMemoFolder || '000 Bin/DIWA Voice';
        const file = this.app.vault.getAbstractFileByPath(`${folder}/${filename}`);
        if (file instanceof TFile) {
            const src = this.app.vault.getResourcePath(file);
            const audio = new Audio(src);
            audio.play().catch(() => new Notice('Could not play audio.'));
        }
    }

    private startWaveformLoop(canvas: HTMLCanvasElement) {
        if (!this.analyser) return;
        const analyser = this.analyser;
        const dataArr = new Uint8Array(analyser.frequencyBinCount);
        let lastDraw = 0;

        const draw = (timestamp: number) => {
            if (this.state !== 'recording') return;
            this.waveformRAF = requestAnimationFrame(draw);
            if (timestamp - lastDraw < 33) return;
            lastDraw = timestamp;

            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            const W = canvas.width, H = canvas.height;
            const bars = 32;
            const barW = (W / bars) * 0.6;
            const gap = (W / bars) * 0.4;
            analyser.getByteFrequencyData(dataArr);
            ctx.clearRect(0, 0, W, H);
            const accent = getComputedStyle(canvas).getPropertyValue('--interactive-accent').trim() || '#7c3aed';
            ctx.fillStyle = accent;
            for (let i = 0; i < bars; i++) {
                const val = dataArr[i] / 255;
                const barH = Math.max(4 * devicePixelRatio, val * H * 0.9);
                const x = i * (barW + gap) + gap / 2;
                const y = (H - barH) / 2;
                const r = Math.min(barW / 2, 6);
                ctx.beginPath();
                if ((ctx as any).roundRect) (ctx as any).roundRect(x, y, barW, barH, r);
                else ctx.rect(x, y, barW, barH);
                ctx.fill();
            }
        };
        this.waveformRAF = requestAnimationFrame(draw);
    }

    private stopWaveform() {
        if (this.waveformRAF) { cancelAnimationFrame(this.waveformRAF); this.waveformRAF = null; }
        if (this.audioCtx) { this.audioCtx.close().catch(() => {}); this.audioCtx = null; }
        this.analyser = null;
    }

    private haptic(type: 'light' | 'medium' | 'success' | 'cancel' | 'double') {
        const patterns: Record<string, number | number[]> = {
            light: 10, medium: 30, success: 60, cancel: [12, 30, 12], double: [8, 40, 8]
        };
        (navigator as any).vibrate?.(patterns[type]);
    }

    private handleKeyboard(e: KeyboardEvent) {
        const active = document.activeElement;
        const inTextInput = active instanceof HTMLTextAreaElement
            || active instanceof HTMLInputElement
            || (active instanceof HTMLElement && active.isContentEditable);

        if (this.state === 'idle' && e.code === 'Space' && !inTextInput) {
            e.preventDefault(); this.startRecording();
        } else if (this.state === 'recording' && e.code === 'Space' && !inTextInput) {
            e.preventDefault(); this.haptic('double'); this.stopRecording();
        } else if (this.state === 'reviewing' && !inTextInput) {
            if (e.key === 't' || e.key === 'T') { e.preventDefault(); this.saveAsThought(); }
            else if (e.key === 'k' || e.key === 'K') { e.preventDefault(); this.createTask(); }
            else if (e.key === 'Escape') { e.preventDefault(); this.discardTranscript(); }
        }
    }

    private attachSwipeDiscard(card: HTMLElement) {
        let startX = 0, startY = 0, startTime = 0;
        card.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX; startY = e.touches[0].clientY; startTime = Date.now();
        }, { passive: true });
        card.addEventListener('touchmove', (e) => {
            const dx = e.touches[0].clientX - startX;
            const dy = e.touches[0].clientY - startY;
            if (Math.abs(dx) > Math.abs(dy) && dx < 0) {
                const progress = Math.min(1, Math.abs(dx) / 160);
                card.style.transform = `translateX(${dx}px)`;
                card.style.opacity = `${1 - progress * 0.6}`;
            }
        }, { passive: true });
        card.addEventListener('touchend', (e) => {
            const dx = e.changedTouches[0].clientX - startX;
            if (dx < -80 && Date.now() - startTime < 400) {
                this.discardTranscript();
            } else {
                card.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
                card.style.transform = 'translateX(0)';
                card.style.opacity = '1';
                setTimeout(() => { card.style.transition = ''; }, 200);
            }
        });
    }

    private attachSwipeUpCta(strip: HTMLElement, textarea: HTMLTextAreaElement) {
        let startY = 0;
        strip.addEventListener('touchstart', (e) => { startY = e.touches[0].clientY; }, { passive: true });
        strip.addEventListener('touchend', (e) => {
            const dy = startY - e.changedTouches[0].clientY;
            if (dy > 60) {
                new EditEntryModal(this.app, this.plugin, textarea.value, 'transcribed', null, false,
                    async (text, ctxs) => {
                        const contexts = parseContextString(ctxs);
                        await this.plugin.getThoughtController().addThought({ content: text, context: contexts });
                        this.showToast('✦ Saved as Thought');
                        this.setState('confirmed');
                        this.resetToIdle();
                    }, 'Transcribed Note').open();
            }
        });
    }

    private cleanup() {
        if (this.keyboardHandler) {
            document.removeEventListener('keydown', this.keyboardHandler);
            this.keyboardHandler = null;
        }
        this.stopWaveform();
        if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; }
        // Stop active MediaStream tracks (e.g. if tab switched mid-recording)
        this.activeStream?.getTracks().forEach(t => t.stop());
        this.activeStream = null;
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            try { this.mediaRecorder.stop(); } catch { /* already stopped */ }
        }
        this.mediaRecorder = null;
        this.audioChunks = [];
        // Close AudioContext
        if (this.audioCtx) {
            this.audioCtx.close();
            this.audioCtx = null;
        }
        this.view.isRecording = false;
    }

    onunload() { this.cleanup(); }
}

