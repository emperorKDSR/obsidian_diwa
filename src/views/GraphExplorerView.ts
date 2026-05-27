import {
    ItemView,
    MarkdownRenderer,
    Notice,
    TFile,
    ViewStateResult,
    WorkspaceLeaf,
    setIcon,
} from 'obsidian';
import type DiwaPlugin from '../main';
import { GRAPH_ICON_ID, VIEW_TYPE_GRAPH_EXPLORER } from '../constants';
import { compileGraphSnapshot } from '../graph/compiler';
import {
    DEFAULT_GRAPH_NODE_TYPES,
    type GraphExplorerSeed,
    type GraphExplorerViewState,
    type GraphEdge,
    type GraphLayoutPoint,
    type GraphNode,
    type GraphNodeType,
    type GraphNodeTypeFilters,
    type GraphSnapshot,
} from '../graph/types';

const SVG_NS = 'http://www.w3.org/2000/svg';
const DEFAULT_MAX_HOPS = 2;
const DEFAULT_ZOOM = 1;
const MIN_ZOOM = 0.7;
const MAX_ZOOM = 1.8;
const ZOOM_STEP = 0.15;
const NODE_RADII: Record<GraphNodeType, number> = {
    thought: 28,
    task: 24,
    project: 21,
    context: 18,
};
const NODE_COLOR_CLASS: Record<GraphNodeType, string> = {
    thought: 'is-thought',
    task: 'is-task',
    project: 'is-project',
    context: 'is-context',
};
const EDGE_TYPE_LABELS: Record<GraphEdge['type'], string> = {
    related: 'Thought link',
    source: 'Source',
    reflect: 'Reflection',
    project: 'Project',
    context: 'Context',
};

type NormalizedGraphExplorerViewState = {
    seed: GraphExplorerSeed | null;
    selectedNodeId: string | null;
    maxHops: number;
    nodeTypes: GraphNodeTypeFilters;
    zoom: number;
};

export class GraphExplorerView extends ItemView {
    plugin: DiwaPlugin;
    private state: NormalizedGraphExplorerViewState = createDefaultState();
    private _closed = false;
    private _hostWindow: Window | null = null;
    private _resizeHandler: (() => void) | null = null;
    private _keydownHandler: ((event: KeyboardEvent) => void) | null = null;
    private _lastSnapshot: GraphSnapshot | null = null;
    private _renderToken = 0;

    constructor(leaf: WorkspaceLeaf, plugin: DiwaPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_GRAPH_EXPLORER;
    }

    getDisplayText(): string {
        return 'DIWA Graph Explorer';
    }

    getIcon(): string {
        return GRAPH_ICON_ID;
    }

    getState(): NormalizedGraphExplorerViewState {
        return {
            seed: this.state.seed,
            selectedNodeId: this.state.selectedNodeId,
            maxHops: this.state.maxHops,
            nodeTypes: { ...this.state.nodeTypes },
            zoom: this.state.zoom,
        };
    }

    async setState(state: GraphExplorerViewState, result: ViewStateResult): Promise<void> {
        this.state = normalizeState(state);
        await super.setState(this.state, result);
        this.renderView();
    }

    async onOpen(): Promise<void> {
        this._closed = false;
        const header = this.containerEl.children[0] as HTMLElement | undefined;
        if (header) header.style.display = 'none';
        this.attachHostWindowListeners();
        this.renderView();
    }

    async onClose(): Promise<void> {
        this._closed = true;
        const header = this.containerEl.children[0] as HTMLElement | undefined;
        if (header) header.style.display = '';
        this.detachHostWindowListeners();
    }

    renderView(): void {
        if (this._closed) return;
        const root = this.containerEl.children[1] as HTMLElement | undefined;
        if (!root) return;

        const snapshot = compileGraphSnapshot(
            {
                thoughts: this.plugin.index.thoughtIndex,
                tasks: this.plugin.index.taskIndex,
                projects: this.plugin.index.projectIndex,
            },
            this.state.seed,
            {
                maxHops: this.state.maxHops,
                nodeTypes: this.state.nodeTypes,
            },
        );
        this._lastSnapshot = snapshot;
        this.ensureSelection(snapshot);

        const selectedNode = this.getSelectedNode(snapshot);
        const renderToken = ++this._renderToken;
        root.empty();
        root.addClass('diwa-gx-root');

        const shell = root.createDiv({ cls: 'diwa-gx-shell' });
        this.renderTopBar(shell, snapshot);

        const body = shell.createDiv({ cls: 'diwa-gx-body' });
        this.renderSidebar(body, snapshot);

        const canvasPanel = body.createDiv({ cls: 'diwa-gx-canvas-panel' });
        this.renderCanvas(canvasPanel, snapshot, selectedNode);
        this.renderInspector(body, snapshot, selectedNode, renderToken);
        this.renderStatusBar(shell, snapshot);
    }

    private renderTopBar(parent: HTMLElement, snapshot: GraphSnapshot): void {
        const bar = parent.createDiv({ cls: 'diwa-gx-topbar' });
        const titleWrap = bar.createDiv({ cls: 'diwa-gx-title-wrap' });
        titleWrap.createDiv({ cls: 'diwa-gx-title', text: 'Graph Explorer' });
        titleWrap.createDiv({
            cls: 'diwa-gx-seed-badge',
            text: this.getSeedTitle(snapshot),
        });

        const controls = bar.createDiv({ cls: 'diwa-gx-topbar-actions' });

        const hopsGroup = controls.createDiv({ cls: 'diwa-gx-inline-group' });
        hopsGroup.createSpan({ cls: 'diwa-gx-inline-label', text: 'Hops' });
        const hopSelect = hopsGroup.createEl('select', { cls: 'diwa-gx-select' });
        [1, 2, 3, 4].forEach((value) => {
            const option = hopSelect.createEl('option', {
                text: String(value),
                value: String(value),
            });
            option.selected = value === this.state.maxHops;
        });
        hopSelect.addEventListener('change', () => {
            const nextHops = Number(hopSelect.value);
            this.state.maxHops = Number.isFinite(nextHops) ? Math.max(1, Math.min(4, nextHops)) : DEFAULT_MAX_HOPS;
            this.state.selectedNodeId = null;
            this.requestWorkspaceLayoutSave();
            this.renderView();
        });

        const zoomGroup = controls.createDiv({ cls: 'diwa-gx-inline-group' });
        zoomGroup.createSpan({ cls: 'diwa-gx-inline-label', text: 'View' });
        this.createIconButton(zoomGroup, 'minus', 'Zoom out', () => {
            this.state.zoom = clampNumber(this.state.zoom - ZOOM_STEP, MIN_ZOOM, MAX_ZOOM, DEFAULT_ZOOM);
            this.requestWorkspaceLayoutSave();
            this.renderView();
        });
        this.createIconButton(zoomGroup, 'plus', 'Zoom in', () => {
            this.state.zoom = clampNumber(this.state.zoom + ZOOM_STEP, MIN_ZOOM, MAX_ZOOM, DEFAULT_ZOOM);
            this.requestWorkspaceLayoutSave();
            this.renderView();
        });
        this.createIconButton(zoomGroup, 'crosshair', 'Recenter', () => {
            this.state.zoom = DEFAULT_ZOOM;
            this.requestWorkspaceLayoutSave();
            this.renderView();
        });
    }

    private renderSidebar(parent: HTMLElement, snapshot: GraphSnapshot): void {
        const sidebar = parent.createDiv({ cls: 'diwa-gx-sidebar' });
        const filtersSection = sidebar.createDiv({ cls: 'diwa-gx-panel' });
        filtersSection.createDiv({ cls: 'diwa-gx-panel-title', text: 'Filters' });
        filtersSection.createDiv({
            cls: 'diwa-gx-panel-subtitle',
            text: 'Toggle node types without rebuilding the vault indices.',
        });

        (Object.keys(this.state.nodeTypes) as GraphNodeType[]).forEach((nodeType) => {
            const row = filtersSection.createEl('label', { cls: 'diwa-gx-filter-row' });
            const input = row.createEl('input', {
                attr: { type: 'checkbox' },
            }) as HTMLInputElement;
            input.checked = this.state.nodeTypes[nodeType];
            input.addEventListener('change', () => {
                this.state.nodeTypes[nodeType] = input.checked;
                this.requestWorkspaceLayoutSave();
                this.renderView();
            });
            const label = row.createSpan({ text: capitalize(nodeType) });
            label.addClass('diwa-gx-filter-label');
            const count = snapshot.nodes.filter((node) => node.type === nodeType).length;
            row.createSpan({ cls: 'diwa-gx-filter-count', text: String(count) });
        });

        const legend = sidebar.createDiv({ cls: 'diwa-gx-panel' });
        legend.createDiv({ cls: 'diwa-gx-panel-title', text: 'Legend' });
        renderLegendRow(legend, 'related', 'Thought link');
        renderLegendRow(legend, 'source', 'Thought → task');
        renderLegendRow(legend, 'reflect', 'Task reflection');
        renderLegendRow(legend, 'project', 'Project membership');
        renderLegendRow(legend, 'context', 'Context membership');
    }

    private renderCanvas(parent: HTMLElement, snapshot: GraphSnapshot, selectedNode: GraphNode | null): void {
        const panel = parent.createDiv({ cls: 'diwa-gx-panel diwa-gx-canvas-shell' });
        const toolbar = panel.createDiv({ cls: 'diwa-gx-canvas-toolbar' });
        toolbar.createDiv({ cls: 'diwa-gx-panel-title', text: 'Graph canvas' });
        toolbar.createDiv({
            cls: 'diwa-gx-panel-subtitle',
            text: snapshot.missingSeed
                ? 'Resolve a thought or task seed to build the graph.'
                : 'Click to inspect. Double-click a thought or task to make it the new seed.',
        });

        const canvas = panel.createDiv({ cls: 'diwa-gx-canvas' });
        if (snapshot.nodes.length === 0) {
            this.renderEmptyCanvas(canvas, snapshot);
            return;
        }

        const width = Math.max(760, Math.round(canvas.clientWidth || 1120));
        const height = Math.max(520, Math.round(canvas.clientHeight || 720));
        const doc = canvas.ownerDocument;
        const svg = doc.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('class', 'diwa-gx-svg');
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', 'DIWA Graph Explorer canvas');
        canvas.appendChild(svg);

        const group = doc.createElementNS(SVG_NS, 'g');
        group.setAttribute('class', 'diwa-gx-graph');
        const fitScale = this.computeFitScale(snapshot, width, height);
        const scale = fitScale * this.state.zoom;
        group.setAttribute('transform', `translate(${width / 2} ${height / 2}) scale(${scale})`);
        svg.appendChild(group);

        const edgeLayer = doc.createElementNS(SVG_NS, 'g');
        edgeLayer.setAttribute('class', 'diwa-gx-edge-layer');
        group.appendChild(edgeLayer);

        snapshot.edges.forEach((edge) => {
            const from = snapshot.layout[edge.source];
            const to = snapshot.layout[edge.target];
            if (!from || !to) return;
            const line = doc.createElementNS(SVG_NS, 'line');
            line.setAttribute('x1', String(from.x));
            line.setAttribute('y1', String(from.y));
            line.setAttribute('x2', String(to.x));
            line.setAttribute('y2', String(to.y));
            line.setAttribute('class', `diwa-gx-edge is-${edge.type}`);
            line.setAttribute('data-edge-type', edge.type);
            line.setAttribute('aria-label', EDGE_TYPE_LABELS[edge.type]);
            edgeLayer.appendChild(line);
        });

        const nodeLayer = doc.createElementNS(SVG_NS, 'g');
        nodeLayer.setAttribute('class', 'diwa-gx-node-layer');
        group.appendChild(nodeLayer);

        snapshot.nodes.forEach((node) => {
            const position = snapshot.layout[node.id];
            if (!position) return;
            const radius = NODE_RADII[node.type];
            const nodeGroup = doc.createElementNS(SVG_NS, 'g');
            nodeGroup.setAttribute('class', buildNodeClassName(node, selectedNode));
            nodeGroup.setAttribute('transform', `translate(${position.x} ${position.y})`);
            nodeGroup.setAttribute('tabindex', '0');
            nodeGroup.setAttribute('role', 'button');
            nodeGroup.setAttribute('aria-label', `${node.label} (${node.type})`);
            nodeLayer.appendChild(nodeGroup);

            const circle = doc.createElementNS(SVG_NS, 'circle');
            circle.setAttribute('r', String(radius));
            circle.setAttribute('class', 'diwa-gx-node-shape');
            nodeGroup.appendChild(circle);

            const title = doc.createElementNS(SVG_NS, 'text');
            title.setAttribute('class', 'diwa-gx-node-label');
            title.setAttribute('text-anchor', 'middle');
            title.setAttribute('y', String(radius + 18));
            title.textContent = truncateText(node.label, 26);
            nodeGroup.appendChild(title);

            const subtitle = doc.createElementNS(SVG_NS, 'text');
            subtitle.setAttribute('class', 'diwa-gx-node-subtitle');
            subtitle.setAttribute('text-anchor', 'middle');
            subtitle.setAttribute('y', String(radius + 34));
            subtitle.textContent = truncateText(node.subtitle, 28);
            nodeGroup.appendChild(subtitle);

            nodeGroup.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.state.selectedNodeId = node.id;
                this.requestWorkspaceLayoutSave();
                this.renderView();
            });
            nodeGroup.addEventListener('dblclick', (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!this.trySeedNode(node)) {
                    this.state.selectedNodeId = node.id;
                    this.renderView();
                }
            });
            nodeGroup.addEventListener('keydown', (event: KeyboardEvent) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    if (!this.trySeedNode(node)) {
                        this.state.selectedNodeId = node.id;
                        this.requestWorkspaceLayoutSave();
                        this.renderView();
                    }
                    return;
                }
                if (event.key === ' ') {
                    event.preventDefault();
                    this.state.selectedNodeId = node.id;
                    this.requestWorkspaceLayoutSave();
                    this.renderView();
                }
            });
        });

        svg.addEventListener('click', (event) => {
            if (event.target !== svg) return;
            this.resetSelectionToSeed();
        });
    }

    private renderInspector(
        parent: HTMLElement,
        snapshot: GraphSnapshot,
        selectedNode: GraphNode | null,
        renderToken: number,
    ): void {
        const inspector = parent.createDiv({ cls: 'diwa-gx-inspector' });
        const panel = inspector.createDiv({ cls: 'diwa-gx-panel diwa-gx-inspector-panel' });
        panel.createDiv({ cls: 'diwa-gx-panel-title', text: 'Inspector' });

        if (!selectedNode) {
            panel.createDiv({
                cls: 'diwa-gx-empty-title',
                text: snapshot.missingSeed ? 'Seed unavailable' : 'No selection',
            });
            panel.createDiv({
                cls: 'diwa-gx-empty-body',
                text: snapshot.missingSeed
                    ? 'The selected thought or task is no longer present in the indexed data.'
                    : 'Select a node to inspect its details and actions.',
            });
            return;
        }

        const typeRow = panel.createDiv({ cls: 'diwa-gx-inspector-type-row' });
        typeRow.createDiv({ cls: 'diwa-gx-inspector-title', text: selectedNode.label });
        typeRow.createDiv({
            cls: `diwa-gx-node-chip ${NODE_COLOR_CLASS[selectedNode.type]}`,
            text: capitalize(selectedNode.type),
        });
        panel.createDiv({ cls: 'diwa-gx-inspector-subtitle', text: selectedNode.subtitle || 'Linked item' });

        const actions = panel.createDiv({ cls: 'diwa-gx-inspector-actions' });
        const openButton = actions.createEl('button', {
            cls: 'diwa-gx-button is-primary',
            text: selectedNode.filePath ? 'Open source' : 'No source note',
            attr: { type: 'button' },
        });
        openButton.disabled = !selectedNode.filePath;
        openButton.addEventListener('click', () => void this.openNodeFile(selectedNode));

        if (selectedNode.type === 'thought' || selectedNode.type === 'task') {
            const seedButton = actions.createEl('button', {
                cls: 'diwa-gx-button',
                text: 'Focus graph',
                attr: { type: 'button' },
            });
            seedButton.addEventListener('click', () => {
                this.setSeed({ type: selectedNode.type as GraphExplorerSeed['type'], id: selectedNode.ref });
            });
        }

        const metadata = panel.createDiv({ cls: 'diwa-gx-inspector-metadata' });
        selectedNode.metadata.forEach((item) => {
            const row = metadata.createDiv({ cls: 'diwa-gx-meta-row' });
            row.createDiv({ cls: 'diwa-gx-meta-label', text: item.label });
            row.createDiv({ cls: 'diwa-gx-meta-value', text: item.value });
        });

        const preview = panel.createDiv({ cls: 'diwa-gx-inspector-preview' });
        preview.createDiv({ cls: 'diwa-gx-section-title', text: 'Preview' });
        const previewBody = preview.createDiv({ cls: 'diwa-gx-preview-body markdown-rendered' });
        if (selectedNode.body?.trim()) {
            void MarkdownRenderer.render(
                this.app,
                selectedNode.body,
                previewBody,
                selectedNode.filePath || '',
                this,
            ).then(() => {
                if (renderToken !== this._renderToken) previewBody.empty();
            });
        } else {
            previewBody.setText('No note content to preview.');
        }

        const connected = this.getConnectedNodes(snapshot, selectedNode);
        const related = panel.createDiv({ cls: 'diwa-gx-inspector-related' });
        related.createDiv({ cls: 'diwa-gx-section-title', text: 'Connected items' });
        if (connected.length === 0) {
            related.createDiv({ cls: 'diwa-gx-empty-body', text: 'No additional visible connections under the current filters.' });
            return;
        }

        const list = related.createDiv({ cls: 'diwa-gx-related-list' });
        connected.slice(0, 12).forEach((node) => {
            const button = list.createEl('button', {
                cls: 'diwa-gx-related-item',
                attr: { type: 'button' },
            });
            button.createDiv({ cls: 'diwa-gx-related-title', text: node.label });
            button.createDiv({ cls: 'diwa-gx-related-meta', text: `${capitalize(node.type)} • ${node.subtitle}` });
            button.addEventListener('click', () => {
                this.state.selectedNodeId = node.id;
                this.requestWorkspaceLayoutSave();
                this.renderView();
            });
        });
    }

    private renderStatusBar(parent: HTMLElement, snapshot: GraphSnapshot): void {
        const bar = parent.createDiv({ cls: 'diwa-gx-statusbar' });
        const left = bar.createDiv({ cls: 'diwa-gx-status-left' });
        left.createSpan({ text: `${snapshot.stats.visibleNodes} nodes` });
        left.createSpan({ text: `${snapshot.stats.visibleEdges} edges` });
        left.createSpan({ text: `${snapshot.stats.maxHops} hops` });

        const right = bar.createDiv({ cls: 'diwa-gx-status-right' });
        right.createSpan({ text: snapshot.stats.filterSummary });
        if (snapshot.truncated) {
            right.createSpan({ cls: 'diwa-gx-status-warning', text: 'Bounded render' });
        }
        snapshot.warnings.slice(0, 1).forEach((warning) => {
            right.createSpan({ cls: 'diwa-gx-status-warning', text: warning });
        });
    }

    private renderEmptyCanvas(parent: HTMLElement, snapshot: GraphSnapshot): void {
        const state = parent.createDiv({ cls: 'diwa-gx-empty-state' });
        const title = snapshot.missingSeed
            ? 'Seed unavailable'
            : snapshot.seed
                ? 'No visible graph under current filters'
                : 'Select a thought or task seed';
        const body = snapshot.missingSeed
            ? 'The requested thought or task no longer exists in the current indices. Reopen the graph from DIWA or Gawa.'
            : snapshot.seed
                ? 'Try increasing hops or re-enabling project/context nodes to widen the neighborhood.'
                : 'Use the plugin graph-open methods from DIWA or Gawa entry points to seed this workspace.';
        state.createDiv({ cls: 'diwa-gx-empty-title', text: title });
        state.createDiv({ cls: 'diwa-gx-empty-body', text: body });
    }

    private getConnectedNodes(snapshot: GraphSnapshot, node: GraphNode): GraphNode[] {
        const connectedIds = new Set<string>();
        snapshot.edges.forEach((edge) => {
            if (edge.source === node.id) connectedIds.add(edge.target);
            if (edge.target === node.id) connectedIds.add(edge.source);
        });
        return snapshot.nodes
            .filter((candidate) => connectedIds.has(candidate.id))
            .sort((left, right) => left.hop - right.hop || left.label.localeCompare(right.label));
    }

    private getSelectedNode(snapshot: GraphSnapshot): GraphNode | null {
        if (!this.state.selectedNodeId) return null;
        return snapshot.nodes.find((node) => node.id === this.state.selectedNodeId) ?? null;
    }

    private ensureSelection(snapshot: GraphSnapshot): void {
        if (!snapshot.nodes.length) {
            this.state.selectedNodeId = null;
            return;
        }
        const selectedNode = snapshot.nodes.find((node) => node.id === this.state.selectedNodeId);
        if (selectedNode) return;
        this.state.selectedNodeId = snapshot.resolvedSeedNodeId ?? snapshot.nodes[0]?.id ?? null;
    }

    private resetSelectionToSeed(): void {
        this.state.selectedNodeId = this._lastSnapshot?.resolvedSeedNodeId ?? null;
        this.requestWorkspaceLayoutSave();
        this.renderView();
    }

    private setSeed(seed: GraphExplorerSeed): void {
        this.state.seed = seed;
        this.state.selectedNodeId = null;
        this.state.zoom = DEFAULT_ZOOM;
        this.requestWorkspaceLayoutSave();
        this.renderView();
    }

    private trySeedNode(node: GraphNode): boolean {
        if (node.type !== 'thought' && node.type !== 'task') return false;
        this.setSeed({ type: node.type, id: node.ref });
        return true;
    }

    private getSeedTitle(snapshot: GraphSnapshot): string {
        const selectedSeed = snapshot.nodes.find((node) => node.id === snapshot.resolvedSeedNodeId);
        if (selectedSeed) return `Seed: ${selectedSeed.label}`;
        if (this.state.seed?.id) return `Seed: ${this.state.seed.id}`;
        return 'No seed selected';
    }

    private computeFitScale(snapshot: GraphSnapshot, width: number, height: number): number {
        const bounds = this.computeLayoutBounds(snapshot);
        if (!bounds) return 1;
        const fitWidth = Math.max(width - 140, 240);
        const fitHeight = Math.max(height - 120, 200);
        const scaleX = fitWidth / bounds.width;
        const scaleY = fitHeight / bounds.height;
        return Math.min(Math.max(Math.min(scaleX, scaleY), 0.36), 1.18);
    }

    private computeLayoutBounds(snapshot: GraphSnapshot): { width: number; height: number } | null {
        if (!snapshot.nodes.length) return null;
        let minX = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;

        snapshot.nodes.forEach((node) => {
            const position = snapshot.layout[node.id];
            if (!position) return;
            const radius = NODE_RADII[node.type] + 80;
            minX = Math.min(minX, position.x - radius);
            maxX = Math.max(maxX, position.x + radius);
            minY = Math.min(minY, position.y - radius);
            maxY = Math.max(maxY, position.y + radius);
        });

        if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
            return null;
        }
        return {
            width: Math.max(maxX - minX, 1),
            height: Math.max(maxY - minY, 1),
        };
    }

    private async openNodeFile(node: GraphNode): Promise<void> {
        if (!node.filePath) {
            new Notice('No underlying note is available for this node.');
            return;
        }
        const file = this.app.vault.getAbstractFileByPath(node.filePath);
        if (!(file instanceof TFile)) {
            new Notice('Unable to open the underlying note.');
            return;
        }
        const targetLeaf = this.resolveSourceOpenLeaf();
        if (!targetLeaf) {
            new Notice('Unable to find a workspace leaf for the underlying note.');
            return;
        }
        await targetLeaf.openFile(file);
    }

    private createIconButton(parent: HTMLElement, icon: string, label: string, onClick: () => void): HTMLButtonElement {
        const button = parent.createEl('button', {
            cls: 'diwa-gx-icon-button',
            attr: { type: 'button', 'aria-label': label },
        });
        setIcon(button, icon);
        button.addEventListener('click', onClick);
        return button;
    }

    private attachHostWindowListeners(): void {
        const root = this.containerEl.children[1] as HTMLElement | undefined;
        const hostWindow = root?.ownerDocument?.defaultView ?? null;
        this.detachHostWindowListeners();
        if (!hostWindow) return;

        this._hostWindow = hostWindow;
        this._resizeHandler = () => this.renderView();
        this._keydownHandler = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            const root = this.containerEl.children[1] as HTMLElement | undefined;
            const target = event.target;
            if (!root || !(target instanceof Node) || !root.contains(target)) return;
            event.preventDefault();
            this.resetSelectionToSeed();
        };
        hostWindow.addEventListener('resize', this._resizeHandler);
        hostWindow.addEventListener('keydown', this._keydownHandler, true);
    }

    private detachHostWindowListeners(): void {
        if (this._hostWindow && this._resizeHandler) {
            this._hostWindow.removeEventListener('resize', this._resizeHandler);
        }
        if (this._hostWindow && this._keydownHandler) {
            this._hostWindow.removeEventListener('keydown', this._keydownHandler, true);
        }
        this._hostWindow = null;
        this._resizeHandler = null;
        this._keydownHandler = null;
    }

    private requestWorkspaceLayoutSave(): void {
        const workspaceWithSave = this.app.workspace as typeof this.app.workspace & {
            requestSaveLayout?: () => void;
        };
        workspaceWithSave.requestSaveLayout?.();
    }

    private resolveSourceOpenLeaf(): WorkspaceLeaf | null {
        const workspace = this.app.workspace;
        const tabLeaf = workspace.getLeaf('tab');
        if (tabLeaf && tabLeaf !== this.leaf) {
            return tabLeaf;
        }

        const activeLeaf = workspace.activeLeaf;
        if (activeLeaf && activeLeaf !== this.leaf) {
            return activeLeaf;
        }

        const fallbackLeaf = workspace.getLeaf(false);
        if (fallbackLeaf && fallbackLeaf !== this.leaf) {
            return fallbackLeaf;
        }

        return workspace.getLeaf('window');
    }
}

function normalizeState(state: GraphExplorerViewState | null | undefined): NormalizedGraphExplorerViewState {
    const defaults = createDefaultState();
    return {
        seed: normalizeSeed(state?.seed) ?? defaults.seed,
        selectedNodeId: typeof state?.selectedNodeId === 'string' && state.selectedNodeId.trim()
            ? state.selectedNodeId.trim()
            : null,
        maxHops: clampNumber(state?.maxHops, 1, 4, DEFAULT_MAX_HOPS),
        nodeTypes: {
            ...defaults.nodeTypes,
            ...(state?.nodeTypes ?? {}),
        },
        zoom: clampNumber(state?.zoom, MIN_ZOOM, MAX_ZOOM, DEFAULT_ZOOM),
    };
}

function createDefaultState(): NormalizedGraphExplorerViewState {
    return {
        seed: null,
        selectedNodeId: null,
        maxHops: DEFAULT_MAX_HOPS,
        nodeTypes: { ...DEFAULT_GRAPH_NODE_TYPES },
        zoom: DEFAULT_ZOOM,
    };
}

function normalizeSeed(seed: GraphExplorerSeed | null | undefined): GraphExplorerSeed | null {
    if (!seed?.id?.trim()) return null;
    if (seed.type !== 'thought' && seed.type !== 'task') return null;
    return { type: seed.type, id: seed.id.trim() };
}

function buildNodeClassName(node: GraphNode, selectedNode: GraphNode | null): string {
    const classes = ['diwa-gx-node', NODE_COLOR_CLASS[node.type]];
    if (node.isSeed) classes.push('is-seed');
    if (selectedNode?.id === node.id) classes.push('is-selected');
    return classes.join(' ');
}

function renderLegendRow(parent: HTMLElement, edgeType: GraphEdge['type'], label: string): void {
    const row = parent.createDiv({ cls: 'diwa-gx-legend-row' });
    row.createDiv({ cls: `diwa-gx-legend-line is-${edgeType}` });
    row.createDiv({ cls: 'diwa-gx-legend-label', text: label });
}

function truncateText(value: string, maxLength: number): string {
    const trimmed = value.trim();
    if (trimmed.length <= maxLength) return trimmed;
    return `${trimmed.slice(0, Math.max(0, maxLength - 1))}…`;
}

function capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function clampNumber(value: number | undefined, min: number, max: number, fallback: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
}
