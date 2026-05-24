import { App, Modal, Platform, Notice, moment, TFile } from 'obsidian';
import DiwaPlugin from '../main';
import { isTablet } from '../utils';

export class VoiceMemoModal extends Modal {
    plugin: DiwaPlugin;
    mediaRecorder: MediaRecorder | null = null;
    audioChunks: Blob[] = [];
    isRecording: boolean = false;
    recordingStartTime: number = 0;
    recordingTimerInterval: any = null;
    onSave?: (file: TFile) => void;

    constructor(app: App, plugin: DiwaPlugin, onSave?: (file: TFile) => void) {
        super(app);
        this.plugin = plugin;
        this.onSave = onSave;
    }

    onOpen() {
        const { contentEl, modalEl } = this;
        contentEl.empty();

        if (Platform.isMobile) {
            modalEl.style.marginTop = '2vh';
            modalEl.style.marginBottom = '2vh';
            const modalW = isTablet() ? '75vw' : '95vw';
            modalEl.style.width = modalW;
            modalEl.style.maxWidth = modalW;
            modalEl.style.maxHeight = '90vh';
            modalEl.style.alignSelf = 'flex-start';
            contentEl.style.padding = '15px';
        }

        const header = contentEl.createEl('h3', { text: 'Record Voice Memo', attr: { style: 'margin-top: 0; cursor: move; user-select: none;' } });

        // --- Movable Logic ---
        let isDragging = false;
        let startX: number, startY: number;
        let initialLeft: number, initialTop: number;

        header.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = modalEl.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;
            modalEl.style.position = 'fixed';
            modalEl.style.margin = '0';
            modalEl.style.left = initialLeft + 'px';
            modalEl.style.top = initialTop + 'px';
            e.preventDefault();
        });

        const onMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            modalEl.style.left = (initialLeft + dx) + 'px';
            modalEl.style.top = (initialTop + dy) + 'px';
        };

        const onMouseUp = () => { isDragging = false; };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);

        const cleanupDrag = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        const originalOnClose = this.onClose.bind(this);
        this.onClose = () => {
            cleanupDrag();
            if (this.isRecording) this.stopRecording();
            originalOnClose();
        };
        // ---------------------

        const recorderContainer = contentEl.createEl('div', { 
            attr: { style: 'display: flex; flex-direction: column; align-items: center; gap: 15px; padding: 20px 0;' } 
        });

        const recordButton = recorderContainer.createEl('button', { 
            attr: { style: 'width: 100px; height: 100px; border-radius: 50%; border: 4px solid var(--background-modifier-border); background-color: #c0392b; color: white; font-size: 1.5em; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center;' } 
        });
        recordButton.setText('●');

        const timerDisplay = recorderContainer.createEl('div', { 
            text: '00:00', 
            attr: { style: 'font-family: monospace; font-size: 1.5em; color: var(--text-normal); font-weight: 700;' } 
        });

        const statusDisplay = recorderContainer.createEl('div', { 
            text: 'Ready to record', 
            attr: { style: 'font-size: 0.9em; color: var(--text-muted);' } 
        });

        recordButton.addEventListener('click', () => {
            if (this.isRecording) {
                this.stopRecording(recordButton, timerDisplay, statusDisplay);
            } else {
                this.startRecording(recordButton, timerDisplay, statusDisplay);
            }
        });

        const footer = contentEl.createEl('div', { 
            attr: { style: 'display: flex; justify-content: center; margin-top: 10px;' } 
        });
        const closeBtn = footer.createEl('button', { text: 'Close', attr: { style: 'padding: 6px 20px; border-radius: 4px;' } });
        closeBtn.addEventListener('click', () => this.close());
    }

    async startRecording(recordButton: HTMLElement, timerDisplay: HTMLElement, statusDisplay: HTMLElement) {
        let stream: MediaStream | null = null;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            let mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');
            let ext = mimeType === 'audio/webm' ? 'webm' : 'm4a';
            
            this.mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
            this.audioChunks = [];
            this.isRecording = true;

            this.mediaRecorder.ondataavailable = event => this.audioChunks.push(event.data);
            this.mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(this.audioChunks, { type: mimeType });
                const arrayBuffer = await audioBlob.arrayBuffer();
                const folderPath = this.plugin.settings.voiceMemoFolder;
                
                if (!this.app.vault.getAbstractFileByPath(folderPath)) {
                    await this.app.vault.createFolder(folderPath);
                }
                
                const filename = `voice-${moment().format('YYYYMMDD-HHmmss')}.${ext}`;
                const file = await this.app.vault.createBinary(`${folderPath}/${filename}`, arrayBuffer);
                
                this.isRecording = false;
                stream?.getTracks().forEach(track => track.stop());
                
                if (this.onSave) this.onSave(file);
            };

            this.mediaRecorder.start();
            statusDisplay.setText('Recording...');
            recordButton.style.backgroundColor = '#e74c3c';
            recordButton.setText('■');
            recordButton.style.boxShadow = '0 0 0 10px rgba(192, 57, 43, 0.2)';

            this.recordingStartTime = Date.now();
            this.recordingTimerInterval = setInterval(() => {
                const elapsed = Date.now() - this.recordingStartTime;
                const minutes = Math.floor(elapsed / 60000);
                const seconds = Math.floor((elapsed % 60000) / 1000);
                timerDisplay.setText(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
            }, 1000);

        } catch (err) {
            console.error(err);
        } finally {
            // sec-016: Stop mic tracks if setup failed before recording started
            if (!this.isRecording && stream) stream.getTracks().forEach(t => t.stop());
        }
    }

    stopRecording(recordButton?: HTMLElement, timerDisplay?: HTMLElement, statusDisplay?: HTMLElement) {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            
            if (this.recordingTimerInterval) {
                clearInterval(this.recordingTimerInterval);
                this.recordingTimerInterval = null;
            }

            if (recordButton) {
                recordButton.style.backgroundColor = '#c0392b';
                recordButton.setText('●');
                recordButton.style.boxShadow = 'none';
            }
            if (statusDisplay) statusDisplay.setText('Processing...');
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

