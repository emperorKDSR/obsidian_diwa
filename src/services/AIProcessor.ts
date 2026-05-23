import type { ThoughtEntry } from '../types';

type ThoughtIntent = 'explore' | 'analyze' | 'plan' | 'recall';

export interface ThoughtAnalysis {
    intent: ThoughtIntent;
    summary: string;
    topics: string[];
}

export interface ThoughtActionSuggestions {
    shouldCreateTask: boolean;
    improvedVersion: string | null;
    relatedIdeas: string[];
}

export interface AIProcessorConfig {
    enabled: boolean;
    model: string;
    temperature: number;
    enableSuggestions: boolean;
    enableSummaries: boolean;
}

interface ThoughtLike {
    id?: string;
    filePath?: string;
    content?: string;
    body?: string;
}

interface AICallClient {
    call(prompt: string, options?: { model?: string; temperature?: number }): Promise<string>;
}

export class AIProcessor {
    readonly api: unknown;
    config: AIProcessorConfig;
    available: boolean;

    constructor(apiClient: unknown, config: AIProcessorConfig) {
        this.api = apiClient;
        this.config = config;
        this.available = true;
    }

    async safeCall<T>(fn: () => Promise<T>, fallback: () => T | Promise<T>): Promise<T> {
        try {
            return await fn();
        } catch (e) {
            console.warn('AI unavailable:', e);
            this.available = false;
            return await fallback();
        }
    }

    async analyzeThought(content: string): Promise<ThoughtAnalysis> {
        return this.safeCall(
            async () => {
                const prompt = `
      Analyze this thought and return JSON:

      {
        "intent": "explore | analyze | plan | recall",
        "summary": "short summary",
        "topics": ["topic1", "topic2"]
      }

      Thought:
      ${content}
      `;

                const client = this.api as Partial<AICallClient>;
                if (typeof client.call !== 'function') {
                    throw new Error('AI client does not implement call(prompt)');
                }

                const response = await client.call(prompt, {
                    model: this.config.model,
                    temperature: this.config.temperature,
                });
                return JSON.parse(response) as ThoughtAnalysis;
            },
            () => ({
                intent: 'explore',
                summary: content.slice(0, 100),
                topics: [],
            }),
        );
    }

    async suggestActions(thought: ThoughtLike): Promise<ThoughtActionSuggestions> {
        return this.safeCall(
            async () => {
                const prompt = `
      Suggest actions for this thought.
      Return JSON:

      {
        "shouldCreateTask": true/false,
        "improvedVersion": "refined thought",
        "relatedIdeas": ["idea1", "idea2"]
      }

      Thought:
      ${thought.content || thought.body || ''}
      `;

                const client = this.api as Partial<AICallClient>;
                if (typeof client.call !== 'function') {
                    throw new Error('AI client does not implement call(prompt)');
                }

                const res = await client.call(prompt, {
                    model: this.config.model,
                    temperature: this.config.temperature,
                });
                return JSON.parse(res) as ThoughtActionSuggestions;
            },
            () => ({
                shouldCreateTask: false,
                improvedVersion: null,
                relatedIdeas: [],
            }),
        );
    }

    async findRelatedThoughts(
        thought: ThoughtLike,
        allThoughts: ThoughtEntry[],
        ruleBasedFindRelated?: (target: ThoughtLike) => ThoughtEntry[],
    ): Promise<ThoughtEntry[]> {
        return this.safeCall(
            async () => {
                const sourceId = thought.id || thought.filePath || '';
                const candidates = allThoughts
                    .filter((entry) => (entry.id || entry.filePath) !== sourceId)
                    .slice(0, 20);

                const formatted = candidates
                    .map((entry, index) => `${index + 1}. ${entry.content || entry.body || entry.title || entry.filePath}`)
                    .join('\n');

                const prompt = `
      Given the main thought and list of candidate thoughts, return the 5 most semantically related thoughts.

      Return JSON:
      {
        "indexes": [numbers]
      }

      MAIN THOUGHT:
      ${thought.content || thought.body || ''}

      CANDIDATES:
      ${formatted}
      `;

                const client = this.api as Partial<AICallClient>;
                if (typeof client.call !== 'function') {
                    throw new Error('AI client does not implement call(prompt)');
                }

                const response = await client.call(prompt, {
                    model: this.config.model,
                    temperature: this.config.temperature,
                });
                const parsed = JSON.parse(response) as { indexes?: number[] };
                const indexes = Array.isArray(parsed.indexes) ? parsed.indexes : [];

                return indexes
                    .map((index) => Number(index))
                    .filter((index) => Number.isInteger(index) && index > 0 && index <= candidates.length)
                    .map((index) => candidates[index - 1])
                    .filter((entry): entry is ThoughtEntry => !!entry)
                    .slice(0, 5);
            },
            () => (ruleBasedFindRelated ? ruleBasedFindRelated(thought).slice(0, 5) : []),
        );
    }
}
