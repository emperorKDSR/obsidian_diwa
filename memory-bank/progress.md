# Progress: DIWA — Personal OS

## Current Phase: Mobile Horizon Task Scheduling & Subtasks/Notes Sheet Deployed (Complete)

---

### 0. Mobile Horizon Task Scheduling & Subtasks/Notes Sheet Deployed (Complete)
*   [x] **Mobile Horizon Task Scheduling Modal (`MobileTaskEditModal.ts` & `styles.css`)** — Created an ergonomic slide-up bottom sheet modal (`.pos-mobile-task-edit-modal`, `.pos-mobile-bottom-sheet`) with drag handle, touch drag-to-dismiss gesture, and `✕` close button following DIWA's calm tactile design language.
*   [x] **Due Date Scheduling** — Integrated quick tactile shortcut chips (**Today**, **Tomorrow**, **In 3 Days**, **Next Week**, **Clear Date**) with active highlights, plus styled native date input (`<input type="date">`).
*   [x] **Subtasks & Notes Management** — Added full subtask and remark/note support inside the modal with live completion checkboxes, dynamic count badges, delete buttons, and quick-add input rows (supporting Enter key).
*   [x] **Two-Way Reactive Synchronization** — Each change immediately writes to the underlying file via `CaptureService.updateTaskDetailsInFile()`, re-indexes the file, and triggers `RefreshCoordinator` to update both the Horizon sheet and the stream.
*   [x] **Mobile Horizon Integration (`DesktopHubView.ts`)** — Replaced desktop context menus in mobile Horizon: tapping due date pills, subtask counts, note pills, or task titles opens `MobileTaskEditModal`.
*   [x] **Modernize Legacy `DatePickerModal.ts`** — Removed legacy purple/neon accent styles (`var(--interactive-accent)`), aligning it with DIWA's calm monochrome surfaces.
*   [x] **Automated Tests, Production Build & Vault Deployment** — Verified all 17 unit tests passing, compiled production bundle with zero errors, and deployed `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

---

## Previous Phase: Mobile Workspace & Tactile Floating Action Bar Harmonization Deployed (Complete)

---

### 0. Mobile Workspace & Tactile Floating Action Bar Harmonization Deployed (Complete)
*   [x] **Tactile Floating Action Bar Harmonization (`styles.css` & `DesktopHubView.ts`)** — Replaced bright neon-green accent background and colored glow on the mobile capture button (`.pos-mobile-action-new.is-primary`) with DIWA's calm, tactile Command Island style (`background: var(--background-primary)`, subtle border `1px solid var(--background-modifier-border)`, and crisp vector Lucide `edit-3` pencil icon). Muted active states (`.is-active`) to `background: var(--background-modifier-hover)` and `color: var(--text-normal)`.
*   [x] **Comprehensive Mobile `[ ⋯ ]` More Menu (`DesktopHubView.ts`)** — Structured the mobile action bar into a 5-button dock (`[ ✏️ Capture ]`, `[ 🔍 Search ]`, `[ 🎛️ Filter ]`, `[ 📖 Recent Notes ]`, and `[ ⋯ More ]`). Tapping `[ ⋯ ]` opens a native mobile action sheet providing full mobile feature parity for Daily Digest & Review, Gawa Task Cockpit, Karon Today & Horizon, Select/Merge Notes, Obsidian Navbar toggle, and DIWA Settings.
*   [x] **Expanded Mobile Composer Muted Alignment (`styles.css` & `DesktopHubView.ts`)** — Overrode `.mod-cta` neon green on `.pos-composer-send-btn-circle` with a tactile circular button (`background: var(--background-secondary)`, subtle border `var(--background-modifier-border)`, `color: var(--text-normal)`), and replaced unicode `'↑'` text with vector Lucide `arrow-up` SVG.
*   [x] **Gawa Cockpit Mobile Action Bar Alignment (`styles.css`)** — Aligned `.pos-gawa-mobile-action-bar` to inherit the unified tactile standard, removing bright fills on `.is-primary` and `.is-active`.
*   [x] **Automated Tests, Production Build & Vault Deployment** — Verified all 17 unit tests passing, compiled production bundle with zero errors, and deployed `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

---

## Previous Phase: Full-Width Fluid Stream in Cockpit Layout Deployed (Complete)

---

### 0. Full-Width Fluid Stream in Cockpit Layout Deployed (Complete)
*   [x] **Full-Width Stream Elements (`styles.css`)** — Changed `max-width` from `var(--diwa-stream-max-width, 820px)` to `100%` on `.pos-composer-compact`, `.pos-desktop-composer`, `.pos-note-stream-item`, `.pos-empty-state`, `.pos-filter-carousel`, and `.pos-selection-bar` under `.pos-cockpit-main-stage`. Eliminates the empty gap/whitespace between stream content and the Agenda rail on wide viewports.
*   [x] **Inline Editor Full Width (`DesktopHubView.ts`)** — Updated inline editing mode on note items to use `item.style.maxWidth = '100%'`.
*   [x] **Automated Tests, Production Build & Vault Deployment** — Verified all 17 unit tests passing, compiled production bundle with zero errors, and deployed `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

---

## Previous Phase: Informational `bill/pending` Notes in Agenda Horizon Deployed (Complete)

---

### 0. Informational `bill/pending` Notes in Agenda Horizon Deployed (Complete)
*   [x] **Tag & `due_date` Property Extraction (`IndexService.ts`)** — Implemented `extractPendingBillFromMetadata()` and `getPendingBills()` to scan vault markdown files tagged `bill/pending` (or `#bill/pending`), resolving the due date directly from the frontmatter `due_date` property (handling ISO dates, quoted dates, and `[[YYYY-MM-DD]]` wikilinks), and extracting optional `amount`.
*   [x] **Duplicate Note Snippet Suppression (`IndexService.ts`)** — Excluded notes with tag `bill/pending` from generic note block snippets in `getVaultNoteBlocksForDate()` to ensure bills are never rendered twice.
*   [x] **Overdue Section Integration (`DesktopHubView.ts`)** — Surface overdue pending bills (`due_date < today`) alongside overdue tasks in `.pos-rail-overdue-box`, dynamically adjusting the title badge for tasks, bills, or combined items.
*   [x] **5-Day Rolling Horizon Integration (`DesktopHubView.ts`)** — Surface pending bills in daily sections (Today, Tomorrow, and Next 3 Days) according to their `due_date`, contributing to each day's count badge.
*   [x] **Informational Bill Card Component (`DesktopHubView.ts` & `styles.css`)** — Implemented `renderRailBillRow()` and `.pos-rail-bill-item` (`receipt` icon, note title, `Due: YYYY-MM-DD` pill, `bill/pending` tag badge, and optional bold `amount` badge) styled non-interactively in DIWA's muted palette.
*   [x] **Automated Tests, Production Build & Vault Deployment** — Added tests in `tests/frontmatterFallback.test.ts` (17/17 passing), compiled production bundle, and deployed to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

---

## Previous Phase: Line-Level Live Editor in `WikilinkPeekModal` & Universal Default Link Routing Deployed (Complete)

---

### 0. Line-Level Live Editor in `WikilinkPeekModal` & Universal Default Link Routing Deployed (Complete)
*   [x] **Line-Level Live Editor Canvas (`WikilinkPeekModal.ts` & `styles.css`)** — Removed the bottom Quick Append box and turned `.pos-peek-body` into a line-by-line interactive document canvas. Clicking any line turns **only that single line** into an inline live editor (`textarea.pos-peek-line-editor` with `[[`, `#`, `@date`, `/person`, `++` triggers) while all other lines stay rendered. Clicking below the last line or opening an empty note immediately focuses a trailing editable line.
*   [x] **Outliner Keyboard Ergonomics (`WikilinkPeekModal.ts`)** — `Enter` splits/creates the next line and continues `- ` / `- [ ] ` prefixes; `Backspace` at column `0` strips list prefixes or merges with the previous line; `ArrowUp` / `ArrowDown` moves the active editor across lines; `Escape` / `Cmd+Enter` / blur commits to disk and re-renders.
*   [x] **Architectural Header & In-Place Back Navigation (`WikilinkPeekModal.ts` & `styles.css`)** — Hid duplicate `.modal-close-button`, added `2px` architectural divider, quiet editorial metadata subtitle (`Folder · #tag · Updated 12m ago`), in-modal `_history` stack with `[ ← ]` back button, and labeled action pills (`Stream`, `New Window`).
*   [x] **Stream Image Click-to-Zoom Lightbox (`DesktopHubView.ts` & `styles.css`)** — Added `openImageLightbox()` and image click delegation in `attachInteractiveElements()` so clicking any image in the stream opens a full-screen lightbox with `100%`–`400%` zoom, drag-to-pan, floating `+` / `−` / `100%` / `✕` controls, and `Esc`/backdrop dismissal.
*   [x] **Relaxed Two-Line Cards in Agenda "Notes" Tab (`DesktopHubView.ts` & `styles.css`)** — Redesigned `renderRailNoteItem()` and `.pos-rail-permanent-note-row` with comfortable `10px 12px` card padding, `8px` inter-card spacing, a 2-line wrapping title with `file-text` icon on line 1, and folder/tag pills + right-aligned relative timestamp on line 2.
*   [x] **Universal Default Link Routing (`DesktopHubView.ts`, `CalendarDigestView.ts`, `PreFlightDigestModal.ts`)** — Unified all `a.internal-link` clicks across the stream, Agenda Horizon, Digest views, and nested preview links to open `WikilinkPeekModal` by default.
*   [x] **Unit Tests, Production Build & Vault Deployment** — Passed `npm test` (15/15 passing), `npm run lint`, and `npm run build` (0 errors); deployed to `K0000` & `K0001` test vaults.

---

### 0. Agenda Header Pill Moved to `[ ⋯ ]` Menu, Tasks Tab Removed, Collapsible Undated Section & Editorial Notes Tab Deployed (Complete)
*   [x] **Agenda Toggle Relocated to `[ ⋯ ]` Menu (`DesktopHubView.ts`)** — Removed the standalone `[ ◨ Agenda ]` pill from the top header bar, streamlining the header to `[ 🔍 Search / ]  [ 🎛️ All Notes ▾ ]  [ ⋯ ]`. Added `Hide Agenda Panel (\)` / `Show Agenda Panel (\)` (`panel-right` icon, checked state) at the top of the `[ ⋯ ]` menu.
*   [x] **Temporal Grouping & Clean Editorial Rows in "Notes" Tab (`DesktopHubView.ts` & `styles.css`)** — Grouped recent permanent notes (`record.mtime`) into 4 temporal sections (`TODAY`, `YESTERDAY`, `THIS WEEK`, `EARLIER`) with count badges. Redesigned `.pos-rail-permanent-note-row` with a bold title + right-aligned timestamp top row and a quiet inline subtitle (`Folder · #tag`), removing noisy folder icons and pill borders.
*   [x] **Streamlined 2-Tab Agenda Switcher (`DesktopHubView.ts`)** — Removed the redundant `[ ☑️ Tasks ]` tab pill from `renderRightRail()`, leaving a focused 2-tab switcher (`[ ☀️ Horizon ]  [ 📖 Notes ]`). Legacy `railTab: 'tasks'` values in `localStorage` cleanly fall back to `'karon'`. Removed unused `renderTasksRail()` and `_tasksRailFilter`.
*   [x] **Collapsible `Undated` Section in Horizon (`DesktopHubView.ts` & `styles.css`)** — Added a collapsible `Undated` section at the bottom of `renderHorizonRail()` for open tasks without a due date (excluding Handumanan). Defaults to collapsed (`_horizonUndatedExpanded: false`, persisted in `diwa-cockpit-state-v2`) with chevron indicator (`chevron-right` / `chevron-down`) and count badge. Expanding renders interactive task rows with checkboxes, `[ 📅 Set Due ▾ ]` picker, subtasks, and notes.
*   [x] **Hover-Reveal Selector Fix (`styles.css`)** — Added `.pos-rail-task-item:hover` to subtask and note hover-reveal rules in `styles.css`.
*   [x] **Unit Tests, Production Build & Vault Deployment** — Passed `npm test` (15/15 passing) and `npm run build` (0 errors); deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

---

### 0. Pre-Flight Modal Harmonized with DIWA Muted Theme & Palette (Complete)
*   [x] **Overrode Theme Accent on CTA Button (`styles.css`)** — Replaced `.mod-cta` neon-green button styling with DIWA's calm muted button style (`background: var(--background-modifier-hover)`, subtle border `var(--background-modifier-border)`, `color: var(--text-normal)`), eliminating harsh neon accent blocks on Execute Digest.
*   [x] **Muted Editorial Links & Tags in Snippets (`styles.css`)** — Styled rendered Markdown snippet wikilinks and dates with standard text color and subtle hairline underlines (`.pos-stream-wikilink` style) instead of neon green. Converted tags into muted badges (`var(--background-modifier-hover)`) and desaturated task checkboxes with grayscale filter.
*   [x] **Clean Modal Header Title (`DesktopHubView.ts` & `PreFlightDigestModal.ts`)** — Stripped raw checklist syntax (`- [ ]`, `- [x]`), wikilink wrappers (`[[`, `]]`), and hashtags from the modal title (e.g. `Digest Note: Project Steer status...`).
*   [x] **Soft Neutral Pills (`styles.css`)** — Refined `.pos-pill-btn`, `.pos-pill-btn.is-active`, and `.pos-pill-btn.is-alt` dashed pills with subtle neutral borders and soft hover effects.
*   [x] **Unit Tests & Production Deployment** — Passed `npm test` (15/15 passing) and `npm run build` (0 errors); deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

---

### 0. Option B Smart Date Isolation & Bugfix for Digested Tasks in Horizon (Complete)
*   [x] **Digest Metadata Stripping (`IndexService.ts`)** — Implemented `stripDigestMetadata(text: string): string` to remove auto-generated digest headers (`#### [[YYYY-MM-DD]] HH:mm`), anchors (`^dw-...`), and comment wrappers while leaving actual note body text intact.
*   [x] **Smart Date Evaluation in Horizon (`IndexService.ts`)** — In `getVaultNoteBlocksForDate`:
    - Auto-generated digest timestamp headings (e.g. `#### [[today]] HH:mm`) are stripped prior to date matching, preventing digested target notes from cluttering today's Horizon simply because they were digested today.
    - If the intentional note body explicitly contains a future date (e.g. `Client kickoff [[tomorrow]]`), it matches that future date and **will display** under that date's Horizon section.
    - Checklist items (whether open `- [ ]` or completed `- [x]`) are filtered on `cleanText` *after* stripping digest headers, guaranteeing completed tasks are never misclassified as note blocks.
    - Rendered snippets display the clean note content with technical digest headings and anchors removed.
*   [x] **Unit Tests & Production Deployment** — Added tests in `tests/digestionBlocks.test.ts` for `stripDigestMetadata` on digested tasks. Passed `npm test` (15/15 passing) and `npm run build` (0 errors); deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

---

### 0. Option B Smart Date Isolation for Horizon (Complete)
*   [x] **Digest Metadata Stripping (`IndexService.ts`)** — Implemented `stripDigestMetadata(text: string): string` to remove auto-generated digest headers (`#### [[YYYY-MM-DD]] HH:mm`), anchors (`^dw-...`), and comment wrappers while leaving actual note body text intact.
*   [x] **Smart Date Evaluation in Horizon (`IndexService.ts`)** — In `getVaultNoteBlocksForDate`:
    - Auto-generated digest timestamp headings (e.g. `#### [[today]] HH:mm`) are stripped prior to date matching, preventing digested target notes from cluttering today's Horizon simply because they were digested today.
    - If the intentional note body explicitly contains a future date (e.g. `Client kickoff [[tomorrow]]`), it matches that future date and **will display** under that date's Horizon section.
    - Rendered snippets display the clean note content with technical digest headings and anchors removed.
*   [x] **Unit Tests & Production Deployment** — Added tests in `tests/digestionBlocks.test.ts` for `stripDigestMetadata`. Passed `npm test` (14/14 passing) and `npm run build` (0 errors); deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

---

### 0. Digest Items & Dates Excluded from Horizon (Complete)
*   [x] **Digest Detection Helper (`IndexService.ts`)** — Created `isDigestBlock(text: string): boolean` to fingerprint DIWA digest anchors (`^dw-[a-z0-9]+-b\d+`), timestamp headers (`#### [[YYYY-MM-DD]] HH:mm`), and wrapper comments (`diwa-digested:`).
*   [x] **Horizon Note & Date Filter (`IndexService.ts`)** — In `getVaultNoteBlocksForDate`:
    - Skips digested stream notes (`entry.digested: true`, `entry.tags.includes('digested')`, or `diwa-digested:`).
    - In vault markdown files, filters out paragraphs matching `isDigestBlock(pt)`.
    - Removed fallback to unrelated paragraphs when all date matches were from digest, ensuring notes containing only digested logs do not pull their host files or dates into the Horizon.
*   [x] **Unit Tests & Production Deployment** — Added tests in `tests/digestionBlocks.test.ts` for `isDigestBlock`. Passed `npm test` (14/14 passing) and `npm run build` (0 errors); deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

---

### 0. 1 Note = 1 Digestible Block for Pre-Flight Digest (Complete)
*   [x] **1 Note = 1 Block Identification (`CaptureService.ts`)** — Replaced multi-fragment line-by-line block splitting in `parseDigestibleBlocks` with unified **1 note = 1 digestible block** logic (`[singleBlock]`). Entire note text remains intact and cohesive upon review and routing.
*   [x] **Smart Classification & Route Defaults (`CaptureService.ts`)** — Classifies notes starting with `- [ ]` as tasks (`target_tasks` or `Gawa Inbox`), and regular notes/meeting logs as notes (`target_log` or `Keep in Note`), preserving inline `#area` tags and explicit `-> [[Target]]` wikilinks.
*   [x] **Modal Copy & Snippet Scrolling (`PreFlightDigestModal.ts` & `styles.css`)** — Updated pill labels to `'Note'` (instead of `'Thought'`), modal subtitle to `"Review destinations and routing for X note(s)"`, action button to `"Execute Digest (X note(s))"`, and added snippet scroll containment (`max-height: 240px; overflow-y: auto`).
*   [x] **Unit Tests & Production Deployment** — Updated `tests/digestionBlocks.test.ts` to assert 1 note = 1 block behavior. Passed `npm test` (13/13 passing) and `npm run build` (0 errors); deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

---

### 0. Single-Note Digest in Stream & Muted Pre-Flight Modal (Complete)
*   [x] **Single-Note Digest Action in `...` Menu (`DesktopHubView.ts`)** — Added a `"Digest Note..."` action (icon `sparkles`) to the stream card `...` dropdown menu. Directly extracts digestible blocks from the selected note using `parseDigestibleBlocks` and opens `PreFlightDigestModal` strictly isolated to that single note.
*   [x] **Post-Digest Refresh & Re-indexing (`DesktopHubView.ts`)** — On digest execution (`executeBatchDigest`), automatically re-indexes the source note (`indexCaptureFile`), invalidates the markdown render cache, updates the stream view, and triggers the refresh coordinator.
*   [x] **Muted Aesthetic Pre-Flight Modal (`PreFlightDigestModal.ts` & `styles.css`)** — Replaced bright emoji buttons with clean Obsidian Lucide icons (`arrow-right`, `search`, `check-square`, `file-text`). Cleaned pill labels (`Open Task`, `Done Task`, `Thought`). Set soft borders (`var(--background-modifier-border-faint)`), neutral backgrounds, and muted text matching the DIWA theme.
*   [x] **Mobile & Tablet Touch Ergonomics (`styles.css`)** — Modal adopts responsive full-width (`95vw`) sizing on mobile/tablet viewports ($\le 768px$), larger touch targets for pill buttons ($\ge 36px$), vertically stacked confirmation buttons, and safe-area inset padding. Desktop preserves keyboard ergonomics (`Enter` to confirm, `Esc` to cancel).
*   [x] **Automated Tests & Production Deployment** — Passed `npm test` (13/13 passing) and `npm run build` (0 errors); deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

---

### 0. Mobile Micro-Card Stream Layout (Option 1 Complete for Mobile Only)
*   [x] **Full-Width Mobile Micro-Cards (`DesktopHubView.ts` & `styles.css`)** — Swapped out the desktop 3-column outliner row layout on mobile phones (`Platform.isMobile && !isTablet(this.app)`) for an edge-to-edge iOS-style card layout (`.is-mobile-card`). Eliminated the 68px left gutter and 96px right hover padding, expanding readable text width from ~180px to ~350px (+95%) and eliminating awkward word wrapping.
*   [x] **Dedicated Mobile Card Header & Static Actions (`DesktopHubView.ts` & `styles.css`)** — Built `.pos-mobile-card-header` pairing the note timestamp (`3:42 PM`) on the left with a static action capsule (`pos-mobile-card-actions`, Star & More) on the right. Note body and task checkboxes span 100% full width directly below the header row.
*   [x] **Removal of Task Color Accents (`styles.css`)** — Removed `.has-tasks` colored vertical accent borders (`border-left`) across both desktop and mobile stream cards to maintain the clean, distraction-free neutral theme and palette of the plugin.
*   [x] **Automated Tests & Production Deployment** — Passed `npm test` (13/13 passing) and `npm run build` (0 errors); deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults. Desktop and tablet remain 100% untouched.

---

### 0. Agenda Rail Hover-Reveal Subtasks & Notes with Multi-Way Dismissal (Complete)
*   [x] **Compact Resting Cards with Hover-Reveal Subtasks & Notes (`DesktopHubView.ts` & `styles.css`)** — Subtasks and comments/notes containers are hidden by default (`display: none`), eliminating visual crowding so task cards occupy compact, elegant ~40px rows. Hovering a card smoothly reveals its subtasks and notes (`.pos-rail-task-row:hover .pos-rail-subtasks-wrap.is-hover-reveal`). Moving the cursor away cleanly restores the compact resting state. Action pills (`+ Subtask`, `+ Note`) on unpopulated cards are strictly hidden by default (`display: none !important`) and only display when the task card is hovered.
*   [x] **Multi-Way Box Dismissal & Collapse (`DesktopHubView.ts` & `styles.css`)** — Equipped subtask and note boxes with dedicated mini-headers (`SUBTASKS` / `NOTES`) featuring a **`✕ Hide`** button (`pos-rail-box-close-btn`) that collapses the box and suppresses hover-expansion. Clicking the meta row count badge (`☑` / `💬`) toggles between pinned-open and collapsed states. Quick-input rows feature an **`✕`** cancel button and handle the **`Escape`** key to dismiss the input box, with auto-dismiss on empty blur.
*   [x] **Automated Tests & Production Deployment** — Passed `npm test` (13/13 passing) and `npm run build` (0 errors); deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

---

### 0. Agenda Rail Interactive Due Date, Visible Subtasks & Comments (Complete)
*   [x] **Interactive Due Date Modification (`DesktopHubView.ts`)** — Due date badge on task cards in Horizon and Tasks rail tabs is an interactive button (`📅 Due: YYYY-MM-DD ▾` or `📅 Set Due ▾`). Clicking opens a dropdown menu with presets (Today, Tomorrow, In 3 Days, Next Week), custom `DatePickerModal`, and clear option. Updates are persisted directly via `updateTaskDetailsInFile` and indexed immediately.
*   [x] **Visible Subtasks & Inline Quick-Add (`DesktopHubView.ts` & `styles.css`)** — Subtasks are rendered directly under task cards with indented hairline border (`.pos-rail-subtasks-wrap`). Interactive checkboxes sync completed status (`- [x]`), apply strikethrough styling, and offer hover delete. Users can rapidly add subtasks via inline input (`+ Add subtask... [Enter]`). Meta row counter pill (`☑ {done}/{total}`) toggles subtask visibility.
*   [x] **Visible Comments/Remarks & Inline Quick-Add (`DesktopHubView.ts` & `styles.css`)** — Remarks are displayed under task cards with Markdown rendering and hover delete. Users can rapidly add comments via inline input (`+ Add comment... [Enter]`). Meta row counter pill (`💬 {count}`) toggles comment visibility.
*   [x] **Automated Tests & Production Deployment** — Passed `npm test` (13/13 passing) and `npm run build` (0 errors); deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

### 0. Full 5-Day Rolling Horizon (Clean Note Snippets & Handumanan Excluded) (Complete)
*   [x] **Remove Note Title in Horizon Rail (`DesktopHubView.ts` & `styles.css`)** — Streamlined `.pos-rail-note-item` to directly display the excerpted note snippet/block formatted as markdown without an explicit note title header, matching task row density and typography. Card retains source note tooltip and click-to-peek modal.
*   [x] **Exclude Everything from Handumanan (`DesktopHubView.ts` & `IndexService.ts`)** — Strictly excluded any files, notes, blocks, or tasks under the Handumanan path (`handumanan`) from both vault block scanning (`getVaultNoteBlocksForDate`) and task rendering (`renderHorizonRail`).
*   [x] **5-Day Rolling Horizon with Vault Note Scanning (`DesktopHubView.ts`, `IndexService.ts`, & `styles.css`)** — Upgraded the Horizon Agenda tab to cover Today, Tomorrow, and Next 3 Days ($D+2$, $D+3$, $D+4$). Strictly filters open tasks only (`!t.completed`). Added `getVaultNoteBlocksForDate` to scan both stream notes and vault-wide markdown files for target dates, extracting paragraphs/blocks mentioning the date (excluding completed tasks and task lines). Empty days are cleanly omitted.
*   [x] **Automated Tests & Production Deployment** — Passed `npm test` (13/13 passing) and `npm run build` (0 errors); deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

---

### 0. Horizon Rail Empty Section Suppression (Complete)
*   [x] **Suppress Empty Horizon Sections & Placeholders (`DesktopHubView.ts`)** — In `renderHorizonRail`, made Today's Tasks and Tomorrow sections strictly conditional so that empty sections and placeholders (`"Nothing due tomorrow."`, `"No tasks scheduled for today."`) are omitted entirely when there are no tasks for those days. Added clean all-clear note if all 3 sections are empty.
*   [x] **Automated Tests & Production Deployment** — Passed `npm test` (13/13 passing) and `npm run build` (0 errors); deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

---

### 0. Stream Life Area Badge Hidden (Complete)
*   [x] **Hide Life Area from Stream Note Cards (`DesktopHubView.ts` & `styles.css`)** — Removed `.pos-area-badge` DOM rendering from note cards in `renderNoteItem` and added defense-in-depth rule `.pos-stream-item .pos-area-badge { display: none !important; }` in `styles.css`. Life areas remain preserved in markdown files/frontmatter and are accessible via the note's `...` action menu (`Set Life Area...`) and inline editor, but no longer clutter the stream view.
*   [x] **Automated Tests & Production Deployment** — Passed `npm test` (13/13 passing) and `npm run build` (0 errors); deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

---

### 0. Agenda Task Cards Note Button Removal (Complete)
*   [x] **Remove Source Note Jump Button (`DesktopHubView.ts` & `styles.css`)** — Removed the `arrow-up-right` note link button (`pos-rail-source-btn`) from all task card rows across Rolling Horizon / Karon and Tasks tabs in the Agenda side rail. The task cards now have a cleaner, distraction-free aesthetic with full-width text and due date badge next to the task checkbox. Deprecated unused `.pos-rail-source-btn` CSS rules.
*   [x] **Automated Tests & Production Deployment** — Passed `npm test` (13/13 passing) and `npm run build` (0 errors); deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

---

### 0. Stream Dates as Normal Wikilinks, Task "Due: " Prefix & Relative Dates, and Completed Task Strike-Through (Complete)
*   [x] **Stream Task Due Date Relative Substitution (`DesktopHubView.ts`)** — When an internal date link (`YYYY-MM-DD`) is inside a task item (`li.task-list-item, li:has(input[type="checkbox"])`), prepends `"Due: "` and dynamically substitutes relative labels: `"Due: Today"`, `"Due: Yesterday"`, `"Due: Tomorrow"`, or `"Due: YYYY-MM-DD"`. Includes double-prefix protection (if markdown already ends with `Due:`, prevents `Due: Due:`). Visual decoration only — vault markdown retains standard Obsidian wikilinks `[[YYYY-MM-DD]]` and date menu actions stay intact.
*   [x] **Stream Date Wikilink Styling (`DesktopHubView.ts` & `styles.css`)** — Stream date links (`.pos-rendered-date-link`) now render as standard editorial wikilinks (`color: var(--text-normal) !important; font-weight: 600 !important; underline solid var(--background-modifier-border) !important; text-underline-offset: 3.5px !important; text-decoration-thickness: 1px !important;`). Stripped out subtle pill backgrounds, padding, and muted colors.
*   [x] **Completed Task Full Strike-Through (`DesktopHubView.ts` & `styles.css`)** — When a task is completed, all child wikilinks, date links, and text elements are included in being striked through (`text-decoration: line-through !important; color: var(--text-muted) !important;`). Initial completed task state is hydrated immediately on render via `attachInteractiveElements()`, and consistent across Gawa task rows, subtasks, Karon rows, and Agenda side rail.
*   [x] **Automated Tests & Production Deployment** — Passed `npm test` (13/13 passing) and `npm run build` (0 errors); deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

---

### 0. Tablet Workspace Optimization (Complete)
*   [x] **Tablet Portrait Mode (Pure Stream & Full-Width Focus) (`DesktopHubView.ts`, `src/utils.ts`, & `styles.css`)** — Automatically detected via `isTabletPortrait()` using `@media (orientation: portrait)` and aspect ratio. Stream, notes, and capture capsule expand to fill **100% full width of the tablet** (`width: 100% !important; max-width: 100% !important;`). The right rail (`.pos-cockpit-side-rail`), center resizer (`.pos-cockpit-resizer`), drawer backdrop (`.pos-cockpit-drawer-backdrop`), and Agenda toggle header button (`.pos-rail-toggle-btn`) are completely hidden.
*   [x] **Tablet Landscape Mode (Desktop Dual-Pane Parity with Available & Collapsible Agenda) (`DesktopHubView.ts` & `styles.css`)** — Restores the desktop dual-pane cockpit layout with stream on the left, draggable resizer divider in center, fixed right sidebar anchored to right edge (`320px`), and active Agenda header toggle button. The Agenda panel is available by default and can be minimized / collapsed at any time via the rail collapse button or the header toggle button.
*   [x] **Dynamic Orientation Observation (`DesktopHubView.ts`)** — Managed by `ResizeObserver` on `this.contentEl` and `window.orientationchange` event listener, backed by CSS `@media (orientation: portrait)` and `@media (orientation: landscape)` rules.
*   [x] **Tablet Stream Action Buttons (Important, Edit, and ...) (`DesktopHubView.ts` & `styles.css`)** — Stream items on tablets only display the **Important (Star)**, **Edit**, and **More (...)** buttons. The bare Delete icon is removed from the stream item action bar on tablet devices to prevent accidental touches, with Delete Note securely housed inside the `...` menu. Desktop retains the hover trash button.
*   [x] **Automated Tests & Production Deployment** — Passed `npm test` (13/13 passing) and `npm run build` (0 errors); deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

---

### 0. Right Pane Fixed-Width Sidebar Anchored to Right Edge (Option 1 Complete)
*   [x] **Fixed-Width Sidebar Anchored to Right Edge (`styles.css` & `DesktopHubView.ts`)** — Positioned `.pos-cockpit-side-rail` as an in-flow sidebar locked at a fixed pixel width (`_cockpitRailWidth`, default `340px`, range `260px`–`600px`) anchored flush to the right edge with `margin-left: auto !important; align-self: stretch;`.
*   [x] **Dynamic Full-Width Main Stage** — Main stage takes all remaining space (`flex: 1 1 auto !important; min-width: 0 !important; width: auto !important;`), dynamically absorbing 100% of window resizing while the right rail stays fixed and pinned against the right margin.
*   [x] **Pixel Width Resizer & Smooth Collapse** — Resizer (`.pos-cockpit-resizer`) adjusts sidebar width in pixels from the left edge and persists to `localStorage`. When collapsed, the rail transitions to `width: 0 !important` and stream expands to 100%.
*   [x] **Automated Tests & Production Deployment** — Passed `npm test` (13/13 passing) and `npm run build` (0 errors); deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

---

### 0. Clean Solid Hairline Wikilinks (Complete)
*   [x] **Elimination of Dotted Spellcheck-Style Underlines (`styles.css`)** — Replaced all dotted underlines across note stream body (`.pos-note-body a.internal-link`), modal peek links (`.pos-stream-wikilink`), Gawa table titles, subtasks, and comments (`.pos-gawa-table ... a.internal-link`, `.pos-gawa-subtask-title a.internal-link`, `.pos-gawa-comment-content a.internal-link`), and Agenda rail task titles (`.pos-rail-task-title a.internal-link`). Swapped with an editorial, clean solid hairline (`text-decoration: underline solid var(--background-modifier-border, rgba(255, 255, 255, 0.2)); text-underline-offset: 3.5px; text-decoration-thickness: 1px; font-weight: 600;`).
*   [x] **Automated Tests & Production Deployment** — Passed `npm test` (13/13 passing) and `npm run build` (0 errors); deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

---

### 0. Gawa Task Cockpit Complete Monochrome & Color Muting (Complete)
*   [x] **Horizon Filter Chips Monochroming (`GawaCockpitView.ts` & `styles.css`)** — Replaced colored circle emojis (`🔴`, `🟡`, `🟢`, `⚪`) with Lucide vector icons (`alert-circle`, `calendar`, `calendar-clock`, `help-circle`, `check-square`) and added subtle muted red outline for active overdue horizon.
*   [x] **Table Badges & Icons Muted (`GawaCockpitView.ts` & `styles.css`)** — Replaced unicode characters and green fills on subtask pills with Lucide icons (`check`, `check-square`) and muted pills; replaced speech balloon emoji `💬` on remarks badge with Lucide `message-square`; muted life area emojis with `.pos-emoji-muted`; replaced `✨` with Lucide `check-circle`.
*   [x] **Inspector & Modals Muted (`styles.css`, `GawaFilterSheetModal.ts`, `GawaQuickTaskModal.ts`)** — Replaced accent backgrounds, progress fills, and glowing focus rings with muted dark mode standards; stripped colored emojis from filter sheets and quick task modals.
*   [x] **Automated Tests & Production Deployment** — Passed `npm test` (13/13 passing) and `npm run build` (0 errors); deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

---

### 0. Capture Bar Hotkey Guides Removal & Pencil Icon Circle Outline (Complete)
*   [x] **Pencil Icon Circle Outline (`styles.css`)** — Styled `.pos-compact-icon` as a 26px circular badge (`border-radius: 50%`, `border: 1px solid var(--background-modifier-border)`, `background: var(--background-primary)`) with hover illumination (`border-color: var(--interactive-accent)` and `color: var(--interactive-accent)`).
*   [x] **Hotkey Guides Removal (`DesktopHubView.ts`)** — Removed `pos-compact-actions` (`[ C ]` and `[ ⌘↵ ]`) from the idle capture bar, removed `pos-composer-hint` from the expanded composer, and simplified the primary save button text to `Capture`.
*   [x] **Automated Tests & Production Deployment** — Passed `npm test` (13/13 passing) and `npm run build` (0 errors); deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

---

### 0. Floating Command Capsule Quick Capture Bar (Complete)
*   [x] **Tactile Command Capsule Quick Capture Bar (`DesktopHubView.ts` & `styles.css`)** — Elevated `.pos-composer-compact` into a structured, tactile command capsule with `background: var(--background-secondary)`, perimeter architectural border (`1px solid var(--background-modifier-border)`), 8px border-radius, and ambient drop shadow (`0 2px 6px rgba(0, 0, 0, 0.14)`).
*   [x] **Capture Prompt Streamlining (`DesktopHubView.ts`)** — Simplified placeholder text to `"Capture your thought..."` with crisp readability (`font-weight: 500`, `opacity: 0.85`), enhanced 15px `edit-3` Lucide icon, and solid shortcut key badges.
*   [x] **Automated Tests & Production Deployment** — Passed `npm test` (13/13 passing) and `npm run build` (0 errors); deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

---

### 0. Digest and Gawa Views Monochrome & Architectural Unification (Complete)
*   [x] **Calendar Digest View Theme Alignment (`src/views/CalendarDigestView.ts` & `styles.css`)** — Replaced colorful emojis in tab buttons, horizons, and actions with Lucide vector icons (`calendar`, `file-text`, `rewind`, `rotate-ccw`, `sparkles`, `arrow-up-right`). Added mid-heavy 2px architectural border below header. Muted status badges, stage cards, and action buttons to align with the DIWA cockpit aesthetic.
*   [x] **Gawa Task Cockpit Theme Alignment (`styles.css`)** — Added mid-heavy 2px architectural border below `.pos-gawa-header`. Replaced high-saturation accent backgrounds on active filter chips and buttons with muted hover styles (`var(--background-modifier-hover)` with `var(--text-muted)` border). Muted checkboxes, wikilinks, and tags. Aligned overdue dates with the subtle muted red outline pattern (`rgba(239, 68, 68, 0.32)`).
*   [x] **Automated Tests & Production Deployment** — Passed `npm test` (13/13 passing) and `npm run build` (0 errors); deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

---

### 0. Agenda Rail Explicit "Due:" Prefix for Due Dates (Complete)
*   [x] **Explicit "Due:" Prefix in Agenda Tasks (`DesktopHubView.ts`)** — Updated `renderRailTaskRow()` to render due date badges as `[ 📅 Due: <date> ]`. Automatically applies across Horizon (Overdue, Today, Tomorrow) and Tasks (All, Overdue, Today, Upcoming) sections.
*   [x] **Automated Tests & Production Deployment** — Passed `npm test` (13/13 passing) and `npm run build` (0 errors); deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

---

### 0. Agenda Rail Subtle Overdue Accents & Muted Note Tags (Complete)
*   [x] **Horizon Overdue Box Accent (`styles.css`)** — Outlined `.pos-rail-overdue-box` with subtle muted red (`1px solid rgba(239, 68, 68, 0.32)`), softly tinted background (`rgba(239, 68, 68, 0.04)`), and aligned alert title and SVG icon to matching muted red (`rgba(239, 68, 68, 0.85)`).
*   [x] **Overdue Task Card Outlines (`DesktopHubView.ts` & `styles.css`)** — Added dynamic `.is-overdue` class on overdue task rows in `renderRailTaskRow()` across Horizon and Tasks tabs. Styled with subtle red boundary (`border-color: rgba(239, 68, 68, 0.32); background: rgba(239, 68, 68, 0.03)`) and refined hover state.
*   [x] **Muted Note Tags in Notes Tab (`styles.css`)** — Substituted default glowing green `var(--text-accent)` tags with understated muted pills (`color: var(--text-muted); background: var(--background-secondary-alt); border: 1px solid var(--background-modifier-border-faint)`).
*   [x] **Muted Vector Empty Icon (`DesktopHubView.ts` & `styles.css`)** — Replaced raw emoji `📝` with vector Lucide `file-text` SVG icon for cross-platform muted consistency.
*   [x] **Automated Tests & Production Deployment** — Passed `npm test` (13/13 passing) and `npm run build` (0 errors); deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

---

### 0. Rail Task Markdown Rendering & Clutter Cleanup (Complete)
*   [x] **Proper Markdown Rendering in Rail Tasks (`DesktopHubView.ts` & `styles.css`)** — Swapped text node rendering for Obsidian's native `MarkdownRenderer.render()` in `.pos-rail-task-title`, transforming raw `[[wikilinks]]` into clickable internal links. Added click handlers and inline markdown typography styles.
*   [x] **Elimination of "Referenced Notes" (`DesktopHubView.ts`)** — Removed the `Referenced Notes` section entirely from `renderHorizonRail()`.
*   [x] **Removal of Life Area from Rail View (`DesktopHubView.ts`)** — Stripped `task.areaLabel` and `task.areaIcon` pill badges from task items in `renderRailTaskRow()`.
*   [x] **Muted Vector SVG Icons in Rail Tasks (`DesktopHubView.ts` & `styles.css`)** — Replaced raw calendar emoji `📅` with vector Lucide `calendar` SVG. Replaced jump text `'↗'` with Lucide `arrow-up-right` SVG. Removed colored circles (`🔴`, `🟡`, `🟢`) from task rail filter chips.
*   [x] **Automated Tests & Production Deployment** — Passed `npm test` (13/13 passing) and `npm run build` (0 errors); deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

---

### 0. Capture Box Action Pills Unified to Identical Dimensions (Complete)
*   [x] **Strictly Identical Capture Pill Dimensions (`DesktopHubView.ts` & `styles.css`)** — Bound `.pos-composer-left .pos-composer-pill-btn` (`Task`, `Important`, `Area`) to identical dimensions: `width: 100px`, `height: 28px`, `border: 1px solid var(--background-modifier-border)`, `border-radius: 9999px`, and `background: var(--background-secondary)`. Fixed `renderComposerPillSelection()` to preserve monochrome Lucide `tag` SVG. Standardized `[ ✕ ]` to 28px circular button and `[ Capture ⌘↵ ]` to 28px height.
*   [x] **Muted Monochrome Iconography (`DesktopHubView.ts` & `styles.css`)** — Substituted bright colorful emojis (`🔍`, `🏷️`, `☑️`, `⭐`, `✏️`) with Obsidian's native Lucide vector SVG icons (`search`, `sliders-horizontal`, `check-square`, `star`, `edit-3`, `panel-right`). Styled all icons with `color: var(--text-muted); stroke: currentColor; stroke-width: 2px;`. Added `.pos-emoji-muted` with `filter: grayscale(0.85) opacity(0.8)` for custom life area icons.
*   [x] **Automated Tests & Production Deployment** — Passed `npm test` (13/13 passing) and `npm run build` (0 errors); deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

---

### 0. Mid-Heavy Architectural Divider Line Between Header & Stream (Complete)
*   [x] **Mid-Heavy Divider Styling (`styles.css`)** — Upgraded `.pos-cockpit-header-wrapper`, `body.is-tablet .pos-cockpit-header-wrapper`, and `.pos-header-bar` bottom border from a faint hairline (`1px solid var(--background-modifier-border-faint)`) to a mid-heavy architectural boundary (`2px solid var(--background-modifier-border)`). Creates a clean physical separation between the top cockpit controls and the stream below.
*   [x] **Automated Tests & Production Deployment** — Passed `npm test` (13/13 passing) and `npm run build` (0 errors); deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

---

### 0. Streamlined Minimalist Header & Unified Filter Architecture (Complete)
*   [x] **On-Demand Search Pill (`DesktopHubView.ts` & `styles.css`)** — Replaced permanent center search box with a minimalist `[ 🔍 Search / ]` trigger pill that expands on click or `/` hotkey into an inline search capsule with auto-focus, real-time debounced filtering, and `✕` / `Escape` dismiss.
*   [x] **Unified Filter Dropdown Pill (`DesktopHubView.ts`)** — Created a single dynamic view lens button (`[ 🏷️ All Notes ▾ ]`, `[ 💼 Work ▾ ]`, etc.) providing instant menu-based switching across All Notes, Important, Today, Upcoming, Untagged, and configured Life Areas with real-time count badges.
*   [x] **Dedicated Open Tasks Pill (`DesktopHubView.ts`)** — Added `[ ☑️ Tasks (N) ]` toggle button on the same level as Agenda to quickly filter the continuous stream to open tasks only.
*   [x] **Digest Consolidated into More Menu (`DesktopHubView.ts`)** — Relocated `📅 Daily Digest & Review` from the top-right header into the `⋯` menu with completion badge (`✓ Done`).
*   [x] **Elimination of Multi-Chip Carousel Below Header (`styles.css` & `DesktopHubView.ts`)** — Removed `pos-filter-bar` entirely (`display: none !important`), eliminating all vertical space between the header and capture box.
*   [x] **Automated Tests & Production Deployment** — Passed `npm test` (13/13 passing) and `npm run build` (0 errors); deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

---

### 0. Date Divider Color Synchronized with Timestamps (Complete)
*   [x] **Date Divider Color Harmonization (`styles.css` & `DesktopHubView.ts`)** — Set `.pos-date-heading` and `.pos-date-count` to `color: var(--text-faint) !important`, perfectly matching the `.pos-note-time` timestamp palette. Styled `.pos-date-line` divider with `background: var(--text-faint); opacity: 0.25;` for a cohesive, understated day boundary.
*   [x] **Automated Tests & Production Deployment** — Passed `npm test` (13/13 passing) and `npm run build` (0 errors); deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

---

### 0. Flush Stream Task Checkbox (Option 1) & Muted Completed Tick Box (Complete)
*   [x] **Flush Stream Task Alignment (Option 1, `styles.css`)** — Stripped all list padding and margins (`padding-inline-start: 0 !important; margin: 2px 0 4px 0 !important; margin-inline-start: 0 !important;`) from `ul.contains-task-list` and `.markdown-rendered ul.contains-task-list`. Positioned task checkboxes flush with the horizontal note text guideline (`left: 0`), followed by a tight 22px text indent.
*   [x] **Muted Completed Task Checkbox (`styles.css`)** — Replaced default vibrant accent color with `accent-color: var(--text-faint, rgba(255, 255, 255, 0.35))` and `filter: grayscale(1) opacity(0.5)`, rendering completed tick boxes in a soft, non-distracting monochrome.
*   [x] **Automated Tests & Production Deployment** — Passed `npm test` (13/13 passing) and `npm run build` (0 errors); deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

---

### 0. Stream Date Divider Typography, Clean Note Count & Idle Task Button Removal (Complete)
*   [x] **Stream Date Divider Typography (`styles.css`)** — Lowered `.pos-date-heading` font size to `0.58em` (~9.5px, down 2pt from earlier 0.68em), set `font-weight: 600`, and muted color to `var(--text-faint, var(--text-muted))`. Streamlined `.pos-date-count` to `font-size: 0.56em` (~9px), `padding: 0 4px`, and `min-width: 14px` for an understated, high-density hierarchy.
*   [x] **Numeric-Only Note Count Indicator (`DesktopHubView.ts`)** — Updated note count pill in `renderStream()` and `appendBatchToStream()` to render only the count number (`${count}`) and exclude "note"/"notes" (e.g. `TODAY [ 2 ] ───────`).
*   [x] **Idle Capture Box Task Button Removal (`DesktopHubView.ts`)** — Removed `taskChip` (`☑️ Task`) button from `pos-compact-actions`. The idle state presents a distraction-free placeholder bar with keyboard shortcut hints, expanding immediately upon clicking anywhere on the bar.
*   [x] **Automated Tests & Production Deployment** — Passed `npm test` (13/13 passing) and `npm run build` (0 errors); deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

---

### 0. Muted Wikilinks, Stream Date Badge Removal & Recent Notes Peek Modal (Complete)
*   [x] **Muted Wikilink Styling (`styles.css`)** — Configured `.pos-note-body a.internal-link`, `.pos-note-body .internal-link`, and `.pos-stream-wikilink` to regular text color (`var(--text-normal)`), bold weight (`600`), and dotted underline (`text-decoration: underline dotted var(--text-muted, currentColor)` with `text-underline-offset: 3px`), highlighting with accent on hover.
*   [x] **Stream Date Badge Pruning (`DesktopHubView.ts`)** — Removed `.pos-date-badge` loop in `renderStreamItem()`. Cleans visual clutter while preserving day dividers, note markdown dates, and `⋯` date action menu.
*   [x] **Recent Notes Peek Modal Integration (`WikilinkPeekModal.ts`, `DesktopHubView.ts`, `RecentPermanentNotesModal.ts`)** — Wired recent notes click to open `WikilinkPeekModal` for instant preview and action dispatching without leaving the scratchpad. Added `getAbstractFileByPath` fallback in `WikilinkPeekModal` for reliable path resolution.
*   [x] **Automated Tests & Production Deployment** — Passed `npm test` (13/13 passing) and `npm run build` (0 errors); deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

---

### 0. Agenda Rail Persistence & Stream Deletion Input Activation (Complete)
*   [x] **Multi-Tab Agenda Rail Persistence (`DesktopHubView.ts`)** — Added zero-dimension guard `if (width <= 0) return;` in `setupResizeObserver()`, preventing backgrounded/transitioning Obsidian tabs from collapsing the Agenda panel. Eliminated auto-collapse overrides on resize, ensuring the Agenda rail persists according to user intent.
*   [x] **Non-Blocking ConfirmDeleteModal (`src/modals/ConfirmDeleteModal.ts` & `styles.css`)** — Replaced native blocking `window.confirm()` calls with a dedicated Obsidian modal, preventing WebKit and Electron from dropping window focus and keyboard input activation.
*   [x] **Stream Deletion Input Activation Hardening (`DesktopHubView.ts`)** — Unified note deletion in `promptDeleteNote()`: clears any stale `_editingEntryId`, updates composer visibility, and re-mounts the capture composer. Added `tabindex="0"`, `role="button"`, and keyboard triggers (Enter/Space) to `pos-composer-compact`.
*   [x] **Zero Build Errors & Production Deployment** — Passed `npm run build` cleanly; deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

---

### 0. Full Production Hardening: Performance, Concurrency, Sanitization, Tests & Lint (Complete)
*   [x] **Phase A: Search & Query Performance Optimization (`IndexService.ts`, `DesktopHubView.ts`, `RecentPermanentNotesModal.ts`)** — Added in-memory caching for permanent notes (`_cachedPermanentNotes`), saving redundant $O(N \log N)$ disk scans and sorting on keystroke. Linked cache invalidation to `RefreshCoordinator.ts`. Added 150ms debounced input listeners and timer cleanup.
*   [x] **Phase B: Concurrency Lock Tracking (`DesktopHubView.ts`)** — Wrapped background disk updates (`toggleTaskInFile`) with `_taskPending++ / finally _taskPending--` and hero/sticky capture routines (`createCaptureNote`) with `_capturePending++ / finally _capturePending--`.
*   [x] **Phase C: Dynamic Target Note Filename Sanitization (`vaultFiles.ts`, `CaptureService.ts`, `WikilinkPeekModal.ts`)** — Exported and enhanced `sanitizeVaultFilename()` to handle true file extensions, trim illegal chars, and strip dangling dots. Applied to `CaptureService.executeBatchDigest` and `WikilinkPeekModal`.
*   [x] **Phase D: Automated Regression Test Suite (`scripts/run-tests.mjs`, `tests/`)** — Established zero-dependency automated test runner using Node's built-in `node:test` bundled with `esbuild` and Obsidian API mocks (`tests/mocks/obsidian.js`). 13 unit tests across 5 test files (`vaultFiles.test.ts`, `dateParsing.test.ts`, `taskDeduplication.test.ts`, `frontmatterFallback.test.ts`, `digestionBlocks.test.ts`) executing in ~70ms. Caught and fixed real bug in `IndexService.normalizeContext()` with space-separated hashtag lists.
*   [x] **Phase E: ESLint Configuration & CI Tooling (`.eslintrc.json`, `scripts/lint.mjs`, `package.json`)** — Configured `.eslintrc.json` using `@typescript-eslint/parser`, added resilient `scripts/lint.mjs` with `tsc` fallback in offline sandbox, and wired `"test"` and `"lint"` scripts in `package.json`.
*   [x] **Production Build & Vault Deployment** — Strict `npm test` (13/13 passing in 70ms), `npm run lint` (0 errors), and `npm run build` (clean 478KB `main.js`). Deployed `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

---

### 0.1. Production Hardening: Defect Remediation & Distribution Alignment (Complete)
*   [x] **Subtask Checkbox Alignment (`DesktopHubView.ts`)** — Resolved subtask checkbox mismatch by reading `listItem.textContent` and matching indexed tasks or passing subtask title fallback to `CaptureService.toggleTaskInFile()`. Tapping nested subtasks in the continuous feed now toggles safely without index error notices.
*   [x] **KaronView Async Markdown Link Interception (`KaronView.ts`)** — Replaced deprecated `MarkdownRenderer.renderMarkdown()` with modern `MarkdownRenderer.render()` and chained `attachInteractiveLinks()` directly to each snippet's render promise, eliminating the race condition on internal link previews.
*   [x] **Debounce Timer Cleanup (`GawaCockpitView.ts`)** — Added explicit `clearTimeout(this._searchDebounceTimer)` in `onClose()` to prevent unhandled background calls after view destruction.
*   [x] **Complete Leaf Refresh Scope (`RefreshCoordinator.ts`)** — Extended `hubLeaves` query to include `VIEW_TYPE_MOBILE_HUB` and `VIEW_TYPE_TABLET_HUB` alongside `VIEW_TYPE_DESKTOP_HUB`.
*   [x] **Manifest & Version Alignment (`manifest.json` & `versions.json`)** — Formatted plugin name to `"DIWA"` and updated `minAppVersion` to `"1.5.0"` (matching modern Obsidian `vault.process` and frontmatter APIs).
*   [x] **Release Workflow Title (`.github/workflows/release.yml`)** — Renamed release title from `MINA V2` to `DIWA ${{ github.ref_name }}`.
*   [x] **Scratch Migration Script Removal** — Deleted obsolete root scripts (`implement_redesign.js`, `implement_swipe.js`, `replace1.js`).
*   [x] **CSS Global Leak Scoping (`styles.css`)** — Scoped `.date-none, .area-none, .rem-none` under `.pos-gawa-table`.
*   [x] **Production Build & Vault Deployment** — `tsc --noEmit --skipLibCheck` and `npm run build` passed with 0 errors; deployed fresh `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

---

### 0. Recent Notes in Agenda Side Rail: Dedicated Tab & Real-Time Sync (Complete)
*   [x] **Dedicated "📚 Notes" Agenda Tab (`DesktopHubView.ts`)** — Added 3rd tab to the Agenda panel alongside `☀️ Horizon` and `📋 Tasks`, persisting tab state in `diwa-cockpit-state-v2` (`localStorage`).
*   [x] **Embedded Filter & Outliner List (`DesktopHubView.ts` & `styles.css`)** — Rendered a low-profile search input (`Filter recent notes...`) that preserves query and cursor focus across background refreshes, paired with a high-density outliner displaying the latest 40 updated permanent notes.
*   [x] **Rich Note Metadata & Ergonomic Navigation (`DesktopHubView.ts`)** — Displays note title, folder capsule, tag pills, and relative timestamps (`12m`, `2h`, `Yesterday`). Supported standard click (open in leaf), `Cmd/Ctrl + click` (open in new tab), and `Alt + click` (open in new window).
*   [x] **Background Reactivity & Real-Time Sync (`RefreshCoordinator.ts` & `main.ts`)** — Wired permanent note modifications to trigger background refresh, keeping the Agenda rail updated immediately when notes are edited.
*   [x] **Zero Build Errors & Production Deployment** — Passed strict `tsc --noEmit --skipLibCheck` and ESBuild production build with 0 errors; deployed fresh `main.js` and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

---

### 0. Dual-Axis iPadOS Keyboard Preservation: Zero Gap & Zero Drift (Complete)
*   [x] **Dual-Axis Keyboard Architecture (`styles.css`)** — Resolved the conflict between vertical keyboard accommodation and horizontal multi-pane layout:
    * **Vertical Axis (Black Void Elimination)**: Made `.diwa-workspace-root.has-mobile-keyboard` the sole vertical scroller (`overflow-y: auto !important; height: 100% !important;`), while setting `.pos-desktop-cockpit-layout`, `.pos-cockpit-body`, `.pos-cockpit-main-stage`, and `.pos-document-stream` to `height: auto !important; min-height: 100% !important; overflow: visible !important; flex: 0 0 auto !important;`. The stream grows to full content height with zero nested scroller height clipping, eliminating the black gap above the software keyboard.
    * **Horizontal Axis (100% Full Width Preservation)**: Locked exact horizontal percentage widths on `.pos-cockpit-main-stage` (`flex: 0 0 68% !important; width: 68% !important; max-width: 68% !important;`) and `.pos-cockpit-side-rail` (`flex: 0 0 32% !important; width: 32% !important; max-width: 32% !important;`), ensuring the panels never collapse inward or drift left.
    * **Portrait Mode Preservation**: In `.is-tablet-portrait`, main stage expands to `100%` and side rail is positioned as an absolute slide-over drawer (`width: 320px`).
*   [x] **Zero Build Errors & Production Deployment** — Passed strict `tsc --noEmit --skipLibCheck` and ESBuild production build with 0 errors; deployed fresh `main.js` and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

---

### 0. Raycast-Style Area Dropdown Capsule & Complete Landscape Drift Elimination (Complete)
*   [x] **Raycast/Linear Single Area Dropdown Capsule (`DesktopHubView.ts` & `styles.css`)** — Replaced multi-button pill loops across desktop, tablet, and mobile composers with a single interactive property button (`🏷️ Area ▾`). Tapping opens an Obsidian native `Menu` with checkmarks; selecting an area converts it to an active pill (`[ 💼 Work ✕ ]`) with 1-tap clear.
*   [x] **Landscape Keyboard Drift & Width Collapse Elimination (`DesktopHubView.ts`, `styles.css`, `mobileSheetViewport.ts`)** — Completely stopped layout from shifting left when activating capture:
    * Enforced 100% full-width on `.pos-desktop-cockpit-layout` and `.pos-cockpit-body`.
    * Bypassed `scrollIntoView()` entirely for elements already in the top viewport (top composer), preventing WebKit's horizontal centering algorithm on iPad landscape.
    * Recorded and restored `scrollLeft` across all ancestors before and after scroll-into-view calls.
    * Added capture-phase document scroll listener and multi-stage `focusin` guard locking horizontal offsets to 0.
    * Replaced all `overflow: hidden` with `overflow-x: clip !important` across workspace root, layout, cockpit body, and main stage.
*   [x] **Zero Build Errors & Production Deployment** — Passed strict `tsc --noEmit --skipLibCheck` and ESBuild production build with 0 errors; deployed fresh `main.js` and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

---

### 0. Condensed Orientation-Adaptive Tablet Cockpit (Complete)
*   [x] **Orientation-Adaptive Multi-Pane Logic (`DesktopHubView.ts`)** — Wired `ResizeObserver` to detect tablet portrait (< 900px) and landscape ($\ge$ 900px). In landscape, defaults to an ergonomic `68% / 32%` split. In portrait, stream automatically expands to `100% full width` for distraction-free reading/writing.
*   [x] **Slide-Over Agenda Drawer & Backdrop (`DesktopHubView.ts` & `styles.css`)** — When Agenda is toggled in portrait mode, it slides in smoothly from the right as a floating drawer (`position: absolute; right: 0; width: 320px; z-index: 50`) with an interactive backdrop overlay (`.pos-cockpit-drawer-backdrop`) for tap-to-dismiss.
*   [x] **Compact Tablet Header Bar (`styles.css`)** — Compressed vertical padding from 14px to 8px, streamlined search capsule (30px height, 0.82em font), and tightened button heights to 28px.
*   [x] **Compact Filter & Composer Density (`styles.css`)** — Reduced filter bar padding (6px 14px 2px 14px) with 25px pills; tightened composer wrapper padding (6px 14px 3px 14px) and set textarea initial min-height to 38px.
*   [x] **Stream Spacing Rhythm & Outliner Rows (`styles.css`)** — Reduced date divider top margin from 32px to 14px (6px for first), adjusted container padding (4px 14px), and tightened note row vertical padding to 3px 6px.
*   [x] **Compact Agenda Side Rail (`styles.css`)** — Condensed header, tab buttons, horizon cards, and task list gaps for glanceable information density on tablet screens.
*   [x] **Zero Build Errors & Production Deployment** — Passed strict `tsc --noEmit --skipLibCheck` and ESBuild production build with 0 errors; deployed fresh `main.js` and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

---

### 0. Tablet Mode Viewport Stability & Proven iOS Keyboard Architecture (Complete)
*   [x] **Full Mobile Viewport Observer (`DesktopHubView.ts`)** — Attached `attachMobileSheetViewportBehavior` across all mobile runtimes (`Platform.isMobile`, including iPads/tablets), tracking native keyboard events and `--keyboard-height`.
*   [x] **Immune Tablet Detection (`src/utils.ts`)** — Upgraded `isTablet()` to verify physical screen dimensions (`screen.width`/`screen.height`), making tablet detection immune to on-screen keyboard height contraction.
*   [x] **Proven iOS Keyboard-Open Flex Overrides (`styles.css`)** — Mirrored `docs/CONTINUOUS_SCRATCHPAD_DESIGN.md` (§7.1, §7.3): `.diwa-workspace-root` becomes the sole vertical scroller (`overflow-y: auto !important`), while `.pos-desktop-cockpit-layout`, `.pos-cockpit-body`, `.pos-cockpit-main-stage`, and `.pos-document-stream` use `flex: 0 0 auto !important; overflow: visible !important; min-height: auto !important;`, preventing WebKit zero-height flex collapse and eliminating black gaps above the keyboard.
*   [x] **Root & Window Viewport Scroll Protection (`DesktopHubView.ts` & `styles.css`)** — Added `{ preventScroll: true }` to all textarea focus calls and wired a passive window scroll guard resetting `window.scrollTo(0, 0)` on WebKit shifting.
*   [x] **Zero Build Errors & Production Deployment** — Passed strict `tsc --noEmit --skipLibCheck` and ESBuild production build with 0 errors; deployed fresh `main.js` and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

---

### 0. Single-Line Inline Outliner (`HH:MM PM <content>`) (Complete)
*   [x] **Fixed Left Timestamp Gutter (`.pos-note-gutter`)** — Created a dedicated 68px left gutter with tabular numeric timestamps (`font-variant-numeric: tabular-nums`, `color: var(--text-faint)`), ensuring every note begins on the exact same horizontal column guideline across the daily feed.
*   [x] **Single Horizontal Baseline Flow (`.pos-note-content-wrap`)** — Eliminated stacked 2-line headline/body rendering. Note text and metadata pills flow on a single horizontal baseline for single-line notes (`08:41 PM   Passport renewal   [Personal]`), eliminating awkward zig-zag reading motion.
*   [x] **Automatic Hanging Indent for Multi-Line Content** — When notes span multiple lines, paragraphs, or task lists, text wraps naturally within the content column, preserving the clean, uncluttered timestamp gutter.
*   [x] **Flush-Right Hover Capsule (`.pos-note-actions`)** — Anchored hover action icons (`[ ✏️ ] [ ⭐ ] [ ⋯ ] [ 🗑️ ]`) as an elevated top-right capsule on hover with zero layout shift, protected by 96px right padding on the content wrapper to prevent overlap.
*   [x] **Date Divider & Column Spine Alignment (`styles.css`)** — Synchronized `.pos-date-divider` with `padding: 0 8px;`, aligning the date heading with the stream item gutter and the 820px reading column.
*   [x] **Option 1 Crisp Day Separation Line (`DesktopHubView.ts` & `styles.css`)** — Injected high-visibility horizontal separator rule (`background: var(--background-modifier-border, rgba(255, 255, 255, 0.15))`) spanning after the note count badge across the stream column, with generous 32px inter-day separation spacing.
*   [x] **Option 1 Rapid Multi-Block Chaining (`DesktopHubView.ts`)** — Wired `Shift + Enter` to instantly capture notes, reset textarea height, and keep the text box active and focused for rapid multi-block input, with full cross-platform UI hints (`⌘↵` on Mac, `Ctrl↵` on Windows/Linux).
*   [x] **Agenda Panel Renaming & Activation by Default (`DesktopHubView.ts`)** — Renamed "Rail" to `◧ Agenda`, reset stale auto-collapse states via versioned localStorage, and kept the Agenda split pane open by default across desktop sessions.
*   [x] **Zero Build Errors & Production Vault Deployment** — Clean compile with `tsc --noEmit -skipLibCheck` and ESBuild; deployed directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

---

### 0. Recently Updated Permanent Notes Feature (Complete)
*   [x] **Data Types & Settings (`src/types.ts`, `src/constants.ts`, `src/settings.ts`)** — Added `PermanentNoteRecord` type, optional `permanentNotesFolders?: string[]` setting with textarea in Settings under Storage & Workspace.
*   [x] **Permanent Note Indexing Engine (`src/services/IndexService.ts`)** — Implemented `getConfiguredPermanentNotesFolders()`, `isPermanentNoteFile()`, and `getRecentlyUpdatedPermanentNotes(limit, query)` sorting by `stat.mtime` descending with real-time text query filtering.
*   [x] **Modal & Mobile Bottom Sheet (`src/modals/RecentPermanentNotesModal.ts`)** — Built responsive modal/sheet featuring search filter, note titles, folder badges (`📁`), tags, and relative timestamps (`moment.fromNow()`), with 1-tap navigation and mobile drag-to-dismiss gesture physics.
*   [x] **Desktop & Mobile UI Triggers (`src/views/DesktopHubView.ts`)** — Added `[ 📚 Recent ]` pill in desktop header actions and 5th circular button (`book-open` icon) in the mobile 1-line floating action bar.
*   [x] **Global Command Registration (`src/main.ts`)** — Registered command `DIWA: Show Recently Updated Permanent Notes`.
*   [x] **Zero Build & Lint Errors** — Passed strict `tsc --noEmit --skipLibCheck` and `npm run build` with 0 errors.
*   [x] **Production Vault Deployment** — Deployed `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000` & `K0001` vault plugin directories.

---

### 0.1. Uniform Neutral Styling for Gawa Header Pill (Complete)
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
