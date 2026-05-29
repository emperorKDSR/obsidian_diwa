# DIWA — Personal OS for Obsidian

**DIWA** is an Obsidian plugin for capturing thoughts, managing gawa, tracking projects and Bulsa, reviewing your week, and keeping a journal from one connected workspace across desktop, tablet, and mobile.

Current release: **v10.2.11** · See [CHANGELOG.md](./CHANGELOG.md) for release history.

---

## Current module set

DIWA’s primary workspace navigation is now:

1. **Workspace**
2. **Projects**
3. **Gawa**
4. **Bulsa**
5. **Review**
6. **Journal**

Supporting tabs and tools still in the plugin:
- **Settings**
- **Bulsa Insights**
- **Monthly Review**
- **Export & Backup**

The current 10.2.11 line no longer includes the removed Search, AI, Voice, Timeline, Synthesis, or Calendar modules.

---

## Feature overview

### Workspace
- `Open Workspace` routes to the right shell for your platform.
- **Desktop:** dedicated workspace window with sidebar navigation, capture/feed center column, and right task pane.
- **Tablet:** dense touch layout with top tabs and quick actions.
- **Mobile:** bottom-nav shell for Workspace, Projects, Gawa, and thoughts.
- **Focus Mode** collapses desktop chrome so the center workspace can expand.

### Quick capture
- Capture **thoughts** and **gawa** from the same flow.
- Supports `#` contexts, `/` people insertion, `[[` note links, and `@date` triggers.
- Handles pasted or dropped files/images in supported editors.
- Keyboard shortcuts: `⌘K / Ctrl+K` to open capture, `⌘↵ / Ctrl+↵` to save.

### Projects
- YAML-backed project notes with name, goal, status, due date, and color.
- Statuses: `active`, `on-hold`, `completed`, `archived`.
- Built-in milestone tracking stored in the project note body.
- Thoughts and tasks can be linked to projects during capture or editing.

### Gawa
- Task workspace with Open / Done / Waiting / Someday organization.
- Supports due dates, priority, energy, recurrence, comments, and project links.
- Available from nav or the `Open Gawa` command.

### Bulsa
- Recurring dues ledger backed by notes in the configured Bulsa folder.
- Current ledger toggles between **Active** dues and **All History**.
- Payment logging updates fields such as `last_payment_date` and `next_duedate`.
- `Bulsa Insights` adds income, cashflow, and category breakdown views.

### Review
- **Weekly Review** summarizes work, Bulsa activity, and planning for the next week.
- Week plans support day-by-day intention setting and task assignment.
- Review notes are stored under `Reviews/Weekly/`.
- **Monthly Review** still exists as a supporting DIWA tab, but it is not pinned in the main workspace nav.

### Journal
- `Open Journal` jumps directly into the journal surface.
- Desktop uses a split archive/composer layout.
- Mobile opens directly into the composer.
- Entries support titles, journal types, and inline attachments.

### Export & backup
- `Export & Backup` remains a supporting DIWA tab rather than a main-nav module.
- Thoughts CSV is written to the thoughts folder.
- Gawa CSV is written to the gawa folder.
- Full JSON backups are written to the thoughts folder.

---

## Commands

Current command palette actions registered in `main.ts`:

- `Open Workspace`
- `Open Journal`
- `Open Gawa`
- `Open Bulsa`

---

## Architecture

```text
Composition root
  └── src/main.ts

Primary workspace routing
  ├── src/view.ts
  ├── src/views/DesktopHubView.ts
  ├── src/views/MobileHubView.ts
  ├── src/views/TabletHubView.ts
  └── src/mobile/DiwaMobileShell.ts

Feature tabs
  ├── src/tabs/GawaTab.ts
  ├── src/tabs/ProjectsTab.ts
  ├── src/tabs/DuesTab.ts
  ├── src/tabs/FinanceAnalyticsTab.ts
  ├── src/tabs/ReviewTab.ts
  ├── src/tabs/MonthlyReviewTab.ts
  ├── src/tabs/JournalTab.ts
  ├── src/tabs/ExportTab.ts
  └── src/tabs/SettingsTab.ts

Supporting services
  ├── src/services/IndexService.ts
  ├── src/services/VaultService.ts
  ├── src/services/TaskLinkService.ts
  ├── src/services/TaskReflectionService.ts
  └── src/application/RefreshCoordinator.ts
```

---

## Storage notes

DIWA primarily stores data as Markdown files with frontmatter.

Key folders and outputs:
- `thoughtsFolder` → thought notes
- `tasksFolder` → gawa notes and CSV task exports
- `pfFolder` → Bulsa notes
- `projectsFolder` → project notes
- `reviewsFolder/Weekly` → weekly review notes
- `reviewsFolder/Monthly` → monthly review notes
- `attachmentsFolder` → pasted and dropped files
- `peopleFolder` → people notes created from the `/` picker

---

## Settings reference

These are the current user-facing settings surfaces documented in the plugin UI:

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `thoughtsFolder` | `string` | `000 Bin/DIWA` | Folder for thought notes |
| `tasksFolder` | `string` | `000 Bin/DIWA Gawa` | Folder for gawa notes |
| `pfFolder` | `string` | `000 Bin/DIWA PF` | Folder for Bulsa notes |
| `peopleFolder` | `string` | `000 Bin/DIWA People` | Folder used by the people picker |
| `attachmentsFolder` | `string` | `000 Bin/DIWA Attachments` | Folder for pasted/dropped files |
| `newNoteFolder` | `string` | `000 Bin` | Default folder for newly created notes |
| `reviewsFolder` | `string` | `000 Bin/DIWA Reviews` | Root folder for weekly/monthly reviews |
| `dateFormat` | `string` | `YYYY-MM-DD` | Display/storage date format |
| `timeFormat` | `string` | `HH:mm` | Display/storage time format |
| `monthlyIncome` | `number` | `0` | Used by Bulsa Insights cashflow views |
| `mobileBottomBarHeight` | `number` | `56` | Reserved space for the Obsidian mobile toolbar |

---

## Build & deploy

```bash
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` into:

```text
<vault>/.obsidian/plugins/diwa/
```
