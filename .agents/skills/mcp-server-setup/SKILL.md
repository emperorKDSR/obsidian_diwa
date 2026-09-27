---
name: mcp-server-setup
description: Runbook for configuring a local Model Context Protocol (MCP) server exposing vault resources, prompts, and search tools.
---

# Model Context Protocol (MCP) Server Setup Guide

Use this skill when developing the backend server to expose the vault index to external LLM clients (like Claude Desktop).

## 1. Project Dependencies
Expose the server using the official MCP SDK:
*   **TypeScript/Node**: Install `@modelcontextprotocol/sdk`.
*   **Python**: Install `mcp`.

---

## 2. Exposing Resources & Tools
The MCP protocol defines distinct schema protocols:

### A. Tools (Executable Operations)
Expose tools to let the LLM execute searches on the vault:
1.  `search_notes(query: string, limit?: number)`: Performs vector similarity search over chunks.
2.  `filter_by_context(context: string)`: Retrieves notes containing a specific context tag.
3.  `read_note(path: string)`: Returns the complete, raw markdown file contents.

Example tool definition (TypeScript):
```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const server = new Server({ name: "diwa-vault", version: "1.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "search_notes",
      description: "Search notes inside the Obsidian vault using vector similarity.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query" },
          limit: { type: "number", description: "Max results" }
        },
        required: ["query"]
      }
    }
  ]
}));
```

### B. Resources (Static Data Feeds)
Expose vault elements as resources so the LLM knows what is available:
*   `diwa://vault/active-tasks`: Exposes lists of open Gawa tasks.
*   `diwa://vault/weekly-review`: Exposes the latest weekly review summary.

---

## 3. Communication Protocols
*   **Stdio Transport (Recommended)**: The easiest way to connect to local tools (like Claude Desktop) is through standard input/output. The host launches your server as a child process and communicates via JSON-RPC.
*   **SSE Transport**: For web applications, run a server over Server-Sent Events (SSE) / HTTP.
