---
name: styling-rules
description: Standards for adding CSS classes, namespacing UI widgets, and styling responsive elements in styles.css.
---

# Styling Guidelines

Use this skill when modifying the user interface layout, typography, or color declarations.

## 1. Class Namespacing
To avoid conflicts with Obsidian core sheets or other community themes:
*   Always prefix custom element classes with `pos-` (Personal OS) or `diwa-` (e.g. `.pos-dashboard-grid`, `.diwa-task-row`).
*   Avoid naked selectors like `button`, `input`, `textarea`, or generic classes like `.title`, `.active`, `.hidden`. Wrap them within their parent component container (e.g. `.pos-sidebar .active`).

---

## 2. obsidian Theme Variables
Never hardcode light/dark hex colors. Always reference Obsidian's CSS custom properties:
*   **Backgrounds**:
    *   `--background-primary`: Main background.
    *   `--background-secondary`: Sidebars and card accents.
*   **Text colors**:
    *   `--text-normal`: Normal copy.
    *   `--text-muted`: Dimmed text.
*   **Accents**:
    *   `--interactive-accent`: Active highlight colors (inherits user's accent setting).
*   **Borders**:
    *   `--border-color`: Fine lines between sections.

Example pattern:
```css
.pos-task-card {
    background-color: var(--background-secondary);
    border: 1px solid var(--border-color);
    color: var(--text-normal);
}
.pos-task-card:hover {
    border-color: var(--interactive-accent);
}
```

---

## 3. Responsive Breakpoints
Ensure layout adjustments are tested for multiple viewports:
*   **Desktop**: Width >= 1025px. Use sidebars and three-column grids.
*   **Tablet**: Width between 769px and 1024px. Use dense layout grids.
*   **Mobile**: Width <= 768px. Stack components vertically and utilize bottom-navigation shell styles.

Check stylesheet declarations in [`styles.css`](file:///Users/K26/Development/diwa/styles.css) for existing `@media` blocks.
