# System Patterns: DIWA — Personal OS Architecture

## 1. Tech Stack & Dependencies
*   **Compilation**: Compiled via `esbuild.config.mjs` from `src/main.ts` into a single file `main.js`, with style declarations in `styles.css`. Builds are deployed automatically to the active vault at `/Users/K26/Obsidian/K0000/.obsidian/plugins/Obsidian_diwa`.
*   **TypeScript**: Targeted at `ESNext` modules with strict type checks.
*   **Dependencies**: Obsidian API, `chrono-node` for natural-language dates.

---

## 2. Core Service Architecture

DIWA uses a decoupled, event-driven service architecture:

```mermaid
flowchart TD
    subgraph Composition Root
        Main[src/main.ts - DiwaPlugin]
    end

    subgraph Service Layer
        Cap[src/services/CaptureService.ts - File I/O & Partitioning]
        Vault[src/services/VaultService.ts - General Vault I/O]
        Index[src/services/IndexService.ts - Fast In-Memory Indices]
        Ref[src/application/RefreshCoordinator.ts - Granular Event Dispatcher]
    end

    subgraph User Interface Layer
        Hub[src/views/DesktopHubView.ts - Continuous Scratchpad View]
        MergeModal[src/modals/MergeNotesModal.ts - Merge & Promote Modal]
        Settings[src/settings.ts - DiwaSettingTab]
    end

    Main --> Cap
    Main --> Vault
    Main --> Index
    Main --> Ref
    Main --> Hub
    Main --> Settings

    Cap --> Vault
    Index --> Vault
    Ref --> Hub
    Hub --> Cap
    Hub --> Index
    Hub --> MergeModal
```

### Capture Service (`src/services/CaptureService.ts`)
*   Manages atomic note creation in `<captureFolder>/YYYY/MM/YYYY-MM-DD HH.mm.ss.md` (default: `000 Bin/Diwa/`).
*   Generates clean YAML frontmatter (`created`, `modified`, `area`, `tags`, `hasTasks`).
*   Provides in-place task toggling (`toggleTaskInFile`), updating markdown `- [ ]` $\leftrightarrow$ `- [x]` without UI reload.
*   Provides atomic note content and taxonomy updates (`updateNoteContent`).
*   Draft persistence in `localStorage` for zero-data-loss user input.
*   Multi-note merging (`mergeNotes`).

### Index Service (`src/services/IndexService.ts`)
*   Synchronous in-memory cache: `captureIndex: Map<string, CaptureEntry>`.
*   Parses frontmatter, body, markdown tasks, and tags.
*   Provides instant queries: `getAllCaptures()`, `getOpenTaskCount()`, `getUntaggedCount()`, `getAreaCounts()`.

### Refresh Coordinator (`src/application/RefreshCoordinator.ts`)
*   Listens to Obsidian workspace and vault events with debouncing and cooldown mechanisms to avoid duplicate re-renders.
*   Dispatches granular refresh events (`all`, `tasks`, `thoughts`, `capture`) to open views.

---

## 3. Continuous Scratchpad View (`DesktopHubView`)

The **Continuous Scratchpad** is the primary interactive hub:
1.  **Header Bar**: Logo, fast debounced search input, `[ Select ]` multi-note merge toggle, `[ 🧹 N Untagged ]` Inbox Sweeper button, Settings button.
2.  **Filter Carousel**: `[ All Notes ]`, `[ ☑️ Open Tasks ]`, Life Area chips (`[ 💼 Work ]`, `[ 🌱 Health ]`, `[ 💰 Wealth ]`, `[ 💡 Growth ]`).
3.  **Adaptive Composer**:
    *   *Desktop & Tablet*: Top Hero composer with borderless input capsule, `[ ☑️ Task ]` shortcut, life area selector chips, and `⌘ Enter` save shortcut.
    *   *Mobile*: Compact 2-row frosted-glass floating bar (`backdrop-filter: blur(20px)`) with zero inner outline noise: Row 1 task shortcut + input + circular send button; Row 2 swipeable life-area pills.
4.  **Continuous Document Stream**:
    *   Clean typography without card boxes, borders, or inner outlines.
    *   Hairline date separator dividers ("Today", "Yesterday", etc.).
    *   Interactive life area badges with 1-tap dropdown menu for direct category reassignment.
    *   Rendered markdown body with embeds and inline interactive `- [ ]` checkboxes with strike-through feedback.
    *   Action menu: Edit in-place (`✏️`), Delete (`🗑️`), and dedicated `Select` mode for multi-note merge.
5.  **Performance Optimization**: Progressive 25-item lazy loading via `IntersectionObserver` with in-memory Markdown DOM cache.

---

## 4. Mobile Viewport & Search Architecture
*   **Visual Viewport Listener**: `attachMobileSheetViewportBehavior` dynamically tracks `window.visualViewport` to compute keyboard height `--diwa-kb-h` and toggle `.has-mobile-keyboard` on `DesktopHubView.contentEl`.
*   **Keyboard Offset Containment**: `.diwa-workspace-root.has-mobile-keyboard` constrains height to `calc(100% - var(--diwa-kb-h, 0px))` so content remains accessible while keyboard is open.
*   **Search Stream Precedence**: Keyword search in `getFilteredCaptures()` takes global precedence across all notes, bypassing category/life-area filters. Opening mobile search auto-resets filter to `'all'` and triggers immediate re-render.
*   **Progressive Dynamic Height**: Uses `@supports (height: 100dvh)` fallback for dynamic viewport scaling on modern iOS.

