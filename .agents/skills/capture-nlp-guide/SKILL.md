---
name: capture-nlp-guide
description: Runbook for configuring autocomplete triggers, text suggest modals, and natural-language date triggers.
---

# NLP & Autocomplete Capture Guide

This skill guides you on how to extend and troubleshoot DIWA’s inline capture and autocomplete utilities.

## 1. Smart Triggers Configuration
Autocomplete triggers are registered in [`src/utils.ts`](file:///Users/K26/Development/diwa/src/utils.ts) in the `attachInlineTriggers(...)` function.

### Standard Triggers
*   **NLP Dates (`@word `)**: Listens for `@` followed by alphanumeric letters. On pressing space, it:
    1. Extracts the string (e.g. `tomorrow`).
    2. Runs `parseNaturalDate(word)` via `chrono-node`.
    3. If valid, replaces the word with a wiki link `[[YYYY-MM-DD]]` and updates the due date of the active entry.
*   **Contexts (`#`)**: On typing `#`, opens the `ContextSuggestModal` displaying available contexts from settings (`settings.contexts`).
*   **People (`/`)**: Opens `PersonSuggestModal` to select or create a profile note under `peopleFolder`.
*   **Notes (`[[`)**: Opens `FileSuggestModal` to look up existing vault markdown files.
*   **Checkbox Conversion (`+` at line start)**: Instantly swaps `+ ` for `- [ ] ` to facilitate fast task adding.

---

## 2. Extending Autocomplete Modals
To add a new inline trigger:
1.  **Register a Trigger Key**: In `attachInlineTriggers(...)`, add an event handler checking `e.key`.
2.  **Define a Custom SuggestModal**: Subclass `SuggestModal<T>` to fetch choices and output selections.
3.  **Insert Selection**: Calculate cursor position, replace trigger symbol, and refocus the editor viewport.

Example for adding a priority trigger (`!`):
```typescript
if (e.key === '!') {
    e.preventDefault();
    const modal = new PrioritySuggestModal(this.app, (priority) => {
        // replace trigger with selection
        this.insertTextAtCursor(`!${priority}`);
    });
    modal.open();
}
```

---

## 3. NLP Date Parser Details
DIWA relies on `chrono-node` for natural-language parsing in `src/utils.ts#parseNaturalDate`:
```typescript
import * as chrono from 'chrono-node';

export function parseNaturalDate(text: string): string | null {
    const results = chrono.parse(text);
    if (results && results.length > 0) {
        const date = results[0].start.date();
        return moment(date).format('YYYY-MM-DD');
    }
    return null;
}
```
*   Ensure that any modifications to task dates are formatted in `YYYY-MM-DD` and updated in the vault files.
*   Always test input boundaries (e.g. multi-word strings like "next monday morning" vs. single words "today") when modifying parsing logic.
