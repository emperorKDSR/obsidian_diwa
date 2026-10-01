# Active Context: DIWA — Personal OS

## Current State: Journal Dead Code Removal Complete
- **Deleted Dead Files & Directories**:
  - Deleted `src/modals/JournalEntryModal.ts` (-65 lines).
  - Deleted `src/journal/JournalComposer.ts` (-70 lines).
  - Deleted `src/journal/shared.ts` (-53 lines) and removed `src/journal/` directory.
- **Relocated General Utilities**:
  - Moved `getThoughtDisplayTitle()` to `src/utils.ts`.
- **Cleaned Up Types, Constants & Services**:
  - Removed `journalType` from `ThoughtEntry` in `src/types.ts`.
  - Removed `JOURNAL_ICON_ID` and `JOURNAL_ICON_SVG` from `src/constants.ts` and `main.ts`.
  - Removed `activateJournalInput()`, `consumeJournalInputFocusRequest()`, and `pendingJournalInputFocus` from `src/main.ts`.
  - Removed `inferJournalType` and `journalType` indexing from `src/services/IndexService.ts`.
  - Removed `journalType` parameter and frontmatter generation from `src/services/VaultService.ts` (and added auto-scrubbing of legacy frontmatter on edit).
  - Removed `journalType` handling from `src/views/ThoughtController.ts`.
- **Verification**:
  - Clean compile with `npm run build` (0 errors).

## Previous State: Legacy Gawa & Bulsa Dead Code Removal Complete
- Tapping **🏷️** opens the `MobileFilterSheetModal` with Quick Lenses and Life Areas.
- Omitted top `.pos-filter-bar` on phones.
