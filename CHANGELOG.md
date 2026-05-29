
## [10.2.13] — Review and Feed Render Caching

### Changed
- Cached weekly review task snapshots and glance computations so the Review tab stops rescanning the full task and due indexes during render.
- Moved Bulsa Insights category derivation into a reusable analytics snapshot with per-file category caching.
- Added feed projection caching in Desktop Hub so context and search updates reuse stable derived thought lists until the underlying data changes.

## [10.2.12] — Mobile Workspace Performance

### Changed
- Added scoped mobile and tablet refresh paths so shell updates avoid unnecessary full view rerenders when only tasks or thoughts change.
- Reworked `DiwaMobileShell` around cached task, thought, and project projections instead of repeated render-time resorting and rescanning.
- Reused the mounted mobile shell structure and only rebuilt navigation chrome when the platform or label state actually changed.

## [10.2.11] — Vault Serialization Hardening

### Changed
- Replaced raw frontmatter interpolation with shared vault file and YAML serialization helpers for people, project, task-link, and reflection note creation.
- Switched project milestone persistence to structured `diwa-milestones` blocks while preserving reads of legacy milestone lists.
- Hardened task comment storage and parsing with explicit DIWA markers so user-authored text cannot impersonate structural reply headers.
- Routed remaining attachment writes through the centralized binary vault helper path.

## [10.2.10] — Desktop Performance Tuning

### Changed
- Cached visible thought-to-task link state in Desktop Hub to avoid repeated full task scans per rendered thought row.
- Relaxed the task-only refresh debounce to reduce bursty desktop UI churn during rapid task updates.

## [10.2.9] — Project Popout Safety

### Changed
- Made project status pickers use owner-document and owner-window positioning instead of global browser globals.
- Centralized inline task-edit popover cleanup so repeated open/close flows no longer leak outside-click listeners.
- Reduced some repeated project-surface rescans and skipped no-op project status updates.

## [10.2.8] — Project Reactivity Hardening

### Changed
- Wired project files and project-folder mutations into the reactive indexing and refresh flow.
- Reused per-file project indexing helpers instead of project-wide ad hoc rebuild logic.
- Narrowed legacy capture-table migration so it only migrates real legacy table rows before backing up the source files.

## [10.2.7] — Due and Vault Safety Hardening

### Changed
- Routed recurring due creation through hardened vault helpers with sanitized filenames, folder handling, and frontmatter values.
- Persisted payment attachments and appended saved wikilinks to payment logs.
- Moved remaining task-link and reflection file creation onto shared vault file helpers.
- Tightened comment/reply boundary parsing so body headings are less likely to be mistaken for reply sections.

## [10.2.6] — Popout Overlay Hardening

### Changed
- Made the shared link modal and task thought overlay resolve DOM and window ownership from their active host so they behave correctly in popout windows.
- Cleared shared overlay ownership when task rows are destroyed to avoid stale callbacks and orphaned overlay state.
- Added a desktop task-toggle guard so in-flight task toggles do not trigger conflicting task-pane refreshes.

## [10.2.5] — Modal Write Path Cleanup

### Changed
- Routed file creation from note and people suggestion modals through shared vault helpers instead of raw ad hoc folder/file creation.
- Moved comment edit and delete flows onto anchor-based `VaultService` helpers instead of whole-file string replacement.
- Reused the shared attachment insertion flow for comment attachments so they honor the configured DIWA attachments folder.

## [10.2.4] — Index Lifecycle Hardening

### Changed
- Removed the redundant full-vault topic scan from topic suggestions and relied on maintained index state instead.
- Switched due-file create, modify, delete, and rename handling to incremental index updates instead of rebuilding the whole due index.
- Detach registered DIWA leaves during plugin unload so custom workspace leaves do not linger across shutdown.

## [10.2.3] — Manual Surface Cleanup

### Changed
- Removed stale Manual references from current navigation, help copy, and README documentation.
- Redirected legacy Manual tab requests to Settings so older workspace state no longer points at a removed surface.

## [10.2.2] — Legacy Cleanup

### Changed
- Removed the final obsolete startup cleanup for a previously deleted custom view.
- Cleared the last repository text references tied to that retired feature.

## [10.2.1] — Mobile Workspace Overflow Fix

### Fixed
- Prevented the mobile DIWA home capture card text from overflowing on narrow viewports by constraining the CTA box sizing and allowing capture and section copy to wrap safely.

## [10.1.0] — Mobile Gawa View Removal

### Changed
- Removed the orphaned `MobileGawaView` implementation and unregistered its dedicated view type.
- Added a legacy workspace migration so any saved `diwa-mobile-gawa` leaves reopen on the standard DIWA Gawa tab instead of restoring a dead view.

## [10.0.0] — Documentation Sync

### Changed
- Reconciled the in-plugin Manual and Help modal with the current Workspace, Projects, Gawa, Bulsa, Review, and Journal surface.
- Removed stale Search and AI references from repository docs and in-plugin copy after those modules were removed from the product.
- Clarified that Monthly Review and Export & Backup remain supporting tabs instead of primary workspace navigation entries.
- Updated release naming from legacy MINA wording to DIWA.

## [3.0.0] — Explicit 3-Layer Refactor

### Added
- **RefreshCoordinator** moved refresh/reindex orchestration out of `main.ts` into an application-layer coordinator.
- **Explicit 3-layer plan** now documented in the session plan: Presentation, Application, Infrastructure.

### Removed
- Safe obsolete artifacts removed from the repo: `classes_used.txt`, `.copilot 2/devops-log.txt`, `fix_ai_methods.js`, `move_ai_logic.js`, and `tibbixel-dot-com-4883-svg.svg`.

## [2.7.0] — Inline Topic Input with Autocomplete

### Added
- **Inline topic input** replaces the modal for topic assignment. Clicking the 🏷 tag button now opens a small floating panel anchored below the button — no modal overlay.
- **Autocomplete suggestions**: as the user types, existing topics from the vault are suggested (prefix-matched). Arrow keys navigate, Enter confirms, Escape cancels.
- **`InlineTopicInput` utility** (`src/utils/InlineTopicInput.ts`): shared DOM helper used by all three hub views (Desktop, Mobile, Tablet).
- **Context auto-detection**: if the note already has a context, the topic input opens directly. If not but the active tab is a specific context, that context is auto-assigned. If both are absent (All tab), an inline context pill row is shown first, then transitions to topic input.
- **`topic` frontmatter field**: `VaultService.assignContextToThought` now writes a dedicated `topic` field (e.g. `Meeting`) in addition to `context` and `tags`.
- **`ThoughtEntry.topic`**: indexed from `fm.topic` in `IndexService.indexThoughtFile()`.
- **`IndexService.getExistingTopics()`**: returns all unique non-empty topic strings from the in-memory index.

### Changed
- Tag button no longer opens `InlineContextPickerModal`; that modal's `topicMode` is no longer used by hub views.

### Frontmatter result
```yaml
context:
  - Grundfos          # DIWA hub filter (base label)
topic: Meeting        # raw sub-topic text (new)
tags:
  - Grundfos/Meeting  # Obsidian native tag search (context/topic)
```




### Added
- **Tag button (🏷) on every feed item** in Desktop Hub, Mobile Hub, and Tablet Hub.
  - Appears alongside the existing pencil (edit) button; hover-revealed on desktop, always visible on mobile.
  - Tag button shows in **accent color** when a context is already assigned (`has-context` state).
- **`InlineContextPickerModal` — topic mode**: Single-select context pills + optional "Sub-topic" free-text input (e.g. `Meeting`, `Q2 Review`).
- **`VaultService.assignContextToThought(filePath, contexts, topic?)`**: Frontmatter-only update — atomically sets `context` (base label, e.g. `Grundfos`) and `tags` (hierarchical, e.g. `Grundfos/Meeting`). Does not touch body text.

### Changed
- Feed item action buttons (`tag` + `pencil`) are now grouped in a `.diwa-[dh|mh|th]-feed-actions` wrapper; the `makeThoughtEditable` flow hides the entire action group during editing.

### Format
- `context` frontmatter → plain base label: `Grundfos`
- `tags` frontmatter → Obsidian hierarchical tag: `Grundfos/Meeting` (auto-composed by plugin)



### Fixed
- **All-Time feed only showing today's entries** — Context filter now uses case-insensitive comparison, so notes with `context: grundfos` correctly match the `Grundfos` context pill (and vice versa).
- **Non-today entries now show date prefix** — Feed timestamps show `MMM D · HH:mm` (e.g. `May 10 · 14:32`) for entries outside today, making it easy to confirm historical data is present.

## [2.5.1] — Context Normalization Fix

### Fixed
- **Context stored as YAML string scalar** (`context: Grundfos`) was excluded from hub feed filters that required `Array.isArray`. Added `IndexService.normalizeContext()` to guarantee `string[]` at index time.
- Removed over-defensive `Array.isArray` guards from `DesktopHubView`, `MobileHubView`, and `TabletHubView` feed filters.



### Removed
- **Focus Mode tab** (`FocusTab.ts`) — The distraction-free task mission view, including the AI time-block plan generator and session-pinned task state.
- **Memento Mori tab** (`MementoMoriTab.ts`) — The life-in-weeks calendar visualisation and related settings (birth date, life expectancy).
- **Memento Mori Settings Modal** (`MementoMoriSettingsModal.ts`) — The dedicated settings modal for Memento Mori configuration.

### Changed
- `src/view.ts` — Removed `focusedTaskIds`, `focusAiPlan` state fields; removed `case 'focus'` and `case 'memento-mori'` from tab title resolver and tab router.
- `src/tabs/CommandCenterTab.ts` — Removed Focus button from ACTION cluster; removed Memento button from FEATURES cluster.
- `src/views/DesktopHubView.ts` — Removed Focus link from ACTION group; removed Memento link from FEATURES group.
- `src/main.ts` — Removed `addIcon()` calls and imports for both icon sets.
- `src/constants.ts` — Removed `FOCUS_ICON_ID/SVG`, `MEMENTO_ICON_ID/SVG`, `focusModeOrder` from DEFAULT_SETTINGS.
- `src/types.ts` — Removed `focusModeOrder`, `birthDate`, `lifeExpectancy` from `DiwaSettings`.
- `src/settings.ts` — Removed Memento Mori settings section UI.
- `styles.css` — Removed all `.diwa-memento-*` CSS rules.
- `src/tabs/ManualTab.ts` — Removed Focus Mode and Memento Mori manual sections; updated navigation cluster descriptions.
- `README.md` — Removed Focus Mode and Memento Mori feature sections; cleaned up settings table and tabs reference.

---

## [2.4.0] — Mobile Hub & Tablet Hub

### Added
- **MobileHubView** — Single-column phone-first hub: quick-capture textarea → context pills → markdown feed. Opened automatically when the ribbon icon is tapped on a phone.
- **TabletHubView** — Two-column tablet hub: left sidebar shows tasks list, right main area has capture → context pills → markdown feed. Opened automatically on tablets.
- **Platform-aware ribbon routing** — Ribbon hub icon now opens the correct hub for the current device (Tablet Hub → Mobile Hub → Desktop Hub).
- **New commands** — `DIWA: Open Mobile Hub` and `DIWA: Open Tablet Hub` available in the command palette.
- **Touch-drag pill reorder** — Both mobile and tablet hubs support long-press (500 ms) to enter reorder mode, then touch-drag to reposition context pills. Order is persisted via `settings.contextOrder`.
- **44 px tap targets** — All interactive elements in mobile/tablet hubs meet WCAG touch target guidance.

### Changed
- `src/constants.ts` — Added `VIEW_TYPE_MOBILE_HUB` and `VIEW_TYPE_TABLET_HUB`.
- `src/main.ts` — Registers both new views; ribbon routes by `isTablet()` / `Platform.isMobile`; added `activateMobileHub()`, `activateTabletHub()` methods and two new commands.
- `styles.css` — Added `.diwa-mh-*` (Mobile Hub) and `.diwa-th-*` (Tablet Hub) CSS sections.

### New Files
- `src/views/MobileHubView.ts`
- `src/views/TabletHubView.ts`

---

## [2.3.2] — Context Pill Drag-and-Drop Reorder

### Added
- **Drag-and-drop reorder** — Context pills in the Desktop Hub center pane can be reordered by dragging. The new order is persisted to `settings.contextOrder` in `data.json` and restored on next open.
- **Uniform pill width** — All pills (including "All") share a fixed `88px` width with text truncated via ellipsis, ensuring a consistent visual rhythm regardless of context name length.
- **Drag states** — Dragging pill fades to 35% opacity (`.is-dragging`); drop target shows accent dashed border (`.is-drag-over`). `cursor: grab` on draggable pills.

### Changed
- `src/types.ts` — `contextOrder: string[]` added to `DiwaSettings`
- `src/constants.ts` — `contextOrder: []` added to `DEFAULT_SETTINGS`
- `src/views/DesktopHubView.ts` — `renderContextTabs()` resolves display order from `contextOrder`; HTML5 drag-and-drop handlers write back to `settings.contextOrder`
- `styles.css` — uniform pill sizing, `.is-dragging`, `.is-drag-over`, `cursor: grab`

---

## [2.3.1] — Desktop Hub Context Tabs

### Added
- **Context Tab Bar** — Desktop Hub center pane now shows a horizontal scrollable pill tab bar. Each pill represents a context from `settings.contexts` (alphabetical). "All" tab is pinned last and shows today's thoughts (existing behavior).
- **Scope Toggle** — Context-specific tabs show a **Today / All Time** toggle in the feed header, allowing per-context scope filtering without affecting other tabs.
- **Capture Pre-fill** — When a context tab is active, the thought capture widget automatically pre-fills that context tag (removable before saving).
- **State Persistence** — Active tab (`activeContextTab`) and scope (`feedScope`) are persisted in Obsidian view state and restored on re-open.

### Changed
- `src/utils.ts` — `ThoughtCaptureOptions` gains optional `initialContexts?: string[]`; chips are pre-rendered on mount.
- `src/views/DesktopHubView.ts` — `renderTodayFeed()` replaced by `renderContextTabs()` + `renderFeed()`.
- `styles.css` — Added `.diwa-dh-ctx-tabbar`, `.diwa-dh-ctx-tab`, `.diwa-dh-feed-header`, `.diwa-dh-scope-toggle`, `.diwa-dh-scope-pill`.

---

## [2.3.0] — LOW + ARCH Priority Refactors & Cleanups

### Fixed / Refactored
- **[LOW-01]** `src/tabs/CommandCenterTab.ts` — Deleted dead `renderWeeklyGoals()` and `renderMonthlyGoals()` methods (~80 lines of unreachable code; methods were commented out in `render()` but never removed). (Closes #14)
- **[LOW-02]** `src/tabs/CommandCenterTab.ts` + `src/tabs/HabitsTab.ts` — Replaced inline SVG gear strings with `setIcon(btn, 'lucide-settings-2')`, removing ~3KB of duplicated SVG markup from the JS bundle. (Closes #15)
- **[LOW-03]** `src/main.ts` + `src/types.ts` + `src/constants.ts` — `migrateLegacyTableData()` now guarded by `settings.legacyMigrated` flag. After a successful migration the flag is persisted so subsequent Obsidian launches skip the 2-second delayed vault read entirely. (Closes #16)
- **[LOW-04]** `src/types.ts` — `DueEntry.dueMoment` now typed as `import('moment').Moment | null` instead of `any`. Type-safe access throughout the codebase. (Closes #17)
- **[LOW-05]** `src/services/VaultService.ts` — `formatDateTime()`, `formatDate()`, and `formatTime()` now delegate to `moment(d).format(...)`, removing manual `Date` arithmetic and `padStart()` calls. (Closes #18)
- **[LOW-06]** Already closed by HIGH-06 (v2.2.0). (Closes #19)
- **[LOW-07]** `src/tabs/CommandCenterTab.ts` — Fixed double `moment()` parse per task in the overdue filter. Single strict-mode parse reduces per-task allocations in the Intelligence widget. (Closes #20)
- **[LOW-08]** `src/view.ts` — Added `DiwaViewState` interface (`activeTab`, `isDedicated`). `getState()` and `setState()` are now fully typed, eliminating the `any` parameter. (Closes #21)
- **[LOW-09]** `src/main.ts` — `_checkReminders()` replaces `Array.from().filter()` with a `for...of` loop over `taskIndex.values()`, eliminating the intermediate array allocation on every hourly tick. (Closes #22)
- **[LOW-10]** `src/view.ts` — `onClose()` now restores the hidden native Obsidian header (`header.style.display = ''`) preventing it from being permanently hidden if the view is closed and re-opened in a different leaf. (Closes #23)
- **[LOW-11]** Multiple files + `styles.css` — Extracted 10 static inline style patterns to named CSS classes (`.diwa-context-chip`, `.diwa-reply-row`, `.diwa-card-text`, `.diwa-card.is-done-card`, `.diwa-settings-action-btn`, `.diwa-finance-footnote`, `.diwa-create-hint`, `.diwa-habit-list-label`, `.diwa-tab-error`). Dynamic styles preserved inline. (Closes #24)
- **[ARCH-01]** `src/types.ts` + `src/services/IndexService.ts` + `src/tabs/BaseTab.ts` + `src/tabs/JournalTab.ts` + `src/modals/ViewCommentsModal.ts` — Removed vestigial `ThoughtEntry.children` field (always `[]`, never populated). `TaskEntry.children` (used for task comments/replies) is unaffected. `ViewCommentsModal` narrowed to accept only `TaskEntry`. (Closes #25)
- **[ARCH-02]** `src/tabs/AiTab.ts` — Removed dead hidden `<input type="file">` element (5 lines) that was part of an old file-upload flow superseded by drag-and-drop. The `attachBtn` and drag-and-drop path are unaffected. (Closes #26)
- **[ARCH-03]** `src/view.ts` — Removed `_baseTabDelegate` anonymous class field that was constructed in the constructor but never used — vestigial scaffolding from an abandoned delegate pattern. (Closes #27)
- **[ARCH-04]** Already closed by HIGH-04 (v2.2.0). (Closes #28)

---

## [2.2.0] — HIGH Priority Performance & Architecture Fixes

### Fixed
- **[HIGH-01]** `src/tabs/TasksTab.ts` — Replaced 6 sequential `.filter()` passes for badge count with a single `for...of` loop + `switch` statement. Reduces badge computation from O(6n) to O(n). (Closes #6)
- **[HIGH-02]** `src/tabs/CommandCenterTab.ts` + `src/utils.ts` — Removed duplicated inline-trigger listener on the task input (was registering `@date`, `@context`, `@person` listeners twice). Broadened `attachInlineTriggers()` signature to accept `HTMLTextAreaElement | HTMLInputElement`. Fixed broken context picker that was passing `[]` instead of `this.settings.contexts`. Added `taskDueDate` closure variable so `saveTask()` does not re-parse `@tokens` from the title. (Closes #7)
- **[HIGH-03]** `src/utils.ts` + `src/tabs/CommandCenterTab.ts` + `src/views/DesktopHubView.ts` — Extracted `createThoughtCaptureWidget()` utility function. Eliminates ~155 lines of duplicated thought-capture DOM construction between CommandCenterTab and DesktopHubView. Net −73 lines. (Closes #8)
- **[HIGH-04]** `src/tabs/ReviewTab.ts` — Removed duplicate `getHabitHighlightText()` call inside `doSave()`. The outer-scope `highlightText` variable (computed once at render time) is now reused in the save closure, eliminating a redundant O(n) scan of habit entries. (Closes #9)
- **[HIGH-05]** `src/tabs/AiTab.ts` — Extracted `appendMessage(chatArea, msg)` private method. `sendMessage()` now appends individual messages instead of calling `renderHistory()` (full O(n) re-render) twice per round-trip. In a 20-message session this reduces `MarkdownRenderer.render()` calls from 40× to 2× per exchange. (Closes #10)
- **[HIGH-06]** `src/constants.ts` + `src/modals/SearchModal.ts` + `src/views/SearchView.ts` — Moved `SCOPES`, `TYPE_ICONS`, and `QUICKJUMP_TABS` to canonical exports `SEARCH_SCOPES`, `SEARCH_TYPE_ICONS`, `SEARCH_QUICKJUMP_TABS` in `constants.ts`. Eliminated divergent local copies (habit icon was `lucide-activity` in SearchModal vs `lucide-flame` in SearchView; Finance label was `'Dues'` vs `'Finance'`). Both consumers now import from the single source of truth. (Closes #11)
- **[HIGH-07]** `src/services/AiService.ts` — Added `GeminiPart`, `GeminiContent`, `GeminiRequestBody`, `GeminiResponse` interfaces. Replaced all `any` types at the Gemini API boundary including `customHistory`, `imageParts`, `contents`, request body, and response parsing. Typed `ChatMessage[]` for history. `catch` blocks now use `unknown` + `instanceof Error` guards. Breaking API shape changes now surface at compile time. (Closes #12)
- **[HIGH-08]** `src/services/IndexService.ts` — Replaced `thoughtChecklistIndex`/`thoughtDoneChecklistIndex` flat arrays with private `Map<string, ThoughtChecklistItem[]>` fields. Public getters maintain full backward compatibility. `indexThoughtFile()` now does `Map.set()` (O(1)) instead of `Array.filter()` (O(n)), reducing `buildThoughtIndex()` across N files from O(n²) to O(n). (Closes #13)

---

## [2.1.0] — Critical Performance & Reliability Fixes

### Fixed
- **[CRIT-01]** `src/main.ts` — Eliminated double-indexing on every vault write. Added `_reindexCooldown` Map to `DiwaPlugin` so `_reindexFile()` is a no-op when the same file path fires again within 300ms, collapsing the duplicate `vault.on('modify')` + `metadataCache.on('changed')` events into a single index operation. Eliminates 2× `vault.read()` + 2× index updates per keystroke-save. Map is cleared in `onunload()`. (Closes #2)
- **[CRIT-02]** `src/tabs/VoiceTab.ts` — Fixed resource leak on tab switch. Extended `VoiceTab.cleanup()` to also release `audioChunks` blob buffer and close the `AudioContext`, ensuring the microphone stream, recording timer, waveform RAF, and keyboard listener are all fully released when the user navigates away. (Closes #3)
- **[CRIT-03]** `src/tabs/AiTab.ts` — Eliminated O(n) chat re-render on grounded file chip removal. Extracted `renderContextChips(contextBar)` private method; chip `×` handlers now call this method for an O(1) DOM update of just the chip bar, instead of calling `renderAiMode(container)` which re-rendered the entire chat shell and all messages via `MarkdownRenderer.render()`. (Closes #4)
- **[CRIT-04]** `src/services/VaultService.ts` — Replaced fragile regex-based frontmatter mutation in `appendComment()`. The `String.replace(/^modified: .+$/m, ...)` that could silently corrupt note bodies containing `modified:` (e.g. in code blocks) is now replaced with the safe two-step pattern: `processFrontMatter()` to atomically update the YAML `modified` key, then `vault.modify()` to append the comment body. (Closes #5)

---



### Major Release
MINA V2 becomes a full **Personal Operating System** with the introduction of the Desktop Hub — a dedicated premium cockpit for desktop users. This release marks the architectural completion of the MINA platform: mobile-first Command Center + desktop-first Hub + reactive Omni-Cache Engine.

### Added
- **Desktop Hub**: All features from v1.27.0 promoted to the 2.0.0 flagship release.
  - Premium 3-column cockpit (`VIEW_TYPE_DESKTOP_HUB`) as a dedicated popout window.
  - LEFT: hover-expand icon nav sidebar (44px → 180px).
  - CENTER: thought capture textarea + live Today's Feed (newest-first).
  - RIGHT: 5-stat reactive grid + AI Intelligence briefing.
  - Focus Mode 🎯 with CSS transitions, persisted state.
  - `Platform.isDesktop` guard; opens via `getLeaf('window')`.
  - 535 lines of `.mina-dh-*` premium dark CSS.
  - HelpModal: Desktop Hub section with 8 entries.

### Architecture Milestone
- **`minAppVersion`** → `0.16.0` (required for popout window support).
- `src/views/DesktopHubView.ts` — standalone `ItemView`, fully decoupled from `BaseTab`/`MinaView`.
- Shared `notifyRefresh()` 400ms debounce extended to cover hub leaves.
- No new vault watchers; zero-async rendering loop compliance.

---

## [1.27.0] — Desktop Hub: Premium 3-Column Cockpit

### Added
- **Desktop Hub**: Brand-new standalone `ItemView` (`VIEW_TYPE_DESKTOP_HUB`) — a dedicated popout window designed exclusively for desktop (Windows + macOS). Opens via ribbon icon or command `MINA: Open Desktop Hub`.
- **3-Column Layout**: LEFT icon-only nav sidebar (hover-expands to 180px with group labels), CENTER thought capture + today's live feed, RIGHT stats + AI intelligence panel.
- **Thought Capture**: Full-width textarea with Enter-to-save, Shift+Enter for newline, ⌘K inline context tagger, and media paste handler.
- **Today's Feed**: Live list of all thoughts captured today, sorted newest-first, showing timestamp, body, and context chips.
- **Stats Panel**: 5-stat reactive grid — Open Tasks, Overdue (danger red when >0), Unsynth Thoughts, Total Dues ($), Habits ratio. Updates on every vault change via the shared `notifyRefresh()` 400ms debounce.
- **AI Intelligence Card**: SYNTHESIZE BRIEFING button triggers Gemini strategy summary; `_closed` guard prevents DOM updates after view destruction; `_aiActive` prevents duplicate requests.
- **Focus Mode**: 🎯 top-bar toggle collapses sidebar + right panel with CSS transitions; state persisted via `getState()`/`setState()` (survives Obsidian restarts).
- **`DESKTOP_HUB_ICON_SVG`**: Custom cockpit SVG icon registered via `addIcon()`.
- **Platform guard**: `Platform.isDesktop` check — shows notice on mobile instead of rendering.
- **`versions.json`**: Added `"1.27.0": "0.16.0"` entry; `minAppVersion` bumped to `0.16.0` (required for `getLeaf('window')`).
- **HelpModal**: New "Desktop Hub" section with 8 entries covering all features.

### Architecture
- `src/views/DesktopHubView.ts` (new) — standalone `ItemView`; does not extend `BaseTab`; renders on `containerEl.children[1]`; hides Obsidian view header via `children[0]`.
- `src/main.ts` — `registerView()`, `activateDesktopHub()`, ribbon icon, command, `notifyRefresh()` updated to iterate hub leaves.
- `src/constants.ts` — `VIEW_TYPE_DESKTOP_HUB`, `DESKTOP_HUB_ICON_ID`, `DESKTOP_HUB_ICON_SVG`.
- `styles.css` — 535 lines of `.mina-dh-*` CSS: flex cockpit, hover-expand sidebar, focus-mode transitions, `@media (max-width:900px)` responsive fallback.

### Files Modified
- `src/views/DesktopHubView.ts` (new)
- `src/constants.ts`
- `src/main.ts`
- `src/modals/HelpModal.ts`
- `manifest.json`
- `package.json`
- `versions.json`
- `styles.css`

---

## [1.22.6] — Timeline Search: Boolean Operators

### Added
- **`AND` / `OR` boolean search** in the Timeline search bar:
  - `jozsef or andras` — entries containing "jozsef" **OR** "andras"
  - `andras and 1:1` — entries containing **both** "andras" AND "1:1"
  - `jozsef or andras and 1:1` — "jozsef" OR ("andras" AND "1:1") — `AND` binds tighter
- Operators are case-insensitive (`AND`, `and`, `Or` all work)
- Searches across title, body, and context tags
- Updated placeholder text to hint at the capability: `Search… (use "and" / "or" for multi-criteria)`

## [1.22.5] — Timeline Header Mobile Fix

### Fixed
- **Timeline header hidden on mobile**: `.mina-tl-wrap` was `position: absolute; inset: 0` — uniquely among all MINA tabs — placing the header at position 0 of the container, which on Obsidian mobile overlaps with the system navigation bar. Changed to `flex-grow: 1; min-height: 0` (the standard pattern used by every other MINA tab) so the timeline respects the view's natural flow layout.
- **Mobile top clearance**: Added `body.is-mobile .mina-tl-header { padding-top: max(env(safe-area-inset-top, 0px) + 12px, 52px) }` to ensure the home button and header bar clear the device status bar / Obsidian nav overlay on all mobile devices.

## [1.22.4] — Timeline Search

### Added
- **Search button** (🔍) in the Timeline header bar — toggles search mode; highlights accent-blue when active
- **Search bar** — replaces the date carousel when active; pill-shaped input with auto-focus, clear (✕) button, and result count hint
- **`_runSearch()`** — searches all in-memory thoughts and tasks across the full vault (not just loaded days); case-insensitive substring match on title, body, and context tags; results grouped by day (most recent first)
- **Render-generation token** (`_renderGen`) prevents stale async renders from competing with newer search/timeline renders
- **Escape** key exits search and returns to the normal infinite-scroll timeline
- After editing a card in search mode, results refresh with the same query

### UX Details
- Empty query shows "Type to search…" prompt (no expensive full-vault render)
- Results use the same day-section structure as the normal timeline (consistent visual language)
- One result per file (no multi-date duplicates)
- Exiting search preserves the previously selected timeline date

## [1.22.3] — Person Quick-Create on `/` Trigger

### Added
- **`PersonSuggestModal` — Create new person inline**: When `/` is typed in any capture input and the typed name has no matching person note, a `➕ Create "[name]"` option appears at the bottom of the suggestions list. Selecting it creates a new markdown note with `category: people` frontmatter in the configured People Folder.
- **`peopleFolder` setting**: New setting (default: `000 Bin/MINA V2 People`) controls where new person notes are saved. Exposed in the Settings tab under Folders.

### Fixed
- All `attachInlineTriggers` call sites (CommandCenterTab, EditEntryModal, JournalEntryModal, JournalTab) now pass `peopleFolder` so the create-person path uses the correct folder everywhere.

## [1.20.0] - 2026-04-25
### Added
- **Next Week Plan**: New collapsible section in Weekly Review for day-by-day planning
  - 7 day cards (Mon–Sun) with intention input and assigned task display
  - This Week / Next Week toggle to plan either the current or upcoming week
  - Inline task picker: tap "+ Assign Task" to route unscheduled tasks to specific days
  - Tasks show priority badges; checkbox to complete inline
  - Day cards are collapsible on mobile; CSS grid layout on tablet/desktop
  - Day plans saved as markdown section in weekly review file (`# 📅 Next Week Plan`)
  - Assigned tasks automatically appear in Focus tab on their due day
- Manual & Help: documented Next Week Plan and task assignment features

### Changed
- VaultService: `saveWeeklyReview()` and `loadWeeklyReview()` extended with `dayPlans` parameter
- types.ts: added `dayPlans` to `WeeklyReportContext`; view.ts: added `weekPlanDraft` and `weekPlanTargetMode` state

## [1.19.34] - 2026-04-25
### Changed
- Manual (ManualTab + HelpModal): updated all outdated section descriptions to reflect current state
  - Command Center: removed Weekly/Monthly Goals item; added Navigation Clusters description with 4-cluster layout
  - Journal: complete rewrite — all-entries feed, newest-first, FAB modal, edit/delete per card
  - Tasks: added Full Title Display item
  - Calendar: access now correctly shows MANAGEMENT cluster
  - Monthly Review navigation: corrected to MANAGEMENT cluster
  - Compass access: corrected to MANAGEMENT cluster
  - Memento Mori access: corrected to FEATURES cluster

## [1.19.33] - 2026-04-25
### Fixed
- VaultService: removed 60-character truncation on `title` frontmatter — full first line of thought/task text is now saved as the title property

## [1.19.32] - 2026-04-25
### Fixed
- Tasks tab: full task title now always visible — changed row to align-items:flex-start so multi-line titles expand correctly
- Added white-space:normal and overflow:visible on task title element

## [1.19.31] - 2026-04-25
### Changed
- Command Center: Management, Features, System clusters now share same accent border/background as Action cluster

## [1.19.30] - 2026-04-25
### Changed
- Command Center: navigation clusters now wrap responsively to the next row when space is insufficient.
- Adjusted min-widths to keep pill layout stable across breakpoints.

## [1.19.29] - 2026-04-25
### Changed
- Command Center: removed Weekly/Monthly goals from header
- Reorganized navigation clusters per design: Action, Management (blocked), Features, System
- Added CSS for blocked management cluster

## [1.19.28] - 2026-04-25
### Changed
- Journal: removed 14-day limit; all journal entries are now loaded
- Subtitle updated to 'All entries' to reflect the change

## [1.19.27] - 2026-04-25
### Changed
- Journal: entries now sorted descending (newest first)
- Journal mobile: New Entry pill button moved inline with Journal header
- Removed FAB from list bottom (no longer needed with descending sort)

## [1.19.26] - 2026-04-25
### Changed
- Journal mobile: FAB moved inline into list flow below last entry (no longer floating)
- FAB is a pill button with pencil icon + 'New Entry' label
- Scroll-to-bottom on load now lands on the FAB, ensuring latest entry and action are always visible

## [1.19.25] - 2026-04-25
### Fixed
- Journal mobile: FAB bottom position set to 22px
- Journal mobile: quad-fire scroll-to-bottom on load (rAF, 150ms, 400ms, 800ms) for reliable initial position

## [1.19.24] - 2026-04-25
### Fixed
- Journal mobile: FAB bottom position reduced to 4px

## [1.19.23] - 2026-04-25
### Fixed
- Journal mobile: always scroll to bottom on load (triple-fire for image rendering)
- Added 72px bottom padding so last entries are fully visible above FAB

## [1.19.22] - 2026-04-25
### Changed
- Journal mobile: replaced inline compose bar with FAB trigger button that opens M365-style modal
- Eliminates all mobile toolbar height calculation hacks — compose now uses Obsidian's native modal layer

## [1.19.21] - 2026-04-25
### Fixed
- Journal mobile: reduce root height by extra 20px so compose bar sits higher above toolbar

## [1.19.20] - 2026-04-25
### Fixed
- Journal mobile: reduce root height by extra 8px so compose bar sits slightly higher above toolbar

## [1.19.19] - 2026-04-25
### Fixed
- Journal mobile: use window.innerHeight instead of 100vh for root height calculation — 100vh on iOS includes area behind toolbar

## [1.19.18] - 2026-04-25
### Fixed
- Journal mobile: compose bar visible again — JS sets explicit root height using getBoundingClientRect
- Removed CSS :has() rules; height bounding now handled entirely by JS measurement
- Root height = calc(100vh - topOffset - toolbarHeight) — bulletproof across all devices

## [1.19.17] - 2026-04-25
### Fixed
- Journal mobile: replaced position:fixed compose bar with pure flex-column layout
- Compose bar sits above Obsidian toolbar via measured padding-bottom on root container
- Removed complex visualViewport listeners; scroll-to-bottom on focus retained
- Restored height:100% on :has() rule for proper flex-chain bounding

## [1.19.16] - 2026-04-25
### Fixed
- Journal mobile: measure actual .mobile-toolbar height via DOM (was guessing 48px CSS fallback)
- Journal mobile: visualViewport listener repositions compose bar when keyboard opens
- Journal mobile: scroll to bottom on textarea focus to prevent iOS blank-space bug
- CSS: compose bar bottom driven by JS, not hardcoded CSS variable

## [1.19.15] - 2026-04-25
### Fixed
- Journal mobile: compose bar now position:fixed at ottom:var(--mobile-toolbar-height,48px) — sits exactly above Obsidian's action bar
- Journal mobile: scroll area padding-bottom accounts for toolbar + compose bar height
- Journal mobile: reverted all manual padding changes back to original (8px/9px)

## [1.19.14] - 2026-04-25
### Fixed
- Journal mobile: compose bar now sits above Obsidian's bottom toolbar; removed height:100% override that was extending the view behind the toolbar

## [1.19.13] - 2026-04-25
### Changed
- Journal mobile: increased compose bar padding by 6px (top 25->28px, bottom 23->26px)

## [1.19.12] - 2026-04-25
### Changed
- Journal mobile: added 4px extra padding to compose bar (top 21->25px, bottom 19->23px)

## [1.19.11] - 2026-04-25
### Changed
- Journal mobile: increased compose bar height by 20px (row padding 11/9px -> 21/19px)

## [1.19.10] - 2026-04-25
### Fixed
- Journal mobile: removed empty space below compose bar (was safe-area padding)
- Journal mobile: increased compose bar height by 3px (row top padding 8→11px)

## [1.19.9] - 2026-04-25
### Fixed
- Journal mobile: pinned compose input bar to bottom of screen; entries area is now independently scrollable (fixes flex height chain via CSS `:has()`)
- CSS: corrected double-dot selector typo `..mina-journal-compose` -> `.mina-journal-compose` that was silently breaking all compose-bar styles

## [1.19.8] - 2026-04-25

### Changed
- **Journal compose bar**: Row bottom padding reduced by 5px (14px → 9px)

## [1.19.7] - 2026-04-25

### Fixed
- **Journal compose bar**: Reverted `max()` CSS (incompatible with Obsidian mobile WebView); compose row bottom padding bumped to 14px for visible breathing room

## [1.19.6] - 2026-04-25

### Changed
- **Journal (mobile)**: Tapping a thumbnail opens a full-screen lightbox — pinch to zoom (up to 6×), double-tap to reset, tap outside or × to close
- **Journal compose bar**: `padding-bottom: max(4px, safe-area-inset)` — input is never clipped at the bottom edge
- **Journal scroll**: Double-scroll-to-bottom (rAF + 150ms) ensures latest entry always visible on load, even when images delay layout

## [1.19.5] - 2026-04-25

### Changed
- **Journal tab**: Filter to last 14 days only
- **Journal tab**: Entries sorted ascending (oldest → newest at bottom)
- **Journal tab**: View scrolls to bottom on load so latest entries are immediately visible
- **Journal tab (mobile)**: Inline M365 Copilot-style compose bar replaces the "+" nav button
  - Compact single-line input, expands on focus, auto-grows up to 120px
  - Attach image button + horizontally-scrollable context chips appear when focused
  - Send button activates when input has content; `⌘↵` / `Ctrl↵` to submit
- **Journal cards**: Embedded images show as 72px thumbnails — tap to expand to full width

## [1.19.4] - 2026-04-25

### Changed
- **Journal tab**: Removed search bar — entries always shown in full chronological list
- **Journal mobile input**: Redesigned as M365-style top sheet
  - iOS nav-bar header: `Cancel` (muted left) · `✍️ Journal / date` (centered) · `Done` (accent right)
  - Full-width document textarea — no border, generous padding, 16px font
  - Bottom action bar (above keyboard): 📎 attach icon · divider · horizontally-scrollable context chips

## [1.19.3] - 2026-04-25

### Changed
- **Journal (mobile)**: Input modal now anchors to the **top** of the screen (slides down) so the soft keyboard doesn't cover the textarea
- **Journal (mobile)**: "+" button is now a small flat 28px outlined button — no FAB styling

## [1.19.2] - 2026-04-25

### Added
- **Journal (mobile)**: "+" button in the upper-right of the nav row for quick new entry — replaces the bottom FAB

## [1.19.1] - 2026-04-25

### Fixed
- **Journal Entry Modal (mobile)**: Textarea was invisible / collapsed — broken flex chain between Obsidian's `.modal-content` and the sheet's flex column. Fixed by making `.modal-content` a flex column with `flex: 1; min-height: 0; overflow: hidden` so the textarea can expand and fill available space

## [1.19.0] - 2026-04-25

### Changed
- **Journal Entry Modal**: Removed close button (×) from upper-right header — dismiss via Cancel button, Escape key, or swipe-down (mobile)

## [1.18.9] - 2026-04-25

### Fixed
- **Journal Entry Modal**: Textarea and modal content area were transparent making text input difficult — textarea background now uses solid `var(--background-primary)`; Obsidian's `.modal-content` inside the journal modal is now explicitly forced opaque

## [1.18.8] - 2026-04-25

### Added
- **JournalEntryModal**: Purpose-built dedicated journal entry modal replacing generic `EditEntryModal` in the Journal tab. Features three render variants (mobile bottom sheet, tablet centered card, desktop two-zone card), image attachment via file input and clipboard paste/drag-drop (`attachMediaPasteHandler`), context tag chips with `#` inline trigger, `#journal` always auto-included, keyboard shortcut ⌘↵/Ctrl+↵ to save, Esc to close, swipe-to-dismiss on mobile (handle-only), and drag-over dashed outline on desktop/tablet. Desktop variant includes a 120px image preview strip that appears when images are attached.

## [1.18.7] - 2026-04-24

### Changed
- **Manual (Docs)**: Updated Quick Capture section with image paste, `/` people picker, `[[` wiki-link, and `#` context tag trigger entries
- **Manual (Docs)**: Finance section now accurately documents the `last_payment_date` / `next_duedate` frontmatter contract and pay button conditions
- **Manual (Docs)**: Settings section now includes the Attachments Folder configuration entry

## [1.18.6] - 2026-04-24

### Fixed
- **People Picker**: `PersonSuggestModal` now filters by `category: people` frontmatter (was incorrectly using `type: people`)

## [1.18.5] - 2026-04-24

### Added
- **`/` People Trigger**: Type `/` (at start or after a space) in any capture input to open a person picker. Lists all vault notes with `type: people` frontmatter. Selecting a person inserts `[[Person Name]]` at the cursor. Works in: Thought textarea, Task input (Command Center), and all EditEntryModal capture fields.

## [1.18.4] - 2026-04-24

### Added
- **Image Paste in Capture**: Thought textarea and Task input in Command Center now support pasting (and drag-dropping) images. The file is saved to the configured Attachments Folder and a `![[filename]]` wikilink is inserted at the cursor.

## [1.18.3] - 2026-04-24

### Fixed
- **Field Rename**: `last_payment` frontmatter key renamed to `last_payment_date` across VaultService, IndexService, and NewDueModal template for naming consistency

## [1.18.2] - 2026-04-24

### Fixed
- **Payment Registration Bug**: `savePayment()` was writing to wrong frontmatter key `due` instead of `next_duedate` — due date never updated after marking paid
- **Payment Wikilink Bug**: Due date was stored as `[[YYYY-MM-DD]]` wikilink format; `IndexService` strict-parses plain dates — payments always rendered as invalid/overdue
- **Last Payment Badge Bug**: `last_payment` frontmatter key was never written — "Paid X ago" badge was always blank

## [1.18.1] - 2026-04-23

### Changed
- **Edit Task Modal Redesign**: Simplified mobile sheet to premium minimalism
  - Borderless, focus-driven task title textarea (transparent background, outline focus)
  - Unified metadata dock: all scheduling, priority, energy, status, tags, and project in one horizontal scrollable row
  - Metadata chips open popovers upward into the title area
  - Close button moved into handle bar for cleaner header
  - Swipe-to-dismiss restricted to handle bar only (avoids conflict with dock scrolling)
  - Reduced visual weight: removed section labels and unnecessary spacing
  - Desktop: applied borderless textarea treatment for consistency across platforms

## [1.14.2] - 2026-07-22

### Changed
- **Journal Tab Redesign**: Complete overhaul for clarity and navigation
  - Latest note always appears first (sorted by creation time)
  - Smart date group headers: Today / Yesterday / Weekday / Month D / Month D, YYYY
  - Stats strip: total entries, this-month count, writing streak 🔥
  - Live search with 150ms debounce (persists across vault events)
  - Custom journal cards: time badge, markdown body, context chips (journal tag hidden), reply count
  - Edit / Delete actions on each card (hover on desktop, always-visible on mobile)
  - New Entry button in header (desktop/tablet) or floating FAB (mobile)
  - FAB mounted outside scroll container — no clipping or z-index issues

## [1.14.1] - 2026-04-22

### Updated
- **Manual**: Added missing documentation sections for Task Focus Mode, Memento Mori, Export & Backup, and Finance Analytics (all shipped in v1.14.0 but undocumented)
- **Manual — Settings**: Added Memento Mori (birth date, life expectancy) and Monthly Income configuration entries

## [1.14.0] - 2025-07-21

### Added
- **Project Milestones**: Track milestones per project with checkboxes, progress bar, and collapsible UI. Stored in project note body under `## Milestones`.
- **Daily Note Integration**: Append quick captures to today's daily note from the Daily Workspace tab. Configurable folder path in Settings.
- **Reminders**: Hourly nudges for pending habits and due tasks. Quiet hours enforced (8 AM–10 PM). Mobile-aware via `visibilitychange`.
- **Task Focus Mode**: Tactical task view in Command Center for today's priority tasks with AI time-block planning.
- **Memento Mori**: Life-in-weeks visualization with rotating quotes and longevity statistics.
- **Export & Backup**: CSV export for thoughts/tasks and full JSON backup.
- **Finance Analytics**: Cashflow overview with obligations by category.

### Updated
- Manual tab fully documents all 7 new features.
- Roadmap cleared — MINA V2 is feature-complete.

## [1.13.1] - 2026-04-21
### Changed
- **Manual — Calendar View**: Added dedicated "Calendar View" section documenting month/week toggle, event dots, day detail panel, navigation, and state persistence
- **Manual — Habits**: Added "Streak Leaderboard 🔥" entry documenting the current streak, personal best, and monthly % table
- **Manual — Weekly Review**: Added "AI Weekly Brief 🤖" entry documenting the AI brief generation, 5-section structure, and Gemini API requirement
- **Manual — Roadmap**: Removed shipped features — Habit Streaks (✅ shipped v1.11.x) and AI Weekly Review Generator (✅ shipped v1.12.0)

## [1.13.0] - 2026-04-21
### Added
- **Calendar View**: New full tab accessible from the Command Center ACTION cluster. Displays a month or week grid with event indicators (tasks, financial dues, habit completions). Click any day to see its full detail panel listing tasks due, dues, and habits. Month/Week toggle, prev/next navigation, and Today shortcut. All state (view month, selected date, mode) persists across re-renders.
- Calendar View removed from roadmap in Manual tab (feature shipped)

## [1.12.0] - 2026-04-21
### Added
- **AI Weekly Generator**: New "✨ AI Weekly Brief" section in the Weekly Review tab powered by Gemini. Collects tasks completed/overdue, habit completion rates, active projects, recent thoughts, wins/lessons/focus, and North Star goals, then generates a structured 5-section brief (Week Assessment, Top Win, Key Insight, Next Week Priority, North Star Pulse)
- AI brief is integrated into the weekly review save cycle — included in the review MD file when saved
- Brief persists across re-renders via session-level `weeklyAiReport` state
- Copy to clipboard, Save to Review, and Regenerate actions
- Separate abort controller for weekly generation (doesn't cancel AI chat sessions)
- Injection boundary markers around all vault-derived content in weekly prompt

## [1.11.4] - 2026-04-21
### Added
- **Manual tab**: Converted HelpModal into a full navigable tab accessible from SYSTEM cluster and header ? button
- **Roadmap section**: Added Roadmap to the Manual with 10 upcoming features (Habit Streaks, Calendar View, Task Focus Mode, Project Milestones, Memento Mori, AI Weekly Review, Finance Analytics, Reminders, Export, Daily Note Integration)
- Manual accessible on all platforms: desktop sidebar layout, tablet sidebar layout, mobile accordion layout

## [1.11.3] - Habit Buttons Rounded Square on Desktop and Tablet

### Fixed
- Habit buttons on desktop and tablet now use rounded-corner square (border-radius: 14px) matching the mobile pattern, instead of circle (border-radius: 50%)
- Button height is now auto-sized with min-height: 64px and padding 10px 8px, same as mobile grid
- Habit labels now wrap naturally on desktop/tablet

## [1.11.4] - 2026-04-21
### Added
- **Manual tab**: Converted HelpModal into a full navigable tab accessible from SYSTEM cluster and header ? button
- **Roadmap section**: Added Roadmap to the Manual with 10 upcoming features (Habit Streaks, Calendar View, Task Focus Mode, Project Milestones, Memento Mori, AI Weekly Review, Finance Analytics, Reminders, Export, Daily Note Integration)
- Manual accessible on all platforms: desktop sidebar layout, tablet sidebar layout, mobile accordion layout

## [1.11.3] - Habit Buttons: Rounded Square on Desktop + Tablet

### Fixed / Improved
- **Desktop + Tablet habit buttons**: Changed from circle (`border-radius: 50%`) to rounded-corner square (`border-radius: 14px`) matching the mobile grid pattern
- Habit button height is now auto-sized (min 64px) with proper padding (10px 8px), matching mobile layout
- Habit labels on desktop/tablet now wrap naturally (`white-space: normal`) instead of being truncated to 54px
- Applied via the container query at min-width 500px so it targets desktop and tablet only, leaving mobile unaffected

## [1.11.2] - Reviews Folder Configuration

### Feature
- **Configurable Reviews Folder**: All Weekly, Monthly, and Compass review files now save under a configurable root folder (default: `000 Bin/MINA V2 Reviews`). Sub-folders Weekly/, Monthly/, and Compass/ are created automatically
- **Settings**: New Reviews Folder field added to both the main Settings tab (Storage and Capture) and the Folder Config modal
- All 6 VaultService review read/write methods now respect settings.reviewsFolder

## [1.11.1] - Review & Compass MD Persistence

### Fixed / Improved
- **Monthly Review**: Monthly focus goals now save to a dedicated vault file Reviews/Monthly/YYYY-MM.md (YAML frontmatter + goals list) instead of plugin settings only; on open, loads from the MD file first (source of truth) with settings as fallback
- **Compass**: North Star Goals and Life Mission now save to Reviews/Compass/YYYY-Qx.md per quarter; loads from MD file on open with settings fallback; both the goals and mission are kept in sync — editing either field writes the full compass document atomically
- **VaultService**: Added saveMonthlyGoals, loadMonthlyGoals, saveCompassData, loadCompassData methods

## [1.11.0] - Compass in Command Center

### Added
- **Command Center**: Compass now appears in the SYSTEM cluster nav grid — tap/click to open the Quarterly Compass directly from the hub; uses the existing compass icon already registered in the plugin

## [1.10.8] - Habit Theme Alignment

### Fixed
- **Habits**: Habit button background now uses ar(--background-primary) (was --background-secondary-alt) so it matches the active Obsidian theme naturally across light, dark, and custom themes
- **Habits**: Border changed to 1px var(--background-modifier-border) (was faint) for a cleaner, theme-consistent appearance
- **Habits**: Hover state now uses ar(--background-modifier-hover) — the standard Obsidian interactive hover token — instead of a hard-coded accent tint

## [1.10.7] - Habit Ring Fix

### Fixed
- **Habits**: Incomplete habit rings now display a clean, perfect track circle — removed stroke-linecap: round from the default (empty) fill state which was rendering a colored dot artifact at the top of the ring for every incomplete habit; stroke-linecap: round now applies only to the is-done state where the full arc is drawn

## [1.10.6] - Synthesis UX Polish

### Fixed
- **Mobile**: Synthesis feed seg bar (Inbox/Mapped/Done pills) no longer clipped — added lex: 1; min-width: 0 to toggle bar on phone; tightened header padding and gap for more room
- **Tablet**: Synthesis layout now visually matches desktop — reverted ctx panel to 33.333% width (was incorrectly 36%); removed over-sized button/padding overrides that broke visual density parity; context action buttons now use low-opacity default with full-opacity on tap/hover/active instead of always-full-visible

# Changelog

## [1.22.2] - 2026-04-26

### Fixed
- Finance tab now refreshes immediately after payment or new bill creation
- Added isDueFile() to IndexService — PF folder files now properly trigger dueIndex rebuild on vault events (create, modify, delete)
- PaymentModal and NewDueModal callbacks now await buildDueIndex() before re-rendering, eliminating stale-index race condition


## [1.22.1] - 2026-04-25

### Added
- Calendar: tap the circle/check icon on any task in the detail panel to toggle completion


## [1.22.0] - 2026-04-25

### Added
- Calendar Quick Add: + button on the Tasks section header to create tasks inline for the selected day
- Past-date warning: amber input border when adding tasks to a past date
- Tasks section always visible in detail panel (even when empty) for immediate task creation
- Updated empty-state copy to guide users toward the + button


## [1.21.3] - 2026-04-25

### Fixed
- Calendar: padding days from adjacent months are now non-interactive (pointer-events:none + reduced opacity)
- Calendar: skip click handler for outside-month cells to prevent month confusion on mobile
- Calendar: guard async day-plan loader against stale container references


## [1.21.2] - 2026-04-25

### Fixed
- Calendar no longer jumps to a different month when selecting padding days from adjacent months


## [1.21.1] - 2026-04-25

### Added
- Day-Scoped Quick Add: create new tasks inline on any day card in the Week Plan
- Load budget badge: task count turns amber (4-5) or red (6+) to signal overplanning
- Edit icon on recently created tasks to quickly enrich metadata via EditTaskModal
- Updated empty-state guidance copy for Week Plan section

## [1.21.0] - 2026-04-25

### Added
- AI Week Architect: Gemini-powered day-by-day week planning with staging panel (accept/reject per suggestion)
- Calendar intention chips: week-view shows day plan intentions from Weekly Review as muted chips above task lists

All notable changes to MINA V2 will be documented in this file.

## [1.10.5] - 2026-04-20

### Added
- **Tablet UX**: is-tablet CSS class on synthesis shell. All context rows 44px min touch targets, eye/trash always visible (no hover needed), card buttons and segmented tabs have larger touch padding.
- **Phone - Context Manage Sheet**: Contexts nav button now opens full management panel (same as desktop left panel: search, add, hide/unhide, delete).
- **Phone - Assign Sheet Upgraded**: Live search, alphabetical sort, hides hidden contexts, shows N hidden indicator.

### Changed
- Refactored phone bottom sheet into renderAssignSheetContent (assign) and renderManageSheetContent (manage) modes.

## [1.10.4] — Synthesis: Done All

### ✨ Added
- **Done All** button in the Mapped (with-context) feed — marks every visible mapped note as synthesized in one click; button only appears when "Mapped" filter is active

## [1.10.3] — Synthesis: Hide Contexts

### ✨ Changed
- **Hide context** — eye-off icon appears on hover for each context row; clicking hides the context from the active list (stored in `hiddenContexts` settings)
- **Reveal hidden** — "Show hidden (N)" toggle button at the bottom of the context list; hidden contexts are shown with muted/dashed style and cannot be primed
- **Unhide** — eye icon on hidden rows restores them to the active list
- Hiding a primed context automatically removes it from the current multi-select selection

## [1.10.2] — Synthesis Context Panel: Multi-Select, Search & Delete

### ✨ Changed
- **Multi-select contexts** — click multiple contexts in the left panel to prime them all; assign button reads "Assign to N contexts" and writes all selected contexts at once
- **Alphabetical sorting** — context list is now always sorted A→Z
- **Context search** — search input above the list; filters rows in real-time without re-rendering
- **Delete context** — trash icon appears on hover for each context row; removes it from the global contexts list and clears it from any active selection

## [1.10.1] — Synthesis Desktop Layout V2.1

### ✨ Changed
- **Synthesis desktop layout redesigned** — new 1/3 + 2/3 split: contexts on left, feed on right
- **Left context panel**: scrollable list of all #contexts with radio-select (single prime), count badges, and sticky "Add context" button
- **Primer strip**: shows the currently selected context; mirrors in a feed echo strip on the right
- **Dynamic assign button**: dashed when nothing primed → solid accent "Assign to {ctx}" when primed → green checkmark if already assigned
- **Attention shake**: clicking Assign without a context primed shakes the context panel as a prompt
- **DOM-surgical priming**: selecting a context updates all buttons in-place without re-rendering the feed

## [1.10.0] — Synthesis V2: Context-First Routing

### ✨ New
- **Synthesis Tab completely redesigned** — replaced the legacy master note paradigm with Context-First Routing
- **Full-body thought cards** — full note content rendered inline with expand/collapse for long notes
- **3-state feed filter** — Inbox (no context), Mapped (with context), Done (processed)
- **Context-first layout** — context pill bar routes thoughts to #tags in frontmatter; phone gets bottom sheet for context assignment
- **VaultService** — new `assignContext()` and `removeContext()` methods

## [1.9.2] - 2026-04-20
### Fix — Search Modal Centered Layout
Global Search overlay now centered vertically (`align-items: center`) on desktop/tablet.

## [1.9.1] - 2026-04-21
### Fix — Search Navigation + Mobile Search Redesign

Two targeted fixes to the Global Search feature introduced in v1.9.0.

#### Fix 1 — Search Navigation (Critical)
Search results and Quick Jump tiles were silently failing to navigate when tapped.

**Root cause:** `getLeavesOfType('mina-view')` used the wrong view type string. The correct constant is `VIEW_TYPE_MINA = "mina-v2-view"` from `constants.ts`.

**Changes:**
- `SearchModal.ts`: Import and use `VIEW_TYPE_MINA` from `constants.ts` in both `activateResult()` and the Quick Jump grid click handler.
- `SearchModal.ts`: Added `setActiveLeaf()` to bring the MINA panel into focus after navigation.
- `SearchModal.ts`: Added `setTimeout(50ms)` so the modal fully closes before the tab switch fires.

#### Fix 2 — Mobile Search UX Redesign
The v1.9.0 bottom-sheet on phone was broken. Replaced with a full iOS Spotlight-style full-screen takeover.

**Changes:**
- `SearchModal.ts`: Full-screen overlay on phone; `visualViewport` keyboard compensation; 16px input font (prevents iOS auto-zoom); 56px+ touch targets; 2-column Quick Jump grid; safe-area-inset handling; swipe-down-to-dismiss; back button; reduced-motion support.
- `CommandCenterTab.ts`: Search pill entry point added between greeting and capture bar (phone only).
- `styles.css`: Entire search CSS block replaced with mobile-first responsive version.
- `HelpModal.ts`: Search section expanded with Search Pill, Mobile Full-Screen Mode, Swipe to Dismiss, and Quick Jump 2-col entries.

## [1.9.0] - 2026-04-20
### Feat — Global Search / Spotlight

Unified cross-domain search overlay — find anything across all MINA data types from a single entry point.

**Changes:**
- **Search Overlay**: Floating panel (desktop) / bottom sheet (mobile) triggered by 🔍 header icon or `Mod+Shift+F` shortcut.
- **Cross-Domain Results**: Searches Thoughts, Tasks, Dues, Projects, and Habits simultaneously using IndexService in-memory indices (zero-latency, no file I/O).
- **Scope Filters**: Horizontal pill bar filters results by type (All / Thoughts / Tasks / Dues / Projects / Habits) with live counts.
- **Result Cards**: Type-coded icons (purple=thought, accent=task, amber=due, green=project, red=habit), title with match highlighting, preview text, and date/status metadata.
- **Quick Jump Grid**: When search is empty, shows a 3×2 grid to instantly navigate to any tab.
- **Keyboard Navigation**: ↑↓ navigate, Enter opens, Esc closes, Tab cycles scope filters.
- **Responsive**: Desktop centered panel (620px), tablet adapted (90vw), phone bottom sheet (92dvh) with safe-area insets.
- **Obsidian Command**: Registered as `MINA: Global Search` in command palette.
- **Help Manual**: New Global Search section added to in-plugin manual.


### Feat — AI Chat Redesign (Gemini 2.5 Pro)

Complete redesign of the AI Chat interface with modern UX patterns and Gemini 2.5 Pro as the default model.

**Changes:**
- **New Layout**: Full CSS-class architecture replacing all inline styles. Clean `.mina-ai-*` namespace.
- **Model Badge**: Active Gemini model displayed in header as styled pill badge.
- **Web Search Toggle**: Globe icon button in header with active state indicator.
- **Settings Access**: Gear icon in header opens AI Configuration modal directly.
- **Welcome State**: Empty chat shows branded welcome with suggestion chips (4 preset prompts).
- **AI Avatar**: Bot messages now have a gradient sparkle avatar for visual distinction.
- **Typing Indicator**: Animated 3-dot bounce indicator replaces plain "Thinking…" text.
- **Auto-resize Textarea**: Input grows with content up to 200px max height.
- **Keyboard**: Enter to send, Shift+Enter for newline.
- **Rounded Bubbles**: Updated border-radius (18px) for modern chat appearance.
- **File Chips**: Grounded files shown as removable chips in a context bar above input.
- **Error Display**: Styled error cards with auto-dismiss (10s).
- **Mobile**: iOS zoom prevention (16px font), safe-area padding, hidden model badge.
- **Default Model**: Changed from `gemini-1.5-pro` to `gemini-2.5-pro` across AiService and AiSettingsModal.
- **HelpModal**: Expanded AI Chat documentation with 8 entries (Keyboard, Suggestions, Model Badge, etc.).

## [1.5.9] - 2026-04-20
### Feat — Synthesis Tab Redesign

Complete rewrite of the Synthesis tab replacing 100% inline styles with a proper CSS architecture.

**Changes:**
- **CSS-first**: All inline styles replaced with `.mina-synthesis-*` CSS classes (~200 lines).
- **Search/Filter**: New filter input in sidebar header for instant thought searching.
- **Count Badge**: Unprocessed thought count displayed as accent badge next to title.
- **Improved Cards**: Timestamp ("2 hours ago"), title, body preview, and "✓ Process" button per card.
- **Mark Processed**: Quick-process button to mark thoughts without synthesizing into a note.
- **Drag Feedback**: Cards show `.is-dragging` state with scale transform.
- **Proper Mobile Detection**: Uses `isTablet()` utility instead of `clientWidth < 600`.
- **Responsive**: Phone gets full-width sidebar; tablet/desktop get split-pane (340px → 380px).
- **HelpModal**: Updated Synthesis section with Inbox Feed, Drag & Drop, Quick Process documentation.

## [1.5.8] - 2026-04-20
### Feat — Monthly Review Navigation

Monthly Review is now accessible directly from the Command Center navigation grid.

**Changes:**
- **Nav grid**: Added "Monthly" item to SYSTEM cluster (icon: `calendar-range`). Renamed "Review" → "Weekly" for clarity.
- **MonthlyReviewTab**: Replaced 100% inline styles with proper CSS classes (`mina-monthly-*`). Uses `renderPageHeader()` and `renderEmptyState()` from BaseTab.
- **CSS**: Added dedicated Monthly Review stylesheet block (~120 lines) with responsive breakpoint for small screens.
- **HelpModal**: Expanded Monthly Review section with Navigation, Stats, Habit Adherence, Project Progress, and Focus entries.

## [1.5.7] - 2026-04-20
### Feat — Tablet UX Enhancements

Comprehensive tablet audit and upgrade. Tablets (iPad, Android tablets with short-edge ≥ 768px) now receive a **desktop-class experience** instead of being treated as oversized phones.

**Changes:**
- **Command Center header**: Desktop-sized buttons (42px) on tablet instead of phone-oversized (48px).
- **Habit Quick Bar**: Horizontal scrollable bar on tablet (desktop layout) instead of grid (phone layout). Tooltips enabled.
- **Habit name length**: 13 chars on tablet (desktop) instead of 11 (phone).
- **Goal cards**: Monthly goals expanded by default on tablet. Goal edit buttons use desktop density.
- **Navigation clusters**: All clusters expanded on tablet — no collapsible phone accordion.
- **Tactical rows**: Desktop-density padding and min-height on tablet.
- **Help Modal**: Desktop sidebar+content layout on tablet instead of phone accordion.
- **CSS refinements**: Tablet-specific `@media (min-width: 768px)` block restores hover effects, desktop card padding, title sizing, and hides the mobile FAB.
- **Capture FAB**: Hidden on tablet (inline capture bar is active instead).

**Files modified:** `src/tabs/CommandCenterTab.ts`, `src/modals/HelpModal.ts`, `styles.css`, `src/modals/HelpModal.ts` (manual entry).

**Architecture:** All tablet detection uses `isTablet()` from `src/utils.ts` (short-edge ≥ 768px). Pattern: `Platform.isMobile && !isTablet()` = phone-only. `!Platform.isMobile || isTablet()` = desktop-or-tablet.

## [1.5.6] - 2026-04-20
### Feat — In-Plugin Manual (Help Modal)

MINA now ships with a built-in **interactive manual** accessible from the `?` button in the Command Center header.

**Design:**
- Desktop: wide modal (~820px) with a **left sidebar** (all 17 modules listed with icons) and a scrollable **content pane**. Clicking a section loads its items instantly.
- Mobile: full-screen modal with a **collapsible accordion** — each module expands in place, one at a time.
- **Global search bar** on both layouts filters across all sections by label, description, or tip text.

**Content (17 sections):**
Command Center, Quick Capture, Tasks, Thoughts & Timeline, Habits, Projects, Finance (Dues), Weekly Review, Monthly Review, Compass, Synthesis, AI Chat, Voice Notes, Journal, Daily Workspace, Timeline, Settings.

Each item has a plain-language description and where relevant a 💡 tip with practical advice.

**Architecture:**
- `src/modals/HelpModal.ts` (new): `Modal` subclass with `_renderDesktop()` / `_renderMobile()` / `_renderSectionContent()` / `_renderSearchResults()`. All content is static data (`SECTIONS` array) — zero vault reads.
- `CommandCenterTab.renderHeader()`: Added `?` (circle-help) button next to Zen toggle. Opens `HelpModal`.
- CSS: `mina-help-modal`, `mina-help-sidebar`, `mina-help-content`, `mina-help-item-card`, `mina-help-accordion-*`, `mina-help-search-*`

## [1.5.5] - 2026-04-20
### Fix — Mobile Tab Navigation (no new window on tab switch)

On mobile, switching between tabs no longer spawns a new Obsidian tab/window. Previously, `activateView()` always called `workspace.getLeaf('tab')` when the exact target tab wasn't already visible, causing a fresh tab to be opened on every navigation action.

**Root cause:** `getLeaf('tab')` unconditionally creates a new leaf regardless of existing open MINA views.

**Fix (`src/main.ts — activateView()`):**
1. After the existing exact-match and dedicated-leaf lookups, a new mobile-only check scans `leaves` for any existing MINA leaf and reuses it (`leaves[0]`).
2. If no MINA view exists at all, falls back to `workspace.getLeaf(false)` (reuse current pane) instead of `getLeaf('tab')`.
3. Desktop behaviour is unchanged — still opens a dedicated `'window'` leaf.

## [1.5.4] - 2025-07-29
### Feat — Data-Driven Weekly Review (F3)

The Weekly Review tab gains a **"Week at a Glance"** panel — a real-time dashboard summarising the current ISO week from live IndexService data. Zero vault reads; all computation is synchronous from in-memory indices.

**Architecture:**
- `ReviewTab.renderGlancePanel()`: Inserts collapsible glance panel between the review header and the body sections. Collapse state is persisted in the instance. Refresh button re-renders all four cards on demand.
- `ReviewTab.computeGlanceData(weekId)`: Synchronously derives `GlanceData` from `taskIndex`, `dueIndex`, `projectIndex`, and habits settings. Tasks: completed = status=done + modified in ISO week; overdue = status=open + due before today. Habits: scans 7 daily `.md` files via `metadataCache` (no vault reads). Projects: active this week = `file.stat.mtime` within ISO week, not archived. Finance: paid = `lastPayment` within ISO week; overdue = `dueMoment` before today (paid takes priority).
- Four sub-renderers: `renderGlanceTasks`, `renderGlanceHabits`, `renderGlanceProjects`, `renderGlanceFinance` — each renders a `mina-glance-card` with header, stats/rows.
- Desktop: 2-column CSS Grid. Mobile (≤480px): single-column stack. Max-height 220px with overflow scroll.
- CSS: `mina-review-glance`, `mina-glance-card`, `mina-glance-stat-*`, `mina-glance-habit-*`, `mina-glance-project-*`, `mina-glance-finance-*`

## [1.5.3] - 2025-07-29
### Feat — Edit Project + Manual Project Picker (F2)

Projects are now fully editable from the Projects tab. Capture modal gains a manual project picker on both mobile (project pill in chip strip) and desktop (folder button in chip area).

**Architecture:**
- `EditProjectModal` (new): Bottom sheet on mobile, centered modal on desktop. Pre-fills all fields (name, goal, status, due, color). Calls `VaultService.updateProject()` on save. Swipe-to-dismiss on mobile.
- `ProjectPickerModal` (new): `SuggestModal<ProjectEntry | null>` with search filter, colored dot indicators, status badges, and "clear" null option. Used by both mobile pill and desktop picker.
- `ProjectsTab.renderCard()`: Added `.mina-project-card__header-actions` cluster with pencil `EditProjectModal` trigger. Hover-reveal on desktop, always-visible on mobile.
- `EditEntryModal`: Mobile chip strip gains `mina-project-pill` (empty/active states, colored dot, dismiss ×). Desktop chip area gains `mina-proj-zone` with folder button or active chip.
- CSS: `mina-edit-project-sheet`, `mina-epm-*`, `mina-project-card__edit-btn`, `mina-project-pill`, `mina-proj-zone`


### Feat — Task Metadata Write Path (F1)

Priority, energy, and status fields are now fully writable from both the New Task and Edit Task flows. The `EditEntryModal` gains a metadata strip that renders on desktop (always-visible zone in the canvas) and mobile (horizontally-scrollable bottom dock bar).

**Architecture:**
- `EditEntryModal`: 3 new public fields `currentPriority`, `currentEnergy`, `currentStatus`; `_buildMetaStrip()` renders toggle buttons per breakpoint; `onSave` callback extended with trailing `priority?`, `energy?`, `status?` params
- `VaultService.buildTaskFrontmatter()`: added `priority?` and `energy?` params → writes `priority:` / `energy:` YAML lines
- `VaultService.createTaskFile()`: `opts` extended with `status?` — allows non-`open` initial status
- `VaultService.editTask()`: `opts?` param added → writes `priority`, `energy`, `status` via `processFrontMatter`
- `TasksTab`: New Task + Edit Task callbacks pass all 3 metadata fields; Edit pre-populates modal state
- CSS: `mina-meta-zone` (desktop, hidden on mobile), `mina-task-meta-bar` (mobile, hidden on desktop), `mina-meta-btn` toggle buttons with active state

## [1.5.1] - 2025-07-28
### Feat — Recurring Tasks (rm-7)

Recurring task support with auto-spawn on completion, `↻ Recurring` filter segment, and full recurrence editing in `EditEntryModal`.

**Architecture:**
- New `RecurrenceRule` type: `'daily' | 'weekly' | 'biweekly' | 'monthly'`
- `TaskEntry.recurrence?: RecurrenceRule` + `TaskEntry.recurrenceParentId?: string`
- `computeNextDue(currentDue, rule)` utility in `utils.ts`
- `IndexService` parses `fm.recurrence` + `fm.recurrenceParentId` from task frontmatter
- `VaultService.createTaskFile()` extended with optional `opts.recurrence` + `opts.recurrenceParentId`
- `EditEntryModal._buildRecurStrip()` — recur zone in mobile (inside date zone) and desktop (sibling canvas zone)

**UX:**
- `↻ Recurring` segment (amber) in TasksTab filter bar — groups tasks by frequency (daily/weekly/biweekly/monthly)
- On task completion: auto-spawns next occurrence with `computeNextDue`, displays `Notice` confirmation
- `mina-chip--recur` badge on recurring task rows across all views
- Recur strip: 4 frequency buttons (44px mobile, 28px desktop) with amber active state
- Done task preserved as audit log; next task inherits all context/project fields

## [1.5.0]- 2025-07-28
### Feat — Project Lifecycle Entities (rm-6)

New vault-entity-backed `ProjectsTab` replacing the tag-based grid, providing a full project management dashboard with card list, inline expansion, status management, and color coding.

**Architecture:**
- New `ProjectEntry` type with `id`, `name`, `status`, `goal`, `due`, `created`, `color`, `filePath` fields
- `IndexService.buildProjectIndex()` scans `Settings.projectsFolder` (default: `Projects/`) at startup
- `VaultService`: `createProject()`, `updateProject()`, `archiveProject()`, `loadProjectNotes()` methods
- `NewProjectModal` — clean-slate form with Name, Goal, Status seg-bar (Active/On Hold), Due date, 8-color swatch picker
- `ProjectsTab` — full vault-entity card list with filter pills (All/Active/On Hold/Completed), color-coded left-border cards, inline expand panel with task preview, status popover picker
- `DEFAULT_SETTINGS.projectsFolder: 'Projects'` + `MinaSettings.projectsFolder: string`

**UX:**
- Filter pills: All / Active / On Hold / Completed
- Card sort: active → on-hold → completed, alphabetical within groups
- Status badge: click to open inline popover with status options
- Expand panel: top-5 open tasks, View (opens vault file) + Archive actions
- NEXT task preview: earliest-due open task surfaced on card
- Task linkage: matches by `task.project === project.id || task.project === project.name` (backward compat)
- Desktop: 2-column grid layout via `@media (min-width: 768px)`

## [1.4.1] - 2026-04-21
### Feat — Habits Tab & Streak Engine (rm-2)

New dedicated `HabitsTab` providing a full habit tracking dashboard with streak analytics.

**Architecture:**
- Scans vault habit history files (past 90 days) on tab open to compute per-habit streaks
- `computeStreaks(habitId)` calculates: current streak, best streak (90-day window), this-week count, this-month count
- Habit toggles reuse existing `plugin.toggleHabit()` and suppress vault-event re-renders via `_habitTogglePending`
- Tab registered as `'habits'` in `view.ts` and accessible from Command Center navigation

**Today Quick-Bar:**
- Full-width 2-column grid (3-col tablet, 4-col desktop) for all active habits
- Full habit names visible; reuses `mina-habit-quick-btn` ring animation and `is-done` / `just-done` states
- Live progress bar and count label update on toggle; all-complete celebration class

**Streak Leaderboard:**
- Compact `<table>` ranked by current streak (highest first)
- Columns: Icon | Habit | 🔥 Current | Best | Month%
- Threshold color coding: 0=faint, 1–6=muted, 7–13=accent, 14–29=amber, 30+=red/bold

**Monthly Heat-Map:**
- 7-column ISO week grid with `< >` month navigation
- Day cell states: `is-done` (accent), `is-partial` (semi-transparent, for "all habits" mode), `is-missed` (red-tint), `is-today` (outline), `is-future` (dimmed)
- Habit filter pills to view any single habit or aggregate all
- Day-of-week (M T W T F S S) header row

**Management Row:**
- ⚙ Manage Habits → opens `HabitConfigModal`
- ↺ Reset Today → `ConfirmModal` guard, clears `completed[]` in today's frontmatter

**Navigation:**
- `Habits` entry added to ACTION cluster in Command Center footer (replaces Timeline which moved to MANAGEMENT)


### Feat — Structured Weekly Review (rm-1)

Complete rewrite of `ReviewTab.ts` with vault-persisted structured reflection.

**Architecture:**
- Weekly review files written to `Reviews/Weekly/YYYY-Www.md` (ISO week format)
- Full vault persistence via `VaultService.saveWeeklyReview()` and `loadWeeklyReview()`
- On tab open, existing review data is loaded and textareas pre-populated
- Ctrl+Enter / ⌘+Enter keyboard shortcut to save from anywhere in the form

**UI:**
- 4 collapsible section cards: 🏆 Wins, 📚 Lessons, 🎯 Next Week's Focus (3 numbered slots), 💡 Habit Highlight (read-only, auto-computed)
- Two-column layout on desktop via CSS container query (`@container mina-review (min-width: 340px)`)
- Dirty indicator dot appears in header when unsaved changes exist
- Save button: Default → Saving… → ✓ Saved (green spring animation) / ⚠ Save Failed
- Section collapse state persisted in `sessionStorage` — survives tab switches
- Previous Week card at bottom: collapsed by default, expands to render previous week's `.md` with `MarkdownRenderer`, "Open in Vault →" button
- Auto-expanding textareas (same pattern as capture bar)

## [1.3.1] - 2026-04-20
### Fix — Data Integrity, Security & Stability

**rm-3: Monthly Review Denominator Fix**
- Completion rate now uses tasks created/due *this month* as denominator — no longer inflated by entire vault history
- Thoughts stat card now shows "X captured / Y processed" for a real throughput metric

**rm-4: processFrontMatter Migration (Data Integrity)**
- `editThought`, `editTask`, `toggleTask`, `setTaskDue`, `updateTaskTitle` all migrated to `app.fileManager.processFrontMatter`
- Eliminates all string-based YAML regex manipulation — multiline values, special characters and quoted strings can no longer corrupt frontmatter
- Preserves `created`, `pinned`, `project`, `status`, `energy` fields automatically on every edit

**rm-5: DueEntry Amount from Frontmatter**
- Financial obligation amounts now read from `amount` frontmatter field (not parsed from filename)
- Renaming a due file no longer corrupts its amount
- Graceful legacy fallback: files without frontmatter `amount` still parse from filename

**rm-8: VoiceTab MediaStream / RAF / AudioContext Leak Fix**
- Added `activeStream` field — stream tracks always stopped in error path and on tab switch
- `processRecording` wrapped in try/catch — failed transcription no longer orphans state on `'processing'`
- `cleanup()` now nulls `mediaRecorder` after stop, preventing double-stop errors on iOS
- Prevents battery drain and microphone lockout on mobile

## [1.3.0] - 2026-04-20
### Feat — 5-State Voice Capture Redesign

Complete rewrite of the Voice tab as a best-in-class, cross-platform voice capture system.

**State Machine Architecture:**
- Replaced the single-screen UI with a 5-state DOM machine: `idle → recording → processing → reviewing → confirmed`
- `data-voice-state` attribute drives CSS visibility — zero JS DOM thrashing on transitions

**New Features:**
- **Auto-transcription**: Recording automatically transcribes after stopping — no manual Transcribe step needed
- **Inline Review state**: Editable transcript card with source badge (tap to play audio) — no modal interruption
- **Dual CTA routing**: Save as Thought (💭) or Create Task (✓) directly from review state
- **Sidecar `.md` files**: Each recording now saves a metadata file alongside the audio (duration, transcript, created)
- **Live waveform**: Real-time AudioContext FFT canvas during recording; 7-bar CSS animation fallback
- **Keyboard shortcuts** (desktop): `Space` = record/stop, `T` = save thought, `K` = create task, `Esc` = discard — suppressed when textarea focused
- **Long-press mic** (500ms): Start recording immediately without releasing touch
- **Swipe-left transcript**: Discard with rubber-band visual feedback (>80px, <400ms)
- **Swipe-up CTA strip**: Opens full EditEntryModal for power users who need context/due-date tagging
- **Haptic feedback** (`navigator.vibrate`) on all state transitions — graceful no-op on iOS

**Mobile UX Fixes:**
- Transcribe button: **28px → 44px** (was below minimum touch target)
- Mic button: 88×88px (up from 120×120px monolithic style — now proper 88px with accessibility sizing)
- CTA strip: sticky bottom with `env(safe-area-inset-bottom)` — safe for iPhone notch/home indicator
- Timer: monospace 36px, live REC dot with blink animation
- Tablet guard: `isTablet()` → skips inline CTA, routes to EditEntryModal

**CSS additions (~250 lines):**
- `.mina-voice-shell`, `.mina-voice-stage`, `.mina-voice-header`
- `.mina-mic-btn` + `.is-recording` + `@keyframes mina-mic-pulse-ring`
- `.mina-wave-bars`, `.mina-wave-bar` + `@keyframes mina-bar-pulse` (+ `.is-idle` paused state)
- `.mina-waveform-canvas`, `.mina-waveform-wrap.is-live`
- `.mina-voice-timer-row`, `.mina-rec-dot`, `.mina-rec-label`, `.mina-voice-timer`
- `.mina-voice-spinner` + `@keyframes mina-spin`
- `.mina-vs-reviewing`, `.mina-transcript-card`, `.mina-transcript-textarea` (16px iOS zoom fix)
- `.mina-source-badge`, `.mina-edit-hint`
- `.mina-voice-cta`, `.mina-cta-thought`, `.mina-cta-task`, `.mina-cta-discard`
- `.mina-voice-toast` + spring entrance animation
- `.mina-clip-row`, `.mina-clip-transcribe-btn` (44px height fix)
- Breakpoint overrides: XS ≤340px, LG 481–767px, desktop ≥768px
- `@media (prefers-reduced-motion)` block

**Clips panel:**
- 8 clips shown (was 10) — cleaner in sidebar
- Transcribing from clips now routes to the Review state (not EditEntryModal directly)

## [1.2.8] - 2026-04-20
### Chore — Remove 5 orphaned tabs

Deleted 5 tab files that had no entry point in the Command Center and were unreachable through normal navigation:

| Removed Tab | Route Key | Reason |
|---|---|---|
| `ThoughtsTab.ts` | `review-thoughts` | Orphaned — no hub button; functionality superseded by Daily Workspace |
| `MementoMoriTab.ts` | `memento-mori` | Orphaned — no hub button |
| `FocusTab.ts` | `focus` | Orphaned — no hub button |
| `HabitsTab.ts` | `habits` | Orphaned — no hub button; not registered in title switch |
| `ContextTab.ts` | `grundfos` / custom modes catch-all | Orphaned — Grundfos-era legacy, superseded |

**`view.ts` cleanup:**
- Removed `getModeTitle()` cases for `review-thoughts`, `focus`, `memento-mori`
- Removed `renderTab()` route branches for all 5 deleted tabs (including `grundfos`/`customModes` catch-all)
- Removed orphaned view state properties: `thoughtsFilterTodo`, `thoughtsFilterDate`, `thoughtsFilterDateStart`, `thoughtsFilterDateEnd`, `thoughtsFilterContext`, `showPreviousThoughts`, `showCaptureInThoughts`, `thoughtsOffset`

**`main.ts` cleanup:**
- Default tab on open changed from `'review-thoughts'` → `'home'` (Command Center)

## [1.2.7] - 2026-04-20
### Feature — Mobile long-press edit/delete for thought cards

#### Added
- **Long-press to edit or delete thoughts on mobile** — Thought cards in the Daily Workspace now support a long-press interaction (500ms stationary hold) on mobile phones. Activating a card reveals an inline **EDIT / DELETE** action strip that slides in at the bottom of the card (height 0 → 48px animated). Tapping outside any activated card collapses the strip.
- **Long-press engine** (`attachLongPress()`) — Scroll-safe: a `pointermove` guard cancels the hold if the finger travels >8px, so normal scrolling never accidentally triggers the strip. Haptic hint via `navigator.vibrate(25)` on activation. `contextmenu` suppression prevents Android/iOS system menus from appearing on hold.
- **Touch targets at 48px** — Both EDIT and DELETE buttons are 48×(50% card width), well above the 44px AAA minimum. Each has distinct color coding: EDIT in `--interactive-accent`, DELETE in `--text-error`.
- **Dismiss listener cleanup** — The one-shot document-level dismiss listener is stored on the element and removed on re-render, preventing listener leaks across renders.
- **Reduced motion support** — `@media (prefers-reduced-motion: reduce)` disables the strip slide animation and press scale.

#### Changed
- Desktop hover-reveal actions: no change (pencil + trash, `opacity: 0 → 1` on hover, 28×28px).
- Tablet (`isTablet()`) routes to the desktop path — hover-reveal, not long-press.

#### Fixed
- Removed dead CSS rule `.is-mobile .mina-dw-entry-actions { opacity: 1; }` that was never wired and has been superseded by the long-press strip.


### Patch & Enhancement — Image rendering, paste stability, Enter behavior

#### Added
- **Embedded images render inline** — Thought entries in the Daily Workspace now render `![[filename.png]]` as `<img>` elements using `app.vault.getResourcePath()`. Supports PNG, JPG, GIF, WebP, SVG, BMP, AVIF. Non-image embeds render as styled `[[link]]` text. Files not yet indexed fall back to an italic `[image: name]` placeholder. CSS: `.mina-dw-entry-img` (max-height 320px, rounded), `.mina-dw-entry-wikilink`, `.mina-dw-entry-img-placeholder`.

#### Fixed
- **Paste no longer wipes the capture textarea** — `vault.on('create')` was unconditionally calling `notifyRefresh()` for every file created, including attachment binaries saved by the paste handler. This triggered a full tab re-render that cleared the textarea mid-edit. `notifyRefresh()` in the `create` handler is now gated: only fires when the created file is an indexed type (thought / task / habit).
- **Plain Enter is now a line break** — Capture bar previously saved on plain `Enter`, making it impossible to paste or type multi-line content without accidentally saving. Changed to `Ctrl+Enter` / `Cmd+Enter` to capture (consistent with EditEntryModal). Header hint updated to `⌘↵ to capture`.
- **`Notice` static import in paste handler** — `await import('obsidian')` is a dynamic import; esbuild treats `obsidian` as external so it resolves to an empty shim at runtime, silently breaking the handler. Fixed by moving `Notice` to the static top-level import in `utils.ts`. Pre-scan of clipboard items is now done synchronously before any `await` so `e.preventDefault()` fires before the browser consumes the event.


### Feature — Clipboard paste & drag-drop attachments in all capture inputs

#### Added
- **Paste images/files from clipboard** — In the Daily Workspace capture bar and the Edit Entry modal (both desktop and mobile), pasting an image (`Ctrl+V` / `Cmd+V`) now saves the file to the vault and inserts an Obsidian `![[filename]]` wiki-link at cursor. Works for PNG, JPEG, GIF, WebP, SVG, PDF, and any binary file type.
- **Drag-and-drop files** — Dragging a file from the filesystem directly onto any of the above textareas triggers the same flow: save to vault → insert link.
- **`attachmentsFolder` setting** — New setting (default: `000 Bin/MINA V2 Attachments`) controls where pasted/dropped files are saved. Exposed in the MINA Settings tab under "Storage & Capture".
- **`attachMediaPasteHandler` utility** — Reusable `utils.ts` function that can be wired to any textarea for consistent attachment handling across the plugin.


### Patch — Task/thought folder collision fix & checkbox immediate feedback

#### Fixed
- **Quick-add task no longer creates a phantom thought** — Root cause: `isThoughtFile()` used a bare `path.startsWith(folder)` check. Since `thoughtsFolder` (`'000 Bin/MINA V2'`) is a string prefix of `tasksFolder` (`'000 Bin/MINA V2 Tasks'`), every task file path returned `true` for `isThoughtFile`. The vault `create` event therefore called `indexThoughtFile` for new task files, adding them to `thoughtIndex` and making them appear in the left writing panel. Fixed by appending a trailing `/` to the folder prefix in both `isThoughtFile` and `isTaskFile`.
- **Checkbox completes task immediately** — `toggleTask` writes the file but `metadataCache` updates asynchronously. The previous 200ms `setTimeout` re-render saw stale index data and re-rendered the task as still open. Fixed by directly mutating the `taskIndex` entry's `status` and `modified` fields right after `toggleTask` resolves, followed by `rebuildCalculatedState()` and a synchronous re-render. Same fix applied to the mobile peek-bar checkbox.


### Patch — Daily Workspace quick-add reliability & panel separation

#### Fixed
- **Quick-add task list updates immediately** — root cause was `indexTaskFile()` relying on `metadataCache.getFileCache()` which returns `null` right after file creation. Fixed by directly injecting a `TaskEntry` into `taskIndex` with the known data (title, body, day, status) immediately after `createTaskFile()` resolves, bypassing the async metadataCache pipeline entirely. `rebuildCalculatedState()` is called to keep radar queue consistent. The metadataCache event still runs later and overwrites with the full parsed entry as expected.
- **Left panel shows only thoughts** — the writing surface (left pane) was incorrectly showing both thoughts and tasks, creating confusing duplicate visibility (tasks appeared in left entry list AND right task panel). Left panel now shows today's thoughts only. Tasks created via quick-add or the main capture bar remain exclusively in the right task panel where they belong.

## [1.2.2] - 2026-04-20
### Patch — Daily Workspace quick-add refresh & delete entries

#### Fixed
- **Quick-add task auto-refresh** — adding a task via the Quick Add input now clears the field immediately, disables it while saving, and re-renders the task list after 500ms (up from 200ms) to give IndexService time to pick up the new file. The task reliably appears in the sidebar after Enter.
- **Delete entries from workspace** — a 🗑 delete button now appears on hover alongside the edit pencil for every thought and task entry. Tapping it opens a confirmation prompt; on confirm the file is moved to trash and the entry list re-renders in place. No tab navigation required.

## [1.2.1] - 2026-04-20
### Patch — Daily Workspace inline edit

#### Fixed
- **Inline note editing in Daily Workspace** — clicking the ✏️ edit button on any entry now opens `EditEntryModal` directly within the workspace instead of navigating away to the Thoughts or Tasks review tab. Both thought and task entries are handled — the modal pre-fills text, contexts, and due date, saves back via `editThought()`/`editTask()`, and re-renders the workspace in place. Zero context-switching, no lost flow.

## [1.2.0] - 2026-04-20
### 🚀 Minor Release — Daily Workspace Tab

#### New Features
- **Daily Workspace tab** — freeform daily capture space accessible from Command Center nav and command palette (`Open MINA Daily Workspace`)
- **Split-pane layout (desktop)** — writing surface with sticky capture bar on the left, task sidebar (overdue/today/upcoming) on the right via container queries
- **Toggle-pane layout (mobile)** — WRITE | TASKS segmented toggle with persistent task peek bar at bottom
- **Capture bar** — auto-expanding textarea for quick thought/task capture with Thought/Task mode toggle, inline triggers (@date, [[link, #tag)
- **Chronological entry list** — daily thoughts and tasks rendered with timestamps, tags, and hover action buttons
- **Task sidebar** — open tasks grouped by overdue, today, and upcoming sections with inline checkbox completion
- **Task peek bar (mobile)** — always-visible bottom bar showing next actionable task with one-tap completion
- **Date navigation** — arrow-based day navigation with Today shortcut button
- **Keyboard shortcuts** — Ctrl+N (new capture), Ctrl+T (toggle panels), Escape (cancel)
- **Storage** — reuses existing MINA V2 folder via VaultService (no new directories)

## [1.1.2] - 2026-04-20
### Patch - Command Center capture input auto-grows with note length

#### Changed
- **Command Center capture textarea** - the inline input now auto-resizes as you type so longer notes expand the input area instead of staying fixed-height
- **Desktop and mobile capture flows** - both Command Center capture paths now share the same autosize behavior on open, input, trigger-driven text changes, and reset
- **Capture shell height caps** - expanded desktop and mobile capture bodies now allow taller note input before clipping

## [1.1.1] - 2026-04-20
### Patch - EditEntryModal aligned with Command Center capture bar

#### Changed
- **EditEntryModal desktop layout** - rewrote the desktop path to use semantic CSS classes instead of inline styles so it matches the Command Center capture surface
- **Edit modal textareas** - both mobile and desktop paths now use Calibri to align with the capture bar input styling
- **Mode toggle active state** - mobile float and desktop modal toggles now use the accent-filled active treatment
- **Mobile action row** - Cancel and Capture now share the same pill shape and equal sizing
- **Desktop modal workflow** - added the Thought/Task segmented toggle to desktop and switched due-date controls to the shared `_buildDateStrip()` flow
- **Desktop save behavior** - save button disable/enable behavior now mirrors the mobile modal
- **Mobile chip strip** - removed the inline `+` tag picker from the modal and restored the `# to tag` empty hint when no contexts are selected

#### Removed
- **Inline modal tag picker** - deleted the unused `_toggleInlineTagPicker()` mobile helper and the matching `.mina-tag-picker-*` CSS block

## [1.1.0] - 2026-04-20
### 🚀 Minor Release — Bill Overview & Capture Bar Overhaul

#### New Features
- **Bill Overview (Finance Tab redesign)** — complete rebuild of the Financial Ledger into a dedicated "Bill Overview" experience:
  - **Summary strip** — 4 live metric chips (Overdue, Due Today, Upcoming, Total/Mo) with danger/accent tinting when counts are non-zero
  - **Smart status cards** — each bill card carries a 4px left stripe and 4% background tint keyed to status: `is-overdue` (red), `is-today` (accent), `is-soon` (amber, ≤7d), `is-upcoming` (neutral), `is-inactive` (desaturated)
  - **Status badges** — inline pill badges per card: `OVERDUE`, `DUE TODAY`, `In Xd / Tomorrow`, `↻ Recurring`, `PAID`
  - **Active/All History toggle** — full-width segmented pill on mobile, compact fit-content on desktop via container query
  - **FAB (mobile) / inline "+ New Bill" (desktop)** — CSS-only visibility swap using Obsidian's `.is-mobile` / `.is-desktop` body classes; FAB respects `env(safe-area-inset-bottom)` for iOS home indicator
  - **Tap-to-open** — card body opens the vault note directly (`Platform.isMobile ? 'tab' : 'window'`); pay button isolated with `e.stopPropagation()` and a 60×60px invisible tap zone via `::before`
  - **Empty state** — copy adapts to Active vs All History filter mode; CTA opens `NewDueModal`
  - **CSS container queries** (`@container mina-bills`) — layout responds to Obsidian panel width, not viewport — 2→4 column summary, full→fit-content toggle, 2→1 line bill name clamp
  - **RGB fallback tokens** — `--mina-bills-error-rgb` and `--mina-bills-warning-rgb` added to `:root`; Obsidian themes are not guaranteed to expose `--text-error-rgb` / `--text-warning-rgb`
  - **Mobile-first touch UX** — 44px minimum tap targets throughout; CSS-only ripple on `:active::after`; `-webkit-tap-highlight-color: transparent`; `scale(0.91)` press feedback on pay button; no `mouseenter`/`mouseleave` hover-only states

- **`#` tag trigger in capture bar** — typing `#` in the capture textarea opens a native `SuggestModal` (`ContextSuggestModal`) pre-filtered by typed text, identical UX to Obsidian's `[[` link trigger. `+ Create "#tag"` option available for new tags. Replaces the broken inline DOM-based pill panel.

- **Timeline infinite scroll** — feed loads stacked day sections; `IntersectionObserver` sentinels auto-load ±2 days on scroll; spotlight carousel syncs to currently visible day; prepend preserves scroll position.

- **Timeline perspective carousel** — 5-item header carousel with scale/opacity depth; center item 72px accent; swipe/drag navigation with velocity-based day jumping (Pointer Events API, `touch-action: pan-y`).

#### Fixed
- **Desktop: letter 'C' blocked in capture textarea** — `onKey` shortcut guard now checks `cap.hasClass('is-expanded')` first; when bar is open no shortcut ever fires
- **Capture re-render suppression** — `_capturePending` flag prevents `notifyRefresh()` from wiping the DOM during active capture
- **Tag autocomplete null crash** — `null` entries in `settings.contexts` no longer crash `getSuggestions()`
- **Timeline — frozen carousel header** — `mina-tl-wrap` uses `position: absolute; inset: 0` + `min-height: 0` on feed flex child
- **Timeline — deleted entry re-appears** — trash-renamed files excluded from `isThoughtFile()` / `isTaskFile()` path guards

#### Changed
- Capture textarea font → Calibri; padding reduced; `min-height` 72px
- Cancel + Capture buttons → equal `flex: 1` size; accent color on active mode toggle
- `# to tag` static hint removed from chip strip


### Added
- **Bill Overview — `is-soon` card status** — Bills due within 7 days now receive the `is-soon` CSS class (previously all future bills got `is-upcoming`). Cards with this status show a warning-amber left stripe and a 4% amber background tint for clear visual urgency differentiation.
- **Bill Overview — card background tints** — Status-aware subtle background washes added: overdue → 4% red, due today → 4% accent, due soon (≤7d) → 4% amber. Inactive/upcoming cards retain neutral background.
- **Bill Overview — RGB fallback tokens** — Added `--mina-bills-error-rgb: 239, 68, 68` and `--mina-bills-warning-rgb: 245, 158, 11` to `:root`. These ensure `rgba()` tints and stripe colors work correctly across all Obsidian themes regardless of whether `--text-error-rgb` / `--text-warning-rgb` are defined by the theme.

## [1.0.13] - 2026-04-20
### Fixed
- **Desktop: letter 'C' blocked in capture textarea** — `onKey` document-level shortcut listener was intercepting every `C` keypress using `document.activeElement` (global scope), which could diverge from `parent.ownerDocument.activeElement` inside Obsidian's rendering context. Fixed by adding `if (cap.hasClass('is-expanded')) return` as the first guard — when the capture bar is already open, the shortcut never fires regardless of focus state.

### Changed
- **Capture input — reduced padding** — `.mina-capture-inline-canvas` padding reduced from `14px 16px` to `8px 12px`; textarea `min-height` reduced from 96px to 72px; textarea `padding-top` set to `0` for a tighter, denser input area
- **Capture toggle — accent color on both desktop & mobile** — `.mina-capture-inline-toggle .mina-seg-btn.is-active` uses `var(--interactive-accent)` background. Desktop `toggleBar` now also carries the `mina-capture-inline-toggle` class so the accent rule applies consistently across both layouts
- **Cancel / Capture buttons — equal size** — both buttons now use `flex: 1` (previously `flex: 1` / `flex: 2`), rendering as identical-width pills in the action row
- **Removed `# to tag` hint** — chip strip no longer shows the static hint text when no tags are selected; strip is simply empty until a tag is added via `#` trigger

## [1.0.12] - 2026-04-20
### Changed
- **Capture textarea — Calibri font** — `font-family` on `.mina-capture-inline-textarea` changed from `var(--font-text)` to `'Calibri', var(--font-text), sans-serif` for both desktop and mobile capture bars
- **Capture textarea — removed top padding** — `padding: 12px 0 0 0` reduced to `padding: 0`; text now starts flush at the top of the input area
- **Mobile capture — CANCEL pill matches CAPTURE shape** — `.mina-capture-inline-cancel` redesigned as a ghost pill: `border-radius: 10px`, `border: 1.5px solid var(--background-modifier-border-faint)`, `min-height: 44px`, uppercase 800-weight label — visually identical shape to the CAPTURE button. Both buttons use `flex: 1` / `flex: 2` ratio so CAPTURE stays dominant. Active state transitions border and text color instead of the old plain text fade.

## [1.0.11] - 2026-04-20
### Fixed
- **`#` tag trigger — replaced broken inline suggest panel with native `SuggestModal`** — the inline DOM-based pill panel was unreliable due to overflow clipping, focus loss, and re-render collisions. Replaced entirely with `ContextSuggestModal` (Obsidian `SuggestModal`) opened immediately when `#` is typed at the start of text or after whitespace — identical UX to `[[`. The `#` is stripped from the textarea, the modal opens pre-filtered, and selecting a tag fires `onContext(tag)` to add a chip. `+ Create "#tag"` option shown when the typed name is new.
- **Tag autocomplete — null crash** — a `null` entry in `settings.contexts` (from malformed YAML `context:` frontmatter) caused `ctx.toLowerCase()` to throw inside `getSuggestions()`, silently returning zero results. Fix: `loadSettings()` now strips null/non-string entries on startup; `scanForContexts()` guards nulls on accumulation; `ContextSuggestModal.getSuggestions()` filters defensively before any string ops.
- **Capture bar re-render suppression** — `saveSettings()` was being called inside the `onContext` callback during live capture (writing `data.json` → vault `modify` event → `notifyRefresh()` → 400 ms debounce → full `renderView()` → DOM wipe). Fix: `onContext` only mutates `plugin.settings.contexts` in memory; `saveSettings()` is deferred to `handleSave` (after capture success). Added `_capturePending` flag to `MinaView` (mirrors existing `_taskTogglePending` pattern); set to `1` on capture bar expand and `0` on collapse; `notifyRefresh()` skips `renderView()` while `_capturePending > 0`.
- **`attachInlineTriggers` shared utility** — added optional `getContexts?: () => string[]` 5th parameter; both `CommandCenterTab` and `EditEntryModal` now pass `() => plugin.settings.contexts ?? []` so `ContextSuggestModal` receives the live list at modal-open time.

## [1.0.10] - 2026-04-21
### Fixed
- **Desktop capture bar — inline triggers** (`@date`, `[[`, `+`) now work correctly in the inline expand bar. Logic extracted from `EditEntryModal._attachInlineTriggers` into shared `attachInlineTriggers(app, textarea, setDueDate)` utility in `utils.ts`. Wired to the desktop expand textarea in `CommandCenterTab`. `@date` trigger also auto-switches capture mode to Task.

## [1.0.9] - 2026-04-21

### Changed
- **Timeline — spotlight carousel header** — replaced the flat horizontal date strip with a 5-item perspective carousel merged into the header; the center (spotlight) item is large (72 px) with accent background and drop shadow; ±1 items are scaled to 0.9 at 70% opacity; ±2 items are scaled to 0.76 at 38% opacity; a full-date subtitle (`MONDAY, APRIL 21 · 2026`) sits below the carousel
- **Timeline — swipe/drag navigation** — added horizontal swipe on the carousel track using the Pointer Events API (unified mouse-drag + touch-swipe handler); velocity-based day jumping: slow (<0.45 px/ms) = 1 day, medium = 2–3 days, fast (>1.5 px/ms) = 4 days; 25 px minimum threshold prevents micro-movement triggers; `setPointerCapture` keeps tracking if pointer leaves the element; `touch-action: pan-y` preserves native vertical scroll on mobile
- **Timeline — infinite vertical scroll** — feed now loads multiple day sections stacked vertically with sticky day headers; `IntersectionObserver` sentinels at top/bottom boundaries auto-load 2 more days as user scrolls; a second `IntersectionObserver` on each day header syncs the spotlight carousel to the currently visible day; prepend operations preserve scroll position via `scrollTop` + `scrollHeight` delta; `navigateToDate()` performs partial updates (header-only re-render + smooth scroll to target day) without destroying the feed

### Fixed
- **Timeline — carousel scrolls out of view** — `.mina-tl-wrap` switched from `height: 100%` to `position: absolute; inset: 0; overflow: hidden` so it reliably fills Obsidian's view container; `.mina-tl-feed` gained `min-height: 0` (critical flexbox fix — without it a flex child won't constrain its height and the whole page scrolls instead of just the feed); the header slot now stays frozen at the top at all times

## [1.0.8] - 2026-04-20

### Fixed
- **Timeline — deleted entry re-appears after deletion** — `VaultService.deleteFile()` renames to a `/trash/` subfolder rather than hard-deleting, which fires a vault `'rename'` event. Because `/trash/` lives inside the thoughts/tasks folder, `isThoughtFile()` / `isTaskFile()` returned `true` for the trash path, causing the renamed file to be immediately re-indexed and re-appear in the timeline. Fix: exclude paths containing `/trash/` in `isThoughtFile()` and `isTaskFile()` in `IndexService`.

## [1.0.7] - 2026-04-20

### Fixed
- **Timeline — delete not reflected in view** — after confirming a delete, the entry was still visible because `renderTimeline()` ran before the async vault `'delete'` event could update the index. Fix: eagerly remove the entry from `thoughtIndex` / `taskIndex` before calling `renderTimeline()`, matching the same eager-purge pattern used in `main.ts`'s vault event handler

## [1.0.6] - 2026-04-20

### Changed
- **Timeline — full redesign** — complete architectural and visual overhaul of the Timeline tab:
  - **Header bar**: Home icon + "TIMELINE" label + "+ NEW" accent FAB button for quick capture
  - **Date carousel**: horizontal scroll with 75-day range (60 back, 14 forward); activity dots on dates with entries; TODAY pill with accent ring; active pill with accent fill; auto-scrolls to selected date on render
  - **Entry feed**: vertical spine layout — left accent line with node dots per entry; cards distinguish THOUGHT (accent) vs TASK (amber) via colored left-border and type badge
  - **Entry cards**: meta row (type badge + timestamp), body text rendered as Markdown, footer with due-date chip + context pills, hover-reveal Edit + Delete action buttons
  - **Empty state**: centered glyph + message + ghost "Capture a thought" CTA
  - **New entry capture**: "+ NEW" FAB and empty-state CTA both open the standard `EditEntryModal`
  - All inline styles replaced with semantic CSS classes (`.mina-tl-*`); 323 lines of new CSS added to `styles.css`

## [1.0.5] - 2026-04-20

### Fixed
- **Navigation — new window renders correct tab** — `MinaView` now overrides `getState()` and `setState()` so Obsidian correctly applies `activeTab` and `isDedicated` when a new window leaf is created via `setViewState()`; previously the new window always rendered the Command Center (home) regardless of which button was clicked

## [1.0.4] - 2026-04-20

### Changed
- **Navigation — new-window mode** — clicking any ACTION, MANAGEMENT, or SYSTEM button in the Command Center footer now opens the target mode in a **new window** (desktop) or new tab (mobile) instead of replacing the current view
- **activateView — exact tab match** — the leaf-reuse logic now matches by `activeTab` for all leaves (dedicated and non-dedicated), so clicking the same nav button a second time focuses the existing window rather than spawning a duplicate

## [1.0.3] - 2026-04-20

### Changed
- **Command Center — Intelligence hidden** — hid the Intelligence section from the Command Center UI for now without removing the underlying AI implementation
- **Command Center — center strip removed** — removed the remaining section between the Weekly/Monthly goals block and the footer button clusters so the layout flows directly into navigation

## [1.0.2] - 2026-04-20

### Changed
- **Tasks — merged open queue** — merged the separate Inbox and Due filters into one `Open` view that groups tasks by Overdue, Today, Upcoming, and No Date while preserving `No Date` as a focused subset filter

## [1.0.1] - 2026-04-20

### Added
- **Checklist — Refresh button** — ↻ icon in CHECKLIST header re-indexes `thoughtChecklistIndex` from vault and re-renders the view on demand
- **IndexService — `thoughtDoneChecklistIndex`** — new index populated with `- [x]` lines from MINA V2 files modified today; cleared on each `buildThoughtIndex` rebuild

### Changed
- **Checklist — section order** — CHECKLIST now renders above the Overdue task group in the Command Center TO DO area
- **Checklist — tick behaviour** — ticking an item instantly moves it to the bottom of the list via local re-render (no full view re-render); item is sourced from vault truth (`thoughtDoneChecklistIndex`) after re-index, with `checklistCompletedToday` as the optimistic 400 ms window
- **Checklist — drag reorder** — all items (open and done) are now draggable; `checklistOrder` tracks the full combined list; deduplication prevents double entries after vault re-index
- **Checklist — done items source** — done items shown in CHECKLIST are now read directly from the vault (`- [x]` in today's files) rather than session state alone
- **CommandCenterTab — inline triggers** — `@word ` resolves to `[[YYYY-MM-DD]]` via NLP date parsing; `+` at line start inserts `- [ ] `; `[[` opens file suggester
- **IndexService — YAML field fixes** — `context:` (singular) read correctly; `[[YYYY-MM-DD]]` wikilink strings stripped before date comparison
- **Commands** — removed all plugin commands except "MINA: Open Command Center"
- **Navigation** — removed all plugin ribbon icons except the Command Center entry

## [1.0.0] - 2026-04-19

### Added
- **Command Center** — primary hub with Tactical Core, Zen Mode focus toggle, and reactive nerve system
- **Thought Capture** — instant modal with YAML-based metadata, context tagging, and auto-linking
- **Task Ledger** — YAML-native task files with status, due date, and project fields
- **AI Chat (AiTab)** — grounded chat against vault thoughts via Gemini API with citation support
- **Voice Memos (VoiceTab)** — in-browser MediaRecorder with transcription via Gemini
- **Financial Ledger (DuesTab)** — obligation tracking with payment recording and next-due management
- **Habits System** — daily habit files with streak tracking
- **Synthesis Mode (SynthesisTab)** — zero-inbox triage for unprocessed thoughts
- **Weekly Review / Quarterly Compass** — GTD-style review cadence with North Star goals
- **Projects** — tag-based project grouping across thoughts and tasks
- **Daily View** — aggregated daily dashboard across tasks, dues, thoughts, and habits
- **IndexService** — O(1) in-memory indices for all entity types with reactive file-watcher updates
- **VaultService** — unified file I/O with YAML injection-safe frontmatter builders
- **AiService** — Gemini integration with chunked base64, injection boundary markers, model allowlist, and API key header security
- **17 tabs, 17 modals** — full Personal OS feature set
