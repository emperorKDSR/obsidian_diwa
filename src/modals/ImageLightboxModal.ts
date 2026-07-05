import { App, Modal, setIcon } from 'obsidian';

type ImageLightboxOptions = {
    src: string;
    alt?: string;
    openerEl?: HTMLElement | null;
};

export class ImageLightboxModal extends Modal {
    private readonly src: string;
    private readonly alt: string;
    private openerEl: HTMLElement | null;

    // Zoom/pan state
    private scale = 1;
    private translateX = 0;
    private translateY = 0;
    private imageEl: HTMLImageElement | null = null;
    private frameEl: HTMLElement | null = null;

    // Pinch state
    private initialPinchDistance = 0;
    private initialScale = 1;
    private lastTapTime = 0;

    // Gesture tracking to prevent reset
    private hasGestured = false;

    // Pan state
    private isPanning = false;
    private panStartX = 0;
    private panStartY = 0;
    private panStartTranslateX = 0;
    private panStartTranslateY = 0;

    private readonly onContainerClick = (event: MouseEvent): void => {
        const target = event.target;
        if (!(target instanceof Node)) return;
        if (this.modalEl.contains(target)) return;
        this.close();
    };

    constructor(app: App, options: ImageLightboxOptions) {
        super(app);
        this.src = options.src;
        this.alt = options.alt || '';
        this.openerEl = options.openerEl ?? null;
    }

    onOpen(): void {
        const { containerEl, modalEl, contentEl, titleEl } = this;

        containerEl.addClass('diwa-image-lightbox-container');
        modalEl.addClass('diwa-image-lightbox-modal');
        contentEl.addClass('diwa-image-lightbox-content');
        titleEl.addClass('diwa-image-lightbox-title');
        modalEl.setAttr('aria-label', this.alt ? `Image preview: ${this.alt}` : 'Image preview');
        titleEl.setText('Image preview');
        contentEl.empty();

        containerEl.addEventListener('click', this.onContainerClick);

        const shell = contentEl.createDiv({ cls: 'diwa-image-lightbox-shell' });
        const closeBtn = shell.createEl('button', {
            cls: 'diwa-image-lightbox-close',
            attr: {
                type: 'button',
                'aria-label': 'Close image preview',
            },
        }) as HTMLButtonElement;
        setIcon(closeBtn, 'x');
        closeBtn.addEventListener('click', () => this.close());

        const frame = shell.createDiv({ cls: 'diwa-image-lightbox-frame' });
        this.frameEl = frame;

        const imageEl = frame.createEl('img', {
            cls: 'diwa-image-lightbox-image',
            attr: {
                src: this.src,
                alt: this.alt,
                loading: 'eager',
            },
        });
        this.imageEl = imageEl;

        // Touch gestures
        frame.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false });
        frame.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false });
        frame.addEventListener('touchend', this.onTouchEnd.bind(this), { passive: true });

        // Click to close only when not zoomed
        imageEl.addEventListener('click', () => {
            if (this.scale <= 1.05) {
                this.close();
            }
        });

        if (this.alt) {
            shell.createEl('div', {
                cls: 'diwa-image-lightbox-caption',
                text: this.alt,
            });
        }

        // ── Zoom In / Zoom Out Option Controls ──
        const controls = shell.createDiv({ cls: 'diwa-image-lightbox-controls' });

        const zoomOutBtn = controls.createEl('button', {
            cls: 'diwa-image-lightbox-btn',
            attr: { type: 'button', 'aria-label': 'Zoom out' }
        });
        setIcon(zoomOutBtn, 'zoom-out');
        zoomOutBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.scale = Math.max(this.scale - 0.5, 1);
            if (this.scale <= 1.05) {
                this.translateX = 0;
                this.translateY = 0;
            }
            this.applyTransform(true);
        });

        const resetBtn = controls.createEl('button', {
            cls: 'diwa-image-lightbox-btn reset-btn',
            text: '1:1',
            attr: { type: 'button', 'aria-label': 'Reset zoom' }
        });
        resetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.scale = 1;
            this.translateX = 0;
            this.translateY = 0;
            this.applyTransform(true);
        });

        const zoomInBtn = controls.createEl('button', {
            cls: 'diwa-image-lightbox-btn',
            attr: { type: 'button', 'aria-label': 'Zoom in' }
        });
        setIcon(zoomInBtn, 'zoom-in');
        zoomInBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.scale = Math.min(this.scale + 0.5, 4);
            this.applyTransform(true);
        });
    }

    private onTouchStart(e: TouchEvent): void {
        if (e.touches.length === 1) {
            this.hasGestured = false;
        }
        if (e.touches.length === 2) {
            e.preventDefault();
            this.hasGestured = true;
            this.initialPinchDistance = this.getTouchDistance(e.touches);
            this.initialScale = this.scale;
        } else if (e.touches.length === 1 && this.scale > 1.05) {
            // Start panning when zoomed
            this.isPanning = true;
            this.panStartX = e.touches[0].clientX;
            this.panStartY = e.touches[0].clientY;
            this.panStartTranslateX = this.translateX;
            this.panStartTranslateY = this.translateY;
            if (this.imageEl) this.imageEl.style.transition = 'none';
        }
    }

    private onTouchMove(e: TouchEvent): void {
        if (e.touches.length === 2) {
            e.preventDefault();
            this.hasGestured = true;
            const currentDistance = this.getTouchDistance(e.touches);
            const ratio = currentDistance / this.initialPinchDistance;
            this.scale = Math.min(Math.max(this.initialScale * ratio, 0.5), 4);
            this.applyTransform(false);
        } else if (e.touches.length === 1 && this.isPanning) {
            e.preventDefault();
            const dx = e.touches[0].clientX - this.panStartX;
            const dy = e.touches[0].clientY - this.panStartY;
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                this.hasGestured = true;
            }
            this.translateX = this.panStartTranslateX + dx;
            this.translateY = this.panStartTranslateY + dy;
            this.applyTransform(false);
        }
    }

    private onTouchEnd(_e: TouchEvent): void {
        this.isPanning = false;

        // Snap back if zoomed out too far
        if (this.scale < 1) {
            this.scale = 1;
            this.translateX = 0;
            this.translateY = 0;
            this.applyTransform(true);
        }

        // Reset position if back to 1x
        if (this.scale <= 1.05) {
            this.translateX = 0;
            this.translateY = 0;
            this.applyTransform(true);
        }

        // Double-tap detection - ignore if user pinched/panned during touch
        if (_e.changedTouches.length === 1 && !this.hasGestured) {
            const now = Date.now();
            if (now - this.lastTapTime < 300) {
                // Double tap: toggle between 1x and 2.5x
                if (this.scale > 1.05) {
                    this.scale = 1;
                    this.translateX = 0;
                    this.translateY = 0;
                } else {
                    this.scale = 2.5;
                    // Zoom toward the tap point
                    if (this.frameEl) {
                        const rect = this.frameEl.getBoundingClientRect();
                        const tapX = _e.changedTouches[0].clientX - rect.left - rect.width / 2;
                        const tapY = _e.changedTouches[0].clientY - rect.top - rect.height / 2;
                        this.translateX = -tapX * 1.5;
                        this.translateY = -tapY * 1.5;
                    }
                }
                this.applyTransform(true);
                this.lastTapTime = 0;
            } else {
                this.lastTapTime = now;
            }
        }
    }

    private getTouchDistance(touches: TouchList): number {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    private applyTransform(animate: boolean): void {
        if (!this.imageEl) return;
        if (animate) {
            this.imageEl.style.transition = 'transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)';
        } else {
            this.imageEl.style.transition = 'none';
        }
        this.imageEl.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
    }

    onClose(): void {
        this.containerEl.removeEventListener('click', this.onContainerClick);
        this.containerEl.removeClass('diwa-image-lightbox-container');
        this.modalEl.removeClass('diwa-image-lightbox-modal');
        this.contentEl.removeClass('diwa-image-lightbox-content');
        this.titleEl.removeClass('diwa-image-lightbox-title');
        this.contentEl.empty();
        this.imageEl = null;
        this.frameEl = null;

        const openerEl = this.openerEl;
        this.openerEl = null;
        if (openerEl?.isConnected) {
            openerEl.focus({ preventScroll: true });
        }
    }
}
