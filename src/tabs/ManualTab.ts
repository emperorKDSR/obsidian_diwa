import { setIcon, Platform } from 'obsidian';
import type { DiwaView } from '../view';
import { BaseTab } from './BaseTab';
import { isTablet } from '../utils';

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
            { label: 'Tablet Experience', desc: 'On tablets (iPad, etc.), DIWA automatically upgrades to a desktop-like layout: inline capture bar, expanded navigation, and hover effects.', tip: 'Tablet is detected when the device short-edge is ≥768px.' },
        ]
    },
    {
        id: 'capture', icon: 'lucide-plus-circle', title: 'Quick Capture', subtitle: 'Capture thoughts and gawa instantly',
        items: [
            { label: 'Capture a Thought', desc: 'Click the capture bar on Home or press ⌘K / Ctrl+K. The modal opens with THOUGHT mode selected by default — just type and save.' },
            { label: 'Capture a Task', desc: 'Tap the TASK button at the top of the capture modal to switch modes. The right panel expands showing due date, recurrence, and properties.', tip: 'Task mode uses a 2-column layout on wider screens — metadata stays visible alongside the text.' },
            { label: 'Mode Toggle at Top', desc: 'The THOUGHT / TASK toggle is always visible at the top of the modal — switch modes without scrolling.' },
            { label: 'Context Tags (#tags)', desc: 'Type # in any capture field to open the context tag picker. Selected tags appear as removable chip pills.' },
            { label: 'Smart Date Triggers', desc: 'Type @tomorrow, @monday, or @2025-08-01 in the text to auto-set a due date and switch to task mode.', tip: 'Examples: "Fix bug @tomorrow", "Call client @friday"' },
            { label: 'Wiki-Link Trigger ([[)', desc: 'Type [[ in any capture field to open the full file picker and insert a [[Note Link]] inline.' },
            { label: 'People Mention Trigger (/)', desc: 'Type / (at the start or after a space) in any capture field to open the People picker. Lists all vault notes with category: people frontmatter. Selecting a person inserts [[Person Name]] at the cursor.', tip: 'To make a note appear in the picker, add category: people to its frontmatter.' },
            { label: 'Image Paste & Drop 📎', desc: 'Paste (Ctrl+V / ⌘V) or drag-and-drop an image directly into the Thought textarea or Task input. The image is saved to your Attachments Folder and a ![[filename]] wikilink is inserted at the cursor.', tip: 'Supported formats: PNG, JPG, GIF, WebP, SVG, PDF. Configure the save folder under Settings → Attachments Folder.' },
            { label: 'Task Metadata', desc: 'In task mode: set priority (High / Medium / Low), energy level, recurrence, and status in the right panel.' },
            { label: 'Keyboard Shortcuts', desc: '⌘K or Ctrl+K opens capture. ⌘↵ or Ctrl+↵ saves. Esc cancels.' },
        ]
    },
    {
        id: 'gawa', icon: 'lucide-check-square-2', title: 'Gawa', subtitle: 'Your tactical gawa ledger',
        items: [
            { label: 'Status Filters', desc: 'Filter by Open, Done, Waiting, or Someday using the segment bar at the top.' },
            { label: 'Complete a Task', desc: 'Tap the checkbox to mark a task done. It moves to the Done filter.' },
            { label: 'Edit a Task', desc: 'Tap a task card to open the edit modal. Change title, due date, contexts, priority, or energy.' },
            { label: 'Full Title Display', desc: 'Gawa titles display in full — no truncation regardless of length. Long gawa items wrap naturally across multiple lines.' },
            { label: 'Priority & Energy', desc: 'High/Medium/Low priority and energy tags help you pick the right task for your current state.', tip: 'Ask yourself: "What\'s my energy right now?" and filter accordingly.' },
            { label: 'Recurring Gawa', desc: 'Gawa can repeat daily, weekly, biweekly, or monthly. Set recurrence in the edit modal.' },
            { label: 'Comments', desc: 'Tap the comment icon on a task to add notes or replies beneath it.' },
        ]
    },
    {
        id: 'thoughts', icon: 'lucide-brain', title: 'Thoughts', subtitle: 'Browse and process your captured ideas',
        items: [
            { label: 'Thought Feed', desc: 'Captured thoughts live in the workspace feed, where you can review them, search them, and turn them into tasks or notes.' },
            { label: 'Convert to Task', desc: 'Tap the checklist icon on any thought card to turn it into a task. Pick a title and optional due date — the new task keeps the source thought link.' },
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
            { label: 'Project Milestones 🎯', desc: 'Expand any project card and click "▸ Milestones" to reveal the milestone tracker. Add milestone steps, check them off as you complete them, and watch the progress bar advance.', tip: 'Milestones are stored in the project note body under a ## Milestones section — no separate files needed.' },
        ]
    },
    {
        id: 'finance', icon: 'lucide-credit-card', title: 'Bulsa', subtitle: 'Track bills and recurring obligations',
        items: [
            { label: 'Bulsa Ledger', desc: 'All your recurring bills and due dates in one place.' },
            { label: 'Filter Views', desc: 'Switch between All, Due Soon, Overdue, and Paid views using the segment bar.' },
            { label: 'Mark Paid', desc: 'Tap a Bulsa item to open the payment modal. Enter the payment date and next due date. MINA updates the last_payment_date and next_duedate frontmatter fields and appends a payment log entry to the bill note.', tip: 'Dates must be plain YYYY-MM-DD format (e.g. 2026-05-01). The "Paid X ago" badge reads last_payment_date.' },
            { label: 'Burn Rate', desc: 'Total monthly obligation is shown at the top — your baseline for recurring obligations.' },
            { label: 'Bill Frontmatter Contract', desc: 'Each bill note uses: active_status, next_duedate, last_payment_date, and amount. The pay button only shows for active bills that have a next_duedate set.', tip: 'Use category: recurring payment to create standard bills via the New Due modal.' },
        ]
    },
    {
        id: 'review', icon: 'lucide-calendar-check', title: 'Weekly Review', subtitle: 'Reflect and plan every week',
        items: [
            { label: 'Week at a Glance ⚡', desc: 'Auto-generated panel showing gawa completed, active projects, and Bulsa paid/overdue.', tip: 'Tap ↻ to refresh. Tap ⌄ to collapse.' },
            { label: 'Wins', desc: 'Write what went well this week — celebrate progress, big and small.' },
            { label: 'Lessons Learned', desc: 'Capture what you\'d do differently. Turns mistakes into growth.' },
            { label: 'Next Week\'s Focus', desc: 'Set 1–3 priorities for the coming week. These appear on your Home screen.' },
            { label: '📅 Next Week Plan', desc: 'Plan your coming week day by day. Each day has an intention input ("Theme for this day") and shows gawa due that day. Use "+ Assign Task" to route unscheduled gawa to specific days.', tip: 'Toggle "This Week / Next Week" to plan the current or upcoming week. On tablet, day cards display in a 7-column grid.' },
            { label: 'Gawa Assignment', desc: 'Tap "+ Assign Task" on any day card to open an inline picker of unscheduled open gawa, sorted by priority. Tap a gawa item to set its due date to that day — it appears in Focus tab automatically.' },
            { label: 'Save', desc: 'Press "Save Review" or ⌘↵ to save. Stored as Markdown in your Reviews/Weekly/ folder.', tip: 'The folder is configurable in Folder Config → Reviews Folder.' },
        ]
    },
    {
        id: 'monthly-review', icon: 'lucide-calendar-range', title: 'Monthly Review', subtitle: 'Set and track monthly goals',
        items: [
            { label: 'Navigation', desc: 'Access from the MANAGEMENT cluster in Command Center, or from the monthly goals "Edit" button.' },
            { label: 'Monthly Stats', desc: 'Auto-calculated gawa done, thoughts captured, and open gawa for the current month.' },
            { label: 'Project Progress', desc: 'Visual progress bars for each project showing done/total ratio.' },
            { label: 'Next Month\'s Focus', desc: 'Set up to 3 goals for the coming month. Saved to Reviews/Monthly/ folder.', tip: 'Persisted as Markdown so it survives plugin reinstalls.' },
        ]
    },
    {
        id: 'journal', icon: 'lucide-book-open', title: 'Journal', subtitle: 'Daily freeform writing',
        items: [
            { label: 'Desktop Layout', desc: 'Desktop Journal now opens as a split writing workspace: a left archive rail with titles only, plus a right-side composer for writing and editing.' },
            { label: 'Mobile Layout', desc: 'On mobile the Journal view shows the composer only, so you can jump straight into writing without the archive rail.' },
            { label: 'Titles & Types', desc: 'Every entry now has a dedicated title field and a journal-type pill row (Reflection, Realization, Gratitude, Idea, Note, or Free Write).' },
            { label: 'Files & Images', desc: 'Paste, drag, or attach files directly in the composer. DIWA saves them to your Attachments folder and inserts a vault-relative link inline.' },
            { label: 'Quick Access', desc: 'Use the command palette action “DIWA: Open Journal Input” to jump directly into the Journal composer, especially on mobile.' },
        ]
    },
    {
        id: 'export', icon: 'lucide-download', title: 'Export & Backup', subtitle: 'Portable copies of your data',
        items: [
            { label: 'Access', desc: 'Open from the SYSTEM cluster in Command Center (Export button).', tip: 'Run a backup before major vault reorganisations.' },
            { label: 'Export Thoughts (CSV)', desc: 'Exports all thoughts as a CSV file (title, created date, day, contexts, body). Saved to your Thoughts folder.', tip: 'Open in Excel, Numbers, or any spreadsheet app.' },
            { label: 'Export Gawa (CSV)', desc: 'Exports all gawa items as a CSV file (title, status, due date, priority, energy, contexts). Saved to your Gawa folder.' },
            { label: 'Full JSON Backup', desc: 'Creates a single JSON snapshot of thoughts, gawa, projects, Bulsa data, and plugin settings. API keys are intentionally excluded for security.', tip: 'Saved to your vault root as DIWA-backup-YYYY-MM-DD.json.' },
            { label: 'Count Badges', desc: 'Each export card shows a live count of how many items will be exported before you click.' },
        ]
    },
    {
        id: 'finance-analytics', icon: 'lucide-bar-chart-2', title: 'Bulsa Insights', subtitle: 'Cashflow overview and obligation breakdown',
        items: [
            { label: 'Access', desc: 'Open from the Bulsa tab via the "Analytics →" button in the header, or navigate directly to Bulsa Insights from Command Center.', tip: 'The Analytics button appears in the top-right of the Bulsa ledger.' },
            { label: 'Cashflow Overview', desc: 'Shows monthly income, total obligations, and net cashflow side by side. Set your monthly income in Settings → Bulsa → Monthly Income.', tip: 'Net cashflow turns red when obligations exceed income.' },
            { label: 'Obligation Bar', desc: 'A colour-coded bar shows obligations as a percentage of income. Green = healthy (<60%), orange = caution (60–80%), red = overextended (>80%).' },
            { label: 'Obligations by Category', desc: 'All active Bulsa items are grouped by category with total per group and a proportional bar. Quickly see your biggest spending areas.' },
            { label: 'Quick Stats', desc: 'At a glance: how many Bulsa items are due this week, how many are overdue, and how many have been paid this month.' },
            { label: 'No Income Set', desc: 'If monthly income is not configured, cashflow fields show "—". Add your income in Settings → Bulsa → Monthly Income to unlock the full view.' },
        ]
    },
    {
        id: 'settings', icon: 'lucide-settings', title: 'Settings', subtitle: 'configure DIWA to your workflow',
        items: [
            { label: 'Folders', desc: 'Set where thoughts, gawa, attachments, and reviews are stored in your vault. Use Folder Config for a quick modal.' },
            { label: 'Reviews Folder', desc: 'Root folder for Weekly and Monthly review files. Sub-folders Weekly/ and Monthly/ are auto-created.', tip: 'Default: 000 Bin/DIWA Reviews. Configurable in Folder Config.' },
            { label: 'Attachments Folder', desc: 'Folder where pasted or drag-dropped images and files are saved. Used by the image paste feature in capture inputs.', tip: 'Default: 000 Bin/DIWA Attachments. The folder is auto-created on first paste.' },
            { label: 'Contexts', desc: 'Manage your global context tags (#work, #personal, etc.).' },
            { label: 'Reminders', desc: 'Toggle gawa reminders. Reminders respect quiet hours (8 AM – 10 PM) and fire on mobile app resume.' },
            { label: 'Monthly Income', desc: 'Set your monthly income (number) to unlock the cashflow overview in Bulsa Insights.' },
        ]
    },
    {
        id: 'reminders', icon: 'lucide-bell', title: 'Reminders ⏰', subtitle: 'Hourly nudges for gawa',
        items: [
            { label: 'Gawa Reminders', desc: 'When enabled, DIWA checks every hour for gawa due today that are not yet marked done.' },
            { label: 'Quiet Hours', desc: 'Reminders only fire between 8 AM and 10 PM — never in the middle of the night.', tip: 'Quiet hours are based on your local device time.' },
            { label: 'Mobile-Aware', desc: 'On mobile, reminders also fire when you switch back to Obsidian (app resume via visibilitychange event).' },
            { label: 'Configuration', desc: 'Enable or disable each reminder type independently under Settings → Reminders.' },
        ]
    },
    {
        id: 'roadmap', icon: 'lucide-map', title: 'Roadmap', subtitle: 'Future direction',
        items: [
            { label: '✅ All Planned Features Shipped', desc: 'DIWA is feature-complete. All roadmap items have been implemented. Future updates will focus on polish, performance, and community requests.' },
        ]
    },
];

export class ManualTab extends BaseTab {
    private activeSectionId: string = 'home';
    private searchQuery: string = '';

    constructor(view: DiwaView) { super(view); }

    render(container: HTMLElement) {
        container.empty();
        const wrap = container.createEl('div', { cls: 'diwa-manual-wrap' });

        if (Platform.isMobile && !isTablet()) {
            this._renderMobile(wrap);
        } else {
            this._renderDesktop(wrap);
        }
    }

    // ── Desktop / Tablet: sidebar + content pane ──────────────────────────
    private _renderDesktop(root: HTMLElement) {
        root.addClass('diwa-help-root');

        const header = root.createEl('div', { cls: 'diwa-help-header' });
        const navRow = header.createEl('div', { cls: 'diwa-manual-nav-row' });
        const titleWrap = header.createEl('div', { cls: 'diwa-help-header-title' });
        const titleIcon = titleWrap.createEl('span', { cls: 'diwa-help-header-icon' });
        setIcon(titleIcon, 'lucide-book-open');
        titleWrap.createEl('h2', { text: 'DIWA Manual', cls: 'diwa-help-title' });
        titleWrap.createEl('p', { text: 'Your Personal Operating System', cls: 'diwa-help-subtitle' });

        const searchWrap = header.createEl('div', { cls: 'diwa-help-search-wrap' });
        const searchIcon = searchWrap.createEl('span', { cls: 'diwa-help-search-icon' });
        setIcon(searchIcon, 'lucide-search');
        const searchInput = searchWrap.createEl('input', {
            cls: 'diwa-help-search',
            attr: { type: 'text', placeholder: 'Search the manual…' }
        }) as HTMLInputElement;

        const body = root.createEl('div', { cls: 'diwa-help-body' });
        const sidebar = body.createEl('nav', { cls: 'diwa-help-sidebar' });
        const content = body.createEl('div', { cls: 'diwa-help-content' });

        const renderContent = () => {
            content.empty();
            const q = this.searchQuery.toLowerCase().trim();
            if (q) { this._renderSearchResults(content, q); return; }
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
                // Highlight roadmap
                if (s.id === 'roadmap') item.addClass('diwa-help-nav-item--roadmap');
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
        root.addClass('diwa-help-root');
        root.addClass('diwa-help-root--mobile');

        const header = root.createEl('div', { cls: ['diwa-help-header', 'diwa-help-header--mobile'] });
        const navRow = header.createEl('div', { cls: 'diwa-manual-nav-row' });
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
            if (query) { this._renderSearchResults(list, query.toLowerCase().trim()); return; }
            SECTIONS.forEach(s => {
                const block = list.createEl('div', { cls: 'diwa-help-accordion-block' });
                if (s.id === 'roadmap') block.addClass('diwa-help-accordion-block--roadmap');
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
        if (!hasResults) container.createEl('div', { cls: 'diwa-help-empty', text: 'No results found. Try a different search term.' });
    }
}
