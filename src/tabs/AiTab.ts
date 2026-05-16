import { moment, Platform, TFile, Notice, MarkdownRenderer, setIcon } from 'obsidian';
import type { DiwaView } from '../view';
import { BaseTab } from './BaseTab';
import { AiSettingsModal } from '../modals/AiSettingsModal';
import type { ChatMessage } from '../types';
import { isTablet } from '../utils';

export class AiTab extends BaseTab {
    constructor(view: DiwaView) { super(view); }

    render(container: HTMLElement) {
        this.renderAiMode(container);
    }

    private chatFolder(): string {
        return (this.settings.aiChatFolder || '000 Bin/DIWA AI Chat').trim();
    }

    private async ensureChatFolder(): Promise<void> {
        const folder = this.chatFolder();
        if (!this.app.vault.getAbstractFileByPath(folder)) {
            await this.app.vault.createFolder(folder).catch(() => {});
        }
    }

    private async saveChatHistory(): Promise<void> {
        if (!this.view.currentChatFile) {
            await this.ensureChatFolder();
            const name = `chat-${moment().format('YYYYMMDD-HHmmss')}.md`;
            this.view.currentChatFile = `${this.chatFolder()}/${name}`;
        }
        const json = JSON.stringify(this.view.chatHistory, null, 2);
        const content = `---\ncreated: ${moment().format('YYYY-MM-DD HH:mm:ss')}\nsession: ${this.view.currentChatFile}\n---\n\`\`\`json\n${json}\n\`\`\`\n`;
        const existing = this.app.vault.getAbstractFileByPath(this.view.currentChatFile);
        if (existing instanceof TFile) {
            await this.app.vault.modify(existing, content);
        } else {
            await this.app.vault.create(this.view.currentChatFile, content);
        }
    }

    private async loadMostRecentChat(): Promise<boolean> {
        const folder = this.chatFolder();
        const files = this.app.vault.getMarkdownFiles()
            .filter(f => f.path.startsWith(folder + '/'))
            .sort((a, b) => b.stat.mtime - a.stat.mtime);
        if (files.length === 0) return false;
        const file = files[0];
        try {
            const content = await this.app.vault.read(file);
            const m = content.match(/```json\n([\s\S]*?)\n```/);
            if (!m) return false;
            const msgs: ChatMessage[] = JSON.parse(m[1]);
            if (!Array.isArray(msgs) || msgs.length === 0) return false;
            this.view.chatHistory = msgs;
            this.view.currentChatFile = file.path;
            return true;
        } catch { return false; }
    }

    async renderAiMode(container: HTMLElement, forceNew = false) {
        container.empty();

        // Load most recent chat on first open — but NOT when user explicitly starts a new chat
        if (!forceNew && this.view.chatHistory.length === 0 && !this.view.currentChatFile) {
            await this.loadMostRecentChat();
        }

        const wrap = container.createEl('div', { cls: 'diwa-ai-shell' });

        // ─── Header ───
        const header = wrap.createEl('div', { cls: 'diwa-ai-header' });
        const headerLeft = header.createEl('div', { cls: 'diwa-ai-header-left' });
        this.renderHomeIcon(headerLeft);
        const titleGroup = headerLeft.createEl('div', { cls: 'diwa-ai-title-group' });
        titleGroup.createEl('h2', { text: 'AI Chat', cls: 'diwa-ai-title' });
        const modelBadge = titleGroup.createEl('span', {
            text: this.settings.geminiModel || 'gemini-2.5-pro',
            cls: 'diwa-ai-model-badge'
        });

        const headerRight = header.createEl('div', { cls: 'diwa-ai-header-right' });

        // Web Search toggle
        const webToggle = headerRight.createEl('button', {
            cls: `diwa-ai-toggle-btn${this.view.webSearchEnabled ? ' is-active' : ''}`,
            attr: { 'aria-label': 'Web Search' }
        });
        const webIcon = webToggle.createEl('span', { cls: 'diwa-ai-toggle-icon' });
        setIcon(webIcon, 'lucide-globe');
        webToggle.addEventListener('click', () => {
            this.view.webSearchEnabled = !this.view.webSearchEnabled;
            webToggle.toggleClass('is-active', this.view.webSearchEnabled);
            new Notice(this.view.webSearchEnabled ? 'Web search enabled' : 'Web search disabled');
        });

        // Settings gear
        const settingsBtn = headerRight.createEl('button', {
            cls: 'diwa-ai-toggle-btn',
            attr: { 'aria-label': 'AI Settings' }
        });
        const settingsIcon = settingsBtn.createEl('span', { cls: 'diwa-ai-toggle-icon' });
        setIcon(settingsIcon, 'lucide-settings');
        settingsBtn.addEventListener('click', () => {
            new AiSettingsModal(this.app, this.plugin).open();
        });

        // New Chat
        const newChatBtn = headerRight.createEl('button', { text: '+ New', cls: 'diwa-ai-new-btn' });
        newChatBtn.addEventListener('click', () => {
            this.view.chatHistory = [];
            this.view.currentChatFile = null;
            this.view.groundedFiles = [];
            this.renderAiMode(container, true);
        });

        // ─── Chat Messages ───
        const chatArea = wrap.createEl('div', { cls: 'diwa-ai-messages' });
        this.view.chatContainer = chatArea;

        const renderHistory = () => {
            chatArea.empty();
            if (this.view.chatHistory.length === 0) {
                this.renderWelcomeState(chatArea);
                return;
            }
            this.view.chatHistory.forEach(msg => this.appendMessage(chatArea, msg));
        };
        renderHistory();

        // ─── Grounded Files Chips ───
        const contextBar = wrap.createEl('div', { cls: `diwa-ai-context-bar${this.view.groundedFiles.length > 0 ? '' : ' is-empty'}` });
        this.renderContextChips(contextBar);

        // ─── Input Area ───
        const inputArea = wrap.createEl('div', { cls: 'diwa-ai-input-area' });

        // Attach file button
        const attachBtn = inputArea.createEl('button', { cls: 'diwa-ai-attach-btn', attr: { 'aria-label': 'Attach vault file' } });
        const attachIcon = attachBtn.createEl('span');
        setIcon(attachIcon, 'lucide-paperclip');
        attachBtn.addEventListener('click', () => {
            new Notice('Drag a file from your vault sidebar to attach it, or type @filename in the chat.');
        });

        const textArea = inputArea.createEl('textarea', {
            cls: 'diwa-ai-textarea',
            attr: { placeholder: 'Ask DIWA anything…', rows: '1' }
        });

        // Auto-resize textarea
        textArea.addEventListener('input', () => {
            textArea.style.height = 'auto';
            textArea.style.height = Math.min(textArea.scrollHeight, 200) + 'px';
        });

        // Enter to send, Shift+Enter for newline
        textArea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        const sendBtn = inputArea.createEl('button', { cls: 'diwa-ai-send-btn', attr: { 'aria-label': 'Send' } });
        const sendIcon = sendBtn.createEl('span');
        setIcon(sendIcon, 'lucide-arrow-up');

        const sendMessage = async () => {
            const text = textArea.value.trim();
            if (!text || this.view.isAiLoading) return;

            textArea.value = '';
            textArea.style.height = 'auto';
            this.view.chatHistory.push({ role: 'user', text });
            if (this.view.chatHistory.length === 1) chatArea.empty();
            this.appendMessage(chatArea, { role: 'user', text });

            this.view.isAiLoading = true;
            sendBtn.addClass('is-loading');

            // Show typing indicator
            const typingRow = chatArea.createEl('div', { cls: 'diwa-ai-msg-row is-bot' });
            const typingAvatar = typingRow.createEl('div', { cls: 'diwa-ai-avatar' });
            setIcon(typingAvatar, 'lucide-sparkles');
            const typingBubble = typingRow.createEl('div', { cls: 'diwa-ai-bot-bubble diwa-ai-typing' });
            typingBubble.createEl('span', { cls: 'diwa-ai-dot' });
            typingBubble.createEl('span', { cls: 'diwa-ai-dot' });
            typingBubble.createEl('span', { cls: 'diwa-ai-dot' });
            chatArea.scrollTop = chatArea.scrollHeight;

            try {
                const response = await this.ai.callGemini(text, this.view.groundedFiles, this.view.webSearchEnabled, this.view.chatHistory, this.index.thoughtIndex);
                typingRow.remove();
                this.view.chatHistory.push({ role: 'model', text: response });
                this.appendMessage(chatArea, { role: 'model', text: response });
                this.saveChatHistory().catch(e => console.error('[DIWA AiTab] save failed', e));
            } catch (e: any) {
                typingRow.remove();
                const errRow = chatArea.createEl('div', { cls: 'diwa-ai-msg-row is-bot' });
                errRow.createEl('div', { cls: 'diwa-ai-error', text: `⚠ ${e.message}` });
                chatArea.scrollTop = chatArea.scrollHeight;
                setTimeout(() => errRow.remove(), 10000);
            } finally {
                this.view.isAiLoading = false;
                sendBtn.removeClass('is-loading');
            }
        };

        sendBtn.addEventListener('click', sendMessage);
    }

    private appendMessage(chatArea: HTMLElement, msg: ChatMessage): void {
        const isUser = msg.role === 'user';
        const row = chatArea.createEl('div', { cls: `diwa-ai-msg-row ${isUser ? 'is-user' : 'is-bot'}` });
        if (!isUser) {
            const avatar = row.createEl('div', { cls: 'diwa-ai-avatar' });
            setIcon(avatar, 'lucide-sparkles');
        }
        const bubble = row.createEl('div', { cls: isUser ? 'diwa-ai-user-bubble' : 'diwa-ai-bot-bubble' });
        MarkdownRenderer.render(this.app, msg.text, bubble, '', this.view);
        this.hookInternalLinks(bubble, '');
        chatArea.scrollTop = chatArea.scrollHeight;
    }

    private renderContextChips(contextBar: HTMLElement): void {
        contextBar.empty();
        contextBar.toggleClass('is-empty', this.view.groundedFiles.length === 0);
        this.view.groundedFiles.forEach((file, idx) => {
            const chip = contextBar.createEl('span', { cls: 'diwa-ai-file-chip' });
            chip.createEl('span', { text: file.basename, cls: 'diwa-ai-chip-name' });
            const removeBtn = chip.createEl('span', { text: '×', cls: 'diwa-ai-chip-remove' });
            removeBtn.addEventListener('click', () => {
                this.view.groundedFiles.splice(idx, 1);
                this.renderContextChips(contextBar);
            });
        });
    }

    private renderWelcomeState(container: HTMLElement) {
        const welcome = container.createEl('div', { cls: 'diwa-ai-welcome' });
        const icon = welcome.createEl('div', { cls: 'diwa-ai-welcome-icon' });
        setIcon(icon, 'lucide-sparkles');
        welcome.createEl('h3', { text: 'DIWA Intelligence', cls: 'diwa-ai-welcome-title' });
        welcome.createEl('p', { text: 'Your personal AI grounded in your vault knowledge. Ask questions, get insights, or brainstorm ideas.', cls: 'diwa-ai-welcome-desc' });

        const suggestions = welcome.createEl('div', { cls: 'diwa-ai-suggestions' });
        const prompts = [
            'What are my open gawa this week?',
            'Summarize my recent thoughts',
            'What should I focus on today?',
            'Help me plan my next project'
        ];
        prompts.forEach(prompt => {
            const chip = suggestions.createEl('button', { text: prompt, cls: 'diwa-ai-suggestion-chip' });
            chip.addEventListener('click', () => {
                const textarea = container.closest('.diwa-ai-shell')?.querySelector('.diwa-ai-textarea') as HTMLTextAreaElement;
                if (textarea) {
                    textarea.value = prompt;
                    textarea.dispatchEvent(new Event('input'));
                    textarea.focus();
                }
            });
        });
    }
}


