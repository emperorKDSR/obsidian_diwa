const fs = require('fs');
let code = fs.readFileSync('src/views/DesktopTaskPane.ts', 'utf8');

// 1. Add data-ignore-swipe to TaskItemView
code = code.replace(
    "this.rootEl.setAttr('data-interaction-mode', this.interactionMode);",
    "this.rootEl.setAttr('data-interaction-mode', this.interactionMode);\n        this.rootEl.setAttr('data-ignore-swipe', 'true');\n        if (this.interactionMode === 'phone') {\n            this.setupSwipeGestures();\n        }"
);

// 2. Add setupSwipeGestures method inside TaskItemView
const methodCode = `
    private setupSwipeGestures(): void {
        let touchStartX = 0;
        let touchStartY = 0;
        let touchEndX = 0;
        let touchEndY = 0;

        this.rootEl.addEventListener('touchstart', (e: TouchEvent) => {
            touchStartX = e.changedTouches[0].screenX;
            touchStartY = e.changedTouches[0].screenY;
        }, { passive: true });

        this.rootEl.addEventListener('touchend', (e: TouchEvent) => {
            touchEndX = e.changedTouches[0].screenX;
            touchEndY = e.changedTouches[0].screenY;
            this.handleSwipeGesture(touchStartX, touchStartY, touchEndX, touchEndY);
        }, { passive: true });
    }

    private handleSwipeGesture(startX: number, startY: number, endX: number, endY: number): void {
        const deltaX = endX - startX;
        const deltaY = endY - startY;
        if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY)) {
            if (deltaX > 0) {
                // Swipe Right -> Done
                void this.handleToggle();
            } else {
                // Swipe Left -> Archive/Delete (or demote)
                void this.runTaskAction(() => this.controller.demoteTask(getTaskKey(this.currentTask)));
            }
        }
    }
`;

// Insert the method just before "update(task: TaskEntry): void {"
code = code.replace(
    "update(task: TaskEntry): void {",
    methodCode + "\n    update(task: TaskEntry): void {"
);

fs.writeFileSync('src/views/DesktopTaskPane.ts', code);
console.log('Applied swipe gestures to DesktopTaskPane.ts');
