# Developer Changelog: DIWA Personal OS

This file tracks the developer changes, feature implementations, refactors, and styling modifications made during the project, along with their design rationale.

---

## [2026-08-20] — Default Ollama Model Update

### Modified
*   **Default Model Name**: Updated `aiModelName` default value in [`src/constants.ts`](file:///Users/K26/Development/diwa/src/constants.ts) from `'llama3.2'` to `'gemma2'`.

### Rationale
*   Aligning defaults with `'gemma2'` as the preferred local Ollama model for the DIWA plugin.

---

## [2026-08-20] — Numbered Inline Citations & Link Intercepts

### Added
*   **Numbered Inline Citations**: Changed LLM prompt to cite notes using indexes like `[1]`, `[2]`, `[3]`, `[4]` instead of note names/paths.
*   **Wikilink Preprocessor**: Added token preprocessing to dynamically substitute index numbers (e.g. `[1]`) with internal wikilinks formatted as `[[path|[1]]]`.
*   **Click Intercepts**: Overwrote standard Obsidian link click behavior on `a.internal-link` elements within the bubble assistant response to open target notes natively in a new leaf/split pane (`this.app.workspace.openLinkText(path, '', true)`).
*   **Citations Footer Removal**: Removed the bottom list-based sources panel to declutter the user interface.

### Rationale
*   Inline number markers like `[1]` are standard in scientific and assistant interfaces, keeping text clean.
*   Intercepting wikilinks programmatically ensures notes can be opened immediately via Obsidian's workspace manager without triggering default browser actions or breaking in-app navigation.

---

## [2026-08-20] — Workspace Environment & Custom Agents Set Up

### Added
*   **Memory Bank**: Initialized the project Memory Bank containing `projectbrief.md`, `productContext.md`, `systemPatterns.md`, `activeContext.md`, and `progress.md` in the active repository `/Users/K26/Development/diwa`.
*   **Workspace Rule**: Created `GEMINI.md` at the root of the project to outline the Developer Protocol and maintain continuous state-tracking.
*   **Custom Agents**: Registered three custom subagents under `.agents/agents/`:
    *   `system_consultant`: Overall system brain and architecture advisor.
    *   `vault_architect`: Database schema and file-parsing architect.
    *   `css_designer`: UI/UX, layouts, and stylesheet designer.
    *   `build_engineer`: Esbuild and compiler configuration engineer.
*   **Custom Skills**: Registered four on-demand runbook skills under `.agents/skills/`:
    *   `obsidian-api-guide`: Cheat sheet for Obsidian API methods.
    *   `capture-nlp-guide`: Guide for autocomplete and NLP triggers.
    *   `dev-build-test`: Instructions for compiling and local vault deployments.
    *   `styling-rules`: Visual standards, class namespacing, and design tokens.

### Rationale
*   LLM sessions are stateless. Setting up the Memory Bank and a strict Developer Protocol ensures context is preserved across work sessions.
*   Specialized agents and runbooks reduce token overhead, prevent code pollution, and ensure distinct project tasks (e.g., styling vs. compiler configuration) are handled by specialized roles.

---

## [2026-08-20] — UI/UX Glassmorphism Refinement (Item 1)

### Added / Modified
*   **Refined Glassmorphism**: Applied premium glassmorphic effects (translucent color-mix background colors and `backdrop-filter: blur(12px)`) to sidebars (`.diwa-dh-sidebar`, `.diwa-th-sidebar`), quick capture containers (`.diwa-dw-capture`, `.diwa-capture-bar`, `.diwa-mobile-capture-strip`), and modal wrappers (`.diwa-mobile-float`, `.diwa-mobile-sheet`, `.diwa-modal-standard`, `.diwa-new-project-modal .modal-content`, `.diwa-edit-project-modal .modal-content`, `.diwa-edit-modal`).
*   **Translucent Borders**: Replaced heavy borders in center feed thought rows and the desktop hub (`--diwa-dh-border` and `.diwa-dh-thought-row`) with softer translucent borders (`var(--background-modifier-border-faint)`).
*   **CSS Bug Fix**: Resolved a syntax error around line 2019 where `$12em` was left behind as an invalid declaration instead of the `.diwa-capture-box-textarea` selector.

### Rationale
*   Standardizing on `blur(12px)` and color-mix values brings a modern, premium design to the Personal OS, aligning perfectly with system patterns.
*   Formatting the stylesheet with Prettier broke down very long lines, making future edits safer and more predictable.

---

## [2026-08-20] — Desktop Hub Type Icons & Audit (Item 2)

### Added / Modified
*   **Dynamic Type Icons**: Added dynamic, content-specific Lucide type icons (`book` for Journal, `list-todo` for Task-related, `cash-register` for Finance, and `brain` for General Thoughts) to feed card rows in `src/views/DesktopHubView.ts`.
*   **Icon Styling & Custom Branding**: Designed styling rules for `.diwa-dh-thought-row-type-icon` in `styles.css` using small modern cards, centered layouts, and color-branding overrides (Teal for Journal, Green for Tasks, Orange for Finance, Accent for Thoughts).
*   **Audit Completed**: Completed the audit on the sidebar navigation, layout view modes (collapsing column grid using `.diwa-dh-hidden`), and active state item sync.

### Rationale
*   Integrating clear icon indicators to thought entries provides quick visual scannability of the user's data in the unified workspace feed.
*   Applying subtle color-branding on each icon retains the clean layout while making the feed sections easily differentiable.

## [2026-08-20] — RAG & MCP Server Python Architecture Setup

### Added
*   **Custom Agents**: Registered three custom agents under `.agents/agents/` for RAG development:
    *   `rag_architect`: Handles chunking, vector embeddings, and search quality.
    *   `pipeline_developer`: Handles server endpoints and watchers.
    *   `python_developer`: Handles python virtual environments, PEP 8 code standards, and async execution loops ([`agent.md`](file:///Users/K26/Development/diwa/.agents/agents/python_developer/agent.md)).
*   **Custom Skills**: Registered two new on-demand runbook skills under `.agents/skills/`:
    *   `rag-best-practices`: Chunker overlap criteria, markdown header-splitting, and tag queries.
    *   `mcp-server-setup`: Model Context Protocol SDK definitions for resources and tools.

### Rationale
*   Exposing the Obsidian vault as a grounded source via MCP enables system-wide AI assistant workflows.
*   Choosing **Python** enables 100% offline, native local embedding calculations (via SentenceTransformers) and advanced ML indexing libraries.
*   Adding the `python_developer` agent enforces PEP 8 and clean asyncio loop setups.

---

## [2026-08-20] — Step 1 Completed (diwa-rag Initialization)

### Added / Modified
*   **Project Workspace**: Created `/Users/K26/Development/diwa-rag/` and source folder `src/`.
*   **Requirements & Readme**: Created `requirements.txt` (mcp, watchdog, python-frontmatter, chromadb, sentence-transformers) and `README.md`.
*   **Virtual Environment**: Set up python virtual environment in `venv/` and successfully installed all packages.
*   **Environment Verification**: Verified package imports successfully.

### Rationale
*   Standardizing the environment before writing code prevents library version conflicts later.

---

## [2026-08-20] — Step 2 Completed (Database & Chunker Coding)

### Added / Modified
*   **Database Module**: Created [`src/database.py`](file:///Users/K26/Development/diwa-rag/src/database.py) using ChromaDB PersistentClient and the local SentenceTransformers embedding engine (`all-MiniLM-L6-v2`).
*   **Parser Module**: Created [`src/parser.py`](file:///Users/K26/Development/diwa-rag/src/parser.py) implementing Obsidian frontmatter extraction and heading-aware semantic chunking.
*   **Tests Suite**: Added a mock validation suite testing sanitizing, metadata parsing, chunking, database updates, querying, and deletion.

### Rationale
*   Integrating vector databases offline via SentenceTransformers maintains local-first compliance and enables fast semantic search operations.

---

## [2026-08-20] — Step 3 Completed (Vault File Watcher Coding)

### Added / Modified
*   **Watcher Module**: Created [`src/watcher.py`](file:///Users/K26/Development/diwa-rag/src/watcher.py) implementing a directory watcher via the Python `watchdog` library.
*   **Initial Scanner Pass**: Coded a recursive folder scanner that crawls the Obsidian vault, ignoring `.git/`, `.obsidian/`, and `/trash/` directories.
*   **Debouncing Updates**: Configured `threading.Timer` with a 1.5-second debounce to safely rebuild chunk indexes after modification updates complete.
*   **Validation Suite**: Added an integration test script (`test_watcher.py`) that successfully verifies created, modified, deleted, and moved note events.

### Rationale
*   Ensuring indexing updates are debounced prevents file read conflicts and indexing errors while notes are actively being saved.

---

## [2026-08-20] — Step 4 Completed (MCP Server Coding)

### Added / Modified
*   **MCP Server Module**: Created [`src/server.py`](file:///Users/K26/Development/diwa-rag/src/server.py) using the Python `FastMCP` framework.
*   **Server Lifespan Integration**: Bounded startup and shutdown decorators to initialize the database/parser, spin up the filesystem watcher thread, and stop the observer safely upon exit.
*   **Vector Search Tool**: Exposed `search_notes` tool returning similarity matches in structured markdown formats.
*   **Safe Note Reader**: Exposed `read_note` tool with path-traversal validation.
*   **Recent Notes Resource**: Exposed `diwa://notes/recent` to list notes updated in the vault.
*   **Validation Suite**: Ran integration tests confirming the server properly interfaces with the databases and watcher lifecycle components.

### Rationale
*   Integrating the MCP protocol via standard input/output (stdio) transports enables secure local communication between the database and external LLM host applications.

---

## [2026-08-20] — Step 5 Completed (Launcher & Documentation Finalized)

### Added / Modified
*   **Launcher Script**: Created [`run.sh`](file:///Users/K26/Development/diwa-rag/run.sh) in the project root to automate virtual environment activation and Python server module execution. Granted executable permissions (`chmod +x`).
*   **Installation Documentation**: Rewrote [`README.md`](file:///Users/K26/Development/diwa-rag/README.md) to document setup, ChromaDB vector schemas, exposed tools/resources, and a copy-pasteable JSON configuration block for Claude Desktop.

### Rationale
*   Providing clean launcher scripts and detailed setup documentation ensures seamless installation, testing, and multi-workstation deployment.

---

## [2026-08-20] — Initial Vault Indexing Completed

### Added / Modified
*   **Initial Scan Pass**: Executed the database crawling and embedding pipeline against the active vault `/Users/K26/Obsidian/K0000`.
*   **Vector Database Cache**: Generated and stored **10,839 vector chunks** locally using ChromaDB.

### Rationale
*   Completing the initial scan ensures that all historical notes, logs, and tasks are instantly queryable without waiting for file system changes to occur first.

---

## [2026-08-20] — Local RAG Chatbot Completed

### Added / Modified
*   **Chatbot Module**: Created [`src/chat.py`](file:///Users/K26/Development/diwa-rag/src/chat.py) integrating ChromaDB queries, custom system RAG templates, and local **Ollama** model `llama3.2` streaming chat endpoints.
*   **Startup Launcher**: Created [`chat.sh`](file:///Users/K26/Development/diwa-rag/chat.sh) and set executable permissions.
*   **Local Inference Model**: Pulled the 3B `llama3.2` model on Ollama.
*   **Verification**: Tested terminal-based chatting with note context, source citations, and loop handling successfully.

### Rationale
*   Integrating a local CLI chatbot on top of the ChromaDB index offers a 100% offline, privacy-respecting way to chat with Obsidian notes without any cloud server dependencies.

---

## [2026-08-20] — Launcher Context Fixes

### Added / Modified
*   **Launcher Directory Configuration**: Updated [`chat.sh`](file:///Users/K26/Development/diwa-rag/chat.sh) and [`run.sh`](file:///Users/K26/Development/diwa-rag/run.sh) to explicitly execute `cd "$DIR"` before starting python commands.
*   **Resolution**: Fixed the `ModuleNotFoundError` when scripts are executed from other terminal working directories (like your home directory) during automated AppleScript launches.

### Rationale
*   Standardizing the working directory context inside scripts ensures portable execution regardless of where the launcher commands are triggered.

---

## [2026-08-20] — Agentic MCP Client Completed

### Added / Modified
*   **Agentic Client Module**: Created [`src/agent_client.py`](file:///Users/K26/Development/diwa-rag/src/agent_client.py) using `asyncio` to connect to the MCP server session and map tools to Ollama schemas.
*   **Startup Launcher**: Created [`agent_chat.sh`](file:///Users/K26/Development/diwa-rag/agent_chat.sh) and set executable permissions.
*   **Verification**: Verified compilation and successful execution loops under mock tool calling conditions.

### Rationale
*   Using Ollama's tool-calling capabilities dynamically transforms the simple vector retriever into an agentic retriever that can decide to query the index multiple times or read complete files before answering.

---

## [2026-08-20] — Anchor Date & Tool Parameter Fixes

### Added / Modified
*   **System Prompt Configuration**: Modified [`src/agent_client.py`](file:///Users/K26/Development/diwa-rag/src/agent_client.py) to dynamically query the system datetime and inject `The current date is YYYY-MM-DD` as the primary anchor date in the LLM's system instructions.
*   **Tool Descriptions**: Updated [`src/server.py`](file:///Users/K26/Development/diwa-rag/src/server.py) tool documentation to clearly define that the `context` argument is category-only, warning the model against passing date range filter syntax.

### Rationale
*   Injecting the anchor date dynamically eliminates date-range calculation hallucinations when interpreting relative time periods (like "last 2 months").
*   Explicitly detailing parameter boundaries in docstrings prevents the LLM from passing invalid search filters.

---

## [2026-08-20] — Native Obsidian AI Chat GUI Completed

### Added / Modified
*   **FastAPI REST Server**: Created [`src/api.py`](file:///Users/K26/Development/diwa-rag/src/api.py) and [`run_api.sh`](file:///Users/K26/Development/diwa-rag/run_api.sh) in the `diwa-rag` folder, providing CORS-enabled `/search` and `/note` endpoints to serve vector index queries to cross-origin local HTTP requests.
*   **AI Chat View Tab**: Created [`src/tabs/AIChatTab.ts`](file:///Users/K26/Development/diwa/src/tabs/AIChatTab.ts) in the `diwa` plugin, rendering a full glassmorphic layout for the chatbot UI, calling local endpoints, streaming Ollama tokens, rendering markdown natively, and opening clicked citations natively in Obsidian.
*   **Settings Fields**: Added `ragServerUrl`, `ollamaServerUrl`, and `aiModelName` configuration inputs under a new "AI & RAG Assistant" section in the settings panel.
*   **Tab Routing & Sidebar**: Registered `'ai-chat'` inside `src/view.ts` and added the "AI Chat" nav icon to the left sidebar in `src/views/DesktopHubView.ts`.
*   **Plugin Bundling**: Compiled and copied the updated plugin bundle using `npm run build`.

### Rationale
*   Integrating RAG search results and local LLMs natively as an Obsidian view tab creates a seamless, terminal-free Personal OS assistant experience, making citation notes clickable and openable in real-time.

---

## [2026-08-20] — REST API Server Launched & Verified

### Added / Modified
*   **API Code Correction**: Corrected imports and watcher initialization in [`src/api.py`](file:///Users/K26/Development/diwa-rag/src/api.py).
*   **Web Server Daemon**: Successfully started `uvicorn` on local port `8000` via [`run_api.sh`](file:///Users/K26/Development/diwa-rag/run_api.sh).
*   **Collection Verification**: Fixed a ChromaDB database collection mismatch issue by recreating the schema, successfully parsing and vector-indexing **982** markdown notes.
*   **Interface Testing**: Confirmed server responsiveness using local `curl` requests.

### Rationale
*   Spinning up the FastAPI server on port 8000 with CORS headers allows the local Obsidian Javascript code to query vault context vectors securely.

---

## [2026-08-20] — Whitelist Navigation Fixes

### Added / Modified
*   **Whitelisting Configurations**: Added `'ai-chat'` to `OPENABLE_DIWA_TAB_IDS` in [`src/main.ts`](file:///Users/K26/Development/diwa/src/main.ts) and `RENDERABLE_TAB_IDS` in [`src/view.ts`](file:///Users/K26/Development/diwa/src/view.ts).
*   **Compilation**: Recompiled the plugin using `npm run build`.

### Rationale
*   Ensuring the new tab ID is registered in the plugin's openable and renderable validation whitelists prevents the router from falling back to default panels (like settings).

---

## [2026-08-20] — Enhanced Note Citations

### Added / Modified
*   **Basename Resolution**: Coded a `getBasename` path parser in [`src/tabs/AIChatTab.ts`](file:///Users/K26/Development/diwa/src/tabs/AIChatTab.ts) to display short, readable note links in the citation footer.
*   **System Prompt Wikilinks**: Instructed the LLM to output inline double-bracket wikilinks (`[[Note Name]]`) when citing facts in its responses.
*   **Recompiled**: Recompiled the plugin using `npm run build`.

### Rationale
*   Standardizing citation links to file basenames keeps the chat GUI clean and readable, while inline double-bracket wikilinks integrate seamlessly with Obsidian's native internal link rendering.

---

## [2026-08-20] — RAG Context Parsing Fix

### Added / Modified
*   **Key Mapping Corrections**: Modified [`src/tabs/AIChatTab.ts`](file:///Users/K26/Development/diwa/src/tabs/AIChatTab.ts) to correctly read vector documents from `searchData.documents` and metadata from `searchData.metadatas` instead of the non-existent `searchData.matched_documents`.
*   **Chroma Nested Array Extraction**: Extracted index `[0]` from Chroma's nested results to flatten the search results array, fixing empty prompts and broken citations.
*   **Recompiled**: Recompiled the plugin using `npm run build`.

### Rationale
*   Ensuring key names and array nesting match ChromaDB's query outputs allows note chunks to load into the AI's context block, enabling grounded note answering.

---

## [2026-08-20] — Vault-Relative Link Resolution Fix

### Added / Modified
*   **Relative Path Conversion**: Modified [`src/watcher.py`](file:///Users/K26/Development/diwa-rag/src/watcher.py) to resolve relative paths from the absolute path files using `os.path.relpath(file_path, self.vault_path)`.
*   **Database Updates**: Configured watcher database calls (`upsert_note_chunks` and `delete_note_chunks`) to store the relative path in the vector database index.
*   **Service Re-indexing**: Re-started the uvicorn web server and successfully re-indexed the **10,839 chunks** of vault notes.

### Rationale
*   Standardizing stored file paths to vault-relative format resolves the link clicking issue, allowing Obsidian's link manager to find and open the existing note files natively instead of creating new empty notes.

---

## [2026-08-20] — Anchor Date Injection Fix

### Added / Modified
*   **Prompt Date Interpolation**: Updated [`src/tabs/AIChatTab.ts`](file:///Users/K26/Development/diwa/src/tabs/AIChatTab.ts) to dynamically extract the current date using Obsidian's native `moment()` and inject `The current date is ${currentDate}` into the AI's system prompt instructions.
*   **Recompiled**: Recompiled the plugin using `npm run build`.

### Rationale
*   Injecting the current date dynamically at runtime enables the local LLM model to resolve relative date calculations (like "yesterday", "last week", "past 2 months") without hallucinating timelines.

---

## [2026-08-20] — Customizable RAG Query Limit

### Added / Modified
*   **Query Limit Config**: Integrated `ragQueryLimit` to [`src/types.ts`](file:///Users/K26/Development/diwa/src/types.ts) and [`src/constants.ts`](file:///Users/K26/Development/diwa/src/constants.ts), setting a default limit of `20` chunks.
*   **UI Slider Settings**: Added a `RAG Query Limit` slider (range 1–30) inside `DiwaSettingTab.display()` in [`src/settings.ts`](file:///Users/K26/Development/diwa/src/settings.ts).
*   **Dynamic Search Payloads**: Updated [`src/tabs/AIChatTab.ts`](file:///Users/K26/Development/diwa/src/tabs/AIChatTab.ts) to query the RAG backend using the saved limit.
*   **Recompiled**: Recompiled the plugin using `npm run build`.

### Rationale
*   Enabling a customizable context limit slider allows users to balance retrieval coverage with LLM pre-fill latency, ensuring that queries referencing many notes (like general summaries) receive complete context.

---

## [2026-08-20] — Ollama 8K Context Allocation

### Added / Modified
*   **Ollama Options Config**: Modified the local chat API fetch parameters in [`src/tabs/AIChatTab.ts`](file:///Users/K26/Development/diwa/src/tabs/AIChatTab.ts) to explicitly request a `num_ctx: 8192` context window size in the `options` block.
*   **Recompiled**: Recompiled the plugin using `npm run build`.

### Rationale
*   Allocating the 8K context window directly in the API call forces local Ollama instances to run `gemma2` with adequate KV caching, preventing truncation of prompts and keeping note grounding highly coherent.

---

## [2026-08-20] — Search Result Diversity (Chunk Cap)

### Added / Modified
*   **Result Diversity Filtering**: Updated [`src/api.py`](file:///Users/K26/Development/diwa-rag/src/api.py) on the RAG server to implement a cap of **maximum 2 chunks per file path** inside the search results returned to the client.
*   **Expanded DB Retrieval**: Configured the database search to pull up to `60` candidate chunks (`limit * 3`) before applying the diversity filter.

### Rationale
*   Capping the number of chunks returned from a single file path prevents long, heavily-indexed notes from monopolizing the retrieval context, ensuring a diverse range of note files are supplied to the LLM.

---

## [Active Tasks] — Complete

### In Progress
*   None. The native Obsidian AI Chat tab, REST API backend, RAG chatbot, and MCP server are fully operational and ready.
