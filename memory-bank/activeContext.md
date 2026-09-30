# Active Context: DIWA — Personal OS

## Current State: Star & Filter System Dynamic Refresh Hardened & Deployed
- **Real-Time Dynamic Refresh & Synchronous Cache Mutation**:
  - `setCaptureImportance(filePath, newState)` immediately mutates in-memory index state and scrubs `#important`/`#star` tags synchronously, preventing UI lag or stale index rollbacks.
  - `IndexService.indexCaptureFile` reads raw disk content with `app.vault.read()` and authoritative `parseFrontmatterFallback()` rather than relying on delayed Obsidian `metadataCache` snapshots.
  - `RefreshCoordinator` handles `'capture'` scope via `view.refreshCapture()` (`updateStreamOnly()` + `updateFilterCounts()`), preserving container and scroll position while instantly repainting cards and badge counters.
- **1-Tap Star Marking (`⭐` / `☆`)**:
  - Interactive star button (`.pos-star-btn`) directly on note cards in the stream with optimistic UI updates and atomic frontmatter mutation (`toggleNoteImportance()`).
  - Added "⭐ Mark as Important" / "☆ Remove from Important" option in the note action menu (`⋯`).
  - Added star toggle chips (`⭐ Important`) in Desktop Hero Composer and Mobile Sticky Composer.
- **Fast Multi-Facet Indexing**:
  - `IndexService` parses `important: true`, `pinned: true`, and `#important` / `#star` tags into in-memory `CaptureEntry.important`.
  - Added `getImportantCount(tasksOnly?: boolean)` supporting compound queries with open tasks.
- **Surfacing at a Whim**:
  - **Filter Carousel**: `[ ⭐ Important (N) ]` chip with live badge counter.
  - **Search Modifiers**: Searching `is:important`, `!important`, or `⭐` filters down to starred notes.
  - **Global Commands**: `DIWA: Surface Important Notes` and `DIWA: Toggle Important on Current Note`.
- **Deployment**:
  - Clean compile with `npm run build` (0 errors) and deployed to active vault.

## Recent Fix: iOS Keyboard Black Overlay
- Root cause confirmed on iPhone diagnostics: Obsidian correctly shrinks the DIWA root to the space above its keyboard (`440px`), but `.pos-scratchpad-container` became an implicit vertical scroller because of `overflow-x: hidden`. Its flex layout then shrank the container to `127px` and `.pos-document-stream` to `0px`, exposing the root's black background.
- Fix: while the keyboard is open, the workspace root is the sole vertical scroller. The scratchpad container uses content-sized flex layout with `overflow: visible !important` to beat the existing mobile `overflow-x: hidden !important`; without equal priority, the first attempt remained broken. The stream no longer shrinks to zero. DIWA does not resize the root; Obsidian retains ownership of keyboard height.
- Status: user confirmed the issue resolved on iPhone after the corrected CSS was built and deployed to the vault. Diagnostics and the ineffective forced-repaint workaround were removed.

## Previous Focus: Mobile Note Editing Hardening & Touch Gestures Deployed
- **Mobile Slide-Up Bottom Sheet (`WikilinkPeekModal`)**:
  - Tapping a non-date wikilink (`[[...]]`) in the stream smoothly slides up a 68vh bottom sheet over the stream with backdrop blur (`backdrop-filter: blur(8px)`), swipe-down dismissal gestures, and drag handle.
  - Renders markdown live with `MarkdownRenderer` and a dedicated `Component` lifecycle.
  - Interactive checkboxes inside the peek preview update the target note atomically via `app.vault.process()`.
  - Built-in **Quick Append Bar**: allows appending notes/tasks directly to the referenced note without opening the file.
- **Desktop Protected Split Navigation**:
  - Standard left-click targets an adjacent split leaf or opens a vertical split pane, preventing the DIWA stream leaf from being evicted or replaced.
  - Supports modifier keys: `Cmd/Ctrl + Click` (new tab), `Alt + Click` (floating window).
  - Native hover preview support via Obsidian's core `hover-link` event.
