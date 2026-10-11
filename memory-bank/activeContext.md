# Active Context: DIWA — Personal OS

## Current State: Stream Dates as Normal Wikilinks & Completed Task Strike-Through
- **Stream Date Wikilink Styling (`DesktopHubView.ts` & `styles.css`)**:
  - Date links inside note markdown bodies (`.pos-rendered-date-link`) are now treated like normal editorial wikilinks:
    - Displayed inline with regular text color (`var(--text-normal) !important; font-weight: 600 !important;`).
    - Styled with an editorial solid hairline underline (`underline solid var(--background-modifier-border) !important; text-underline-offset: 3.5px !important; text-decoration-thickness: 1px !important;`).
    - Stripped of subtle pill backgrounds, padding, and muted grey text colors (`background: transparent !important; padding: 0 !important;`).
    - On hover, underline subtly illuminates to `var(--text-muted)`.
    - Date click action menu (`openDateActionMenu` for snooze/reschedule) remains fully interactive.
- **Completed Task Full Strike-Through (`DesktopHubView.ts` & `styles.css`)**:
  - In the stream, when a task is completed (`- [x]` / `li.is-checked` / `li[data-task="x"]`), **all child elements are included in being striked through**:
    - Child wikilinks (`a.internal-link`, `.pos-stream-wikilink`), date links (`.pos-rendered-date-link`), text, tags, code, and bold/italic elements all receive `text-decoration: line-through !important; color: var(--text-muted) !important; text-decoration-color: var(--text-muted) !important;`.
    - `attachInteractiveElements()` initializes `listItem.toggleClass('is-checked', cb.checked)` and `data-task="x"` immediately on view mount, guaranteeing completed tasks are striked through upon note loading as well as on interactive toggle.
    - Extended across Gawa task rows (`.pos-gawa-row.is-completed`), subtasks, Karon task rows, and Agenda side rail tasks (`.pos-rail-task-title.is-completed`).
- **Production Build & Vault Deployment**:
  - Passed all 13 unit tests via `npm test` and compiled clean production bundle with `npm run build`.
  - Deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

## Previous State: Tablet Workspace Optimization (Full-Width Stream in Portrait, Available/Collapsible Agenda in Landscape)

## Previous State: Right Pane Fixed-Width Sidebar Anchored to Right Edge (Option 1 Implemented)
- **Fixed-Width Sidebar Anchoring (`styles.css` & `DesktopHubView.ts`)**:
  - **Fixed Width Anchored to Right**: `.pos-cockpit-side-rail` operates as an in-flow sidebar locked at a fixed pixel width (`_cockpitRailWidth`, default `340px`, range `260px`–`600px`) anchored flush to the right edge with `margin-left: auto !important; align-self: stretch;`.
  - **Dynamic Main Stream**: The document stream (`.pos-cockpit-main-stage`) has `flex: 1 1 auto !important; min-width: 0 !important; width: auto !important;`, dynamically absorbing 100% of window resizing while the right rail stays fixed and pinned against the right margin.
  - **Pixel Width Resizer**: Draggable center resizer (`.pos-cockpit-resizer`) allows adjusting the sidebar width in pixels from the left edge (`startX - e.clientX`), persisting `railWidth` to `localStorage`.
  - **Clean Collapse**: When collapsed (`.is-collapsed`), the rail transitions to `width: 0 !important; border-left: none; opacity: 0;`, letting the stream occupy the full window width.
- **Production Build & Vault Deployment**:
  - Passed all 13 unit tests via `npm test` and compiled clean production bundle with `npm run build`.
  - Deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

## Previous State: Clean Solid Hairline Wikilinks Deployed (Spellcheck Look Eliminated)
- **Elimination of Dotted Spellcheck-Style Underlines (`styles.css`)**:
  - Replaced all dotted underlines across note stream body (`.pos-note-body a.internal-link`), modal peek links (`.pos-stream-wikilink`), Gawa table titles, subtasks, and comments (`.pos-gawa-table ... a.internal-link`, `.pos-gawa-subtask-title a.internal-link`, `.pos-gawa-comment-content a.internal-link`), and Agenda rail task titles (`.pos-rail-task-title a.internal-link`).
  - Swapped with an editorial, clean solid hairline:
    `text-decoration: underline solid var(--background-modifier-border, rgba(255, 255, 255, 0.2)); text-underline-offset: 3.5px; text-decoration-thickness: 1px; font-weight: 600;`
  - Generous `3.5px` offset prevents descenders ('p', 'g', 'j', 'y', 'q') from colliding into the line.
  - On hover, the hairline softly illuminates to `var(--text-muted)` without neon accent saturation.
- **Production Build & Vault Deployment**:
  - Passed all 13 unit tests via `npm test` and compiled clean production bundle with `npm run build`.
  - Deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

## Previous State: Gawa Task Cockpit Complete Monochrome & Color Muting Deployed
- **Horizon Filter Chips Monochroming (`GawaCockpitView.ts` & `styles.css`)**:
  - Replaced bright colored circle emojis (`🔴 Overdue`, `🟡 Today`, `🟢 Upcoming`, `⚪ Undated`) with clean vector Lucide SVG icons (`alert-circle`, `calendar`, `calendar-clock`, `help-circle`, `check-square`).
  - Added subtle muted red outline for active overdue chip (`border-color: rgba(239, 68, 68, 0.32); background: rgba(239, 68, 68, 0.04);`).
- **Table Elements & Badges Muted (`GawaCockpitView.ts` & `styles.css`)**:
  - Subtask Progress Pill: Replaced raw unicode characters (`✓`, `☑`) and green accent fill with Lucide vector icons (`check`, `check-square`) and muted card borders.
  - Remarks Badge: Replaced bright speech balloon emoji `💬` with Lucide `message-square` SVG icon; removed accent hover glow.
  - Life Area Pills: Wrapped emojis in `.pos-emoji-muted` (`filter: grayscale(0.85) opacity(0.8)`).
  - Empty State: Replaced sparkles emoji `✨` with Lucide `check-circle` SVG.
- **Inspector & Modals Complete Accent Removal (`styles.css`, `GawaFilterSheetModal.ts`, `GawaQuickTaskModal.ts`)**:
  - Replaced bright accent backgrounds on area chips (`.pos-gawa-insp-area-chip.is-active`), subtask progress fills (`.pos-gawa-subtask-progress-fill.is-complete`), and focus rings with muted dark mode standards (`var(--background-modifier-hover)`, `var(--text-muted)`).
  - Removed bright accent fills from `GawaFilterSheetModal` and `GawaQuickTaskModal` chips, submit buttons, and inputs.
- **Production Build & Vault Deployment**:
  - Passed all 13 unit tests via `npm test` and compiled clean production bundle with `npm run build`.
  - Deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

## Previous State: Capture Bar Hotkey Guides Removed & Pencil Icon Circle Outline Deployed
- **Pencil Icon Circle Outline & Hotkey Cleanliness (`DesktopHubView.ts` & `styles.css`)**:
  - **Circular Pencil Badge (`.pos-compact-icon`)**: Enclosed the idle pencil icon in a dedicated 26px circular badge (`border-radius: 50%`, `border: 1px solid var(--background-modifier-border)`, `background: var(--background-primary)`). On capsule hover, the circle border and icon illuminate with `var(--interactive-accent)`.
  - **Removed Idle Hotkey Guides**: Removed `pos-compact-actions` rendering `[ C ]` and `[ ⌘↵ ]` badges on the right side of the idle capsule, giving full visual focus to the clean prompt.
  - **Streamlined Expanded Composer**: Removed `pos-composer-hint` and cleaned the primary save button text from `Capture ⌘↵` to `Capture`.
- **Tactile Command Capsule Quick Capture Bar (`DesktopHubView.ts` & `styles.css`)**:
  - Restyled `.pos-composer-compact` into an elevated, tactile "Command Capsule" with strong visual presence:
    - **Solid Surface & Border**: Upgraded from transparent to `background: var(--background-secondary)` with an architectural perimeter border `1px solid var(--background-modifier-border)` and modern `8px` rounded corners.
    - **Floating Depth & Elevation**: Added subtle ambient drop shadow (`box-shadow: 0 2px 6px rgba(0, 0, 0, 0.14)`) providing depth against the dark page canvas.
    - **Hover & Focus Glow**: Interactive accent illumination (`border-color: var(--interactive-accent)` with soft ambient halo and focus ring).
    - **Typography & Iconography**: Simplified prompt text to `"Capture your thought..."` with crisp readability (`color: var(--text-normal); font-weight: 500; opacity: 0.85;`).
- **Production Build & Vault Deployment**:
  - Passed all 13 unit tests via `npm test` and compiled clean production bundle with `npm run build`.
  - Deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

## Previous State: Digest and Gawa Views Monochrome & Architectural Unification Deployed
- **Calendar Digest View Theme Alignment (`src/views/CalendarDigestView.ts` & `styles.css`)**:
  - Replaced colorful emojis in mobile tab switches (`📅 Calendar`, `📝 Stream`), horizons (`📅 Today`, `⏪ Yesterday`), and digest actions (`↺ Re-digest Day`, `⚡ Digest Day`) with crisp Lucide vector SVG icons (`calendar`, `file-text`, `rewind`, `rotate-ccw`, `sparkles`, `arrow-up-right`).
  - Added mid-heavy 2px architectural divider below `.pos-digest-header` (`border-bottom: 2px solid var(--background-modifier-border)`) on `var(--background-primary)`.
  - Harmonized stage status pills, buttons (`.pos-digest-action-btn`, `.pos-undigest-btn`), and date pills to the muted cockpit standard without bright accent saturations.
  - Softened digested block indicators and stage cards to subtle borders and backgrounds.
- **Gawa Task Cockpit Theme Alignment (`styles.css`)**:
  - Added mid-heavy 2px architectural divider below `.pos-gawa-header` (`border-bottom: 2px solid var(--background-modifier-border)`) on `var(--background-primary)`.
  - Replaced loud accent backgrounds on active filter chips (`.pos-gawa-chip.is-active`), view buttons, and inspector save buttons with understated muted hover styles (`background: var(--background-modifier-hover); color: var(--text-normal); border: 1px solid var(--text-muted);`).
  - Softened checkboxes (`accent-color: var(--text-faint); filter: grayscale(1) opacity(0.6)`).
  - Outlined overdue dates (`.date-overdue`) with subtle muted red (`rgba(239, 68, 68, 0.32)` border, `rgba(239, 68, 68, 0.04)` background, `rgba(239, 68, 68, 0.85)` text).
  - Muted wikilinks (`color: var(--text-muted); border-bottom: 1px dotted var(--background-modifier-border)`) and inline tags.
- **Production Build & Vault Deployment**:
  - Passed all 13 unit tests via `npm test` and compiled clean production bundle with `npm run build`.
  - Deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

## Previous State: Agenda Rail Due Date Explicit "Due:" Prefix Deployed
- **Explicit "Due:" Prefix in Agenda Panel (`DesktopHubView.ts`)**:
  - Updated `renderRailTaskRow()` to render due date badges as `[ 📅 Due: <date> ]` instead of raw dates.
  - Automatically applies across all sections in the Agenda panel:
    - **Horizon Tab**: Overdue Tasks (`[ 📅 Due: YYYY-MM-DD ]`), Today's Tasks, and Tomorrow's Tasks.
    - **Tasks Tab**: All, Overdue, Today, and Upcoming task lists.
- **Production Build & Vault Deployment**:
  - Passed all 13 unit tests via `npm test` and compiled clean production bundle with `npm run build`.
  - Deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

## Previous State: Tasks Filter Consolidated into Unified View Dropdown
- **Unified Filter Dropdown Integration (`DesktopHubView.ts`)**:
  - Moved the **Tasks** filter directly into the `[ All Notes ▾ ]` dropdown menu alongside `All Notes` (showing vector `check-square` Lucide SVG and active `openTaskCount` count badge).
  - When Tasks is selected, the header button automatically reflects the active state: `[ ☑️ Tasks ▾ ]` with active styling.
  - Selecting any other view (`All Notes`, `Important`, `Today`, `Upcoming`, `Untagged`, or life area) cleanly switches the stream and clears the task-only restriction.
  - Eliminated the standalone `[ ☑️ Tasks (N) ]` header button, yielding a minimal, distraction-free top header bar:
    `[ 🔍 Search / ]   [ 🎛️ All Notes ▾ ]   [ ◨ Agenda ]   [ ⋯ ]`
- **Production Build & Vault Deployment**:
  - Passed all 13 unit tests via `npm test` and compiled clean production bundle with `npm run build`.
  - Deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

## Previous State: Day Stream Divider Line Visibility Restored & Left Pane Anchored
- **Day Stream Divider Line Visibility (`styles.css`)**:
  - Restored `.pos-date-line` from invisible `background: var(--text-faint); opacity: 0.25;` to Obsidian's standard architectural border: `background: var(--background-modifier-border); display: block; height: 1px;`.
  - Set `.pos-date-divider` to `width: 100%; max-width: 100%;` across base and cockpit main stage layouts, allowing the horizontal divider line to span cleanly all the way across to the right edge of the stage (resizer boundary), creating a distinct architectural day separator (`TODAY [ 2 ] ─────────────────`).
- **Left-Anchored Stream & Capture Layout (`styles.css`)**:
  - Replaced all horizontal auto centering (`margin: 0 auto;`) across the left pane / main stage with left-anchored margins:
    - `.pos-cockpit-composer-wrapper .pos-composer-compact, .pos-cockpit-composer-wrapper .pos-desktop-composer`: `margin: 0;`
    - `.pos-cockpit-main-stage .pos-document-stream .pos-date-divider`: `margin: 32px 0 10px 0;`
    - `.pos-cockpit-main-stage .pos-document-stream .pos-note-stream-item`: `margin: 0 0 2px 0;`
    - `.pos-cockpit-main-stage .pos-selection-bar`: `margin: 0;`
    - `.pos-cockpit-main-stage .pos-filter-carousel`: `margin: 0;`
    - `.pos-cockpit-main-stage .pos-document-stream .pos-empty-state`: `margin: 32px 0 0 0; text-align: left; align-items: flex-start; padding: 32px 8px;`
    - Base `.pos-date-divider` and `.pos-note-stream-item`, plus tablet responsive rules: `margin: 14px 0 6px 0 !important;` and `margin: 0 0 2px 0;`.
  - Preserved optimal line length reading comfort (`max-width: var(--diwa-stream-max-width, 820px)` for notes), anchored solidly to the left gutter padding (`padding-left: 24px`).
  - **Result**: The left edge of all notes, capture box, date dividers, and indicators remains completely stationary when the Obsidian window is resized, eliminating horizontal shifting.
- **Production Build & Vault Deployment**:
  - Passed all 13 unit tests via `npm test` and compiled clean production bundle with `npm run build`.
  - Deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

## Previous State: Muted Red Overdue Outlines & Notes Tag Muting Deployed
- **Subtle Muted Red Outlines for Overdue Items (`styles.css` & `DesktopHubView.ts`)**:
  - Outlined the Horizon "Overdue Tasks" Card (`.pos-rail-overdue-box`) with a refined muted red border (`border: 1px solid rgba(239, 68, 68, 0.32); background: rgba(239, 68, 68, 0.04);`), pairing with soft red header typography and alert icon (`color: rgba(239, 68, 68, 0.85);`).
  - Added `is-overdue` class to overdue task rows in `renderRailTaskRow()` (`.pos-rail-task-item.is-overdue`), applying a matching subtle muted red border (`border-color: rgba(239, 68, 68, 0.32); background: rgba(239, 68, 68, 0.03);`) across both Horizon and the Tasks rail tab.
- **Muted Tags in Notes Tab (`styles.css`)**:
  - Replaced bright accent neon green (`color: var(--text-accent);`) on `.pos-rail-note-tag` with a quiet, desaturated badge (`color: var(--text-muted); background: var(--background-secondary-alt); border: 1px solid var(--background-modifier-border-faint);`).
  - Swapped raw emoji `📝` in recent notes empty state for Obsidian Lucide `file-text` SVG icon.
- **Production Build & Vault Deployment**:
  - Passed all 13 unit tests via `npm test` and compiled clean production bundle with `npm run build`.
  - Deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

## Previous State: Mid-Heavy Architectural Divider Line Between Header & Stream Deployed
- **Mid-Heavy Divider Line (`styles.css`)**:
  - Upgraded the hairline divider beneath the header (`.pos-cockpit-header-wrapper`, `body.is-tablet .pos-cockpit-header-wrapper`, and standalone `.pos-header-bar`) to a prominent mid-heavy architectural boundary: `border-bottom: 2px solid var(--background-modifier-border)`.
  - Establishes a crisp, clean physical separation between the top cockpit controls (`DIWA`, on-demand search capsule, life area filter, tasks toggle, agenda rail toggle) and the note stream below.
- **Header Actions Restructuring (`DesktopHubView.ts` & `styles.css`)**:
  - **On-Demand Search Pill**: Replaced the wide permanent center search bar with an elegant `[ 🔍 Search / ]` pill. Clicking or pressing `/` smoothly expands a sleek, low-profile inline search capsule with auto-focus, real-time debounced filtering, and instant `✕` / `Escape` dismiss.
  - **Unified Filter Dropdown Pill**: Added a single view lens pill (`[ 🏷️ All Notes ▾ ]`, `[ 💼 Work ▾ ]`, etc.) providing instant 1-tap switching across All Notes, Important, Today, Upcoming, Untagged, and configured Life Areas with real-time count badges.
  - **Tasks Toggle Pill**: Added a dedicated `[ ☑️ Tasks (N) ]` pill alongside Agenda to quickly filter the stream to open tasks only.
  - **Digest Moved to More Menu**: Removed the top-right `📅 Digest` pill, integrating it as the primary action inside the `⋯` menu with completion status (`✓ Done`).
- **Complete Elimination of Multi-Chip Carousel (`styles.css` & `DesktopHubView.ts`)**:
  - Removed `pos-filter-bar` (`display: none !important`), eliminating all vertical clutter between the header and capture box. The interface flows seamlessly from header directly to the capture box and stream.
- **Production Build & Vault Deployment**:
  - Passed all 13 unit tests via `npm test` and compiled clean production bundle with `npm run build`.
  - Deployed fresh `main.js` and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

## Previous State: Date Divider Color Synchronized with Timestamps (var(--text-faint))
- **Date Divider Palette Harmonization (`styles.css` & `DesktopHubView.ts`)**:
  - Bound `.pos-date-heading` and `.pos-date-count` color to `var(--text-faint) !important`, perfectly matching the stream timestamp font color (`.pos-note-time`).
  - Styled `.pos-date-line` with `background: var(--text-faint); opacity: 0.25;` directly in the stylesheet, giving the divider rule a unified, soft aesthetic that integrates naturally with the outliner grid.
- **Production Build & Vault Deployment**:
  - Passed all 13 unit tests via `npm test` and compiled clean production bundle with `npm run build`.
  - Deployed fresh `main.js` and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

## Previous State: Flush Stream Task Checkbox (Option 1) & Muted Completed Tick Box Deployed
- **Stream Task List Indentation Elimination (Option 1, `styles.css`)**:
  - Overrode Obsidian's default `padding-inline-start: var(--list-indent)` and margin offsets on `ul.contains-task-list` and `.markdown-rendered ul.contains-task-list` (`padding: 0 !important; margin: 2px 0 4px 0 !important; margin-left: 0 !important; margin-inline-start: 0 !important;`).
  - Positioned the task checkbox flush at the exact same horizontal guideline as normal notes (`left: 0; top: 3px;`), followed cleanly by task text with a compact 22px padding indent, completely removing the awkward ~24px / ~48px jagged list indentation.
- **Muted Completed Task Tick Box (`styles.css`)**:
  - Replaced the vibrant default theme `accent-color: var(--interactive-accent)` on completed checkboxes (`li.is-checked input[type="checkbox"]`, `.task-list-item-checkbox:checked`, `.pos-interactive-checkbox:checked`) with a subtle `accent-color: var(--text-faint, rgba(255, 255, 255, 0.35))` and `filter: grayscale(1) opacity(0.5)`.
  - Completed tick boxes now settle quietly into the background in monochrome without screaming for visual attention.
- **Production Build & Vault Deployment**:
  - Passed all 13 unit tests via `npm test` and compiled clean production bundle with `npm run build`.
  - Deployed fresh `main.js` and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

## Previous State: Stream Date Divider Typography, Clean Note Count & Idle Task Button Removal Deployed
- **Stream Date Divider Typography & Note Count (`styles.css` & `DesktopHubView.ts`)**:
  - Lowered `.pos-date-heading` font size to `0.58em` (~9.5px, down 2pt from earlier 0.68em), with `font-weight: 600`, letter tracking (`0.08em`), and muted `var(--text-faint, var(--text-muted))` color, creating an understated, clean hierarchy that does not compete with note body text.
  - Condensed `.pos-date-count` to `font-size: 0.56em` (~9px), `padding: 0 4px`, `min-width: 14px`, and simplified indicator text to just `${count}` (e.g. `TODAY [ 2 ] ───────`).
  - Aligned tablet date divider styling to match (`font-size: 0.58em`).
- **Idle Capture State Decluttering (`DesktopHubView.ts`)**:
  - Removed the `taskChip` (`☑️ Task`) button from `pos-compact-actions` in the idle capture bar.
  - The idle state now presents a minimalist single input prompt (`✏️ What's on your mind?...`) alongside shortcut hints (`C`, `⌘↵`), with 1-tap/click activation anywhere on the bar expanding the full composer.
- **Production Build & Vault Deployment**:
  - Passed all 13 unit tests via `npm test` and compiled clean production bundle with `npm run build`.
  - Deployed fresh `main.js` and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

## Previous State: Muted Wikilinks, Stream Date Badge Removal & Recent Notes Peek Modal Deployed
- **Muted Wikilink Styling (`styles.css`)**:
  - Restyled `.pos-note-body a.internal-link`, `.pos-note-body .internal-link`, and `.pos-stream-wikilink` to neutral body text color (`var(--text-normal)`), bold weight (`600`), and a dotted underline (`text-decoration: underline dotted var(--text-muted, currentColor)` with `text-underline-offset: 3px`).
  - Preserved gentle hover highlighting (`var(--text-accent, var(--interactive-accent))`) without jarring idle neon vibration.
- **Redundant Stream Date Badges Removed (`DesktopHubView.ts`)**:
  - Removed the `.pos-date-badge` loop in `renderStreamItem()`.
  - Date boundaries are already prominently delineated by chronological day dividers (`TODAY`, `YESTERDAY`, etc.) and dates remain naturally visible in note markdown.
  - Full date reminder and rescheduling workflows remain accessible via the note `⋯` action menu.
- **Recent Notes Peek Modal Integration (`WikilinkPeekModal.ts`, `DesktopHubView.ts`, `RecentPermanentNotesModal.ts`)**:
  - Clicking recent notes in the Agenda rail (`renderRailNoteItem`) opens `WikilinkPeekModal` for instant preview, stream filtering, and note actions without losing context. Power user modifiers (`⌘/Ctrl + Click` for tab, `Alt + Click` for window) remain active.
  - Clicking recent notes in `RecentPermanentNotesModal` or selecting first match on Enter also opens `WikilinkPeekModal`.
  - Hardened `WikilinkPeekModal` constructor with `app.vault.getAbstractFileByPath()` fallback resolution for full file paths.
- **Production Build & Vault Deployment**:
  - Passed all 13 unit tests via `npm test` and clean production build with `npm run build`.
  - Deployed fresh `main.js` and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

## Previous State: Agenda Rail Persistence & Stream Deletion Input Activation Fix Deployed
- **Agenda Panel Multi-Tab Persistence (`DesktopHubView.ts`)**:
  - Added zero-dimension guard `if (width <= 0) return;` in `setupResizeObserver()`, preventing backgrounded, transitioning, or newly opened Obsidian tabs from misreporting as narrow layouts.
  - Eliminated automatic `this._cockpitRailOpen = false` mutations from `ResizeObserver`. The Agenda rail now strictly respects the user's manual toggle state and persists reliably across tab switches, window resizes, and app restarts.
- **Stream Note Deletion & Input Activation Hardening (`ConfirmDeleteModal.ts`, `DesktopHubView.ts`, `styles.css`)**:
  - Replaced native blocking `window.confirm()` calls with a dedicated non-blocking Obsidian modal (`ConfirmDeleteModal`). Prevents WebKit and Electron from dropping window focus, detaching virtual keyboard coordinators, or breaking transient user activation on subsequent clicks.
  - In `promptDeleteNote()`, explicitly cleans up `this._editingEntryId = null` if the deleted note was in inline edit mode, and syncs `updateComposerVisibility()`.
  - Re-mounts the capture composer (`renderComposer()`) immediately after note deletion to ensure the input box is freshly bound and unblocked.
  - Added `tabindex="0"`, `role="button"`, and Enter/Space keyboard handlers to `pos-composer-compact` for effortless input activation.
- **Production Build & Vault Deployment**:
  - Strict TypeScript check (`tsc --noEmit --skipLibCheck`) and ESBuild production build passed cleanly with 0 errors.
  - Deployed fresh `main.js` and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` vault plugin directories.

## Previous State: Full Production-Grade Hardening (Phases A-E Complete)
- **Phase A — Search & Query Performance Optimization**:
  - Implemented `_cachedPermanentNotes` and `invalidatePermanentNotesCache()` in `src/services/IndexService.ts`, avoiding redundant $O(N \log N)$ disk scans and sorting on repetitive keystrokes.
  - Connected cache invalidation to `RefreshCoordinator.ts` on vault file modification events.
  - Added 150ms debounced search listeners and timer cleanup in `DesktopHubView.ts` (Agenda Recent Notes rail) and `RecentPermanentNotesModal.ts`.
- **Phase B — Active Concurrency Lock Tracking in DesktopHubView**:
  - Bound `_taskPending` counters (`this._taskPending++` / `finally this._taskPending--`) around `CaptureService.toggleTaskInFile()` in `src/views/DesktopHubView.ts`.
  - Bound `_capturePending` counters around both Desktop Hero Composer and Mobile Sticky Composer save routines (`createCaptureNote()`), guarding against concurrent race conditions during background sync.
- **Phase C — Dynamic Target Note Filename Sanitization**:
  - Exported and hardened `sanitizeVaultFilename()` in `src/utils/vaultFiles.ts`: cleanly separates valid file extensions (`.md`, `.canvas`), trims illegal filesystem characters, and strips dangling dots.
  - Sanitized target file creation paths in `CaptureService.executeBatchDigest()` and `WikilinkPeekModal.ts` create button.
- **Phase D — Zero-Dependency Automated Regression Test Suite**:
  - Implemented native `node:test` test harness via `scripts/run-tests.mjs` bundled on-the-fly with `esbuild` and Obsidian API mocks (`tests/mocks/obsidian.js`). Runs 13 tests in ~70ms with 0 external network dependencies.
  - Added 5 comprehensive test suites:
    - `tests/vaultFiles.test.ts` (filename sanitization, traversal defense, YAML generation)
    - `tests/dateParsing.test.ts` (ISO formats, localized formats, natural date extraction)
    - `tests/taskDeduplication.test.ts` (task signature normalization, hashtag stripping, context normalization)
    - `tests/frontmatterFallback.test.ts` (YAML parsing, wikilink array disambiguation, missing block fallback)
    - `tests/digestionBlocks.test.ts` (task/subtask AST parsing, non-destructive comment wrapping)
  - Discovered and resolved real edge-case bug in `IndexService.normalizeContext()` where leading spaces in comma-delimited strings (`#work, #health`) prevented hashtag stripping.
- **Phase E — ESLint Configuration & Distribution Build**:
  - Created standard TypeScript `.eslintrc.json` using `@typescript-eslint/parser` and `@typescript-eslint/eslint-plugin`.
  - Added resilient lint runner `scripts/lint.mjs` running `eslint` when installed or fallback `tsc --noEmit --skipLibCheck` in offline sandbox environments.
  - Wired `"test": "node scripts/run-tests.mjs"` and `"lint": "node scripts/lint.mjs"` into `package.json`.
  - Verified `npm test` (13/13 passed in 70ms), `npm run lint` (0 errors), and `npm run build` (clean 478KB production bundle).
  - Deployed fresh `main.js`, `manifest.json`, and `styles.css` to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

## Previous Phase: Production Hardening (Phase 1 & Phase 2 Complete)

## Previous Phase: Recent Notes Tab in Agenda Side Rail Deployed
- **Option 1 Dedicated "📚 Notes" Tab in Agenda Panel (`DesktopHubView.ts` & `styles.css`)**:
  - **3-Tab Segmented Header Control**: Expanded `.pos-rail-tabs` to `[ ☀️ Horizon ]  [ 📋 Tasks ]  [ 📚 Notes ]` with streamlined padding and `white-space: nowrap` for compact desktop and tablet viewing.
  - **Live Filterable Recent Notes Stream**:
    - Embedded search input `.pos-rail-notes-search-input` (`Filter recent notes...`) preserving input text and user focus during background re-indexes.
    - High-density list displaying the latest 40 updated permanent notes across the vault (excluding inbox captures and trash).
    - Row anatomy: note title (bold, truncated, hover accent), folder capsule (`📁 Folder/Path`), tags (`#tag`), and relative timestamp (`12m`, `2h`, `Yesterday`).
    - Standard navigation: clicking opens the permanent note in the active editor leaf, while `Cmd/Ctrl + Click` opens in a new tab and `Alt + Click` opens in a separate window.
  - **Automatic Live Synchronization (`RefreshCoordinator.ts` & `main.ts`)**:
    - Vault modify and metadata cache events on permanent notes now notify refresh, keeping the Agenda Recent Notes feed synchronized in real time.
  - **Persistent Rail Tab State**: Saved in `diwa-cockpit-state-v2` (`localStorage`), preserving tab selection across sessions.

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
