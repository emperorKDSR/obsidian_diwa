# Progress: DIWA — Personal OS

## Current Phase: Mobile Floating Action Bar & Header Clean-Up Deployed

---

## Completed Roadmap Checklist

### 0. Mobile Floating Action Dock, Expandable Composer & Bottom Search
*   [x] **Sleek Frosted Floating Dock (`.pos-mobile-action-bar`)** — Compact centered floating island (`backdrop-filter: blur(28px) saturate(180%)`) with 4 icon-only buttons (**➕**, **🔍**, **🏷️**, **📱**).
*   [x] **Floating Bottom Search Capsule on 🔍** — Tapping **🔍** transforms the dock into an active bottom search pill (`.pos-mobile-floating-search`) docked right above the virtual keyboard with auto-focus, real-time debounced stream filtering, and `✕` dismiss button.
*   [x] **Expandable Floating Composer on ➕** — Tapping **➕** transitions smoothly into the floating 2-row composer capsule (`.pos-mobile-sticky-composer`) with auto-expanding textarea, `[ ↑ ]` send button, `☑️ Task`, `⭐ Important`, Life Area chips, draft restoration, and `✕ Close` dismiss pill.
*   [x] **Mobile Top Header Clean-Up** — Removed redundant top search and top action buttons on phones.
*   [x] **On-Demand Filter Carousel** — Filter carousel hidden by default on phones, expanding smoothly on tap.
*   [x] **Desktop / iPad Protected** — Desktop and iPad retain full header search, actions, and hero composer intact.
*   [x] **Build & Vault Deployed** — Clean compile with `npm run build` (0 errors) and deployed to `/Users/K26/Obsidian/K0000` & `K0001`.

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
