import type { ProjectEntry, TaskEntry, ThoughtEntry } from '../types';

export type GraphExplorerSeedType = 'thought' | 'task';

export interface GraphExplorerSeed {
    type: GraphExplorerSeedType;
    id: string;
}

export type GraphNodeType = 'thought' | 'task' | 'project' | 'context';
export type GraphEdgeType = 'related' | 'source' | 'reflect' | 'project' | 'context';

export interface GraphNodeMetaItem {
    label: string;
    value: string;
}

export interface GraphNode {
    id: string;
    type: GraphNodeType;
    ref: string;
    label: string;
    subtitle: string;
    hop: number;
    isSeed: boolean;
    filePath?: string;
    projectKey?: string;
    contextKey?: string;
    body?: string;
    metadata: GraphNodeMetaItem[];
    thought?: ThoughtEntry;
    task?: TaskEntry;
    project?: ProjectEntry;
}

export interface GraphEdge {
    id: string;
    source: string;
    target: string;
    type: GraphEdgeType;
    hop: number;
}

export interface GraphLayoutPoint {
    x: number;
    y: number;
}

export interface GraphSnapshot {
    seed: GraphExplorerSeed | null;
    resolvedSeedNodeId: string | null;
    nodes: GraphNode[];
    edges: GraphEdge[];
    layout: Record<string, GraphLayoutPoint>;
    missingSeed: boolean;
    truncated: boolean;
    warnings: string[];
    stats: {
        totalNodes: number;
        visibleNodes: number;
        totalEdges: number;
        visibleEdges: number;
        maxHops: number;
        filterSummary: string;
    };
}

export interface GraphNodeTypeFilters {
    thought: boolean;
    task: boolean;
    project: boolean;
    context: boolean;
}

export interface GraphBuildOptions {
    maxHops: number;
    nodeTypes: GraphNodeTypeFilters;
    nodeCap?: number;
    edgeCap?: number;
    perNodeCap?: number;
}

export interface GraphCompilerSource {
    thoughts: Map<string, ThoughtEntry>;
    tasks: Map<string, TaskEntry>;
    projects: Map<string, ProjectEntry>;
}

export interface GraphExplorerViewState {
    seed?: GraphExplorerSeed | null;
    selectedNodeId?: string | null;
    maxHops?: number;
    nodeTypes?: Partial<GraphNodeTypeFilters>;
    zoom?: number;
}

export const DEFAULT_GRAPH_NODE_TYPES: GraphNodeTypeFilters = {
    thought: true,
    task: true,
    project: true,
    context: true,
};
