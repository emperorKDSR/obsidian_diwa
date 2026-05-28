import { App, Modal, setIcon, Platform } from 'obsidian';

interface HelpItem { label: string; desc: string; tip?: string; }
interface HelpSection { id: string; icon: string; title: string; subtitle: string; items: HelpItem[]; }

const SECTIONS: HelpSection[] = [
    {
        id: 'home', icon: 'lucide-home', title: 'Command Center', subtitle: 'Your daily launch pad',
        items: [
            { label: 'Greeting & Date', desc: 'Shows today\'s date and your greeting at the top.' },
            { label: 'Zen Mode 🎯', desc: 'Tap the target icon to collapse all navigation and enter deep focus. Tap again to exit.', tip: 'Best used when you only want to see your intelligence card and capture bar.' },
            { label: 'Intelligence Card', desc: 'Live snapshot: open gawa, unprocessed thoughts, and your total Bulsa obligations.' },
            { label: 'Navigation Clusters', desc: 'Workspace stays pinned at the top, followed by primary modules (Projects, Gawa, Bulsa, Review, Journal) and the system tools row (Settings, Manual, Export).', tip: 'Tap any icon to jump directly to that tab.' },
            { label: 'Tablet Experience', desc: 'On tablets (iPad, etc.), DIWA automatically upgrades to a desktop-like layout: inline capture bar, expanded navigation, sidebar manual, and hover effects.', tip: 'Tablet is detected when the device short-edge is ≥768px.' },
        ]
    },
    {
        id: 'capture', icon: 'lucide-plus-circle', title: 'Quick Capture', subtitle: 'Capture thoughts and gawa instantly',
        items: [
            { label: 'Capture a Thought', desc: 'Click the capture bar and type your idea. It saves as a Markdown file in your thoughts folder.' },
            { label: 'Capture a Task', desc: 'Switch to Task mode in the capture bar. Optionally add a due date and contexts before saving.' },
            { label: 'Context Tags (#tags)', desc: 'Type #tag in the capture bar to attach a context. Tags appear as removable chips.' },
            { label: 'Smart Date Triggers', desc: 'Type @tomorrow, @monday, or @2025-08-01 in the text to auto-set a due date and switch to task mode.', tip: 'Examples: "Fix bug @tomorrow", "Call client @friday"' },
            { label: 'Task Metadata', desc: 'Set priority (High / Medium / Low), energy level, and custom status when capturing or editing any task.' },
            { label: 'Keyboard Shortcuts', desc: '⌘K or Ctrl+K opens capture. ⌘↵ or Ctrl+↵ saves. Esc cancels.' },
        ]
    },
    {
        id: 'gawa', icon: 'lucide-check-square-2', title: 'Gawa', subtitle: 'Your tactical gawa ledger',
        items: [
            { label: 'Status Filters', desc: 'Filter by Open, Done, Waiting, or Someday using the segment bar at the top.' },
            { label: 'Complete a Task', desc: 'Tap the checkbox to mark a task done. It moves to the Done filter.' },
            { label: 'Edit a Task', desc: 'Tap a task card to open the edit modal. Change title, due date, contexts, priority, or energy.' },
            { label: 'Priority & Energy', desc: 'High/Medium/Low priority and energy tags help you pick the right task for your current state.', tip: 'Ask yourself: "What\'s my energy right now?" and filter accordingly.' },
            { label: 'Recurring Gawa', desc: 'Gawa can repeat daily, weekly, biweekly, or monthly. Set recurrence in the edit modal.' },
            { label: 'Comments', desc: 'Tap the comment icon on a gawa item to add notes or replies beneath it.' },
        ]
    },
    {
        id: 'thoughts', icon: 'lucide-brain', title: 'Thoughts', subtitle: 'Browse and process your captured ideas',
        items: [
            { label: 'Thought Feed', desc: 'Captured thoughts live in the workspace feed, where you can review them, search them, and turn them into tasks or notes.' },
            { label: 'Edit & Reply', desc: 'Tap a thought card to edit its content, add a reply thread, or delete it.' },
            { label: 'Project Link', desc: 'Thoughts can be linked to a project using the folder icon in the edit modal.' },
        ]
    },
    {
        id: 'projects', icon: 'lucide-briefcase', title: 'Projects', subtitle: 'Manage multi-step initiatives',
        items: [
            { label: 'Create a Project', desc: 'Tap "New Project" and fill in the name, goal, status, due date, and colour.' },
            { label: 'Edit a Project', desc: 'Tap the ✏ pencil icon on any project card to update its details.' },
            { label: 'Status', desc: 'Projects can be: Active, On Hold, Completed, or Archived. Archived projects are hidden from active views.' },
            { label: 'Link to Capture', desc: 'Tap the folder icon in the capture modal to link a thought or task to a project.' },
            { label: 'Weekly Glance', desc: 'Projects modified this week appear in the "Active Projects" card in Weekly Review.' },
        ]
    },
    {
        id: 'finance', icon: 'lucide-credit-card', title: 'Bulsa', subtitle: 'Track bills and recurring obligations',
        items: [
            { label: 'Bulsa Ledger', desc: 'All your recurring bills and due dates in one place.' },
            { label: 'Filter Views', desc: 'Switch between All, Due Soon, Overdue, and Paid views using the segment bar.' },
            { label: 'Mark Paid', desc: 'Tap a Bulsa item to log a payment. Updates next_duedate and last_payment_date frontmatter, stamped and reflected in Weekly Review.', tip: 'Dates are stored as plain YYYY-MM-DD strings (e.g. 2026-05-01), not wiki links.' },
            { label: 'Burn Rate', desc: 'Total monthly obligation is shown at the top — your baseline for recurring obligations.' },
        ]
    },
    {
        id: 'review', icon: 'lucide-calendar-check', title: 'Weekly Review', subtitle: 'Reflect and plan every week',
        items: [
            { label: 'Week at a Glance ⚡', desc: 'Auto-generated panel showing gawa completed this week, active projects, and Bulsa paid/overdue.', tip: 'Tap ↻ to refresh. Tap ⌄ to collapse.' },
            { label: 'Wins', desc: 'Write what went well this week — celebrate progress, big and small.' },
            { label: 'Lessons Learned', desc: 'Capture what you\'d do differently. Turns mistakes into growth.' },
            { label: 'Next Week\'s Focus', desc: 'Set 1–3 priorities for the coming week. These appear on your Home screen.' },
            { label: '📅 Next Week Plan', desc: 'Plan your week day by day. Set intentions per day and assign gawa using the inline picker. Toggle "This Week / Next Week" to plan either.' },
            { label: 'Save', desc: 'Press "Save Review" or ⌘↵ to save. Stored as Markdown in Reviews/Weekly/.' },
        ]
    },
    {
        id: 'monthly-review', icon: 'lucide-calendar-range', title: 'Monthly Review', subtitle: 'Set and track monthly goals',
        items: [
            { label: 'Navigation', desc: 'Access from the SYSTEM cluster in Command Center, or from the monthly goals "Edit" button.' },
            { label: 'Monthly Stats', desc: 'Auto-calculated gawa done, thoughts captured, and open gawa for the current month.' },
            { label: 'Project Progress', desc: 'Visual progress bars for each project showing done/total ratio.' },
            { label: 'Next Month\'s Focus', desc: 'Set up to 3 goals for the coming month. Saved to your Monthly review note.' },
        ]
    },

    {
        id: 'journal', icon: 'lucide-book-open', title: 'Journal', subtitle: 'Daily freeform writing',
        items: [
            { label: 'Desktop Split View', desc: 'Desktop Journal now uses a split workspace: title-only archive rail on the left, focused composer on the right.' },
            { label: 'Mobile Composer', desc: 'On mobile the Journal opens straight into the composer so capture stays fast and touch-friendly.' },
            { label: 'Titles & Types', desc: 'Every entry now supports a dedicated title plus journal-type pills such as Reflection or Realization.' },
            { label: 'Files & Images', desc: 'Paste, drag, or attach files in the composer. DIWA saves them to your Attachments folder and inserts a vault-relative link inline.' },
        ]
    },
    {
        id: 'settings', icon: 'lucide-settings', title: 'Settings', subtitle: 'Configure DIWA to your workflow',
        items: [
            { label: 'Folders', desc: 'Set where thoughts, gawa, attachments, and reviews are stored in your vault.' },
            { label: 'Contexts', desc: 'Manage your global context tags (#work, #personal, etc.).' },
            { label: 'Reminders', desc: 'Toggle gawa reminders. Reminders respect quiet hours (8 AM – 10 PM).' },
        ]
    },
    {
        id: 'desktop-hub', icon: 'lucide-layout-dashboard', title: 'Desktop Hub', subtitle: 'Premium 3-column cockpit for desktop',
        items: [
            { label: 'Opening the Hub', desc: 'Click the cockpit icon in the Obsidian ribbon, or use the command palette → "DIWA: Open Desktop Hub". Opens as a dedicated popout window.', tip: 'Requires Obsidian 0.16.0+. On mobile, a notice is shown instead.' },
            { label: '3-Column Layout', desc: 'LEFT: icon-only navigation sidebar (hover to expand with labels). CENTER: thought capture + today\'s live feed. RIGHT: stats panel and workspace details.' },
            { label: 'Thought Capture', desc: 'Type your thought in the center textarea and press Enter to save instantly. Use ⌘K to open the inline context tagger and assign tags before saving.', tip: 'Shift+Enter inserts a newline without saving.' },
            { label: "Today's Feed", desc: 'All thoughts captured today are shown in the center panel, newest first. Each entry shows timestamp, body text, and context chips.' },
            { label: 'Stats Panel', desc: 'Right panel shows live workspace stats such as open gawa, overdue items, unsynthesized thoughts, and Bulsa totals. Updates reactively with every vault change.' },
            { label: 'Focus Mode 🎯', desc: 'Desktop Hub opens in Focus Mode by default. Click the 🎯 button in the top bar to collapse the sidebar and right panel — center capture goes full-width for distraction-free input. Click again to restore.', tip: 'Focus Mode state is saved per-window and survives Obsidian restarts.' },
            { label: 'Navigation Sidebar', desc: 'Hover the left sidebar to expand it. Workspace stays pinned on top, the main module group is Projects → Gawa → Bulsa → Review → Journal, and system tools stay in the footer.' },
        ]
    },
    {
        id: 'thoughts', icon: 'lucide-brain', title: 'Thoughts', subtitle: 'Browse and process your captured ideas',
        items: [
            { label: 'Thought Feed', desc: 'Captured thoughts live in the workspace feed, where you can review them, search them, and turn them into tasks or notes.' },
            { label: 'Convert to Task', desc: 'Tap the checklist icon on any thought card to turn it into a task. Pick a task title and optional due date — DIWA keeps the source thought link on the new task.' },
            { label: 'Edit & Reply', desc: 'Tap a thought card to edit its content, add a reply thread, or delete it.' },
            { label: 'Project Link', desc: 'Thoughts can be linked to a project using the folder icon in the edit modal.' },
        ]
    },
];

export class HelpModal extends Modal {
    private activeSectionId: string = 'home';
    private searchQuery: string = '';

    constructor(app: App) {
        super(app);
    }

    onOpen() {
        const { contentEl, modalEl } = this;
        modalEl.addClass('diwa-help-modal');
        contentEl.empty();

        if (Platform.isMobile && !this._isTablet()) {
            this._renderMobile(contentEl);
        } else {
            this._renderDesktop(contentEl);
        }
    }

    onClose() {
        this.contentEl.empty();
    }

    private _isTablet(): boolean {
        return Platform.isMobile && Math.min(screen.width, screen.height) >= 768;
    }

    // ── Desktop: sidebar + content pane ───────────────────────────────────
    private _renderDesktop(root: HTMLElement) {
        root.addClass('diwa-help-root');

        // Header
        const header = root.createEl('div', { cls: 'diwa-help-header' });
        const titleWrap = header.createEl('div', { cls: 'diwa-help-header-title' });
        const titleIcon = titleWrap.createEl('span', { cls: 'diwa-help-header-icon' });
        setIcon(titleIcon, 'lucide-book-open');
        titleWrap.createEl('h2', { text: 'DIWA Manual', cls: 'diwa-help-title' });
        titleWrap.createEl('p', { text: 'Your Personal Operating System', cls: 'diwa-help-subtitle' });

        // Search
        const searchWrap = header.createEl('div', { cls: 'diwa-help-search-wrap' });
        const searchIcon = searchWrap.createEl('span', { cls: 'diwa-help-search-icon' });
        setIcon(searchIcon, 'lucide-search');
        const searchInput = searchWrap.createEl('input', {
            cls: 'diwa-help-search',
            attr: { type: 'text', placeholder: 'Search the manual…' }
        }) as HTMLInputElement;

        // Body
        const body = root.createEl('div', { cls: 'diwa-help-body' });
        const sidebar = body.createEl('nav', { cls: 'diwa-help-sidebar' });
        const content = body.createEl('div', { cls: 'diwa-help-content' });

        const renderContent = () => {
            content.empty();
            const q = this.searchQuery.toLowerCase().trim();
            if (q) {
                this._renderSearchResults(content, q);
                return;
            }
            const section = SECTIONS.find(s => s.id === this.activeSectionId) || SECTIONS[0];
            this._renderSectionContent(content, section);
        };

        const renderSidebar = () => {
            sidebar.empty();
            SECTIONS.forEach(s => {
                const item = sidebar.createEl('div', { cls: `diwa-help-nav-item${s.id === this.activeSectionId ? ' is-active' : ''}` });
                const iconEl = item.createEl('span', { cls: 'diwa-help-nav-icon' });
                setIcon(iconEl, s.icon);
                item.createEl('span', { cls: 'diwa-help-nav-label', text: s.title });
                item.addEventListener('click', () => {
                    this.activeSectionId = s.id;
                    this.searchQuery = '';
                    searchInput.value = '';
                    renderSidebar();
                    renderContent();
                });
            });
        };

        searchInput.addEventListener('input', () => {
            this.searchQuery = searchInput.value;
            renderContent();
        });

        renderSidebar();
        renderContent();
    }

    // ── Mobile: accordion list ─────────────────────────────────────────────
    private _renderMobile(root: HTMLElement) {
        root.addClass('diwa-help-root diwa-help-root--mobile');

        const header = root.createEl('div', { cls: 'diwa-help-header diwa-help-header--mobile' });
        const titleWrap = header.createEl('div', { cls: 'diwa-help-header-title' });
        const titleIcon = titleWrap.createEl('span', { cls: 'diwa-help-header-icon' });
        setIcon(titleIcon, 'lucide-book-open');
        titleWrap.createEl('h2', { text: 'DIWA Manual', cls: 'diwa-help-title' });

        const searchWrap = header.createEl('div', { cls: 'diwa-help-search-wrap' });
        const searchIcon = searchWrap.createEl('span', { cls: 'diwa-help-search-icon' });
        setIcon(searchIcon, 'lucide-search');
        const searchInput = searchWrap.createEl('input', {
            cls: 'diwa-help-search',
            attr: { type: 'text', placeholder: 'Search…' }
        }) as HTMLInputElement;

        const list = root.createEl('div', { cls: 'diwa-help-accordion' });

        const renderAccordion = (query: string) => {
            list.empty();
            if (query) {
                this._renderSearchResults(list, query.toLowerCase().trim());
                return;
            }
            SECTIONS.forEach(s => {
                const block = list.createEl('div', { cls: 'diwa-help-accordion-block' });
                const trigger = block.createEl('div', { cls: 'diwa-help-accordion-trigger' });
                const trigLeft = trigger.createEl('div', { cls: 'diwa-help-accordion-trigger-left' });
                const iconEl = trigLeft.createEl('span', { cls: 'diwa-help-nav-icon' });
                setIcon(iconEl, s.icon);
                const textCol = trigLeft.createEl('div', { cls: 'diwa-help-accordion-text' });
                textCol.createEl('span', { cls: 'diwa-help-accordion-title', text: s.title });
                textCol.createEl('span', { cls: 'diwa-help-accordion-subtitle', text: s.subtitle });
                const chevron = trigger.createEl('span', { cls: 'diwa-help-accordion-chevron' });
                setIcon(chevron, 'chevron-right');

                const bodyEl = block.createEl('div', { cls: 'diwa-help-accordion-body' });
                bodyEl.style.display = 'none';

                trigger.addEventListener('click', () => {
                    const open = bodyEl.style.display !== 'none';
                    // close all others
                    list.querySelectorAll('.diwa-help-accordion-body').forEach((b: any) => b.style.display = 'none');
                    list.querySelectorAll('.diwa-help-accordion-chevron').forEach((c: any) => setIcon(c as HTMLElement, 'chevron-right'));
                    if (!open) {
                        bodyEl.style.display = 'block';
                        setIcon(chevron, 'chevron-down');
                        this._renderSectionContent(bodyEl, s);
                    } else {
                        bodyEl.empty();
                    }
                });
            });
        };

        searchInput.addEventListener('input', () => { renderAccordion(searchInput.value); });
        renderAccordion('');
    }

    // ── Section content renderer ───────────────────────────────────────────
    private _renderSectionContent(container: HTMLElement, section: HelpSection) {
        container.empty();
        const secHeader = container.createEl('div', { cls: 'diwa-help-sec-header' });
        const iconEl = secHeader.createEl('span', { cls: 'diwa-help-sec-icon' });
        setIcon(iconEl, section.icon);
        const secText = secHeader.createEl('div');
        secText.createEl('h3', { cls: 'diwa-help-sec-title', text: section.title });
        secText.createEl('p', { cls: 'diwa-help-sec-subtitle', text: section.subtitle });

        section.items.forEach(item => {
            const card = container.createEl('div', { cls: 'diwa-help-item-card' });
            card.createEl('div', { cls: 'diwa-help-item-label', text: item.label });
            card.createEl('div', { cls: 'diwa-help-item-desc', text: item.desc });
            if (item.tip) {
                const tipRow = card.createEl('div', { cls: 'diwa-help-item-tip' });
                const tipIcon = tipRow.createEl('span', { cls: 'diwa-help-tip-icon' });
                setIcon(tipIcon, 'lucide-lightbulb');
                tipRow.createEl('span', { text: item.tip });
            }
        });
    }

    // ── Search results renderer ────────────────────────────────────────────
    private _renderSearchResults(container: HTMLElement, q: string) {
        container.empty();
        let hasResults = false;
        SECTIONS.forEach(section => {
            const matchedItems = section.items.filter(item =>
                item.label.toLowerCase().includes(q) ||
                item.desc.toLowerCase().includes(q) ||
                (item.tip || '').toLowerCase().includes(q) ||
                section.title.toLowerCase().includes(q)
            );
            if (matchedItems.length === 0) return;
            hasResults = true;
            const group = container.createEl('div', { cls: 'diwa-help-search-group' });
            const grpHeader = group.createEl('div', { cls: 'diwa-help-search-group-header' });
            const iconEl = grpHeader.createEl('span', { cls: 'diwa-help-nav-icon' });
            setIcon(iconEl, section.icon);
            grpHeader.createEl('span', { cls: 'diwa-help-search-group-title', text: section.title });
            matchedItems.forEach(item => {
                const card = group.createEl('div', { cls: 'diwa-help-item-card' });
                card.createEl('div', { cls: 'diwa-help-item-label', text: item.label });
                card.createEl('div', { cls: 'diwa-help-item-desc', text: item.desc });
                if (item.tip) {
                    const tipRow = card.createEl('div', { cls: 'diwa-help-item-tip' });
                    const tipIcon = tipRow.createEl('span', { cls: 'diwa-help-tip-icon' });
                    setIcon(tipIcon, 'lucide-lightbulb');
                    tipRow.createEl('span', { text: item.tip });
                }
            });
        });
        if (!hasResults) {
            container.createEl('div', { cls: 'diwa-help-empty', text: 'No results found. Try a different search term.' });
        }
    }
}
