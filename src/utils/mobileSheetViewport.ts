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
        const rect = element.getBoundingClientRect();
        const visibleTop = viewport?.offsetTop ?? 0;
        const visibleBottom = viewport ? viewport.offsetTop + viewport.height : win.innerHeight;
        const margin = 16;
        const prevWinX = win.scrollX;
        const prevSheetX = sheetEl.scrollLeft;
        element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        if (win.scrollX !== prevWinX) win.scrollTo(prevWinX, win.scrollY);
        if (sheetEl.scrollLeft !== prevSheetX) sheetEl.scrollLeft = prevSheetX;
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

    const readObsidianKeyboardHeight = (): number => {
        const raw = win.getComputedStyle(win.document.documentElement).getPropertyValue('--keyboard-height');
        return parseFloat(raw) || 0;
    };

    const syncKeyboardOffset = () => {
        let keyboardHeight = 0;
        let overlap = 0;
        if (viewport) {
            const visibleBottom = viewport.height + viewport.offsetTop;
            keyboardHeight = Math.max(0, Math.round(win.innerHeight - visibleBottom));
            // Obsidian iOS often already shrinks its container above the keyboard.
            // Only compensate for the part of our (unconstrained) parent still hidden,
            // otherwise the keyboard is subtracted twice and leaves a blank band.
            const referenceEl = sheetEl.parentElement ?? sheetEl;
            const referenceBottom = referenceEl.getBoundingClientRect().bottom;
            overlap = Math.max(0, Math.round(referenceBottom - visibleBottom));
        }
        // On Obsidian iOS the visual viewport does not shrink; Obsidian exposes --keyboard-height instead.
        const keyboardOpen = keyboardHeight >= keyboardThreshold
            || overlap >= keyboardThreshold
            || readObsidianKeyboardHeight() >= keyboardThreshold;
        if (!keyboardOpen || overlap < keyboardThreshold) overlap = 0;
        sheetEl.style.setProperty(keyboardVarName, `${overlap}px`);
        sheetEl.toggleClass('has-mobile-keyboard', keyboardOpen);
        if (keyboardOpen) scheduleScrollIntoView();
    };

    const handleFocusIn = (event: FocusEvent) => {
        scheduleScrollIntoView(event.target);
    };

    const handleViewportChange = () => {
        syncKeyboardOffset();
    };

    const handleObsidianKeyboardEvent = () => {
        syncKeyboardOffset();
    };
    const OBSIDIAN_KEYBOARD_EVENTS = ['keyboardWillShow', 'keyboardDidShow', 'keyboardWillHide', 'keyboardDidHide'];

    sheetEl.addEventListener('focusin', handleFocusIn, true);
    win.addEventListener('resize', handleViewportChange);
    viewport?.addEventListener('resize', handleViewportChange);
    viewport?.addEventListener('scroll', handleViewportChange);
    OBSIDIAN_KEYBOARD_EVENTS.forEach((name) => win.addEventListener(name, handleObsidianKeyboardEvent));

    syncKeyboardOffset();

    return () => {
        clearPendingScroll();
        OBSIDIAN_KEYBOARD_EVENTS.forEach((name) => win.removeEventListener(name, handleObsidianKeyboardEvent));
        sheetEl.removeEventListener('focusin', handleFocusIn, true);
        win.removeEventListener('resize', handleViewportChange);
        viewport?.removeEventListener('resize', handleViewportChange);
        viewport?.removeEventListener('scroll', handleViewportChange);
        sheetEl.style.removeProperty(keyboardVarName);
        sheetEl.removeClass('has-mobile-keyboard');
    };
}
