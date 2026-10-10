# Active Context: DIWA — Personal OS

## Current State: Tablet Mode Viewport Stability & Fluid Ergonomics Deployed
- **Tablet Mode Viewport Stability & Fluid Ergonomics (`src/utils.ts`, `src/views/DesktopHubView.ts`, & `styles.css`)**:
  - **Immune Tablet Detection (`src/utils.ts`)**:
    - Updated `isTablet()` to inspect physical screen dimensions (`Math.min(screen.width, screen.height) >= 768` or `Math.max(screen.width, screen.height) >= 1024`).
    - Physical screen measurements never contract when the virtual software keyboard opens, ensuring tablet detection remains 100% stable in landscape and portrait.
  - **Root & Window Viewport Scroll Protection (`src/views/DesktopHubView.ts` & `styles.css`)**:
    - Enforced `overflow: hidden !important;` and `scrollTop = 0` on `.diwa-workspace-root:has(.pos-desktop-cockpit-layout)` and `this.contentEl` in cockpit mode, completely blocking WebKit's native keyboard-avoidance engine from scrolling outer layout containers.
    - Added `{ preventScroll: true }` to all composer textarea focus calls (`textarea.focus({ preventScroll: true })`), stopping WebKit from triggering document-level scroll jumps.
    - Wired a passive window scroll guard resetting `window.scrollTo(0, 0)` if WebKit attempts to shift the Obsidian webview window.
  - **Fluid Tablet Stage Ergonomics (`styles.css`)**:
    - Reverted `.pos-cockpit-main-stage` to `overflow: hidden !important; height: 100%; display: flex; flex-direction: column;`, keeping the layout pinned inside the leaf container above the keyboard.
    - Pinned `.pos-cockpit-composer-wrapper` at `flex-shrink: 0;` directly below the header with compact padding (`8px 16px 4px 16px`).
    - Capped `.pos-composer-textarea` with `max-height: 90px !important;` and `font-size: 16px !important;` to eliminate iPadOS WebKit auto-zooming and screen crowding.
    - Assigned `.pos-cockpit-main-stage .pos-document-stream` `flex: 1 1 0% !important; min-height: 0 !important; overflow-y: auto !important; -webkit-overflow-scrolling: touch;`, providing fluid touch scrolling for note items below the composer.
    - When composer is active on tablet (`.is-tablet.is-composer-active`), automatically hides the carousel filter bar (`display: none !important;`), giving an immediate extra ~40px of vertical viewing space to note items.
- **Production Build & Vault Deployment**:
  - Strict TypeScript check (`tsc --noEmit --skipLibCheck`) and ESBuild production build passed cleanly with 0 errors.
  - Deployed fresh `main.js` and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` vault plugin directories.

## Previous Phase: Single-Line Inline Outliner (`HH:MM PM <content>`) Deployed
- **Single-Line Inline Outliner Architecture (`src/views/DesktopHubView.ts` & `styles.css`)**:
  - Restructured `.pos-note-stream-item` from stacked 2-line cards into a single-horizontal-baseline outliner row:
    - **DOM-Level Flex Row Enforcement**: Injected `display: flex; flex-direction: row; align-items: flex-start; gap: 12px;` directly on `.pos-note-stream-item` DOM elements, bypassing any Obsidian theme overrides or stale CSS cache.
    - **Fixed Left Gutter (`.pos-note-gutter`)**: Fixed `68px` tabular timestamp (`font-variant-numeric: tabular-nums; font-size: 0.76em; color: var(--text-faint);`) with optional multi-select checkbox (`width: 86px` in selection mode).
    - **Content Column (`.pos-note-content-wrap`)**: Starts at the exact same horizontal column guideline across all notes, housing `.pos-note-body` (`display: inline`) and inline metadata pills (`.pos-note-badges`).
    - **Zero Headline-Body Gap**: Eliminates awkward vertical zig-zag scanning on 1-word or short thoughts (`"08:41 PM  Passport renewal  [Personal]"` on one unified line).
    - **Automatic Hanging Indent**: Notes spanning 2+ lines wrap exclusively within `.pos-note-content-wrap`, keeping the left timestamp gutter completely clear and cleanly indented.
    - **Flush-Right Hover Capsule (`.pos-note-actions`)**: Anchored at `top: 3px; right: 8px;` with solid background and shadow, appearing quietly on row hover with zero layout shift, shielded by `padding-right: 96px` on the content column so text never collides.
  - **Option 1 Architectural Day Separation (`DesktopHubView.ts` & `styles.css`)**:
    - **High-Contrast Dividing Rule**: Injected explicit line styles on `.pos-date-line` (`height: 1px; background: var(--background-modifier-border, rgba(255, 255, 255, 0.15)); flex: 1; display: block;`), ensuring clear dark-mode visibility.
    - **Generous Inter-Day Spacing**: Increased top margin to `32px auto 10px auto` (`14px` for the very first date divider), establishing an unmistakable structural boundary between consecutive days.
    - **Aligned Typography**: Scoped `.pos-date-divider` with `padding: 0 8px;`, perfectly aligning `TODAY [ 2 notes ] ───────` with the stream column guideline.
  - **Option 1 Rapid Multi-Block Chaining (`DesktopHubView.ts`)**:
    - **`Shift + Enter`**: Instantly captures current block, clears textarea, auto-resizes to 1 line, and preserves focus in the textarea for seamless rapid-fire chaining without touching the mouse.
    - **`Ctrl / ⌘ + Enter`**: Captures note block and finishes session (collapses composer).
  - **Agenda Side Panel Renaming & Default Activation (`DesktopHubView.ts`)**:
    - **Renamed from "Rail" to "Agenda"**: Replaced technical "Rail" term with user-intuitive `◧ Agenda` toggle button and aria labels.
    - **Active by Default**: Versioned localStorage key (`diwa-cockpit-state-v2`) resetting any stale auto-collapsed states so Agenda is open by default on desktop/tablet.
    - **No Aggressive Auto-Collapse**: Reduced collapse breakpoint from `1050px` to `768px` (mobile only), allowing the Agenda panel to remain open during desktop multi-pane workflows.
- **Production Build & Vault Deployment**:
  - Strict TypeScript check (`tsc --noEmit --skipLibCheck`) and ESBuild production build passed cleanly with 0 errors.
  - Deployed fresh `main.js` and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` vault plugin directories.

## Previous Phase: Recently Updated Permanent Notes Feature Deployed
- **Permanent Note Query & Discovery (`src/services/IndexService.ts`)**:
  - Implemented `isPermanentNoteFile(fileOrPath)`: filters markdown files outside `captureFolder`, `attachmentsFolder`, and `.trash`.
  * Respects optional whitelist setting `permanentNotesFolders` (or defaults to all non-capture markdown files in the vault).
  - Implemented `getRecentlyUpdatedPermanentNotes(limit, query)`: sorts by `file.stat.mtime` descending and supports real-time text query filtering across title, folder, and path.
- **Dedicated Modal & Mobile Bottom Sheet (`src/modals/RecentPermanentNotesModal.ts`)**:
  - Desktop & Tablet: Centered modal with search input, note title, folder badge (`📁`), tag indicators, and relative update time (`5m ago`, `2h ago`).
  - Mobile Phones: Implemented as a native slide-up bottom sheet (`pos-mobile-bottom-sheet`) with drag handle and swipe-down gestures.
  - 1-tap navigation: Tapping a note immediately opens it in the workspace and dismisses the modal.
- **UI Triggers & Platform Parity (`src/views/DesktopHubView.ts` & `src/main.ts`)**:
  - Desktop / Tablet: Added `[ 📚 Recent ]` pill button to header actions (`.pos-header-actions`).
  - Mobile Phones: Added 5th circular button (`book-open` icon) to the 1-line floating action bar (`.pos-mobile-action-bar`), centered with 42px touch target.
  - Command Palette: Registered `DIWA: Show Recently Updated Permanent Notes`.
- **Zero Build Errors & Production Deployment**:
  - Passed `tsc --noEmit --skipLibCheck` and `npm run build` cleanly.
  - Deployed `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` vault plugin directories.

## Previous Phase: Uniform Neutral Styling for Gawa Header Pill
- **Header Pill Consistency (`styles.css`)**:
  - Removed persistent `.pos-gawa-header-trigger` accent override (`color: var(--text-accent)`, `background: rgba(var(--accent-rgb), ...)`).
  - The Gawa quick-launcher pill now conforms to `.pos-header-text-btn`, matching `Select` and `Digest` with a clean, neutral secondary background and muted text, activating accent color only on hover or active states.
  - Deployed cleanly to active test vaults (`/Users/K26/Obsidian/K0000` & `K0001`).

## Previous Phase: Mobile Navigation Bar Hidden by Default for Scratchpad Workspace
- **Default State on Mobile Phones (`DesktopHubView.ts` & `src/main.ts`)**:
  - Enforced `diwa-hide-mobile-navbar` on `document.body` whenever the scratchpad / DIWA workspace is mounted (`DesktopHubView.onOpen`), activated (`plugin.activateWorkspace`), switched to (`active-leaf-change`), or restored on mobile app launch (`onLayoutReady`).
  - Restricted strictly to mobile phones (`isMobile && !isTablet`), ensuring desktop and tablet environments are untouched and never hide navigation elements.
  - Toggling via the mobile action bar's `panel-bottom` button remains functional for transient inspection, with re-entry always defaulting back to hidden.
  - When switching away to a standard note, external file, or unloading the plugin, the hide class is cleanly removed to maintain Obsidian's default behavior outside DIWA.

## Previous Phase: Universal Task Deduplication & Block ID Cleaning Deployed
- **Universal Task Deduplication (`IndexService.ts`)**:
  - Automatically deduplicates tasks across ALL scanned sources: across multiple project notes in `additionalTaskFolders`, within the same file, and between capture notes and permanent notes.
  - Strips Obsidian block reference IDs (`\s*\^[a-zA-Z0-9_-]+$`, e.g. `^dw-2ppuu4-b1`) from `cleanTitle` and normalization signatures, preventing block IDs from polluting task titles in Karon or breaking deduplication matching.
  - Compatible due date matching: tasks with identical text collapse into a single canonical task while preserving date and area metadata.
- **Bi-Directional Task Synchronization (`CaptureService.ts` & Views)**:
  - `GawaTaskRecord.shadowedLocations` tracks all duplicate occurrences across the vault.
  - Toggling in Gawa or Karon atomically checks/unchecks the task in every note where it exists.
  - Added transparency in Gawa Inspector: displays `🔗 Synced with: <Note>` metadata indicator.

## Previous Phase: Configurable Additional Task Folders Built & Deployed
- **Additional Task Folders Setting (`DiwaSettings.additionalTaskFolders`)**:
  - Configurable multi-folder whitelist in Settings (`DiwaSettingTab`) under **Storage & Workspace** (comma or newline separated).
  - Normalizes paths and excludes `/trash/` or accidental root matches.
- **Unified Task Indexing (`IndexService.ts`)**:
  - `getConfiguredAdditionalTaskFolders()`, `isAdditionalTaskFile(path)`, and `isTrackedProjectFile(path)`.
  - Expanded `projectTaskIndex` to index both explicitly tracked task files and files located in `additionalTaskFolders`.
  - Added parallel chunked indexing (`CHUNK_SIZE = 50`) and `file.stat.mtime` caching via `_taskFileMtime` to avoid redundant file I/O.
  - Tasks from these additional folders automatically populate **Gawa Task Cockpit** and **Karon Horizon** (Today & Horizon agenda / overdue alerts).
- **Reactive Watcher & Refresh Coordination (`RefreshCoordinator.ts` & `src/main.ts`)**:
  - `RefreshCoordinator.reindexFile()` now detects modifications in `additionalTaskFolders` and tracked files, indexing only the modified file and dispatching targeted `tasks` refresh scope.
  - Vault `create`, `delete`, `rename`, and `metadataCache` events update `projectTaskIndex` dynamically.
- **Scratchpad Inviolability**:
  - Continuous scratchpad stream (`DesktopHubView`) remains strictly scoped to `captureFolder` (`000 Bin/Diwa`), preventing inbox clutter.

## Previous Phase: Karon (Today & Horizon View) Built & Deployed
- **Karon Dedicated Leaf View (`VIEW_TYPE_KARON = 'diwa-karon'`)**:
  - Created `src/views/KaronView.ts` implementing Option A (Chronological Stream / Agenda with collapsible date sections):
    - **Header & Horizon Switcher**: Supports `[ ☀️ Today ]`, `[ 📅 3 Days ]`, and `[ 🗓️ 7 Days ]` horizons with 1-click toggling.
    - **Overdue Tasks Banner**: High-priority alert banner rendering all incomplete overdue tasks with direct checkbox resolution and relative overdue day badges.
    - **Day-by-Day Accordion Sections**:
      - Chronological sections for Today (`D+0`), Tomorrow (`D+1`), and upcoming days (`D+2` through `D+7`).
      - Summary pills displaying task count and note reference count.
      - Collapsible day headers with chevron toggles.
    - **Tasks Due Sub-Section**: Interactive checkboxes tied to `CaptureService.toggleTaskInFile`, area badges, due badges, remarks count, and source note peek buttons.
    - **Notes Intended for Day Sub-Section**: Previews notes referencing target date `[[YYYY-MM-DD]]` or frontmatter due/day, rendering extracted markdown snippets with `MarkdownRenderer` and internal link peeking (`WikilinkPeekModal`).
- **Target Date Indexing & Queries (`IndexService.ts`)**:
  - Added `targetDateIndex: Map<string, Set<string>>` for $O(1)$ lookup of notes intended for any target date.
  - Automatically indexes dates from `allDates` (`[[YYYY-MM-DD]]`), frontmatter `due`/`scheduled`/`day`/`targetDate`, and `gawaTasks` due dates.
  - Query methods: `getCapturesForTargetDate()`, `getTasksForDueDate()`, `getOverdueTasks()`, and `extractTargetDateSnippets()`.
- **Plugin Integration & Launchers (`src/main.ts`, `src/constants.ts`, `src/views/DesktopHubView.ts`)**:
  - Registered view `VIEW_TYPE_KARON`, custom sunrise/horizon SVG icon (`KARON_ICON_ID`), ribbon launcher, and command `DIWA: Open Karon (Today & Horizon)`.
  - Added 1-tap `[ ☀️ Karon ]` quick launcher button to `DesktopHubView` header.
  - Wired `VIEW_TYPE_KARON` into `RefreshCoordinator.ts` for instant 0ms bi-directional refresh on task toggling or note edits.
- **Styling (`styles.css`)**:
  - Added namespaced styles `.pos-karon-*` adhering to Obsidian CSS variables.
- **Zero Build Errors & Production Deployment**:
  - Clean `tsc --noUnusedLocals --noUnusedParameters --noEmit --skipLibCheck` and `npm run build`.
  - Deployed `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` and `/Users/K26/Obsidian/K0001` vault plugin directories.
- **Scratchpad Note Horizon Setting**:
  - Implemented configurable rolling retention windows in `DiwaSettings`: `'today'`, `'3d'`, `'7d'` (default/recommended), `'14d'`, `'30d'`, `'all'`, and `'custom'`.
  - Added "Always Show Important Notes (⭐)" toggle (default: `true`), keeping starred thoughts and tasks visible in the scratchpad regardless of note age.
  - Added flexible date parser in `src/utils/dateParsing.ts` supporting standard ISO dates (`YYYY-MM-DD`) and natural language phrases (`August 1, 2026`, `Aug 1 2026`) via `moment` and `chrono-node`.
  - Settings UI (`DiwaSettingTab`): Dropdown horizon selector, custom start date text input, `📅 Pick Date` modal trigger (`DatePickerModal`), `✕ Clear` reset button, and live filter description.
- **Index & Horizon Filtering (`IndexService.ts`)**:
  - `getScratchpadCutoffTimestamp()` computes rolling start-of-day timestamps automatically.
  - `isEntryInScratchpad(entry)` evaluates entries against cutoff timestamp while respecting `keepImportantInScratchpad`.
  - `getAllCaptures(ignoreHorizon?: boolean)`: Browsing respects rolling horizon; global search (`ignoreHorizon: true`) searches the entire vault capture archive so older notes are never lost.
  - Scratchpad count badges (`All Notes`, `Open Tasks`, `Important`, `Today`, `Upcoming`, `Untagged`, Life Areas) accurately reflect notes within the active horizon.
- **Workspace Feed & Empty State (`DesktopHubView.ts`)**:
  - Header displays active horizon badge (e.g. `Personal OS · Last 7 Days`).
  - Empty state informs user when no notes were captured within the active horizon window.
  - **Digested Notes Inbox Zero Fix**: Enforced strict exclusion of `digested: true` notes from the default continuous scratchpad feed (`All Notes`). Digested notes immediately leave the scratchpad upon digestion and remain accessible in Calendar Digest history or when explicitly filtering by `digested`.
- **Block-Level Digestion with Non-Destructive Comment Hiding (Option B)**:
  - Preserves 100% zero data loss while solving multi-block scratchpad retention.
  - Digested blocks inside source notes are wrapped in native Markdown comments: `%%\ndiwa-digested:dest=[[Target]]\n<content>\n%%`.
  - Blocks routed to "Keep in Scratchpad" remain uncommented and rendered in the scratchpad feed.
  - `IndexService.ts`: Strips `%% ... %%` comment blocks when calculating `visibleBody`, tasks, and wikilinks, hiding digested blocks from the scratchpad stream while keeping raw file text 100% intact. Exposes `rawBody` on `CaptureEntry` so Calendar Digest and re-digesting engines access full note content.
  - `CaptureService.ts`: `wrapBlockAsDigested()` non-destructively wraps digested blocks in source notes. `parseDigestibleBlocks()` normalizes previously digested `%% diwa-digested:dest=... %%` blocks for re-digestion. `unmarkCaptureAsDigested()` strips `diwa-digested` comments when resetting status.
  - `CalendarDigestView.ts`: Uses `rawBody` for rendering and block parsing, preventing empty-body digest lockouts and displaying clean note markdown in daily reviews.
  - `DesktopHubView.ts`: Automatically filters out notes whose visible body is completely empty and taskless.
- **Calendar Digest & Review Architecture Deployed (`VIEW_TYPE_CALENDAR_DIGEST = 'diwa-calendar-digest'`)**:
  - Created `src/views/CalendarDigestView.ts` implementing the master-detail split-pane layout:
    - Left Rail (~280px–300px): Month grid navigation (`< Prev`, `Next >`, `Today`), 7-column calendar cells with daily status dots (🟢 Digested, 🟡 Partial/Raw, ⚪ Empty), and quick horizon filters (`Today`, `Yesterday`).
    - Right / Center Stage: Date header, digest status pill, stream of capture note cards with markdown rendering, time, area tags, task counters, and primary `[ ⚡ Digest Day ]` action.
    - Mobile Responsive: Segmented tabs `[ 📅 Calendar | 📝 Stream (N) ]` for narrow screens.
  - Registered `VIEW_TYPE_CALENDAR_DIGEST` in `src/constants.ts` and `src/main.ts` with custom calendar-check icon (`CALENDAR_DIGEST_ICON_ID`).
  - Registered global command: `DIWA: Open Daily Digest & Review`.
  - Added ribbon launcher with calendar icon and header quick launcher `[ 📅 Digest ]` in `DesktopHubView`.
- **AST Block-Level Digestion Engine (`CaptureService.ts`)**:
  - `parseDigestibleBlocks`: Groups parent tasks together with all indented subtasks and remarks, code fences, and paragraphs into atomic `DigestibleBlock` records.
  - `extractTargetWikiLinks`: Strips temporal date links (`[[YYYY-MM-DD]]`), detects explicit routing syntax (`-> [[Target]]`), and ranks candidate links.
  - `reconcileTargetNoteContent`: Reverse-chronological top-insertion beneath `## Tasks` (for open tasks) and `## Log` (for notes and completed tasks), strictly preserving YAML frontmatter and document titles.
  - `executeBatchDigest`: Two-phase in-memory batch write executing exactly one `app.vault.process()` per destination file.
  - Idempotent Guard Comments: Injects `<!-- diwa-digest:src=...:idx=... -->` and `<!-- diwa-digest:end -->` so re-digests update content in-place without duplicating or overwriting manual edits.
  - Atomic frontmatter stamping: Updates `digested: true` and `digestedAt` on source capture notes.
- **Pre-Flight Confirmation Modal (`PreFlightDigestModal.ts`)**:
  - Interactive triage review displaying each block, task vs log pills, and destination pill selector (`[ 🟢 Primary Target ]`, candidate alternative links, `[ 🔍 Pick Note... ]` via `FileSuggestModal`, and `[ 📁 Keep in Scratchpad ]`).
  - Supports task routing to `## Tasks`, `Gawa Inbox`, or custom destination.
  - Keyboard shortcut: `Enter` executes digest.
  - **Rich Markdown Rendering**: Block snippet previews render with `MarkdownRenderer.render(this.app, block.cleanText, snippet, block.sourceFilePath, this.plugin)`, showing pictures, embedded media (`![[...]]`), wikilinks, and formatting visually during triage review. Styled with `max-height: 260px` image containment.
  - **Life Area Block Persistence**: Extracts the source capture's life area and appends `#<area>` inline to task lines and thought logs upon digestion. Gawa automatically detects the tag, assigns the Life Area column badge, and strips the hashtag from the title column to keep task titles clean. PreFlight modal displays area badges (`pos-preflight-area-pill`).
  - **Gawa Task Update Synergy**: `CaptureService.updateTaskDetailsInFile` detects non-capture/project task files and updates `#<area>` inline on the task line rather than overwriting file frontmatter.
- **IndexService & Gawa Synergy (`IndexService.ts`)**:
  - `dateIndex: Map<string, Set<string>>`: In-memory secondary index for $O(1)$ daily note lookups.
  - `getDayDigestSummary` & `getMonthDigestSummary`: Fast summaries calculating digested vs pending counts and status dots.
  - Tracked Task Files Registry: `projectTaskIndex` tracks tasks routed to permanent project notes so they remain 100% active and interactive in `GawaCockpitView.ts`, with `Source ↗` linking to the project file.
- **Scratchpad "Inbox Zero" Flow (`DesktopHubView.ts`)**:
  - Digested notes are hidden by default from the continuous scratchpad feed, keeping daily capture clean.
  - Can be toggled on demand via `all` or `digested` filter modes.
  - Notes remain fully visible in the Calendar Digest view history on their captured date.
- **Zero Build & Lint Errors**:
  - `npx tsc --noUnusedLocals --noUnusedParameters --noEmit --skipLibCheck` passed with 0 errors.
  - `npm run build` compiled cleanly into production `main.js`.
  - Deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` vault plugin directories.
