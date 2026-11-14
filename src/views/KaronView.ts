import {
    ItemView,
    WorkspaceLeaf,
    setIcon,
    moment,
    MarkdownRenderer,
    TFile,
    Menu,
    Notice,
    Platform,
    Component
} from 'obsidian';
import type DiwaPlugin from '../main';
import { VIEW_TYPE_KARON, KARON_ICON_ID } from '../constants';
import { GawaTaskRecord, HorizonBillItem, HorizonNoteBlock, KaronMocTopic } from '../types';
import { WikilinkPeekModal, openWikilinkInPeekWindow } from '../modals/WikilinkPeekModal';
import { DatePickerModal } from '../modals/DatePickerModal';
import { MobileTaskEditModal } from '../modals/MobileTaskEditModal';
import { FileSuggestModal } from '../modals/FileSuggestModal';
import { CreateMocTopicModal } from '../modals/CreateMocTopicModal';
import { isTablet, attachInlineTriggers, attachMediaPasteHandler } from '../utils';
import { createVaultFile } from '../utils/vaultFiles';
import {
    KaronQuickAddMode,
    filterKaronTasks,
    formatKaronNotesHeading,
    formatKaronQuickCaptureContent,
    getKaronDayTitle,
    parseStandaloneWikilinkSchedule
} from '../utils/karonHelpers';

export class KaronView extends ItemView {
    plugin: DiwaPlugin;

    private _horizon: 'today' | '3d' | '7d' = 'today';
    private _collapsedSections: Set<string> = new Set();
    private _undatedExpanded = false;

    private _pinnedSubtasks: Set<string> = new Set();
    private _expandedSubtaskInputs: Set<string> = new Set();
    private _pinnedRemarks: Set<string> = new Set();
    private _expandedRemarkInputs: Set<string> = new Set();

    private _quickAddMode: KaronQuickAddMode = 'task';
    private _quickTaskTargetDate: string = moment().format('YYYY-MM-DD');
    private _selectedMocTopicId: string = '';
    private _mobileActiveTab: 'horizon' | 'moc' = 'horizon';

    private _containerEl: HTMLElement | null = null;
    private _headerEl: HTMLElement | null = null;
    private _layoutRowEl: HTMLElement | null = null;
    private _stageEl: HTMLElement | null = null;
    private _mocPaneEl: HTMLElement | null = null;
    private _quickInputEl: HTMLTextAreaElement | null = null;
    private _quickDateLabelEl: HTMLElement | null = null;

    private _renderComponent: Component | null = null;
    private _renderToken = 0;

    constructor(leaf: WorkspaceLeaf, plugin: DiwaPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_KARON;
    }

    getDisplayText(): string {
        return 'Karon — Today & Horizon';
    }

    getIcon(): string {
        return KARON_ICON_ID;
    }

    async onOpen(): Promise<void> {
        this.contentEl.empty();
        this.contentEl.addClass('diwa-workspace-root');
        this.contentEl.addClass('pos-karon-view');

        this.initSelectedMocTopic();

        this._containerEl = this.contentEl.createDiv({ cls: 'pos-karon-container' });
        this._headerEl = this._containerEl.createDiv({ cls: 'pos-karon-header' });
        this._layoutRowEl = this._containerEl.createDiv({ cls: 'pos-karon-layout-row' });
        this._stageEl = this._layoutRowEl.createDiv({ cls: 'pos-karon-stage' });
        this._mocPaneEl = this._layoutRowEl.createDiv({ cls: 'pos-karon-moc-pane' });

        this.registerDomEvent(this.contentEl, 'keydown', (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'l') {
                e.preventDefault();
                e.stopPropagation();
                this.openScheduleExistingNotePicker(this._quickTaskTargetDate);
            }
        });

        this.renderHeader();
        await this.renderStage();
        this.renderMocPane();
    }

    async onClose(): Promise<void> {
        this._renderToken++;
        this.unloadRenderComponent();
        this.contentEl.empty();
    }

    public refreshView(): void {
        this.renderHeader();
        void this.renderStage();
        this.renderMocPane();
    }

    private initSelectedMocTopic(): void {
        const topics = this.getMocTopics();
        const saved = window.localStorage?.getItem('diwa-karon-moc-topic');
        if (saved && topics.some(t => t.id === saved)) {
            this._selectedMocTopicId = saved;
        } else if (topics.length > 0) {
            this._selectedMocTopicId = topics[0].id;
        }
    }

    private getMocTopics(): KaronMocTopic[] {
        return this.plugin.settings.karonMocTopics || [];
    }

    private getSelectedTopic(): KaronMocTopic | null {
        const topics = this.getMocTopics();
        return topics.find(t => t.id === this._selectedMocTopicId) || topics[0] || null;
    }

    private unloadRenderComponent(): void {
        if (this._renderComponent) {
            this._renderComponent.unload();
            this._renderComponent = null;
        }
    }

    private isMobilePhone(): boolean {
        return Platform.isMobile && !isTablet(this.app);
    }

    private getTaskKey(task: GawaTaskRecord): string {
        return `${task.filePath}::${task.lineIndex}`;
    }

    private formatTargetChipLabel(dateStr: string): string {
        const todayStr = moment().format('YYYY-MM-DD');
        const tomorrowStr = moment().add(1, 'day').format('YYYY-MM-DD');
        if (dateStr === todayStr) return 'Today';
        if (dateStr === tomorrowStr) return 'Tomorrow';
        return moment(dateStr).format('MMM D');
    }

    private renderHeader(): void {
        if (!this._headerEl) return;
        const activeDraft = this._quickInputEl?.value ?? '';
        const wasFocused = document.activeElement === this._quickInputEl;

        this._headerEl.empty();
        const today = moment();

        const titleArea = this._headerEl.createDiv({ cls: 'pos-karon-title-area' });
        const titleRow = titleArea.createDiv({ cls: 'pos-karon-title-row' });
        const iconSpan = titleRow.createSpan({ cls: 'pos-karon-header-icon' });
        setIcon(iconSpan, 'sun');
        titleRow.createEl('h3', { text: `Karon · ${today.format('dddd, MMMM D, YYYY')}`, cls: 'pos-karon-title' });

        titleArea.createEl('p', {
            text: "Today's briefing & rolling intended horizon",
            cls: 'pos-karon-subtitle'
        });

        const actionsRow = this._headerEl.createDiv({ cls: 'pos-karon-actions-row' });
        const horizonGroup = actionsRow.createDiv({ cls: 'pos-karon-horizon-group' });

        const horizons: { id: 'today' | '3d' | '7d'; label: string; icon: string }[] = [
            { id: 'today', label: 'Today', icon: 'sun' },
            { id: '3d', label: '3 Days', icon: 'calendar' },
            { id: '7d', label: '7 Days', icon: 'calendar-days' }
        ];

        for (const h of horizons) {
            const btn = horizonGroup.createEl('button', {
                cls: `pos-karon-horizon-btn ${this._horizon === h.id ? 'is-active' : ''}`
            });
            const btnIcon = btn.createSpan({ cls: 'pos-btn-icon' });
            setIcon(btnIcon, h.icon);
            btn.createSpan({ text: h.label });
            btn.onclick = () => {
                this._horizon = h.id;
                this.renderHeader();
                void this.renderStage();
            };
        }

        // Mobile / Compact segmented switcher for Horizon vs MOC
        const mobileSwitcher = actionsRow.createDiv({ cls: 'pos-karon-mobile-switcher' });
        const horizonTabBtn = mobileSwitcher.createEl('button', {
            cls: `pos-karon-mobile-tab-btn ${this._mobileActiveTab === 'horizon' ? 'is-active' : ''}`,
            text: '☀️ Horizon'
        });
        horizonTabBtn.onclick = () => {
            this._mobileActiveTab = 'horizon';
            this.updateMobilePaneVisibility();
            this.renderHeader();
        };

        const mocTabBtn = mobileSwitcher.createEl('button', {
            cls: `pos-karon-mobile-tab-btn ${this._mobileActiveTab === 'moc' ? 'is-active' : ''}`,
            text: '🗺️ Topics'
        });
        mocTabBtn.onclick = () => {
            this._mobileActiveTab = 'moc';
            this.updateMobilePaneVisibility();
            this.renderHeader();
        };

        const refreshBtn = actionsRow.createEl('button', {
            cls: 'pos-karon-action-btn',
            attr: { 'aria-label': 'Refresh Horizon & Topics' }
        });
        setIcon(refreshBtn, 'rotate-cw');
        refreshBtn.onclick = () => {
            void this.renderStage();
            this.renderMocPane();
        };

        this.renderQuickAddBar(this._headerEl, activeDraft, wasFocused);
    }

    private getQuickAddPlaceholder(): string {
        return this._quickAddMode === 'note'
            ? 'Add a note (Enter to save, [[Note]] + Enter or ⌘L to schedule, #tag, @date)...'
            : 'Quick add task (Enter to save, Shift+Enter newline, #tag, @date)...';
    }

    private renderQuickAddBar(parent: HTMLElement, initialDraft: string, refocus: boolean): void {
        const bar = parent.createDiv({ cls: 'pos-karon-quick-add-bar' });

        // Top/left input row with auto-sizing textarea
        const inputWrap = bar.createDiv({ cls: 'pos-karon-quick-add-input-wrap' });
        const modeIcon = inputWrap.createSpan({ cls: 'pos-karon-quick-add-icon' });
        setIcon(modeIcon, this._quickAddMode === 'note' ? 'file-text' : 'check-square');

        const textarea = inputWrap.createEl('textarea', {
            cls: 'pos-karon-quick-add-textarea',
            attr: {
                rows: '1',
                placeholder: this.getQuickAddPlaceholder()
            }
        });
        textarea.value = initialDraft;
        this._quickInputEl = textarea;

        const autoResize = () => {
            textarea.style.height = 'auto';
            textarea.style.height = `${Math.min(textarea.scrollHeight, 112)}px`;
        };
        textarea.addEventListener('input', autoResize);
        if (initialDraft) {
            setTimeout(autoResize, 0);
        }

        attachInlineTriggers(
            this.app,
            textarea,
            (parsedDate) => {
                this._quickTaskTargetDate = parsedDate;
                if (this._quickDateLabelEl) {
                    this._quickDateLabelEl.setText(this.formatTargetChipLabel(parsedDate));
                }
            },
            undefined,
            () => this.plugin.settings.contexts || [],
            this.plugin.settings.peopleFolder
        );

        attachMediaPasteHandler(
            this.app,
            textarea,
            () => this.plugin.settings.attachmentsFolder || '000 Bin/DIWA Attachments'
        );

        const controls = bar.createDiv({ cls: 'pos-karon-quick-add-controls' });

        // Segmented Task | Note Toggle
        const modeGroup = controls.createDiv({ cls: 'pos-karon-mode-toggle' });
        const modes: { id: KaronQuickAddMode; label: string; icon: string }[] = [
            { id: 'task', label: 'Task', icon: 'check-square' },
            { id: 'note', label: 'Note', icon: 'file-text' }
        ];
        const modeBtns = new Map<KaronQuickAddMode, HTMLButtonElement>();
        for (const m of modes) {
            const btn = modeGroup.createEl('button', {
                cls: `pos-karon-mode-btn ${this._quickAddMode === m.id ? 'is-active' : ''}`,
                attr: { type: 'button', 'aria-label': `Switch quick add to ${m.label}` }
            });
            const ic = btn.createSpan({ cls: 'pos-btn-icon' });
            setIcon(ic, m.icon);
            btn.createSpan({ text: m.label });
            modeBtns.set(m.id, btn);
            btn.onclick = () => {
                this._quickAddMode = m.id;
                for (const [id, b] of modeBtns.entries()) {
                    b.toggleClass('is-active', id === m.id);
                }
                setIcon(modeIcon, m.id === 'note' ? 'file-text' : 'check-square');
                textarea.placeholder = this.getQuickAddPlaceholder();
                textarea.focus();
            };
        }

        // Target Date Chip
        const dateBtn = controls.createEl('button', {
            cls: 'pos-karon-quick-date-btn',
            attr: { type: 'button', 'aria-label': 'Select target date' }
        });
        const calIcon = dateBtn.createSpan({ cls: 'pos-btn-icon' });
        setIcon(calIcon, 'calendar');
        const dateLabel = dateBtn.createSpan({ text: this.formatTargetChipLabel(this._quickTaskTargetDate) });
        this._quickDateLabelEl = dateLabel;

        dateBtn.onclick = (e) => {
            this.openQuickDateMenu(e, (chosen) => {
                this._quickTaskTargetDate = chosen;
                if (this._quickDateLabelEl) {
                    this._quickDateLabelEl.setText(this.formatTargetChipLabel(chosen));
                }
            });
        };

        let isSubmitting = false;
        const submitQuickCapture = async () => {
            if (isSubmitting) return;
            const rawText = textarea.value;
            if (!rawText.trim()) return;

            isSubmitting = true;
            try {
                if (this._quickAddMode === 'note') {
                    const standalone = parseStandaloneWikilinkSchedule(rawText);
                    if (standalone) {
                        const targetFile = this.app.metadataCache.getFirstLinkpathDest(standalone.linkTarget, '');
                        if (targetFile instanceof TFile) {
                            await this.scheduleExistingNoteForDate(
                                targetFile,
                                standalone.explicitDate || this._quickTaskTargetDate
                            );
                            textarea.value = '';
                            autoResize();
                            return;
                        }
                    }
                }

                const content = formatKaronQuickCaptureContent(
                    rawText,
                    this._quickAddMode,
                    this._quickTaskTargetDate
                );
                if (!content) return;

                const created = await this.plugin.capture.createCaptureNote(content);
                await this.plugin.index.indexCaptureFile(created);
                textarea.value = '';
                autoResize();
                this.plugin.refreshCoordinator.notifyRefresh('all');
                const noun = this._quickAddMode === 'note' ? 'Note' : 'Task';
                new Notice(`${noun} added for ${this.formatTargetChipLabel(this._quickTaskTargetDate)}`);
            } catch (err) {
                console.error('[DIWA Karon] Failed to create quick capture', err);
                new Notice('Failed to add item');
            } finally {
                isSubmitting = false;
            }
        };

        textarea.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void submitQuickCapture();
            } else if (e.key === 'Escape') {
                textarea.value = '';
                autoResize();
                textarea.blur();
            }
        };

        if (refocus) {
            setTimeout(() => textarea.focus(), 0);
        }
    }

    private updateMobilePaneVisibility(): void {
        if (!this._stageEl || !this._mocPaneEl) return;
        const isHorizon = this._mobileActiveTab === 'horizon';
        this._stageEl.toggleClass('pos-karon-mobile-hidden', !isHorizon);
        this._mocPaneEl.toggleClass('pos-karon-mobile-hidden', isHorizon);
    }

    private renderMocPane(): void {
        if (!this._mocPaneEl) return;
        this._mocPaneEl.empty();
        this.updateMobilePaneVisibility();

        const topics = this.getMocTopics();
        const selectedTopic = this.getSelectedTopic();

        // 1. Pane Header
        const headerEl = this._mocPaneEl.createDiv({ cls: 'pos-karon-moc-header' });

        const titleRow = headerEl.createDiv({ cls: 'pos-karon-moc-title-row' });
        const iconSpan = titleRow.createSpan({ cls: 'pos-karon-moc-icon' });
        setIcon(iconSpan, 'folder-tree');
        titleRow.createEl('h4', { text: 'Topics & MOC', cls: 'pos-karon-moc-title' });

        // Add note to topic action buttons
        const actionGroup = titleRow.createDiv({ cls: 'pos-karon-moc-actions' });

        const addTopicBtn = actionGroup.createEl('button', {
            cls: 'pos-karon-moc-action-btn',
            attr: { 'aria-label': 'Create new MOC topic', title: 'New topic' }
        });
        setIcon(addTopicBtn, 'folder-plus');
        addTopicBtn.onclick = () => {
            this.openCreateMocTopicModal();
        };

        const addExistingBtn = actionGroup.createEl('button', {
            cls: 'pos-karon-moc-action-btn',
            attr: { 'aria-label': 'Add existing note to this topic', title: 'Pick existing note' }
        });
        setIcon(addExistingBtn, 'link-2');
        addExistingBtn.onclick = () => {
            if (!selectedTopic) return;
            this.openAddExistingNoteToTopicPicker(selectedTopic);
        };

        const createNewBtn = actionGroup.createEl('button', {
            cls: 'pos-karon-moc-action-btn',
            attr: { 'aria-label': 'Create new note in this topic', title: 'Create new note' }
        });
        setIcon(createNewBtn, 'plus');
        createNewBtn.onclick = () => {
            if (!selectedTopic) return;
            this.promptCreateNewNoteInTopic(selectedTopic);
        };

        // 2. Topic Dropdown Bar
        const dropdownBar = headerEl.createDiv({ cls: 'pos-karon-moc-dropdown-bar' });
        if (topics.length === 0) {
            const emptyHint = dropdownBar.createDiv({ cls: 'pos-karon-moc-empty-hint' });
            emptyHint.createSpan({ text: 'No topics configured. ' });
            const addFirstTopicBtn = emptyHint.createEl('button', {
                cls: 'pos-karon-pill-btn',
                text: '+ Add Topic'
            });
            addFirstTopicBtn.onclick = () => this.openCreateMocTopicModal();
            return;
        }

        const selectWrap = dropdownBar.createDiv({ cls: 'pos-karon-moc-select-wrap' });
        const selectEl = selectWrap.createEl('select', { cls: 'pos-karon-moc-select' });

        for (const topic of topics) {
            const opt = selectEl.createEl('option', {
                value: topic.id,
                text: `${topic.icon ? topic.icon + ' ' : ''}${topic.label}`
            });
            if (selectedTopic && topic.id === selectedTopic.id) {
                opt.selected = true;
            }
        }

        const addNewTopicOpt = selectEl.createEl('option', {
            value: '__add_new_topic__',
            text: '+ New Topic...'
        });

        selectEl.onchange = () => {
            if (selectEl.value === '__add_new_topic__') {
                if (selectedTopic) {
                    selectEl.value = selectedTopic.id;
                }
                this.openCreateMocTopicModal();
                return;
            }
            this._selectedMocTopicId = selectEl.value;
            window.localStorage?.setItem('diwa-karon-moc-topic', selectEl.value);
            this.renderMocPane();
        };

        const tagBadge = dropdownBar.createSpan({
            cls: 'pos-karon-moc-tag-badge',
            text: `#${selectedTopic?.tag || ''}`
        });

        // 3. Notes List for Selected Topic
        const listEl = this._mocPaneEl.createDiv({ cls: 'pos-karon-moc-list' });
        if (!selectedTopic) return;

        const topicNotes = this.plugin.index.getNotesForMocTag(selectedTopic.tag);
        const countHeader = listEl.createDiv({ cls: 'pos-karon-moc-count-row' });
        countHeader.createSpan({
            cls: 'pos-karon-moc-count-text',
            text: `${topicNotes.length} Note${topicNotes.length === 1 ? '' : 's'}`
        });

        if (topicNotes.length === 0) {
            const emptyEl = listEl.createDiv({ cls: 'pos-karon-moc-empty-state' });
            emptyEl.createSpan({
                cls: 'pos-karon-moc-empty-msg',
                text: `No notes tagged #${selectedTopic.tag} yet.`
            });
            const emptyActions = emptyEl.createDiv({ cls: 'pos-karon-moc-empty-actions' });
            const pickBtn = emptyActions.createEl('button', {
                cls: 'pos-karon-pill-btn',
                text: 'Link Existing Note'
            });
            pickBtn.onclick = () => this.openAddExistingNoteToTopicPicker(selectedTopic);
            const newBtn = emptyActions.createEl('button', {
                cls: 'pos-karon-pill-btn',
                text: '+ New Note'
            });
            newBtn.onclick = () => this.promptCreateNewNoteInTopic(selectedTopic);
            return;
        }

        for (const item of topicNotes) {
            this.renderMocNoteRow(listEl, item, selectedTopic);
        }
    }

    private renderMocNoteRow(
        container: HTMLElement,
        item: { file: TFile; title: string; folder: string; mtime: number },
        topic: KaronMocTopic
    ): void {
        const row = container.createDiv({ cls: 'pos-karon-moc-item' });

        const iconEl = row.createSpan({ cls: 'pos-karon-moc-item-icon' });
        setIcon(iconEl, 'file-text');

        const bodyEl = row.createDiv({ cls: 'pos-karon-moc-item-body' });
        const titleEl = bodyEl.createDiv({
            cls: 'pos-karon-moc-item-title',
            text: item.title
        });
        titleEl.onclick = (e: MouseEvent) => {
            e.stopPropagation();
            if (e.metaKey || e.ctrlKey) {
                void this.app.workspace.openLinkText(item.file.basename, item.file.path, 'tab');
                return;
            }
            if (e.altKey) {
                void openWikilinkInPeekWindow(this.app, item.file.basename, item.file.path);
                return;
            }
            this.openWikilinkModal(item.file.basename, item.file.path);
        };

        const metaRow = bodyEl.createDiv({ cls: 'pos-karon-moc-item-meta' });
        if (item.folder) {
            metaRow.createSpan({ cls: 'pos-karon-moc-item-folder', text: item.folder });
            metaRow.createSpan({ text: ' · ', cls: 'pos-karon-moc-item-dot' });
        }
        metaRow.createSpan({
            cls: 'pos-karon-moc-item-time',
            text: moment(item.mtime).fromNow()
        });

        // Trailing remove tag button
        const removeBtn = row.createEl('button', {
            cls: 'pos-karon-moc-item-del-btn',
            attr: { 'aria-label': `Remove #${topic.tag} from ${item.title}`, title: 'Remove from topic' }
        });
        setIcon(removeBtn, 'x');
        removeBtn.onclick = async (e: MouseEvent) => {
            e.stopPropagation();
            removeBtn.disabled = true;
            try {
                await this.plugin.capture.removeTagFromNote(item.file, topic.tag);
                await this.plugin.refreshCoordinator.reindexFile(item.file, true);
                this.plugin.refreshCoordinator.notifyRefresh('all');
                this.renderMocPane();
                new Notice(`Removed #${topic.tag} from "${item.title}"`);
            } catch (err) {
                console.error('[DIWA Karon] Failed to remove tag', err);
                new Notice('Failed to remove tag from note');
            } finally {
                removeBtn.disabled = false;
            }
        };
    }

    private openAddExistingNoteToTopicPicker(topic: KaronMocTopic): void {
        new FileSuggestModal(
            this.app,
            async (file) => {
                try {
                    await this.plugin.capture.addTagToNote(file, topic.tag);
                    await this.plugin.refreshCoordinator.reindexFile(file, true);
                    this.plugin.refreshCoordinator.notifyRefresh('all');
                    this.renderMocPane();
                    new Notice(`Added #${topic.tag} to "${file.basename}"`);
                } catch (err) {
                    console.error('[DIWA Karon] Failed to tag note', err);
                    new Notice('Failed to tag note');
                }
            },
            this.plugin.settings.newNoteFolder || '000 Bin'
        ).open();
    }

    private promptCreateNewNoteInTopic(topic: KaronMocTopic): void {
        const titlePrompt = window.prompt(`Create new note in #${topic.tag}:`, '');
        if (!titlePrompt || !titlePrompt.trim()) return;
        const cleanName = titlePrompt.trim();
        const folder = this.plugin.settings.newNoteFolder?.trim() || '000 Bin';

        void (async () => {
            try {
                const initialContent = `---\ntags:\n  - ${topic.tag}\n---\n\n# ${cleanName}\n\n`;
                const newFile = await createVaultFile(this.app, folder, `${cleanName}.md`, initialContent);
                await this.plugin.refreshCoordinator.reindexFile(newFile, true);
                this.plugin.refreshCoordinator.notifyRefresh('all');
                this.renderMocPane();
                new Notice(`Created "${cleanName}" in #${topic.tag}`);
                this.openWikilinkModal(cleanName, newFile.path);
            } catch (err) {
                console.error('[DIWA Karon] Failed to create note in topic', err);
                new Notice('Failed to create note');
            }
        })();
    }

    private openCreateMocTopicModal(): void {
        const topics = this.getMocTopics();
        new CreateMocTopicModal(
            this.app,
            topics,
            async (newTopic: KaronMocTopic) => {
                if (!this.plugin.settings.karonMocTopics) {
                    this.plugin.settings.karonMocTopics = [];
                }
                this.plugin.settings.karonMocTopics.push(newTopic);
                await this.plugin.saveSettings();

                this._selectedMocTopicId = newTopic.id;
                window.localStorage?.setItem('diwa-karon-moc-topic', newTopic.id);
                this.renderMocPane();
                new Notice(`Created topic "${newTopic.label}" (#${newTopic.tag})`);
            }
        ).open();
    }

    private openScheduleExistingNotePicker(targetDate: string): void {
        new FileSuggestModal(
            this.app,
            (file) => {
                void this.scheduleExistingNoteForDate(file, targetDate);
            },
            this.plugin.settings.newNoteFolder || '000 Bin'
        ).open();
    }

    private async scheduleExistingNoteForDate(file: TFile, targetDate: string): Promise<void> {
        try {
            await this.app.fileManager.processFrontMatter(file, (fm) => {
                fm.scheduled = targetDate;
            });
            await this.waitForFrontmatterScheduled(file, targetDate);
            if (this.plugin.index.isCaptureFile(file.path)) {
                await this.plugin.index.indexCaptureFile(file);
            } else {
                await this.plugin.refreshCoordinator.reindexFile(file, true);
            }
            this.plugin.refreshCoordinator.notifyRefresh('all');
            void this.renderStage();
            new Notice(`Scheduled "${file.basename}" for ${this.formatTargetChipLabel(targetDate)}`);
        } catch (err) {
            console.error('[DIWA Karon] Failed to schedule note', err);
            new Notice('Failed to schedule note');
        }
    }

    private waitForFrontmatterScheduled(file: TFile, targetDate: string): Promise<void> {
        const current = this.app.metadataCache.getFileCache(file)?.frontmatter?.scheduled;
        if (String(current ?? '').replace(/\[\[|\]\]/g, '').trim() === targetDate) {
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            let settled = false;
            const finish = () => {
                if (settled) return;
                settled = true;
                this.app.metadataCache.offref(ref);
                clearTimeout(timer);
                resolve();
            };
            const ref = this.app.metadataCache.on('changed', (changedFile) => {
                if (changedFile.path === file.path) {
                    finish();
                }
            });
            const timer = setTimeout(finish, 300);
        });
    }

    private focusQuickAddForDate(dateStr: string): void {
        this._quickTaskTargetDate = dateStr;
        if (this._quickDateLabelEl) {
            this._quickDateLabelEl.setText(this.formatTargetChipLabel(dateStr));
        }
        if (this._quickInputEl) {
            this._quickInputEl.focus();
            this._quickInputEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }

    private async renderStage(): Promise<void> {
        if (!this._stageEl || !this._containerEl) return;
        const token = ++this._renderToken;
        const prevScrollTop = this._containerEl.scrollTop;

        const today = moment();
        const todayStr = today.format('YYYY-MM-DD');

        // Preload async data before clearing DOM to prevent flicker and detect stale renders
        const overdueTasks = filterKaronTasks(this.plugin.index.getOverdueTasks(todayStr));
        const overdueBills = await this.plugin.index.getOverdueBills(todayStr);
        if (token !== this._renderToken) return;

        const numDays = this._horizon === 'today' ? 1 : this._horizon === '3d' ? 4 : 8;
        const dayPayloads: {
            dateStr: string;
            dayOffset: number;
            tasks: GawaTaskRecord[];
            bills: HorizonBillItem[];
            notes: HorizonNoteBlock[];
        }[] = [];

        for (let i = 0; i < numDays; i++) {
            const dateStr = moment(todayStr).add(i, 'days').format('YYYY-MM-DD');
            const tasks = filterKaronTasks(this.plugin.index.getTasksForDueDate(dateStr));
            const bills = await this.plugin.index.getBillsForDueDate(dateStr);
            const notes = await this.plugin.index.getVaultNoteBlocksForDate(dateStr);
            if (token !== this._renderToken) return;
            dayPayloads.push({ dateStr, dayOffset: i, tasks, bills, notes });
        }

        const undatedTasks = filterKaronTasks(this.plugin.index.getGawaTasks(true)).filter(t => !t.dueDate);

        // Rebuild stage DOM synchronously once all awaits succeeded
        this.unloadRenderComponent();
        const comp = new Component();
        comp.load();
        this._renderComponent = comp;

        this._stageEl.empty();

        if (overdueTasks.length + overdueBills.length > 0) {
            this.renderOverdueSection(this._stageEl, overdueTasks, overdueBills, todayStr, comp);
        }

        for (const payload of dayPayloads) {
            this.renderDaySection(this._stageEl, payload, comp);
        }

        if (undatedTasks.length > 0) {
            this.renderUndatedSection(this._stageEl, undatedTasks, comp);
        }

        this._containerEl.scrollTop = prevScrollTop;
    }

    private toggleSectionCollapse(key: string): void {
        if (this._collapsedSections.has(key)) {
            this._collapsedSections.delete(key);
        } else {
            this._collapsedSections.add(key);
        }
        void this.renderStage();
    }

    private renderOverdueSection(
        container: HTMLElement,
        overdueTasks: GawaTaskRecord[],
        overdueBills: HorizonBillItem[],
        todayStr: string,
        comp: Component
    ): void {
        const isCollapsed = this._collapsedSections.has('overdue');
        const sectionEl = container.createDiv({ cls: 'pos-karon-day-section pos-karon-overdue-section' });

        const headerEl = sectionEl.createDiv({ cls: 'pos-karon-section-header' });
        headerEl.onclick = () => this.toggleSectionCollapse('overdue');

        const leftWrap = headerEl.createDiv({ cls: 'pos-karon-sec-header-left' });
        const toggleIcon = leftWrap.createSpan({ cls: 'pos-karon-collapse-icon' });
        setIcon(toggleIcon, isCollapsed ? 'chevron-right' : 'chevron-down');

        const alertIcon = leftWrap.createSpan({ cls: 'pos-karon-overdue-icon' });
        setIcon(alertIcon, 'alert-circle');

        const totalOverdue = overdueTasks.length + overdueBills.length;
        let titleText = `${totalOverdue} Overdue Items`;
        if (overdueTasks.length > 0 && overdueBills.length === 0) {
            titleText = `${overdueTasks.length} Overdue Task${overdueTasks.length === 1 ? '' : 's'}`;
        } else if (overdueBills.length > 0 && overdueTasks.length === 0) {
            titleText = `${overdueBills.length} Overdue Bill${overdueBills.length === 1 ? '' : 's'}`;
        }

        const titleSpan = leftWrap.createSpan({ cls: 'pos-karon-sec-title pos-karon-overdue-title' });
        titleSpan.setText(titleText);

        const badgeWrap = headerEl.createDiv({ cls: 'pos-karon-sec-badges' });

        if (overdueTasks.length > 0) {
            const moveAllBtn = badgeWrap.createEl('button', {
                cls: 'pos-karon-move-today-btn',
                text: 'Move All to Today',
                attr: { 'aria-label': 'Reschedule all overdue tasks to today' }
            });
            moveAllBtn.onclick = async (e) => {
                e.stopPropagation();
                moveAllBtn.disabled = true;
                try {
                    await this.moveOverdueTasksToDate(overdueTasks, todayStr);
                } finally {
                    moveAllBtn.disabled = false;
                }
            };
        }

        badgeWrap.createSpan({ cls: 'pos-karon-pill pos-karon-pill-danger', text: `${totalOverdue} Overdue` });

        if (!isCollapsed) {
            const contentEl = sectionEl.createDiv({ cls: 'pos-karon-section-content' });
            if (overdueTasks.length > 0) {
                const taskListEl = contentEl.createDiv({ cls: 'pos-karon-task-list' });
                for (const task of overdueTasks) {
                    this.renderTaskRow(taskListEl, task, true, comp);
                }
            }
            if (overdueBills.length > 0) {
                const billListEl = contentEl.createDiv({ cls: 'pos-karon-bill-list' });
                for (const bill of overdueBills) {
                    this.renderBillRow(billListEl, bill, true);
                }
            }
        }
    }

    private async moveOverdueTasksToDate(tasks: GawaTaskRecord[], targetDateStr: string): Promise<void> {
        const modifiedPaths = new Set<string>();
        let movedCount = 0;

        for (const task of tasks) {
            try {
                await this.plugin.capture.updateTaskDetailsInFile({
                    filePath: task.filePath,
                    lineIndex: task.lineIndex,
                    taskTitleFallback: task.rawTitle,
                    newDueDate: targetDateStr
                });
                modifiedPaths.add(task.filePath);
                movedCount++;
            } catch (err) {
                console.error(`[DIWA Karon] Failed to reschedule task in ${task.filePath}`, err);
            }
        }

        for (const path of modifiedPaths) {
            const file = this.app.vault.getAbstractFileByPath(path);
            if (file instanceof TFile) {
                await this.plugin.refreshCoordinator.reindexFile(file, true);
            }
        }

        this.plugin.refreshCoordinator.notifyRefresh('tasks');
        new Notice(`Moved ${movedCount} overdue task${movedCount === 1 ? '' : 's'} to Today`);
    }

    private renderDaySection(
        container: HTMLElement,
        payload: {
            dateStr: string;
            dayOffset: number;
            tasks: GawaTaskRecord[];
            bills: HorizonBillItem[];
            notes: HorizonNoteBlock[];
        },
        comp: Component
    ): void {
        const { dateStr, dayOffset, tasks, bills, notes } = payload;
        const isCollapsed = this._collapsedSections.has(dateStr);
        const sectionEl = container.createDiv({
            cls: `pos-karon-day-section ${dayOffset === 0 ? 'is-today' : ''}`
        });

        const totalItems = tasks.length + bills.length + notes.length;

        const headerEl = sectionEl.createDiv({ cls: 'pos-karon-section-header' });
        headerEl.onclick = () => this.toggleSectionCollapse(dateStr);

        const leftWrap = headerEl.createDiv({ cls: 'pos-karon-sec-header-left' });
        const toggleIcon = leftWrap.createSpan({ cls: 'pos-karon-collapse-icon' });
        setIcon(toggleIcon, isCollapsed ? 'chevron-right' : 'chevron-down');

        const titleSpan = leftWrap.createSpan({ cls: 'pos-karon-sec-title' });
        titleSpan.setText(getKaronDayTitle(dayOffset, dateStr));

        const badgesWrap = headerEl.createDiv({ cls: 'pos-karon-sec-badges' });

        const addDayTaskBtn = badgesWrap.createEl('button', {
            cls: 'pos-karon-day-add-btn',
            attr: { 'aria-label': `Add task for ${dateStr}`, title: `Add task for ${dateStr}` }
        });
        setIcon(addDayTaskBtn, 'plus');
        addDayTaskBtn.onclick = (e) => {
            e.stopPropagation();
            this.focusQuickAddForDate(dateStr);
        };

        const relLabel = dayOffset === 0 ? 'Today' : `D+${dayOffset}`;
        badgesWrap.createSpan({ cls: `pos-karon-pill ${dayOffset === 0 ? 'pos-karon-pill-today' : ''}`, text: relLabel });

        if (tasks.length > 0) {
            this.createCountPill(badgesWrap, 'check-square', `${tasks.length}`);
        }
        if (bills.length > 0) {
            this.createCountPill(badgesWrap, 'receipt', `${bills.length}`);
        }
        if (notes.length > 0) {
            this.createCountPill(badgesWrap, 'file-text', `${notes.length}`);
        }
        if (totalItems === 0) {
            badgesWrap.createSpan({ cls: 'pos-karon-pill pos-karon-pill-muted', text: 'Clear' });
        }

        if (isCollapsed) return;

        const contentEl = sectionEl.createDiv({ cls: 'pos-karon-section-content' });

        if (totalItems === 0) {
            const emptyEl = contentEl.createDiv({ cls: 'pos-karon-empty-day' });
            emptyEl.setText('No tasks, bills, or notes scheduled for this day.');
            return;
        }

        if (tasks.length > 0) {
            this.renderSubsectionHeader(contentEl, 'check-square', `Tasks Due (${tasks.length})`);
            const taskListEl = contentEl.createDiv({ cls: 'pos-karon-task-list' });
            for (const task of tasks) {
                this.renderTaskRow(taskListEl, task, false, comp);
            }
        }

        if (bills.length > 0) {
            this.renderSubsectionHeader(contentEl, 'receipt', `Bills Due (${bills.length})`);
            const billListEl = contentEl.createDiv({ cls: 'pos-karon-bill-list' });
            for (const bill of bills) {
                this.renderBillRow(billListEl, bill, false);
            }
        }

        if (notes.length > 0) {
            this.renderSubsectionHeader(
                contentEl,
                'file-text',
                formatKaronNotesHeading(dayOffset, dateStr, notes.length)
            );
            const noteListEl = contentEl.createDiv({ cls: 'pos-karon-note-list' });
            for (const note of notes) {
                this.renderNoteCard(noteListEl, note, comp);
            }
        }
    }

    private renderUndatedSection(container: HTMLElement, undatedTasks: GawaTaskRecord[], comp: Component): void {
        const sectionEl = container.createDiv({ cls: 'pos-karon-day-section pos-karon-undated-section' });

        const headerEl = sectionEl.createDiv({
            cls: 'pos-karon-section-header',
            attr: {
                role: 'button',
                tabindex: '0',
                'aria-expanded': String(this._undatedExpanded)
            }
        });
        const toggleUndated = () => {
            this._undatedExpanded = !this._undatedExpanded;
            void this.renderStage();
        };
        headerEl.onclick = toggleUndated;
        headerEl.onkeydown = (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleUndated();
            }
        };

        const leftWrap = headerEl.createDiv({ cls: 'pos-karon-sec-header-left' });
        const toggleIcon = leftWrap.createSpan({ cls: 'pos-karon-collapse-icon' });
        setIcon(toggleIcon, this._undatedExpanded ? 'chevron-down' : 'chevron-right');

        const titleSpan = leftWrap.createSpan({ cls: 'pos-karon-sec-title' });
        titleSpan.setText('Undated Tasks');

        const badgeWrap = headerEl.createDiv({ cls: 'pos-karon-sec-badges' });
        this.createCountPill(badgeWrap, 'check-square', `${undatedTasks.length}`);

        if (!this._undatedExpanded) return;

        const contentEl = sectionEl.createDiv({ cls: 'pos-karon-section-content' });
        const taskListEl = contentEl.createDiv({ cls: 'pos-karon-task-list' });
        for (const task of undatedTasks) {
            this.renderTaskRow(taskListEl, task, false, comp);
        }
    }

    private createCountPill(container: HTMLElement, iconName: string, text: string): void {
        const pill = container.createSpan({ cls: 'pos-karon-pill pos-karon-pill-icon' });
        const ic = pill.createSpan({ cls: 'pos-btn-icon' });
        setIcon(ic, iconName);
        pill.createSpan({ text });
    }

    private renderSubsectionHeader(container: HTMLElement, iconName: string, title: string): void {
        const header = container.createDiv({ cls: 'pos-karon-subsection-header' });
        const icon = header.createSpan({ cls: 'pos-karon-sub-icon' });
        setIcon(icon, iconName);
        header.createSpan({ text: title, cls: 'pos-karon-sub-title' });
    }

    private renderTaskRow(
        container: HTMLElement,
        task: GawaTaskRecord,
        isOverdue: boolean,
        comp: Component
    ): void {
        const taskKey = this.getTaskKey(task);
        const isMobile = this.isMobilePhone();
        const rowEl = container.createDiv({
            cls: `pos-karon-task-row ${task.completed ? 'is-completed' : ''} ${isOverdue ? 'is-overdue' : ''}`
        });

        const mainRow = rowEl.createDiv({ cls: 'pos-karon-task-main' });

        // Checkbox
        const checkEl = mainRow.createEl('input', {
            type: 'checkbox',
            cls: 'pos-karon-checkbox task-list-item-checkbox'
        });
        checkEl.checked = task.completed;
        checkEl.onclick = async (e) => {
            e.stopPropagation();
            const newStatus = !task.completed;
            try {
                await this.plugin.capture.toggleTaskInFile(
                    task.filePath,
                    task.lineIndex,
                    newStatus,
                    task.rawTitle,
                    task.shadowedLocations
                );
                task.completed = newStatus;
                rowEl.toggleClass('is-completed', newStatus);
                await this.reindexAndNotify(task.filePath);
            } catch (err) {
                console.error('[DIWA Karon] Failed to toggle task', err);
                checkEl.checked = !newStatus;
                new Notice('Failed to toggle task');
            }
        };

        // Task Body & Rich Markdown Title
        const bodyEl = mainRow.createDiv({ cls: 'pos-karon-task-body' });
        const titleEl = bodyEl.createDiv({ cls: 'pos-karon-task-title markdown-rendered' });
        const taskText = (task.cleanTitle || task.rawTitle || '').trim();
        void MarkdownRenderer.render(
            this.app,
            taskText,
            titleEl,
            task.filePath,
            comp
        ).then(() => {
            this.attachWikilinkHandlers(titleEl, task.filePath);
        });

        if (isMobile) {
            titleEl.onclick = (e) => {
                const target = e.target as HTMLElement;
                if (target.closest('a.internal-link')) return;
                e.stopPropagation();
                new MobileTaskEditModal(this.app, this.plugin, task).open();
            };
        }

        // Source file peek button
        const sourceBtn = mainRow.createEl('button', {
            cls: 'pos-karon-source-btn',
            attr: { 'aria-label': `Open ${task.noteTitle}` }
        });
        setIcon(sourceBtn, 'arrow-up-right');
        sourceBtn.onclick = (e) => {
            e.stopPropagation();
            this.openWikilinkModal(task.noteTitle, task.filePath);
        };

        // Meta Pills Row
        const metaRow = bodyEl.createDiv({ cls: 'pos-karon-task-meta' });
        const todayStr = moment().format('YYYY-MM-DD');

        // 1. Interactive Due Date Pill
        const datePillCls = isOverdue ? 'is-overdue' : (task.dueDate === todayStr ? 'is-today' : '');
        const datePill = metaRow.createSpan({
            cls: `pos-karon-meta-badge pos-karon-interactive-pill ${datePillCls}`,
            attr: { 'aria-label': 'Change due date' }
        });
        const calIcon = datePill.createSpan({ cls: 'pos-btn-icon' });
        setIcon(calIcon, 'calendar');
        datePill.createSpan({ text: task.dueDate ? ` Due: ${task.dueDate} ▾` : ' Set Due ▾' });
        datePill.onclick = (e) => {
            e.stopPropagation();
            if (isMobile) {
                new MobileTaskEditModal(this.app, this.plugin, task).open();
                return;
            }
            this.openTaskDueDateMenu(e, task);
        };

        // 2. Overdue Relative Badge
        if (isOverdue && task.dueDateRelative) {
            const relBadge = metaRow.createSpan({ cls: 'pos-karon-meta-badge pos-karon-due-overdue' });
            relBadge.setText(task.dueDateRelative);
        }

        // 3. Life Area Badge
        if (task.areaLabel && task.areaLabel !== '—') {
            const areaBadge = metaRow.createSpan({ cls: 'pos-karon-meta-badge pos-karon-area-badge' });
            areaBadge.setText(`${task.areaIcon !== '—' ? task.areaIcon + ' ' : ''}${task.areaLabel}`);
        }

        // 4. Interactive Subtasks Pill / Add Button
        const hasSubtasks = Array.isArray(task.subtasks) && task.subtasks.length > 0;
        const isSubtasksPinned = this._pinnedSubtasks.has(taskKey);
        const isSubtasksInputOpen = this._expandedSubtaskInputs.has(taskKey);

        if (hasSubtasks) {
            const doneSub = task.subtasks.filter(s => s.completed).length;
            const subPill = metaRow.createSpan({
                cls: `pos-karon-meta-badge pos-karon-interactive-pill ${isSubtasksPinned ? 'is-active' : ''}`,
                attr: { 'aria-label': 'Toggle subtasks drawer' }
            });
            const subIcon = subPill.createSpan({ cls: 'pos-btn-icon' });
            setIcon(subIcon, 'check-square');
            subPill.createSpan({ text: ` ${doneSub}/${task.subtasks.length}` });
            subPill.onclick = (e) => {
                e.stopPropagation();
                if (isMobile) {
                    new MobileTaskEditModal(this.app, this.plugin, task).open();
                    return;
                }
                if (isSubtasksPinned) {
                    this._pinnedSubtasks.delete(taskKey);
                    this._expandedSubtaskInputs.delete(taskKey);
                } else {
                    this._pinnedSubtasks.add(taskKey);
                }
                void this.renderStage();
            };
        } else {
            const addSubBtn = metaRow.createSpan({
                cls: 'pos-karon-meta-badge pos-karon-interactive-pill pos-karon-action-pill',
                attr: { 'aria-label': 'Add subtask' }
            });
            const subIcon = addSubBtn.createSpan({ cls: 'pos-btn-icon' });
            setIcon(subIcon, 'plus');
            addSubBtn.createSpan({ text: ' Subtask' });
            addSubBtn.onclick = (e) => {
                e.stopPropagation();
                if (isMobile) {
                    new MobileTaskEditModal(this.app, this.plugin, task).open();
                    return;
                }
                this._pinnedSubtasks.add(taskKey);
                this._expandedSubtaskInputs.add(taskKey);
                void this.renderStage();
            };
        }

        // 5. Interactive Remarks Pill / Add Button
        const hasRemarks = Array.isArray(task.remarks) && task.remarks.length > 0;
        const isRemarksPinned = this._pinnedRemarks.has(taskKey);
        const isRemarkInputOpen = this._expandedRemarkInputs.has(taskKey);

        if (hasRemarks) {
            const remPill = metaRow.createSpan({
                cls: `pos-karon-meta-badge pos-karon-interactive-pill ${isRemarksPinned ? 'is-active' : ''}`,
                attr: { 'aria-label': `${task.remarks.length} note(s)` }
            });
            const remIcon = remPill.createSpan({ cls: 'pos-btn-icon' });
            setIcon(remIcon, 'message-square');
            remPill.createSpan({ text: ` ${task.remarks.length}` });
            remPill.onclick = (e) => {
                e.stopPropagation();
                if (isMobile) {
                    new MobileTaskEditModal(this.app, this.plugin, task).open();
                    return;
                }
                if (isRemarksPinned) {
                    this._pinnedRemarks.delete(taskKey);
                    this._expandedRemarkInputs.delete(taskKey);
                } else {
                    this._pinnedRemarks.add(taskKey);
                }
                void this.renderStage();
            };
        } else {
            const addRemBtn = metaRow.createSpan({
                cls: 'pos-karon-meta-badge pos-karon-interactive-pill pos-karon-action-pill',
                attr: { 'aria-label': 'Add note or remark' }
            });
            const remIcon = addRemBtn.createSpan({ cls: 'pos-btn-icon' });
            setIcon(remIcon, 'plus');
            addRemBtn.createSpan({ text: ' Note' });
            addRemBtn.onclick = (e) => {
                e.stopPropagation();
                if (isMobile) {
                    new MobileTaskEditModal(this.app, this.plugin, task).open();
                    return;
                }
                this._pinnedRemarks.add(taskKey);
                this._expandedRemarkInputs.add(taskKey);
                void this.renderStage();
            };
        }

        // Inline Drawers (Desktop & Tablet)
        if (!isMobile && (isSubtasksPinned || isSubtasksInputOpen)) {
            this.renderSubtasksDrawer(bodyEl, task, taskKey, comp);
        }
        if (!isMobile && (isRemarksPinned || isRemarkInputOpen)) {
            this.renderRemarksDrawer(bodyEl, task, taskKey, comp);
        }
    }

    private renderSubtasksDrawer(
        parent: HTMLElement,
        task: GawaTaskRecord,
        taskKey: string,
        comp: Component
    ): void {
        const drawer = parent.createDiv({ cls: 'pos-karon-drawer' });
        const header = drawer.createDiv({ cls: 'pos-karon-drawer-header' });
        const subtasks = task.subtasks || [];
        const doneCount = subtasks.filter(s => s.completed).length;

        header.createSpan({
            cls: 'pos-karon-drawer-title',
            text: subtasks.length > 0 ? `Subtasks (${doneCount}/${subtasks.length})` : 'Subtasks'
        });

        const headerActions = header.createDiv({ cls: 'pos-karon-drawer-actions' });
        if (!this._expandedSubtaskInputs.has(taskKey)) {
            const addToggleBtn = headerActions.createEl('button', {
                cls: 'pos-karon-drawer-btn',
                text: '+ Add'
            });
            addToggleBtn.onclick = (e) => {
                e.stopPropagation();
                this._expandedSubtaskInputs.add(taskKey);
                void this.renderStage();
            };
        }

        const closeBtn = headerActions.createEl('button', {
            cls: 'pos-karon-drawer-btn',
            attr: { 'aria-label': 'Hide subtasks' }
        });
        setIcon(closeBtn, 'x');
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            this._pinnedSubtasks.delete(taskKey);
            this._expandedSubtaskInputs.delete(taskKey);
            void this.renderStage();
        };

        subtasks.forEach((st, idx) => {
            const item = drawer.createDiv({ cls: `pos-karon-subtask-item ${st.completed ? 'is-completed' : ''}` });
            const stCheck = item.createEl('input', { type: 'checkbox', cls: 'pos-karon-subtask-checkbox' });
            stCheck.checked = Boolean(st.completed);
            stCheck.onclick = async (e) => {
                e.stopPropagation();
                const updated = subtasks.map((s, i) => (i === idx ? { ...s, completed: stCheck.checked } : s));
                await this.updateTaskDetails(task, { newSubtasks: updated }, 'Failed to update subtask');
            };

            const stTitle = item.createSpan({ cls: 'pos-karon-subtask-title markdown-rendered' });
            void MarkdownRenderer.render(this.app, st.title, stTitle, task.filePath, comp).then(() => {
                this.attachWikilinkHandlers(stTitle, task.filePath);
            });

            const delBtn = item.createEl('button', {
                cls: 'pos-karon-drawer-del-btn',
                attr: { 'aria-label': 'Delete subtask' }
            });
            setIcon(delBtn, 'x');
            delBtn.onclick = async (e) => {
                e.stopPropagation();
                const updated = subtasks.filter((_, i) => i !== idx);
                await this.updateTaskDetails(task, { newSubtasks: updated }, 'Failed to remove subtask');
            };
        });

        if (this._expandedSubtaskInputs.has(taskKey)) {
            this.renderDrawerQuickInput(
                drawer,
                '+ Add subtask...',
                async (val) => {
                    const updated = [...subtasks, { title: val, completed: false }];
                    await this.updateTaskDetails(task, { newSubtasks: updated }, 'Failed to add subtask');
                },
                () => {
                    this._expandedSubtaskInputs.delete(taskKey);
                    if (subtasks.length === 0) this._pinnedSubtasks.delete(taskKey);
                    void this.renderStage();
                }
            );
        }
    }

    private renderRemarksDrawer(
        parent: HTMLElement,
        task: GawaTaskRecord,
        taskKey: string,
        comp: Component
    ): void {
        const drawer = parent.createDiv({ cls: 'pos-karon-drawer' });
        const header = drawer.createDiv({ cls: 'pos-karon-drawer-header' });
        const remarks = task.remarks || [];

        header.createSpan({
            cls: 'pos-karon-drawer-title',
            text: remarks.length > 0 ? `Notes (${remarks.length})` : 'Notes'
        });

        const headerActions = header.createDiv({ cls: 'pos-karon-drawer-actions' });
        if (!this._expandedRemarkInputs.has(taskKey)) {
            const addToggleBtn = headerActions.createEl('button', {
                cls: 'pos-karon-drawer-btn',
                text: '+ Add'
            });
            addToggleBtn.onclick = (e) => {
                e.stopPropagation();
                this._expandedRemarkInputs.add(taskKey);
                void this.renderStage();
            };
        }

        const closeBtn = headerActions.createEl('button', {
            cls: 'pos-karon-drawer-btn',
            attr: { 'aria-label': 'Hide notes' }
        });
        setIcon(closeBtn, 'x');
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            this._pinnedRemarks.delete(taskKey);
            this._expandedRemarkInputs.delete(taskKey);
            void this.renderStage();
        };

        remarks.forEach((rem, idx) => {
            const item = drawer.createDiv({ cls: 'pos-karon-remark-item' });
            const remIcon = item.createSpan({ cls: 'pos-karon-remark-icon' });
            setIcon(remIcon, 'message-square');

            const remText = item.createDiv({ cls: 'pos-karon-remark-text markdown-rendered' });
            void MarkdownRenderer.render(this.app, rem, remText, task.filePath, comp).then(() => {
                this.attachWikilinkHandlers(remText, task.filePath);
            });

            const delBtn = item.createEl('button', {
                cls: 'pos-karon-drawer-del-btn',
                attr: { 'aria-label': 'Delete note' }
            });
            setIcon(delBtn, 'x');
            delBtn.onclick = async (e) => {
                e.stopPropagation();
                const updated = remarks.filter((_, i) => i !== idx);
                await this.updateTaskDetails(task, { newRemarks: updated }, 'Failed to remove note');
            };
        });

        if (this._expandedRemarkInputs.has(taskKey)) {
            this.renderDrawerQuickInput(
                drawer,
                '+ Add note or remark...',
                async (val) => {
                    const updated = [...remarks, val];
                    await this.updateTaskDetails(task, { newRemarks: updated }, 'Failed to add note');
                },
                () => {
                    this._expandedRemarkInputs.delete(taskKey);
                    if (remarks.length === 0) this._pinnedRemarks.delete(taskKey);
                    void this.renderStage();
                }
            );
        }
    }

    private renderDrawerQuickInput(
        drawer: HTMLElement,
        placeholder: string,
        onSave: (value: string) => Promise<void>,
        onCancel: () => void
    ): void {
        const row = drawer.createDiv({ cls: 'pos-karon-drawer-input-row' });
        const input = row.createEl('input', {
            type: 'text',
            cls: 'pos-karon-drawer-input',
            attr: { placeholder }
        });

        const cancelBtn = row.createEl('button', {
            cls: 'pos-karon-drawer-btn',
            attr: { 'aria-label': 'Cancel' }
        });
        setIcon(cancelBtn, 'x');
        cancelBtn.onclick = (e) => {
            e.stopPropagation();
            onCancel();
        };

        input.onkeydown = async (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const trimmed = input.value.trim();
                if (!trimmed) return;
                input.disabled = true;
                await onSave(trimmed);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                onCancel();
            }
        };

        setTimeout(() => input.focus(), 0);
    }

    private openQuickDateMenu(e: MouseEvent, onSelect: (dateStr: string) => void): void {
        const menu = new Menu();
        const todayStr = moment().format('YYYY-MM-DD');
        const tomorrowStr = moment().add(1, 'day').format('YYYY-MM-DD');
        const in3DaysStr = moment().add(3, 'days').format('YYYY-MM-DD');
        const nextWeekStr = moment().add(7, 'days').format('YYYY-MM-DD');

        menu.addItem(item => item.setTitle('Today').setIcon('sun').onClick(() => onSelect(todayStr)));
        menu.addItem(item => item.setTitle('Tomorrow').setIcon('sunrise').onClick(() => onSelect(tomorrowStr)));
        menu.addItem(item => item.setTitle('In 3 Days').setIcon('calendar').onClick(() => onSelect(in3DaysStr)));
        menu.addItem(item => item.setTitle('Next Week').setIcon('calendar-days').onClick(() => onSelect(nextWeekStr)));
        menu.addSeparator();
        menu.addItem(item => {
            item.setTitle('Pick Specific Date...')
                .setIcon('calendar-clock')
                .onClick(() => {
                    new DatePickerModal(this.app, this._quickTaskTargetDate, onSelect).open();
                });
        });
        menu.showAtMouseEvent(e);
    }

    private openTaskDueDateMenu(e: MouseEvent, task: GawaTaskRecord): void {
        const menu = new Menu();
        const todayStr = moment().format('YYYY-MM-DD');
        const tomorrowStr = moment().add(1, 'day').format('YYYY-MM-DD');
        const in3DaysStr = moment().add(3, 'days').format('YYYY-MM-DD');
        const nextWeekStr = moment().add(7, 'days').format('YYYY-MM-DD');

        const applyDueDate = (newDate: string | null) => {
            void this.updateTaskDetails(
                task,
                { newDueDate: newDate },
                'Failed to update due date',
                newDate ? `Due date set to ${newDate}` : 'Due date cleared'
            );
        };

        menu.addItem(item => {
            item.setTitle('Today')
                .setIcon('sun')
                .setChecked(task.dueDate === todayStr)
                .onClick(() => applyDueDate(todayStr));
        });
        menu.addItem(item => {
            item.setTitle('Tomorrow')
                .setIcon('sunrise')
                .setChecked(task.dueDate === tomorrowStr)
                .onClick(() => applyDueDate(tomorrowStr));
        });
        menu.addItem(item => {
            item.setTitle('In 3 Days')
                .setIcon('calendar')
                .setChecked(task.dueDate === in3DaysStr)
                .onClick(() => applyDueDate(in3DaysStr));
        });
        menu.addItem(item => {
            item.setTitle('Next Week')
                .setIcon('calendar-days')
                .setChecked(task.dueDate === nextWeekStr)
                .onClick(() => applyDueDate(nextWeekStr));
        });

        menu.addSeparator();
        menu.addItem(item => {
            item.setTitle('Pick Specific Date...')
                .setIcon('calendar-clock')
                .onClick(() => {
                    new DatePickerModal(
                        this.app,
                        task.dueDate || todayStr,
                        (selectedDate) => applyDueDate(selectedDate)
                    ).open();
                });
        });

        if (task.dueDate) {
            menu.addSeparator();
            menu.addItem(item => {
                item.setTitle('Clear Due Date')
                    .setIcon('x')
                    .onClick(() => applyDueDate(null));
            });
        }

        menu.showAtMouseEvent(e);
    }

    private async updateTaskDetails(
        task: GawaTaskRecord,
        patch: {
            newDueDate?: string | null;
            newSubtasks?: { title: string; completed: boolean }[];
            newRemarks?: string[];
        },
        errorNotice: string,
        successNotice?: string
    ): Promise<void> {
        try {
            await this.plugin.capture.updateTaskDetailsInFile({
                filePath: task.filePath,
                lineIndex: task.lineIndex,
                taskTitleFallback: task.rawTitle,
                ...patch
            });
            await this.reindexAndNotify(task.filePath);
            if (successNotice) new Notice(successNotice);
        } catch (err) {
            console.error('[DIWA Karon] Task update error', err);
            new Notice(errorNotice);
        }
    }

    private async reindexAndNotify(filePath: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFile) {
            await this.plugin.refreshCoordinator.reindexFile(file, true);
        }
        this.plugin.refreshCoordinator.notifyRefresh('tasks');
    }

    private renderBillRow(container: HTMLElement, bill: HorizonBillItem, isOverdue: boolean): void {
        const row = container.createDiv({
            cls: `pos-karon-bill-row ${isOverdue ? 'is-overdue' : ''}`
        });

        const iconEl = row.createDiv({ cls: 'pos-karon-bill-icon' });
        setIcon(iconEl, 'receipt');

        const content = row.createDiv({ cls: 'pos-karon-bill-content' });
        const titleEl = content.createDiv({ cls: 'pos-karon-bill-title', text: bill.noteTitle });
        titleEl.onclick = () => this.openWikilinkModal(bill.noteTitle, bill.filePath);

        const metaRow = content.createDiv({ cls: 'pos-karon-bill-meta' });
        const todayStr = moment().format('YYYY-MM-DD');
        const dateCls = isOverdue ? 'pos-karon-due-overdue' : (bill.dueDate === todayStr ? 'pos-karon-pill-today' : '');

        const datePill = metaRow.createSpan({ cls: `pos-karon-meta-badge ${dateCls}` });
        const calIcon = datePill.createSpan({ cls: 'pos-btn-icon' });
        setIcon(calIcon, 'calendar');
        datePill.createSpan({ text: ` Due: ${bill.dueDate}` });

        metaRow.createSpan({ cls: 'pos-karon-meta-badge', text: 'bill/pending' });

        if (bill.amount) {
            metaRow.createSpan({ cls: 'pos-karon-meta-badge pos-karon-bill-amount', text: bill.amount });
        }
    }

    private renderNoteCard(container: HTMLElement, note: HorizonNoteBlock, comp: Component): void {
        const cardEl = container.createDiv({ cls: 'pos-karon-note-card' });

        const cardHeader = cardEl.createDiv({ cls: 'pos-karon-card-header' });
        const titleArea = cardHeader.createDiv({ cls: 'pos-karon-card-title-wrap' });
        const titleEl = titleArea.createEl('span', { text: note.noteTitle, cls: 'pos-karon-card-title' });
        titleEl.onclick = () => this.openWikilinkModal(note.noteTitle, note.filePath);

        const cardMeta = cardHeader.createDiv({ cls: 'pos-karon-card-meta' });
        if (note.area) {
            const matchedArea = this.plugin.settings.lifeAreas.find(
                a => a.id.toLowerCase() === note.area!.toLowerCase()
            );
            const areaBadge = cardMeta.createSpan({ cls: 'pos-karon-meta-badge pos-karon-area-badge' });
            areaBadge.setText(`${matchedArea?.icon ? matchedArea.icon + ' ' : ''}${matchedArea?.label || note.area}`);
        }

        const openBtn = cardMeta.createEl('button', {
            cls: 'pos-karon-card-action',
            attr: { 'aria-label': 'Open in split' }
        });
        setIcon(openBtn, 'external-link');
        openBtn.onclick = async () => {
            const file = this.app.vault.getAbstractFileByPath(note.filePath);
            if (file instanceof TFile) {
                const leaf = this.app.workspace.getLeaf('split', 'vertical');
                await leaf.openFile(file);
            }
        };

        const snippetText = (note.snippet || note.noteTitle || '').trim();
        if (snippetText) {
            const cardBody = cardEl.createDiv({ cls: 'pos-karon-card-body' });
            const snippetEl = cardBody.createDiv({ cls: 'pos-karon-snippet markdown-rendered' });
            void MarkdownRenderer.render(
                this.app,
                snippetText,
                snippetEl,
                note.filePath,
                comp
            ).then(() => {
                this.attachWikilinkHandlers(snippetEl, note.filePath);
            });
        }
    }

    private openWikilinkModal(target: string, sourcePath: string): void {
        new WikilinkPeekModal(
            this.app,
            this.plugin,
            target,
            sourcePath,
            (filterTarget) => {
                void this.plugin.filterWorkspaceStreamByWikilink(filterTarget);
            }
        ).open();
    }

    private attachWikilinkHandlers(container: HTMLElement, sourcePath: string): void {
        const links = container.querySelectorAll<HTMLAnchorElement>('a.internal-link');
        links.forEach(link => {
            const target = link.getAttribute('data-href') || link.innerText;
            if (!target) return;
            link.onclick = (e: MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.metaKey || e.ctrlKey) {
                    void this.app.workspace.openLinkText(target, sourcePath, 'tab');
                    return;
                }
                if (e.altKey) {
                    void openWikilinkInPeekWindow(this.app, target, sourcePath);
                    return;
                }
                this.openWikilinkModal(target, sourcePath);
            };
        });
    }
}
