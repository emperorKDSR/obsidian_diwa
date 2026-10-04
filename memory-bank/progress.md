# Progress: DIWA — Personal OS

## Current Phase: Uniform Neutral Styling for Gawa Header Pill (Complete)

---

### 0. Uniform Neutral Styling for Gawa Header Pill (Complete)
*   [x] **Prune Persistent Accent Override (`styles.css`)** — Removed `.pos-gawa-header-trigger` custom accent override (`color: var(--text-accent)`, `background: rgba(var(--accent-rgb), 0.08)`, and border accent), allowing the Gawa launcher pill to cleanly inherit `.pos-header-text-btn`.
*   [x] **Visual Parity with Header Action Pills** — Verified that Gawa pill matches `Select` and `Digest` with neutral pill styling on idle, highlighting with accent only on active hover states.
*   [x] **Zero Build Errors & Production Deployment** — Passed `npm run build` cleanly and deployed `styles.css`, `main.js`, and `manifest.json` directly to active vaults `/Users/K26/Obsidian/K0000` & `K0001`.

---

### 0. Mobile Navigation Bar Hidden by Default for Scratchpad Workspace (Complete)
*   [x] **Mount Lifecycle Guarantee (`src/views/DesktopHubView.ts`)** — In `onOpen()`, asserted `document.body.addClass('diwa-hide-mobile-navbar')` on mobile phones (`Platform.isMobile && !isTablet(this.app)`), ensuring restored tabs or newly opened leaves immediately hide the bottom bar.
*   [x] **Workspace Activation & Startup Restore (`src/main.ts`)** — Wired `diwa-hide-mobile-navbar` into `plugin.activateWorkspace()` and `app.workspace.onLayoutReady` when the active view on launch is `DesktopHubView`.
*   [x] **Robust Leaf Change & Device Guard (`src/main.ts`)** — Enhanced `active-leaf-change` listener to match all scratchpad view types (`DesktopHubView`, `VIEW_TYPE_DESKTOP_HUB`, `VIEW_TYPE_MOBILE_HUB`, `VIEW_TYPE_TABLET_HUB`). Reverts to normal navbar when switching away or when on desktop/tablet.
*   [x] **Zero Build & Lint Errors** — Strict `tsc --noEmit --skipLibCheck` and `npm run build` both passed with 0 errors.

---

### 0. Universal Task Deduplication & Block ID Cleaning (Complete)
*   [x] **Block ID Sanitization (`src/services/IndexService.ts`)** — Stripped Obsidian block reference IDs (`\s*\^[a-zA-Z0-9_-]+$`, e.g. `^dw-2ppuu4-b1`) from `cleanTitle` and task signatures, keeping Karon and Gawa clean and ensuring identical tasks match.
*   [x] **Universal Deduplication Engine (`src/services/IndexService.ts`)** — Extended `getGawaTasks()` to deduplicate tasks across all sources: multiple project notes, within the same file, and between capture notes and permanent notes.
*   [x] **Multi-Location Sync Toggling (`src/services/CaptureService.ts`)** — Tracks every duplicate location in `shadowedLocations` and checks/unchecks all copies simultaneously when toggled.
*   [x] **Zero Build & Lint Errors** — Strict `tsc --noEmit --skipLibCheck` and `npm run build` both passed with 0 errors.
*   [x] **Production Vault Deployment** — Deployed `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` vault plugin directories.

---

### 0.1. Configurable Additional Task Folders (Complete)
*   [x] **Settings & Data Types (`src/types.ts` & `src/constants.ts`)** — Added `additionalTaskFolders?: string[]` to `DiwaSettings` with default `[]`.
*   [x] **Settings Tab UI (`src/settings.ts`)** — Added `Additional Task Folders` textarea input in **Storage & Workspace** supporting comma- or newline-separated folder paths, with live sanitization and instant index rebuild.
*   [x] **Unified Multi-Folder Task Indexing (`src/services/IndexService.ts`)** — Implemented `getConfiguredAdditionalTaskFolders()`, `isAdditionalTaskFile()`, `isTrackedProjectFile()`, and expanded `indexTrackedProjectTaskFiles()` to index files across all specified folders in parallel chunks of 50 with `_taskFileMtime` caching.
*   [x] **Granular Refresh Coordination (`RefreshCoordinator.ts` & `src/main.ts`)** — Updated `RefreshCoordinator.reindexFile()` to detect modifications in additional task folders and tracked files, indexing only the modified file and dispatching targeted `tasks` refresh. Wired `create`, `delete`, and `rename` vault events.
*   [x] **Gawa & Karon Multi-Folder Integration** — Verified that tasks across additional folders appear in Gawa Cockpit (table, search, filters) and Karon Horizon (Today, upcoming days, overdue alerts), while keeping continuous scratchpad inbox strictly scoped to `captureFolder`.
*   [x] **Zero Build & Lint Errors** — Strict `tsc --noEmit --skipLibCheck` and `npm run build` both passed with 0 errors.
*   [x] **Production Vault Deployment** — Deployed `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` vault plugin directories.

---

### 0.1. Karon: Today & Horizon View (Complete)
*   [x] **Target Date Secondary Index (`src/services/IndexService.ts`)** — Added in-memory `targetDateIndex: Map<string, Set<string>>` for $O(1)$ retrieval of notes intended for any date via `[[YYYY-MM-DD]]` wikilinks, frontmatter `due`/`scheduled`/`day`, or task due dates.
*   [x] **Query Methods & Snippet Extraction (`src/services/IndexService.ts`)** — Implemented `getCapturesForTargetDate`, `getTasksForDueDate`, `getOverdueTasks`, and `extractTargetDateSnippets`.
*   [x] **Dedicated Leaf View (`src/views/KaronView.ts`)** — Built Option A (Chronological Agenda Stream):
    *   Top Header with active date, subtitle, and horizon switcher (`[ ☀️ Today ]`, `[ 📅 3 Days ]`, `[ 🗓️ 7 Days ]`).
    *   Collapsible **Overdue Tasks Banner** with red accent and instant checkbox completion.
    *   Chronological Day Accordions (`Today`, `Tomorrow`, `D+2` through `D+7`) with task/note summary pills and collapsible sections.
    *   **Tasks Due** list with interactive checkboxes updating via `CaptureService.toggleTaskInFile`, area tags, and source jump buttons.
    *   **Notes Intended for Day** cards rendering extracted date-relevant snippets via `MarkdownRenderer` and internal link peeking via `WikilinkPeekModal`.
*   [x] **Constants & Custom Icon (`src/constants.ts`)** — Registered `VIEW_TYPE_KARON = 'diwa-karon'`, custom sunrise SVG icon (`KARON_ICON_ID`, `KARON_ICON_SVG`).
*   [x] **Plugin Registration & Synergies (`src/main.ts`, `DesktopHubView.ts`, `RefreshCoordinator.ts`)** — Registered view, icon, ribbon launcher, and command `DIWA: Open Karon (Today & Horizon)`. Added 1-tap `[ ☀️ Karon ]` header trigger in `DesktopHubView`. Connected to `RefreshCoordinator` for 0ms multi-view reactivity.
*   [x] **Clean Styles (`styles.css`)** — Namespaced `.pos-karon-*` CSS classes with smooth hover effects, checkbox styling, and Obsidian theme variables.
*   [x] **Zero Build & Lint Errors** — Passed strict `tsc --noUnusedLocals --noUnusedParameters --noEmit --skipLibCheck` (0 errors) and `npm run build` (0 errors).
*   [x] **Production Vault Deployment** — Deployed `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` vault plugin directories.

---

### 0. Scratchpad Note Horizon & Rolling Window (Complete)
*   [x] **Rolling Horizon Data Model (`src/types.ts` & `src/constants.ts`)** — Added `scratchpadHorizon: 'today' | '3d' | '7d' | '14d' | '30d' | 'all' | 'custom'` (default `'7d'`), `keepImportantInScratchpad: boolean` (default `true`), and `scratchpadCustomDate?: string`.
*   [x] **Natural Language & ISO Date Parser (`src/utils/dateParsing.ts`)** — Created flexible date parser supporting `YYYY-MM-DD`, `August 1, 2026`, `Aug 1 2026`, and localized date formats via `moment` and `chrono-node`.
*   [x] **Settings Tab UI (`src/settings.ts`)** — Added horizon dropdown selector in "Storage & Workspace", dynamic custom start date input with `📅 Pick Date` button (`DatePickerModal`) and `✕ Clear` button, and "Always Show Important Notes (⭐)" toggle.
*   [x] **Index Horizon Filtering (`src/services/IndexService.ts`)** — Implemented `getScratchpadCutoffTimestamp()`, `getScratchpadHorizonLabel()`, and `isEntryInScratchpad()`. Automatically filters notes and synchronizes filter badge counts (`All Notes`, `Open Tasks`, `Important`, `Today`, `Upcoming`, `Untagged`, Life Areas).
*   [x] **Global Search Archive Access (`DesktopHubView.ts`)** — Browsing feed respects rolling horizon; typing a search query automatically searches the entire vault archive (`getAllCaptures(true)`) so older notes are instantly searchable.
*   [x] **Header Horizon Indicator & Empty State (`DesktopHubView.ts`)** — Displays active horizon in the header subtitle (e.g. `Personal OS · Last 7 Days`) and updates empty state messaging.
*   [x] **Digested Note Exclusion Fix (`DesktopHubView.ts` & `IndexService.ts`)** — Corrected stream filter logic so `digested: true` notes are strictly hidden from the default `All Notes` feed, achieving true Inbox Zero upon note digestion.
*   [x] **Block-Level Comment Hiding on Digestion (Option B)** — Implemented non-destructive comment wrapping (`%% diwa-digested:dest=[[Target]]\n<content>\n%%`) in `CaptureService.ts`. Allows notes with both digested and "Keep in Scratchpad" blocks to retain only the kept blocks in the scratchpad stream with 0% data loss.
*   [x] **Comment Stripping & RawBody Dual-Pipeline (`IndexService.ts` & `CalendarDigestView.ts`)** — Strips comments for scratchpad feed while preserving `rawBody` for Calendar Review and digest parsing, preventing empty-body digest lockouts.
*   [x] **Clean Reset Status Unwrapping (`CaptureService.ts`)** — Added `unwrapDigestedComments()` to cleanly unwrap comments and restore notes when resetting status.
*   [x] **Zero Build & Lint Errors** — Passes `tsc --noEmit --skipLibCheck` and `npm run build` with zero errors.
*   [x] **Vault Deployment** — Deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` vault plugin folders.

### 0. Calendar Digest & Review View (Complete)
*   [x] **Master-Detail Calendar View (`CalendarDigestView.ts`)** — Implemented dedicated workspace leaf (`VIEW_TYPE_CALENDAR_DIGEST = 'diwa-calendar-digest'`) with interactive left calendar rail (~280px) and center stage note stream.
*   [x] **Global Obsidian Command & Launchers** — Registered `DIWA: Open Daily Digest & Review`, custom calendar icon (`CALENDAR_DIGEST_ICON_ID`), ribbon launcher, and 1-tap `[ 📅 Digest ]` button in `DesktopHubView` header.
*   [x] **Block-Level AST Parser (`CaptureService.ts`)** — Structured block parser grouping parent tasks with child subtasks and remarks, code fences, and paragraphs into atomic `DigestibleBlock` units.
*   [x] **Wikilink & Heuristic Destination Resolver** — Filters out temporal date links (`[[YYYY-MM-DD]]`), detects explicit routing syntax (`-> [[Target]]`), and prioritizes topic/project links over people and entities.
*   [x] **Reverse-Chronological Top Insertion** — Injects newest entries beneath `## Tasks` (for open tasks) and `## Log` (for notes and completed tasks), strictly preserving YAML frontmatter and document title headings.
*   [x] **Pre-Flight Confirmation Modal (`PreFlightDigestModal.ts`)** — Review modal showing blocks, task/log pills, destination buttons, `FileSuggestModal` note picker, and task routing choices before writing. Now renders full Markdown (`MarkdownRenderer.render`) with visual image embeds (`![[...] ]`) and clean containment styling. Displays Life Area pill badges on blocks.
*   [x] **Life Area Block Persistence (`CaptureService.ts`)** — Automatically carries forward the source capture's life area onto digested blocks as an inline `#<area>` tag upon digestion. Reconciles both tasks and thoughts cleanly without duplicate tags, allowing Gawa to index the task's life area accurately while keeping title displays clean. Supports inline `#<area>` updating on project task files via Inspector.
*   [x] **Gawa Cockpit Project Task Synergy (`IndexService.ts`)** — Tasks moved to permanent project notes are registered in `projectTaskIndex` and remain active, interactive, and checkable in `GawaCockpitView.ts`, with `Source ↗` linking to the project file.
*   [x] **Scratchpad "Inbox Zero" Flow (`DesktopHubView.ts`)** — Digested notes are hidden from the primary capture feed by default to maintain Inbox Zero, while remaining accessible on demand and preserved on their calendar dates.
*   [x] **Mobile Responsive Design** — Segmented control `[ 📅 Calendar | 📝 Stream (N) ]` for smooth interaction on mobile viewports.
*   [x] **Zero Build & Lint Errors** — `npx tsc --noUnusedLocals --noUnusedParameters --noEmit --skipLibCheck` (0 errors) and `npm run build` (0 errors).
*   [x] **Production Vault Deployment** — Deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` vault plugin directories.

---

### 0.1. Gawa Tabular Task Cockpit & Slide-Over Inspector (Complete)
*   [x] **Dedicated Leaf Architecture (`VIEW_TYPE_GAWA_COCKPIT`)** — Implemented `GawaCockpitView.ts` as an autonomous workspace leaf that can be opened in split panes, right sidebars, or tabs. Registered custom checklist SVG icon and ribbon launcher.
*   [x] **Global Obsidian Command & Header Trigger** — Registered `DIWA: Open Gawa Task Cockpit` and added 1-tap `[ 📋 Gawa (N) ]` launcher button to `DesktopHubView` header.
*   [x] **Earliest Due Date Resolution ("Earliest Date Wins")** — Enhanced `IndexService.ts` to scan wikilinks `[[YYYY-MM-DD]]`, Tasks emojis `📅`, Dataview `[due::]`, `@dates`, and ISO dates, sorting ascending and picking the earliest date as `dueDate`.
*   [x] **Life Area Resolution** — Auto-detects `#tags` matching configured life areas (`#work`, `#health`, etc.) with fallback to parent note frontmatter `area`.
*   [x] **Data Grid Tabular View** — Built high-density table with interactive sortable columns (`Status`, `Task Title ↕`, `Due Date ↕`, `Life Area ↕`, `Remarks`, `Source ↗`).
*   [x] **Horizon Filter Chips** — Dynamic chips for `[ All Open ]`, `[ 🔴 Overdue ]`, `[ 🟡 Today ]`, `[ 🟢 Upcoming ]`, and `[ ⚪ Undated ]` with real-time counts.
*   [x] **UX Option 2: Slide-Over Task Inspector** — 440px desktop slide-over panel / mobile bottom sheet for in-place title editing, 1-tap due date popover (`Today`, `Tomorrow`, `+7d`, `Clear`), interactive Life Area chips, and indented child remarks editor.
*   [x] **Indented Child Remarks Storage** — Parses and stores remarks as standard Markdown indented child lines (`    - remark`), preserving 100% Obsidian ecosystem compatibility.
*   [x] **4 User Enhancements & 2 Bug Fixes**:
    *   [x] **Wikilink Rendering in Titles**: Titles render live markdown and `[[wikilinks]]` via `MarkdownRenderer`, peeking notes with `WikilinkPeekModal`.
    *   [x] **Icon-Only Source Column**: Converted source column to compact icon button (`file-text`) with tooltip showing note title.
    *   [x] **Inspector Sizing & Life Area Chips**: Expanded inspector width and replaced tiny dropdown with large interactive selector chips.
    *   [x] **Interactive Notes & Comments List in Inspector**: Full notes & comments list with rendered markdown, internal link peeking, individual delete buttons (`🗑️`), dedicated note composer (`+ Add Note` / `⌘Enter`), and instant in-place re-rendering.
    *   [x] **Bug Fix: Never Add Life Area Tag to Task Title**: Fixed `CaptureService.updateTaskDetailsInFile` to never append `#<areaId>` to the task title line. Life Area updates now strictly update the parent note's frontmatter `area: "<areaId>"`. Stripped redundant life area tags from `cleanTitle`.
*   [x] **Subtasks Enhancement (Option A: Inspector-Centric Management)**:
    *   [x] **Data Model & Parsing**: Added `GawaSubtaskItem` and parsed indented `- [ ]` lines into `subtasks: GawaSubtaskItem[]` in `IndexService.ts`.
    *   [x] **Table Progress Pill**: Displayed `[ ☑ 1/3 ]` (and green `[ ✓ 3/3 ]`) in table title column with 1-click Inspector navigation.
    *   [x] **Inspector Subtasks Section**: Added completion count `(N/M)`, progress rail, interactive checkbox checklist, individual delete buttons (`🗑️`), and quick-add input (`Enter`).
    *   [x] **Atomic Persistence & Cascade**: `CaptureService.updateTaskDetailsInFile` atomically writes `    - [x]` lines, and parent completion cascades to child subtasks.
    *   [x] **Bug Fix: Subtask Deletion & Toggling Duplication**: Corrected `IndexService.ts` line indexing so parent task line index is preserved (`parentLineIdx = i`) rather than overwritten with child line index. Enforced parent task validation in `CaptureService.ts` and in-place re-synchronization in `GawaCockpitView.ts`. Removed duplicates in test vault note.
*   [x] **Gawa Mobile Stream-Aligned Experience**:
    *   [x] **Concise 2-Column Table**: Condensed mobile view to `Status` and `Title` only. Non-essential desktop columns are hidden seamlessly on mobile.
    *   [x] **Subtle Typography Due Date**: Appended non-imposing `(Due: YYYY-MM-DD)` directly inline with task titles using muted secondary color (`--text-muted`, 0.82em).
    *   [x] **Minimalist Mobile Header**: Stripped top search box, area select dropdown, and horizon chips on mobile.
    *   [x] **1-Row Floating Action Bar**: Rendered floating bottom action bar with `+` New Task FAB, `search` toggle, `sliders-horizontal` filter lenses, `rotate-cw` refresh, and `panel-bottom` navigation toggle.
    *   [x] **Obsidian Mobile Navigation Bar Toggle (Default Hidden)**: Defaulted `diwa-hide-mobile-navbar` on mobile mount and wired up floating action button 5 to toggle Obsidian bottom navbar visibility with instant user feedback.
    *   [x] **Pinned Mobile Task Inspector (Locked Position & Unblurred Interactivity)**: Pinned mobile inspector firmly to bottom (`left: 0; right: 0; width: 100vw; min-width: 0`), fixed stacking context issue by placing backdrop inside `_mainStageEl` before inspector (`z-index: 998` backdrop vs `1000` inspector) to eliminate blur overlay and unresponsiveness, removed WebKit blur filter on backdrop, added `pointer-events: auto` and `overflow-y: auto`, hide floating action bar while open, and enabled tap-to-close on dark overlay.
    *   [x] **Gawa Filter Bottom Sheet (`GawaFilterSheetModal`)**: Bottom sheet with drag handle, horizon filter chips (`All`, `Overdue`, `Today`, `Upcoming`, `Undated`), and life area selector grid.
    *   [x] **Gawa Quick Task Modal (`GawaQuickTaskModal`)**: Rapid task entry modal with quick due date chips (`Today`, `Tomorrow`, `+7 Days`) and life area selector.
*   [x] **Atomic Disk Persistence (`CaptureService.updateTaskDetailsInFile`)** — Atomically updates task titles, due dates, frontmatter life areas, subtasks, and child remark lines via `app.vault.process()` with line index drift protection.
*   [x] **0ms Bi-Directional Interoperability** — Integrated `RefreshCoordinator` to broadcast `'tasks'` refresh events to both `DesktopHubView` and `GawaCockpitView`. Toggling in either view updates the other in 0ms without scroll jumping.
*   [x] **Zero Build & Lint Errors** — Passes `npx tsc --noUnusedLocals --noUnusedParameters --noEmit --skipLibCheck` (0 errors) and `npm run build` (0 errors).
*   [x] **Production Vault Deployment** — Deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000/.obsidian/plugins/Obsidian_diwa/` and `/Users/K26/Obsidian/K0001/.obsidian/plugins/Obsidian_diwa/`.

---

### 0.1. Complete Dead Code Cleanup & Production Deployment (Complete)
*   [x] **Prune Unreachable Branches in `RefreshCoordinator.ts`** — Removed unused `_suppressNotifyRefreshUntil` and unreachable deferral checks in `notifyRefresh()` and `_dispatchRefresh()`.
*   [x] **Prune Unused Methods in `main.ts`** — Removed uncalled `updateSettingsBatch()` and unused `hiddenContexts` sanitization.
*   [x] **Deduplicate Core Utilities** — Removed redundant `ensureVaultFolder` in `src/utils.ts` and imported canonical implementation from `src/utils/vaultFiles.ts`.
*   [x] **Remove Dead Functions** — Removed unreferenced `getCanonicalCaptureFolder` and unused imports from `src/utils/settingsPaths.ts`.
*   [x] **Prune Unused Types & Attributes** — Stripped `color` from `LifeArea`, `rawLine` from `CaptureTaskItem` (and `IndexService.ts`), and `hiddenContexts` from `DiwaSettings` and `DEFAULT_SETTINGS`.
*   [x] **Zero Build & Lint Errors** — Verified with `npx tsc --noUnusedLocals --noUnusedParameters --noEmit --skipLibCheck` (0 errors) and `npm run build` (0 errors).
*   [x] **Production Vault Deployment** — Deployed fresh `main.js`, `manifest.json`, and `styles.css` to `/Users/K26/Obsidian/K0000/.obsidian/plugins/obsidian_DIWA/` and `/Users/K26/Obsidian/K0001/.obsidian/plugins/obsidian_DIWA/`.

### 0. Comprehensive Legacy & Obsolete Code Pruning (Complete)
*   [x] **Delete Dead Modals (18 Files / -5,202 Lines)** — Deleted `EditTaskModal.ts`, `EditEntryModal.ts`, `EditThoughtModal.ts`, `FastTaskCaptureModal.ts`, `MobilePostComposerModal.ts`, `PaymentModal.ts`, `InlineContextPickerModal.ts`, `CommentModal.ts`, `ZenCaptureModal.ts`, `FolderSettingsModal.ts`, `RenameNoteModal.ts`, `ViewCommentsModal.ts`, `NewDueModal.ts`, `ChooseNoteModal.ts`, `ConvertToTaskModal.ts`, `ThoughtPickerModal.ts`, `ConfirmModal.ts`, `NotePickerModal.ts`.
*   [x] **Delete Dead Utils (13 Files / -2,600 Lines)** — Deleted `editorFormatting.ts`, `weeklyReview.ts`, `taskScheduler.ts`, `taskEngine.ts`, `focusEngine.ts`, `taskComments.ts`, `canvasBuilder.ts`, `InlineTopicInput.ts`, `taskModel.ts`, `taskReflection.ts`, `taskAdapter.ts`, `base64.ts`, `topics.ts`.
*   [x] **Delete Dead Services & Legacy Controllers (7 Files / -1,936 Lines)** — Deleted `TaskController.ts`, `ThoughtController.ts`, `ThoughtIndex.ts`, `ThoughtProcessor.ts`, `TaskLinkService.ts`, `TaskReflectionService.ts`, `FocusService.ts`.
*   [x] **Streamline Core Services (`VaultService` & `IndexService`)** — Stripped obsolete Bulsa (dues), weekly reviews, comment blocks, and legacy task management methods. Focused `IndexService` strictly on fast `CaptureEntry` indexing and facet counts.
*   [x] **Streamline Plugin Entrypoint & Settings (`main.ts`, `settings.ts`, `constants.ts`, `types.ts`)** — Stripped markdown table migration logic, `TaskIndexCompat` shim, unused icon registrations, legacy folder settings (`pfFolder`, `reviewsFolder`, `thoughtsFolder`, `tasksFolder`), and dead types.
*   [x] **Zero Build Errors & Vault Deployed** — `npm run build` passed cleanly (0 errors); bundle deployed to `/Users/K26/Obsidian/K0000` & `K0001`.

### 0.1. Desktop Stream Autohide Pills (Minimalist Stream)
*   [x] **Autohide Badges on Idle** — Styled `.pos-area-badge`, `.pos-tag-badge`, and `.pos-date-badge` with `opacity: 0; pointer-events: none;` on idle.
*   [x] **Hover Reveal Animation** — Smooth fade-in transition (`opacity: 1; pointer-events: auto;`) on `.pos-note-stream-item:hover`.
*   [x] **Compact Minimalist Timeline** — Stream cards default to clean timestamp and body text without visual metadata clutter.
*   [x] **Zero-Error Compilation** — Verified with `npm run build` (0 errors).

### 0.1. Journal Dead Code Removal
*   [x] **Delete Dead Files & Directory** — Deleted `src/modals/JournalEntryModal.ts` (-65 lines), `src/journal/JournalComposer.ts` (-70 lines), `src/journal/shared.ts` (-53 lines), and removed `src/journal/`.
*   [x] **Relocate Core Utility** — Moved `getThoughtDisplayTitle` to `src/utils.ts`.
*   [x] **Clean Up Types & Frontmatter** — Removed `journalType` from `ThoughtEntry` in `src/types.ts`, `IndexService.ts`, `VaultService.ts`, and `ThoughtController.ts`.
*   [x] **Clean Up Plugin Entrypoint** — Removed `JOURNAL_ICON_ID`, `JOURNAL_ICON_SVG`, `activateJournalInput()`, `consumeJournalInputFocusRequest()`, and `pendingJournalInputFocus` from `src/main.ts` and `src/constants.ts`.
*   [x] **Zero-Error Compilation** — Verified with `npm run build` (0 errors).

### 0.1. Legacy Gawa & Bulsa Dead Code Removal
*   [x] **Delete Dead Files** — Deleted `src/gawaLayout.ts` (-186 lines) and `src/modals/GawaLayoutCustomizeModal.ts` (-312 lines).
*   [x] **Remove Dead Types** — Stripped `GawaPaneId`, `GawaLayoutPreferences`, `BulsaLeafState`, `BulsaMode`, and `ResponsiveShellState` from `src/types.ts`.
*   [x] **Clean Up Plugin Entrypoint** — Removed `activateGawa()`, `activateBulsa()`, `saveGawaLayoutPreferences()`, `forceGawaLayoutRefresh()`, and unused constants from `src/main.ts`.
*   [x] **Normalize UI Labels & Fallbacks** — Replaced "Gawa / Bulsa" terminology across `FolderSettingsModal.ts`, `settings.ts`, `PaymentModal.ts`, `FastTaskCaptureModal.ts`, and updated `tasksFolder` default to `'000 Bin/DIWA Tasks'`.
*   [x] **Zero-Error Compilation** — Verified with `npm run build` (0 TypeScript / bundling errors).

### 0.1. Task Inline Flow, Flush Alignment & Centered Checkmark Placement
*   [x] **Natural Inline Flow (Shuffled Text Fix)** — Replaced `display: flex` on `li.task-list-item` with `position: relative; padding-left: 24px;` and absolute checkbox positioning (`left: 0; top: 3px;`). All text nodes and `[[wikilinks]]` flow continuously without flex column scrambling.
*   [x] **Flush Left Alignment** — Set `padding-left: 0 !important` on `ul.contains-task-list` and `ul:has(> .task-list-item)`, aligning task checkboxes flush with note text paragraphs and headings.
*   [x] **Centered Checkmark Glyphs** — Configured `display: inline-grid; place-content: center; background-position: center; -webkit-mask-position: center;` ensuring SVG checkmarks are centered inside the checkbox box.
*   [x] **Proportionate Dimensions & Vertical Baseline** — Standardized checkboxes to `var(--checkbox-size, 16px)` with clean top alignment for multiline tasks.
*   [x] **Build & Vault Deployed** — Clean compile with `npm run build` (0 errors) and deployed to `/Users/K26/Obsidian/K0000` & `K0001`.

### 0.1. Mobile Ultra-Minimalist Stream (Option 1)
*   [x] **Ultra-Clean Header Bar** — Stream card headers on mobile phones show only the timestamp (`9:42 AM`) on the left and 2 actions (**`⭐`** and **`⋯`**) on the right.
*   [x] **Header Pill Omission** — Omitted Life Area pills, tag badges, and header date pills on mobile phones, removing all visual clutter while preserving note body markdown.
*   [x] **Action Menu Integration** — Life Area assignment (`🏷️ Set Life Area...`) available on-demand via the `⋯` menu.
*   [x] **Bottom Filter Sheet Discovery** — Browsing by Area and Date remains 1-tap accessible via the **🏷️** bottom dock icon.
*   [x] **Desktop / iPad Protected** — Desktop and tablet retain full metadata badges (area, tags, dates) and full hover-action suite (`⭐ ✏️ ⋯ 🗑️`).
*   [x] **Build & Vault Deployed** — Clean compile with `npm run build` (0 errors) and deployed to `/Users/K26/Obsidian/K0000` & `K0001`.

### 0.1. Mobile Stream Decluttering (Levels 1 & 2 + Option B)
*   [x] **Action Icon Consolidation (Level 1)** — Reduced mobile note card actions from 4 buttons (`⭐ ✏️ ⋯ 🗑️`) to 2 buttons (`⭐` and `⋯`), eliminating 60px+ of button noise per card while preserving 1-tap star toggling.
*   [x] **Note Action Menu Expansion** — Added `🏷️ Set Life Area...` directly into the `⋯` menu alongside *✏️ Edit*, *📖 Open in Obsidian*, *📋 Copy*, and *🗑️ Delete*. Double-tap card body continues to trigger inline editing.
*   [x] **Metadata Noise Reduction (Level 2)** — Omitted dashed `+ Area` on untagged notes on mobile, keeping captures clean and distraction-free.
*   [x] **Minimalist Clean Timeline (Option B)** — Styled notes with subtle 1px divider lines, refined micro-typography, compact date reminder pills, and 2.5px gold left-accent rail on important notes.
*   [x] **Desktop / iPad Protected** — Desktop and tablet retain full hover-action suite (`⭐ ✏️ ⋯ 🗑️`).
*   [x] **Build & Vault Deployed** — Clean compile with `npm run build` (0 errors) and deployed to `/Users/K26/Obsidian/K0000` & `K0001`.

### 0.1. Mobile Slide-Up Bottom Filter Sheet (Option 1)
*   [x] **Slide-Up Bottom Filter Sheet (`MobileFilterSheetModal`)** — Tapping **🏷️ (`sliders-horizontal`)** on the 4-icon dock opens an ergonomic modal over a frosted backdrop (`backdrop-filter: blur(8px)`).
*   [x] **Quick Lenses Grid** — Includes `☑️ Open Tasks` (compound toggle modifier), `📋 All Notes` / `All Task Notes`, `⭐ Important`, `📅 Today`, `📆 Upcoming`, and `🧹 Untagged` with real-time count badges.
*   [x] **Life Areas Grid** — Displays all user life areas with icons and real-time badge counts.
*   [x] **Instant 1-Tap Thumb Filtering** — Instantly applies filters to the background stream and highlights the active chip.
*   [x] **Touch Swipe-Down Dismissal** — Includes top drag handle with touch swipe gestures, top "Reset All" button, and "✕" close button.
*   [x] **Top Header Cleanliness** — Removed top `.pos-filter-bar` on phones; desktop/iPad top filter carousels remain intact.
*   [x] **Build & Vault Deployed** — Clean compile with `npm run build` (0 errors) and deployed to `/Users/K26/Obsidian/K0000` & `K0001`.

### 0.1. Mobile Floating Action Dock, Expandable Composer & Bottom Search
*   [x] **Sleek Frosted Floating Dock (`.pos-mobile-action-bar`)** — Compact centered floating island (`backdrop-filter: blur(28px) saturate(180%)`) with 4 icon-only buttons (**➕**, **🔍**, **🏷️**, **📱**).
*   [x] **Floating Bottom Search Capsule on 🔍** — Tapping **🔍** transforms the dock into an active bottom search pill (`.pos-mobile-floating-search`) docked right above the virtual keyboard with auto-focus, real-time debounced stream filtering, and `✕` dismiss button.
*   [x] **Expandable Floating Composer on ➕** — Tapping **➕** transitions smoothly into the floating 2-row composer capsule (`.pos-mobile-sticky-composer`) with auto-expanding textarea, `[ ↑ ]` send button, `☑️ Task`, `⭐ Important`, Life Area chips, draft restoration, and `✕ Close` dismiss pill.
*   [x] **Mobile Top Header Clean-Up** — Removed redundant top search and top action buttons on phones.
*   [x] **Desktop / iPad Protected** — Desktop and iPad retain full header search, actions, and hero composer intact.

### 0.1. Star & Filter System (Important Notes)
*   [x] **1-Tap Star Marking (`⭐` / `☆`)** — Added `.pos-star-btn` to note stream cards with optimistic UI updating and atomic frontmatter mutation (`toggleNoteImportance()`).
*   [x] **Immediate In-Memory Synchronous Cache Mutation** — `setCaptureImportance(filePath, newState)` mutates the in-memory cache directly and scrubs `#important`/`#star` tags synchronously, completely eliminating delay or stale rollbacks.
*   [x] **Authoritative File Read in Indexing** — `IndexService.indexCaptureFile` reads directly from disk via `app.vault.read()` with raw `parseFrontmatterFallback()`, bypassing Obsidian's asynchronous `metadataCache` delay.
*   [x] **Granular Refresh Scope (`refreshCapture`)** — `RefreshCoordinator` routes `capture` scope updates through `view.refreshCapture()`, cleanly re-rendering stream cards and updating filter badges without layout destruction.
*   [x] **Note Action Menu Integration** — Added "⭐ Mark as Important" / "☆ Remove from Important" option in the note action menu (`⋯`).
*   [x] **Capture Composer Toggle** — Added star toggle chips (`⭐ Important`) to Desktop Hero Composer and Mobile Sticky Composer to flag notes at capture time.
*   [x] **Fast In-Memory Indexing** — `IndexService` parses `important: true`, `pinned: true`, and `#important` / `#star` tags; added `getImportantCount()` supporting compound queries with open tasks.
*   [x] **Filter Carousel Chip** — Added `[ ⭐ Important (N) ]` chip with real-time count badge next to All Notes / Today.
*   [x] **Search Modifiers** — Searching `is:important`, `!important`, or `⭐` filters down to starred notes.
*   [x] **Global Obsidian Commands** — Registered `DIWA: Surface Important Notes` and `DIWA: Toggle Important on Current Note`.
*   [x] **Gold Visual Accents** — Left highlight border on important note cards and amber styling for active chips and star buttons.
*   [x] **Build & Verification** — Clean compile with `npm run build` (0 errors) and deployed to active vault.

### 0.1. Mobile Note Editing Hardening & Touch Gestures (Option A)
*   [x] **Mobile Sticky Composer Collision Elimination** — `updateComposerVisibility()` dynamically hides `.pos-mobile-sticky-composer` when `_editingEntryId` is active, preventing the floating capture bar from obstructing the Save and Cancel buttons.
*   [x] **Smooth Auto-Scroll & iOS Zoom Prevention** — Enforced `font-size: 16px !important;` on `.pos-inline-textarea` on mobile to prevent iOS Safari/WebKit auto-zoom, and added smooth `scrollIntoView({ behavior: 'smooth', block: 'center' })` on editor focus.
*   [x] **Card Double-Click / Double-Tap to Edit** — Double-tapping or double-clicking any note card triggers inline edit mode directly without requiring tiny button clicks.
*   [x] **Note Action Menu (`⋯`) & Open in Obsidian** — Added note action menu with 1-tap options: ✏️ Edit Note, 📖 Open in Native Obsidian Editor, 📋 Copy Content, and 🗑️ Delete Note.
*   [x] **Touch Target Sizing & Guaranteed Visibility** — Expanded action icons to 32px–44px tap targets and enforced opacity across mobile and tablet touchscreens.
*   [x] **Legacy V2 Cleanup** — Removed dead `is-diwa-v2-active` body class toggles from `src/main.ts` and updated `.github/workflows/release.yml` release name to `DIWA`.
*   [x] **Build & Verification** — Clean compile with `npm run build` (0 errors).

### 0.1. Wikilink System Interaction (Mobile Peek Sheet & Desktop Split Navigation)
*   [x] **Mobile Slide-Up Bottom Sheet (`WikilinkPeekModal`)** — Tapping a wikilink in the stream opens a thumb-friendly 68vh bottom sheet with backdrop blur and touch swipe-down dismiss gestures.
*   [x] **Live In-Modal Markdown Rendering & Interactive Tasks** — Note body rendered via `MarkdownRenderer` with clean `Component` lifecycle; interactive `- [ ]` checkboxes toggle directly in the referenced note using atomic `app.vault.process()`.
*   [x] **1-Tap Quick Append Bar** — Input capsule at the bottom of the modal allows instantly appending thoughts or tasks to the linked note without opening the full editor.
*   [x] **Unresolved (Ghost) Link Handler** — Clean fallback UI displaying note absence with a 1-tap `[ ➕ Create Note ]` button.
*   [x] **Desktop Protected Split Navigation** — Standard left-click opens target note in an adjacent split leaf or creates a vertical split, completely preventing DIWA stream eviction.
*   [x] **Modifier Clicks & Native Hover** — Supports `Cmd/Ctrl + Click` (new tab), `Alt + Click` (floating window), and native Obsidian Page Preview on hover via `hover-link` event.
*   [x] **Context Menu & Stream Pivot Filtering (`filterStreamByWikilink`)** — Right-click on desktop and long-press on mobile display context options to preview, open in split/tab, or instantly filter the DIWA stream by `[[Note]]`.
*   [x] **Production Bundle Deployed** — `npm run build` compiled clean; bundle deployed to test vault.

### 0.1. Multi-Selection Filtering Architecture (Option 1)
*   [x] **Independent Task Lens Modifier** — Decoupled task mode (`_filterTasksOnly: boolean`) from facet state (`_activeFilter: ScratchpadFilterMode`), allowing compound multi-select queries (e.g. Open Tasks + Today, Open Tasks + Upcoming, Open Tasks + Grundfos).
*   [x] **Pinned Modifier Pill & Divider** — Positioned `[ ☑️ Open Tasks ]` as a sticky toggle pill at the front of the carousel, separated by `.pos-filter-divider`.
*   [x] **Context-Aware Dynamic Badges** — `IndexService` methods (`getAreaCounts`, `getTodayCapturesCount`, `getUpcomingCapturesCount`) accept optional `tasksOnly?: boolean` parameter to reflect exact open task counts across each facet when the modifier is active.
*   [x] **Orthogonal Stream Intersection** — Hardened `getFilteredCaptures()` to cleanly intersect the task modifier with all facet dimensions (today, upcoming, untagged, and life areas/tags).
*   [x] **Adaptive Empty States** — Formatted tailored empty state titles and subtitles for active multi-selection queries.
*   [x] **Zero Build Errors & Deployed** — `npm run build` compiled clean; bundle deployed to test vault.

### 0.1. Production-Grade Hardening (Phases 1 & 2)
*   [x] **Atomic File Mutations (`app.vault.process`)** — Migrated `toggleTaskInFile`, `updateNoteContent`, and `mergeNotes` in `CaptureService` and `editThought`, `editTask`, and `updateTaskEntry` in `VaultService` to atomic transaction updates.
*   [x] **CRLF Resilience** — Replaced fragile `indexOf('\n---\n')` line splits with robust regex frontmatter matching `/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/`, preventing file truncation on Windows.
*   [x] **Isolated Snooze Replacement** — Enforced date wikilink replacement strictly within note body to prevent accidental frontmatter date corruption.
*   [x] **User Context Protection** — Removed destructive settings filter from `scanForContexts()`, preserving user-configured context categories.
*   [x] **Native Trash Standard** — Standardized all file deletions on `app.vault.trash(file, true)` across services.
*   [x] **Vault-Scoped Draft Storage** — Scoped `localStorage` draft key with `this.app.appId` (`diwa-scratchpad-draft-<appId>`).
*   [x] **Bounded LRU Card Cache & Key Mismatch Fix** — Implemented prefix-based cache invalidation (`invalidateRenderCacheForFile`) and capped render cache to 100 entries.
*   [x] **MarkdownRenderer Component Lifecycle** — Render stream markdown via a dedicated `_streamComponent` child that unloads cleanly on every stream refresh.
*   [x] **Dynamic Mobile Navbar Scoping** — Bound `diwa-hide-mobile-navbar` dynamically to `workspace.on('active-leaf-change')` so switching to normal notes restores the bottom bar.
*   [x] **Theme-Compliant Task Checkboxes** — Added `data-task="x"` attribute management for compatibility with Minimal and AnuPpuccin themes, with state rollback on write errors.
*   [x] **Textarea Layout Reflow Elimination** — Throttled all composer and inline editor auto-resizing via `requestAnimationFrame`.
*   [x] **Obsidian Review Compliance** — Replaced `innerHTML` in `CommentModal.ts` with Obsidian's native `setIcon(..., 'paperclip')`.
*   [x] **Cross-Platform Script Fix** — Replaced PowerShell `clean` script in `package.json` with cross-platform node script and pruned unused `vis-network`.

### 1. Mobile Search & Viewport UX
*   [x] **VisualViewport Virtual Keyboard Sizing** — Wired `attachMobileSheetViewportBehavior` into `DesktopHubView` on mobile; automatically measures iOS keyboard via `window.visualViewport` and injects `--diwa-kb-h` / `.has-mobile-keyboard`.
*   [x] **No Duplicate Keyboard Root Sizing** — Removed the keyboard-open height override and `100dvh` on `.diwa-workspace-root`; Obsidian already shrinks its workspace via `--keyboard-height`. This alone did not resolve the observed black gap.
*   [x] **Guarded Keyboard Auto-Scroll** — `scrollIntoView()` now runs only when the focused input is outside the visible viewport, avoiding iOS/WKWebView blank-region panning for already-visible search fields.
*   [x] **Keyboard Scroll Ownership (Confirmed on iPhone)** — On keyboard open, `overflow: visible !important` overrides the existing mobile `overflow-x: hidden !important`, making the DIWA root the sole vertical scroller and preserving a content-sized stream. The first non-important overflow override did not work; the corrected build was deployed and the user confirmed the black gap is gone.
*   [x] **Top-Aligned Search Empty State** — Applied `justify-content: flex-start` to prevent empty state from centering into off-screen space.
*   [x] **Global Search Precedence** — Search query filters across all notes in the vault regardless of prior category/area filter selections.
*   [x] **Immediate Stream Refresh on Search Open** — Tapping `🔍` resets filter to `'all'` and immediately re-renders the document stream under the search bar.
*   [x] **Auto-Hide Filter Bar on Search** — Automatically hides `.pos-filter-bar` when search is active, eliminating unnecessary vertical space and bringing search results directly beneath the search bar.
*   [x] **Search Stream Space Optimization** — Reduced container top padding (`6px`), bottom padding (`24px`), and gap (`6px`) when searching via `.pos-scratchpad-container.is-searching`.
*   [x] **Compact Search Empty State** — Added compact, query-aware search empty state with `🔍` icon and 24px padding (`No notes matching "<query>"`).
*   [x] **Enter Key Search Trigger & Keyboard Dismissal** — Pressing Enter/Return immediately executes search and dismisses the mobile keyboard (`blur()`), instantly revealing the full screen of filtered notes.
*   [x] **Native Search Action Key** — Configured `type: 'search'` and `enterkeyhint: 'search'` on `.pos-search-input` so mobile keyboards render a native blue "Search" button.
*   [x] **High-Contrast Search Capsule** — Styled `.pos-search-input` with explicit `min-height: 42px; height: 42px;`, high-contrast background (`var(--background-secondary-alt)`), and distinct active accent border (`1.5px solid var(--interactive-accent)`), fully visible on OLED/dark themes.
*   [x] **iOS Auto-Zoom Prevention** — Enforced `font-size: 16px !important;` on mobile search input, completely preventing iOS WebKit from auto-zooming and shifting layout off-screen.
*   [x] **1-Tap Clear & Dismiss** — Added a vertically centered `✕` dismiss button on mobile search input to instantly reset search and restore standard view.
*   [x] **Floating Composer Auto-Hide on Search** — On mobile, when the `🔍` search toggle is opened or when typing an active search query, the floating capture box automatically hides (`.pos-mobile-sticky-composer.is-hidden`).

### 2. Workspace Branding & Nomenclature
*   [x] Renamed view tab display text from `DIWA Scratchpad` to **`DIWA Workspace`**.
*   [x] Renamed ribbon icon tooltip to **`DIWA Workspace`**.
*   [x] Renamed command palette commands: `Open DIWA Workspace` and `Open Continuous Workspace (Mobile/Tablet/Desktop)`.
*   [x] Renamed settings section to **`Storage & Workspace`**.
*   [x] Updated empty state placeholder text to `"Your workspace is clean and ready"`.

### 3. Filter Bar Resilience & Dynamic Lifecycle Hardening
*   [x] **Counting Method Safeguards** — Added defensive checks across `IndexService` (`getAreaCounts()`, `getOpenTaskCount()`, `getTodayCapturesCount()`, `getUpcomingCapturesCount()`, `getEarliestFutureDate()`) to gracefully handle nullish values and malformed note frontmatter.
*   [x] **Render Error Boundary** — Wrapped `renderFilterBar()` in `DesktopHubView` in a `try/catch` error boundary, ensuring render exceptions never leave the filter bar empty or detached.
*   [x] **Connected Element DOM Re-acquisition** — In `updateFilterCounts()`, verified `this._filterBarEl.isConnected`, automatically querying `.pos-filter-bar` within `_containerEl` if the DOM element was detached.
*   [x] **CSS Min-Height Anchor** — Added `min-height: 36px;` on `.pos-filter-bar` and `.pos-filter-carousel` to prevent collapsing.
*   [x] **Stream Filtering Robustness** — Hardened `getFilteredCaptures()` against null entries and unexpected property types.

### 4. Mobile Ergonomics, Glyph Clearance & Viewport Protection
*   [x] **Text Glyph Clearance Inset** — Applied `padding: 3px 6px !important;` and `box-sizing: border-box;` on textarea, softening pill corner curvature (`14px`) to completely prevent left-edge character clipping on tall capital letters.
*   [x] **Horizontal Viewport Lock** — Applied `overflow-x: hidden !important;`, `overscroll-behavior-x: none !important;`, and `touch-action: pan-y;` on all root and container elements to completely prevent sideways scrolling and viewport rubber-banding.
*   [x] **Isolated Carousel Scrollers** — Removed negative horizontal margins (`margin: 0 -10px;`) and applied `touch-action: pan-x;` and `overscroll-behavior-x: contain;` exclusively on carousels.
*   [x] **Maximized Edge-to-Edge Input** — Row 1 contains 100% full-width auto-expanding borderless textarea and `[ ↑ ]` send button.
*   [x] **Relocated Task Button** — Moved `[ ☑️ Task ]` into Row 2 as an accessory pill alongside Life Area chips (`[ ☑️ Task ] | [ 💼 Work ] ...`), reclaiming full input typing width.
*   [x] **Zero Internal Outlines** — Stripped all inner borders, focus outlines, and box shadows from the capture box.
*   [x] **Obsidian Mobile Navigation Bar Management** — Auto-hides native `< > 🔍 + [1] ☰` bottom navbar while inside DIWA (`diwa-hide-mobile-navbar`), with 1-tap `[ 📱 ]` header toggle to restore/hide on demand.
*   [x] **Single-Row Compact Header** — `DIWA` title + 1-tap `[ 🔍 ]` expandable search button, saving 44px of permanent vertical space.
*   [x] **Touch Ergonomics** — 1.25x scaled checkboxes, 44px tap targets, and `env(safe-area-inset-bottom)` protection.

### 5. Future & Date Reminders Surfacing (Digital Tickler File)
*   [x] **`📆 Upcoming` Filter Pill** — Real-time count badge (`[ N ]`) and stream filter with forward chronological sorting ($T+1 \rightarrow T+2 \dots$).
*   [x] **Human-Friendly Horizon Date Dividers** — `Tomorrow · <Day>`, `This Week · <Day>`, `Next Week · <Day>`, `<Month> <D>, <YYYY>`.
*   [x] **`📅 Today` Filter Pill** — Real-time count badge (`[ N ]`) and instant stream filter for notes/tasks scheduled for today.
*   [x] **Color-Coded Date Badges** — `📅 Today` (amber/gold), `⏳ Past` (soft muted), `📆 Future` (calm blue).
*   [x] **1-Tap Interactive Snooze Menu** — Snooze to tomorrow (+1d), +3 days, +1 week, pick custom date modal (`DatePickerModal`), or clear reminder date.
*   [x] **Rendered Date Links** — Internal wikilinks matching dates in note bodies (`a.internal-link`) wired for direct interactive snoozing and date management.
*   [x] **CaptureService atomic helpers** — `snoozeDateLink()`, `removeDateLink()`, `convertLineToTask()`.

### 6. Smart Autocomplete & Capture Triggers
*   [x] **`[[`** — Vault Note link suggestion popup & wikilink insertion (`[[Note Title]] `).
*   [x] **`#`** — Tags & Life Area taxonomy suggest popup (`#work`, `#health`, `#wealth`, `#growth`, plus custom tags).
*   [x] **`@`** — Natural language date parsing with `chrono-node` (`@today`, `@tomorrow`, `@next monday` $\rightarrow$ `[[YYYY-MM-DD]] `).
*   [x] **`/`** — People mention modal (`000 Bin/DIWA People/`) with search and instant creation.
*   [x] **`++`** / **`+ `** — Instant task checkbox conversion (`- [ ] `).
*   [x] **Image/Media Pasting** — Direct clipboard pasting saves to attachments folder and embeds `![[image.png]]`.
*   [x] Enabled across mobile floating composer, desktop hero composer, and inline note editor.

### 7. Note Taxonomy & Life Areas
*   [x] 1-tap Area Menu on note area badge (or `+ Area`) in the document stream to instantly reassign or clear life area taxonomy.
*   [x] Interactive Life Area selector chips inside the inline editor (`✏️`).
*   [x] Fixed array reference check in `Plugin.updateSetting` so modifying life areas persists to disk immediately.
*   [x] Overhauled Life Area settings interface: editable emoji, editable label, automatic tag ID update (`#work`, `#health`), and deletion.

### 8. Storage & Partitioning Architecture
*   [x] Set default capture root folder to `000 Bin/Diwa`.
*   [x] Automatic year/month partitioning: `000 Bin/Diwa/YYYY/MM/YYYY-MM-DD HH.mm.ss.md`.
*   [x] IndexService indexes all partitioned notes recursively.

### 9. Verification & Vault Deployment
*   [x] TypeScript compile & bundle: `npm run build` passed with zero errors.
*   [x] Deployed bundle (`main.js`, `manifest.json`, `styles.css`) to `/Users/K26/Obsidian/K0000/.obsidian/plugins/Obsidian_diwa`.
