interface MobileSheetViewportOptions {
    sheetEl: HTMLElement;
    scrollEl?: HTMLElement | null;
    keyboardVarName?: string;
    keyboardThreshold?: number;
}

const INPUT_SELECTOR = 'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), [contenteditable="true"]';

export function attachMobileSheetViewportBehavior({
    sheetEl,
    scrollEl = sheetEl,
    keyboardVarName = '--diwa-kb-h',
    keyboardThreshold = 72,
}: MobileSheetViewportOptions): () => void {
    const win = sheetEl.ownerDocument.defaultView;
    if (!win) return () => {};

    const viewport = win.visualViewport;
    let frameId: number | null = null;
    const timeoutIds = new Set<number>();

    const clearPendingScroll = () => {
        if (frameId !== null) {
            win.cancelAnimationFrame(frameId);
            frameId = null;
        }
        timeoutIds.forEach((timeoutId) => win.clearTimeout(timeoutId));
        timeoutIds.clear();
    };

    const shouldScrollTarget = (target: HTMLElement): boolean => {
        if (target.matches(INPUT_SELECTOR)) return true;
        return !!scrollEl?.contains(target);
    };

    const scrollTargetIntoView = (target?: EventTarget | null) => {
        const element = target instanceof win.HTMLElement ? target : null;
        if (!element || !sheetEl.contains(element) || !shouldScrollTarget(element)) return;
        element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };

    const scheduleScrollIntoView = (target?: EventTarget | null) => {
        clearPendingScroll();
        const run = () => scrollTargetIntoView(target ?? win.document.activeElement);
        frameId = win.requestAnimationFrame(run);
        [120, 280].forEach((delay) => {
            const timeoutId = win.setTimeout(run, delay);
            timeoutIds.add(timeoutId);
        });
    };

    const syncKeyboardOffset = () => {
        let keyboardHeight = 0;
        if (viewport) {
            keyboardHeight = Math.max(
                0,
                Math.round(win.innerHeight - (viewport.height + viewport.offsetTop)),
            );
        }
        if (keyboardHeight < keyboardThreshold) keyboardHeight = 0;
        sheetEl.style.setProperty(keyboardVarName, `${keyboardHeight}px`);
        sheetEl.toggleClass('has-mobile-keyboard', keyboardHeight > 0);
        if (keyboardHeight > 0) scheduleScrollIntoView();
    };

    const handleFocusIn = (event: FocusEvent) => {
        scheduleScrollIntoView(event.target);
    };

    const handleViewportChange = () => {
        syncKeyboardOffset();
    };

    sheetEl.addEventListener('focusin', handleFocusIn, true);
    win.addEventListener('resize', handleViewportChange);
    viewport?.addEventListener('resize', handleViewportChange);
    viewport?.addEventListener('scroll', handleViewportChange);

    syncKeyboardOffset();

    return () => {
        clearPendingScroll();
        sheetEl.removeEventListener('focusin', handleFocusIn, true);
        win.removeEventListener('resize', handleViewportChange);
        viewport?.removeEventListener('resize', handleViewportChange);
        viewport?.removeEventListener('scroll', handleViewportChange);
        sheetEl.style.removeProperty(keyboardVarName);
        sheetEl.removeClass('has-mobile-keyboard');
    };
}
