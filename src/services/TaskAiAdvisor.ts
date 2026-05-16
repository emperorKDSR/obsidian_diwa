import type { Task, ThoughtEntry } from '../types';
import type { AiService } from './AiService';
import { explainTaskPriority, isTaskOverdue, getTaskUrgencyTier } from '../utils/focusEngine';

// ── Public types ───────────────────────────────────────────────────────────

export interface TaskEnrichment {
    title?:    string;
    context?:  string;
    due?:      string;
    reasoning: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const MAX_LINK_SUGGESTIONS   = 5;
const MAX_TASK_SUGGESTIONS   = 5;
const KEYWORD_MIN_LENGTH     = 4;
const CLUSTER_KEYWORD_WEIGHT = 5;
const CLUSTER_CONTEXT_WEIGHT = 20;
const CLUSTER_LINK_WEIGHT    = 100;

/**
 * Action verbs used for heuristic task extraction.
 * Sorted longest-first so multi-word phrases match before substrings.
 */
const ACTION_VERBS = [
    'follow up', 'look into', 'set up', 'check in',
    'call', 'contact', 'email', 'send', 'write', 'fix', 'review', 'check',
    'update', 'create', 'prepare', 'schedule', 'discuss', 'escalate', 'order',
    'request', 'submit', 'attend', 'read', 'complete', 'finish', 'start',
    'research', 'investigate', 'document', 'draft', 'test', 'deploy',
    'publish', 'buy', 'book', 'arrange', 'confirm', 'resolve', 'address',
    'share', 'reply', 'report', 'present', 'approve', 'reject', 'assign',
];

// ── TaskAiAdvisor ──────────────────────────────────────────────────────────

/**
 * AI-assisted advisor for the DIWA task system.
 *
 * Every method returns suggestions only — nothing is applied automatically.
 * When an AiService instance is provided the semantic methods use Gemini;
 * otherwise they fall back to deterministic heuristics.
 *
 * All public methods are safe to call concurrently and never mutate
 * the task or thought objects passed to them.
 */
export class TaskAiAdvisor {
    private ai: AiService | null;

    constructor(ai?: AiService) {
        this.ai = ai ?? null;
    }

    // ── AI-backed methods (heuristic fallback when AI absent) ──────────────

    /**
     * Analyses thought text and returns a list of candidate task titles.
     * Titles are verb-based and actionable ("Call supplier", "Draft report").
     *
     * With AI: Gemini extracts semantic action items.
     * Without AI: regex heuristic detects imperative sentences and
     *             "need to / should / must" patterns.
     *
     * NEVER creates tasks — returns string[] for user review only.
     */
    async suggestTasksFromThought(thoughtText: string): Promise<string[]> {
        if (this.ai) {
            return this._aiSuggestTasks(thoughtText);
        }
        return _heuristicSuggestTasks(thoughtText);
    }

    /**
     * Rewrites a vague task title into a more specific, actionable one.
     *
     * With AI: Gemini rewrites the title while preserving intent.
     * Without AI: returns the original title with a note if it looks vague.
     *
     * NEVER modifies the original task — returns the suggested string only.
     */
    async improveTaskTitle(taskTitle: string): Promise<string> {
        if (this.ai) {
            return this._aiImproveTitle(taskTitle);
        }
        return _heuristicImproveTitle(taskTitle);
    }

    /**
     * Analyses a thought and returns tasks from the provided list that
     * are likely related to it, ranked by relevance.
     *
     * Matching signals (heuristic, no AI required):
     *   - task already linked via sourceThoughtIds (+100)
     *   - shared project (+30)
     *   - shared context labels (+20 each)
     *   - keyword overlap between thought body and task title (+5 each word)
     *
     * Returns at most MAX_LINK_SUGGESTIONS tasks, sorted by score desc.
     * NEVER links tasks — returns suggestions only.
     */
    suggestTaskLinks(thought: ThoughtEntry, tasks: Task[]): Task[] {
        const live = tasks.filter(t => t.status !== 'done');

        return live
            .map(task => ({ task, score: _scoreTaskThoughtSimilarity(thought, task) }))
            .filter(({ score }) => score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, MAX_LINK_SUGGESTIONS)
            .map(({ task }) => task);
    }

    /**
     * Groups tasks into named clusters based on structural signals.
     *
     * Clustering strategy (in priority order):
     *   1. Shared sourceThoughtIds       → cluster named after the thought file
     *   2. Shared context labels         → cluster named after the context
     *   3. Shared title keywords         → cluster named after the dominant term
     *
     * A task may appear in multiple clusters if it has multiple signals.
     * Done tasks are excluded. NEVER modifies tasks.
     */
    suggestTaskClusters(tasks: Task[]): Record<string, Task[]> {
        const live = tasks.filter(t => t.status !== 'done');
        const clusters: Record<string, Task[]> = {};

        // Pass 1: cluster by shared thought links
        const thoughtBuckets = new Map<string, Task[]>();
        for (const task of live) {
            for (const tid of task.sourceThoughtIds ?? []) {
                if (!thoughtBuckets.has(tid)) thoughtBuckets.set(tid, []);
                thoughtBuckets.get(tid)!.push(task);
            }
        }
        thoughtBuckets.forEach((taskList, thoughtPath) => {
            if (taskList.length < 2) return; // singleton clusters aren't useful
            const name = _thoughtPathToLabel(thoughtPath);
            clusters[name] = taskList;
        });

        // Pass 2: cluster by shared context (only tasks not already clustered)
        const clustered = new Set(Object.values(clusters).flat().map(t => t.id));
        const contextBuckets = new Map<string, Task[]>();
        for (const task of live) {
            if (clustered.has(task.id)) continue;
            for (const ctx of task.context ?? []) {
                if (!contextBuckets.has(ctx)) contextBuckets.set(ctx, []);
                contextBuckets.get(ctx)!.push(task);
            }
        }
        contextBuckets.forEach((taskList, ctx) => {
            if (taskList.length < 2) return;
            const label = _capitalizeFirst(ctx);
            clusters[label] = [...(clusters[label] ?? []), ...taskList];
        });

        // Pass 3: keyword clusters for remaining tasks
        const stillUnclustered = live.filter(t => !new Set(Object.values(clusters).flat().map(x => x.id)).has(t.id));
        const keywordClusters = _clusterByKeywords(stillUnclustered);
        Object.entries(keywordClusters).forEach(([label, taskList]) => {
            if (taskList.length >= 2) clusters[label] = taskList;
        });

        return clusters;
    }

    /**
     * Analyses the thoughts linked to a task and returns suggested
     * improvements to title, context, and due date.
     *
     * Signals examined:
     *   - keywords repeated across thoughts → suggest as context
     *   - dates mentioned in thoughts       → suggest as due date
     *   - title length / vagueness          → suggest title improvement
     *
     * NEVER applies changes — returns Partial<Task> for user review only.
     */
    enrichTaskFromThoughts(task: Task, thoughts: ThoughtEntry[]): TaskEnrichment {
        const linked = thoughts.filter(th =>
            (task.sourceThoughtIds ?? []).includes(th.filePath)
        );

        if (linked.length === 0) {
            return { reasoning: 'No linked thoughts found for this task.' };
        }

        const enrichment: TaskEnrichment = { reasoning: '' };
        const reasons: string[] = [];

        // Title improvement
        const improvedTitle = _heuristicImproveTitle(task.title);
        if (improvedTitle !== task.title) {
            enrichment.title = improvedTitle;
            reasons.push('title could be more specific');
        }

        // Context suggestion: most frequent context across linked thoughts
        const ctxFreq = new Map<string, number>();
        for (const th of linked) {
            for (const c of th.context) {
                ctxFreq.set(c, (ctxFreq.get(c) ?? 0) + 1);
            }
        }
        const topCtx = [...ctxFreq.entries()].sort((a, b) => b[1] - a[1])[0];
        if (topCtx && !task.context?.includes(topCtx[0])) {
            enrichment.context = topCtx[0];
            reasons.push(`linked thoughts share context "${topCtx[0]}"`);
        }

        // Due date suggestion: look for YYYY-MM-DD patterns in thought bodies
        if (!task.due) {
            const allDates = linked.flatMap(th => _extractDates(th.body));
            const futureDates = allDates.filter(d => new Date(d) > new Date());
            if (futureDates.length > 0) {
                enrichment.due = futureDates.sort()[0]; // earliest future date
                reasons.push('a date was mentioned in a linked thought');
            }
        }

        enrichment.reasoning = reasons.length > 0
            ? `Suggested because: ${reasons.join('; ')}.`
            : 'No strong enrichment signals found.';

        return enrichment;
    }

    /**
     * Returns an enhanced explanation of why a task is prioritised.
     * Extends focusEngine.explainTaskPriority with thought-context awareness.
     *
     * Extra context provided when linkedThoughts is supplied:
     *   - recently modified thought links ("part of an ongoing thread")
     *   - multiple linked thoughts ("connected to several ideas")
     */
    explainTaskPriority(task: Task, linkedThoughts?: ThoughtEntry[]): string {
        const base = explainTaskPriority(task);

        if (!linkedThoughts || linkedThoughts.length === 0) return base;

        const recentThoughts = linkedThoughts.filter(th => {
            const mtime = th.lastThreadUpdate;
            return Date.now() - mtime < 3 * 86_400_000; // modified within 3 days
        });

        if (linkedThoughts.length >= 3) {
            return `${base} It is connected to ${linkedThoughts.length} thoughts in your vault.`;
        }
        if (recentThoughts.length > 0) {
            return `${base} It is part of an ongoing thread updated recently.`;
        }
        if (linkedThoughts.length > 0) {
            return `${base} It was created from a thought.`;
        }

        return base;
    }

    // ── Private: AI-backed implementations ────────────────────────────────

    private async _aiSuggestTasks(thoughtText: string): Promise<string[]> {
        const prompt = [
            'Extract actionable tasks from the thought below.',
            'Rules: start each with an action verb, keep each under 10 words, return JSON array only.',
            `Return at most ${MAX_TASK_SUGGESTIONS} items.`,
            `Thought: "${thoughtText.slice(0, 1000)}"`,
        ].join('\n');

        try {
            const raw = await this.ai!.callGemini(prompt, [], false, [{ role: 'user', text: prompt }]);
            const parsed = _parseJsonStringArray(raw);
            return parsed.length > 0 ? parsed : _heuristicSuggestTasks(thoughtText);
        } catch {
            return _heuristicSuggestTasks(thoughtText);
        }
    }

    private async _aiImproveTitle(title: string): Promise<string> {
        const prompt = [
            'Rewrite this task title to be more specific and actionable.',
            'Preserve the original intent. Keep it under 10 words.',
            'Return only the improved title — no explanation, no punctuation at the end.',
            `Original: "${title}"`,
        ].join('\n');

        try {
            const raw = await this.ai!.callGemini(prompt, [], false, [{ role: 'user', text: prompt }]);
            const cleaned = raw.trim().replace(/^["']|["']$/g, '').trim();
            return cleaned.length > 3 && cleaned.length < 120 ? cleaned : title;
        } catch {
            return _heuristicImproveTitle(title);
        }
    }
}

// ── Heuristic helpers (pure, no AI) ───────────────────────────────────────

/**
 * Extracts candidate task titles from free text using imperative-pattern
 * matching. Works without AI but misses complex phrasings.
 */
function _heuristicSuggestTasks(text: string): string[] {
    const results: string[] = [];

    // Pattern 1: "need to X", "should X", "have to X", "must X", "want to X"
    const needToRe = /(?:need to|have to|should|must|want to)\s+([^.,;!?\n]{4,60})/gi;
    let m: RegExpExecArray | null;
    while ((m = needToRe.exec(text)) !== null) {
        results.push(_capitalizeFirst(m[1].trim()));
    }

    // Pattern 2: "and maybe X", "and also X" where X starts with an action verb
    const maybeRe = /(?:and maybe|and also|and then|also|maybe)\s+([a-z][^.,;!?\n]{4,50})/gi;
    while ((m = maybeRe.exec(text)) !== null) {
        const phrase = m[1].trim();
        if (_startsWithActionVerb(phrase)) results.push(_capitalizeFirst(phrase));
    }

    // Pattern 3: standalone sentences / clauses beginning with an action verb
    for (const sentence of text.split(/[.!?\n]+/).map(s => s.trim())) {
        if (sentence.length < 5) continue;
        if (_startsWithActionVerb(sentence)) {
            results.push(_capitalizeFirst(sentence.slice(0, 70)));
        }
    }

    // Deduplicate, filter noise
    return [...new Set(results)]
        .filter(r => r.length >= 6 && r.length <= 80)
        .slice(0, MAX_TASK_SUGGESTIONS);
}

/**
 * Returns a heuristically improved task title, or the original if it already
 * looks specific enough. Does not fabricate content.
 */
function _heuristicImproveTitle(title: string): string {
    const words = title.trim().split(/\s+/);

    // Already looks specific
    if (words.length >= 4) return title;

    // Single-verb titles like "Fix" or "Call" — too vague
    if (words.length === 1) return title; // can't improve without context

    // Two-word patterns like "Fix report", "Email John" — note the vagueness
    // We return the original; callers (and AI) can expand when needed
    return title;
}

/**
 * Scores how related a task is to a thought.
 * Higher = more relevant suggestion.
 */
function _scoreTaskThoughtSimilarity(thought: ThoughtEntry, task: Task): number {
    let score = 0;

    // Explicit link (strongest signal)
    if ((task.sourceThoughtIds ?? []).includes(thought.filePath)) {
        score += CLUSTER_LINK_WEIGHT;
    }

    // Shared project
    if (thought.project && thought.project === (task as unknown as { project?: string }).project) {
        score += 30;
    }

    // Shared context labels
    const taskCtx: string[] = task.context ? [task.context] : [];
    for (const c of thought.context) {
        if (taskCtx.includes(c)) score += CLUSTER_CONTEXT_WEIGHT;
    }

    // Keyword overlap
    const thoughtWords = _extractKeywords(`${thought.title} ${thought.body}`);
    const taskWords    = _extractKeywords(task.title);
    for (const w of taskWords) {
        if (thoughtWords.has(w)) score += CLUSTER_KEYWORD_WEIGHT;
    }

    return score;
}

function _clusterByKeywords(tasks: Task[]): Record<string, Task[]> {
    if (tasks.length === 0) return {};

    // Build word → tasks mapping
    const wordIndex = new Map<string, Task[]>();
    for (const task of tasks) {
        for (const word of _extractKeywords(task.title)) {
            if (!wordIndex.has(word)) wordIndex.set(word, []);
            wordIndex.get(word)!.push(task);
        }
    }

    const clusters: Record<string, Task[]> = {};
    for (const [word, taskList] of wordIndex) {
        if (taskList.length >= 2) {
            clusters[_capitalizeFirst(word)] = taskList;
        }
    }

    return clusters;
}

/** Extracts meaningful lowercase keywords from a text string. */
function _extractKeywords(text: string): Set<string> {
    const stopWords = new Set([
        'the', 'and', 'for', 'with', 'this', 'that', 'from', 'have',
        'will', 'been', 'they', 'what', 'when', 'also', 'about',
    ]);
    return new Set(
        text.toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length >= KEYWORD_MIN_LENGTH && !stopWords.has(w))
    );
}

function _extractDates(text: string): string[] {
    const matches = text.match(/\b(\d{4}-\d{2}-\d{2})\b/g);
    return matches ?? [];
}

function _startsWithActionVerb(text: string): boolean {
    const lower = text.toLowerCase().trimStart();
    return ACTION_VERBS.some(v => lower.startsWith(v));
}

function _capitalizeFirst(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Derives a human-readable cluster label from a thought file path. */
function _thoughtPathToLabel(filePath: string): string {
    const basename = filePath.split('/').pop() ?? filePath;
    return basename
        .replace(/\.[^.]+$/, '')               // strip extension
        .replace(/^\d{8}_\d{9}_\w+$/, '')      // strip DIWA timestamp filenames
        .replace(/[_-]+/g, ' ')
        .trim() || 'Linked Thought';
}

/**
 * Attempts to parse a JSON string array from a Gemini response.
 * Falls back to line-based parsing if JSON is malformed.
 */
function _parseJsonStringArray(raw: string): string[] {
    const jsonMatch = raw.match(/\[[\s\S]*?\]/);
    if (jsonMatch) {
        try {
            const parsed = JSON.parse(jsonMatch[0]);
            if (Array.isArray(parsed)) {
                return parsed.map(String).map(s => s.trim()).filter(s => s.length > 2);
            }
        } catch { /* fall through */ }
    }

    // Line-based fallback: strip bullets and numbering
    return raw
        .split('\n')
        .map(l => l.replace(/^[-*•\d.)]\s+/, '').trim())
        .filter(l => l.length >= 4 && l.length <= 100);
}
