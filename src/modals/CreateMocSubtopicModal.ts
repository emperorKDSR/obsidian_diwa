import { App, Modal, setIcon } from 'obsidian';
import { KaronMocSubtopic, KaronMocTopic } from '../types';
import { buildMocSubtopicTag, slugifySubtopic } from '../utils/karonHelpers';

export class CreateMocSubtopicModal extends Modal {
    private mainTopic: KaronMocTopic;
    private onSave: (subtopic: KaronMocSubtopic) => void | Promise<void>;

    constructor(
        app: App,
        mainTopic: KaronMocTopic,
        onSave: (subtopic: KaronMocSubtopic) => void | Promise<void>
    ) {
        super(app);
        this.mainTopic = mainTopic;
        this.onSave = onSave;
    }

    onOpen(): void {
        this.modalEl.addClass('pos-create-topic-modal');
        const { contentEl } = this;
        contentEl.empty();

        // 1. Header
        const headerEl = contentEl.createDiv({ cls: 'pos-create-topic-header' });
        const iconWrap = headerEl.createDiv({ cls: 'pos-create-topic-icon-wrap' });
        setIcon(iconWrap, 'list-plus');

        headerEl.createEl('h3', {
            cls: 'pos-create-topic-title',
            text: `New Subtopic in ${this.mainTopic.label}`
        });
        headerEl.createEl('p', {
            cls: 'pos-create-topic-subtitle',
            text: `Create a level-2 area under #${this.mainTopic.tag} to group related notes.`
        });

        // 2. Form Body
        const bodyEl = contentEl.createDiv({ cls: 'pos-create-topic-body' });

        const nameFieldWrap = bodyEl.createDiv({ cls: 'pos-create-topic-field-name' });
        nameFieldWrap.createEl('label', { text: 'Subtopic Name', cls: 'pos-create-topic-label' });
        const nameInput = nameFieldWrap.createEl('input', {
            type: 'text',
            cls: 'pos-create-topic-input pos-create-topic-name-input',
            attr: {
                placeholder: 'e.g. Client Alpha, Roadmap, Taxes...'
            }
        });

        // Live Tag Preview
        const previewRow = bodyEl.createDiv({ cls: 'pos-create-topic-preview-row' });
        previewRow.createSpan({ text: 'Generated Tag: ', cls: 'pos-create-topic-preview-label' });
        const tagBadge = previewRow.createSpan({
            cls: 'pos-karon-moc-tag-badge pos-create-topic-preview-badge',
            text: `#${buildMocSubtopicTag(this.mainTopic.tag, 'subtopic')}`
        });

        // Error message container
        const errorEl = bodyEl.createDiv({ cls: 'pos-create-topic-error' });
        errorEl.style.display = 'none';

        const updateTagPreview = (): string => {
            const raw = nameInput.value.trim();
            const slug = slugifySubtopic(raw);
            const fullTag = buildMocSubtopicTag(this.mainTopic.tag, slug);
            tagBadge.setText(`#${fullTag}`);
            return slug;
        };

        nameInput.addEventListener('input', () => {
            errorEl.style.display = 'none';
            updateTagPreview();
        });

        // 3. Footer Buttons
        const footerEl = contentEl.createDiv({ cls: 'pos-create-topic-footer' });

        const cancelBtn = footerEl.createEl('button', {
            cls: 'pos-create-topic-btn pos-create-topic-btn-cancel',
            text: 'Cancel'
        });
        cancelBtn.onclick = () => this.close();

        const submitBtn = footerEl.createEl('button', {
            cls: 'pos-create-topic-btn pos-create-topic-btn-submit mod-cta',
            text: 'Create Subtopic'
        });

        const handleSubmit = async () => {
            const rawLabel = nameInput.value.trim();
            if (!rawLabel) {
                errorEl.setText('Please enter a subtopic name.');
                errorEl.style.display = 'block';
                nameInput.focus();
                return;
            }

            const slug = slugifySubtopic(rawLabel);
            const existingSubtopics = this.mainTopic.subtopics || [];
            const slugExists = existingSubtopics.some(
                s => s.slug.toLowerCase() === slug.toLowerCase()
            );

            if (slugExists) {
                errorEl.setText(`Subtopic "${slug}" already exists under this topic.`);
                errorEl.style.display = 'block';
                return;
            }

            const newSubtopic: KaronMocSubtopic = {
                id: `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                label: rawLabel,
                slug
            };

            submitBtn.disabled = true;
            this.close();

            try {
                await this.onSave(newSubtopic);
            } catch (err) {
                console.error('[DIWA Karon] Failed to save subtopic', err);
            }
        };

        submitBtn.onclick = handleSubmit;

        nameInput.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                void handleSubmit();
            }
        });

        setTimeout(() => nameInput.focus(), 50);
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
