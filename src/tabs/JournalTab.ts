import { MarkdownRenderer, moment, Platform, setIcon, Notice } from 'obsidian';
import type { DiwaView } from '../view';
import { BaseTab } from "./BaseTab";
import { JournalEntryModal } from '../modals/JournalEntryModal';
import { ConfirmModal } from '../modals/ConfirmModal';
import { isTablet, attachMediaPasteHandler, attachInlineTriggers } from '../utils';
import type { ThoughtEntry } from '../types';

export class JournalTab extends BaseTab {
    constructor(view: DiwaView) { super(view); }

    render(container: HTMLElement) {
        this._renderJournal(container);
    }

    private _renderJournal(container: HTMLElement) {
        container.empty();

        // Load all journal entries (no date limit)
        const allEntries = Array.from(this.index.thoughtIndex.values())
            .filter(e =>
                Array.isArray(e.context) && e.context.includes('journal')
            );
        allEntries.sort((a, b) =>
            moment(b.created, 'YYYY-MM-DD HH:mm:ss').valueOf() -
            moment(a.created, 'YYYY-MM-DD HH:mm:ss').valueOf()
        );

        const isMobilePhone = Platform.isMobile && !isTablet();

        const root = container.createEl('div', { cls: 'diwa-journal-root' });
        if (isMobilePhone) root.addClass('has-compose-bar');
        const scroll = root.createEl('div', { cls: 'diwa-journal-scroll' });

        // ── Nav row ───────────────────────────────────────────────────────
        const navRow = scroll.createEl('div', { cls: 'diwa-journal-nav-row' });
        if (!isMobilePhone) {
            const newBtn = navRow.createEl('button', { cls: 'diwa-journal-new-btn' });
            const btnIcon = newBtn.createSpan(); setIcon(btnIcon, 'lucide-pencil');
            newBtn.createSpan({ text: 'New Entry' });
            newBtn.addEventListener('click', () => this._openNewEntry());
        }

        // ── Title row (header + FAB pill inline on mobile) ────────────────
        const titleRow = scroll.createEl('div', { cls: 'diwa-journal-title-row' });
        titleRow.createEl('h2', { text: 'Journal', cls: 'diwa-journal-title' });
        if (isMobilePhone) {
            const fab = titleRow.createEl('button', { cls: 'diwa-journal-fab', attr: { 'aria-label': 'New entry' } });
            setIcon(fab, 'lucide-pencil');
            fab.createSpan({ text: 'New Entry', cls: 'diwa-journal-fab-label' });
            fab.addEventListener('click', () => this._openNewEntry());
        }
        scroll.createEl('p', { text: 'All entries', cls: 'diwa-journal-subtitle' });

        // ── Stats strip ───────────────────────────────────────────────────
        const thisMonth = moment().format('YYYY-MM');
        const monthCount = allEntries.filter(e => e.day && e.day.startsWith(thisMonth)).length;
        const streak = this._calcStreak(allEntries);
        const statsRow = scroll.createEl('div', { cls: 'diwa-journal-stats' });
        this._stat(statsRow, String(allEntries.length), 'Entries');
        this._stat(statsRow, String(monthCount), 'This Month');
        this._stat(statsRow, streak > 0 ? `${streak} 🔥` : '—', 'Streak');

        // ── List ──────────────────────────────────────────────────────────
        const listEl = scroll.createEl('div', { cls: 'diwa-journal-list' });
        const renderList = () => {
            listEl.empty();
            if (allEntries.length === 0) {
                this.renderEmptyState(listEl, 'No entries in the last 14 days.\nTap New Entry above to begin. ✍️');
                return;
            }
            this._renderGrouped(listEl, allEntries);
        };

        renderList();
    }
    private _renderGrouped(listEl: HTMLElement, entries: ThoughtEntry[]) {
        const today = moment().format('YYYY-MM-DD');
        const yesterday = moment().subtract(1, 'day').format('YYYY-MM-DD');
        let currentGroup = '';
        for (const entry of entries) {
            const label = this._groupLabel(entry.day || entry.created.split(' ')[0], today, yesterday);
            if (label !== currentGroup) {
                currentGroup = label;
                listEl.createEl('div', { cls: 'diwa-journal-group-header', text: label });
            }
            this._renderCard(listEl, entry);
        }
    }

    private _groupLabel(day: string, today: string, yesterday: string): string {
        if (day === today) return 'Today';
        if (day === yesterday) return 'Yesterday';
        const m = moment(day, 'YYYY-MM-DD', true);
        if (!m.isValid()) return day;
        const daysAgo = moment().diff(m, 'days');
        if (daysAgo < 7) return m.format('dddd');
        if (m.year() === moment().year()) return m.format('MMMM D');
        return m.format('MMMM D, YYYY');
    }

    private _renderCard(listEl: HTMLElement, entry: ThoughtEntry) {
        const timePart = entry.created.includes(' ')
            ? entry.created.split(' ')[1].substring(0, 5)
            : '';

        const card = listEl.createEl('div', { cls: 'diwa-journal-card' });

        // ── Card head: time + actions ─────────────────────────────────────
        const cardHead = card.createEl('div', { cls: 'diwa-journal-card-head' });
        if (timePart) cardHead.createEl('span', { cls: 'diwa-journal-card-time', text: timePart });
        const actions = cardHead.createEl('div', { cls: 'diwa-journal-card-actions' });

        const editBtn = actions.createEl('button', { cls: 'diwa-journal-act-btn', attr: { title: 'Edit entry' } });
        setIcon(editBtn, 'lucide-pencil');
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            new JournalEntryModal(this.app, this.plugin, 'edit', entry.body, entry.filePath,
                async (newText, ctxArr) => {
                    await this.vault.editThought(entry.filePath, newText, ctxArr);
                    this.view.renderView();
                }, entry.context).open();
        });

        const delBtn = actions.createEl('button', {
            cls: 'diwa-journal-act-btn diwa-journal-act-btn--del', attr: { title: 'Delete entry' }
        });
        setIcon(delBtn, 'lucide-trash-2');
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            new ConfirmModal(this.app, 'Move this entry to trash?', async () => {
                await this.vault.deleteFile(entry.filePath, 'thoughts');
                this.view.renderView();
            }).open();
        });

        // ── Body ──────────────────────────────────────────────────────────
        const bodyEl = card.createEl('div', { cls: 'diwa-journal-card-body' });
        MarkdownRenderer.render(this.app, entry.body, bodyEl, entry.filePath, this.view);
        this.hookInternalLinks(bodyEl, entry.filePath);
        this.hookImageZoom(bodyEl);
        this.hookCheckboxes(bodyEl, entry);

        // Thumbnail images — tap to open full-screen zoomable lightbox
        setTimeout(() => {
            bodyEl.querySelectorAll('img').forEach((img: HTMLElement) => {
                img.addClass('diwa-journal-thumb');
                img.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const src = (img as HTMLImageElement).src;
                    if (src) this._openImageLightbox(src);
                });
            });
        }, 120);

        // ── Footer: context chips + reply count ───────────────────────────
        const visibleCtx = entry.context.filter(c => c !== 'journal');
        if (visibleCtx.length > 0) {
            const footer = card.createEl('div', { cls: 'diwa-journal-card-footer' });
            for (const ctx of visibleCtx) {
                footer.createEl('span', { cls: 'diwa-journal-ctx-chip', text: `#${ctx}` });
            }
        }
    }

    // ── INLINE COMPOSE BAR ─────────────────────────────────────────────────
    private _renderComposeBar(root: HTMLElement, scroll: HTMLElement) {
        let contexts: string[] = [];
        const compose = root.createDiv({ cls: 'diwa-journal-compose' });

        // Chips row — appears above input when focused and chips exist
        const chipsWrap = compose.createDiv({ cls: 'diwa-journal-compose-chips' });
        const renderChips = () => {
            chipsWrap.empty();
            const visible = contexts.filter(c => c !== 'journal');
            for (const ctx of visible) {
                const chip = chipsWrap.createEl('span', { cls: 'diwa-jm-chip' });
                chip.createSpan({ text: `#${ctx}` });
                const x = chip.createSpan({ text: '×', cls: 'diwa-jm-chip-x' });
                x.addEventListener('click', (e) => {
                    e.stopPropagation();
                    contexts = contexts.filter(c => c !== ctx);
                    renderChips();
                });
            }
        };

        const row = compose.createDiv({ cls: 'diwa-journal-compose-row' });

        const fileInput = compose.createEl('input', {
            attr: { type: 'file', accept: 'image/*,application/pdf', style: 'display:none' }
        }) as HTMLInputElement;

        const attachBtn = row.createEl('button', {
            cls: 'diwa-journal-compose-attach', attr: { title: 'Attach image' }
        });
        setIcon(attachBtn, 'lucide-image');
        attachBtn.addEventListener('click', () => fileInput.click());

        const textarea = row.createEl('textarea', {
            cls: 'diwa-journal-compose-input',
            attr: { placeholder: 'Write a journal entry…', rows: '1' }
        }) as HTMLTextAreaElement;

        const sendBtn = row.createEl('button', {
            cls: 'diwa-journal-compose-send', attr: { title: 'Save entry' }
        }) as HTMLButtonElement;
        setIcon(sendBtn, 'lucide-send');
        sendBtn.disabled = true;

        const autoGrow = () => {
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
            textarea.style.overflowY = textarea.scrollHeight > 120 ? 'auto' : 'hidden';
        };

        textarea.addEventListener('focus', () => {
            compose.addClass('is-focused');
            setTimeout(() => { scroll.scrollTop = scroll.scrollHeight; }, 350);
        });
        textarea.addEventListener('blur', () => {
            if (!textarea.value.trim() && contexts.length === 0) compose.removeClass('is-focused');
        });
        textarea.addEventListener('input', () => {
            autoGrow();
            sendBtn.disabled = !textarea.value.trim();
        });

        fileInput.addEventListener('change', async () => {
            if (!fileInput.files?.length) return;
            for (let i = 0; i < fileInput.files.length; i++) {
                await this._saveComposeAttachment(fileInput.files[i], textarea);
            }
            fileInput.value = '';
            sendBtn.disabled = !textarea.value.trim();
            autoGrow();
        });

        attachMediaPasteHandler(this.app, textarea, () =>
            this.settings.attachmentsFolder ?? '000 Bin/DIWA Attachments'
        );
        attachInlineTriggers(
            this.app, textarea,
            () => {},
            (tag: string) => { if (!contexts.includes(tag)) { contexts.push(tag); renderChips(); } },
            () => this.settings.contexts ?? [],
            this.settings.peopleFolder
        );

        const doSend = async () => {
            const text = textarea.value.trim();
            if (!text) return;
            const ctxs = [...contexts];
            if (!ctxs.includes('journal')) ctxs.push('journal');
            await this.vault.createThoughtFile(text, ctxs);
            textarea.value = '';
            textarea.style.height = '';
            contexts = [];
            renderChips();
            sendBtn.disabled = true;
            compose.removeClass('is-focused');
            this.view.renderView();
        };

        sendBtn.addEventListener('click', doSend);
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); doSend(); }
        });
    }

    private async _saveComposeAttachment(file: File, textarea: HTMLTextAreaElement): Promise<void> {
        try {
            const folder = (this.settings.attachmentsFolder ?? '000 Bin/DIWA Attachments').trim();
            if (!this.app.vault.getAbstractFileByPath(folder)) {
                await this.app.vault.createFolder(folder);
            }
            const mimeToExt: Record<string, string> = {
                'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif',
                'image/webp': 'webp', 'application/pdf': 'pdf',
            };
            const ext = mimeToExt[file.type] || (file.name.includes('.') ? file.name.split('.').pop()! : 'bin');
            const ts = moment().format('YYYYMMDD_HHmmss');
            const rand = Math.random().toString(36).substring(2, 6);
            const filename = `journal_${ts}_${rand}.${ext}`;
            await this.app.vault.createBinary(`${folder}/${filename}`, await file.arrayBuffer());
            const link = `![[${filename}]]`;
            const start = textarea.selectionStart ?? textarea.value.length;
            const end = textarea.selectionEnd ?? start;
            textarea.value = textarea.value.substring(0, start) + link + textarea.value.substring(end);
            textarea.setSelectionRange(start + link.length, start + link.length);
            textarea.dispatchEvent(new Event('input'));
            new Notice('📎 Image attached', 1200);
        } catch (e) {
            console.error('[DIWA] Compose attachment failed:', e);
            new Notice('Failed to attach image.', 2000);
        }
    }

    // ── FULL-SCREEN IMAGE LIGHTBOX WITH PINCH ZOOM ───────────────────────
    private _openImageLightbox(src: string) {
        const overlay = document.body.createDiv({ cls: 'diwa-journal-lightbox' });
        const imgEl = overlay.createEl('img', {
            cls: 'diwa-journal-lightbox-img',
            attr: { src }
        }) as HTMLImageElement;

        const closeBtn = overlay.createEl('button', { cls: 'diwa-journal-lightbox-close', text: '×' });
        closeBtn.addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        // Pinch-to-zoom
        let scale = 1, lastScale = 1, startDist = 0;
        let originX = 0, originY = 0;

        imgEl.addEventListener('touchstart', (e: TouchEvent) => {
            if (e.touches.length === 2) {
                startDist = Math.hypot(
                    e.touches[1].clientX - e.touches[0].clientX,
                    e.touches[1].clientY - e.touches[0].clientY
                );
                originX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                originY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                imgEl.style.transformOrigin = `${originX}px ${originY}px`;
            }
        }, { passive: true });

        imgEl.addEventListener('touchmove', (e: TouchEvent) => {
            if (e.touches.length !== 2) return;
            e.preventDefault();
            const dist = Math.hypot(
                e.touches[1].clientX - e.touches[0].clientX,
                e.touches[1].clientY - e.touches[0].clientY
            );
            scale = Math.max(1, Math.min(6, lastScale * (dist / startDist)));
            imgEl.style.transform = `scale(${scale})`;
        }, { passive: false });

        imgEl.addEventListener('touchend', () => { lastScale = scale; });

        // Double-tap to reset zoom
        let lastTap = 0;
        imgEl.addEventListener('click', (e) => {
            e.stopPropagation();
            const now = Date.now();
            if (now - lastTap < 300) {
                scale = 1; lastScale = 1;
                imgEl.style.transform = 'scale(1)';
                imgEl.style.transformOrigin = 'center center';
            }
            lastTap = now;
        });
    }

    private _openNewEntry() {
        new JournalEntryModal(this.app, this.plugin, 'new', '', null,
            async (text, contexts) => {
                if (!text.trim()) return;
                await this.vault.createThoughtFile(text, contexts);
                this.view.renderView();
            }).open();
    }

    private _calcStreak(entries: ThoughtEntry[]): number {
        const days = new Set(entries.map(e => e.day || e.created.split(' ')[0]).filter(Boolean));
        let streak = 0;
        let cursor = moment().startOf('day');
        if (!days.has(cursor.format('YYYY-MM-DD'))) cursor = cursor.subtract(1, 'day');
        while (days.has(cursor.format('YYYY-MM-DD'))) {
            streak++;
            cursor = cursor.subtract(1, 'day');
        }
        return streak;
    }

    private _stat(parent: HTMLElement, value: string, label: string) {
        const s = parent.createEl('div', { cls: 'diwa-journal-stat' });
        s.createEl('div', { cls: 'diwa-journal-stat-val', text: value });
        s.createEl('div', { cls: 'diwa-journal-stat-lbl', text: label });
    }
}


