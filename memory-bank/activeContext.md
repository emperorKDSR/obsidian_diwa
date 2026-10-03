# Active Context: DIWA — Personal OS

## Current State: Gawa Tabular Task Cockpit & Subtasks Enhancement Deployed
- **Gawa Cockpit Architecture Deployed (Option B Dedicated Leaf)**:
  - Created `src/views/GawaCockpitView.ts` implementing the high-density tabular task grid.
  - Registered `VIEW_TYPE_GAWA_COCKPIT = 'diwa-gawa-cockpit'` in `src/constants.ts` and `src/main.ts` with custom checklist icon and ribbon launcher.
  - Registered global command: `DIWA: Open Gawa Task Cockpit`.
  - Added 1-tap quick launcher `[ 📋 Gawa (N) ]` to `DesktopHubView` header actions.
- **Data Model & "Earliest Date Wins" Engine**:
  - Added `GawaTaskRecord` in `src/types.ts` capturing earliest due date, relative label, life area, wikilinks, tags, subtasks, and indented child remarks.
  - Enhanced `IndexService.ts` to parse wikilinks `[[YYYY-MM-DD]]`, Tasks emojis `📅`, Dataview `[due::]`, `@dates`, and ISO dates, picking the earliest date.
  - Added `getGawaTasks(openOnly)` in `IndexService.ts`.
- **Subtasks (Option A: Inspector-Centric Management) Deployed**:
  - **Data Model**: Added `GawaSubtaskItem` (`title`, `completed`) and `subtasks: GawaSubtaskItem[]` on `GawaTaskRecord`.
  - **Parsing**: `IndexService.ts` parses indented checklist items (`    - [ ] subtask` / `    - [x] subtask`) as subtasks, and indented non-task lines as comments/remarks.
  - **Table Progress Pill**: Table rows display a compact progress pill `[ ☑ 1/3 ]` (or green `[ ✓ 3/3 ]`) in the title cell.
  - **Inspector Subtasks Section**: Slide-over inspector displays completion counts `(N/M)`, animated 5px progress rail, interactive checkbox list with strike-through and individual delete buttons (`🗑️`), and a quick-add input with Enter key support.
  - **Atomic Disk Persistence**: `CaptureService.updateTaskDetailsInFile` serializes subtasks followed by remarks, preserving formatting. Completing the parent task cascades completion to remaining child subtasks.
- **Subtasks Bug Fixes (Deletion & Toggling Duplication Resolved)**:
  - **IndexService Line Index Fix**: Preserved `parentLineIdx = i` so `gawaTasks.push()` records the true parent line index instead of the last child subtask line index. Loop increment `i = nextIdx - 1;` runs at end of task match block.
  - **CaptureService Parent Task Resolution**: Distinguishes between `parentTaskRegex` (`^[ \t]{0,1}-\s*\[`) and `anyTaskRegex`. Validates `taskTitleFallback` on `lineIndex` and prioritizes unindented parent task lines during fallback search.
  - **Child Line Replacement**: Atomically calculates and replaces all indented child lines (`childCount`) under the parent task, completely eliminating duplicate lines and ensuring deletions reliably remove child items from disk.
  - **0ms Bi-Directional Synchronization**:
    - `GawaCockpitView`'s `persistSubtasks`, `persistRemarks`, and `saveInspectorChanges` immediately sync the selected task with the freshly re-indexed record from `IndexService.getGawaTasks(false)`.
    - `RefreshCoordinator.ts` broadcasts `'tasks'` refresh events to both `DesktopHubView` and `GawaCockpitView` leaves.
    - Toggling in Gawa reflects in DIWA Scratchpad without scroll jumping; capturing in DIWA reflects in Gawa instantly.
- **Gawa Mobile Stream-Aligned Experience Deployed**:
  - **Concise 2-Column Mobile Table**: On mobile (`Platform.isMobile && !isTablet`), the table displays strictly `Status` and `Title`. Non-essential columns (`Due Date`, `Life Area`, `Remarks`, `Source`, `Actions`) are hidden.
  - **Subtle Inline Due Info**: When a task has a due date, renders subtle typography `(Due: YYYY-MM-DD)` inline with the title (`color: var(--text-muted); font-size: 0.82em; font-weight: 400;`), with non-imposing overdue tint if overdue.
  - **Clean Mobile Header**: Removed top search box, life area select, and horizontal horizon pill filter bar on mobile, leaving a clean `📋 Gawa (N open)` header.
  - **Obsidian Mobile Navigation Bar Toggle (Default Hidden)**:
    - Automatically adds `diwa-hide-mobile-navbar` to `document.body` on mobile mount so Obsidian's bottom navigation bar is hidden by default.
    - Added 5th action button (`pos-mobile-action-nav` with `panel-bottom` icon) to the 1-row floating action bar to toggle visibility on demand with notice feedback.
  - **Pinned Mobile Task Inspector (Locked Position & Unblurred Interactivity)**:
    - Fixed inspector drifting horizontally by enforcing `width: 100vw !important`, `min-width: 0 !important`, `max-width: 100vw !important`, `left: 0 !important`, `right: 0 !important`, and `box-sizing: border-box !important`.
    - Resolved mobile blur and unresponsiveness: moved backdrop creation into `_mainStageEl` right before `_inspectorEl` (z-index 998 vs inspector z-index 1000) instead of `document.body`, eliminating stacking context inversion where backdrop covered the inspector.
    - Replaced `backdrop-filter: blur(2px)` with standard `rgba(0, 0, 0, 0.5)` overlay to prevent WebKit compositing blur bugs on mobile browsers.
    - Enforced `pointer-events: auto !important;`, `overflow-y: auto !important;`, and `-webkit-overflow-scrolling: touch !important;` on `.pos-gawa-inspector` so all controls, fields, checklists, and scrolling are fully interactive.
    - Temporarily hides floating action bar (`is-hidden`) while inspector is open to prevent touch conflicts.
    - Added tap-to-close on backdrop, drag handle pill (`pos-sheet-drag-handle-wrap`), and vertical slide-up animation (`gawaSlideUp`).
  - **Floating Action Bar & Capsule**:
    - **Idle State**: 1-row floating capsule (`.pos-gawa-mobile-action-bar`) with:
      1. Primary `+` FAB: opens `GawaQuickTaskModal` for rapid task capture with due date chips and life area selection.
      2. `search` button: toggles floating bottom search capsule (`.pos-mobile-floating-search`) with real-time debounced filtering.
      3. `sliders-horizontal` filter button: opens `GawaFilterSheetModal` bottom sheet with quick horizon chips and life area grid.
      4. `rotate-cw` refresh button: 1-tap refresh.
      5. `panel-bottom` nav toggle: hides/shows Obsidian bottom navigation bar.
- **Zero Build & Lint Errors**:
  - `npx tsc --noUnusedLocals --noUnusedParameters --noEmit --skipLibCheck` passed with 0 errors.
  - `npm run build` compiled cleanly into production `main.js`.
  - Deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` vault plugin directories.
