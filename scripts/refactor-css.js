const fs = require('fs');
let css = fs.readFileSync('styles.css', 'utf8');

// === CHANGE 1: Fix .diwa-task-cb base rule ===
const cb_old = '/* Circle Checkbox */.diwa-task-cb {    width: 18px;    height: 18px;    min-width: 18px;    border-radius: 50%;    border: 2px solid var(--background-modifier-border);    background: transparent;    display: flex;    align-items: center;    justify-content: center;    cursor: pointer;    transition: all 0.18s ease;}';
const cb_new = '/* Circle Checkbox */.diwa-task-cb {    width: 18px;    height: 18px;    min-width: 18px;    min-height: 18px;    aspect-ratio: 1 / 1;    flex: 0 0 auto;    border-radius: 50%;    border: 2px solid var(--background-modifier-border);    background: transparent;    display: flex;    align-items: center;    justify-content: center;    cursor: pointer;    transition: all 0.18s ease;}';
if (!css.includes(cb_old)) { console.error('CB BASE NOT FOUND'); process.exit(1); }
css = css.replace(cb_old, cb_new);
console.log('OK: .diwa-task-cb base fixed');

// === CHANGE 2: Fix .diwa-tactical-checkbox ===
const tac_old = '.diwa-tactical-checkbox {    width: 16px;    height: 16px;    border-radius: 4px;    border: 2px solid var(--text-faint);    flex-shrink: 0;    display: flex;    align-items: center;    justify-content: center;    transition: all 0.2s;}';
const tac_new = '.diwa-tactical-checkbox {    width: 16px;    height: 16px;    min-width: 16px;    min-height: 16px;    aspect-ratio: 1 / 1;    flex: 0 0 auto;    border-radius: 4px;    border: 2px solid var(--text-faint);    display: flex;    align-items: center;    justify-content: center;    transition: all 0.2s;}';
if (!css.includes(tac_old)) { console.error('TACTICAL CB NOT FOUND'); process.exit(1); }
css = css.replace(tac_old, tac_new);
console.log('OK: .diwa-tactical-checkbox fixed');

// === CHANGE 3: Replace tablet refinements media query with .is-tablet selectors ===
const media_old = '/* Tablet refinements \u2014 restore desktop-like density on tablets (\u2265768px short-edge) */@media (min-width: 768px) {    .is-mobile .diwa-task-row { padding: 10px 14px; }    .is-mobile .diwa-tactical-row { padding: 8px 14px; min-height: 40px; }    .is-mobile .diwa-pillar-item { padding: 12px 8px; min-height: 56px; gap: 6px; }    .is-mobile .diwa-pillar-item:hover { transform: translateY(-2px); box-shadow: var(--diwa-shadow-hover); }    .is-mobile .diwa-card:hover { transform: translateY(-2px); box-shadow: var(--diwa-shadow-hover); }    .is-mobile .diwa-cc-wrap { padding: 20px 16px var(--diwa-footer-clearance); gap: 18px; }    .is-mobile .diwa-cc-title { font-size: 1.45em; }    .is-mobile .diwa-cc-northstar { max-width: 400px; }    .is-mobile .diwa-zen-btn .svg-icon { width: 16px; height: 16px; }    .is-mobile .diwa-capture-fab { display: none; }}';

if (!css.includes(media_old)) {
    console.error('MEDIA BLOCK NOT FOUND');
    process.exit(1);
}

const media_new = `
/* ========================================================================
   TABLET OVERRIDES - body.is-tablet
   Applied by plugin at startup: Platform.isMobile && shortEdge >= 768px.
   body.is-tablet sits ALONGSIDE Obsidian's body.is-mobile (not a replacement).
   Architecture: phone (.is-mobile only) -> tablet (.is-mobile + .is-tablet) -> desktop (.is-desktop)
   ======================================================================== */

.is-tablet .diwa-task-row { padding: 10px 14px; }
.is-tablet .diwa-task-row--mobile { padding: 10px 14px; border-radius: 12px; }
.is-tablet .diwa-tactical-row { padding: 8px 14px; min-height: 40px; }
.is-tablet .diwa-pillar-item { padding: 12px 8px; min-height: 56px; gap: 6px; }
.is-tablet .diwa-pillar-item:hover { transform: translateY(-2px); box-shadow: var(--diwa-shadow-hover); }
.is-tablet .diwa-card:hover { transform: translateY(-2px); box-shadow: var(--diwa-shadow-hover); }
.is-tablet .diwa-cc-wrap { max-width: 900px; padding: 20px 16px var(--diwa-footer-clearance); gap: 18px; }
.is-tablet .diwa-cc-title { font-size: 1.45em; }
.is-tablet .diwa-cc-northstar { max-width: 400px; }
.is-tablet .diwa-zen-btn .svg-icon { width: 16px; height: 16px; }
.is-tablet .diwa-capture-fab { display: none; }
.is-tablet .diwa-task-cb {
  width: 20px !important;
  height: 20px !important;
  min-width: 20px !important;
  min-height: 20px !important;
  max-width: 20px !important;
  max-height: 20px !important;
  aspect-ratio: 1 / 1 !important;
  flex: 0 0 auto;
  border-radius: 50% !important;
}
.is-tablet .diwa-tactical-checkbox {
  width: 18px; height: 18px; min-width: 18px; min-height: 18px;
  aspect-ratio: 1 / 1; flex: 0 0 auto;
}`;

css = css.replace(media_old, media_new);
console.log('OK: tablet refinements media query -> .is-tablet');

// === CHANGE 4: Replace search panel media query with .is-tablet selectors ===
const search_old = '@media (min-width: 768px) {\r\n    .is-mobile .diwa-search-panel {\r\n        max-width: 580px;\r\n        max-height: 72vh;\r\n    }\r\n    .is-mobile .diwa-search-result-item { min-height: 56px; padding: 12px 14px; }\r\n    .is-mobile .diwa-search-scope-btn   { height: 30px; padding: 0 12px; }\r\n    .is-mobile .diwa-search-quickjump-btn { min-height: 72px; }\r\n    .is-mobile .diwa-search-footer {\r\n        padding-bottom: max(12px, env(safe-area-inset-bottom));\r\n    }\r\n}';
if (!css.includes(search_old)) { console.error('SEARCH MEDIA NOT FOUND'); process.exit(1); }
const search_new = '.is-tablet .diwa-search-panel {\r\n    max-width: 580px;\r\n    max-height: 72vh;\r\n}\r\n.is-tablet .diwa-search-result-item { min-height: 56px; padding: 12px 14px; }\r\n.is-tablet .diwa-search-scope-btn   { height: 30px; padding: 0 12px; }\r\n.is-tablet .diwa-search-quickjump-btn { min-height: 72px; }\r\n.is-tablet .diwa-search-footer {\r\n    padding-bottom: max(12px, env(safe-area-inset-bottom));\r\n}';
css = css.replace(search_old, search_new);
console.log('OK: search panel media query -> .is-tablet');

fs.writeFileSync('styles.css', css);
console.log('DONE: styles.css saved');
