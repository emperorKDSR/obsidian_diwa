import type { ThoughtEntry } from '../types';

export class ThoughtIndex {
    private map = new Map<string, ThoughtEntry>();

    set(thoughts: ThoughtEntry[]): void {
        this.map.clear();
        for (const thought of thoughts) {
            if (!thought?.id) continue;
            this.map.set(thought.id, thought);
        }
    }

    add(thought: ThoughtEntry): void {
        if (!thought?.id) return;
        this.map.set(thought.id, thought);
    }

    update(thought: ThoughtEntry): void {
        if (!thought?.id) return;
        this.map.set(thought.id, thought);
    }

    remove(thoughtId: string): void {
        this.map.delete(thoughtId);
    }

    get(thoughtId: string): ThoughtEntry | undefined {
        return this.map.get(thoughtId);
    }

    getAll(): ThoughtEntry[] {
        return Array.from(this.map.values());
    }
}

