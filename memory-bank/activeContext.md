# Active Context: DIWA — Personal OS

## Current State: Deep Dead and Unused Code Pruning Complete
- **Codebase Optimization & Pruning**:
  - Deleted unreferenced files: `src/services/VaultService.ts`, `src/utils/imageZoom.ts`, `src/modals/ImageLightboxModal.ts`.
  - Pruned unused functions and legacy helpers from `src/utils.ts` (`createThoughtCaptureWidget`, `ThoughtCaptureOptions`, `getThoughtDisplayTitle`, `toAsciiDigits`, `parseContextString`).
  - Pruned unused methods in `src/main.ts` (`activateDesktopHub`, `activateMobileHub`, `activateTabletHub`, `activateView`).
  - Pruned unused methods in `src/services/CaptureService.ts` (`convertLineToTask`) and `src/services/IndexService.ts` (`buildCaptureIndex`, `captureLocationChanged`).
  - Pruned unused methods/fields in `src/application/RefreshCoordinator.ts` (`suppressNotifyRefresh`, `bumpReindexCooldown`, unread `settings`).
  - Pruned unused methods/variables in `src/views/DesktopHubView.ts` (`refreshTasks`, `updateTaskPaneFromIndex`, unused `hint` and event parameters).
  - Cleaned up obsolete properties from `DiwaSettings` in `src/types.ts` (`thoughtsFolder`, `tasksFolder`, `pfFolder`, `reviewsFolder`, `legacyMigrated`).
  - Removed all unused imports and unused function parameters across modals and services.
- **Zero Build & Lint Errors**:
  - `npx tsc --noUnusedLocals --noUnusedParameters --noEmit --skipLibCheck` passed with 0 errors.
  - `npm run build` compiled cleanly.

## Previous State: Desktop Stream Autohide Pills Deployed
- Autohide Header Badges on Idle (Desktop / Tablet).
- Hover reveal transition on stream cards.
