---
name: obsidian-api-guide
description: A reference guide for Obsidian API interfaces, views, leaves, commands, and suggestion modals.
---

# Obsidian API Cheat Sheet

This skill serves as a concise, token-efficient reference for Obsidian APIs used within DIWA.

## 1. Views and Leaves (`ItemView`)
To register custom workspace views (e.g. `DiwaView`, `DesktopHubView`):
```typescript
import { ItemView, WorkspaceLeaf } from 'obsidian';

export class MyCustomView extends ItemView {
    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }
    getViewType(): string { return 'my-view-type'; }
    getDisplayText(): string { return 'My Custom View'; }
    getIcon(): string { return 'check-square'; }
    
    async onOpen() {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.createEl('h3', { text: 'Hello Custom View' });
    }
    async onClose() {}
}
```

## 2. Registering Views & Ribbons (`Plugin`)
Within `onload()` of `main.ts`:
```typescript
this.registerView('my-view-type', (leaf) => new MyCustomView(leaf));
this.addRibbonIcon('dice', 'Activate View', () => {
    this.app.workspace.getLeaf(true).setViewState({ type: 'my-view-type', active: true });
});
this.addCommand({
    id: 'open-my-view',
    name: 'Open My View',
    callback: () => { /* open leaf logic */ }
});
```

## 3. Suggestion Modals (`SuggestModal` & `FuzzySuggestModal`)
For autocompletes and pickers:
```typescript
import { SuggestModal, FuzzySuggestModal, App, TFile } from 'obsidian';

// 1. Text suggest modal
export class SimpleTextSuggester extends SuggestModal<string> {
    getSuggestions(query: string): string[] {
        return ['alpha', 'beta', 'gamma'].filter(item => item.includes(query));
    }
    renderSuggestion(value: string, el: HTMLElement) {
        el.setText(value);
    }
    onChooseSuggestion(value: string, evt: MouseEvent | KeyboardEvent) {
        console.log('Chose:', value);
    }
}

// 2. File fuzzy picker
export class FilePicker extends FuzzySuggestModal<TFile> {
    getItems(): TFile[] {
        return this.app.vault.getMarkdownFiles();
    }
    getItemText(item: TFile): string {
        return item.basename;
    }
    onChooseItem(item: TFile, evt: MouseEvent | KeyboardEvent) {
        console.log('Selected file:', item.path);
    }
}
```

## 4. Notifications (`Notice`)
Use for brief user feedback:
```typescript
import { Notice } from 'obsidian';
new Notice('Operation successful!');
new Notice('Error details', 5000); // 5 seconds duration
```
