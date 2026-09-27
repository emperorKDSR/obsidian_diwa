---
name: rag-best-practices
description: Core methodologies for document chunking, overlap sizes, embeddings, and metadata indexing for Obsidian vaults.
---

# RAG Best Practices for Obsidian Vaults

Use this skill when designing the chunking, embedding, and indexing logic for your local notes database.

## 1. Markdown-Aware Chunking
Standard character-limit splitters (e.g. splitting every 500 characters) cut off paragraphs and lose visual context. For Markdown files:
*   **Header-based Split**: Split text by level 2 and level 3 markdown headers (`##`, `###`). Each section is treated as a chunk.
*   **Fallback Limit**: If a section is very long, split it by paragraph (`\n\n`) up to a target size (e.g., 512 tokens or ~2000 characters).
*   **Overlap**: Maintain a 10% to 20% overlap (e.g., 50-100 tokens) between consecutive chunks to preserve context across splits.

---

## 2. Metadata Extraction & Hybrid Search
LLMs need structural context. Extract frontmatter fields and append them as searchable tags:
*   **Tags and Contexts**: Parse YAML `context` and `tags` lists. They are critical for keyword filtering (e.g., restricting vector searches to `#work` notes).
*   **Temporal Context**: Map dates (`created`, `modified`, `day`). This enables querying tasks by time periods (e.g., "What was I working on last week?").
*   **Parent-Child Linkage**: If a note is a project task (containing `taskId` and `parentId`), index the parent project details alongside the task chunk.

---

## 3. Embedding Selection
*   **Local Models**: Use lightweight models (such as `all-MiniLM-L6-v2` or `bge-small-en-v1.5`) via ONNX Runtime or standard transformers. This allows offline embedding generation on mid-tier hardware.
*   **Cloud Models**: Allow optional cloud model endpoints (Vertex AI Embeddings or OpenAI `text-embedding-3-small`) via environment configuration for users with lower CPU resources.
