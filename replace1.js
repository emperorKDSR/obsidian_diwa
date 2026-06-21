const fs = require('fs');
let code = fs.readFileSync('src/tabs/GawaTab.ts', 'utf8');

// 1. Add imports
code = code.replace(
    import { Notice, Platform, TFile, moment, setIcon } from 'obsidian';,
    import { Notice, Platform, TFile, moment, setIcon } from 'obsidian';\nimport { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view';\nimport { EditorState } from '@codemirror/state';\nimport { defaultKeymap } from '@codemirror/commands';\nimport { markdown } from '@codemirror/lang-markdown';
);

// 2. Add _captureEditors
code = code.replace(
        private _showDoneInTable = false;,
        private _showDoneInTable = false;\n    private _captureEditors: EditorView[] = [];
);

// 3. Destroy editors
code = code.replace(
            this._mobileTabButtons.clear();\n        this._layoutMode = layoutMode;,
            this._mobileTabButtons.clear();\n        this._captureEditors.forEach(ed => ed.destroy());\n        this._captureEditors = [];\n        this._layoutMode = layoutMode;
);
code = code.replace(
            this._mobileTabButtons.clear();\n        this._taskIndexRecoveryInFlight = false;,
            this._mobileTabButtons.clear();\n        this._captureEditors.forEach(ed => ed.destroy());\n        this._captureEditors = [];\n        this._taskIndexRecoveryInFlight = false;
);

// 4. Add createEditorCapture and replace renderFastCapture
const renderFastCaptureOriginal = \    private renderFastCapture(parent: HTMLElement): void {
        const capture = parent.createEl('div', { cls: 'diwa-gawa-capture' });
        const icon = capture.createEl('span', { cls: 'diwa-gawa-capture-icon' });
        setIcon(icon, 'plus');
        const input = capture.createEl('input', {
            cls: 'diwa-gawa-capture-input',
            attr: {
                type: 'text',
                placeholder: 'Quick add to inbox…',
                'aria-label': 'Fast capture task',
            },
        }) as HTMLInputElement;

        const quickCreate = async () => {
            const title = input.value.trim();
            if (!title) return;
            input.disabled = true;
            try {
                this.plugin.refreshCoordinator.suppressNotifyRefresh(600);
                const created = await this.vault.createTaskFile(title, []);
                if (created instanceof TFile) {
                    await this.plugin.refreshCoordinator.reindexFile(created);
                    const indexedTask = this.plugin.index.taskIndex.get(created.path);
                    if (indexedTask) {
                        this._taskController.addTask(indexedTask);
                    } else {
                        this._taskController.syncFromIndex();
                    }
                } else {
                    this._taskController.syncFromIndex();
                }
                input.value = '';
                this.updateWorkspaceStats();
            } catch (error) {
                console.error('[DIWA GAWA] Failed fast capture task', error);
            } finally {
                input.disabled = false;
                input.focus();
            }
        };

        input.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            if (event.metaKey || event.ctrlKey) {
                this.openCreateTaskModal(input.value.trim());
                return;
            }
            void quickCreate();
        });
    }\;

const renderFastCaptureNew = \    private createEditorCapture(
        container: HTMLElement,
        placeholderText: string,
        onSubmit: (text: string, editor: EditorView, container: HTMLElement) => Promise<void>,
        onModEnter: (text: string) => void
    ): EditorView {
        const editorContainer = container.createEl('div', { cls: 'diwa-gawa-capture-editor' });
        
        editorContainer.style.width = '100%';
        editorContainer.style.flex = '1';
        editorContainer.style.display = 'flex';
        editorContainer.style.alignItems = 'center';

        let editorView: EditorView;

        const customKeymap = keymap.of([
            {
                key: 'Enter',
                run: (view) => {
                    const text = view.state.doc.toString().trim();
                    if (!text) return false;
                    void onSubmit(text, view, editorContainer);
                    return true;
                },
                shift: () => false // Let default behavior add newline
            },
            {
                key: 'Mod-Enter',
                run: (view) => {
                    const text = view.state.doc.toString().trim();
                    onModEnter(text);
                    return true;
                }
            }
        ]);

        const startState = EditorState.create({
            doc: '',
            extensions: [
                markdown(),
                cmPlaceholder(placeholderText),
                customKeymap,
                keymap.of(defaultKeymap),
                EditorView.lineWrapping,
                EditorView.theme({
                    "&": { backgroundColor: "transparent", color: "var(--text-normal)", fontSize: "13px", fontWeight: "500" },
                    ".cm-content": { 
                        fontFamily: "var(--font-interface)",
                        padding: "8px 0"
                    },
                    "&.cm-focused": { outline: "none" }
                })
            ]
        });

        editorView = new EditorView({
            state: startState,
            parent: editorContainer
        });

        this._captureEditors.push(editorView);
        return editorView;
    }

    private renderFastCapture(parent: HTMLElement): void {
        const capture = parent.createEl('div', { cls: 'diwa-gawa-capture' });
        const icon = capture.createEl('span', { cls: 'diwa-gawa-capture-icon' });
        setIcon(icon, 'plus');

        const quickCreate = async (title: string, editorView: EditorView, container: HTMLElement) => {
            container.style.opacity = '0.5';
            try {
                this.plugin.refreshCoordinator.suppressNotifyRefresh(600);
                const created = await this.vault.createTaskFile(title, []);
                if (created instanceof TFile) {
                    await this.plugin.refreshCoordinator.reindexFile(created);
                    const indexedTask = this.plugin.index.taskIndex.get(created.path);
                    if (indexedTask) {
                        this._taskController.addTask(indexedTask);
                    } else {
                        this._taskController.syncFromIndex();
                    }
                } else {
                    this._taskController.syncFromIndex();
                }
                editorView.dispatch({
                    changes: { from: 0, to: editorView.state.doc.length, insert: '' }
                });
                this.updateWorkspaceStats();
            } catch (error) {
                console.error('[DIWA GAWA] Failed fast capture task', error);
            } finally {
                container.style.opacity = '1';
                editorView.focus();
            }
        };

        this.createEditorCapture(capture, 'Quick add to inbox…', quickCreate, (title) => {
            this.openCreateTaskModal(title);
        });
    }\;

code = code.replace(renderFastCaptureOriginal, renderFastCaptureNew);

fs.writeFileSync('src/tabs/GawaTab.ts', code);
