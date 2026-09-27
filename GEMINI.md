# Workspace Rules: DIWA — Personal OS Plugin

This workspace contains the code for the **DIWA** Obsidian plugin, which serves as a Personal OS for users.

## 1. Project Memory Bank
We use the **Memory Bank** pattern to maintain project continuity across stateless AI sessions. All agents operating in this workspace must respect and update the files in the `memory-bank/` directory:
*   [projectbrief.md](file:///Users/K26/Development/diwa/memory-bank/projectbrief.md): Core vision, goals, and scope boundaries.
*   [productContext.md](file:///Users/K26/Development/diwa/memory-bank/productContext.md): User personas, workflows, and design philosophies.
*   [systemPatterns.md](file:///Users/K26/Development/diwa/memory-bank/systemPatterns.md): Technical architecture, decisions, and patterns.
*   [activeContext.md](file:///Users/K26/Development/diwa/memory-bank/activeContext.md): Current focus, recent changes, and next steps.
*   [progress.md](file:///Users/K26/Development/diwa/memory-bank/progress.md): Implementation checklist and status.

### The Developer Protocol
1.  **Boot Phase**: Before writing any code or proposing solutions, read the relevant memory bank files (especially `activeContext.md` and `progress.md`) to align with the current project state.
2.  **Planning Phase**: **CRITICAL**: Always draft a detailed design/implementation plan first and ask for the user's explicit approval of the plan *before* writing code, building, or deploying.
3.  **Execution Phase**: Write clean, modern TypeScript/CSS, using namespaced classes (`pos-`) and Obsidian API patterns.
4.  **Update Phase**: After making changes or completing tasks, update `activeContext.md` and `progress.md`. If architectural changes were made, update `systemPatterns.md`.

## 2. Workspace Agent
*   The custom workspace agent **`system_consultant`** is defined at [.agents/agents/system_consultant/agent.md](file:///Users/K26/Development/diwa/.agents/agents/system_consultant/agent.md).
*   Use this agent to consult on overall architecture, plan complex refactors, and coordinate sub-tasks.
