# Active Context: DIWA — Personal OS

## Current State: Production-Grade Hardening Phase 1 & 2 Deployed
- **Data Integrity & Atomic File Operations (Phase 1)**:
  - Migrated note mutations, task toggling (`toggleTaskInFile`), and note content updates (`updateNoteContent`) in `CaptureService` and `VaultService` to atomic `app.vault.process()` transactions.
  - Replaced naive `indexOf('\n---\n')` line-splitting with regex frontmatter matching `/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/` across `VaultService` (`editThought`, `editTask`, `updateTaskEntry`) to eliminate silent file truncation on Windows CRLF (`\r\n`).
  - Fixed `snoozeDateLink` and `removeDateLink` to segregate frontmatter from body, ensuring wikilink updates only modify target dates in the note body.
  - Protected user settings in `scanForContexts()` by removing destructive filtering of `settings.contexts`.
  - Standardized file deletion on native `app.vault.trash(file, true)` across `VaultService` and `CaptureService`, enabling standard undo and preventing vault folder pollution.
  - Vault-scoped draft storage in `localStorage` using `appId` (`diwa-scratchpad-draft-<appId>`).
- **Memory, DOM & UI Lifecycle Hardening (Phase 2)**:
  - Bound note render card cache in `DesktopHubView` with LRU eviction (cap at 100 entries) and fixed delete key mismatch using prefix invalidation (`invalidateRenderCacheForFile`).
  - Eliminated Obsidian Component memory leak in `MarkdownRenderer` by creating and properly unloading a dedicated `_streamComponent` on each stream refresh.
  - Dynamically scoped mobile bottom navigation bar hiding (`diwa-hide-mobile-navbar`) to active leaf changes in `main.ts` so navigating to other vault notes restores the native navbar.
  - Added theme compliance attribute `data-task="x"` to task checkbox clicks for compatibility with Minimal and AnuPpuccin themes, with automatic state rollback on file write failure.
  - Throttled all composer and inline editor auto-resizing via `requestAnimationFrame` to eliminate layout thrashing during typing.
  - Replaced raw `innerHTML` in `CommentModal.ts` with Obsidian native `setIcon(..., 'paperclip')`.
  - Fixed cross-platform `npm run clean` script in `package.json` and pruned unused `vis-network` dependency.
- **Deployment**:
  - Clean TypeScript compilation and bundling with `npm run build` (0 errors).
  - Deployed `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000/.obsidian/plugins/Obsidian_diwa`.

## Current Focus: Wikilink System Interaction (Mobile Peek Sheet & Desktop Split Navigation) Deployed
- **Mobile Slide-Up Bottom Sheet (`WikilinkPeekModal`)**:
  - Tapping a non-date wikilink (`[[...]]`) in the stream smoothly slides up a 68vh bottom sheet over the stream with backdrop blur (`backdrop-filter: blur(8px)`), swipe-down dismissal gestures, and drag handle.
  - Renders markdown live with `MarkdownRenderer` and a dedicated `Component` lifecycle.
  - Interactive checkboxes inside the peek preview update the target note atomically via `app.vault.process()`.
  - Built-in **Quick Append Bar**: allows appending notes/tasks directly to the referenced note without opening the file.
  - Unresolved link handling: displays "Note does not exist yet" card with a 1-tap `[ ➕ Create Note ]` action.
- **Desktop Protected Split Navigation**:
  - Standard left-click targets an adjacent split leaf or opens a vertical split pane, preventing the DIWA stream leaf from being evicted or replaced.
  - Supports modifier keys: `Cmd/Ctrl + Click` (new tab), `Alt + Click` (floating window).
  - Native hover preview support via Obsidian's core `hover-link` event.
  - Right-click / context menu: provides options for Quick Preview, Open in Split, Open in Tab, Filter Stream for `[[Note]]`, and Copy Wikilink.
- **Stream Pivot Filter (`filterStreamByWikilink`)**:
  - Pivots the DIWA continuous scratchpad search to filter all captures referencing the target note.
- **Deployment**:
  - Clean TypeScript compilation with `npm run build` (0 errors).
  - Deployed `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000/.obsidian/plugins/Obsidian_diwa`.
