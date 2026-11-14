import { App, Modal, setIcon } from 'obsidian';
import { KaronMocTopic } from '../types';
import { slugifyMocTopicTag } from '../utils/karonHelpers';

export class CreateMocTopicModal extends Modal {
    private existingTopics: KaronMocTopic[];
    private onSave: (topic: KaronMocTopic) => void | Promise<void>;

    constructor(
        app: App,
        existingTopics: KaronMocTopic[],
        onSave: (topic: KaronMocTopic) => void | Promise<void>
    ) {
        super(app);
        this.existingTopics = existingTopics;
        this.onSave = onSave;
    }

    onOpen(): void {
        this.modalEl.addClass('pos-create-topic-modal');
        const { contentEl } = this;
        contentEl.empty();

        // 1. Header
        const headerEl = contentEl.createDiv({ cls: 'pos-create-topic-header' });
        const iconWrap = headerEl.createDiv({ cls: 'pos-create-topic-icon-wrap' });
        setIcon(iconWrap, 'folder-plus');

        headerEl.createEl('h3', {
            cls: 'pos-create-topic-title',
            text: 'New MOC Topic'
        });
        headerEl.createEl('p', {
            cls: 'pos-create-topic-subtitle',
            text: 'Define a topic or main content area to group notes via frontmatter tags.'
        });

        // 2. Form Body
        const bodyEl = contentEl.createDiv({ cls: 'pos-create-topic-body' });

        // Row with Icon & Topic Name
        const rowEl = bodyEl.createDiv({ cls: 'pos-create-topic-row' });

        // Emoji / Icon field
        const iconFieldWrap = rowEl.createDiv({ cls: 'pos-create-topic-field-icon' });
        iconFieldWrap.createEl('label', { text: 'Icon', cls: 'pos-create-topic-label' });
        const iconInput = iconFieldWrap.createEl('input', {
            type: 'text',
            cls: 'pos-create-topic-input pos-create-topic-icon-input',
            attr: {
                placeholder: '📁',
                maxlength: '6',
                title: 'Emoji or short icon'
            }
        });

        // Name field
        const nameFieldWrap = rowEl.createDiv({ cls: 'pos-create-topic-field-name' });
        nameFieldWrap.createEl('label', { text: 'Topic Name', cls: 'pos-create-topic-label' });
        const nameInput = nameFieldWrap.createEl('input', {
            type: 'text',
            cls: 'pos-create-topic-input pos-create-topic-name-input',
            attr: {
                placeholder: 'e.g. Client Projects, Research, Health...'
            }
        });

        // Live Tag Preview
        const previewRow = bodyEl.createDiv({ cls: 'pos-create-topic-preview-row' });
        previewRow.createSpan({ text: 'Generated Tag: ', cls: 'pos-create-topic-preview-label' });
        const tagBadge = previewRow.createSpan({
            cls: 'pos-karon-moc-tag-badge pos-create-topic-preview-badge',
            text: '#moc/topic'
        });

        // Error message container
        const errorEl = bodyEl.createDiv({ cls: 'pos-create-topic-error' });
        errorEl.style.display = 'none';

        const updateTagPreview = (): string => {
            const label = nameInput.value.trim();
            const derived = slugifyMocTopicTag(label);
            tagBadge.setText(`#${derived}`);
            return derived;
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
            text: 'Create Topic'
        });

        const handleSubmit = async () => {
            const rawLabel = nameInput.value.trim();
            if (!rawLabel) {
                errorEl.setText('Please enter a topic name.');
                errorEl.style.display = 'block';
                nameInput.focus();
                return;
            }

            const tag = slugifyMocTopicTag(rawLabel);
            const tagExists = this.existingTopics.some(
                t => t.tag.toLowerCase() === tag.toLowerCase()
            );

            if (tagExists) {
                errorEl.setText(`A topic with tag #${tag} already exists.`);
                errorEl.style.display = 'block';
                return;
            }

            const iconVal = iconInput.value.trim() || '📁';
            const newTopic: KaronMocTopic = {
                id: `moc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                label: rawLabel,
                tag,
                icon: iconVal
            };

            submitBtn.disabled = true;
            this.close();

            try {
                await this.onSave(newTopic);
            } catch (err) {
                console.error('[DIWA Karon] Failed to save new topic', err);
            }
        };

        submitBtn.onclick = handleSubmit;

        // Enter key submission from inputs
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                void handleSubmit();
            }
        };
        nameInput.addEventListener('keydown', handleKeyDown);
        iconInput.addEventListener('keydown', handleKeyDown);

        // Auto-focus name input
        setTimeout(() => nameInput.focus(), 50);
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
