export interface HelpItem { label: string; desc: string; tip?: string; }
export interface HelpSection { id: string; icon: string; title: string; subtitle: string; items: HelpItem[]; }

export const HELP_SECTIONS: HelpSection[] = [
    {
        id: 'workspace',
        icon: 'layout-dashboard',
        title: 'Workspace',
        subtitle: 'The current DIWA control center',
        items: [
            {
                label: 'Open Workspace',
                desc: 'Use the ribbon icon or the command palette action “Open Workspace”. DIWA opens the desktop workspace on desktop, the tablet shell on tablets, and the mobile shell on phones.',
            },
            {
                label: 'Navigation Order',
                desc: 'The primary module order is Workspace, Projects, Gawa, Bulsa, Review, Journal. Settings and Manual stay in the utility area.',
                tip: 'This is the current workspace order across the main desktop navigation.',
            },
            {
                label: 'Desktop Layout',
                desc: 'Desktop opens a dedicated workspace with a left navigation rail, a center capture and thought feed, and a right task pane.',
            },
            {
                label: 'Mobile & Tablet Shell',
                desc: 'Phones use a bottom navigation shell. Tablets switch to a denser touch layout with top tabs, quick actions, and the same shared DIWA data.',
            },
            {
                label: 'Focus Mode 🎯',
                desc: 'On desktop, the target button collapses the sidebar and right task pane so the center workspace can take over.',
                tip: 'Use it when you want capture and the feed to stay front and center.',
            },
        ],
    },
    {
        id: 'capture',
        icon: 'plus-circle',
        title: 'Quick Capture',
        subtitle: 'Capture thoughts and gawa without leaving the flow',
        items: [
            {
                label: 'Capture a Thought',
                desc: 'Start in THOUGHT mode, type your note, and save. Thoughts are stored as Markdown files in your configured thoughts folder.',
            },
            {
                label: 'Capture a Task',
                desc: 'Switch to TASK mode to add due date, recurrence, priority, energy, status, and project context before saving.',
            },
            {
                label: 'Smart Date Triggers',
                desc: 'Type @tomorrow, @monday, or a plain date like @2026-05-01 to set a due date quickly while writing.',
                tip: 'Examples: “Send invoice @friday” or “Fix bug @tomorrow”.',
            },
            {
                label: 'Contexts, People, and Links',
                desc: 'Use # to attach context tags, / to insert people notes, and [[ to pick a vault note link inline.',
            },
            {
                label: 'Files & Images',
                desc: 'Paste or drag files directly into supported thought, task, and journal inputs. DIWA saves them to your attachments folder and inserts a vault-relative link.',
            },
            {
                label: 'Keyboard Shortcuts',
                desc: '⌘K / Ctrl+K opens capture. ⌘↵ / Ctrl+↵ saves. Esc cancels.',
            },
        ],
    },
    {
        id: 'thoughts',
        icon: 'brain',
        title: 'Thoughts',
        subtitle: 'Process ideas from the workspace feed',
        items: [
            {
                label: 'Workspace Feed',
                desc: 'The workspace feed surfaces recent thoughts with context filters, search, and quick actions so you can keep processing from the center column.',
            },
            {
                label: 'Convert to Task',
                desc: 'Supported thought cards can be turned into gawa while keeping the source thought relationship intact.',
            },
            {
                label: 'Edit & Reply',
                desc: 'Open a thought to revise the content, add replies, attach a project, or clean it up without leaving DIWA.',
            },
        ],
    },
    {
        id: 'projects',
        icon: 'briefcase',
        title: 'Projects',
        subtitle: 'Track multi-step work and milestones',
        items: [
            {
                label: 'Create & Edit',
                desc: 'Create projects with a name, goal, status, due date, and color. Edit existing cards directly from the Projects tab.',
            },
            {
                label: 'Statuses',
                desc: 'Projects can be Active, On Hold, Completed, or Archived. Archived projects fall out of active views.',
            },
            {
                label: 'Milestones',
                desc: 'Projects support milestone checklists stored in the project note body so progress stays close to the work.',
            },
            {
                label: 'Link from Capture',
                desc: 'Thoughts and tasks can be linked to a project during capture or while editing later.',
            },
        ],
    },
    {
        id: 'gawa',
        icon: 'check-square-2',
        title: 'Gawa',
        subtitle: 'Your tactical task workspace',
        items: [
            {
                label: 'Open Gawa',
                desc: 'Use the main navigation or the command palette action “Open Gawa” to jump straight into the task workspace.',
            },
            {
                label: 'Status Filters',
                desc: 'Gawa is organized around Open, Done, Waiting, and Someday so you can review the right queue at the right time.',
            },
            {
                label: 'Edit, Complete, Comment',
                desc: 'Open a task to update details, mark it done, add comments, or review the linked source thought chain.',
            },
            {
                label: 'Priority, Energy, Recurrence',
                desc: 'Each gawa item can carry priority, energy, due date, and recurrence metadata for day-to-day planning.',
            },
        ],
    },
    {
        id: 'bulsa',
        icon: 'credit-card',
        title: 'Bulsa',
        subtitle: 'Recurring dues and financial obligations',
        items: [
            {
                label: 'Open Bulsa',
                desc: 'Use the main navigation or the command palette action “Open Bulsa” to open the Bulsa ledger.',
            },
            {
                label: 'Ledger Views',
                desc: 'Bulsa currently switches between Active dues and All History rather than using a separate main-nav area.',
            },
            {
                label: 'Add Due',
                desc: 'Create recurring payment notes from the Bulsa header. DIWA stores them in your configured Bulsa folder.',
            },
            {
                label: 'Mark Paid',
                desc: 'Paying a Bulsa item updates fields such as last_payment_date and next_duedate and keeps the note history current.',
            },
        ],
    },
    {
        id: 'bulsa-insights',
        icon: 'bar-chart-2',
        title: 'Bulsa Insights',
        subtitle: 'Cashflow and obligation summary',
        items: [
            {
                label: 'Access',
                desc: 'Open Bulsa Insights from the Bulsa header button. It is a supporting finance surface rather than a primary workspace nav item.',
            },
            {
                label: 'Cashflow Overview',
                desc: 'See monthly income, total obligations, and net cashflow in one view.',
            },
            {
                label: 'Category Breakdown',
                desc: 'Active Bulsa items are grouped by category so you can spot the biggest recurring costs quickly.',
            },
            {
                label: 'Monthly Income Setting',
                desc: 'Set Monthly Income in Settings to unlock the full cashflow view and the obligation ratio bar.',
            },
        ],
    },
    {
        id: 'review',
        icon: 'calendar-check',
        title: 'Weekly Review',
        subtitle: 'Reflect, assess, and plan the next week',
        items: [
            {
                label: 'Week at a Glance',
                desc: 'Weekly Review summarizes completed gawa, active projects, and Bulsa activity for the week.',
            },
            {
                label: 'Wins, Lessons, Focus',
                desc: 'Capture what went well, what changed your thinking, and what should lead the coming week.',
            },
            {
                label: 'Next Week Plan',
                desc: 'Plan Monday through Sunday with day themes and task assignment support directly inside the review.',
            },
            {
                label: 'Previous Week Card',
                desc: 'Open the previous review in read-only form without leaving the current week.',
            },
            {
                label: 'Save Location',
                desc: 'Weekly reviews are saved as Markdown under Reviews/Weekly inside your configured reviews folder.',
            },
        ],
    },
    {
        id: 'monthly-review',
        icon: 'calendar-range',
        title: 'Monthly Review',
        subtitle: 'A supporting monthly goals surface',
        items: [
            {
                label: 'Availability',
                desc: 'Monthly Review still exists as a DIWA tab, but it is not pinned in the primary workspace navigation.',
                tip: 'Treat it as a supporting review surface rather than a main module.',
            },
            {
                label: 'Monthly Stats',
                desc: 'When opened, it shows current-month gawa completion, thought volume, open gawa count, and project progress.',
            },
            {
                label: 'Next Month Focus',
                desc: 'Three monthly goal inputs are stored in the monthly review note and mirrored into settings for convenience.',
            },
            {
                label: 'Save Location',
                desc: 'Monthly review notes are stored under Reviews/Monthly inside your configured reviews folder.',
            },
        ],
    },
    {
        id: 'journal',
        icon: 'book-open',
        title: 'Journal',
        subtitle: 'A focused writing space inside DIWA',
        items: [
            {
                label: 'Open Journal',
                desc: 'Use the command palette action “Open Journal” to jump straight into the Journal surface.',
            },
            {
                label: 'Desktop Split Layout',
                desc: 'Desktop Journal uses a left archive rail with a right-side composer so you can browse and write at the same time.',
            },
            {
                label: 'Mobile Composer',
                desc: 'On mobile, Journal opens directly into the composer to keep capture fast and touch-friendly.',
            },
            {
                label: 'Titles, Types, Attachments',
                desc: 'Entries support dedicated titles, journal-type pills, and inline file or image attachments.',
            },
        ],
    },
    {
        id: 'export',
        icon: 'download',
        title: 'Export & Backup',
        subtitle: 'Supplemental export tools for DIWA data',
        items: [
            {
                label: 'Availability',
                desc: 'Export & Backup remains a supporting DIWA tab and is not pinned in the main workspace sidebar.',
            },
            {
                label: 'Thoughts CSV',
                desc: 'Exports every thought to DIWA_Export_Thoughts.csv inside your configured thoughts folder.',
            },
            {
                label: 'Gawa CSV',
                desc: 'Exports every task to DIWA_Export_Tasks.csv inside your configured gawa folder.',
            },
            {
                label: 'Full Backup',
                desc: 'Creates DIWA_Backup_YYYYMMDD.json in your thoughts folder with thoughts, tasks, projects, and a safe settings snapshot.',
            },
            {
                label: 'Live Counts',
                desc: 'The export cards show live counts before you run an export so you can verify scope at a glance.',
            },
        ],
    },
    {
        id: 'settings',
        icon: 'settings',
        title: 'Settings',
        subtitle: 'Tune DIWA storage, formats, and behavior',
        items: [
            {
                label: 'Folder Config',
                desc: 'Configure folders for thoughts, gawa, Bulsa, people, attachments, new notes, and reviews.',
            },
            {
                label: 'Formats',
                desc: 'Date format, time format, and mobile bottom bar height are managed from plugin settings.',
            },
            {
                label: 'Contexts',
                desc: 'Use the settings screen to scan the vault for contexts and keep your tag list current.',
            },
            {
                label: 'Finance Settings',
                desc: 'Monthly Income lives in settings and powers Bulsa Insights cashflow calculations.',
            },
        ],
    },
];
