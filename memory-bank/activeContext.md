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
- **Zero Build & Lint Errors**:
  - `npx tsc --noUnusedLocals --noUnusedParameters --noEmit --skipLibCheck` passed with 0 errors.
  - `npm run build` compiled cleanly into production `main.js`.
  - Deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` vault plugin directories.
