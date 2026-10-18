import test from 'node:test';
import assert from 'node:assert';
import { CaptureService } from '../src/services/CaptureService';
import { DEFAULT_SETTINGS } from '../src/constants';
import { TFile } from 'obsidian';

test('toggleTaskInFile only completes the target subtask, leaving parent task and sibling subtasks open', async () => {
    let fileContent = `---
created: 2026-10-18T10:00:00
---

- [ ] Core Project Milestone
    - [ ] Subtask step 1
    - [ ] Subtask step 2
    - [ ] Subtask step 3
`;

    const mockFile = new TFile('000 Bin/Diwa/2026/10/note.md');
    const mockApp: any = {
        vault: {
            getAbstractFileByPath: (p: string) => (p === mockFile.path ? mockFile : null),
            process: async (f: any, fn: (content: string) => string) => {
                fileContent = fn(fileContent);
                return fileContent;
            }
        }
    };

    const service = new CaptureService(mockApp, { ...DEFAULT_SETTINGS });

    // 1. Toggle "Subtask step 2" to completed
    await service.toggleTaskInFile(
        mockFile.path,
        -1,
        true,
        'Subtask step 2',
        undefined,
        { isSubtask: true, parentTitle: 'Core Project Milestone' }
    );

    // Parent task must remain OPEN
    assert.match(fileContent, /^- \[ \] Core Project Milestone/m);

    // Subtask 1 must remain OPEN
    assert.match(fileContent, /^\s+- \[ \] Subtask step 1/m);

    // Subtask 2 must be COMPLETED
    assert.match(fileContent, /^\s+- \[x\] Subtask step 2/m);

    // Subtask 3 must remain OPEN (no cascading to subsequent siblings)
    assert.match(fileContent, /^\s+- \[ \] Subtask step 3/m);
});

test('toggleTaskInFile with parent completion checks off child subtasks', async () => {
    let fileContent = `---
created: 2026-10-18T10:00:00
---

- [ ] Core Project Milestone
    - [ ] Subtask step 1
    - [x] Subtask step 2
    - [ ] Subtask step 3
- [ ] Another Task
    - [ ] Another Subtask
`;

    const mockFile = new TFile('000 Bin/Diwa/2026/10/note.md');
    const mockApp: any = {
        vault: {
            getAbstractFileByPath: (p: string) => (p === mockFile.path ? mockFile : null),
            process: async (f: any, fn: (content: string) => string) => {
                fileContent = fn(fileContent);
                return fileContent;
            }
        }
    };

    const service = new CaptureService(mockApp, { ...DEFAULT_SETTINGS });

    // Complete the parent task
    await service.toggleTaskInFile(
        mockFile.path,
        4, // line index of "Core Project Milestone"
        true,
        'Core Project Milestone'
    );

    // Parent task is completed
    assert.match(fileContent, /^- \[x\] Core Project Milestone/m);

    // All children of "Core Project Milestone" are now completed
    assert.match(fileContent, /^\s+- \[x\] Subtask step 1/m);
    assert.match(fileContent, /^\s+- \[x\] Subtask step 2/m);
    assert.match(fileContent, /^\s+- \[x\] Subtask step 3/m);

    // "Another Task" and its subtask are untouched
    assert.match(fileContent, /^- \[ \] Another Task/m);
    assert.match(fileContent, /^\s+- \[ \] Another Subtask/m);
});
