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

        // If the element is already visible at the top (such as the top hero composer),
        // or if in a dual-pane cockpit layout at the top, NEVER invoke scrollIntoView
        // as WebKit will attempt to horizontally center it on screen.
        const rect = element.getBoundingClientRect();
        if (rect.top >= 0 && rect.top <= 200) {
            return;
        }

        const visibleTop = viewport?.offsetTop ?? 0;
        const visibleBottom = viewport ? viewport.offsetTop + viewport.height : win.innerHeight;
        const margin = 16;
        if (rect.top >= visibleTop + margin && rect.bottom <= visibleBottom - margin) return;

        // Record all horizontal scroll offsets up the parent chain
        const scrollPositions = new Map<HTMLElement, number>();
        let p: HTMLElement | null = element;
        while (p) {
            if (p.scrollLeft !== 0) scrollPositions.set(p, p.scrollLeft);
            p = p.parentElement;
        }
        const prevWinX = win.scrollX;

        element.scrollIntoView({ block: 'nearest', inline: 'nearest' });

        // Restore all horizontal scroll offsets to strictly prevent left drift
        p = element;
        while (p) {
            const orig = scrollPositions.get(p) ?? 0;
            if (p.scrollLeft !== orig) p.scrollLeft = orig;
            p = p.parentElement;
        }
        if (win.scrollX !== prevWinX) win.scrollTo(prevWinX, win.scrollY);
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
