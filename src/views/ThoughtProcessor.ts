import type { ThoughtEntry } from '../types';
import type { AIProcessor } from '../services/AIProcessor';
import type { ThoughtController } from './ThoughtController';

export interface ThoughtCluster {
    label: string;
    thoughts: ThoughtEntry[];
}

export class ThoughtProcessor {
    private ai: AIProcessor | null;
    private shouldUseAI: () => boolean;

    constructor(
        private controller: ThoughtController,
        aiProcessor: AIProcessor | null,
        shouldUseAI?: () => boolean,
    ) {
        this.ai = aiProcessor;
        this.shouldUseAI = shouldUseAI ?? (() => !!this.ai?.available);
    }

    score(thought: ThoughtEntry): number {
        return (
            (thought.links?.tasks?.length || 0) * 3
            + (thought.links?.thoughts?.length || 0) * 2
            + (thought.wikilinks?.length || 0) * 2
            + (thought.pinned ? 5 : 0)
        );
    }

    getTopThoughts(limit = 10): ThoughtEntry[] {
        return this.controller.getAllThoughts()
            .filter((thought) => !thought.archived)
            .sort((left, right) => this.score(right) - this.score(left))
            .slice(0, limit);
    }

    ruleBasedFindRelated(thought: ThoughtEntry): ThoughtEntry[] {
        const sourceId = thought.id ?? thought.filePath;
        const sourceWikilinks = thought.wikilinks ?? [];
        return this.controller.getAllThoughts().filter((candidate) =>
            (candidate.id ?? candidate.filePath) !== sourceId
            && (
                candidate.wikilinks?.some((wikilink) => sourceWikilinks.includes(wikilink))
                || candidate.links?.thoughts?.includes(sourceId)
            ),
        ).slice(0, 5);
    }

    async findRelated(thought: ThoughtEntry): Promise<ThoughtEntry[]> {
        const result = await this.findRelatedWithMeta(thought);
        return result.thoughts;
    }

    async findRelatedWithMeta(thought: ThoughtEntry): Promise<{ thoughts: ThoughtEntry[]; usedAI: boolean }> {
        if (this.ai && this.ai.available && this.shouldUseAI()) {
            const thoughts = await this.ai.findRelatedThoughts(
                thought,
                this.controller.getAllThoughts(),
            );
            const usedAI = !!this.ai.available;
            if (!usedAI) return { thoughts: this.ruleBasedFindRelated(thought), usedAI: false };
            return { thoughts, usedAI: true };
        }

        return { thoughts: this.ruleBasedFindRelated(thought), usedAI: false };
    }

    recall(thought: ThoughtEntry): ThoughtEntry[] {
        const source = this.controller.getThought(thought.id || thought.filePath) ?? thought;
        const sourceId = source.id || source.filePath;
        return this.controller.getAllThoughts()
            .filter((candidate) => (candidate.id || candidate.filePath) !== sourceId)
            .filter((candidate) => (candidate.wikilinks || []).some((link) => (source.wikilinks || []).includes(link)))
            .slice(0, 5);
    }

    suggestTask(thought: ThoughtEntry): boolean {
        const content = (thought.content || thought.body || '').trim();
        if (content.length > 40 && (thought.links?.tasks?.length || 0) === 0) return true;
        return false;
    }

    async suggestLinks(thought: ThoughtEntry): Promise<ThoughtEntry[]> {
        const related = await this.findRelated(thought);
        return related.slice(0, 3);
    }

    async detectIntent(thought: ThoughtEntry): Promise<'explore' | 'analyze' | 'plan' | 'recall'> {
        if (this.ai && this.shouldUseAI()) {
            const result = await this.ai.analyzeThought(thought.content || thought.body || '');
            return result.intent;
        }
        return this.ruleBasedDetectIntent(thought);
    }

    ruleBasedDetectIntent(thought: ThoughtEntry): 'explore' | 'analyze' | 'plan' | 'recall' {
        const content = `${thought.content || thought.body || ''}`.toLowerCase();
        if (
            /\b(plan|roadmap|timeline|steps|next step|schedule|todo|to-do|milestone)\b/.test(content)
            || (thought.links?.tasks?.length || 0) > 0
        ) return 'plan';
        if (
            /\b(remember|recall|previous|past|again|history|before)\b/.test(content)
            || (thought.wikilinks?.length || 0) > 0
        ) return 'recall';
        if (/\b(why|because|analy[sz]e|evaluate|compare|tradeoff|pros|cons|impact)\b/.test(content)) return 'analyze';
        return 'explore';
    }

    async getNextBestThought(currentThought: ThoughtEntry): Promise<ThoughtEntry | null> {
        const related = await this.findRelated(currentThought);
        if (related.length > 0) {
            return related.sort((left, right) => this.score(right) - this.score(left))[0] ?? null;
        }
        return this.getTopThoughts(1)[0] ?? null;
    }

    clusterThoughts(): ThoughtCluster[] {
        const thoughts = this.controller.getAllThoughts();
        const clusters: Record<string, ThoughtEntry[]> = {};
        for (const thought of thoughts) {
            for (const wikilink of thought.wikilinks || []) {
                if (!clusters[wikilink]) clusters[wikilink] = [];
                clusters[wikilink].push(thought);
            }
        }
        return Object.entries(clusters)
            .map(([label, items]) => ({ label, thoughts: items }))
            .filter((cluster) => cluster.thoughts.length > 1);
    }

    getClusterSuggestions(currentThought: ThoughtEntry): ThoughtCluster[] {
        const clusters = this.clusterThoughts();
        const sourceId = currentThought.id || currentThought.filePath;
        return clusters.filter((cluster) => cluster.thoughts.some((thought) => (thought.id || thought.filePath) === sourceId));
    }
}
