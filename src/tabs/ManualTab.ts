import { setIcon, Platform } from 'obsidian';
import type { DiwaView } from '../view';
import { BaseTab } from './BaseTab';
import { isTablet } from '../utils';

import { HELP_SECTIONS, type HelpSection } from '../help/manualSections';

export class ManualTab extends BaseTab {
    private activeSectionId: string = 'workspace';
    private searchQuery: string = '';

    constructor(view: DiwaView) { super(view); }

    render(container: HTMLElement) {
        container.empty();
        const wrap = container.createEl('div', { cls: 'diwa-manual-wrap' });

        if (Platform.isMobile && !isTablet()) {
            this._renderMobile(wrap);
        } else {
            this._renderDesktop(wrap);
        }
    }

    // ── Desktop / Tablet: sidebar + content pane ──────────────────────────
    private _renderDesktop(root: HTMLElement) {
        root.addClass('diwa-help-root');

        const header = root.createEl('div', { cls: 'diwa-help-header' });
        const navRow = header.createEl('div', { cls: 'diwa-manual-nav-row' });
        const titleWrap = header.createEl('div', { cls: 'diwa-help-header-title' });
        const titleIcon = titleWrap.createEl('span', { cls: 'diwa-help-header-icon' });
        setIcon(titleIcon, 'lucide-book-open');
        titleWrap.createEl('h2', { text: 'DIWA Manual', cls: 'diwa-help-title' });
        titleWrap.createEl('p', { text: 'Your Personal Operating System', cls: 'diwa-help-subtitle' });

        const searchWrap = header.createEl('div', { cls: 'diwa-help-search-wrap' });
        const searchIcon = searchWrap.createEl('span', { cls: 'diwa-help-search-icon' });
        setIcon(searchIcon, 'lucide-search');
        const searchInput = searchWrap.createEl('input', {
            cls: 'diwa-help-search',
            attr: { type: 'text', placeholder: 'Search the manual…' }
        }) as HTMLInputElement;

        const body = root.createEl('div', { cls: 'diwa-help-body' });
        const sidebar = body.createEl('nav', { cls: 'diwa-help-sidebar' });
        const content = body.createEl('div', { cls: 'diwa-help-content' });

        const renderContent = () => {
            content.empty();
            const q = this.searchQuery.toLowerCase().trim();
            if (q) { this._renderSearchResults(content, q); return; }
            const section = HELP_SECTIONS.find(s => s.id === this.activeSectionId) || HELP_SECTIONS[0];
            this._renderSectionContent(content, section);
        };

        const renderSidebar = () => {
            sidebar.empty();
            HELP_SECTIONS.forEach(s => {
                const item = sidebar.createEl('div', { cls: `diwa-help-nav-item${s.id === this.activeSectionId ? ' is-active' : ''}` });
                const iconEl = item.createEl('span', { cls: 'diwa-help-nav-icon' });
                setIcon(iconEl, s.icon);
                item.createEl('span', { cls: 'diwa-help-nav-label', text: s.title });
                // Highlight roadmap
                if (s.id === 'roadmap') item.addClass('diwa-help-nav-item--roadmap');
                item.addEventListener('click', () => {
                    this.activeSectionId = s.id;
                    this.searchQuery = '';
                    searchInput.value = '';
                    renderSidebar();
                    renderContent();
                });
            });
        };

        searchInput.addEventListener('input', () => {
            this.searchQuery = searchInput.value;
            renderContent();
        });

        renderSidebar();
        renderContent();
    }

    // ── Mobile: accordion list ─────────────────────────────────────────────
    private _renderMobile(root: HTMLElement) {
        root.addClass('diwa-help-root');
        root.addClass('diwa-help-root--mobile');

        const header = root.createEl('div', { cls: ['diwa-help-header', 'diwa-help-header--mobile'] });
        const navRow = header.createEl('div', { cls: 'diwa-manual-nav-row' });
        const titleWrap = header.createEl('div', { cls: 'diwa-help-header-title' });
        const titleIcon = titleWrap.createEl('span', { cls: 'diwa-help-header-icon' });
        setIcon(titleIcon, 'lucide-book-open');
        titleWrap.createEl('h2', { text: 'DIWA Manual', cls: 'diwa-help-title' });

        const searchWrap = header.createEl('div', { cls: 'diwa-help-search-wrap' });
        const searchIcon = searchWrap.createEl('span', { cls: 'diwa-help-search-icon' });
        setIcon(searchIcon, 'lucide-search');
        const searchInput = searchWrap.createEl('input', {
            cls: 'diwa-help-search',
            attr: { type: 'text', placeholder: 'Search…' }
        }) as HTMLInputElement;

        const list = root.createEl('div', { cls: 'diwa-help-accordion' });

        const renderAccordion = (query: string) => {
            list.empty();
            if (query) { this._renderSearchResults(list, query.toLowerCase().trim()); return; }
            HELP_SECTIONS.forEach(s => {
                const block = list.createEl('div', { cls: 'diwa-help-accordion-block' });
                if (s.id === 'roadmap') block.addClass('diwa-help-accordion-block--roadmap');
                const trigger = block.createEl('div', { cls: 'diwa-help-accordion-trigger' });
                const trigLeft = trigger.createEl('div', { cls: 'diwa-help-accordion-trigger-left' });
                const iconEl = trigLeft.createEl('span', { cls: 'diwa-help-nav-icon' });
                setIcon(iconEl, s.icon);
                const textCol = trigLeft.createEl('div', { cls: 'diwa-help-accordion-text' });
                textCol.createEl('span', { cls: 'diwa-help-accordion-title', text: s.title });
                textCol.createEl('span', { cls: 'diwa-help-accordion-subtitle', text: s.subtitle });
                const chevron = trigger.createEl('span', { cls: 'diwa-help-accordion-chevron' });
                setIcon(chevron, 'chevron-right');

                const bodyEl = block.createEl('div', { cls: 'diwa-help-accordion-body' });
                bodyEl.style.display = 'none';

                trigger.addEventListener('click', () => {
                    const open = bodyEl.style.display !== 'none';
                    list.querySelectorAll('.diwa-help-accordion-body').forEach((b: any) => b.style.display = 'none');
                    list.querySelectorAll('.diwa-help-accordion-chevron').forEach((c: any) => setIcon(c as HTMLElement, 'chevron-right'));
                    if (!open) {
                        bodyEl.style.display = 'block';
                        setIcon(chevron, 'chevron-down');
                        this._renderSectionContent(bodyEl, s);
                    } else {
                        bodyEl.empty();
                    }
                });
            });
        };

        searchInput.addEventListener('input', () => { renderAccordion(searchInput.value); });
        renderAccordion('');
    }

    private _renderSectionContent(container: HTMLElement, section: HelpSection) {
        container.empty();
        const secHeader = container.createEl('div', { cls: 'diwa-help-sec-header' });
        const iconEl = secHeader.createEl('span', { cls: 'diwa-help-sec-icon' });
        setIcon(iconEl, section.icon);
        const secText = secHeader.createEl('div');
        secText.createEl('h3', { cls: 'diwa-help-sec-title', text: section.title });
        secText.createEl('p', { cls: 'diwa-help-sec-subtitle', text: section.subtitle });

        section.items.forEach(item => {
            const card = container.createEl('div', { cls: 'diwa-help-item-card' });
            card.createEl('div', { cls: 'diwa-help-item-label', text: item.label });
            card.createEl('div', { cls: 'diwa-help-item-desc', text: item.desc });
            if (item.tip) {
                const tipRow = card.createEl('div', { cls: 'diwa-help-item-tip' });
                const tipIcon = tipRow.createEl('span', { cls: 'diwa-help-tip-icon' });
                setIcon(tipIcon, 'lucide-lightbulb');
                tipRow.createEl('span', { text: item.tip });
            }
        });
    }

    private _renderSearchResults(container: HTMLElement, q: string) {
        container.empty();
        let hasResults = false;
        HELP_SECTIONS.forEach(section => {
            const matchedItems = section.items.filter(item =>
                item.label.toLowerCase().includes(q) ||
                item.desc.toLowerCase().includes(q) ||
                (item.tip || '').toLowerCase().includes(q) ||
                section.title.toLowerCase().includes(q)
            );
            if (matchedItems.length === 0) return;
            hasResults = true;
            const group = container.createEl('div', { cls: 'diwa-help-search-group' });
            const grpHeader = group.createEl('div', { cls: 'diwa-help-search-group-header' });
            const iconEl = grpHeader.createEl('span', { cls: 'diwa-help-nav-icon' });
            setIcon(iconEl, section.icon);
            grpHeader.createEl('span', { cls: 'diwa-help-search-group-title', text: section.title });
            matchedItems.forEach(item => {
                const card = group.createEl('div', { cls: 'diwa-help-item-card' });
                card.createEl('div', { cls: 'diwa-help-item-label', text: item.label });
                card.createEl('div', { cls: 'diwa-help-item-desc', text: item.desc });
                if (item.tip) {
                    const tipRow = card.createEl('div', { cls: 'diwa-help-item-tip' });
                    const tipIcon = tipRow.createEl('span', { cls: 'diwa-help-tip-icon' });
                    setIcon(tipIcon, 'lucide-lightbulb');
                    tipRow.createEl('span', { text: item.tip });
                }
            });
        });
        if (!hasResults) container.createEl('div', { cls: 'diwa-help-empty', text: 'No results found. Try a different search term.' });
    }
}
