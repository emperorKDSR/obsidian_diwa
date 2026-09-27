# Project Brief: DIWA — Personal OS for Obsidian

## Vision
**DIWA** is a premium, local-first, and privacy-respecting **Personal Operating System (OS)** plugin for Obsidian. It consolidates thoughts, tasks (gawa), financial ledgers (bulsa), weekly planning (review), and daily journaling into a single cohesive, cross-platform workspace.

## Core Modules & Features
1.  **Workspace**: Platform-specific shells.
    *   *Desktop*: Dedicated workspace window with sidebar navigation, central feed, and right-hand task pane.
    *   *Tablet*: Dense touch layout with top tabs and quick actions.
    *   *Mobile*: Bottom-navigation shell for Workspace, Review, Bulsa, Gawa, and thoughts.
2.  **Quick Capture**: Unified flow to capture thoughts and tasks with auto-complete categories (`#` contexts, `/` people, `[[` note links, and `@` dates).
3.  **Gawa (Tasks)**: Structured task manager (Open, Done, Waiting, Someday) supporting due dates, priority, energy, recurrence, and comments.
4.  **Bulsa (Finances)**: Recurring dues ledger backing up to files under the Bulsa folder, supporting payment logs, analytics/cashflow views (Bulsa Insights).
5.  **Review**: Weekly review and intent planners stored under `Reviews/Weekly/` to organize and reflect on week-by-week progress.
6.  **Journal**: Daily log composer and split archive view for desktop/mobile journaling.

## Scope & Boundaries
*   **Version**: `11.1.3`
*   **Excluded Modules**: Timeline, synthesis, voice, calendar, search, and core AI modules were deprecated/removed starting in the `11.1.x` line to keep the plugin light and highly performant.
*   **Local-first Markdown**: Storage remains human-readable Markdown files with YAML frontmatter.
