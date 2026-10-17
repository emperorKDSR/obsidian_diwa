# Active Context: DIWA — Personal OS

## Current State: Mobile Task Edit Modal Top-Anchored Focused Typing Mode Deployed
- **Mobile Task Edit Modal Top-Anchored Focused Typing Mode (`MobileTaskEditModal.ts` & `styles.css`)**:
  - Resolved mobile virtual keyboard obstruction when adding subtasks and notes on Obsidian Mobile (where `visualViewport.height` does not shrink in Capacitor WebView):
    - **Deterministic Immediate Activation**: Focusing `+ Add subtask...` or `+ Add note or remark...` immediately applies `.has-keyboard` and `.is-typing-subtask` / `.is-typing-remark` without waiting for `visualViewport` to shrink.
    - **Top-Anchored Command Island Positioning**: When `.has-keyboard` is active, the modal anchors to the top of the screen (`top: max(env(safe-area-inset-top, 0px) + 8px, 12px) !important; bottom: auto !important; max-height: min(46vh, ...) !important;`) so the entire modal sits in the upper ~45% of the screen, physically above the virtual keyboard on all iOS and Android devices.
    - **Focused Section Folding & Top Input Placement**:
      - Placed the `[ + Add subtask... ] [ Add ]` and `[ + Add note or remark... ] [ Add ]` input rows at the top of their respective sections.
      - While typing a subtask (`.is-typing-subtask`), the Due Date section, Notes section, and bottom Footer fold away; while typing a note (`.is-typing-remark`), the Due Date section, Subtasks section, and bottom Footer fold away.
      - Capped `.pos-task-edit-list` to `max-height: 115px; overflow-y: auto;` while typing and added a compact **`Done`** pill button in the header (plus `Enter` on an empty input) to exit typing mode and restore the full bottom sheet.
    - **Persistent Input DOM Nodes Across Saves**:
      - Refactored `renderSubtasksSection()` and `renderRemarksSection()` into `refreshSubtasksList()` and `refreshRemarksList()` so saving a subtask/note updates only the list and badge without destroying the focused `<input>` element.
      - Added `onpointerdown` `e.preventDefault()` on `[ Add ]` and delete buttons so tapping them never blurs the active input or closes the keyboard.
  - All 17 unit tests passing, production bundle compiled with 0 errors and deployed to `/Users/K26/Obsidian/K0000` and `K0001` test vaults.

## Previous State: Mobile Horizon Task Scheduling & Subtasks/Notes Sheet Deployed
- **Mobile Horizon Task Scheduling & Subtasks/Notes Modal (`MobileTaskEditModal.ts` & `styles.css`)**:
  - Implemented an ergonomic, slide-up bottom sheet modal (`.pos-mobile-task-edit-modal`, `.pos-mobile-bottom-sheet`) matching the tactile DIWA design system (drag handle, swipe-to-dismiss, calm monochrome surfaces, no neon accents).
  - **Task Preview & Quick Toggle**: Renders task title with markdown and wikilink previews, plus an interactive checkbox for 1-tap completion.
  - **Due Date Scheduling**:
    - Quick tactile shortcut chips: **Today**, **Tomorrow**, **In 3 Days**, **Next Week**, and **Clear Date**.
    - Styled native date input (`<input type="date">`) for exact date picking.
  - **Subtasks Management**:
    - Dynamic count badge (`X/Y completed`).
    - Interactive checkable list of subtasks with instant deletion (`✕`).
    - Tactile input row with `[ + Add subtask... ]` and `[ Add ]` button (or keyboard Enter).
  - **Notes & Remarks Management**:
    - Dynamic count badge (`N notes`).
    - List of remarks with `message-square` icon and deletion (`✕`).
    - Tactile input row with `[ + Add note or comment... ]` and `[ Add ]` button (or keyboard Enter).
  - **Real-Time Vault Sync**: Each operation immediately persists via `CaptureService.updateTaskDetailsInFile()`, re-indexes the file, and triggers `RefreshCoordinator` to update the Horizon modal and stream.
  - Replaced desktop context menus in mobile Horizon: tapping task due date, subtask count, note pill, or task title opens `MobileTaskEditModal`.
  - Modernized `DatePickerModal.ts` to replace legacy neon purple/accent buttons with DIWA's calm monochrome surfaces.
- **Horizon Overdue Indicator (`IndexService.ts`, `DesktopHubView.ts`, `MobileAgendaSheetModal.ts`, `styles.css`)**:
  - Implemented `getOverdueCount()` helper in `IndexService` aggregating open overdue tasks (excluding Handumanan) and overdue `bill/pending` notes.
  - **Muted Red Horizon Icon (`.has-overdue`)**:
    - When overdue tasks or bills exist, the `sun` icon on both the mobile floating action bar (`.pos-mobile-action-btn.pos-mobile-action-agenda.has-overdue`), desktop rail tab (`.pos-rail-tab-btn.has-overdue`), and mobile agenda sheet header (`.pos-agenda-sheet-title-icon.has-overdue`) dynamically illuminates to a soft muted red (`rgba(239, 68, 68, 0.85)`).
    - Features informative tooltips showing the breakdown (e.g. *Agenda & Horizon (2 tasks, 1 bill overdue)*).
    - Fully reactive: `updateHorizonOverdueState()` is bound to `refreshCapture()` and `refreshAll()`, clearing back to neutral `var(--text-muted)` the moment all overdue items are completed or rescheduled.
- **Clean Uniform 5-Icon Floating Action Bar (`styles.css` & `DesktopHubView.ts`)**:
  - Reconfigured the mobile floating dock with the 5 exact dedicated icons:
    1. **`[ ✏️ Capture ]`**: Opens the mobile composer (`pos-mobile-action-new`, icon `edit-3`).
    2. **`[ 🔍 Search ]`**: Expands the floating bottom search capsule (`pos-mobile-action-search`, icon `search`).
    3. **`[ 📖 Recent Notes ]`**: Opens `RecentPermanentNotesModal` (`pos-mobile-action-recent`, icon `book-open`).
    4. **`[ 🎛️ Filter ]`**: Opens `MobileFilterSheetModal` for quick lenses and Life Area filters (`pos-mobile-action-filter`, icon `sliders-horizontal`).
    5. **`[ ☀️ Agenda ]`**: Opens the new `MobileAgendaSheetModal` (`pos-mobile-action-agenda`, icon `sun`).
  - **Clean & Unhighlighted Note Icon**: Removed the elevated background circle, border, shadow, and white color from `.pos-mobile-action-new`. The Note icon now sits in the dock with the exact same calm, transparent, muted resting state (`color: var(--text-muted)`) as the other 4 buttons, producing a cleaner, perfectly balanced bar.
  - Styled with DIWA's calm, tactile Command Island surface (`background: var(--background-secondary-alt)`, architectural border `1px solid var(--background-modifier-border)`, subtle ambient shadow, no neon green accents).
- **Mobile Slide-Up Horizon Agenda Sheet (`MobileAgendaSheetModal.ts` & `styles.css`)**:
  - Implemented Option 1 as an ergonomic slide-up bottom sheet (`.pos-mobile-agenda-sheet-modal`, `.pos-mobile-bottom-sheet` on `.pos-bottom-sheet-backdrop`) occupying ~85vh.
  - Features tactile drag handle, touch drag-to-dismiss gesture (>80px delta), and backdrop tap dismiss.
  - **Header**: Vector Lucide `sun` SVG icon + bold "Agenda & Horizon" title, human-readable date subtitle (e.g. *Saturday, Oct 17 · 5-Day Horizon*), and `✕` close button.
  - **Body (`.pos-agenda-sheet-body`)**: Integrates directly with `renderHorizonRail()`:
    - **Overdue Alert Section**: Overdue open tasks and pending bills with subtle muted red outline.
    - **5-Day Rolling Horizon**: Today's Agenda, Tomorrow, and Next 3 Days with interactive tasks, pending bills, and note snippets.
    - **Collapsible Undated Section**: Open undated tasks with quick due-date scheduling.
    - Live two-way sync: interactive task toggling, date rescheduling, and subtasks seamlessly re-render via `setMobileAgendaModal` and `RefreshCoordinator`.
- **Clean Minimalist Mobile Header (`DesktopHubView.ts` & `styles.css`)**:
  - Removed the `[ ⋯ ]` More button completely from the mobile top header bar (`renderHeaderBar` returns early when `isMobile`), leaving only the crisp `DIWA` logo and subtitle `Personal OS`.
  - All workspace actions are now cleanly accessible through the 5 bottom action bar icons (`New note`, `search`, `recent notes`, `filter`, and `agenda`).
  - Cleaned up obsolete `.pos-mobile-header-actions` CSS rules.
- All 17 automated unit tests passing; production bundle compiled with 0 errors and deployed directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

## Previous State: Mobile Workspace & Tactile Floating Action Bar Harmonization Deployed
- **Tactile Floating Action Bar Harmonization (`styles.css`, `DesktopHubView.ts`, `GawaCockpitView.ts`)**:
  - **Eliminated Bright Neon Accents**:
    - Replaced bright theme `var(--interactive-accent)` and glowing colored shadow on the mobile capture button (`.pos-mobile-action-new.is-primary`) with DIWA's calm, tactile Command Island style.
    - Capture button styled as an elevated tactile circular button with `background: var(--background-primary)`, subtle border `1px solid var(--background-modifier-border)`, and crisp vector Lucide SVG (`edit-3` pencil).
    - Utility buttons (`search`, `sliders-horizontal`, `book-open`, `more-horizontal`) use uniform `20px` vector SVGs (`stroke-width: 2px`) in `var(--text-muted)` that smoothly illuminate to `var(--text-normal)` on tap/hover.
    - Active states (`.is-active`) use calm `background: var(--background-modifier-hover)`, `border-color: var(--background-modifier-border)`, and `color: var(--text-normal)` (no neon green).
  - **Comprehensive Mobile `[ ⋯ ]` More Menu (`DesktopHubView.ts`)**:
    - Equipped the mobile action bar with an ergonomic 5-button dock: `[ ✏️ Capture ]`, `[ 🔍 Search ]`, `[ 🎛️ Filter ]`, `[ 📖 Recent Notes ]`, and `[ ⋯ More ]`.
    - Tapping `[ ⋯ ]` opens a comprehensive mobile action sheet giving full mobile parity for DIWA features:
      - 📅 **Daily Digest & Review** (with dynamic `✓ Done` completion status)
      - 📋 **Open Gawa Task Cockpit** (with live open task count)
      - ☀️ **Open Karon Today & Horizon**
      - ☑️ **Select Notes to Merge**
      - 📱 **Toggle Obsidian Navigation Bar**
      - ⚙️ **DIWA Settings**
  - **Expanded Mobile Composer Alignment (`styles.css` & `DesktopHubView.ts`)**:
    - Replaced `.mod-cta` neon green on `.pos-composer-send-btn-circle` with a tactile circular button (`background: var(--background-secondary)`, subtle border `var(--background-modifier-border)`, `color: var(--text-normal)`).
    - Replaced unicode text `'↑'` with vector Lucide `arrow-up` SVG.
  - **Gawa Cockpit Mobile Action Bar Alignment (`styles.css`)**:
    - Aligned `.pos-gawa-mobile-action-bar` to inherit the unified tactile standard, removing bright fills on `.is-primary` and `.is-active`.
  - All 17 automated tests passing; production bundle compiled with 0 errors and deployed directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

## Previous State: Full-Width Fluid Stream in Cockpit Layout Deployed
- **Full-Width Fluid Stream (`styles.css` & `DesktopHubView.ts`)**:
  - Eliminated the wide gap/whitespace between the stream column and the right Agenda rail on wider displays.
  - In `styles.css` under `.pos-cockpit-main-stage`:
    - Updated `.pos-composer-compact` and `.pos-desktop-composer` to `max-width: 100%`, allowing the capture bar to extend across the full stage.
    - Updated `.pos-note-stream-item` to `max-width: 100%`, allowing notes and hover actions to stretch to the right edge boundary next to the Agenda resizer.
    - Updated `.pos-empty-state` to `max-width: 100%`.
    - Updated `.pos-filter-carousel` and `.pos-selection-bar` to `max-width: 100%`.
  - In `src/views/DesktopHubView.ts`:
    - Updated `renderNoteItem()` inline-editing mode `item.style.maxWidth` from `820px` to `'100%'`.
  - All 17 automated tests passing; production bundle compiled with 0 errors and deployed directly to `/Users/K26/Obsidian/K0000` & `K0001` test vaults.

## Previous State: Informational `bill/pending` Notes in Agenda Horizon Deployed
- **`bill/pending` Notes in Agenda Horizon (`IndexService.ts`, `DesktopHubView.ts`, `styles.css`)**:
  - **Frontmatter & Tag Extraction (`IndexService.ts`)**:
    - Scans for notes tagged `#bill/pending` or `tags: [bill/pending]` (excluding trash and Handumanan).
    - Resolves the target date using the frontmatter `due_date` property (supporting ISO `YYYY-MM-DD`, quoted strings, or wikilinks `[[YYYY-MM-DD]]`).
    - Extracts optional frontmatter `amount` for financial context.
    - Excludes `bill/pending` notes from generic note block snippets (`getVaultNoteBlocksForDate`) to prevent duplication.
  - **Horizon Rail Integration (`DesktopHubView.ts`)**:
    - **Overdue Section**: Overdue bills (`due_date < today`) surface in `.pos-rail-overdue-box` alongside overdue tasks, dynamically updating the header (`X Overdue Items`, `X Overdue Tasks`, or `X Overdue Bills`).
    - **5-Day Rolling Horizon**: Bills due on each day (Today, Tomorrow, and Next 3 Days) are rendered in chronological day sections with the section counter badge updated accordingly.
  - **Muted Informational Bill Card Layout (`DesktopHubView.ts` & `styles.css`)**:
    - Rendered via `renderRailBillRow()` using `.pos-rail-bill-item` (`cursor: default`, non-interactive per user request):
      - Line 1: `receipt` Lucide vector icon + note title (`.pos-rail-bill-title`).
      - Line 2: Meta pills (`.pos-rail-bill-meta`) with calendar icon + `Due: YYYY-MM-DD` (`.is-overdue` or `.is-today`), `bill/pending` badge, and bold tabular `amount` pill if present.
      - Styled with subtle borders (`var(--background-modifier-border-faint)`), soft red highlight when overdue (`rgba(239, 68, 68, 0.32)`), and aligned with DIWA's muted aesthetic.
  - **Unit Tests & Production Deployment**:
    - Added unit tests in `tests/frontmatterFallback.test.ts` verifying tag matching, wikilink `due_date` parsing, amount parsing, and non-pending tag rejection (17/17 passing).
    - Production bundle compiled with 0 errors and deployed to `/Users/K26/Obsidian/K0000` & `K0001` (`obsidian_DIWA`).

## Previous State: Stream Image Click-to-Zoom Lightbox, Relaxed Two-Line Recent Notes Cards & Line-Level Live Editor in `WikilinkPeekModal` Deployed
- **Stream Image Click-to-Zoom Lightbox (`DesktopHubView.ts` & `styles.css`)**:
  - In `attachInteractiveElements()`, hydrated cached `.internal-embed` image embeds via `metadataCache.getFirstLinkpathDest()` + `vault.getResourcePath()` and attached delegated click handling on `.pos-note-body` so clicking any embedded (`![[...]]`) or markdown (`![](...)`) image opens a full-viewport zoom lightbox (`openImageLightbox`).
  - Added `.pos-image-lightbox` with interactive click-to-zoom (`1x` ↔ `2x`), mouse-wheel zoom (`100%`–`400%`), click-and-drag panning when zoomed in, floating control pill (`−`, `100%`, `+`, `✕`), and `Escape`/backdrop dismissal.
  - Prevented image clicks/double-clicks from triggering stream selection mode or inline note editing in `renderNoteItem()`.
- **Relaxed Two-Line Recent Notes Cards (`DesktopHubView.ts` & `styles.css`)**:
  - Updated `renderRailNoteItem()` in the Agenda panel's **Notes** tab to use a spacious two-line card layout (`.pos-rail-permanent-note-row` with `padding: 10px 12px`, `gap: 7px`, `8px` inter-card gap, and `20px` bucket gap):
    - **Line 1 (`.pos-rail-note-top`)**: Subtle `file-text` icon (`.pos-rail-note-row-icon`) + multi-line wrapping note title (`.pos-rail-note-title`, `-webkit-line-clamp: 2`, `line-height: 1.4`).
    - **Line 2 (`.pos-rail-note-meta`)**: Folder pill (`.pos-rail-note-pill.is-folder`) and tag pills (`.pos-rail-note-pill.is-tag` / `.is-tag-more`) on the left, paired with the tabular relative modified timestamp (`.pos-rail-note-time`) on the right.
- **Line-Level Live Editor Canvas (`WikilinkPeekModal.ts` & `styles.css`)**:
  - Removed the bottom Quick Append footer bar completely (`renderQuickAppendBar` / `.pos-peek-footer`), turning `.pos-peek-body` into a full-height interactive document canvas.
  - **Line-by-Line Rendering & Single-Line Live Editing**:
    - Decomposes the note body into logical blocks (`PeekDocBlock[]`, preserving YAML frontmatter, leading `# Title`, and hidden DIWA digest comments/anchors untouched on disk).
    - Every inactive line renders live via `MarkdownRenderer.render` (`.pos-peek-line-row`), keeping task checkboxes (`- [ ]`) and `[[Wikilinks]]` 1-click interactive.
    - Clicking anywhere on a line swaps **only that single line** in-place into an auto-sizing live editor (`textarea.pos-peek-line-editor`) while all other lines above and below remain rendered.
    - Clicking the blank canvas tail (`.pos-peek-canvas-tail`) below the last line—or opening an empty note—immediately activates and focuses an editable line at the bottom of the document.
  - **Outliner Keyboard Flow & DIWA Smart Triggers**:
    - Supports `[[` (file suggest), `#` (tag/context suggest), `@date` (natural language date), `/person`, and `++` (`- [ ] ` task conversion) via `attachInlineTriggers()` and `attachMediaPasteHandler()`.
    - `Enter` splits/creates the next line below, automatically continuing `- ` or `- [ ] ` list prefixes (or clearing an empty prefix).
    - `Backspace` at column `0` strips a list/task prefix or merges with the previous line.
    - `ArrowUp` / `ArrowDown` moves the live editor seamlessly to the previous/next line while rendering the prior line back to markdown.
    - `Escape`, `Cmd/Ctrl + Enter`, or clicking outside commits the line to disk via `app.vault.process()`, syncs `IndexService` + `RefreshCoordinator`, and returns the line to rendered markdown.
- **Architectural Header & In-Place History Navigation (`WikilinkPeekModal.ts` & `styles.css`)**:
  - Hid Obsidian's default floating `.modal-close-button` to prevent overlap with header actions.
  - Added a mid-heavy `2px` architectural divider (`border-bottom: 2px solid var(--background-modifier-border)`) on `var(--background-primary)`.
  - Replaced noisy uppercase folder breadcrumbs with a quiet editorial subtitle (`Folder/Path · #tag1 · Updated 12m ago`).
  - Added an in-modal history stack (`_history`) with a `[ ← ]` back button so clicking nested `[[Wikilinks]]` inside the modal navigates in-place and lets you step back seamlessly.
  - Added labeled muted action pills: `[ 🔍 Stream ]` and `[ ⧉ New Window ]` (opens note in a native OS-level resizable Obsidian popout window on Desktop).
- **Universal `WikilinkPeekModal` by Default (`DesktopHubView.ts`, `CalendarDigestView.ts`, `PreFlightDigestModal.ts`)**:
  - Standard left-click / tap on any `[[Wikilink]]` across the main stream, Agenda Horizon note snippets, task titles, task comments, Calendar Digest, Pre-Flight Digest, and nested preview links opens `WikilinkPeekModal` by default.

## Previous State: Agenda Header Pill Moved to `[ ⋯ ]` Menu, Tasks Tab Removed, Collapsible Undated Section & Editorial Notes Tab Deployed
- **Agenda Toggle Relocated to `[ ⋯ ]` Menu (`DesktopHubView.ts`)**:
  - Removed the standalone `[ ◨ Agenda ]` pill button from the top header bar, leaving a minimal header bar: `[ 🔍 Search / ]   [ 🎛️ All Notes ▾ ]   [ ⋯ ]`.
  - Added `Hide Agenda Panel (\)` / `Show Agenda Panel (\)` (with `panel-right` icon and checkmark indicator) as the top item in the `[ ⋯ ]` More menu (hidden in tablet portrait mode).
- **Temporal Grouping & Single-Line Editorial Rows in "Notes" Tab (`DesktopHubView.ts` & `styles.css`)**:
  - **Chronological Horizon Grouping (`updateRailNotesList`)**: Automatically buckets recently updated permanent notes (`record.mtime`) into 4 temporal sections matching the Horizon tab's architecture: **`TODAY`**, **`YESTERDAY`**, **`THIS WEEK`**, and **`EARLIER`** (with `[ count ]` badges; empty buckets suppressed).
  - **Single-Line Editorial Note Rows (`renderRailNoteItem`, `.pos-rail-permanent-note-row`)**:
    - Removed folder and tag subtitle metadata below the note title so each row displays a single clean line with the bold truncated note title on the left and tabular relative timestamp (`12m`, `2h`, `Oct 14`) flush right.
- **2-Tab Agenda Panel (`DesktopHubView.ts`)**:
  - Removed the redundant `[ ☑️ Tasks ]` tab pill from the Agenda panel segmented header (`renderRightRail`), streamlining the top rail navigation to `[ ☀️ Horizon ]  [ 📖 Notes ]`.
  - Automatically migrates any persisted `railTab: 'tasks'` state in `localStorage` (`diwa-cockpit-state-v2`) to `'karon'` (`Horizon`).
  - Removed the duplicate `renderTasksRail()` method and `_tasksRailFilter` state.
- **Collapsible `Undated` Section in Horizon (`DesktopHubView.ts` & `styles.css`)**:
  - Added a collapsible **`Undated`** section at the bottom of `renderHorizonRail()` displaying open tasks that have no due date (`!t.completed && !t.dueDate`), excluding Handumanan paths.
  - Collapsed by default (`_horizonUndatedExpanded: false`, persisted in `diwa-cockpit-state-v2`) so the 5-day rolling horizon remains focused and uncluttered.
  - Interactive header (`.pos-rail-section-header.is-collapsible`) features a `chevron-right` / `chevron-down` indicator, `Undated` label, and count badge (`${undatedTasks.length}`), with click and keyboard (`Enter` / `Space`) support.
  - When expanded, renders full interactive task cards (`renderRailTaskRow`) supporting 1-click completion, `[ 📅 Set Due ▾ ]` quick-scheduling into the horizon, subtasks, and notes.
  - Fixed hover-reveal CSS selectors in `styles.css` to target `.pos-rail-task-item:hover` alongside `.pos-rail-task-row:hover`.

## Previous State: Pre-Flight Modal Harmonized with DIWA Muted Workspace Theme & Palette
- **DIWA Palette Alignment in PreFlightDigestModal (`styles.css` & `PreFlightDigestModal.ts`)**:
  - **Execute Digest CTA Button**: Overrode bright neon-green `.mod-cta` with DIWA's calm muted button style (`background: var(--background-modifier-hover)`, subtle border `var(--background-modifier-border)`, `color: var(--text-normal)`), eliminating harsh theme accent blocks.
  - **Editorial Note Snippet Links**: Styled snippet wikilinks and dates with standard text color and subtle hairline underlines (`.pos-stream-wikilink` style), eliminating bright neon-green links.
  - **Muted Tags & Checkboxes**: Replaced bright green tag styling with muted badge styling (`var(--background-modifier-hover)`), and desaturated checkboxes.
  - **Clean Title Formatting**: Strips raw `- [ ]` checklist syntax, `[[ ]]` wikilink brackets, and hashtags from the modal title (e.g. `Digest Note: Project Steer status...`).
  - **Refined Neutral Pills**: `.is-alt` dashed pills and active pills use subtle neutral borders and hover illumination.

## Previous State: Option B Smart Date Isolation & Bugfix for Digested Tasks in Horizon
- **Option B Smart Date Isolation (`IndexService.ts`)**:
  - Implemented `stripDigestMetadata(text: string): string` to strip auto-generated digest headers (`#### [[YYYY-MM-DD]] HH:mm`), block anchors (`^dw-...`), and comment wrappers (`diwa-digest:`, `diwa-digested:`).
  - In `getVaultNoteBlocksForDate(dateStr)`:
    - **Digest Timestamp Disregarded**: Auto-stamped digest timestamps (`#### [[today]] HH:mm`) are stripped before matching, preventing target notes from cluttering today's Horizon simply because they received a digest today.
    - **Intentional Body Dates Preserved**: If the actual note body contains a future target date (e.g. `Client demo [[tomorrow]]`), `stripDigestMetadata` retains it, and the note **will appear** under that future date in the Horizon agenda rail!
    - **Checklist & Completed Task Exclusion**: Applied checklist regex (`/^[ \t]*-[ \t]+\[[ xX]\]/m`) *after* stripping digest metadata, ensuring digested tasks (such as completed tasks archived under `## Log`) are never misclassified as note blocks or displayed in the Horizon.
    - **Clean Display Snippets**: When rendered in Horizon cards, snippets display the clean note content with technical digest headers/anchors stripped.
    - **No Duplicates**: Digested stream notes (`entry.digested: true`) in `captureIndex` are skipped because their content lives authoritatively in their permanent destination notes.
- **1 Note = 1 Digestible Block Logic (`CaptureService.ts`)**:
  - Transitioned `parseDigestibleBlocks` from fragmented line-by-line block splitting to **1 note = 1 digestible block** (`[singleBlock]`).
  - The entire note body remains cohesive and intact during digestion, preserving markdown structures, lists, and subtasks together.
  - Automatically classifies note block as `isTask: true` if it begins with a task checkbox (`- [ ]`), defaulting route to `target_tasks` (or `Gawa Inbox`).
  - Regular text/meeting notes are classified as `Note` (`isTask: false`), defaulting route to `target_log` (under `## Log` in target note) or `Keep in Note`.
  - When digested, the entire note body is wrapped and the note is stamped `digested: true`.
- **Pre-Flight Modal Polish (`PreFlightDigestModal.ts` & `styles.css`)**:
  - Updated card pill label to `'Note'` (replacing `'Thought'`).
  - Subtitle updated to: `Review destinations and routing for X note(s).`
  - Action button updated to: `Execute Digest (X note(s))`.
  - Added `max-height: 240px; overflow-y: auto` to `.pos-preflight-snippet` for comfortable scrolling of long notes.
- **Single-Note Digest in Note Card Menu (`DesktopHubView.ts`)**:
  - Single-note digest accessible via `...` dropdown menu (`Digest Note...` with icon `sparkles`), opening the pre-flight modal for that single note.
  - Automatically re-indexes the source note file, invalidates render cache, updates the stream, and dispatches refresh notifications.
- **Muted Theme & Responsive Pre-Flight Digest Modal (`styles.css`)**:
  - Replaced bright emojis with clean Obsidian Lucide icons (`arrow-right`, `search`, `check-square`, `file-text`).
  - Neutral muted styling matching DIWA palette (`var(--background-modifier-border-faint)`, muted pill buttons, no stark colors).
  - Full responsiveness across Desktop, Tablet, and Mobile.

## Previous State: Mobile Micro-Card Stream Layout (Option 1 Implemented for Mobile Only)
- **Mobile Micro-Card Stream Layout (`DesktopHubView.ts` & `styles.css`)**:
  - Exclusively targets mobile phones (`Platform.isMobile && !isTablet(this.app)`), leaving desktop and tablet dual-pane cockpit layouts 100% untouched.
  - Eliminated the desktop 3-column outliner constraints on phones (removed the `68px` left gutter and the `96px` right padding for hover actions).
  - Built a dedicated `.pos-mobile-card-header`:
    - Top Left: Note timestamp (`pos-note-time`, `h:mm A`) and selection checkbox (if multi-select mode is active).
    - Top Right: Compact static action buttons capsule (`pos-mobile-card-actions`) with Star (`☆`) and More options (`...`).
  - Full-Width Content Body (`.pos-note-content-wrap`): Note markdown and tasks span **100% full width of the card** directly below the header row, doubling usable text width from ~180px to ~350px (+95%) and eliminating awkward 3-word line wrapping.
  - Consistent visual card design: `background: var(--background-secondary)`, `border-radius: 12px`, subtle border, soft elevation, and gold left border for important/starred notes.
  - Removed task color accents (`.has-tasks` border-left) across all desktop and mobile cards to preserve the unified palette and theme of the plugin.

## Previous State: Agenda Rail Hover-Reveal Subtasks & Notes with Multi-Way Dismissal
- **Compact Resting Card Layout (`DesktopHubView.ts` & `styles.css`)**:
  - Subtasks and comments/notes containers are hidden by default (`display: none;`), eliminating vertical clutter so each task card occupies a compact ~40px row with title, due date, and subtle count badges (`☑ done/total`, `💬 count`).
  - Action buttons (`+ Subtask`, `+ Note`) for tasks with no existing items are strictly hidden by default (`display: none !important;`) and only reveal when hovering over the task card (`.pos-rail-task-row:hover .pos-rail-meta-action-pill`).
- **Hover-Reveal Behavior (`styles.css`)**:
  - Hovering a task card (`.pos-rail-task-row:hover`) automatically reveals its subtask and comment containers (`.pos-rail-subtasks-wrap.is-hover-reveal`, `.pos-rail-comments-wrap.is-hover-reveal`), allowing immediate inspection and interaction without clicking.
  - Moving the mouse away automatically collapses the card back to its ultra-compact resting state.
- **Multi-Way Box Dismissal & Collapse (`DesktopHubView.ts` & `styles.css`)**:
  - **Header "✕ Hide" Button**: Both subtask and comment boxes include a dedicated mini-header (`SUBTASKS` / `NOTES`) with a `✕ Hide` button (`pos-rail-box-close-btn`). Clicking it immediately collapses the box and remembers it in `_collapsedRailSubtasks` / `_collapsedRailComments`, suppressing hover-reveal.
  - **Badge Pill Toggle (`☑` / `💬`)**: Clicking count badges in the meta row toggles between pinned-open (`_pinnedRailSubtasks` / `_pinnedRailComments`) and collapsed.
  - **Quick-Input Cancel Button (`✕`) & `Escape` Key**: Both quick-add input rows feature an `✕` dismiss button (`pos-rail-quick-input-cancel`) and handle `Esc` to instantly close and remove the input box.
  - **Auto-Dismiss on Empty Blur**: If an input was opened on an item with no items, clicking outside with an empty field automatically dismisses the box.
- **Full 5-Day Rolling Horizon (Clean Note Snippets & Handumanan Excluded)**:
  - Excludes everything under Handumanan paths (`handumanan`).
  - Note cards in Horizon directly display the excerpted snippet without a title header.
- **Stream Life Area Badge Hidden (`DesktopHubView.ts` & `styles.css`)**:
  - Removed the `.pos-area-badge` DOM creation from note cards in `renderNoteItem`.
  - Added `.pos-stream-item .pos-area-badge { display: none !important; }` in `styles.css` as a defense-in-depth safety rule.
  - Life area metadata remains intact in note frontmatter and files, and is still available in the note's `...` action menu (`Set Life Area...`) and inline editor, but is no longer visually rendered in the stream cards.
- **Agenda Side Rail Task Cards Aesthetic Cleanup (`DesktopHubView.ts` & `styles.css`)**:
  - Removed the note link button (`pos-rail-source-btn`, icon `arrow-up-right`) from all task cards in the Agenda side rail (`renderRailTaskRow`).
  - Affects both the **Rolling Horizon / Karon** tab (Overdue, Today, Tomorrow) and the **Tasks** tab (All, Overdue, Today, Upcoming).
  - The task cards now have a clean, distraction-free aesthetic with only the task checkbox and the task title/due-date meta content, while removing the unused/cluttering peek button.
  - Deprecated and removed unused `.pos-rail-source-btn` CSS definitions from `styles.css`.
- **Stream Task Due Date Relative Substitution (`DesktopHubView.ts`)**:
  - When a date link (`a.internal-link` matching `YYYY-MM-DD`) is located inside a task item (`li.task-list-item, li:has(input[type="checkbox"])`):
    - Evaluates relative status dynamically against current date:
      - Today $\rightarrow$ **`Due: Today`**
      - Yesterday $\rightarrow$ **`Due: Yesterday`**
      - Tomorrow $\rightarrow$ **`Due: Tomorrow`**
      - Other dates $\rightarrow$ **`Due: YYYY-MM-DD`**
    - Includes double-prefix guard: if the preceding text already ends with `Due:` or `due:`, avoids duplicating `Due:`.
    - Purely visual substitution on `link.textContent`; underlying file retains valid Obsidian wikilink `[[YYYY-MM-DD]]` syntax.
    - Click interactions (`data-href="YYYY-MM-DD"`) remain intact for date snooze/reschedule menus and daily note navigation.
- **Stream Date Wikilink Styling (`DesktopHubView.ts` & `styles.css`)**:
  - Date links inside note markdown bodies (`.pos-rendered-date-link`) are now treated like normal editorial wikilinks:
    - Displayed inline with regular text color (`var(--text-normal) !important; font-weight: 600 !important;`).
    - Styled with an editorial solid hairline underline (`underline solid var(--background-modifier-border) !important; text-underline-offset: 3.5px !important; text-decoration-thickness: 1px !important;`).
    - Stripped of subtle pill backgrounds, padding, and muted grey text colors (`background: transparent !important; padding: 0 !important;`).
    - On hover, underline subtly illuminates to `var(--text-muted)`.
    - Date click action menu (`openDateActionMenu` for snooze/reschedule) remains fully interactive.
- **Completed Task Full Strike-Through (`DesktopHubView.ts` & `styles.css`)**:
  - In the stream, when a task is completed (`- [x]` / `li.is-checked` / `li[data-task="x"]`), **all child elements are included in being striked through**:
    - Child wikilinks (`a.internal-link`, `.pos-stream-wikilink`), date links (`.pos-rendered-date-link`, `Due: Today`), text, tags, code, and bold/italic elements all receive `text-decoration: line-through !important; color: var(--text-muted) !important; text-decoration-color: var(--text-muted) !important;`.
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
