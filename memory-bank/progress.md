# Progress: DIWA — Personal OS

## Current Phase: Production-Grade Hardening Phase 1 & 2 Completed & Deployed

---

## Completed Roadmap Checklist

### 0. Production-Grade Hardening (Phases 1 & 2)
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
*   [x] **Keyboard-Open Height Constraint** — Applied `.diwa-workspace-root.has-mobile-keyboard { height: calc(100% - var(--diwa-kb-h, 0px)) !important; }` so the scroll container ends right above the virtual keyboard.
*   [x] **Flex Height Fill** — Set `flex: 1; min-height: 0;` on `.pos-scratchpad-container` and `flex: 1 1 auto; min-height: 0;` on `.pos-document-stream`.
*   [x] **Top-Aligned Search Empty State** — Applied `justify-content: flex-start` to prevent empty state from centering into off-screen space.
*   [x] **Progressive `100dvh` Support** — Added `@supports (height: 100dvh)` fallback for dynamic viewport height on modern iOS.
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
