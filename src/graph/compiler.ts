import type { ProjectEntry, TaskEntry, ThoughtEntry } from '../types';
import {
    DEFAULT_GRAPH_NODE_TYPES,
    type GraphBuildOptions,
    type GraphCompilerSource,
    type GraphEdge,
    type GraphEdgeType,
    type GraphExplorerSeed,
    type GraphLayoutPoint,
    type GraphNode,
    type GraphNodeType,
    type GraphSnapshot,
} from './types';

const DEFAULT_NODE_CAP = 120;
const DEFAULT_EDGE_CAP = 240;
const DEFAULT_PER_NODE_CAP = 16;
const MAX_HOPS = 4;
const NODE_TYPE_ORDER: GraphNodeType[] = ['thought', 'task', 'project', 'context'];

interface GraphCompilerLookup {
    thoughts: ThoughtEntry[];
    tasks: TaskEntry[];
    thoughtByRef: Map<string, ThoughtEntry>;
    taskByRef: Map<string, TaskEntry>;
    projectByRef: Map<string, ProjectEntry>;
    reverseThoughtLinks: Map<string, Set<ThoughtEntry>>;
    tasksByThought: Map<string, Set<TaskEntry>>;
    tasksByReflectionThought: Map<string, Set<TaskEntry>>;
    thoughtsByProject: Map<string, Set<ThoughtEntry>>;
    tasksByProject: Map<string, Set<TaskEntry>>;
    thoughtsByContext: Map<string, Set<ThoughtEntry>>;
    tasksByContext: Map<string, Set<TaskEntry>>;
}

interface GraphNeighbor {
    node: GraphNode;
    edge: GraphEdge;
    sortKey: string;
}

export function compileGraphSnapshot(
    source: GraphCompilerSource,
    seed: GraphExplorerSeed | null | undefined,
    options: GraphBuildOptions,
): GraphSnapshot {
    const maxHops = clampInteger(options.maxHops, 1, MAX_HOPS, 2);
    const nodeCap = clampInteger(options.nodeCap, 20, 200, DEFAULT_NODE_CAP);
    const edgeCap = clampInteger(options.edgeCap, 20, 400, DEFAULT_EDGE_CAP);
    const perNodeCap = clampInteger(options.perNodeCap, 4, 24, DEFAULT_PER_NODE_CAP);
    const nodeTypes = {
        ...DEFAULT_GRAPH_NODE_TYPES,
        ...(options.nodeTypes ?? {}),
    };
    const warnings = new Set<string>();
    const lookup = buildLookup(source);

    if (!seed?.id?.trim()) {
        return buildEmptySnapshot({
            seed: null,
            maxHops,
            warnings: [],
            filterSummary: describeFilters(nodeTypes),
        });
    }

    const resolvedSeed = resolveSeed(seed, lookup);
    if (!resolvedSeed) {
        return buildEmptySnapshot({
            seed,
            maxHops,
            warnings: ['The selected seed could not be resolved from the current indices.'],
            missingSeed: true,
            filterSummary: describeFilters(nodeTypes),
        });
    }

    const nodeMap = new Map<string, GraphNode>();
    const edgeMap = new Map<string, GraphEdge>();
    const queue: Array<{ node: GraphNode; hop: number }> = [];
    let truncated = false;

    const seedNode = { ...resolvedSeed, hop: 0, isSeed: true };
    nodeMap.set(seedNode.id, seedNode);
    queue.push({ node: seedNode, hop: 0 });

    while (queue.length > 0) {
        const current = queue.shift();
        if (!current) break;
        if (current.hop >= maxHops) continue;

        const neighbors = getNeighbors(current.node, current.hop + 1, lookup)
            .sort((left, right) => left.sortKey.localeCompare(right.sortKey));

        if (neighbors.length > perNodeCap) {
            truncated = true;
            warnings.add(`${current.node.label} was capped to ${perNodeCap} neighbors.`);
        }

        for (const neighbor of neighbors.slice(0, perNodeCap)) {
            if (!edgeMap.has(neighbor.edge.id)) {
                if (edgeMap.size >= edgeCap) {
                    truncated = true;
                    warnings.add(`Graph edge cap reached at ${edgeCap} edges.`);
                    break;
                }
                edgeMap.set(neighbor.edge.id, neighbor.edge);
            }

            const existing = nodeMap.get(neighbor.node.id);
            if (existing) continue;
            if (nodeMap.size >= nodeCap) {
                truncated = true;
                warnings.add(`Graph node cap reached at ${nodeCap} nodes.`);
                continue;
            }

            nodeMap.set(neighbor.node.id, neighbor.node);
            queue.push({ node: neighbor.node, hop: current.hop + 1 });
        }
    }

    const allNodes = Array.from(nodeMap.values()).sort(compareNodes);
    const visibleNodeIds = new Set(
        allNodes
            .filter((node) => nodeTypes[node.type] || node.id === seedNode.id)
            .map((node) => node.id),
    );
    const visibleNodes = allNodes.filter((node) => visibleNodeIds.has(node.id));
    const visibleEdges = Array.from(edgeMap.values())
        .filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target))
        .sort((left, right) => left.id.localeCompare(right.id));
    const layout = computeDeterministicLayout(visibleNodes, seedNode.id);

    return {
        seed,
        resolvedSeedNodeId: seedNode.id,
        nodes: visibleNodes,
        edges: visibleEdges,
        layout,
        missingSeed: false,
        truncated,
        warnings: Array.from(warnings),
        stats: {
            totalNodes: allNodes.length,
            visibleNodes: visibleNodes.length,
            totalEdges: edgeMap.size,
            visibleEdges: visibleEdges.length,
            maxHops,
            filterSummary: describeFilters(nodeTypes),
        },
    };
}

function buildLookup(source: GraphCompilerSource): GraphCompilerLookup {
    const thoughts = dedupeThoughts(Array.from(source.thoughts.values()));
    const tasks = dedupeTasks(Array.from(source.tasks.values()));
    const thoughtByRef = new Map<string, ThoughtEntry>();
    const taskByRef = new Map<string, TaskEntry>();
    const projectByRef = new Map<string, ProjectEntry>();
    const reverseThoughtLinks = new Map<string, Set<ThoughtEntry>>();
    const tasksByThought = new Map<string, Set<TaskEntry>>();
    const tasksByReflectionThought = new Map<string, Set<TaskEntry>>();
    const thoughtsByProject = new Map<string, Set<ThoughtEntry>>();
    const tasksByProject = new Map<string, Set<TaskEntry>>();
    const thoughtsByContext = new Map<string, Set<ThoughtEntry>>();
    const tasksByContext = new Map<string, Set<TaskEntry>>();

    for (const thought of thoughts) {
        registerRef(thoughtByRef, thought.filePath, thought);
        registerRef(thoughtByRef, thought.id, thought);
    }

    for (const task of tasks) {
        registerRef(taskByRef, task.filePath, task);
        registerRef(taskByRef, task.id, task);
        registerRef(taskByRef, getTaskKey(task), task);
    }

    for (const project of source.projects.values()) {
        registerRef(projectByRef, project.id, project);
        registerRef(projectByRef, project.name, project);
        registerRef(projectByRef, normalizeProjectKey(project.name), project);
    }

    for (const thought of thoughts) {
        const projectKey = normalizeProjectKey(thought.project);
        if (projectKey) addGroupedValue(thoughtsByProject, projectKey, thought);
        for (const context of uniqueStrings(thought.context)) {
            addGroupedValue(thoughtsByContext, normalizeContextKey(context), thought);
        }
        for (const linkedThoughtRef of uniqueStrings(thought.links?.thoughts ?? [])) {
            const linkedThought = resolveThoughtRef(linkedThoughtRef, thoughtByRef);
            if (!linkedThought || linkedThought.filePath === thought.filePath) continue;
            addGroupedValue(reverseThoughtLinks, linkedThought.filePath, thought);
        }
    }

    for (const task of tasks) {
        const projectKey = normalizeProjectKey(task.project);
        if (projectKey) addGroupedValue(tasksByProject, projectKey, task);
        for (const context of uniqueStrings(task.context)) {
            addGroupedValue(tasksByContext, normalizeContextKey(context), task);
        }
        for (const thoughtRef of getTaskThoughtRefs(task)) {
            const thought = resolveThoughtRef(thoughtRef, thoughtByRef);
            if (!thought) continue;
            addGroupedValue(tasksByThought, thought.filePath, task);
        }
        const reflectionThought = resolveThoughtRef(task.reflectionThoughtId, thoughtByRef);
        if (reflectionThought) {
            addGroupedValue(tasksByReflectionThought, reflectionThought.filePath, task);
        }
    }

    return {
        thoughts,
        tasks,
        thoughtByRef,
        taskByRef,
        projectByRef,
        reverseThoughtLinks,
        tasksByThought,
        tasksByReflectionThought,
        thoughtsByProject,
        tasksByProject,
        thoughtsByContext,
        tasksByContext,
    };
}

function getNeighbors(node: GraphNode, hop: number, lookup: GraphCompilerLookup): GraphNeighbor[] {
    switch (node.type) {
        case 'thought':
            return collectThoughtNeighbors(node.thought, hop, lookup);
        case 'task':
            return collectTaskNeighbors(node.task, hop, lookup);
        case 'project':
            return collectProjectNeighbors(node, hop, lookup);
        case 'context':
            return collectContextNeighbors(node, hop, lookup);
        default:
            return [];
    }
}

function collectThoughtNeighbors(
    thought: ThoughtEntry | undefined,
    hop: number,
    lookup: GraphCompilerLookup,
): GraphNeighbor[] {
    if (!thought) return [];
    const neighbors: GraphNeighbor[] = [];

    const relatedThoughts = new Map<string, ThoughtEntry>();
    for (const ref of uniqueStrings(thought.links?.thoughts ?? [])) {
        const related = resolveThoughtRef(ref, lookup.thoughtByRef);
        if (related) relatedThoughts.set(related.filePath, related);
    }
    for (const reverseThought of lookup.reverseThoughtLinks.get(thought.filePath) ?? []) {
        relatedThoughts.set(reverseThought.filePath, reverseThought);
    }
    for (const related of relatedThoughts.values()) {
        const relatedNode = createThoughtNode(related, hop, false);
        neighbors.push({
            node: relatedNode,
            edge: createEdge('related', createThoughtNode(thought, hop - 1, false).id, relatedNode.id, hop),
            sortKey: `${hop}:related:${relatedNode.label.toLowerCase()}:${relatedNode.id}`,
        });
    }

    const sourceTasks = new Map<string, TaskEntry>();
    for (const ref of uniqueStrings(thought.links?.tasks ?? [])) {
        const task = resolveTaskRef(ref, lookup.taskByRef);
        if (task) sourceTasks.set(task.filePath, task);
    }
    for (const task of lookup.tasksByThought.get(thought.filePath) ?? []) {
        sourceTasks.set(task.filePath, task);
    }
    for (const task of sourceTasks.values()) {
        const taskNode = createTaskNode(task, hop, false);
        neighbors.push({
            node: taskNode,
            edge: createDirectedEdge('source', createThoughtNode(thought, hop - 1, false).id, taskNode.id, hop),
            sortKey: `${hop}:source:${taskNode.label.toLowerCase()}:${taskNode.id}`,
        });
    }

    for (const reflectionTask of lookup.tasksByReflectionThought.get(thought.filePath) ?? []) {
        const taskNode = createTaskNode(reflectionTask, hop, false);
        neighbors.push({
            node: taskNode,
            edge: createDirectedEdge('reflect', taskNode.id, createThoughtNode(thought, hop - 1, false).id, hop),
            sortKey: `${hop}:reflect:${taskNode.label.toLowerCase()}:${taskNode.id}`,
        });
    }

    const projectKey = normalizeProjectKey(thought.project);
    if (projectKey) {
        const projectNode = createProjectNode(thought.project ?? projectKey, lookup.projectByRef, hop);
        neighbors.push({
            node: projectNode,
            edge: createDirectedEdge('project', createThoughtNode(thought, hop - 1, false).id, projectNode.id, hop),
            sortKey: `${hop}:project:${projectNode.label.toLowerCase()}:${projectNode.id}`,
        });
    }

    for (const context of uniqueStrings(thought.context)) {
        const contextNode = createContextNode(context, hop);
        neighbors.push({
            node: contextNode,
            edge: createDirectedEdge('context', createThoughtNode(thought, hop - 1, false).id, contextNode.id, hop),
            sortKey: `${hop}:context:${contextNode.label.toLowerCase()}:${contextNode.id}`,
        });
    }

    return dedupeNeighbors(neighbors);
}

function collectTaskNeighbors(
    task: TaskEntry | undefined,
    hop: number,
    lookup: GraphCompilerLookup,
): GraphNeighbor[] {
    if (!task) return [];
    const neighbors: GraphNeighbor[] = [];
    const taskNodeId = createTaskNode(task, hop - 1, false).id;

    for (const thoughtRef of getTaskThoughtRefs(task)) {
        const thought = resolveThoughtRef(thoughtRef, lookup.thoughtByRef);
        if (!thought) continue;
        const thoughtNode = createThoughtNode(thought, hop, false);
        neighbors.push({
            node: thoughtNode,
            edge: createDirectedEdge('source', thoughtNode.id, taskNodeId, hop),
            sortKey: `${hop}:source:${thoughtNode.label.toLowerCase()}:${thoughtNode.id}`,
        });
    }

    const reflectionThought = resolveThoughtRef(task.reflectionThoughtId, lookup.thoughtByRef);
    if (reflectionThought) {
        const thoughtNode = createThoughtNode(reflectionThought, hop, false);
        neighbors.push({
            node: thoughtNode,
            edge: createDirectedEdge('reflect', taskNodeId, thoughtNode.id, hop),
            sortKey: `${hop}:reflect:${thoughtNode.label.toLowerCase()}:${thoughtNode.id}`,
        });
    }

    const projectKey = normalizeProjectKey(task.project);
    if (projectKey) {
        const projectNode = createProjectNode(task.project ?? projectKey, lookup.projectByRef, hop);
        neighbors.push({
            node: projectNode,
            edge: createDirectedEdge('project', taskNodeId, projectNode.id, hop),
            sortKey: `${hop}:project:${projectNode.label.toLowerCase()}:${projectNode.id}`,
        });
    }

    for (const context of uniqueStrings(task.context)) {
        const contextNode = createContextNode(context, hop);
        neighbors.push({
            node: contextNode,
            edge: createDirectedEdge('context', taskNodeId, contextNode.id, hop),
            sortKey: `${hop}:context:${contextNode.label.toLowerCase()}:${contextNode.id}`,
        });
    }

    return dedupeNeighbors(neighbors);
}

function collectProjectNeighbors(
    projectNode: GraphNode,
    hop: number,
    lookup: GraphCompilerLookup,
): GraphNeighbor[] {
    const projectKey = projectNode.projectKey;
    if (!projectKey) return [];
    const neighbors: GraphNeighbor[] = [];

    for (const thought of lookup.thoughtsByProject.get(projectKey) ?? []) {
        const thoughtNode = createThoughtNode(thought, hop, false);
        neighbors.push({
            node: thoughtNode,
            edge: createDirectedEdge('project', thoughtNode.id, projectNode.id, hop),
            sortKey: `${hop}:thought:${thoughtNode.label.toLowerCase()}:${thoughtNode.id}`,
        });
    }
    for (const task of lookup.tasksByProject.get(projectKey) ?? []) {
        const taskNode = createTaskNode(task, hop, false);
        neighbors.push({
            node: taskNode,
            edge: createDirectedEdge('project', taskNode.id, projectNode.id, hop),
            sortKey: `${hop}:task:${taskNode.label.toLowerCase()}:${taskNode.id}`,
        });
    }

    return dedupeNeighbors(neighbors);
}

function collectContextNeighbors(
    contextNode: GraphNode,
    hop: number,
    lookup: GraphCompilerLookup,
): GraphNeighbor[] {
    const contextKey = contextNode.contextKey;
    if (!contextKey) return [];
    const neighbors: GraphNeighbor[] = [];

    for (const thought of lookup.thoughtsByContext.get(contextKey) ?? []) {
        const thoughtNode = createThoughtNode(thought, hop, false);
        neighbors.push({
            node: thoughtNode,
            edge: createDirectedEdge('context', thoughtNode.id, contextNode.id, hop),
            sortKey: `${hop}:thought:${thoughtNode.label.toLowerCase()}:${thoughtNode.id}`,
        });
    }
    for (const task of lookup.tasksByContext.get(contextKey) ?? []) {
        const taskNode = createTaskNode(task, hop, false);
        neighbors.push({
            node: taskNode,
            edge: createDirectedEdge('context', taskNode.id, contextNode.id, hop),
            sortKey: `${hop}:task:${taskNode.label.toLowerCase()}:${taskNode.id}`,
        });
    }

    return dedupeNeighbors(neighbors);
}

function createThoughtNode(thought: ThoughtEntry, hop: number, isSeed: boolean): GraphNode {
    const contextText = uniqueStrings(thought.context).map((value) => `#${value}`).join(', ');
    const projectText = thought.project?.trim() ? `Project: ${thought.project.trim()}` : '';
    return {
        id: `thought::${thought.filePath}`,
        type: 'thought',
        ref: thought.filePath,
        label: getThoughtLabel(thought),
        subtitle: projectText || contextText || (thought.day ? `Day ${thought.day}` : 'Thought'),
        hop,
        isSeed,
        filePath: thought.filePath,
        body: (thought.body || thought.content || '').trim(),
        metadata: [
            { label: 'Created', value: thought.created || thought.day || 'Unknown' },
            ...(contextText ? [{ label: 'Context', value: contextText }] : []),
            ...(thought.project ? [{ label: 'Project', value: thought.project }] : []),
            ...(thought.topic ? [{ label: 'Topic', value: String(thought.topic) }] : []),
        ],
        thought,
    };
}

function createTaskNode(task: TaskEntry, hop: number, isSeed: boolean): GraphNode {
    const contextText = uniqueStrings(task.context).map((value) => `#${value}`).join(', ');
    const dueText = task.due?.trim() ? `Due ${task.due.trim()}` : '';
    return {
        id: `task::${task.filePath}`,
        type: 'task',
        ref: getTaskKey(task),
        label: getTaskLabel(task),
        subtitle: dueText || (task.status ? `Status: ${task.status}` : 'Task'),
        hop,
        isSeed,
        filePath: task.filePath,
        body: (task.body || '').trim(),
        metadata: [
            { label: 'Status', value: task.status || 'open' },
            ...(task.due ? [{ label: 'Due', value: task.due }] : []),
            ...(contextText ? [{ label: 'Context', value: contextText }] : []),
            ...(task.project ? [{ label: 'Project', value: task.project }] : []),
            ...(task.priority ? [{ label: 'Priority', value: task.priority }] : []),
        ],
        task,
    };
}

function createProjectNode(projectRef: string, projectByRef: Map<string, ProjectEntry>, hop: number): GraphNode {
    const project = resolveProjectRef(projectRef, projectByRef);
    const label = project?.name || projectRef.trim();
    const projectKey = normalizeProjectKey(project?.name || projectRef);
    return {
        id: `project::${project?.id || projectKey}`,
        type: 'project',
        ref: project?.id || label,
        label,
        subtitle: project?.status ? `Status: ${project.status}` : 'Project',
        hop,
        isSeed: false,
        filePath: project?.filePath,
        projectKey,
        body: project?.goal?.trim() || '',
        metadata: [
            ...(project?.status ? [{ label: 'Status', value: project.status }] : []),
            ...(project?.goal ? [{ label: 'Goal', value: project.goal }] : []),
            ...(project?.due ? [{ label: 'Due', value: project.due }] : []),
        ],
        project: project ?? undefined,
    };
}

function createContextNode(context: string, hop: number): GraphNode {
    const normalized = normalizeContextKey(context);
    const label = context.trim();
    return {
        id: `context::${normalized}`,
        type: 'context',
        ref: label,
        label: `#${label}`,
        subtitle: 'Context',
        hop,
        isSeed: false,
        contextKey: normalized,
        metadata: [{ label: 'Context', value: `#${label}` }],
    };
}

function createEdge(type: GraphEdgeType, leftId: string, rightId: string, hop: number): GraphEdge {
    const [source, target] = [leftId, rightId].sort((left, right) => left.localeCompare(right));
    return {
        id: `${type}::${source}::${target}`,
        source,
        target,
        type,
        hop,
    };
}

function createDirectedEdge(type: GraphEdgeType, source: string, target: string, hop: number): GraphEdge {
    return {
        id: `${type}::${source}::${target}`,
        source,
        target,
        type,
        hop,
    };
}

function computeDeterministicLayout(nodes: GraphNode[], seedNodeId: string): Record<string, GraphLayoutPoint> {
    const layout: Record<string, GraphLayoutPoint> = {};
    if (nodes.length === 0) return layout;
    layout[seedNodeId] = { x: 0, y: 0 };

    const groups = new Map<number, GraphNode[]>();
    for (const node of nodes) {
        if (node.id === seedNodeId) continue;
        const bucket = groups.get(node.hop) ?? [];
        bucket.push(node);
        groups.set(node.hop, bucket);
    }

    for (const [hop, group] of Array.from(groups.entries()).sort((left, right) => left[0] - right[0])) {
        const sortedGroup = group.slice().sort(compareNodes);
        const radius = hop * (210 + Math.min(sortedGroup.length, 12) * 8);
        const offset = seededAngleOffset(`${seedNodeId}:${hop}`);
        const count = sortedGroup.length;
        sortedGroup.forEach((node, index) => {
            const angle = offset + ((Math.PI * 2) / Math.max(count, 1)) * index;
            layout[node.id] = {
                x: Math.cos(angle) * radius,
                y: Math.sin(angle) * radius * 0.82,
            };
        });
    }

    return layout;
}

function seededAngleOffset(seed: string): number {
    const hash = Math.abs(hashString(seed));
    return (hash % 360) * (Math.PI / 180);
}

function resolveSeed(seed: GraphExplorerSeed, lookup: GraphCompilerLookup): GraphNode | null {
    if (seed.type === 'thought') {
        const thought = resolveThoughtRef(seed.id, lookup.thoughtByRef);
        return thought ? createThoughtNode(thought, 0, true) : null;
    }
    const task = resolveTaskRef(seed.id, lookup.taskByRef);
    return task ? createTaskNode(task, 0, true) : null;
}

function resolveThoughtRef(ref: string | undefined | null, thoughtByRef: Map<string, ThoughtEntry>): ThoughtEntry | null {
    const normalized = ref?.trim();
    if (!normalized) return null;
    return thoughtByRef.get(normalized) ?? null;
}

function resolveTaskRef(ref: string | undefined | null, taskByRef: Map<string, TaskEntry>): TaskEntry | null {
    const normalized = ref?.trim();
    if (!normalized) return null;
    return taskByRef.get(normalized) ?? null;
}

function resolveProjectRef(ref: string | undefined | null, projectByRef: Map<string, ProjectEntry>): ProjectEntry | null {
    const normalized = ref?.trim();
    if (!normalized) return null;
    return projectByRef.get(normalized)
        ?? projectByRef.get(normalizeProjectKey(normalized))
        ?? null;
}

function compareNodes(left: GraphNode, right: GraphNode): number {
    return left.hop - right.hop
        || NODE_TYPE_ORDER.indexOf(left.type) - NODE_TYPE_ORDER.indexOf(right.type)
        || left.label.localeCompare(right.label)
        || left.id.localeCompare(right.id);
}

function dedupeNeighbors(neighbors: GraphNeighbor[]): GraphNeighbor[] {
    const deduped = new Map<string, GraphNeighbor>();
    for (const neighbor of neighbors) {
        const existing = deduped.get(neighbor.edge.id);
        if (!existing || neighbor.sortKey.localeCompare(existing.sortKey) < 0) {
            deduped.set(neighbor.edge.id, neighbor);
        }
    }
    return Array.from(deduped.values());
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
    return Array.from(new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean)));
}

function getTaskThoughtRefs(task: TaskEntry): string[] {
    return uniqueStrings([
        ...(task.sourceThoughtIds ?? []),
        ...(task.links?.thoughts ?? []),
    ]);
}

function getTaskKey(task: TaskEntry): string {
    return task.taskId?.trim() || task.filePath;
}

function getThoughtLabel(thought: ThoughtEntry): string {
    const title = thought.title?.trim();
    if (title) return title;
    const bodyLine = (thought.body || thought.content || '').split('\n').find((line) => line.trim());
    return bodyLine?.trim() || thought.filePath.split('/').pop() || 'Untitled thought';
}

function getTaskLabel(task: TaskEntry): string {
    return (task.title || task.body || task.filePath.split('/').pop() || 'Untitled task').trim();
}

function dedupeThoughts(thoughts: ThoughtEntry[]): ThoughtEntry[] {
    const deduped = new Map<string, ThoughtEntry>();
    for (const thought of thoughts) {
        if (!thought?.filePath?.trim()) continue;
        deduped.set(thought.filePath, thought);
    }
    return Array.from(deduped.values());
}

function dedupeTasks(tasks: TaskEntry[]): TaskEntry[] {
    const deduped = new Map<string, TaskEntry>();
    for (const task of tasks) {
        if (!task?.filePath?.trim()) continue;
        deduped.set(task.filePath, task);
    }
    return Array.from(deduped.values());
}

function registerRef<T>(map: Map<string, T>, ref: string | undefined, value: T): void {
    const normalized = ref?.trim();
    if (!normalized) return;
    map.set(normalized, value);
}

function addGroupedValue<T>(map: Map<string, Set<T>>, key: string, value: T): void {
    if (!key) return;
    const bucket = map.get(key) ?? new Set<T>();
    bucket.add(value);
    map.set(key, bucket);
}

function normalizeContextKey(context: string | undefined | null): string {
    return String(context ?? '').trim().toLowerCase();
}

function normalizeProjectKey(project: string | undefined | null): string {
    return String(project ?? '').trim().toLowerCase();
}

function describeFilters(nodeTypes: GraphBuildOptions['nodeTypes']): string {
    const active = NODE_TYPE_ORDER.filter((type) => nodeTypes[type]);
    return active.length === NODE_TYPE_ORDER.length
        ? 'All node types visible'
        : `Visible: ${active.join(', ')}`;
}

function buildEmptySnapshot(options: {
    seed: GraphExplorerSeed | null;
    maxHops: number;
    warnings: string[];
    missingSeed?: boolean;
    filterSummary: string;
}): GraphSnapshot {
    return {
        seed: options.seed,
        resolvedSeedNodeId: null,
        nodes: [],
        edges: [],
        layout: {},
        missingSeed: !!options.missingSeed,
        truncated: false,
        warnings: options.warnings,
        stats: {
            totalNodes: 0,
            visibleNodes: 0,
            totalEdges: 0,
            visibleEdges: 0,
            maxHops: options.maxHops,
            filterSummary: options.filterSummary,
        },
    };
}

function clampInteger(value: number | undefined, min: number, max: number, fallback: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, Math.round(parsed)));
}

function hashString(value: string): number {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = ((hash << 5) - hash) + value.charCodeAt(index);
        hash |= 0;
    }
    return hash;
}
