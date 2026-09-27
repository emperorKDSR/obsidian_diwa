# Active Context: DIWA — Personal OS

## Latest Fix: iOS Keyboard Black Overlay
- Root cause confirmed on iPhone diagnostics: Obsidian correctly shrinks the DIWA root to the space above its keyboard (`440px`), but `.pos-scratchpad-container` became an implicit vertical scroller because of `overflow-x: hidden`. Its flex layout then shrank the container to `127px` and `.pos-document-stream` to `0px`, exposing the root's black background.
- Fix: while the keyboard is open, the workspace root is the sole vertical scroller. The scratchpad container uses content-sized flex layout with `overflow: visible !important` to beat the existing mobile `overflow-x: hidden !important`; without equal priority, the first attempt remained broken. The stream no longer shrinks to zero. DIWA does not resize the root; Obsidian retains ownership of keyboard height.
- Status: user confirmed the issue resolved on iPhone after the corrected CSS was built and deployed to the vault. Diagnostics and the ineffective forced-repaint workaround were removed.

## Current State: Mobile Note Editing Hardening & Touch Gestures Deployed
- **Mobile Sticky Composer Auto-Hide & Collision Elimination**:
  - `updateComposerVisibility()` dynamically toggles `.is-hidden` on `.pos-mobile-sticky-composer` when `_editingEntryId` is active, completely eliminating layout collisions where the capture bar covered the Save/Cancel buttons.
  - Automatically restores sticky composer visibility when inline editing ends (via Cancel, Save, or Escape).
- **Auto-Scroll & iOS Zoom Protection**:
  - Implemented auto-centering `scrollIntoView({ behavior: 'smooth', block: 'center' })` upon editor activation.
  - Enforced `font-size: 16px !important;` on `.pos-inline-textarea` across mobile viewports, permanently resolving iOS Safari/WebKit automatic viewport zooming and off-center coordinate shifts.
- **Card Touch Gestures & Action Menus**:
  - Added double-click / double-tap on `.pos-note-stream-item` to trigger inline edit mode directly without requiring precise button taps.
  - Added note action menu (`⋯` button) with 1-tap options:
    - ✏️ **Edit Note (Inline)**
    - 📖 **Open in Obsidian Editor** (`app.workspace.openLinkText`)
    - 📋 **Copy Note Content**
    - 🗑️ **Delete Note**
  - Expanded action icon touch targets to 32px–44px and guaranteed `.pos-note-actions` visibility on touch and mobile devices (`body.is-mobile`, `body.is-tablet`, `@media (pointer: coarse)`).
- **Deployment & Housekeeping**:
  - Clean TypeScript compilation with `npm run build` (0 errors).
  - Cleaned up unused legacy `is-diwa-v2-active` DOM class references in `src/main.ts`.
  - Updated release action name in `.github/workflows/release.yml` from `MINA V2` to `DIWA`.

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
