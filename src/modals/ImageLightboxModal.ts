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
        const imageEl = frame.createEl('img', {
            cls: 'diwa-image-lightbox-image',
            attr: {
                src: this.src,
                alt: this.alt,
                loading: 'eager',
            },
        });
        imageEl.addEventListener('click', () => this.close());

        if (this.alt) {
            shell.createEl('div', {
                cls: 'diwa-image-lightbox-caption',
                text: this.alt,
            });
        }
    }

    onClose(): void {
        this.containerEl.removeEventListener('click', this.onContainerClick);
        this.containerEl.removeClass('diwa-image-lightbox-container');
        this.modalEl.removeClass('diwa-image-lightbox-modal');
        this.contentEl.removeClass('diwa-image-lightbox-content');
        this.titleEl.removeClass('diwa-image-lightbox-title');
        this.contentEl.empty();

        const openerEl = this.openerEl;
        this.openerEl = null;
        if (openerEl?.isConnected) {
            openerEl.focus({ preventScroll: true });
        }
    }
}
