import type { App } from 'obsidian';
import { ImageLightboxModal } from '../modals/ImageLightboxModal';

const boundContainers = new WeakSet<HTMLElement>();

function getImageLink(img: HTMLImageElement): HTMLAnchorElement | null {
    const link = img.closest('a');
    return link instanceof HTMLAnchorElement ? link : null;
}

function isLinkedImage(img: HTMLImageElement): boolean {
    return getImageLink(img) !== null;
}

function isModifiedClick(event: MouseEvent): boolean {
    return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

function prepareZoomableImage(img: HTMLImageElement): void {
    const linked = isLinkedImage(img);
    img.addClass('diwa-zoomable-image');
    img.setAttr('title', linked ? 'Click to zoom (Ctrl/Cmd-click to open link)' : 'Click to zoom');

    if (linked) {
        img.removeAttribute('tabindex');
        img.removeAttribute('role');
        img.removeAttribute('aria-haspopup');
        img.removeAttribute('aria-label');
        return;
    }

    img.setAttr('tabindex', '0');
    img.setAttr('role', 'button');
    img.setAttr('aria-haspopup', 'dialog');

    const label = (img.getAttribute('alt') || '').trim();
    img.setAttr('aria-label', label ? `Open image preview: ${label}` : 'Open image preview');
}

function resolveZoomableImage(target: EventTarget | null): HTMLImageElement | null {
    if (!(target instanceof HTMLElement)) return null;
    const match = target.closest('img.diwa-zoomable-image');
    return match instanceof HTMLImageElement ? match : null;
}

function openImageLightbox(app: App, img: HTMLImageElement, event?: Event): void {
    const src = img.currentSrc || img.getAttribute('src') || '';
    if (!src) return;
    event?.preventDefault();
    event?.stopPropagation();
    new ImageLightboxModal(app, {
        src,
        alt: img.getAttribute('alt') || '',
        openerEl: getImageLink(img) ?? img,
    }).open();
}

export function enableImageZoom(app: App, containerEl: HTMLElement): void {
    containerEl.querySelectorAll('img').forEach((img) => prepareZoomableImage(img));

    if (boundContainers.has(containerEl)) return;
    boundContainers.add(containerEl);

    containerEl.addEventListener('click', (event: MouseEvent) => {
        const img = resolveZoomableImage(event.target);
        if (!img) return;
        if (isLinkedImage(img) && (event.button !== 0 || isModifiedClick(event))) return;
        openImageLightbox(app, img, event);
    });

    containerEl.addEventListener('keydown', (event) => {
        const img = resolveZoomableImage(event.target);
        if (!img) return;
        if (isLinkedImage(img)) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        openImageLightbox(app, img, event);
    });
}
