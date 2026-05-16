import { App, Modal, setIcon, Platform } from 'obsidian';

interface HelpItem { label: string; desc: string; tip?: string; }
interface HelpSection { id: string; icon: string; title: string; subtitle: string; items: HelpItem[]; }

const SECTIONS: HelpSection[] = [
    {
        id: 'home', icon: 'lucide-home', title: 'Command Center', subtitle: 'Your daily launch pad',
        items: [
            { label: 'Greeting & Date', desc: 'Shows today\'s date, your greeting, and your North Star vision at the top.' },
            { label: 'Zen Mode 🎯', desc: 'Tap the target icon to collapse all navigation and enter deep focus. Tap again to exit.', tip: 'Best used when you only want to see your intelligence card and capture bar.' },
            { label: 'Intelligence Card', desc: 'Live snapshot: open tasks, habits completed, unprocessed thoughts, and total dues. Hit "SYNTHESIZE BRIEFING" to get an AI strategy summary.', tip: 'Requires a Gemini API key configured in Settings → AI.' },
            { label: 'Navigation Clusters', desc: 'Four grouped rows: ACTION (Focus, Habits, Journal, Synthesis, Timeline), MANAGEMENT (Tasks, Finance, Projects, Calendar, Weekly, Monthly, Compass), FEATURES (AI Chat, Voice, Compasee, Memento), and SYSTEM (Settings, Manual, Export). Each cluster wraps to the next row automatically on narrow screens.', tip: 'Tap any icon to jump directly to that tab.' },
            { label: 'Tablet Experience', desc: 'On tablets (iPad, etc.), DIWA automatically upgrades to a desktop-like layout: inline capture bar, horizontal habit bar, expanded navigation, sidebar manual, and hover effects.', tip: 'Tablet is detected when the device short-edge is ≥768px.' },
            { label: 'Global Search 🔍', desc: 'Tap the search icon (before Help) or press Mod+Shift+F to open Global Search. Instantly find anything across Thoughts, Tasks, Dues, Projects, and Habits.', tip: 'Also available via Obsidian command palette: "DIWA: Global Search".' },
        ]
    },
    {
        id: 'search', icon: 'lucide-search', title: 'Global Search', subtitle: 'Find anything across DIWA instantly',
        items: [
            { label: 'Opening Search', desc: 'Tap the 🔍 icon in the Command Center header, or press Mod+Shift+F. On phone, tap the search pill that appears between the greeting and capture bar for instant access.', tip: 'Also available via Obsidian command palette: "DIWA: Global Search".' },
            { label: 'Search Pill (Phone)', desc: 'On phone, a tappable search pill sits in the Command Center between the greeting and the capture bar. Tapping it opens the full-screen search overlay directly.', tip: 'The pill only appears on phone-sized screens — on tablet/desktop use the header icon.' },
            { label: 'Mobile Full-Screen Mode', desc: 'On phone, search opens as a full-screen iOS Spotlight-style takeover: 16px input (prevents iOS zoom), results scroll above the keyboard automatically, and safe-area insets are respected for notched phones.' },
            { label: 'Swipe to Dismiss', desc: 'On phone, swipe down on the search overlay or tap the ← back button to close. Supports reduced-motion preferences.', tip: 'The back button appears in the top-left corner of the full-screen overlay.' },
            { label: 'Scope Filters', desc: 'Use the pill buttons (All / Thoughts / Tasks / Dues / Projects / Habits) to narrow results to a specific type. Counts update live as you type.' },
            { label: 'Keyboard Navigation', desc: '↑↓ arrow keys move through results. Enter opens the focused item. Escape closes the overlay.', tip: 'Typing always returns focus to the input — you never lose your place.' },
            { label: 'Quick Jump', desc: 'When search is empty, a Quick Jump grid lets you instantly navigate to any tab — Timeline, Tasks, Dues, Projects, Habits, or Journal. Displays as 2 columns on phone, 3 columns on tablet/desktop.', tip: 'Quick Jump tiles are touch-optimised (56px+ height) for easy tapping on phone.' },
            { label: 'Match Highlighting', desc: 'Your query is highlighted wherever it matches result titles, making it easy to confirm relevance at a glance.' },
            { label: 'Result Types', desc: 'Each result shows a colour-coded icon (purple=thought, accent=task, amber=due, green=project, red=habit), title, preview, and date/status.' },
        ]
    },
    {
        id: 'capture', icon: 'lucide-plus-circle', title: 'Quick Capture', subtitle: 'Capture thoughts and tasks instantly',
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
        id: 'tasks', icon: 'lucide-check-square-2', title: 'Tasks', subtitle: 'Your tactical task ledger',
        items: [
            { label: 'Status Filters', desc: 'Filter by Open, Done, Waiting, or Someday using the segment bar at the top.' },
            { label: 'Complete a Task', desc: 'Tap the checkbox to mark a task done. It moves to the Done filter.' },
            { label: 'Edit a Task', desc: 'Tap a task card to open the edit modal. Change title, due date, contexts, priority, or energy.' },
            { label: 'Priority & Energy', desc: 'High/Medium/Low priority and energy tags help you pick the right task for your current state.', tip: 'Ask yourself: "What\'s my energy right now?" and filter accordingly.' },
            { label: 'Recurring Tasks', desc: 'Tasks can repeat daily, weekly, biweekly, or monthly. Set recurrence in the edit modal.' },
            { label: 'Comments', desc: 'Tap the comment icon on a task to add notes or replies beneath it.' },
        ]
    },
    {
        id: 'thoughts', icon: 'lucide-brain', title: 'Thoughts & Timeline', subtitle: 'Browse and search your captured ideas',
        items: [
            { label: 'Timeline View', desc: 'All thoughts listed newest-first. Use the date carousel to jump to a specific day.' },
            { label: 'Search', desc: 'Type in the search bar to filter thoughts by content, title, or context tag.' },
            { label: 'Edit & Reply', desc: 'Tap a thought card to edit its content, add a reply thread, or delete it.' },
            { label: 'Pin a Thought', desc: 'Pin important thoughts to keep them anchored at the top of the timeline.' },
            { label: 'Project Link', desc: 'Thoughts can be linked to a project using the folder icon in the edit modal.' },
        ]
    },
    {
        id: 'habits', icon: 'lucide-flame', title: 'Habits', subtitle: 'Build your daily disciplines',
        items: [
            { label: 'Quick Bar (Home)', desc: 'Tap habit icons on the Home screen to log today\'s completions without leaving the hub.' },
            { label: '7-Day Strip', desc: 'In the Habits tab, each habit shows a 7-day calendar. Tap any day to toggle it.' },
            { label: 'Configure Habits', desc: 'Tap the ⚙ gear icon on the Home screen to add, edit, or archive habits.' },
            { label: 'Weekly Highlight', desc: 'The Weekly Review automatically shows your best-performing habit for the week.' },
            { label: 'Progress Bar', desc: 'A visual progress bar shows how many habits you\'ve completed today.' },
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
        id: 'finance', icon: 'lucide-credit-card', title: 'Finance (Dues)', subtitle: 'Track bills and financial obligations',
        items: [
            { label: 'Dues Ledger', desc: 'All your recurring bills and due dates in one place.' },
            { label: 'Filter Views', desc: 'Switch between All, Due Soon, Overdue, and Paid views using the segment bar.' },
            { label: 'Mark Paid', desc: 'Tap a due item to log a payment. Updates next_duedate and last_payment_date frontmatter, stamped and reflected in Weekly Review.', tip: 'Dates are stored as plain YYYY-MM-DD strings (e.g. 2026-05-01), not wiki links.' },
            { label: 'Burn Rate', desc: 'Total monthly obligation is shown at the top — your financial baseline.' },
        ]
    },
    {
        id: 'review', icon: 'lucide-calendar-check', title: 'Weekly Review', subtitle: 'Reflect and plan every week',
        items: [
            { label: 'Week at a Glance ⚡', desc: 'Auto-generated panel showing tasks completed this week, habit progress bars, active projects, and finance paid/overdue.', tip: 'Tap ↻ to refresh. Tap ⌄ to collapse.' },
            { label: 'Wins', desc: 'Write what went well this week — celebrate progress, big and small.' },
            { label: 'Lessons Learned', desc: 'Capture what you\'d do differently. Turns mistakes into growth.' },
            { label: 'Next Week\'s Focus', desc: 'Set 1–3 priorities for the coming week. These appear on your Home screen.' },
            { label: 'Habit Highlight', desc: 'Your best-performing habit is shown automatically.' },
            { label: '📅 Next Week Plan', desc: 'Plan your week day by day. Set intentions per day and assign tasks using the inline picker. Toggle "This Week / Next Week" to plan either.' },
            { label: 'Save', desc: 'Press "Save Review" or ⌘↵ to save. Stored as Markdown in Reviews/Weekly/.' },
        ]
    },
    {
        id: 'monthly-review', icon: 'lucide-calendar-range', title: 'Monthly Review', subtitle: 'Set and track monthly goals',
        items: [
            { label: 'Navigation', desc: 'Access from the SYSTEM cluster in Command Center, or from the monthly goals "Edit" button.' },
            { label: 'Monthly Stats', desc: 'Auto-calculated tasks done, thoughts captured, and open tasks for the current month.' },
            { label: 'Habit Adherence', desc: 'Shows completion rate per habit across the month with percentage color coding.' },
            { label: 'Project Progress', desc: 'Visual progress bars for each project showing done/total ratio.' },
            { label: 'Next Month\'s Focus', desc: 'Set up to 3 goals for the coming month. Persisted in settings.' },
        ]
    },
    {
        id: 'compass', icon: 'lucide-compass', title: 'Compass', subtitle: 'Your North Star and long-range direction',
        items: [
            { label: 'North Star Goal', desc: 'Your single long-term vision. It appears every day on the Home screen as a constant reminder.' },
            { label: 'Quarterly Goals', desc: 'Set 90-day priorities aligned to your North Star. Review quarterly.' },
            { label: 'Purpose Statement', desc: 'Write your personal "why" — the reason behind all your goals.' },
        ]
    },
    {
        id: 'synthesis', icon: 'lucide-git-merge', title: 'Synthesis', subtitle: 'Process thoughts into permanent knowledge',
        items: [
            { label: 'Inbox Feed', desc: 'Unprocessed thoughts appear in the sidebar with count badge. Use the search filter to find specific thoughts.' },
            { label: 'Drag & Drop', desc: 'Drag a thought card onto the canvas to synthesize it into your Master Note. It\'s automatically marked as processed.' },
            { label: 'Quick Process', desc: 'Tap "✓ Process" on any card to mark it as processed without synthesizing.' },
            { label: 'Master Notes', desc: 'Create new insight notes with "+ New Insight". Merged thoughts are linked via wiki-links.' },
            { label: 'Zero-Inbox Goal', desc: 'Keep your inbox empty by regularly processing ideas.', tip: 'Weekly Review is the perfect time to clear your thought inbox.' },
        ]
    },
    {
        id: 'ai', icon: 'lucide-sparkles', title: 'AI Chat', subtitle: 'Gemini 2.5 Pro intelligence',
        items: [
            { label: 'Chat', desc: 'Ask DIWA anything — strategy, writing help, idea development, or note analysis. Powered by Gemini 2.5 Pro.' },
            { label: 'Keyboard', desc: 'Press Enter to send, Shift+Enter for a new line.', tip: 'The send button also works on mobile.' },
            { label: 'Suggestion Chips', desc: 'On empty chat, tap a suggestion to prefill your prompt.' },
            { label: 'Web Search', desc: 'Toggle the globe icon (🌐) in the header to let AI pull current information from the internet.' },
            { label: 'Ground on Notes', desc: 'Attach vault files via the paperclip icon. File chips appear above the input — tap × to remove.' },
            { label: 'Model Badge', desc: 'The active model is shown in the header. Change it in Settings (gear icon) → AI Configuration.' },
            { label: 'New Chat', desc: 'Tap "+ New" to start a fresh conversation. Previous chats are auto-saved to vault.' },
            { label: 'Setup', desc: 'Add your Gemini API key via the gear icon in the AI header. Free tier at ai.google.dev.', tip: 'Default model: gemini-2.5-pro. The Intelligence briefing on Home also uses this key.' },
        ]
    },
    {
        id: 'voice', icon: 'lucide-mic', title: 'Voice Notes', subtitle: 'Capture and transcribe audio',
        items: [
            { label: 'Record', desc: 'Tap and hold the microphone button to record. Release to stop.' },
            { label: 'Transcribe', desc: 'After recording, tap "Transcribe" to convert speech to text using Gemini AI.' },
            { label: 'Review & Save', desc: 'Edit the transcription text before saving it as a thought or note.' },
        ]
    },
    {
        id: 'journal', icon: 'lucide-book-open', title: 'Journal', subtitle: 'Daily freeform writing',
        items: [
            { label: 'All Entries Feed', desc: 'All journal entries shown newest-first in a single scrollable feed. Your full history is always visible — no day-based navigation needed.' },
            { label: 'New Entry', desc: 'Tap the "+ New Entry" pill in the Journal header to open the entry modal. Write and tap Done (or Save on desktop) to save.', tip: 'On mobile the modal opens as a bottom sheet with Cancel and Done in the header.' },
            { label: 'Edit & Delete', desc: 'Each entry card has Edit (✏) and Delete (🗑) buttons. Tap Edit to reopen the modal with existing content.' },
            { label: 'Timestamps', desc: 'Every entry shows its creation date and time below the entry body.' },
        ]
    },
    {
        id: 'timeline', icon: 'lucide-clock', title: 'Timeline', subtitle: 'Chronological history of all activity',
        items: [
            { label: 'All Entries', desc: 'Thoughts, tasks, and notes shown in date order. Scroll to explore your history.' },
            { label: 'Date Jump', desc: 'Use the date carousel at the top to navigate to a specific day.' },
        ]
    },
    {
        id: 'settings', icon: 'lucide-settings', title: 'Settings', subtitle: 'Configure DIWA to your workflow',
        items: [
            { label: 'Folders', desc: 'Set where thoughts, tasks, habits, and voice memos are stored in your vault.' },
            { label: 'Contexts', desc: 'Manage your global context tags (#work, #personal, etc.).' },
            { label: 'AI Key', desc: 'Enter your Gemini API key to enable AI Chat and Intelligence features.' },
            { label: 'Habits', desc: 'Add, edit, and archive habits from the ⚙ icon on the Home screen.' },
        ]
    },
    {
        id: 'desktop-hub', icon: 'lucide-layout-dashboard', title: 'Desktop Hub', subtitle: 'Premium 3-column cockpit for desktop',
        items: [
            { label: 'Opening the Hub', desc: 'Click the cockpit icon in the Obsidian ribbon, or use the command palette → "DIWA: Open Desktop Hub". Opens as a dedicated popout window.', tip: 'Requires Obsidian 0.16.0+. On mobile, a notice is shown instead.' },
            { label: '3-Column Layout', desc: 'LEFT: icon-only navigation sidebar (hover to expand with labels). CENTER: thought capture + today\'s live feed. RIGHT: stats panel + AI Intelligence briefing.' },
            { label: 'Thought Capture', desc: 'Type your thought in the center textarea and press Enter to save instantly. Use ⌘K to open the inline context tagger and assign tags before saving.', tip: 'Shift+Enter inserts a newline without saving.' },
            { label: "Today's Feed", desc: 'All thoughts captured today are shown in the center panel, newest first. Each entry shows timestamp, body text, and context chips.' },
            { label: 'Stats Panel', desc: 'Right panel shows 5 live stats: Open Tasks, Overdue (red when >0), Unsynth Thoughts, Total Dues ($), and Habits ratio. Updates reactively with every vault change.' },
            { label: 'AI Intelligence', desc: 'Hit "SYNTHESIZE BRIEFING" in the right panel to get a Gemini strategy summary based on your current thoughts, tasks, and context.', tip: 'Requires a Gemini API key in Settings → AI.' },
            { label: 'Focus Mode 🎯', desc: 'Desktop Hub opens in Focus Mode by default. Click the 🎯 button in the top bar to collapse the sidebar and right panel — center capture goes full-width for distraction-free input. Click again to restore.', tip: 'Focus Mode state is saved per-window and survives Obsidian restarts.' },
            { label: 'Navigation Sidebar', desc: 'Hover the left sidebar to expand it. Four groups: ACTION (Capture, Synthesis, Timeline, Habits, Journal), MANAGE (Tasks, Finance, Projects, Calendar, Monthly, Compass), FEATURES (AI Chat, Voice, Memento, Export), SYSTEM (Settings, Manual).' },
        ]
    },
    {
        id: 'thoughts', icon: 'lucide-brain', title: 'Thoughts & Timeline', subtitle: 'Browse and search your captured ideas',
        items: [
            { label: 'Timeline View', desc: 'All thoughts listed newest-first. Use the date carousel to jump to a specific day.' },
            { label: 'Convert to Task', desc: 'Tap the checklist icon on any thought card to turn it into a task. Pick a task title and optional due date — DIWA keeps the source thought link on the new task.' },
            { label: 'Search', desc: 'Type in the search bar to filter thoughts by content, title, or context tag.' },
            { label: 'Edit & Reply', desc: 'Tap a thought card to edit its content, add a reply thread, or delete it.' },
            { label: 'Pin a Thought', desc: 'Pin important thoughts to keep them anchored at the top of the timeline.' },
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

