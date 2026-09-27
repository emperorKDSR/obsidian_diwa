# Active Context: DIWA — Personal OS

## Current State: Mobile Keyboard Viewport Resizing Deployed (VisualViewport Integration)
- **Mobile Keyboard Viewport Height Adaptation**:
  - Integrated `attachMobileSheetViewportBehavior` into `DesktopHubView` on mobile, which dynamically listens to `window.visualViewport` to compute real keyboard height `--diwa-kb-h` and toggle `.has-mobile-keyboard`.
  - Added CSS rule `.diwa-workspace-root.has-mobile-keyboard { height: calc(100% - var(--diwa-kb-h, 0px)) !important; max-height: calc(100% - var(--diwa-kb-h, 0px)) !important; }` so the workspace scroll container physically ends where the virtual keyboard begins, eliminating the 400px+ black void.
  - Made `.pos-scratchpad-container` and `.pos-document-stream` fill available flex height (`flex: 1; min-height: 0;`).
  - Added `justify-content: flex-start` to empty state when searching so search status sits directly under the input rather than centering in dead space.
  - Added `@supports (height: 100dvh)` progressive enhancement for iOS 15.4+.
- **Deployment**:
  - Built cleanly with `npm run build` (0 errors).
  - Deployed `main.js`, `manifest.json`, and `styles.css` directly to `/Users/K26/Obsidian/K0000/.obsidian/plugins/Obsidian_diwa`.
