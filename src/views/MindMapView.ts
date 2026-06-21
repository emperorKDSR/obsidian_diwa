import { App, ItemView, WorkspaceLeaf, TFile, MarkdownRenderer, Modal, Setting, FuzzySuggestModal, Menu } from 'obsidian';
import { VIEW_TYPE_DIWA_MINDMAP } from '../constants';
import DiwaPlugin from '../main';

function getRectIntersection(x1: number, y1: number, w: number, h: number, x2: number, y2: number) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) return { x: x1, y: y1, side: 'horizontal' };

    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const halfW = w / 2;
    const halfH = h / 2;

    let crossX = 0;
    let crossY = 0;

    if (halfW * absDy > halfH * absDx) {
        crossY = dy > 0 ? halfH : -halfH;
        crossX = crossY * (dx / dy);
        return { x: x1 + crossX, y: y1 + crossY, side: 'vertical' };
    } else {
        crossX = dx > 0 ? halfW : -halfW;
        crossY = crossX * (dy / dx);
        return { x: x1 + crossX, y: y1 + crossY, side: 'horizontal' };
    }
}

class ThoughtCreationModal extends Modal {
    private content: string = '';
    private onSubmit: (title: string, content: string) => void;

    constructor(plugin: DiwaPlugin, initialContent: string = '', onSubmit: (title: string, content: string) => void) {
        super(plugin.app);
        this.content = initialContent;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        contentEl.style.padding = '0';
        contentEl.style.margin = '0';
        contentEl.style.height = '100%';
        contentEl.style.display = 'flex';

        const textarea = contentEl.createEl('textarea');
        textarea.style.width = '100%';
        textarea.style.height = '100%';
        textarea.style.minHeight = '300px';
        textarea.style.border = 'none';
        textarea.style.resize = 'none';
        textarea.style.padding = '20px';
        textarea.style.fontSize = '16px';
        textarea.style.backgroundColor = 'var(--background-primary)';
        textarea.style.color = 'var(--text-normal)';
        textarea.style.outline = 'none';
        textarea.placeholder = 'Type your thought... (Press Ctrl+Enter or Cmd+Enter to save)';
        textarea.value = this.content;

        textarea.addEventListener('input', (e) => {
            this.content = (e.target as HTMLTextAreaElement).value;
        });

        textarea.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                this.close();
                this.onSubmit('', this.content);
            }
        });
        
        setTimeout(() => textarea.focus(), 100);
    }

    onClose() {
        this.contentEl.empty();
    }
}

class ExistingThoughtModal extends FuzzySuggestModal<any> {
    private onChoose: (item: any) => void;
    private plugin: DiwaPlugin;

    constructor(plugin: DiwaPlugin, onChoose: (item: any) => void) {
        super(plugin.app);
        this.plugin = plugin;
        this.onChoose = onChoose;
        this.setPlaceholder("Search thoughts by content...");
    }

    getItems(): any[] {
        return this.plugin.getThoughtController().getAllThoughts();
    }

    getItemText(item: any): string {
        return item.content || item.title || item.filePath;
    }

    renderSuggestion(match: any, el: HTMLElement) {
        super.renderSuggestion(match, el);
        el.style.maxHeight = "100px";
        el.style.overflow = "hidden";
        el.style.textOverflow = "ellipsis";
        el.style.display = "-webkit-box";
        el.style.webkitLineClamp = "4";
        el.style.webkitBoxOrient = "vertical";
        el.style.whiteSpace = "pre-wrap";
    }

    onChooseItem(item: any, evt: MouseEvent | KeyboardEvent) {
        this.onChoose(item);
    }
}

export class MindMapView extends ItemView {
    private currentFilePath: string | null = null;
    public plugin: DiwaPlugin;
    private floatingNodes = new Set<string>();
    private hiddenNodes = new Set<string>();
    
    private currentZoom = 1.0;
    private panLeft = -2000;
    private panTop = -2000;
    private hasInitializedPan = false;

    constructor(leaf: WorkspaceLeaf, plugin: DiwaPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.app = plugin.app;
    }

    getViewType(): string {
        return VIEW_TYPE_DIWA_MINDMAP;
    }

    getDisplayText(): string {
        return this.currentFilePath ? `Mind Map: ${this.currentFilePath.split('/').pop()?.replace('.md', '')}` : "Mind Map";
    }

    getIcon(): string {
        return "map";
    }

    async onOpen() {}

    async onClose() {
        this.contentEl.empty();
    }

    private addFloatingNode(path: string) {
        if (!this.currentFilePath) return;
        this.floatingNodes.add(path);
        this.hiddenNodes.delete(path);
        if (!this.plugin.settings.mindMapFloatingNodes) this.plugin.settings.mindMapFloatingNodes = {};
        this.plugin.settings.mindMapFloatingNodes[this.currentFilePath] = Array.from(this.floatingNodes);
        this.plugin.saveSettings();
    }

    private removeFloatingNode(path: string) {
        if (!this.currentFilePath) return;
        this.floatingNodes.delete(path);
        this.hiddenNodes.add(path);
        if (!this.plugin.settings.mindMapFloatingNodes) this.plugin.settings.mindMapFloatingNodes = {};
        this.plugin.settings.mindMapFloatingNodes[this.currentFilePath] = Array.from(this.floatingNodes);
        this.plugin.saveSettings();
    }

    async setState(state: any, result: any) {
        if (state.file) {
            this.currentFilePath = state.file;
            if (!this.plugin.settings.mindMapFloatingNodes) this.plugin.settings.mindMapFloatingNodes = {};
            const savedFloating = this.plugin.settings.mindMapFloatingNodes[state.file] || [];
            this.floatingNodes = new Set(savedFloating);
            await this.renderMindMap();
        }
        await super.setState(state, result);
    }

    getState() {
        return {
            ...super.getState(),
            file: this.currentFilePath
        };
    }

    private async renderMindMap(newNodes: Set<string> = new Set()) {
        if (!this.currentFilePath) {
            this.contentEl.empty();
            this.contentEl.createEl('h2', { text: "No file selected for mind map." });
            return;
        }

        const offlineContainer = document.createElement('div');
        offlineContainer.style.width = '100%';
        offlineContainer.style.height = '100%';

        const startPath = this.currentFilePath;
        const depth = 2;

        const graphWrapper = offlineContainer.createEl('div', { cls: 'diwa-mindmap-wrapper' });
        graphWrapper.style.position = 'relative';
        graphWrapper.style.width = '100%';
        graphWrapper.style.height = '100%';
        graphWrapper.style.overflow = 'hidden';
        graphWrapper.style.backgroundColor = 'var(--background-secondary)';
        graphWrapper.style.cursor = 'grab';
        graphWrapper.tabIndex = 0;
        graphWrapper.style.outline = 'none';
        graphWrapper.style.touchAction = 'none';

        const graphContent = graphWrapper.createDiv({ cls: 'diwa-mindmap-content' });
        graphContent.style.position = 'absolute';
        graphContent.style.width = '10000px';
        graphContent.style.height = '10000px';
        graphContent.style.transformOrigin = '2000px 2000px';

        if (!this.hasInitializedPan) {
            setTimeout(() => {
                const w = graphWrapper.clientWidth;
                const h = graphWrapper.clientHeight;
                this.panLeft = -(2000 - w/2);
                this.panTop = -(2000 - h/2);
                graphContent.style.left = `${this.panLeft}px`;
                graphContent.style.top = `${this.panTop}px`;
                this.hasInitializedPan = true;
            }, 10);
        } else {
            graphContent.style.left = `${this.panLeft}px`;
            graphContent.style.top = `${this.panTop}px`;
            graphContent.style.transform = `scale(${this.currentZoom})`;
        }

        const visited = new Map<string, number>();
        const edges: { from: string; to: string }[] = [];
        const queue: { path: string; level: number }[] = [{ path: startPath, level: 0 }];

        while (queue.length) {
            const { path, level } = queue.shift()!;
            if (this.hiddenNodes.has(path)) continue;
            if (visited.has(path)) continue;
            
            if (path.endsWith('.json') || path.endsWith('.canvas')) continue;

            visited.set(path, level);
            if (level >= depth) continue;

            const cache = this.app.metadataCache.getCache(path);
            const forwardPaths = new Set<string>();

            if (cache) {
                const allLinks = [
                    ...(cache.links || []),
                    ...(cache.embeds || []),
                    ...((cache as any).frontmatterLinks || [])
                ];
                for (const linkCache of allLinks) {
                    if (!linkCache.link) continue;
                    const dest = this.app.metadataCache.getFirstLinkpathDest(linkCache.link, path);
                    if (dest) forwardPaths.add(dest.path);
                }
            }

            const resolved = this.app.metadataCache.resolvedLinks || {};
            const pathResolved = resolved[path] || {};
            for (const destPath of Object.keys(pathResolved)) {
                forwardPaths.add(destPath);
            }

            const unresolved = this.app.metadataCache.unresolvedLinks || {};
            const pathUnresolved = unresolved[path] || {};
            for (const destLink of Object.keys(pathUnresolved)) {
                forwardPaths.add(`unresolved::${destLink}`);
            }

            const thoughtsFolder = this.plugin.settings.thoughtsFolder || '000 Bin/DIWA';

            for (const destPath of forwardPaths) {
                if (destPath.endsWith('.json') || destPath.endsWith('.canvas')) continue;
                
                edges.push({ from: path, to: destPath });

                const isThought = destPath.startsWith(thoughtsFolder + '/') || destPath === thoughtsFolder;
                const file = this.app.vault.getAbstractFileByPath(destPath);
                const isImage = file instanceof TFile && file.extension.match(/^(png|jpe?g|gif|bmp|svg|webp)$/i);

                if (isThought || isImage) {
                    if (!visited.has(destPath)) {
                        queue.push({ path: destPath, level: level + 1 });
                    }
                }
            }

            for (const [sourcePath, links] of Object.entries(resolved)) {
                if (sourcePath.endsWith('.json') || sourcePath.endsWith('.canvas')) continue;
                if (links[path]) {
                    edges.push({ from: sourcePath, to: path });
                    // Backlinks are intentionally not queued for automatic traversal.
                    // Users can show them via the context menu.
                }
            }
        }

        // Add dynamically created/pasted floating nodes
        for (const p of this.floatingNodes) {
            if (this.hiddenNodes.has(p)) continue;
            if (!visited.has(p)) {
                visited.set(p, 1);
            }
        }

        const uniqueEdges = new Set<string>();
        const validEdges: { from: string; to: string }[] = [];
        for (const e of edges) {
            const key = `${e.from}:::${e.to}`;
            if (!uniqueEdges.has(key) && visited.has(e.from) && visited.has(e.to)) {
                uniqueEdges.add(key);
                validEdges.push(e);
            }
        }

        const layers = new Map<number, string[]>();
        for (const [p, lvl] of visited.entries()) {
            if (!layers.has(lvl)) layers.set(lvl, []);
            layers.get(lvl)!.push(p);
        }

        const nodePositions = new Map<string, { x: number, y: number }>();
        const centerX = 2000;
        const centerY = 2000;
        
        for (const [lvl, paths] of layers.entries()) {
            if (lvl === 0) {
                paths.forEach(p => {
                    const saved = this.plugin.settings.mindMapNodeSizes?.[p];
                    if (saved?.x !== undefined && saved?.y !== undefined) {
                        nodePositions.set(p, { x: saved.x, y: saved.y });
                    } else {
                        nodePositions.set(p, { x: centerX, y: centerY });
                    }
                });
            } else {
                const radius = lvl * 350;
                const angleStep = (2 * Math.PI) / paths.length;
                paths.forEach((p, i) => {
                    const saved = this.plugin.settings.mindMapNodeSizes?.[p];
                    if (saved?.x !== undefined && saved?.y !== undefined) {
                        nodePositions.set(p, { x: saved.x, y: saved.y });
                    } else {
                        const angle = i * angleStep;
                        const x = centerX + radius * Math.cos(angle);
                        const y = centerY + radius * Math.sin(angle);
                        nodePositions.set(p, { x, y });
                    }
                });
            }
        }

        const resolveOverlaps = () => {
            const padding = 20;
            let moved = false;
            const paths = Array.from(visited.keys());
            for (let iter = 0; iter < 10; iter++) {
                moved = false;
                for (let i = 0; i < paths.length; i++) {
                    for (let j = i + 1; j < paths.length; j++) {
                        const p1 = paths[i];
                        const p2 = paths[j];
                        
                        const locked1 = !newNodes.has(p1);
                        const locked2 = !newNodes.has(p2);
                        if (locked1 && locked2) continue; // Don't move already setup nodes

                        const pos1 = nodePositions.get(p1)!;
                        const pos2 = nodePositions.get(p2)!;
                        const saved1 = this.plugin.settings.mindMapNodeSizes?.[p1] || { width: 250, height: 150 };
                        const saved2 = this.plugin.settings.mindMapNodeSizes?.[p2] || { width: 250, height: 150 };
                        const w1 = saved1.width || 250;
                        const h1 = saved1.height || 150;
                        const w2 = saved2.width || 250;
                        const h2 = saved2.height || 150;
                        
                        const minDx = (w1 + w2) / 2 + padding;
                        const minDy = (h1 + h2) / 2 + padding;
                        
                        // Add tiny random jitter to prevent perfect center overlap stalling
                        const dx = (pos1.x - pos2.x) || (Math.random() - 0.5);
                        const dy = (pos1.y - pos2.y) || (Math.random() - 0.5);
                        
                        if (Math.abs(dx) < minDx && Math.abs(dy) < minDy) {
                            moved = true;
                            const overlapX = minDx - Math.abs(dx);
                            const overlapY = minDy - Math.abs(dy);
                            
                            let pushX1 = 0, pushX2 = 0, pushY1 = 0, pushY2 = 0;
                            
                            if (overlapX < overlapY) {
                                const push = (overlapX / 2 + 1) * (dx >= 0 ? 1 : -1);
                                if (!locked1 && !locked2) {
                                    pushX1 = push; pushX2 = -push;
                                } else if (!locked1) {
                                    pushX1 = push * 2;
                                } else {
                                    pushX2 = -push * 2;
                                }
                            } else {
                                const push = (overlapY / 2 + 1) * (dy >= 0 ? 1 : -1);
                                if (!locked1 && !locked2) {
                                    pushY1 = push; pushY2 = -push;
                                } else if (!locked1) {
                                    pushY1 = push * 2;
                                } else {
                                    pushY2 = -push * 2;
                                }
                            }
                            
                            pos1.x += pushX1;
                            pos1.y += pushY1;
                            pos2.x += pushX2;
                            pos2.y += pushY2;
                        }
                    }
                }
                if (!moved) break;
            }
            if (moved) {
                if (!this.plugin.settings.mindMapNodeSizes) {
                    this.plugin.settings.mindMapNodeSizes = {};
                }
                for (const p of paths) {
                    const pos = nodePositions.get(p)!;
                    const saved = this.plugin.settings.mindMapNodeSizes[p] || { width: 250, height: 150 };
                    this.plugin.settings.mindMapNodeSizes[p] = { ...saved, x: pos.x, y: pos.y };
                }
                this.plugin.saveSettings();
            }
        };

        resolveOverlaps();

        const pathContents = new Map<string, string>();
        for (const p of visited.keys()) {
            const file = this.app.vault.getAbstractFileByPath(p);
            if (file instanceof TFile) {
                if (file.extension.match(/^(png|jpe?g|gif|bmp|svg|webp)$/i)) {
                    pathContents.set(p, '__IMAGE_FILE__');
                } else if (file.extension === 'md') {
                    let content = await this.app.vault.read(file);
                    content = content.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
                    if (content.length > 500) {
                        content = content.substring(0, 500) + '...';
                    }
                    pathContents.set(p, content);
                }
            }
        }

        const htmlNodes = new Map<string, HTMLElement>();
        for (const p of visited.keys()) {
            const pos = nodePositions.get(p)!;
            const nodeEl = graphContent.createDiv({ cls: 'diwa-mindmap-node' });
            nodeEl.dataset.path = p;
            
            const savedSize = this.plugin.settings.mindMapNodeSizes?.[p];
            const width = savedSize?.width || 250;
            const height = savedSize?.height ? `${savedSize.height}px` : 'auto';
            
            nodeEl.style.position = 'absolute';
            nodeEl.style.width = `${width}px`;
            nodeEl.style.height = height;
            nodeEl.style.left = `${pos.x - width/2}px`;
            nodeEl.style.top = savedSize?.height ? `${pos.y - savedSize.height/2}px` : `${pos.y - 30}px`;
            nodeEl.style.backgroundColor = 'var(--background-primary)';
            nodeEl.style.border = '1px solid var(--background-modifier-border)';
            nodeEl.style.borderRadius = '8px';
            nodeEl.style.padding = '12px';
            nodeEl.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
            nodeEl.style.cursor = 'pointer';
            nodeEl.style.overflow = 'visible';
            nodeEl.style.zIndex = '10';
            nodeEl.style.display = 'flex';
            nodeEl.style.flexDirection = 'column';

            const file = this.app.vault.getAbstractFileByPath(p);
            let title = p;
            if (file) {
                title = file.name.replace('.md', '');
            } else if (p.startsWith('unresolved::')) {
                title = p.replace('unresolved::', '');
                nodeEl.style.opacity = '0.7';
                nodeEl.style.borderStyle = 'dashed';
            }
            
            const titleEl = nodeEl.createEl('h4', { text: title });
            titleEl.style.margin = '0 0 8px 0';
            titleEl.style.color = 'var(--text-normal)';
            titleEl.style.fontSize = '14px';
            titleEl.style.wordBreak = 'break-word';
            const fileContent = pathContents.get(p);

            const thoughtsFolder = this.plugin.settings.thoughtsFolder || '000 Bin/DIWA';
            const isThought = p.startsWith(thoughtsFolder + '/') || p === thoughtsFolder;
            const isUnresolved = p.startsWith('unresolved::');
            const isImageFile = fileContent === '__IMAGE_FILE__';

            if ((isThought || isImageFile) && !isUnresolved) {
                titleEl.style.display = 'none';
            }
            
            if (!isThought && !isImageFile) {
                nodeEl.style.backgroundColor = 'var(--background-secondary-alt)';
                nodeEl.style.border = '2px solid var(--interactive-accent)';
            }

            if (fileContent === '__IMAGE_FILE__' && file instanceof TFile) {
                const imgEl = nodeEl.createEl('img');
                imgEl.src = this.app.vault.getResourcePath(file);
                imgEl.style.maxWidth = '100%';
                imgEl.style.objectFit = 'contain';
                imgEl.style.marginBottom = '12px';
                imgEl.style.borderRadius = '4px';
                imgEl.style.display = 'block';
                imgEl.style.flex = '1';
                imgEl.style.minHeight = '0';
            } else if (fileContent) {
                if (isThought) {
                    const match = fileContent.trim().match(/^!\[\[([^\]]+)\]\]$/);
                    let imageFile: TFile | null = null;
                    if (match) {
                        const imageName = match[1];
                        imageFile = this.app.metadataCache.getFirstLinkpathDest(imageName, p);
                        if (!imageFile) {
                            imageFile = this.app.vault.getFiles().find(f => f.name === imageName) || null;
                        }
                    }

                    if (imageFile instanceof TFile) {
                        const imgEl = nodeEl.createEl('img');
                        imgEl.src = this.app.vault.getResourcePath(imageFile);
                        imgEl.style.maxWidth = '100%';
                        imgEl.style.objectFit = 'contain';
                        imgEl.style.marginBottom = '12px';
                        imgEl.style.borderRadius = '4px';
                        imgEl.style.display = 'block';
                        imgEl.style.flex = '1';
                        imgEl.style.minHeight = '0';
                    } else {
                        const textEl = nodeEl.createEl('div');
                        textEl.style.fontSize = '12px';
                        textEl.style.color = 'var(--text-muted)';
                        textEl.style.marginBottom = '12px';
                        textEl.style.overflow = 'auto';
                        textEl.style.wordBreak = 'break-word';
                        textEl.style.flex = '1';
                        textEl.style.minHeight = '0';
                        
                        if (file instanceof TFile) {
                            MarkdownRenderer.renderMarkdown(fileContent, textEl, p, this);
                        } else {
                            textEl.innerText = fileContent;
                        }
                    }
                }
            } else if (p.startsWith('unresolved::')) {
                const textEl = nodeEl.createEl('div', { text: "Note not yet created." });
                textEl.style.fontSize = '12px';
                textEl.style.color = 'var(--text-faint)';
                textEl.style.fontStyle = 'italic';
                textEl.style.marginBottom = '12px';
            }



            if (file instanceof TFile) {
                const addBtn = nodeEl.createEl('button', { text: '+' });
                addBtn.style.position = 'absolute';
                addBtn.style.top = '50%';
                addBtn.style.transform = 'translateY(-50%)';
                addBtn.style.right = '-12px';
                addBtn.style.width = '24px';
                addBtn.style.height = '24px';
                addBtn.style.borderRadius = '12px';
                addBtn.style.backgroundColor = 'var(--interactive-accent)';
                addBtn.style.color = 'var(--text-on-accent)';
                addBtn.style.border = 'none';
                addBtn.style.cursor = 'pointer';
                addBtn.style.display = 'flex';
                addBtn.style.alignItems = 'center';
                addBtn.style.justifyContent = 'center';
                addBtn.style.padding = '0';
                addBtn.style.opacity = '0';
                addBtn.style.transition = 'opacity 0.2s ease-in-out';
                addBtn.title = 'Add Linked Thought';

                nodeEl.addEventListener('mouseenter', () => {
                    addBtn.style.opacity = '1';
                });
                nodeEl.addEventListener('mouseleave', () => {
                    addBtn.style.opacity = '0';
                });
                
                addBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    new ThoughtCreationModal(this.plugin, '', async (title, content) => {
                        const originalThought = this.plugin.getThoughtController().getThought(p);
                        const context = originalThought?.context || [];
                        const newThought = await this.plugin.getThoughtController().addThought({ title, content, context });
                        if (newThought) {
                            const newFilename = newThought.filePath.split('/').pop()?.replace('.md', '');
                            if (newFilename) {
                                await this.app.fileManager.processFrontMatter(file, (fm) => {
                                    if (!fm.links) fm.links = [];
                                    if (!Array.isArray(fm.links)) fm.links = [fm.links];
                                    fm.links.push(`[[${newFilename}]]`);
                                });
                            }
                            setTimeout(() => this.renderMindMap(), 200);
                        }
                    }).open();
                });
            }
            
            nodeEl.addEventListener('dblclick', async (e) => {
                if ((window as any)._isLinking) return;
                e.stopPropagation();
                if (file instanceof TFile) {
                    const thought = this.plugin.getThoughtController().getThought(p);
                    if (thought) {
                        new ThoughtCreationModal(this.plugin, thought.content, async (title, content) => {
                            await this.plugin.getThoughtController().updateThought({ filePath: thought.filePath, content });
                            setTimeout(() => this.renderMindMap(), 200);
                        }).open();
                    } else {
                        let fullText = await this.app.vault.read(file);
                        const frontmatterRegex = /^---\n[\s\S]*?\n---\n/;
                        const match = fullText.match(frontmatterRegex);
                        const fm = match ? match[0] : '';
                        const body = fullText.replace(frontmatterRegex, '').trim();
                        new ThoughtCreationModal(this.plugin, body, async (title, newBody) => {
                            await this.app.vault.modify(file, fm + '\n' + newBody + '\n');
                            setTimeout(() => this.renderMindMap(), 200);
                        }).open();
                    }
                }
            });

            nodeEl.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const menu = new Menu();
                
                menu.addItem((item) => {
                    item
                        .setTitle('Show incoming links (backlinks)')
                        .setIcon('links-going-in')
                        .onClick(() => {
                            const backlinks = [];
                            for (const [sourcePath, links] of Object.entries(this.app.metadataCache.resolvedLinks)) {
                                if (links[p]) backlinks.push(sourcePath);
                            }
                            if (p.startsWith('unresolved::')) {
                                const unresolvedName = p.replace('unresolved::', '');
                                for (const [sourcePath, links] of Object.entries(this.app.metadataCache.unresolvedLinks)) {
                                    if (links[unresolvedName]) backlinks.push(sourcePath);
                                }
                            }
                            
                            if (backlinks.length > 0) {
                                new MultiSelectLinksModal(this.app, 'Select Incoming Links', backlinks, (selected) => {
                                    if (selected.length === 0) return;
                                    const pos = nodePositions.get(p)!;
                                    let angle = 0;
                                    const angleStep = (2 * Math.PI) / selected.length;
                                    if (!this.plugin.settings.mindMapNodeSizes) {
                                        this.plugin.settings.mindMapNodeSizes = {};
                                    }
                                    const newNodes = new Set<string>();
                                    for (const bl of selected) {
                                        this.addFloatingNode(bl);
                                        const r = 300;
                                        const x = pos.x + r * Math.cos(angle);
                                        const y = pos.y + r * Math.sin(angle);
                                        const saved = this.plugin.settings.mindMapNodeSizes[bl] || { width: 250, height: 150 };
                                        this.plugin.settings.mindMapNodeSizes[bl] = { ...saved, x, y };
                                        angle += angleStep;
                                        newNodes.add(bl);
                                    }
                                    this.plugin.saveSettings();
                                    this.renderMindMap(newNodes);
                                }).open();
                            }
                        });
                });

                menu.addItem((item) => {
                    item
                        .setTitle('Show outgoing links (wikilinks)')
                        .setIcon('links-going-out')
                        .onClick(() => {
                            const forwardLinks = [];
                            const resolved = this.app.metadataCache.resolvedLinks[p] || {};
                            for (const destPath of Object.keys(resolved)) {
                                forwardLinks.push(destPath);
                            }
                            const unresolved = this.app.metadataCache.unresolvedLinks[p] || {};
                            for (const destLink of Object.keys(unresolved)) {
                                forwardLinks.push(`unresolved::${destLink}`);
                            }
                            
                            if (forwardLinks.length > 0) {
                                new MultiSelectLinksModal(this.app, 'Select Outgoing Links', forwardLinks, (selected) => {
                                    if (selected.length === 0) return;
                                    const pos = nodePositions.get(p)!;
                                    let angle = 0;
                                    const angleStep = (2 * Math.PI) / selected.length;
                                    if (!this.plugin.settings.mindMapNodeSizes) {
                                        this.plugin.settings.mindMapNodeSizes = {};
                                    }
                                    const newNodes = new Set<string>();
                                    for (const fl of selected) {
                                        this.addFloatingNode(fl);
                                        const r = 300;
                                        const x = pos.x + r * Math.cos(angle);
                                        const y = pos.y + r * Math.sin(angle);
                                        const saved = this.plugin.settings.mindMapNodeSizes[fl] || { width: 250, height: 150 };
                                        this.plugin.settings.mindMapNodeSizes[fl] = { ...saved, x, y };
                                        angle += angleStep;
                                        newNodes.add(fl);
                                    }
                                    this.plugin.saveSettings();
                                    this.renderMindMap(newNodes);
                                }).open();
                            }
                        });
                });

                menu.addItem((item) => {
                    item
                        .setTitle('Hide block from canvas')
                        .setIcon('eye-off')
                        .onClick(() => {
                            this.removeFloatingNode(p);
                            this.renderMindMap();
                        });
                });

                menu.showAtMouseEvent(e);
            });

            htmlNodes.set(p, nodeEl);
        }

        await new Promise(resolve => setTimeout(resolve, 0));

        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("width", "10000");
        svg.setAttribute("height", "10000");
        svg.style.overflow = "visible";
        svg.style.position = "absolute";
        svg.style.top = "0";
        svg.style.left = "0";
        svg.style.pointerEvents = "none";
        graphContent.insertBefore(svg, graphContent.firstChild);



        const drawnEdges: { from: string, to: string, pathEl: SVGPathElement }[] = [];

        const updateLine = (pathEl: SVGPathElement, fromPath: string, toPath: string) => {
            const pos1 = nodePositions.get(fromPath);
            const pos2 = nodePositions.get(toPath);
            const node1 = htmlNodes.get(fromPath);
            const node2 = htmlNodes.get(toPath);
            
            if (pos1 && pos2 && node1 && node2) {
                const p1 = getRectIntersection(pos1.x, pos1.y, node1.offsetWidth + 10, node1.offsetHeight + 10, pos2.x, pos2.y);
                const p2 = getRectIntersection(pos2.x, pos2.y, node2.offsetWidth + 10, node2.offsetHeight + 10, pos1.x, pos1.y);
                
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                const offset = dist * 0.4;
                
                let ctrlX1 = p1.x, ctrlY1 = p1.y;
                if ((p1 as any).side === 'horizontal') {
                    ctrlX1 += Math.sign(pos2.x - pos1.x) * offset;
                } else {
                    ctrlY1 += Math.sign(pos2.y - pos1.y) * offset;
                }
                
                let ctrlX2 = p2.x, ctrlY2 = p2.y;
                if ((p2 as any).side === 'horizontal') {
                    ctrlX2 += Math.sign(pos1.x - pos2.x) * offset;
                } else {
                    ctrlY2 += Math.sign(pos1.y - pos2.y) * offset;
                }
                
                pathEl.setAttribute("d", `M ${p1.x} ${p1.y} C ${ctrlX1} ${ctrlY1}, ${ctrlX2} ${ctrlY2}, ${p2.x} ${p2.y}`);
            }
        };

        for (const edge of validEdges) {
            const pathEl = document.createElementNS(svgNS, "path");
            pathEl.setAttribute("stroke", "var(--text-muted)");
            pathEl.setAttribute("stroke-width", "1.5");
            pathEl.setAttribute("fill", "none");
            pathEl.style.pointerEvents = "stroke";
            pathEl.style.cursor = "pointer";

            pathEl.addEventListener('mouseover', () => {
                pathEl.setAttribute("stroke", "var(--interactive-accent)");
                pathEl.setAttribute("stroke-width", "4");
            });
            pathEl.addEventListener('mouseout', () => {
                pathEl.setAttribute("stroke", "var(--text-muted)");
                pathEl.setAttribute("stroke-width", "1.5");
            });

            pathEl.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const menu = new Menu();
                menu.addItem((item) => {
                    item.setTitle('Remove link')
                        .setIcon('trash')
                        .onClick(async () => {
                            const sourceFile = this.app.vault.getAbstractFileByPath(edge.from);
                            const targetPath = edge.to;
                            const targetName = targetPath.startsWith('unresolved::') ? targetPath.replace('unresolved::', '') : targetPath.split('/').pop()?.replace('.md', '');
                            
                            if (sourceFile instanceof TFile && targetName) {
                                let linkRemovedFromFm = false;
                                await this.app.fileManager.processFrontMatter(sourceFile, (fm) => {
                                    if (fm.links && Array.isArray(fm.links)) {
                                        const index = fm.links.findIndex((l: any) => typeof l === 'string' && l.includes(targetName));
                                        if (index > -1) {
                                            fm.links.splice(index, 1);
                                            linkRemovedFromFm = true;
                                        }
                                    }
                                });
                                
                                if (!linkRemovedFromFm) {
                                    let content = await this.app.vault.read(sourceFile);
                                    const escapedTarget = targetName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                                    const regex = new RegExp(`\\[\\[${escapedTarget}(?:\\|([^\\]]*))?\\]\\]`, 'g');
                                    if (regex.test(content)) {
                                        content = content.replace(regex, (match, alias) => alias ? alias : targetName);
                                        await this.app.vault.modify(sourceFile, content);
                                    }
                                }
                                
                                const onResolve = (file: any) => {
                                    if (file.path === sourceFile.path) {
                                        this.renderMindMap();
                                        this.app.metadataCache.off('resolve', onResolve);
                                    }
                                };
                                this.app.metadataCache.on('resolve', onResolve);
                                setTimeout(() => {
                                    this.app.metadataCache.off('resolve', onResolve);
                                    this.renderMindMap();
                                }, 1500);
                                setTimeout(() => this.renderMindMap(), 200);
                            }
                        });
                });
                menu.showAtMouseEvent(e);
            });

            svg.appendChild(pathEl);
            drawnEdges.push({ from: edge.from, to: edge.to, pathEl });
            updateLine(pathEl, edge.from, edge.to);
        }

        // --- Dragging, Linking, Panning Logic --- //
        let isPanning = false;
        let isNodeDragging = false;
        let hasNodeMoved = false;
        let isLinking = false;
        let draggedNode: HTMLElement | null = null;
        let draggedNodePath: string | null = null;
        let linkSourcePath: string | null = null;
        let tempLinkLine: SVGLineElement | null = null;
        let mouseX = 0;
        let mouseY = 0;

        let startX = 0, startY = 0;
        let initialLeft = -2000, initialTop = -2000;
        let initialNodeLeft = 0, initialNodeTop = 0;

        // Add link handles to nodes
        for (const [p, nodeEl] of htmlNodes.entries()) {
            const linkHandle = nodeEl.createDiv();
            linkHandle.style.position = 'absolute';
            linkHandle.style.bottom = '4px';
            linkHandle.style.left = '50%';
            linkHandle.style.transform = 'translateX(-50%)';
            linkHandle.style.width = '12px';
            linkHandle.style.height = '12px';
            linkHandle.style.borderRadius = '6px';
            linkHandle.style.backgroundColor = 'var(--interactive-accent)';
            linkHandle.style.cursor = 'crosshair';
            linkHandle.style.zIndex = '20';
            linkHandle.style.opacity = '0';
            linkHandle.style.transition = 'opacity 0.2s ease-in-out';
            linkHandle.title = 'Drag to link to another thought';

            nodeEl.addEventListener('mouseenter', () => {
                linkHandle.style.opacity = '1';
            });
            nodeEl.addEventListener('mouseleave', () => {
                linkHandle.style.opacity = '0';
            });

            linkHandle.addEventListener('pointerdown', (e) => {
                e.stopPropagation();
                e.preventDefault();
                isLinking = true;
                (window as any)._isLinking = true;
                linkSourcePath = p;
                
                tempLinkLine = document.createElementNS(svgNS, "line");
                tempLinkLine.setAttribute("stroke", "var(--interactive-accent)");
                tempLinkLine.setAttribute("stroke-width", "1.5");
                tempLinkLine.setAttribute("stroke-dasharray", "5,5");
                svg.appendChild(tempLinkLine);

                const sX = parseInt(nodeEl.style.left) + nodeEl.offsetWidth / 2;
                const sY = parseInt(nodeEl.style.top) + nodeEl.offsetHeight;
                tempLinkLine.setAttribute("x1", sX.toString());
                tempLinkLine.setAttribute("y1", sY.toString());
                tempLinkLine.setAttribute("x2", sX.toString());
                tempLinkLine.setAttribute("y2", sY.toString());
            });
        }

        let saveTimeout: any = null;
        const resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                const nodeEl = entry.target as HTMLElement;
                const path = nodeEl.dataset.path;
                if (!path) continue;
                
                const newWidth = nodeEl.offsetWidth;
                const newHeight = nodeEl.offsetHeight;
                const left = parseInt(nodeEl.style.left || '0', 10);
                const top = parseInt(nodeEl.style.top || '0', 10);
                const newX = left + newWidth / 2;
                const newY = top + newHeight / 2;
                nodePositions.set(path, { x: newX, y: newY });

                for (const edge of drawnEdges) {
                    if (edge.from === path || edge.to === path) {
                        updateLine(edge.pathEl, edge.from, edge.to);
                    }
                }

                if (this.plugin.settings.mindMapNodeSizes) {
                    const saved = this.plugin.settings.mindMapNodeSizes[path] || {};
                    this.plugin.settings.mindMapNodeSizes[path] = { ...saved, width: newWidth, height: newHeight, x: newX, y: newY };
                    if (saveTimeout) clearTimeout(saveTimeout);
                    saveTimeout = setTimeout(() => {
                        this.plugin.saveSettings();
                    }, 1000);
                }
            }
        });

        for (const [p, nodeEl] of htmlNodes.entries()) {
            resizeObserver.observe(nodeEl);
            
            const resizeHandle = nodeEl.createDiv();
            resizeHandle.style.position = 'absolute';
            resizeHandle.style.right = '0';
            resizeHandle.style.bottom = '0';
            resizeHandle.style.width = '14px';
            resizeHandle.style.height = '14px';
            resizeHandle.style.cursor = 'se-resize';
            resizeHandle.style.zIndex = '30';
            resizeHandle.style.opacity = '0.7';
            resizeHandle.style.background = 'linear-gradient(135deg, transparent 50%, var(--text-muted) 50%)';
            resizeHandle.style.borderBottomRightRadius = '7px';
            
            resizeHandle.addEventListener('pointerdown', (e) => {
                if (e.pointerType === 'mouse' && e.button !== 0) return;
                e.stopPropagation();
                e.preventDefault();
                resizeHandle.setPointerCapture(e.pointerId);
                
                const startX = e.clientX;
                const startY = e.clientY;
                const startW = nodeEl.offsetWidth;
                const startH = nodeEl.offsetHeight;
                
                const onDrag = (ev: PointerEvent) => {
                    const nw = Math.max(100, startW + (ev.clientX - startX) / this.currentZoom);
                    const nh = Math.max(50, startH + (ev.clientY - startY) / this.currentZoom);
                    nodeEl.style.width = `${nw}px`;
                    nodeEl.style.height = `${nh}px`;
                };
                
                const onStop = (ev: PointerEvent) => {
                    resizeHandle.releasePointerCapture(e.pointerId);
                    resizeHandle.removeEventListener('pointermove', onDrag);
                    resizeHandle.removeEventListener('pointerup', onStop);
                    resizeHandle.removeEventListener('pointercancel', onStop);
                };
                
                resizeHandle.addEventListener('pointermove', onDrag);
                resizeHandle.addEventListener('pointerup', onStop);
                resizeHandle.addEventListener('pointercancel', onStop);
            });
        }

        graphWrapper.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;
            this.currentZoom = Math.max(0.2, Math.min(3.0, this.currentZoom + zoomDelta));
            graphContent.style.transform = `scale(${this.currentZoom})`;
        });

        graphWrapper.addEventListener('dblclick', (e) => {
            if ((e.target as HTMLElement).closest('.diwa-mindmap-node')) return;
            
            new ThoughtCreationModal(this.plugin, '', async (title, content) => {
                const thought = await this.plugin.getThoughtController().addThought({ title, content });
                if (thought) {
                    this.addFloatingNode(thought.filePath);
                    const contentRect = graphContent.getBoundingClientRect();
                    const targetX = (mouseX - contentRect.left) / this.currentZoom || 2000;
                    const targetY = (mouseY - contentRect.top) / this.currentZoom || 2000;
                    if (!this.plugin.settings.mindMapNodeSizes) {
                        this.plugin.settings.mindMapNodeSizes = {};
                    }
                    this.plugin.settings.mindMapNodeSizes[thought.filePath] = { width: 250, height: 150, x: targetX, y: targetY };
                    this.plugin.saveSettings();
                    this.renderMindMap();
                }
            }).open();
        });

        graphWrapper.addEventListener('paste', async (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.type.indexOf('image') !== -1) {
                    const file = item.getAsFile();
                    if (file) {
                        e.preventDefault();
                        const arrayBuffer = await file.arrayBuffer();
                        const attachmentFolder = this.plugin.settings.attachmentsFolder || 'Attachments';
                        
                        const folderExists = this.app.vault.getAbstractFileByPath(attachmentFolder);
                        if (!folderExists) {
                            await this.app.vault.createFolder(attachmentFolder);
                        }

                        const ext = file.name.split('.').pop() || 'png';
                        const filename = `Pasted image ${Date.now()}.${ext}`;
                        const filePath = `${attachmentFolder}/${filename}`;
                        await this.app.vault.createBinary(filePath, arrayBuffer);

                        const thoughtContent = `![[${filename}]]`;
                        const thought = await this.plugin.getThoughtController().addThought({ content: thoughtContent });

                        if (thought) {
                            this.addFloatingNode(thought.filePath);
                            const contentRect = graphContent.getBoundingClientRect();
                            const targetX = (mouseX - contentRect.left) / this.currentZoom;
                            const targetY = (mouseY - contentRect.top) / this.currentZoom;
                            
                            if (!this.plugin.settings.mindMapNodeSizes) {
                                this.plugin.settings.mindMapNodeSizes = {};
                            }
                            this.plugin.settings.mindMapNodeSizes[thought.filePath] = { width: 250, height: 150, x: targetX, y: targetY };
                            this.plugin.saveSettings();
                            setTimeout(() => this.renderMindMap(), 200);
                        }
                    }
                }
            }
        });

        graphWrapper.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            graphWrapper.setPointerCapture(e.pointerId);
            graphWrapper.focus();
            if (isLinking) return;
            const nodeTarget = (e.target as HTMLElement).closest('.diwa-mindmap-node') as HTMLElement;
            if (nodeTarget) {
                e.stopPropagation();
                isNodeDragging = true;
                (window as any)._isNodeDragging = true;
                draggedNode = nodeTarget;
                draggedNodePath = nodeTarget.dataset.path || null;
                hasNodeMoved = false;
                startX = e.clientX;
                startY = e.clientY;
                initialNodeLeft = parseInt(nodeTarget.style.left || '0', 10);
                initialNodeTop = parseInt(nodeTarget.style.top || '0', 10);
                nodeTarget.style.cursor = 'grabbing';
            } else {
                isPanning = true;
                startX = e.clientX;
                startY = e.clientY;
                initialLeft = this.panLeft;
                initialTop = this.panTop;
                graphWrapper.style.cursor = 'grabbing';
            }
        });

        const handlePointerUp = async (e: PointerEvent) => {
            graphWrapper.releasePointerCapture(e.pointerId);
            isPanning = false;
            graphWrapper.style.cursor = 'grab';

            if (isLinking && linkSourcePath) {
                const targetNode = document.elementFromPoint(e.clientX, e.clientY)?.closest('.diwa-mindmap-node') as HTMLElement;
                if (targetNode && targetNode.dataset.path && targetNode.dataset.path !== linkSourcePath) {
                    const targetPath = targetNode.dataset.path;
                    const sourceFile = this.app.vault.getAbstractFileByPath(linkSourcePath);
                    const targetFile = this.app.vault.getAbstractFileByPath(targetPath);
                    
                    if (sourceFile instanceof TFile && targetFile instanceof TFile) {
                        const targetFilename = targetFile.name.replace('.md', '');
                        await this.app.fileManager.processFrontMatter(sourceFile, (fm) => {
                            if (!fm.links) fm.links = [];
                            if (!Array.isArray(fm.links)) fm.links = [fm.links];
                            if (!fm.links.includes(`[[${targetFilename}]]`)) {
                                fm.links.push(`[[${targetFilename}]]`);
                            }
                        });
                        setTimeout(() => this.renderMindMap(), 200);
                    }
                }
                if (tempLinkLine && tempLinkLine.parentNode) {
                    tempLinkLine.parentNode.removeChild(tempLinkLine);
                }
                setTimeout(() => { isLinking = false; (window as any)._isLinking = false; }, 50);
                linkSourcePath = null;
                tempLinkLine = null;
            }
            
            if (isNodeDragging && draggedNode) {
                setTimeout(() => { isNodeDragging = false; (window as any)._isNodeDragging = false; }, 50);
                draggedNode.style.cursor = 'pointer';
                draggedNode = null;
                
                if (hasNodeMoved) {
                    if (saveTimeout) clearTimeout(saveTimeout);
                    this.plugin.saveSettings();
                    const nodes = new Set<string>();
                    if (draggedNodePath) nodes.add(draggedNodePath);
                    this.renderMindMap(nodes);
                }
                
                draggedNodePath = null;
                hasNodeMoved = false;
            }
        };

        graphWrapper.addEventListener('pointercancel', handlePointerUp);
        graphWrapper.addEventListener('pointerup', handlePointerUp);

        graphWrapper.addEventListener('pointermove', (e) => {
            mouseX = e.clientX;
            mouseY = e.clientY;

            if (isLinking && tempLinkLine) {
                e.preventDefault();
                const contentRect = graphContent.getBoundingClientRect();
                const targetX = (e.clientX - contentRect.left) / this.currentZoom;
                const targetY = (e.clientY - contentRect.top) / this.currentZoom;
                tempLinkLine.setAttribute("x2", targetX.toString());
                tempLinkLine.setAttribute("y2", targetY.toString());
            } else if (isPanning) {
                e.preventDefault();
                const dx = (e.clientX - startX);
                const dy = (e.clientY - startY);
                this.panLeft = initialLeft + dx / this.currentZoom;
                this.panTop = initialTop + dy / this.currentZoom;
                graphContent.style.left = `${this.panLeft}px`;
                graphContent.style.top = `${this.panTop}px`;
            } else if (isNodeDragging && draggedNode && draggedNodePath) {
                e.preventDefault();
                const dx = (e.clientX - startX) / this.currentZoom;
                const dy = (e.clientY - startY) / this.currentZoom;
                
                if (Math.abs(dx * this.currentZoom) > 3 || Math.abs(dy * this.currentZoom) > 3) {
                    hasNodeMoved = true;
                    const newLeft = initialNodeLeft + dx;
                    const newTop = initialNodeTop + dy;
                    draggedNode.style.left = `${newLeft}px`;
                    draggedNode.style.top = `${newTop}px`;

                    const width = draggedNode.offsetWidth;
                    const height = draggedNode.offsetHeight;
                    const newX = newLeft + width / 2;
                    const newY = newTop + height / 2;
                    nodePositions.set(draggedNodePath, { x: newX, y: newY });

                    for (const edge of drawnEdges) {
                        if (edge.from === draggedNodePath || edge.to === draggedNodePath) {
                            updateLine(edge.pathEl, edge.from, edge.to);
                        }
                    }

                    if (!this.plugin.settings.mindMapNodeSizes) {
                        this.plugin.settings.mindMapNodeSizes = {};
                    }
                    const saved = this.plugin.settings.mindMapNodeSizes[draggedNodePath] || {};
                    this.plugin.settings.mindMapNodeSizes[draggedNodePath] = { ...saved, x: newX, y: newY };
                }
            }
        });

        const fab = graphWrapper.createEl('button');
        fab.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
        fab.style.position = 'absolute';
        fab.style.bottom = '20px';
        fab.style.right = '20px';
        fab.style.width = '48px';
        fab.style.height = '48px';
        fab.style.borderRadius = '24px';
        fab.style.backgroundColor = 'var(--interactive-accent)';
        fab.style.color = 'var(--text-on-accent)';
        fab.style.border = 'none';
        fab.style.cursor = 'pointer';
        fab.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)';
        fab.style.zIndex = '100';
        fab.style.display = 'flex';
        fab.style.alignItems = 'center';
        fab.style.justifyContent = 'center';

        fab.addEventListener('click', () => {
            new ThoughtCreationModal(this.plugin, '', async (title, content) => {
                const thought = await this.plugin.getThoughtController().addThought({ title, content });
                if (thought) {
                    this.addFloatingNode(thought.filePath);
                    const contentRect = graphContent.getBoundingClientRect();
                    const targetX = (mouseX - contentRect.left) / this.currentZoom || 2000;
                    const targetY = (mouseY - contentRect.top) / this.currentZoom || 2000;
                    if (!this.plugin.settings.mindMapNodeSizes) {
                        this.plugin.settings.mindMapNodeSizes = {};
                    }
                    this.plugin.settings.mindMapNodeSizes[thought.filePath] = { width: 250, height: 150, x: targetX, y: targetY };
                    this.plugin.saveSettings();
                    this.renderMindMap();
                }
            }).open();
        });

        const addExistingFab = graphWrapper.createEl('button');
        addExistingFab.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>';
        addExistingFab.style.position = 'absolute';
        addExistingFab.style.bottom = '80px';
        addExistingFab.style.right = '20px';
        addExistingFab.style.width = '48px';
        addExistingFab.style.height = '48px';
        addExistingFab.style.borderRadius = '24px';
        addExistingFab.style.backgroundColor = 'var(--interactive-normal)';
        addExistingFab.style.color = 'var(--text-normal)';
        addExistingFab.style.border = '1px solid var(--background-modifier-border)';
        addExistingFab.style.cursor = 'pointer';
        addExistingFab.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)';
        addExistingFab.style.zIndex = '100';
        addExistingFab.style.display = 'flex';
        addExistingFab.style.alignItems = 'center';
        addExistingFab.style.justifyContent = 'center';
        addExistingFab.title = 'Add Existing Thought';

        addExistingFab.addEventListener('click', () => {
            new ExistingThoughtModal(this.plugin, (thoughtEntry) => {
                const path = thoughtEntry.filePath;
                this.addFloatingNode(path);
                const contentRect = graphContent.getBoundingClientRect();
                const targetX = (mouseX - contentRect.left) / this.currentZoom || 2000;
                const targetY = (mouseY - contentRect.top) / this.currentZoom || 2000;
                
                if (!this.plugin.settings.mindMapNodeSizes) {
                    this.plugin.settings.mindMapNodeSizes = {};
                }
                const saved = this.plugin.settings.mindMapNodeSizes[path] || { width: 250, height: 150 };
                this.plugin.settings.mindMapNodeSizes[path] = { ...saved, x: targetX, y: targetY };
                this.plugin.saveSettings();
                this.renderMindMap(new Set([path]));
            }).open();
        });

        const saveCanvasFab = graphWrapper.createEl('button');
        saveCanvasFab.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>';
        saveCanvasFab.style.position = 'absolute';
        saveCanvasFab.style.bottom = '140px';
        saveCanvasFab.style.right = '20px';
        saveCanvasFab.style.width = '48px';
        saveCanvasFab.style.height = '48px';
        saveCanvasFab.style.borderRadius = '24px';
        saveCanvasFab.style.backgroundColor = 'var(--interactive-normal)';
        saveCanvasFab.style.color = 'var(--text-normal)';
        saveCanvasFab.style.border = '1px solid var(--background-modifier-border)';
        saveCanvasFab.style.cursor = 'pointer';
        saveCanvasFab.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)';
        saveCanvasFab.style.zIndex = '100';
        saveCanvasFab.style.display = 'flex';
        saveCanvasFab.style.alignItems = 'center';
        saveCanvasFab.style.justifyContent = 'center';
        saveCanvasFab.title = 'Save as Canvas file';

        saveCanvasFab.addEventListener('click', async () => {
            const canvasData = {
                nodes: [] as any[],
                edges: [] as any[]
            };

            let idCounter = 1;
            const pathToId = new Map<string, string>();
            for (const p of visited.keys()) {
                const pos = nodePositions.get(p)!;
                const savedSize = this.plugin.settings.mindMapNodeSizes?.[p] || { width: 250, height: 150 };
                const nodeId = `node-${idCounter++}`;
                pathToId.set(p, nodeId);
                
                let nodeObj: any = {
                    id: nodeId,
                    x: Math.round(pos.x - savedSize.width / 2),
                    y: Math.round(pos.y - (savedSize.height || 150) / 2),
                    width: savedSize.width,
                    height: savedSize.height || 150
                };
                
                if (p.startsWith('unresolved::')) {
                    nodeObj.type = 'text';
                    nodeObj.text = `[[${p.replace('unresolved::', '')}]]`;
                } else {
                    nodeObj.type = 'file';
                    nodeObj.file = p;
                }
                
                canvasData.nodes.push(nodeObj);
            }

            let edgeCounter = 1;
            for (const edge of validEdges) {
                const fromId = pathToId.get(edge.from);
                const toId = pathToId.get(edge.to);
                if (fromId && toId) {
                    canvasData.edges.push({
                        id: `edge-${edgeCounter++}`,
                        fromNode: fromId,
                        fromSide: 'right',
                        toNode: toId,
                        toSide: 'left'
                    });
                }
            }

            const canvasJson = JSON.stringify(canvasData, null, 2);
            
            const folder = this.plugin.settings.thoughtsFolder || '000 Bin/DIWA';
            const filename = `MindMap-${Date.now()}.canvas`;
            const filePath = `${folder}/${filename}`;
            
            await this.app.vault.create(filePath, canvasJson);
            
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (file instanceof TFile) {
                this.app.workspace.getLeaf(false).openFile(file);
            }
        });

        this.contentEl.empty();
        this.contentEl.appendChild(offlineContainer);
    }
}

class MultiSelectLinksModal extends Modal {
    links: string[];
    onSubmit: (selected: string[]) => void;
    modalTitle: string;

    constructor(app: App, title: string, links: string[], onSubmit: (selected: string[]) => void) {
        super(app);
        this.links = links;
        this.onSubmit = onSubmit;
        this.modalTitle = title;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: this.modalTitle });

        const selected = new Set<string>();
        
        const listEl = contentEl.createDiv({ cls: 'diwa-multi-select-list' });
        listEl.style.maxHeight = '300px';
        listEl.style.overflowY = 'auto';
        listEl.style.marginBottom = '1rem';

        for (const link of this.links) {
            const labelEl = listEl.createEl("label");
            labelEl.style.display = 'flex';
            labelEl.style.alignItems = 'center';
            labelEl.style.marginBottom = '0.5rem';
            labelEl.style.cursor = 'pointer';

            const checkbox = labelEl.createEl("input", { type: "checkbox" });
            checkbox.style.marginRight = '0.5rem';
            
            const span = labelEl.createSpan();
            span.setText("Loading...");
            span.style.whiteSpace = "nowrap";
            span.style.overflow = "hidden";
            span.style.textOverflow = "ellipsis";
            span.style.maxWidth = "400px";

            if (link.startsWith('unresolved::')) {
                span.setText(`[[${link.replace('unresolved::', '')}]]`);
            } else {
                const file = this.app.vault.getAbstractFileByPath(link);
                if (file instanceof TFile) {
                    if (file.extension === 'md') {
                        this.app.vault.read(file).then(fullText => {
                            const frontmatterRegex = /^---\n[\s\S]*?\n---\n/;
                            const body = fullText.replace(frontmatterRegex, '').trim();
                            const preview = body.substring(0, 100).replace(/\n/g, ' ') + (body.length > 100 ? '...' : '');
                            span.setText(preview || file.basename);
                        });
                    } else {
                        span.setText(file.name);
                    }
                } else {
                    span.setText(link);
                }
            }

            checkbox.addEventListener('change', (e) => {
                if ((e.target as HTMLInputElement).checked) {
                    selected.add(link);
                } else {
                    selected.delete(link);
                }
            });
        }

        const btnContainer = contentEl.createDiv();
        btnContainer.style.display = 'flex';
        btnContainer.style.justifyContent = 'flex-end';
        btnContainer.style.gap = '0.5rem';

        const btnAdd = btnContainer.createEl("button", { text: "Add Selected", cls: "mod-cta" });
        btnAdd.addEventListener("click", () => {
            this.onSubmit(Array.from(selected));
            this.close();
        });
        
        const btnCancel = btnContainer.createEl("button", { text: "Cancel" });
        btnCancel.addEventListener("click", () => this.close());
    }

    onClose() {
        this.contentEl.empty();
    }
}
