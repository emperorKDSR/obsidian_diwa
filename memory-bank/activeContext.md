# Active Context: DIWA — Personal OS

## Current State: Expandable Inline Floating Composer on ➕ Quick Capture Deployed
- **Seamless State Transition**:
  - **Idle State**: Minimal, frosted 4-icon action dock (**➕**, **🔍**, **🏷️**, **📱**).
  - **Active State (Tap ➕)**: Instantly reveals the exact original floating 2-row composer capsule (`.pos-mobile-sticky-composer`) with full-width textarea, `[ ↑ ]` submit button, `☑️ Task`, `⭐ Important`, Life Area selector pills, and `✕ Close` dismiss pill.
  - Automatically focuses the input and auto-resizes.
  - On submit or `✕ Close`, cleans up state and collapses back to the 4-icon dock.
- **Mobile Header Clean-Up**:
  - Top header action icons removed on phones.
  - Filter carousel hidden by default on phones, toggled on demand via 🏷️ Filter button.
- **Build & Vault Deployment**:
  - Clean compile (`npm run build`, 0 errors) and deployed to `/Users/K26/Obsidian/K0000` & `/Users/K26/Obsidian/K0001`.

## Previous State: Star & Filter System Dynamic Refresh Hardened & Deployed

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
