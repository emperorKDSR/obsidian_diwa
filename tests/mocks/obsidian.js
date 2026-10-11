const moment = require('moment');

class Component {
    load() {}
    unload() {}
    addChild(c) { return c; }
    removeChild(c) { return c; }
    register(cb) {}
    registerEvent(e) {}
    registerDomEvent(el, type, cb) {}
}

class Plugin extends Component {
    constructor() { super(); }
}

class ItemView extends Component {
    constructor(leaf) { super(); this.leaf = leaf; }
}

class Modal {
    constructor(app) { this.app = app; }
    open() {}
    close() {}
}

class TFile {
    constructor(path = '') {
        this.path = path;
        this.basename = path.split('/').pop().replace(/\.md$/, '');
        this.stat = { mtime: Date.now(), ctime: Date.now() };
    }
}

class TFolder {
    constructor(path = '') {
        this.path = path;
    }
}

class App {
    constructor() {
        this.vault = {
            adapter: { exists: async () => false },
            getMarkdownFiles: () => [],
            getAbstractFileByPath: () => null,
            read: async () => '',
            process: async (file, fn) => fn(''),
            create: async (path, content) => new TFile(path),
            createFolder: async () => {},
            trash: async () => {}
        };
        this.metadataCache = {
            getFileCache: () => null,
            getFirstLinkpathDest: () => null
        };
        this.workspace = {
            getLeavesOfType: () => []
        };
        this.fileManager = {
            processFrontMatter: async (file, fn) => fn({})
        };
    }
}

module.exports = {
    moment,
    normalizePath: (p) => String(p || '').replace(/\\/g, '/').replace(/\/+/g, '/'),
    Platform: { isMobile: false, isDesktop: true },
    Component,
    Plugin,
    ItemView,
    Modal,
    TFile,
    TFolder,
    App,
    Notice: class { constructor(msg) { this.msg = msg; } },
    MarkdownRenderer: {
        render: async () => {},
        renderMarkdown: async () => {}
    },
    setIcon: () => {},
    addIcon: () => {}
};