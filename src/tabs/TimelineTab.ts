import { moment, MarkdownRenderer, setIcon, Platform } from 'obsidian';
import type { DiwaView } from '../view';
import { BaseTab } from "./BaseTab";
import { EditEntryModal } from '../modals/EditEntryModal';
import { ConfirmModal } from '../modals/ConfirmModal';
import { parseContextString } from '../utils';

export class TimelineTab extends BaseTab {
    private container: HTMLElement;
    private feedEl: HTMLElement | null = null;
    private headerEl: HTMLElement | null = null;
    private loadedDates = new Set<string>();
    private isLoading = false;
    private dayObserver: IntersectionObserver | null = null;
    private sentinelObserver: IntersectionObserver | null = null;

    // Search state
    private isSearchMode = false;
    private _searchQuery = '';
    private _searchHintEl: HTMLElement | null = null;
    private _searchDebounce: ReturnType<typeof setTimeout> | null = null;
    private _renderGen = 0;

    constructor(view: DiwaView) { super(view); }

    render(container: HTMLElement) {
        this.container = container;
        // Ensure the container has a fixed height so the inner flex layout
        // can constrain the feed scroll area and keep the header frozen.
        container.style.height = '100%';
        container.style.overflow = 'hidden';
        this.initTimeline();
    }

    // ── Init ───────────────────────────────────────────────────────────────
    private async initTimeline() {
        this.teardown();
        this.container.empty();
        this.loadedDates.clear();
        this.isLoading = false;

        const gen = ++this._renderGen;

        const wrap = this.container.createEl('div', { cls: 'diwa-tl-wrap' });

        this.headerEl = wrap.createEl('div', { cls: 'diwa-tl-header-slot' });
        this.renderSpotlightHeader(this.headerEl);

        this.feedEl = wrap.createEl('div', { cls: 'diwa-tl-feed' });

        // If we just returned from search mode, skip loading the infinite feed
        if (this.isSearchMode) {
            this._runSearch(this._searchQuery, gen);
            return;
        }

        const topSentinel = this.feedEl.createEl('div', { cls: 'diwa-tl-sentinel diwa-tl-sentinel--top' });

        const selected = moment(this.view.timelineSelectedDate, 'YYYY-MM-DD');
        for (let o = -1; o <= 2; o++) {
            if (gen !== this._renderGen) return;
            await this.appendDaySection(selected.clone().add(o, 'days'));
        }

        if (gen !== this._renderGen) return;
        this.feedEl.createEl('div', { cls: 'diwa-tl-sentinel diwa-tl-sentinel--bottom' });

        setTimeout(() => {
            if (gen !== this._renderGen || !this.feedEl) return;
            const target = this.feedEl.querySelector<HTMLElement>(`[data-date="${this.view.timelineSelectedDate}"]`);
            if (target) this.feedEl.scrollTop = target.offsetTop - 4;
        }, 20);

        this.setupInfiniteScroll(topSentinel);
        this.setupActiveDayObserver();
    }

    private teardown() {
        this.dayObserver?.disconnect();
        this.sentinelObserver?.disconnect();
        this.dayObserver = null;
        this.sentinelObserver = null;
        if (this._searchDebounce) { clearTimeout(this._searchDebounce); this._searchDebounce = null; }
    }

    // ── Navigate ───────────────────────────────────────────────────────────
    private navigateToDate(dateStr: string) {
        this.view.timelineSelectedDate = dateStr;
        if (this.headerEl) {
            this.headerEl.empty();
            this.renderSpotlightHeader(this.headerEl);
        }
        if (this.loadedDates.has(dateStr) && this.feedEl) {
            const target = this.feedEl.querySelector<HTMLElement>(`[data-date="${dateStr}"]`);
            if (target) target.scrollIntoView({ block: 'start', behavior: 'smooth' });
        } else {
            this.initTimeline();
        }
    }

    // ── Search entry / exit ────────────────────────────────────────────────
    private _enterSearch() {
        this.isSearchMode = true;
        this._searchQuery = '';
        if (this.headerEl) { this.headerEl.empty(); this.renderSpotlightHeader(this.headerEl); }
        if (this.feedEl) {
            this.teardown();
            const gen = ++this._renderGen;
            this._runSearch('', gen);
        }
    }

    private _exitSearch() {
        this.isSearchMode = false;
        this._searchQuery = '';
        this._searchHintEl = null;
        if (this._searchDebounce) { clearTimeout(this._searchDebounce); this._searchDebounce = null; }
        this.initTimeline();
    }

    /** After an edit/delete in search mode, re-run the search to reflect changes. */
    private _refreshFeed() {
        if (this.isSearchMode) {
            const gen = ++this._renderGen;
            if (this.feedEl) this._runSearch(this._searchQuery, gen);
        } else {
            this.initTimeline();
        }
    }

    // ── Spotlight Header Carousel ──────────────────────────────────────────
    private renderSpotlightHeader(parent: HTMLElement) {
        const header = parent.createEl('div', { cls: 'diwa-tl-header' });
        // The header is frozen inside view-content which already starts below
        // Obsidian's mobile nav bar — override the 52px CSS rule with standard padding.
        if (Platform.isMobile) header.style.paddingTop = '0px';

        const topBar = header.createEl('div', { cls: 'diwa-tl-header-bar' });
        topBar.createEl('span', { text: 'TIMELINE', cls: 'diwa-tl-title' });

        const searchBtn = topBar.createEl('button', {
            cls: `diwa-tl-search-btn${this.isSearchMode ? ' is-active' : ''}`,
            attr: { title: 'Search' }
        });
        setIcon(searchBtn, 'lucide-search');
        searchBtn.addEventListener('click', () => {
            if (this.isSearchMode) this._exitSearch();
            else this._enterSearch();
        });

        const fab = topBar.createEl('button', { cls: 'diwa-tl-capture-fab', attr: { title: 'Capture new thought' } });
        setIcon(fab.createDiv({ cls: 'diwa-tl-fab-icon' }), 'lucide-plus');
        fab.createEl('span', { text: 'NEW', cls: 'diwa-tl-fab-label' });
        fab.addEventListener('click', () => this.openCapture());

        if (this.isSearchMode) {
            this._renderSearchBar(header);
        } else {
            const activityDates = new Set<string>([
                ...Array.from(this.index.thoughtIndex.values()).map(t => t.day),
                ...Array.from(this.index.taskIndex.values()).map(t => t.day),
            ]);

            const selectedMoment = moment(this.view.timelineSelectedDate, 'YYYY-MM-DD');
            const spotlightRow = header.createEl('div', { cls: 'diwa-tl-spotlight-row' });

            const prevBtn = spotlightRow.createEl('button', { cls: 'diwa-tl-nav-btn', attr: { title: 'Previous day' } });
            setIcon(prevBtn, 'lucide-chevron-left');
            prevBtn.addEventListener('click', () =>
                this.navigateToDate(selectedMoment.clone().subtract(1, 'day').format('YYYY-MM-DD')));

            const track = spotlightRow.createEl('div', { cls: 'diwa-tl-spotlight-track' });

            for (let offset = -2; offset <= 2; offset++) {
                const date = selectedMoment.clone().add(offset, 'days');
                const dateStr = date.format('YYYY-MM-DD');
                const isSpotlight = offset === 0;
                const isToday = date.isSame(moment(), 'day');
                const hasActivity = activityDates.has(dateStr);
                const distCls = isSpotlight ? 'is-spotlight' : Math.abs(offset) === 1 ? 'is-near' : 'is-far';

                const item = track.createEl('div', {
                    cls: ['diwa-tl-date-item', distCls, isToday ? 'is-today' : ''].filter(Boolean).join(' ')
                });
                item.createSpan({ text: isToday ? 'TODAY' : date.format('ddd').toUpperCase(), cls: 'diwa-tl-date-dow' });
                item.createSpan({ text: date.format('D'), cls: 'diwa-tl-date-num' });
                item.createSpan({ text: date.format('MMM').toUpperCase(), cls: 'diwa-tl-date-mon' });
                if (hasActivity) item.createDiv({ cls: 'diwa-tl-date-dot' });
                if (!isSpotlight) item.addEventListener('click', () => this.navigateToDate(dateStr));
            }

            this.setupSwipeNavigation(track, selectedMoment);

            const nextBtn = spotlightRow.createEl('button', { cls: 'diwa-tl-nav-btn', attr: { title: 'Next day' } });
            setIcon(nextBtn, 'lucide-chevron-right');
            nextBtn.addEventListener('click', () =>
                this.navigateToDate(selectedMoment.clone().add(1, 'day').format('YYYY-MM-DD')));

            header.createEl('div', {
                text: selectedMoment.format('dddd, MMMM D · YYYY').toUpperCase(),
                cls: 'diwa-tl-spotlight-subtitle'
            });
        }
    }

    // ── Search Bar ─────────────────────────────────────────────────────────
    private _renderSearchBar(parent: HTMLElement) {
        const bar = parent.createEl('div', { cls: 'diwa-tl-search-bar' });
        const input = bar.createEl('input', {
            cls: 'diwa-tl-search-input',
            attr: { type: 'text', placeholder: 'Search… (use "and" / "or" for multi-criteria)' }
        }) as HTMLInputElement;
        (input as HTMLInputElement).value = this._searchQuery;

        const clearBtn = bar.createEl('button', { cls: 'diwa-tl-search-close', attr: { title: 'Clear search' } });
        setIcon(clearBtn, 'lucide-x');
        clearBtn.style.opacity = this._searchQuery ? '1' : '0';
        clearBtn.style.pointerEvents = this._searchQuery ? 'auto' : 'none';

        this._searchHintEl = parent.createEl('div', { cls: 'diwa-tl-search-hint' });
        this._updateSearchHint(this._searchQuery, null);

        input.addEventListener('input', () => {
            this._searchQuery = input.value;
            clearBtn.style.opacity = input.value ? '1' : '0';
            clearBtn.style.pointerEvents = input.value ? 'auto' : 'none';
            if (this._searchDebounce) clearTimeout(this._searchDebounce);
            this._searchDebounce = setTimeout(() => {
                const gen = ++this._renderGen;
                if (this.feedEl) this._runSearch(this._searchQuery, gen);
            }, 200);
        });

        clearBtn.addEventListener('click', () => {
            input.value = '';
            this._searchQuery = '';
            clearBtn.style.opacity = '0';
            clearBtn.style.pointerEvents = 'none';
            const gen = ++this._renderGen;
            if (this.feedEl) this._runSearch('', gen);
            input.focus();
        });

        input.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.preventDefault(); this._exitSearch(); }
        });

        setTimeout(() => input.focus(), 50);
    }

    private _updateSearchHint(query: string, count: number | null) {
        if (!this._searchHintEl?.isConnected) return;
        if (!query.trim()) {
            this._searchHintEl.textContent = '';
        } else if (count === null) {
            this._searchHintEl.textContent = '';
        } else {
            this._searchHintEl.textContent = count === 0 ? '' : `${count} result${count === 1 ? '' : 's'}`;
        }
    }

    // ── Boolean Query Parser ───────────────────────────────────────────────
    /**
     * Parses a raw query string into a 2D array:
     *   outer array = OR groups (ANY must match)
     *   inner array = AND terms (ALL must match within the group)
     *
     * Examples:
     *   "jozsef or andras"       → [["jozsef"], ["andras"]]
     *   "andras and 1:1"         → [["andras", "1:1"]]
     *   "jozsef or andras and 1:1" → [["jozsef"], ["andras", "1:1"]]
     */
    private _parseQuery(raw: string): string[][] {
        const orGroups = raw.toLowerCase().split(/\s+or\s+/);
        return orGroups
            .map(group => group.split(/\s+and\s+/).map(t => t.trim()).filter(t => t.length > 0))
            .filter(g => g.length > 0);
    }

    /** Returns true if the entry's searchable text satisfies the boolean groups. */
    private _matchesEntry(entry: any, groups: string[][]): boolean {
        const haystack = [
            (entry.title || '').toLowerCase(),
            (entry.body || '').toLowerCase(),
            ...(entry.context || []).map((c: string) => c.toLowerCase()),
        ].join(' ');
        return groups.some(andTerms => andTerms.every(term => haystack.includes(term)));
    }

    // ── Search Results Render ──────────────────────────────────────────────
    private async _runSearch(query: string, gen: number) {
        if (!this.feedEl) return;
        this.teardown();
        this.feedEl.empty();

        const q = query.trim();

        if (!q) {
            this._updateSearchHint('', null);
            this.feedEl.createEl('div', { cls: 'diwa-tl-search-empty', text: 'Type to search… (use "and" / "or" for multi-criteria)' });
            return;
        }

        const groups = this._parseQuery(q);

        // Filter: one result per file (no multi-date duplicates)
        type FeedItem = { type: 'task' | 'thought'; entry: any; day: string; time: string };
        const results: FeedItem[] = [];

        for (const t of this.index.taskIndex.values()) {
            if (this._matchesEntry(t, groups))
                results.push({ type: 'task', entry: t, day: t.day || t.due || '', time: (t.created || '').split(' ')[1] || '00:00' });
        }

        for (const t of this.index.thoughtIndex.values()) {
            if (this._matchesEntry(t, groups))
                results.push({ type: 'thought', entry: t, day: t.day || '', time: (t.created || '').split(' ')[1] || '00:00' });
        }

        // Sort by day desc, time desc
        results.sort((a, b) => {
            const dc = b.day.localeCompare(a.day);
            return dc !== 0 ? dc : b.time.localeCompare(a.time);
        });

        this._updateSearchHint(query, results.length);

        if (results.length === 0) {
            this.feedEl.createEl('div', { cls: 'diwa-tl-search-empty', text: `No results for "${query}"` });
            return;
        }

        // Group by day
        const byDay = new Map<string, FeedItem[]>();
        for (const item of results) {
            const d = item.day || '0000-00-00';
            if (!byDay.has(d)) byDay.set(d, []);
            byDay.get(d)!.push(item);
        }

        for (const [day, items] of byDay) {
            if (gen !== this._renderGen) return;
            const m = moment(day, 'YYYY-MM-DD', true);
            const isToday = m.isValid() && m.isSame(moment(), 'day');
            const label = m.isValid()
                ? (isToday ? `TODAY  ·  ${m.format('ddd, MMM D').toUpperCase()}` : m.format('ddd, MMM D · YYYY').toUpperCase())
                : 'UNDATED';

            const group = this.feedEl.createEl('div', { cls: 'diwa-tl-day-section', attr: { 'data-date': day } });
            const hdr = group.createEl('div', { cls: `diwa-tl-day-header${isToday ? ' is-today' : ''}` });
            hdr.createEl('span', { cls: 'diwa-tl-day-label', text: label });
            hdr.createEl('span', { cls: 'diwa-tl-day-count', text: String(items.length) });

            const spine = group.createEl('div', { cls: 'diwa-tl-spine-wrap' });
            for (const item of items) {
                if (gen !== this._renderGen) return;
                spine.appendChild(await this.buildEntryCard(item));
            }
        }
    }

    // ── Swipe / Drag Navigation ────────────────────────────────────────────
    private setupSwipeNavigation(track: HTMLElement, selectedMoment: moment.Moment) {
        let startX = 0;
        let startTime = 0;
        let dragging = false;

        track.addEventListener('pointerdown', (e: PointerEvent) => {
            startX = e.clientX;
            startTime = Date.now();
            dragging = true;
            track.setPointerCapture(e.pointerId);
            track.classList.add('is-dragging');
        });

        track.addEventListener('pointerup', (e: PointerEvent) => {
            if (!dragging) return;
            dragging = false;
            track.classList.remove('is-dragging');
            const deltaX = startX - e.clientX;
            const velocity = Math.abs(deltaX) / Math.max(Date.now() - startTime, 1);
            if (Math.abs(deltaX) < 25) return;
            let days = 1;
            if (velocity > 1.5) days = 4;
            else if (velocity > 0.9) days = 3;
            else if (velocity > 0.45) days = 2;
            const newDate = deltaX > 0
                ? selectedMoment.clone().add(days, 'days')
                : selectedMoment.clone().subtract(days, 'days');
            this.navigateToDate(newDate.format('YYYY-MM-DD'));
        });

        track.addEventListener('pointercancel', () => {
            dragging = false;
            track.classList.remove('is-dragging');
        });
    }

    // ── Day Section — append / prepend ─────────────────────────────────────
    private async appendDaySection(date: moment.Moment) {
        const dateStr = date.format('YYYY-MM-DD');
        if (this.loadedDates.has(dateStr) || !this.feedEl) return;
        this.loadedDates.add(dateStr);
        const section = await this.buildDaySection(date);
        const bottomSentinel = this.feedEl.querySelector('.diwa-tl-sentinel--bottom');
        if (bottomSentinel) this.feedEl.insertBefore(section, bottomSentinel);
        else this.feedEl.appendChild(section);
        this.observeDayHeader(section);
    }

    private async prependDaySection(date: moment.Moment) {
        const dateStr = date.format('YYYY-MM-DD');
        if (this.loadedDates.has(dateStr) || !this.feedEl) return;
        this.loadedDates.add(dateStr);
        const section = await this.buildDaySection(date);
        const prevScrollTop = this.feedEl.scrollTop;
        const prevHeight = this.feedEl.scrollHeight;
        const topSentinel = this.feedEl.querySelector('.diwa-tl-sentinel--top');
        if (topSentinel) topSentinel.after(section);
        else this.feedEl.insertBefore(section, this.feedEl.firstChild);
        this.feedEl.scrollTop = prevScrollTop + (this.feedEl.scrollHeight - prevHeight);
        this.observeDayHeader(section);
    }

    private observeDayHeader(section: HTMLElement) {
        const hdr = section.querySelector<HTMLElement>('[data-date-header]');
        if (hdr) this.dayObserver?.observe(hdr);
    }

    // ── Build a single day section ─────────────────────────────────────────
    private async buildDaySection(date: moment.Moment): Promise<HTMLElement> {
        const dateStr = date.format('YYYY-MM-DD');
        const isToday = date.isSame(moment(), 'day');

        const section = document.createElement('div');
        section.className = 'diwa-tl-day-section';
        section.dataset.date = dateStr;

        const dayHeader = document.createElement('div');
        dayHeader.className = `diwa-tl-day-header${isToday ? ' is-today' : ''}`;
        dayHeader.dataset.dateHeader = dateStr;

        const labelEl = document.createElement('span');
        labelEl.className = 'diwa-tl-day-label';
        labelEl.textContent = isToday
            ? `TODAY  ·  ${date.format('ddd, MMM D').toUpperCase()}`
            : date.format('ddd, MMM D · YYYY').toUpperCase();
        dayHeader.appendChild(labelEl);

        const countEl = document.createElement('span');
        countEl.className = 'diwa-tl-day-count';
        dayHeader.appendChild(countEl);
        section.appendChild(dayHeader);

        type FeedItem = { type: 'task' | 'thought'; entry: any; time: string };
        const tasks = Array.from(this.index.taskIndex.values())
            .filter(t => t.day === dateStr || t.due === dateStr);
        const thoughts = Array.from(this.index.thoughtIndex.values())
            .filter(t => t.day === dateStr || t.allDates.includes(dateStr));
        const entries: FeedItem[] = [
            ...tasks.map(t => ({ type: 'task' as const, entry: t, time: (t.created || '').split(' ')[1] || '00:00:00' })),
            ...thoughts.map(t => ({ type: 'thought' as const, entry: t, time: (t.created || '').split(' ')[1] || '00:00:00' }))
        ].sort((a, b) => b.time.localeCompare(a.time));

        if (entries.length === 0) {
            countEl.textContent = '—';
            const emptyEl = document.createElement('div');
            emptyEl.className = 'diwa-tl-day-empty';
            emptyEl.textContent = 'Nothing captured.';
            section.appendChild(emptyEl);
        } else {
            countEl.textContent = String(entries.length);
            const spineWrap = document.createElement('div');
            spineWrap.className = 'diwa-tl-spine-wrap';
            for (const item of entries) {
                spineWrap.appendChild(await this.buildEntryCard(item));
            }
            section.appendChild(spineWrap);
        }

        return section;
    }

    // ── Infinite Scroll (sentinel-based) ──────────────────────────────────
    private setupInfiniteScroll(topSentinel: HTMLElement) {
        this.sentinelObserver = new IntersectionObserver(async (entries) => {
            for (const entry of entries) {
                if (!entry.isIntersecting || this.isLoading) continue;
                this.isLoading = true;
                const sorted = Array.from(this.loadedDates).sort();
                if (entry.target.classList.contains('diwa-tl-sentinel--top')) {
                    const earliest = moment(sorted[0], 'YYYY-MM-DD');
                    await this.prependDaySection(earliest.clone().subtract(1, 'day'));
                    await this.prependDaySection(earliest.clone().subtract(2, 'days'));
                } else {
                    const latest = moment(sorted[sorted.length - 1], 'YYYY-MM-DD');
                    await this.appendDaySection(latest.clone().add(1, 'day'));
                    await this.appendDaySection(latest.clone().add(2, 'days'));
                }
                this.isLoading = false;
            }
        }, { root: this.feedEl, rootMargin: '200px', threshold: 0 });

        this.sentinelObserver.observe(topSentinel);
        const bottomSentinel = this.feedEl?.querySelector('.diwa-tl-sentinel--bottom');
        if (bottomSentinel) this.sentinelObserver.observe(bottomSentinel);
    }

    // ── Active Day Observer ────────────────────────────────────────────────
    private setupActiveDayObserver() {
        this.dayObserver = new IntersectionObserver((entries) => {
            let best: { date: string; top: number } | null = null;
            for (const e of entries) {
                if (e.isIntersecting) {
                    const top = e.boundingClientRect.top;
                    if (!best || top < best.top) {
                        best = { date: (e.target as HTMLElement).dataset.dateHeader!, top };
                    }
                }
            }
            if (best && best.date !== this.view.timelineSelectedDate) {
                this.view.timelineSelectedDate = best.date;
                if (this.headerEl) {
                    this.headerEl.empty();
                    this.renderSpotlightHeader(this.headerEl);
                }
            }
        }, { root: this.feedEl, rootMargin: '-10px 0px -65% 0px', threshold: 0 });

        this.feedEl?.querySelectorAll('[data-date-header]').forEach(el => this.dayObserver!.observe(el));
    }

    // ── Entry Card ─────────────────────────────────────────────────────────
    private async buildEntryCard(item: { type: 'task' | 'thought'; entry: any; time: string }): Promise<HTMLElement> {
        const entryEl = document.createElement('div');
        entryEl.className = 'diwa-tl-entry';

        const nodeEl = document.createElement('div');
        nodeEl.className = 'diwa-tl-entry-node';
        entryEl.appendChild(nodeEl);

        const card = document.createElement('div');
        card.className = `diwa-tl-entry-card diwa-tl-entry-card--${item.type}`;

        const meta = document.createElement('div');
        meta.className = 'diwa-tl-entry-meta';
        const badge = document.createElement('span');
        badge.className = `diwa-tl-type-badge diwa-tl-type-badge--${item.type}`;
        badge.textContent = item.type === 'thought' ? '✦ THOUGHT' : '✓ TASK';
        const timeEl = document.createElement('span');
        timeEl.className = 'diwa-tl-entry-time';
        timeEl.textContent = item.time.substring(0, 5);
        meta.appendChild(badge);
        meta.appendChild(timeEl);
        card.appendChild(meta);

        const body = document.createElement('div');
        body.className = 'diwa-tl-entry-body';
        await MarkdownRenderer.render(this.app, item.entry.body || item.entry.title || '', body, item.entry.filePath, this.view);
        this.hookInternalLinks(body, item.entry.filePath);
        card.appendChild(body);

        const footer = document.createElement('div');
        footer.className = 'diwa-tl-entry-footer';
        if (item.type === 'task' && item.entry.due) {
            const dueM = moment(item.entry.due, 'YYYY-MM-DD');
            const isOverdue = item.entry.status !== 'done' && dueM.isValid() && dueM.isBefore(moment(), 'day');
            const dueEl = document.createElement('span');
            dueEl.className = `diwa-tl-due${isOverdue ? ' is-overdue' : ''}`;
            dueEl.textContent = `📅 ${item.entry.due}`;
            footer.appendChild(dueEl);
        }
        if (item.entry.context?.length > 0) {
            const pills = document.createElement('div');
            pills.className = 'diwa-tl-ctx-pills';
            for (const ctx of item.entry.context) {
                const pill = document.createElement('span');
                pill.className = 'diwa-tl-ctx-pill';
                pill.textContent = `#${ctx}`;
                pills.appendChild(pill);
            }
            footer.appendChild(pills);
        }
        card.appendChild(footer);

        const actions = document.createElement('div');
        actions.className = 'diwa-tl-entry-actions';

        const editBtn = document.createElement('button');
        editBtn.className = 'diwa-tl-action-btn';
        editBtn.title = 'Edit';
        setIcon(editBtn, 'lucide-pencil');
        editBtn.addEventListener('click', () => {
            new EditEntryModal(
                this.app, this.plugin,
                item.entry.body, item.entry.context.map((c: string) => `#${c}`).join(' '),
                item.type === 'task' ? (item.entry.due || null) : null,
                item.type === 'task',
                async (newText, newCtxStr, newDue) => {
                    const ctxArr = newCtxStr ? parseContextString(newCtxStr) : [];
                    if (item.type === 'task') await this.vault.editTask(item.entry.filePath, newText.replace(/<br>/g, '\n'), ctxArr, newDue || undefined);
                    else await this.vault.editThought(item.entry.filePath, newText.replace(/<br>/g, '\n'), ctxArr);
                    this._refreshFeed();
                }
            ).open();
        });

        const delBtn = document.createElement('button');
        delBtn.className = 'diwa-tl-action-btn diwa-tl-action-btn--danger';
        delBtn.title = 'Delete';
        setIcon(delBtn, 'lucide-trash-2');
        delBtn.addEventListener('click', () => {
            new ConfirmModal(this.app, `Move this ${item.type} to trash?`, async () => {
                await this.vault.deleteFile(item.entry.filePath, item.type === 'task' ? 'tasks' : 'thoughts');
                if (item.type === 'task') this.index.taskIndex.delete(item.entry.filePath);
                else this.index.thoughtIndex.delete(item.entry.filePath);
                entryEl.remove();
            }).open();
        });

        actions.appendChild(editBtn);
        actions.appendChild(delBtn);
        card.appendChild(actions);
        entryEl.appendChild(card);
        return entryEl;
    }

    // ── Capture ────────────────────────────────────────────────────────────
    private openCapture() {
        new EditEntryModal(
            this.app, this.plugin, '', '', null, false,
            async (text, ctxs) => {
                if (!text.trim()) return;
                await this.vault.createThoughtFile(text, parseContextString(ctxs));
                this.isSearchMode = false;
                this._searchQuery = '';
                this.initTimeline();
            },
            'Capture'
        ).open();
    }
}


