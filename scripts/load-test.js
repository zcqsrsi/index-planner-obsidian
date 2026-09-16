/* Load harness: stubs the obsidian module so the plugin can be evaluated and
   onload() exercised under plain node — catches "failed to load plugin"
   class errors without opening Obsidian. Tests dist/main.js, the exact
   single file Obsidian loads, then drives renderRing and renderPane through
   a minimal regex DOM: enough tree (dataset, handlers, nested innerHTML) to
   click plates, tasks, pages, folds, quick-add inputs and menus and assert
   what fires. Run: node scripts/build.js && node scripts/load-test.js */

const Module = require('module');
const origLoad = Module._load;

function fakeEl() {
  return {
    classes: [],
    dataset: {},
    handlers: {},
    innerHTML: '',
    empty() {},
    addClass(c) { this.classes.push(c); },
    createEl() { return fakeEl(); },
    createDiv() { return fakeEl(); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
  };
}

function fakeApp() {
  return {
    workspace: {
      getLeaf: () => ({ openFile: async () => {}, setViewState: async () => {} }),
      getLeavesOfType: () => [],
      revealLeaf: () => {},
      on: () => ({}),
      getActiveFile: () => null,
    },
    metadataCache: { on: () => ({}) },
    vault: {
      on: () => ({}),
      getAbstractFileByPath: () => null,
      getMarkdownFiles: () => [],
      cachedRead: async () => '',
      read: async () => '',
      create: async () => {},
      createFolder: async () => {},
      copy: async () => {},
    },
  };
}

const stub = {
  Plugin: class Plugin {
    constructor(app, manifest) { this.app = app; this.manifest = manifest; }
  },
  ItemView: class ItemView {
    constructor(leaf) { this.leaf = leaf; this.contentEl = fakeEl(); this.app = fakeApp(); }
  },
  Modal: class Modal { open() {} close() {} },
  Menu: class Menu {
    constructor() { this.items = []; }
    addItem(cb) {
      const item = { title: '', fn: null };
      item.setTitle = (t) => { item.title = t; return item; };
      item.setIcon = () => item;
      item.onClick = (fn) => { item.fn = fn; return item; };
      this.items.push(item);
      cb(item);
      return this;
    }
    addSeparator() { return this; }
    showAtMouseEvent() { stub.lastMenu = this; }
  },
  Notice: class Notice { constructor(msg) { console.log('[Notice]', msg); } },
  PluginSettingTab: class PluginSettingTab {
    constructor(app, plugin) { this.app = app; this.plugin = plugin; this.containerEl = fakeEl(); }
  },
  Setting: class Setting {
    constructor(el) { this.el = el; }
    setName() { return this; }
    setDesc() { return this; }
    addText(cb) { cb({ setValue: () => this, onChange: () => this }); return this; }
    addToggle(cb) { cb({ setValue: () => this, onChange: () => this }); return this; }
    addDropdown(cb) { cb({ addOption: () => this, setValue: () => this, onChange: () => this }); return this; }
    addButton(cb) { cb({ setButtonText: () => this, setCta: () => this, onClick: () => this }); return this; }
  },
  debounce: (fn) => fn,
  addIcon: (name, svg) => { stub.icons = stub.icons || {}; stub.icons[name] = svg; },
  TFile: class TFile {},
  TFolder: class TFolder {},
  EditorSuggest: class EditorSuggest {
    constructor(app) { this.app = app; }
    close() {}
  },
  FuzzySuggestModal: class FuzzySuggestModal {
    setPlaceholder() {}
    open() { stub.lastFuzzy = this; }
  },
};

Module._load = function (request, parent, isMain) {
  if (request === 'obsidian') return stub;
  return origLoad.call(this, request, parent, isMain);
};

// ---- the regex DOM -------------------------------------------------------
// No real tree: querySelector(All) re-parses innerHTML for opening tags whose
// class list contains the selector (or that carry the [data-attr]). Nested
// content is captured up to the matching close tag — enough for the wiring
// code to find children and register handlers. Dataset keys camelCase as
// the DOM would; each parsed child remembers its parent element so
// parent-walking wiring (the legend group folds) works too.

function makeEl(html = '', dataset = {}) {
  return {
    _html: html,
    _cache: {}, // parsed children keyed by selector + match offset, so
    dataset,      // repeated queries return the SAME stub — handlers
    handlers: {}, // registered during wiring survive the test's queries
    hidden: false,
    value: '',
    textContent: '',
    style: {},
    parentElement: null,
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = v; this._cache = {}; },
    addEventListener(type, fn) { this.handlers[type] = fn; },
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute() {},
    getAttribute() { return null; },
    querySelector(sel) { return parseTags(this, sel)[0] || null; },
    querySelectorAll(sel) { return parseTags(this, sel); },
    click() { return this.handlers.click && this.handlers.click(); },
  };
}

function parseTags(el, sel) {
  const html = el._html;
  const wantClass = sel.startsWith('.');
  const wantAttr = !wantClass ? sel.slice(1, -1) : null;
  const out = [];
  const re = /<([a-z0-9]+)\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[1], attrs = m[2];
    const cls = (/class="([^"]*)"/.exec(attrs) || [])[1] || '';
    if (wantClass ? !cls.split(/\s+/).includes(sel.slice(1)) : !attrs.includes(wantAttr)) continue;
    const key = sel + '@' + m.index;
    if (!el._cache[key]) {
      const dataset = {};
      let d;
      const dre = /data-([\w-]+)="([^"]*)"/g;
      while ((d = dre.exec(attrs))) dataset[d[1].replace(/-([a-z])/g, (c) => c[1].toUpperCase())] = d[2];
      const end = html.indexOf(`</${tag}>`, re.lastIndex);
      const inner = end === -1 ? '' : html.slice(re.lastIndex, end);
      const child = makeEl(inner, dataset);
      child.parentElement = el;
      el._cache[key] = child;
    }
    out.push(el._cache[key]);
  }
  return out;
}

// ---- assertions -----------------------------------------------------------

let failures = 0;
function ok(cond, label) {
  console.log(`${cond ? 'ok' : 'FAIL'}  ${label}`);
  if (!cond) failures++;
}

// Dates relative to today, so the suite never rots.
const iso = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// "18 Sep" style — the month-name form parseDate and the date heat read.
const named = (offset) => {
  const d = new Date(Date.now() + offset * 86400000);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

(async () => {
  const PluginClass = require('../dist/main.js');
  if (typeof PluginClass !== 'function') throw new Error('dist/main.js does not export a class');
  console.log('exports a class:', PluginClass.name || '(anonymous)');

  const plugin = new PluginClass(fakeApp(), { id: 'index', name: 'Index', version: '0.4.0' });
  // The API surface Obsidian injects:
  const registeredSuggests = [];
  const registeredViews = {};
  Object.assign(plugin, {
    loadData: async () => ({}),
    saveData: async () => {},
    registerView: (t, f) => { registeredViews[t] = f; },
    addRibbonIcon: () => {},
    addCommand: () => {},
    addSettingTab: () => {},
    registerEvent: () => {},
    registerInterval: () => {},
    register: () => {},
    registerDomEvent: () => {},
    registerEditorSuggest: (s) => registeredSuggests.push(s),
    registerEditorExtension: () => {},
  });
  // onload passes `document` to registerDomEvent — the stub swallows the
  // call but the argument still evaluates, so a bare global must exist.
  global.document = global.document || { addEventListener() {} };
  await plugin.onload();
  console.log('onload() completed cleanly');
  console.log('settings:', JSON.stringify(plugin.settings));

  // The registered ring icon: a hollow stroked band with a filled floating
  // segment, two thin dash arcs top-left, all running large on the grid.
  const icon = stub.icons['index-mark'];
  ok(!!icon, 'onload registers the ring icon');
  ok(icon.includes('scale(1.3)'), 'the icon runs 1.3× large on the 100 grid');
  ok(icon.includes('fill="none" stroke="currentColor" stroke-width="3.6"'),
    'the band body is hollow — a stroke, not a fill');
  ok((icon.match(/fill="currentColor"/g) || []).length === 1,
    'only the floating segment stays filled');
  ok((icon.match(/A33 33 0 0 1/g) || []).length === 2,
    'two thin dash arcs ride the top-left of the band');

  // The ring renders against an empty vault (no Projects folder yet).
  const { renderRing } = require('../ring.js');
  const emptyHost = makeEl();
  renderRing(emptyHost, { projects: [], folderLabel: 'Projects' }, plugin.settings, { openFile: () => {} });
  ok(emptyHost.innerHTML.includes('No projects'), 'empty-vault render shows the empty state');
  ok(emptyHost.innerHTML.includes('data-new-project') && emptyHost.innerHTML.includes('＋ New project above starts one'),
    'the empty vault carries the overview bar, ＋ New project included');

  // ---- the map, driven end to end ----
  const fileA = { path: 'Projects/wet lab.md', stat: { ctime: 0 } };
  const model = {
    projects: [{
      name: 'wet lab', file: fileA, shelved: false, fate: 'overdue',
      folder: '', group: null, stale: [],
      open: [
        { text: 'extraction pipeline', due: '2020-01-02', line: 3, loose: true },
        { text: 'write up methods', due: null, line: 4, loose: false },
      ],
      loose: [{ text: 'extraction pipeline', due: '2020-01-02', line: 3 }],
      done: 2, total: 4,
      pages: [
        { name: 'R baseline', file: { path: 'Pages/wet lab/R baseline.md' }, mtime: 2 },
        { name: 'Notes', file: { path: 'Pages/wet lab/Notes.md' }, mtime: 1 },
      ],
    }],
    folderLabel: 'Projects', pagesFolder: 'Pages',
  };

  const calls = { openFile: [], openProject: [], setSetting: [], createProject: 0 };
  const cb = {
    openFile: (...a) => calls.openFile.push(a),
    openProject: (...a) => calls.openProject.push(a),
    setSetting: (k, v) => calls.setSetting.push([k, v]),
    createProject: () => { calls.createProject++; },
  };

  const host = makeEl();
  renderRing(host, model, plugin.settings, cb);
  ok(!host.innerHTML.includes('ir-detail'), 'the map carries no embedded pane — the pane is its own leaf now');
  ok(host.innerHTML.includes('ir-projects-head'), 'projects list fold button present');
  ok(host.innerHTML.includes('ir-rotor') && host.innerHTML.includes('drop-shadow') === false,
    'the ring renders with its rotor (the glow lives in styles.css)');

  // The fold button hides the projects list and persists the choice.
  host.querySelector('.ir-projects-head').click();
  ok(JSON.stringify(calls.setSetting) === JSON.stringify([['showProjects', false]]),
    'fold click persists showProjects=false');

  // ---- the overview bar, the app's hideable hero ----
  ok(host.innerHTML.includes('ir-hero') && host.innerHTML.includes('ir-hero-day'),
    'the overview bar renders the day up top, as the app hero');
  ok(host.innerHTML.includes('ir-chip-od'),
    'an overdue loose end shows as an overdue chip');
  ok(host.innerHTML.includes('data-new-project') && host.innerHTML.includes('＋ New project'),
    'the overview carries its ＋ New project action');
  host.querySelector('[data-new-project]').click();
  ok(calls.createProject === 1, '＋ New project hands off to the plugin');
  host.querySelector('[data-overview-toggle]').click();
  ok(JSON.stringify(calls.setSetting[1]) === JSON.stringify(['overviewHidden', true]),
    'the ⌄ overview toggle hides the bar through settings');
  ok(host.innerHTML.indexOf('ir-legend') < host.innerHTML.indexOf('ir-projects-head'),
    'the projects list is docked: rows above the fold head at the bottom');

  // Hidden, the hero leaves only its ⌃ link.
  const hiddenHost = makeEl();
  renderRing(hiddenHost, model, Object.assign({}, plugin.settings, { overviewHidden: true }), cb);
  ok(!hiddenHost.innerHTML.includes('ir-hero') && hiddenHost.innerHTML.includes('data-overview-toggle'),
    'a hidden overview renders only the ⌃ overview link');
  hiddenHost.querySelector('[data-overview-toggle]').click();
  ok(JSON.stringify(calls.setSetting[calls.setSetting.length - 1]) === JSON.stringify(['overviewHidden', false]),
    'the ⌃ link brings the overview back');

  // The toggle must LAND, not just persist: the hero and its hidden link
  // are different shapes with no in-place move, so the map view re-renders
  // on setSetting — v0.5.7 shipped a toggle that only saved and looked dead.
  const ringView = registeredViews['index-ring-view']({});
  await ringView.render();
  ok(ringView.contentEl.innerHTML.includes('ir-hero'),
    'the map view renders its hero');
  ringView.setSetting('overviewHidden', true);
  await new Promise((r) => setTimeout(r, 0)); // the re-render is async
  ok(ringView.contentEl.innerHTML.includes('ir-overview-row')
    && !ringView.contentEl.innerHTML.includes('ir-hero-date'),
    'the view re-renders on the toggle — the hero swaps for the ⌃ link');

  // ---- the legend: groups, shelf, stale badges ----
  const legendModel = {
    projects: [
      { name: 'flat', file: fileA, folder: '', group: null, fate: 'healthy', stale: [],
        open: [{ text: 'x', line: 1 }], loose: [], done: 0, total: 1, pages: [] },
      { name: 'methods paper', file: fileA, folder: 'papers',
        group: { name: 'papers', color: null, question: 'the shared big picture' },
        fate: 'stale', stale: [{ text: 'old thread' }],
        open: [{ text: 'y', line: 2 }], loose: [], done: 0, total: 1, pages: [] },
      { name: 'virus reading', file: fileA, folder: 'Literature', group: null, fate: 'healthy',
        stale: [], open: [], loose: [], done: 0, total: 0, pages: [] },
      { name: 'old project', file: fileA, folder: '', group: null, shelved: true, fate: 'healthy',
        stale: [], open: [], loose: [], done: 0, total: 0, pages: [] },
    ],
    folderLabel: 'Projects', pagesFolder: 'Pages',
  };
  const lhost = makeEl();
  const lcb = { openFile: () => {}, openProject: () => {}, setSetting: () => {} };
  renderRing(lhost, legendModel, plugin.settings, lcb);
  ok(lhost.querySelectorAll('.ir-legend-item').length === 4,
    `every project keeps a row, shelved included (got ${lhost.querySelectorAll('.ir-legend-item').length})`);
  ok(lhost.querySelectorAll('.ir-legend-group-head').length === 2,
    `foldered projects fold under group headers (got ${lhost.querySelectorAll('.ir-legend-group-head').length})`);
  ok(lhost.innerHTML.includes('Shelf'), 'shelved projects ride in a Shelf section');
  ok(lhost.innerHTML.includes('ir-stale-badge'), 'a legend row carries its stale count as a badge');
  const ghead = lhost.querySelectorAll('.ir-legend-group-head')[0];
  const gblock = ghead.parentElement.querySelector('.ir-legend-group-block');
  ghead.click();
  ok(gblock.hidden === true, 'a group fold closes in place, session-only');
  ghead.click();
  ok(gblock.hidden === false, 'a second group fold click reopens it');

  // Clicking a plate or a list row opens the project pane for that project.
  host.querySelectorAll('.ir-plate-g')[0].click();
  ok(JSON.stringify(calls.openProject) === JSON.stringify([['wet lab']]),
    'plate click opens the project pane');
  ok(calls.openFile.length === 0, 'a plate click opens no file by itself');
  host.querySelectorAll('.ir-legend-item')[0].click();
  ok(calls.openProject.length === 2 && calls.openProject[1][0] === 'wet lab',
    'list-row click opens the project pane too');

  // The spin keeps its phase across the rebuilds every note edit causes:
  // driven from the host element, frozen only under the pointer.
  const spinHost = makeEl();
  const spinCb = { openFile: () => {}, openProject: () => {}, setSetting: () => {} };
  renderRing(spinHost, model, plugin.settings, spinCb);
  ok(/^rotate\(/.test(spinHost.querySelector('.ir-rotor').style.transform || ''),
    'the rotor turns by inline transform, driven from ring.js');
  const spin = spinHost._spin;
  ok(!!spin, 'the spin phase lives on the host, not the DOM');
  spin.angle = 300; // as if 125s of spin had passed
  renderRing(spinHost, model, plugin.settings, spinCb);
  ok(spinHost._spin === spin
    && spinHost.querySelector('.ir-rotor').style.transform.startsWith('rotate(300'),
    'a rebuilt rotor resumes at its phase, never snapping back to 0°');
  spinHost.querySelector('.ir-ring').handlers.mouseenter();
  spin.t0 -= 60000; // a long hover, then a rebuild underneath it
  renderRing(spinHost, model, plugin.settings, spinCb);
  ok(spinHost.querySelector('.ir-rotor').style.transform.startsWith('rotate(300'),
    'hovering freezes the spin through a rebuild too');
  spinHost.querySelector('.ir-ring').handlers.mouseleave();
  spin.t0 -= 60; // 60ms of turning
  renderRing(spinHost, model, plugin.settings, spinCb);
  ok(parseFloat(spinHost.querySelector('.ir-rotor').style.transform.replace(/[^\d.]/g, '')) > 300,
    'leaving the ring resumes the spin');

  // ---- parseDate, ported from the journal ----
  const { parseDate, parseQuestLog, buildModel } = require('../scanner.js');
  const year = new Date().getFullYear();
  const pad = (n) => String(n).padStart(2, '0');
  ok(parseDate('2026-09-15') === '2026-09-15', 'parseDate reads ISO');
  ok(parseDate('15/09/2026') === '2026-09-15', 'parseDate reads day/month/year');
  ok(parseDate('15.9.26') === '2026-09-15', 'parseDate reads dotted two-digit years');
  ok(parseDate(`15 Sep ${year}`) === `${year}-09-15`, 'parseDate reads "15 Sep"');
  ok(parseDate(`Sep 15`) === `${year}-09-15`, 'parseDate reads "Sep 15"');
  ok(parseDate(`15th September ${year}`) === `${year}-09-15`, 'parseDate strips ordinals');
  ok(parseDate(`Tuesday 15 Sep ${year}`) === `${year}-09-15`, 'parseDate strips a leading weekday');
  ok(parseDate('banana') === null, 'parseDate rejects non-dates');
  ok(parseDate('15 Xyz 2026') === null, 'parseDate rejects fake months');

  // ---- the quest log: containers carry their line, tasks their day ----
  const qlog = parseQuestLog([
    '## Aim one',
    '### Sub one',
    '- [ ] direct task',
    `#### ${iso(-1)}`,
    '- [ ] day task',
  ].join('\n'));
  ok(qlog.aims[0].line === 0 && qlog.aims[0].subs[0].line === 1,
    'containers carry their heading line for the write side');
  ok(qlog.aims[0].subs[0].days[0].tasks[0].day === iso(-1),
    'a day-row task remembers its day');

  // ---- the drag-and-drop surgery, pure over lines ----
  // The moves the pane's drop handlers name, verified on a synthetic note
  // and read back through parseQuestLog — the same reader the pane uses.
  const { movedTaskLines, movedSubLines } = require('../scanner.js');
  const dragNote = () => [
    '- [ ] floater',
    '## Aim one',
    '### Sub one',
    `#### ${iso(-2)}`,
    '- [ ] old one',
    `#### ${iso(0)}`,
    '- [ ] first today',
    '### Sub two',
    '- [ ] sub two task',
    '## Aim two',
    '- [ ] aim two task',
  ];
  {
    const ls = dragNote();
    const out = movedTaskLines(ls, { line: 6, text: 'first today' },
      { mode: 'before', target: { line: 4, text: 'old one' } });
    ok(out && out[4] === '- [ ] first today' && out[5] === '- [ ] old one',
      'a task dropped on another lands above it');
  }
  {
    const ls = dragNote();
    const out = movedTaskLines(ls, { line: 0, text: 'floater' },
      { mode: 'today', aimIdx: 0, subIdx: 0 });
    const back = parseQuestLog((out || []).join('\n'));
    const day = back.aims[0] && back.aims[0].subs[0].days.find((d) => d.name === iso(0));
    ok(out && day && day.tasks.map((t) => t.text).join('|') === 'first today|floater',
      'an unfiled task dropped on a sub-objective joins its today row');
  }
  {
    const ls = ['- [ ] floater', '## Aim one', '### Sub one', '- [ ] direct', '## Aim two'];
    const out = movedTaskLines(ls, { line: 0, text: 'floater' },
      { mode: 'today', aimIdx: 0, subIdx: 0 });
    ok(out && out.join('\n').includes(`#### ${iso(0)}\n\n- [ ] floater`),
      'dropping into a sub-objective with no today row creates the row, as quick-add does');
  }
  {
    const ls = dragNote();
    const out = movedTaskLines(ls, { line: 10, text: 'aim two task' }, { mode: 'unfiled' });
    ok(out && out[out.length - 1] === '- [ ] aim two task',
      "a task dropped on the unfiled head goes floating at the note's end");
  }
  {
    const ls = dragNote();
    const out = movedTaskLines(ls, { line: 4, text: 'old one' }, { mode: 'aim', aimIdx: 1 });
    ok(out && out[out.length - 1] === '- [ ] old one',
      "a task dropped on an aim's head lands at that aim's end");
  }
  {
    const ls = dragNote();
    const t = { line: 6, text: 'first today' };
    ok(movedTaskLines(ls, t, { mode: 'before', target: t }) === null,
      'a task dropped on itself leaves the note untouched');
    ok(movedTaskLines(ls, t, { mode: 'before', target: { line: 4, text: 'nothing matches' } }) === null,
      'a destination that cannot be found aborts the move, note untouched');
  }
  {
    const ls = dragNote();
    const out = movedSubLines(ls, { aimIdx: 0, subIdx: 1 }, { mode: 'before', aimIdx: 0, subIdx: 0 });
    ok(out && out.indexOf('### Sub two') < out.indexOf('### Sub one'),
      'a sub-objective dropped on another lands before it');
  }
  {
    const ls = dragNote();
    const out = movedSubLines(ls, { aimIdx: 0, subIdx: 0 }, { mode: 'aim', aimIdx: 1 });
    const back = parseQuestLog((out || []).join('\n'));
    ok(out && back.aims[1] && back.aims[1].subs.length === 1
      && back.aims[1].subs[0].name === 'Sub one' && back.aims[1].subs[0].days.length === 2,
      'a sub-objective dropped on an aim moves there whole — day rows and tasks with it');
  }
  ok(movedSubLines(dragNote(), { aimIdx: 0, subIdx: 0 }, { mode: 'before', aimIdx: 0, subIdx: 0 }) === null,
    'a sub-objective dropped on itself stays put');

  // ---- the project pane, driven end to end ----
  const { renderPane } = require('../pane.js');
  const fileMethods = { path: 'Projects/papers/methods paper.md', stat: { ctime: 0 } };
  const pageFile = { path: 'Pages/methods paper/R baseline.md' };
  const PAST = iso(-5), TODAY = iso(0);
  const proj = {
    name: 'methods paper', file: fileMethods, shelved: false, fate: 'stale',
    question: 'finalise the methods paper by September',
    open: [{}, {}], loose: [],
    stale: [{ text: 'old thread' }],
    done: 1, total: 3,
    group: { name: 'papers', color: null, question: null },
    log: {
      aims: [{
        name: `Ship the figure by ${named(20)}`,
        subs: [{
          name: 'Setting up browser files',
          days: [{
            name: PAST,
            tasks: [{ text: `re-run the ${named(-1)} batch`, line: 7, status: 'open' }],
          }, {
            name: TODAY,
            tasks: [{ text: `align tracks by ${named(6)}`, line: 9, status: 'open' }],
          }],
          tasks: [],
        }],
        tasks: [],
      }],
      unfiled: [{ text: 'adrift task', line: 20, status: 'open', file: { path: 'Journal.md' } }],
      allTasks: [],
    },
    pages: [
      { name: 'R baseline', file: pageFile, mtime: 2, section: 'Setting up browser files' },
      { name: 'why did the replicate fail?', file: { path: 'Pages/Open questions/R baseline/q.md' }, mtime: 1, section: 'Open questions' },
    ],
  };
  const paneCalls = { openNote: [], setSetting: [], addTask: [], addAim: 0, addSub: [], taskMenu: [], tickTask: [], headingMenu: [], addPage: 0, openGraph: 0, pageMenu: [], toggleNotes: 0, toggleQuestions: 0, editBp: 0, moveTask: [], moveSub: [] };
  const paneHost = makeEl();
  renderPane(paneHost, proj, { paneTasks: true, staleDays: 3 }, {
    openNote: (...a) => paneCalls.openNote.push(a),
    setSetting: (k, v) => paneCalls.setSetting.push([k, v]),
    addTask: (...a) => paneCalls.addTask.push(a),
    addAim: () => { paneCalls.addAim++; },
    addSub: (i) => { paneCalls.addSub.push(i); },
    tickTask: (t) => { paneCalls.tickTask.push(t); },
    headingMenu: (spec, ev) => { paneCalls.headingMenu.push([spec, ev]); },
    addPage: () => { paneCalls.addPage++; },
    openGraph: () => { paneCalls.openGraph++; },
    taskMenu: (t, ev) => { paneCalls.taskMenu.push([t, ev]); },
    pageMenu: (pg, ev) => { paneCalls.pageMenu.push([pg, ev]); },
    toggleNotes: () => { paneCalls.toggleNotes++; },
    toggleQuestions: () => { paneCalls.toggleQuestions++; },
    editBp: () => { paneCalls.editBp++; },
    moveTask: (...a) => paneCalls.moveTask.push(a),
    moveSub: (...a) => paneCalls.moveSub.push(a),
  }, 'Pages');
  ok(paneHost.innerHTML.includes('Big picture'), 'big picture banner from the question field');
  ok(paneHost.innerHTML.includes('data-edit-bp'), 'the big picture carries its edit pencil');
  paneHost.querySelector('[data-edit-bp]').click();
  ok(paneCalls.editBp === 1, 'the pencil hands the big picture to the view');
  ok(paneHost.innerHTML.includes('Ship the figure by'), 'aim from the ## heading');
  ok(paneHost.innerHTML.includes('Setting up browser files'), 'sub-objective from the ### heading');
  ok(paneHost.innerHTML.includes(PAST), 'day row from the #### heading');
  ok(paneHost.innerHTML.includes('Unfiled'), 'floating tasks ride in the unfiled bucket');

  // Today's row: the past row's open task is carried into it with a "from"
  // chip; its own row keeps it with a "still open" hint.
  ok(paneHost.innerHTML.includes(`from ${PAST}`), "a carried task wears its 'from' chip");
  ok(paneHost.innerHTML.includes('still open'), "its own past row keeps the 'still open' hint");
  ok(paneHost.innerHTML.includes('ir-day-pulse'), "today's row head carries the day pulse");
  ok(paneHost.querySelectorAll('.ir-task').length === 4,
    `a row per task, carried ones doubled into today (got ${paneHost.querySelectorAll('.ir-task').length})`);
  ok(paneHost.innerHTML.includes('is-done') || proj.done, 'done styling rides the row classes');

  // Inline date heat: hot ≤2 days out (overdue included), warm ≤7, cold ≤31.
  ok(paneHost.innerHTML.includes('ir-date-hot'), 'an overdue date reads hot');
  ok(paneHost.innerHTML.includes('ir-date-warm'), 'a week-out date reads warm');
  ok(paneHost.innerHTML.includes('ir-date-cold'), 'a month-out date reads cold');

  // The pane head: stale badge + progress nodes.
  ok(paneHost.innerHTML.includes('1 stale'), 'the pane head carries a stale badge');
  ok(paneHost.innerHTML.includes('ir-pg-node is-done') && paneHost.innerHTML.includes('ir-pg-node is-current'),
    'progress nodes fill with done and pulse the current one');

  // The glyph settings, as the app's Settings → Projects: the progress
  // glyph's five styles, and the day pulse switched off.
  const glyphCb = { openNote: () => {}, setSetting: () => {}, addTask: () => {}, addAim: () => {},
    addSub: () => {}, tickTask: () => {}, headingMenu: () => {}, addPage: () => {}, taskMenu: () => {} };
  for (const [style, mark] of [
    ['pulse', 'is-pulse'], ['nodes', 'is-nodes'],
    ['bar', 'ir-progress-bar'], ['comet', 'ir-pg-comet'], ['filament', 'ir-pg-filament'],
  ]) {
    const g = makeEl();
    renderPane(g, proj, { paneTasks: true, staleDays: 3, progressStyle: style }, glyphCb, 'Pages');
    ok(g.innerHTML.includes(mark) && g.innerHTML.includes('title="1/3 done"'),
      `progress glyph style ${style} renders its mark`);
  }
  {
    const quiet = makeEl();
    renderPane(quiet, proj, { paneTasks: true, staleDays: 3, dayPulse: false }, glyphCb, 'Pages');
    ok(!quiet.innerHTML.includes('ir-day-pulse'), 'day pulse off leaves today\'s row head bare');
  }
  {
    // No open tasks: the comet parks at the far end — a finished thing
    // does not move.
    const done = { ...proj, open: [], done: 3, total: 3 };
    const chost = makeEl();
    renderPane(chost, done, { paneTasks: true, staleDays: 3, progressStyle: 'comet' }, glyphCb, 'Pages');
    ok(chost.innerHTML.includes('ir-pg-comet is-idle'), 'the comet rests when every task is done');
    const chostOpen = makeEl();
    renderPane(chostOpen, proj, { paneTasks: true, staleDays: 3, progressStyle: 'comet' }, glyphCb, 'Pages');
    ok(!chostOpen.innerHTML.includes('is-idle'), 'open work keeps the comet moving');
  }

  // The pane is the editor: a task click is Index's tick cycle — the write
  // side gets the task, no leaf. Double-click opens the real note at the
  // line, for prose.
  const rows = paneHost.querySelectorAll('.ir-task');
  rows[0].click();
  ok(paneCalls.tickTask.length === 1 && paneCalls.tickTask[0].line === 7 && paneCalls.openNote.length === 0,
    'a task click hands the tick to the write side, opening no leaf');
  rows[0].handlers.dblclick();
  ok(JSON.stringify(paneCalls.openNote[0]) === JSON.stringify([fileMethods, 7]),
    'a task double-click opens the note at its line');
  rows[3].handlers.dblclick(); // the unfiled row — its own file
  ok(paneCalls.openNote[1] && paneCalls.openNote[1][0].path === 'Journal.md' && paneCalls.openNote[1][1] === 20,
    'a floating task opens its own note');
  // ＋ Page lives at the Notes side's bottom — always, so even a project
  // with no pages can create its first one; the pane head carries no
  // Pages button any more (the notes ride with their aims instead).
  ok(!paneHost.innerHTML.includes('data-pages') && !paneHost.innerHTML.includes('>Pages</button>'),
    'the pane head carries no Pages button');
  const addPageBtns = paneHost.querySelectorAll('[data-add-page]');
  ok(addPageBtns.length === 1, `one ＋ Page affordance, at the Notes side's bottom (got ${addPageBtns.length})`);
  addPageBtns[0].click();
  ok(paneCalls.addPage === 1, '＋ Page at the bottom of the list hands a new page over');
  {
    const bare = { ...proj, pages: [] };
    const bhost = makeEl();
    let bareAdds = 0;
    renderPane(bhost, bare, { paneTasks: true, staleDays: 3 },
      { openNote: () => {}, setSetting: () => {}, addTask: () => {}, addAim: () => {},
        addSub: () => {}, tickTask: () => {}, headingMenu: () => {},
        addPage: () => { bareAdds++; }, taskMenu: () => {} }, 'Pages');
    bhost.querySelector('[data-add-page]').click();
    ok(bareAdds === 1 && bhost.innerHTML.includes('>＋ Page</button>'),
      'with no pages joined ＋ Page is still there — an empty project can start one');
  }
  // The pane's bottom folds, as the Tasks fold at the top: Notes and Open
  // questions closed by default (the pane is the quest log), their rows
  // wired inside, the project-note row opening the raw note.
  ok(!paneHost.innerHTML.includes('ir-pane-foot') && paneHost.innerHTML.includes('data-fold-notes'),
    'no foot bar — the extras are folds matching the Tasks fold');
  ok(paneHost.innerHTML.includes('data-extra-notes hidden')
    && paneHost.innerHTML.includes('aria-expanded="false">'),
    'the Notes fold starts closed');
  paneHost.querySelector('[data-fold-notes]').click();
  ok(paneCalls.toggleNotes === 1, 'the Notes fold hands the toggle to the view');
  paneHost.querySelector('[data-fold-qs]').click();
  ok(paneCalls.toggleQuestions === 1, 'the Open questions fold hands its toggle over');
  paneHost.querySelector('[data-open-note]').click();
  ok(JSON.stringify(paneCalls.openNote[2]) === JSON.stringify([fileMethods]),
    'the project-note row opens the raw note');
  paneHost.querySelectorAll('.ir-page-item')[0].click();
  ok(JSON.stringify(paneCalls.openNote[3]) === JSON.stringify([pageFile]),
    'page click opens the page beside the pane');
  paneCalls.pageMenu = [];
  paneHost.querySelectorAll('.ir-page-item')[0].handlers.contextmenu({ preventDefault() {} });
  ok(paneCalls.pageMenu.length === 1 && paneCalls.pageMenu[0][0].name === 'R baseline',
    'a page row\'s right-click hands the page to its menu');
  ok(paneHost.innerHTML.includes('ir-pages-section') && paneHost.innerHTML.includes('Setting up browser files'),
    'pages group under their sub-objective');
  ok(paneHost.innerHTML.indexOf('data-extra-qs') < paneHost.innerHTML.indexOf('why did the replicate fail?')
    && paneHost.querySelectorAll('.ir-page-item').length === 3,
    'a question rides only inside its own fold — three page rows: aim, Notes, questions');
  ok(paneHost.innerHTML.includes('>1 page</span>'),
    'the Notes fold names its visible pages, questions not among them');
  ok(paneHost.innerHTML.includes('data-extra-qs hidden'),
    'the Open questions fold starts closed too');

  // An aim's notes, as Index tied them to the sections: a notes button
  // beside the aim head with the page count, opening its pages in place
  // under it. The open state rides a pane-own Set, so the re-render every
  // note edit causes keeps the open lists open.
  ok(paneHost.innerHTML.includes('data-notes') && paneHost.innerHTML.includes('notes · 1'),
    'an aim carrying pages gets its notes button with the count');
  {
    const open = new Set();
    const nhost = makeEl();
    renderPane(nhost, proj, { paneTasks: true, staleDays: 3 }, {
      openNote: (...a) => paneCalls.openNote.push(a), setSetting: () => {},
      addTask: () => {}, addAim: () => {}, addSub: () => {}, tickTask: () => {},
      headingMenu: () => {}, addPage: () => {}, openGraph: () => {}, taskMenu: () => {},
      pageMenu: (pg, ev) => paneCalls.pageMenu.push([pg, ev]),
      editBp: () => {}, moveTask: () => {}, moveSub: () => {},
    }, 'Pages', open);
    ok(nhost.innerHTML.includes('data-aim-pages="0" hidden'), 'the aim\'s notes start closed');
    nhost.querySelector('[data-notes]').click();
    const list = nhost.querySelector('[data-aim-pages="0"]');
    ok(list && list.hidden === false && open.has(0),
      'the notes button opens the list in place, no rebuild');
    renderPane(nhost, proj, { paneTasks: true, staleDays: 3 }, {
      openNote: (...a) => paneCalls.openNote.push(a), setSetting: () => {},
      addTask: () => {}, addAim: () => {}, addSub: () => {}, tickTask: () => {},
      headingMenu: () => {}, addPage: () => {},
      taskMenu: () => {}, pageMenu: (pg, ev) => paneCalls.pageMenu.push([pg, ev]),
      moveTask: () => {}, moveSub: () => {},
    }, 'Pages', open);
    ok(nhost.innerHTML.includes('data-aim-pages="0">'),
      'a re-render keeps the aim\'s notes open — the state rides the pane\'s Set');
    nhost.querySelectorAll('.ir-page-item')[0].click();
    ok(JSON.stringify(paneCalls.openNote[paneCalls.openNote.length - 1]) === JSON.stringify([pageFile]),
      'a page row in the expansion opens the page beside the pane');
    paneCalls.pageMenu = [];
    nhost.querySelectorAll('.ir-page-item')[0].handlers.contextmenu({ preventDefault() {} });
    ok(paneCalls.pageMenu.length === 1 && paneCalls.pageMenu[0][0].name === 'R baseline',
      'the expansion\'s rows carry the page menu too');
    nhost.querySelector('[data-notes]').click();
    ok(nhost.querySelector('[data-aim-pages="0"]').hidden === true && !open.has(0),
      'a second click closes the list again');
  }

  // The graph jump: the head's Graph button hands the constellation over.
  ok(paneHost.innerHTML.includes('>Graph</button>'), 'the pane head carries a Graph button');
  paneHost.querySelector('[data-graph]').click();
  ok(paneCalls.openGraph === 1, 'the Graph button hands the jump to the view');

  // The ⋯ menu's own behavior lives on the view side — tested below, where
  // the registered view instance and the menu stub are at hand.

  // Heading menus in the pane: right-click an aim or sub-objective head.
  paneHost.querySelector('.ir-aim-head').handlers.contextmenu({ preventDefault() {} });
  paneHost.querySelectorAll('.ir-sub-head')[0].handlers.contextmenu({ preventDefault() {} });
  ok(paneCalls.headingMenu.length === 2 && paneCalls.headingMenu[1][0].subIdx === 0,
    'right-click on aim and sub heads hands their menu over');

  // The task menu: ⋯ click and right-click both hand the task to the view.
  paneHost.querySelectorAll('.ir-task-more')[0].handlers.click({ stopPropagation() {} });
  ok(paneCalls.taskMenu.length === 1 && paneCalls.taskMenu[0][0].line === 7,
    'the ⋯ button opens the task menu');
  rows[0].handlers.contextmenu({ preventDefault() {} });
  ok(paneCalls.taskMenu.length === 2, 'right-click opens the task menu too');

  // Quick-add: Enter in today's row input hands the task to the view.
  const addInputs = paneHost.querySelectorAll('[data-add-task]');
  ok(addInputs.length === 2, 'a quick-add input in today\'s row and in unfiled');
  addInputs[0].value = 'fresh task';
  addInputs[0].handlers.keydown({ key: 'Enter', preventDefault() {} });
  ok(JSON.stringify(paneCalls.addTask[0]) === JSON.stringify([{ kind: 'today', aimIdx: 0, subIdx: 0 }, 'fresh task']),
    'quick-add hands today\'s task to the write side');
  addInputs[1].value = 'floating';
  addInputs[1].handlers.keydown({ key: 'Enter', preventDefault() {} });
  ok(JSON.stringify(paneCalls.addTask[1]) === JSON.stringify([{ kind: 'unfiled' }, 'floating']),
    'the unfiled input hands a floating task over');
  addInputs[0].value = 'still typing';
  addInputs[0].handlers.keydown({ key: 'a', preventDefault() {} });
  ok(paneCalls.addTask.length === 2, 'plain typing does not fire the write side');

  // ＋ Aim / ＋ Sub-objective buttons.
  paneHost.querySelector('[data-add-aim]').click();
  ok(paneCalls.addAim === 1, '＋ Aim hands over to the name prompt');
  paneHost.querySelectorAll('[data-add-sub]')[0].click(); // the log-top one, aimIdx -1
  ok(JSON.stringify(paneCalls.addSub) === JSON.stringify([-1]),
    '＋ Sub-objective hands its aim index over');

  // ---- drag and drop, the pane's reorder ----
  // (fixture rows: [0] the carried duplicate in today's row, [1] today's
  // own task, [2] the past row's still-open original, [3] the unfiled
  // task — a foreign file's, never pickable)
  ok(rows[1].dataset.drag === '1' && rows[2].dataset.drag === '1',
    "the project note's own task rows are pickable");
  ok(rows[0].dataset.drag === undefined && rows[3].dataset.drag === undefined,
    'a carried duplicate and a foreign file\'s task are not pickable');
  const fakeDT = () => ({ setData: () => {}, effectAllowed: null });
  const subHead = paneHost.querySelectorAll('.ir-sub-head')[0];
  const aimHead = paneHost.querySelectorAll('.ir-aim-head')[0];
  const unfiledHead = paneHost.querySelectorAll('.ir-aim-head')[1]; // the unfiled bucket's own head
  // A task dropped on another task lands above it.
  rows[1].handlers.dragstart({ dataTransfer: fakeDT() });
  rows[2].handlers.dragover({ preventDefault() {} });
  rows[2].handlers.drop({ preventDefault() {} });
  ok(paneCalls.moveTask.length === 1 && paneCalls.moveTask[0][0].line === 9
    && paneCalls.moveTask[0][1].mode === 'before' && paneCalls.moveTask[0][1].target.line === 7,
    'a task dropped on another is handed over to land above it');
  // On a sub-objective's head: into its today row. On a carried duplicate:
  // the same — its own line is in a past day.
  rows[1].handlers.dragstart({ dataTransfer: fakeDT() });
  subHead.handlers.drop({ preventDefault() {} });
  rows[1].handlers.dragstart({ dataTransfer: fakeDT() });
  rows[0].handlers.drop({ preventDefault() {} });
  ok(paneCalls.moveTask.length === 3
    && JSON.stringify(paneCalls.moveTask[1][1]) === JSON.stringify({ mode: 'today', aimIdx: 0, subIdx: 0 })
    && JSON.stringify(paneCalls.moveTask[2][1]) === JSON.stringify({ mode: 'today', aimIdx: 0, subIdx: 0 }),
    'a task dropped on a sub-objective head — or a carried row — goes to that sub\'s today row');
  // On an aim head: under that aim. On the unfiled head: floating.
  rows[1].handlers.dragstart({ dataTransfer: fakeDT() });
  aimHead.handlers.drop({ preventDefault() {} });
  rows[1].handlers.dragstart({ dataTransfer: fakeDT() });
  unfiledHead.handlers.drop({ preventDefault() {} });
  ok(paneCalls.moveTask.length === 5
    && JSON.stringify(paneCalls.moveTask[3][1]) === JSON.stringify({ mode: 'aim', aimIdx: 0 })
    && paneCalls.moveTask[4][1].mode === 'unfiled',
    'a task dropped on an aim head lands under the aim; on the unfiled head, afloat');
  // A drop with nothing picked up does nothing — the drag ended, or never
  // started on anything pickable.
  aimHead.handlers.drop({ preventDefault() {} });
  ok(paneCalls.moveTask.length === 5, 'a drop with nothing picked up changes nothing');
  // A sub-objective drags its whole block: onto an aim, to that aim's end.
  subHead.handlers.dragstart({ dataTransfer: fakeDT() });
  aimHead.handlers.drop({ preventDefault() {} });
  ok(paneCalls.moveSub.length === 1
    && JSON.stringify(paneCalls.moveSub[0]) === JSON.stringify([{ kind: 'sub', aimIdx: 0, subIdx: 0 }, { mode: 'aim', aimIdx: 0 }]),
    'a sub-objective dropped on an aim head hands its whole block over');
  // Onto itself: nothing.
  subHead.handlers.dragstart({ dataTransfer: fakeDT() });
  subHead.handlers.drop({ preventDefault() {} });
  ok(paneCalls.moveSub.length === 1, 'a sub-objective dropped on itself stays put');

  // The tasks fold away behind their header, in place, persisted.
  paneHost.querySelector('[data-fold-tasks]').click();
  ok(JSON.stringify(paneCalls.setSetting) === JSON.stringify([['paneTasks', false]]),
    'tasks fold persists paneTasks=false');
  ok(paneHost.querySelector('.ir-log-body').hidden === true,
    'the fold hides the quest log in place, no rebuild needed');
  paneHost.querySelector('[data-fold-tasks]').click();
  ok(paneHost.querySelector('.ir-log-body').hidden === false,
    'a second fold click brings the quest log back');

  // ---- the scanner against a nested vault ----
  // Projects/flat.md (no frontmatter, top level → project), Literature/
  // holds two projects (a loose note there joins nothing — ambiguous), and
  // papers/ holds a folder note (group meta: colour + shared big picture),
  // one project with a loose note beside it (→ its page).
  const { convertNotebooks } = require('../importer.js');
  const note = (path, content, fm) => ({
    path, basename: path.split('/').pop().replace(/\.md$/, ''),
    extension: 'md', children: undefined, stat: { ctime: 0, mtime: 0 },
    _c: content, _fm: fm,
  });
  const dir = (name, children) => ({ name, children });
  const methodsNote = [
    '## Fix and finalise figure 6',
    '',
    '### Setting up browser files',
    '',
    '#### 2026-09-04',
    '',
    '- [ ] check the template ➕ 2026-09-04',
    '- [x] set up bedpe files ➕ 2026-09-04',
    '',
    '## General bits',
    '',
    '- [ ] write the caption',
  ].join('\n');
  const nestedApp = {
    metadataCache: { getFileCache: (f) => ({ frontmatter: f._fm }) },
    vault: {
      getAbstractFileByPath: (p) =>
        p === 'Projects' ? dir('Projects', [
          note('Projects/flat.md', '- [ ] flat task', {}),
          dir('Literature', [
            note('Projects/Literature/virus reading.md', '- [ ] read paper', { status: 'active' }),
            note('Projects/Literature/immunity reading.md', '- [ ] read paper', { status: 'active' }),
            note('Projects/Literature/stray.md', 'just a note', {}),
            // The wikilink join — what ＋ Page and the importer write, and
            // what makes the join a real graph edge. Alias included.
            note('Projects/Literature/linked.md', 'page body', { project: '[[methods paper]]' }),
            note('Projects/Literature/aliased.md', 'page body', { project: '[[methods paper|draft]]' }),
          ]),
          dir('papers', [
            note('Projects/papers/papers.md', 'group note body', { question: 'the shared big picture', color: '#88c0d0' }),
            note('Projects/papers/methods paper.md', methodsNote, { status: 'active', question: 'finalise the methods paper by September' }),
            note('Projects/papers/kept together.md', 'page body', {}),
          ]),
        ])
        : p === 'Pages' ? dir('Pages', [
          dir('methods paper', [note('Pages/methods paper/exported.md', '*methods paper / Setting up browser files*\n\npage body', {})]),
          dir('Open questions', [
            dir('methods paper', [
              // Spun off by spinOffQuestion: filename drops the "?" (forbidden
              // in note names) but the display name carries it back.
              note('Pages/Open questions/methods paper/is it linear.md', '# is it linear?\n', { project: '[[methods paper]]', section: 'Open questions' }),
            ]),
          ]),
        ])
        : null,
      getMarkdownFiles: () => [],
      cachedRead: async (f) => f._c,
    },
  };
  const m = await buildModel(nestedApp, { projectsFolder: 'Projects', pagesFolder: 'Pages', staleDays: 3 });
  ok(m.projects.length === 4, `nested scan finds all four projects (got ${m.projects.length})`);
  const methods = m.projects.find((p) => p.name === 'methods paper');
  const virus = m.projects.find((p) => p.name === 'virus reading');
  const flat = m.projects.find((p) => p.name === 'flat');
  ok(!!flat && flat.open.length === 1 && !flat.shelved, 'top-level note without frontmatter stays an active project');
  ok(methods && methods.pages.length === 5,
    `loose note + Pages/<name>/ + two [[link]]-joined + one question page all join (got ${methods && methods.pages.length})`);
  ok(methods && methods.pages.some((p) => p.name === 'linked') && methods.pages.some((p) => p.name === 'aliased'),
    'a page joins by its [[link]] frontmatter, alias form included, across folders');
  ok(virus && virus.pages.length === 0, 'loose note in a two-project folder joins neither');
  ok(methods && methods.group && methods.group.name === 'papers' && methods.group.question === 'the shared big picture',
    'a folder note is the group: colour and shared big picture');
  ok(methods && methods.group.file && methods.group.file.path === 'Projects/papers/papers.md',
    'the group carries its folder note, for the graph jump to focus');
  ok(!m.projects.some((p) => p.name === 'papers'), 'the folder note is never a project');
  ok(methods && methods.question === 'finalise the methods paper by September', 'big picture read from the question field');
  ok(methods && methods.open.length === 2 && methods.done === 1,
    `open/done counts survive the heading structure (got ${methods && methods.open.length}/${methods && methods.done})`);
  ok(methods && methods.stale.length === 2 && methods.fate === 'stale',
    `undated open threads go stale (got ${methods && methods.stale.length})`);
  ok(methods && methods.folder === 'papers' && methods.log.aims.length === 2,
    `the note's ## headings become aims (got ${methods && methods.log.aims.length})`);
  ok(methods && methods.log.aims[0].subs[0].days[0].tasks.length === 2,
    '### and #### nest sub-objective and day rows beneath the aim');
  ok(methods && methods.log.aims[0].subs[0].days[0].tasks[0].day === '2026-09-04',
    'a day-row task carries its day');
  ok(methods && methods.log.aims[1].tasks.length === 1,
    'a task directly under its aim rides on the aim');
  ok(methods && methods.log.unfiled.length === 0, 'no floating tasks in a fully filed note');
  const exportedPage = methods && methods.pages.find((p) => p.name === 'exported');
  ok(exportedPage && exportedPage.section === 'Setting up browser files',
    'a page finds its sub-objective from the old importer\'s section line');
  const questionPage = methods && methods.pages.find((p) => p.section === 'Open questions');
  ok(questionPage && questionPage.name === 'is it linear?' && questionPage.file.path === 'Pages/Open questions/methods paper/is it linear.md',
    'open questions carry the question mark in their display name (filename keeps it stripped)');

  // The importer writes frontmatter first — Obsidian parses YAML only at
  // the very top of a file — and no `# Name` title that would repeat itself
  // under the tab title and the pane header. Pages carry the join and their
  // sub-objective in frontmatter.
  const conv = convertNotebooks({ notebooks: [{ name: 'x', sections: [] }] });
  ok((conv[0].content || '').startsWith('---'), 'importer writes frontmatter at the top of project notes');
  ok(!(conv[0].content || '').includes('\n# x'), 'importer writes no repeated note-title heading');
  const { convertPage } = require('../importer.js');
  const pageMd = convertPage({ title: 'p', blocks: [] }, 'x', 'Sub one', '../../attachments');
  ok(pageMd.startsWith('---') && pageMd.includes('project: "[[x]]"') && pageMd.includes('section: "Sub one"'),
    'imported pages carry the join as a quoted wikilink, and their sub-objective');

  // projectRef — the join key. Bare names, wikilinks, aliases, and YAML's
  // nested flow arrays (the unquoted [[x]] form) all resolve to one name.
  const { projectRef } = require('../scanner.js');
  ok(projectRef('x') === 'x' && projectRef('[[x]]') === 'x' && projectRef('[[x|y]]') === 'x',
    'projectRef reads bare, link and alias forms alike');
  ok(JSON.stringify(projectRef([['x']])) === JSON.stringify(projectRef('x')),
    'projectRef flattens YAML\'s unquoted nested flow arrays');

  // questionSentences — the natural questions a page's prose carries, and
  // only prose: frontmatter, code, headings, tasks, quotes and link-only
  // lines ask nothing that needs spinning off.
  const { questionSentences } = require('../scanner.js');
  const qPage = [
    '---',
    'project: "[[methods paper]]"',
    '---',
    '',
    '# methods paper',
    '',
    'why did the replicate fail? the other one behaved oddly.',
    'Steady sentence. Then a wonder — really?',
    'Plain question standing alone?',
    '',
    '```',
    'what is this code doing?',
    '```',
    '',
    '- [ ] what is a task doing?',
    '> what is a quote doing?',
    '[[what is a link doing?]]',
  ].join('\n');
  const qs = questionSentences(qPage);
  ok(qs.length === 3
    && qs.includes('why did the replicate fail?')
    && qs.includes('Then a wonder — really?')
    && qs.includes('Plain question standing alone?'),
    `question sentences gather from prose only (got ${JSON.stringify(qs)})`);
  ok(questionSentences('- [ ] a rhetorical checkbox?').length === 0,
    'task lines never gather');

  // pageTaskLinks — the page-to-task direction: an open checkbox naming a
  // project is that project's task; a done one stays local; the link is
  // stripped from the text and code fences are not checkboxes.
  const { pageTaskLinks } = require('../scanner.js');
  const taskPage = [
    'prose about nothing',
    '- [ ] run the PCR [[methods paper]]',
    '- [ ] draft the figure [[methods paper|mp]] with extra [[links paper]]',
    '- [x] already done [[methods paper]]',
    '- [ ] no link at all',
    '```',
    '- [ ] fenced [[methods paper]]',
    '```',
  ].join('\n');
  const tl = pageTaskLinks(taskPage);
  ok(tl.length === 2
    && tl[0].text === 'run the PCR' && tl[0].link === 'methods paper' && tl[0].line === 1
    && tl[1].text === 'draft the figure with extra [[links paper]]' && tl[1].link === 'methods paper',
    `open checkboxes naming a project become its tasks (got ${JSON.stringify(tl)})`);

  // "to do:" lines — prose, no checkbox. A named project targets it; without
  // one the link stays null and the note's own project: field settles it.
  const todoPage = [
    'to do: order the antibodies [[methods paper]]',
    '* to do: check the gel',
    'To Do: mixed case [[methods paper]] too',
    'todo: nothing to strip',
  ].join('\n');
  const td = pageTaskLinks(todoPage);
  ok(td.length === 4
    && td[0].text === 'order the antibodies' && td[0].link === 'methods paper' && td[0].line === 0
    && td[1].text === 'check the gel' && td[1].link === null
    && td[2].text === 'mixed case too' && td[2].link === 'methods paper',
    `to do: lines become project tasks (got ${JSON.stringify(td)})`);

  // isProjectFile + openProjectLink — a [[project]] link clicks into the
  // pane leaf, anything else passes through untouched. Files are real TFile
  // instances: the guard is `instanceof`, so a folder never counts as a
  // project no matter where it sits.
  const projFile = Object.assign(new stub.TFile(), { path: 'Projects/methods paper.md', basename: 'methods paper' });
  const deep = Object.assign(new stub.TFile(), { path: 'Projects/papers/methods paper.md', basename: 'methods paper' });
  const stray = Object.assign(new stub.TFile(), { path: 'Projects/papers/kept together.md' });
  const outside = Object.assign(new stub.TFile(), { path: 'Pages/methods paper/exported.md' });
  const catFolder = Object.assign(new stub.TFolder(), { path: 'Projects/papers' });
  plugin.app.metadataCache.getFirstLinkpathDest = (lp) =>
    lp === 'methods paper' ? deep : null;
  plugin.app.metadataCache.getFileCache = (f) =>
    f === deep ? { frontmatter: { status: 'active' } } : { frontmatter: {} };
  ok(plugin.isProjectFile(projFile) === true
    && plugin.isProjectFile(deep) === true
    && plugin.isProjectFile(stray) === false
    && plugin.isProjectFile(outside) === false
    && plugin.isProjectFile(catFolder) === false
    && plugin.isProjectFile(null) === false,
    'isProjectFile: top level always, deeper only with status, folders never, nothing outside');
  const opened = [];
  const realOpenProjectPane = plugin.openProjectPane;
  plugin.openProjectPane = (name) => opened.push(name);
  const intercept = (target, extra) => {
    let prevented = false, stopped = false;
    plugin.openProjectLink(Object.assign({
      target, clientX: 0, clientY: 0,
      preventDefault() { prevented = true; }, stopPropagation() { stopped = true; },
    }, extra || {}));
    return { prevented, stopped };
  };
  const linkEl = { closest: (s) => (s === 'a.internal-link' ? { getAttribute: (n) => (n === 'data-href' ? 'methods paper' : null) } : null) };
  const r1 = intercept(linkEl);
  ok(r1.prevented && r1.stopped && opened.length === 1 && opened[0] === 'methods paper',
    'a [[project]] link opens the pane leaf, native click swallowed');
  const pageEl = { closest: (s) => (s === 'a.internal-link' ? { getAttribute: (n) => (n === 'data-href' ? 'exported' : null) } : null) };
  const r2 = intercept(pageEl);
  ok(!r2.prevented && !r2.stopped && opened.length === 1,
    'a link to a page passes through untouched');
  const mod = intercept(linkEl, { metaKey: true });
  ok(!mod.prevented && opened.length === 1,
    'modifier clicks pass through to Obsidian');
  const plain = { closest: () => null };
  const r3 = intercept(plain);
  ok(!r3.prevented && opened.length === 1,
    'a click on nothing link-shaped passes through');

  // The file browser: a project row opens its pane too, other rows — and
  // tree rows in other leaves (bookmarks, search) — pass through.
  const explorerEl = {
    closest: (s) => {
      if (s === '.nav-file-title, .tree-item-self'
        || s === '.workspace-leaf-content[data-type="file-explorer"], .nav-files-container') return {};
      if (s === '[data-path]') return { getAttribute: (n) => (n === 'data-path' ? 'Projects/papers/methods paper.md' : null) };
      return null;
    },
  };
  plugin.app.vault.getAbstractFileByPath = (p) =>
    p === 'Projects/papers/methods paper.md' ? deep
      : p === 'Projects/papers' ? catFolder : null;
  const r4 = intercept(explorerEl);
  ok(r4.prevented && r4.stopped && opened.length === 2 && opened[1] === 'methods paper',
    'a project row in the Files explorer opens its pane');
  const folderRowEl = {
    closest: (s) => {
      if (s === '.nav-file-title, .tree-item-self'
        || s === '.workspace-leaf-content[data-type="file-explorer"], .nav-files-container') return {};
      if (s === '[data-path]') return { getAttribute: (n) => (n === 'data-path' ? 'Projects/papers' : null) };
      return null;
    },
  };
  const r4b = intercept(folderRowEl);
  ok(!r4b.prevented && !r4b.stopped && opened.length === 2,
    'a category folder row in the Files explorer still expands — never swallowed');
  const strayEl = {
    closest: (s) => {
      if (s === '.nav-file-title, .tree-item-self') return {};
      if (s === '[data-path]') return { getAttribute: (n) => (n === 'data-path' ? 'Projects/papers/kept together.md' : null) };
      return null;
    },
  };
  const r5 = intercept(strayEl);
  ok(!r5.prevented && opened.length === 2,
    'a non-project row in the explorer clicks through');
  const bookmarkEl = {
    closest: (s) => {
      if (s === '.nav-file-title, .tree-item-self') return {};
      if (s === '[data-path]') return { getAttribute: (n) => (n === 'data-path' ? 'Projects/papers/methods paper.md' : null) };
      return null;
    },
  };
  const r6 = intercept(bookmarkEl);
  ok(!r6.prevented && opened.length === 2,
    'a tree row outside the explorer (bookmarks) keeps its own behavior');

  // A fresh pane splits beside the map leaf — never the active leaf, which
  // is the Files sidebar when the click came from the explorer.
  plugin.openProjectPane = realOpenProjectPane;
  const ws = plugin.app.workspace;
  const realGetLeaves = ws.getLeavesOfType;
  const splits = [];
  ws.createLeafInParent = (parent, index) => {
    const leaf = { setViewState: async (vs) => { leaf.vs = vs; } };
    splits.push({ leaf, parent, index });
    return leaf;
  };
  ws.revealLeaf = (leaf) => { splits.revealed = leaf; };
  const mapLeaf = {};
  mapLeaf.parent = { children: [mapLeaf, {}] };
  ws.getLeavesOfType = (t) => (t === 'index-ring-view' ? [mapLeaf] : []);
  await plugin.openProjectPane('methods paper');
  ok(splits.length === 1 && splits[0].parent === mapLeaf.parent && splits[0].index === 1
    && splits[0].leaf.vs.state.project === 'methods paper'
    && splits.revealed === splits[0].leaf,
    'a fresh pane splits beside the map leaf, not the active sidebar');
  ws.getLeavesOfType = realGetLeaves;

  // The question autocomplete: the line's question offered as a
  // suggestion — created on acceptance only, never behind a keystroke.
  ok(registeredSuggests.length === 1, 'the question suggest registers on load');
  const suggest = registeredSuggests[0];
  const doc = 'what is this sample?';
  const ed = {
    offsetToPos: (o) => ({ line: 0, ch: Math.min(o, doc.length) }),
    getLine: () => doc,
  };
  const pageQ = new stub.TFile();
  pageQ.path = 'Pages/methods paper/daily.md';
  const trig = suggest.onTrigger(doc.length, ed, pageQ);
  ok(trig && trig.query === 'what is this sample?' && trig.start === 0 && trig.end === doc.length,
    'a line ending in ? offers its question');
  ok(suggest.onTrigger(doc.length - 1, ed, pageQ) === null,
    'the cursor mid-line is the completer\'s, not ours');
  const projQ = new stub.TFile();
  projQ.path = 'Projects/methods paper.md';
  ok(suggest.onTrigger(doc.length, ed, projQ) === null,
    'project notes are not offered spin-offs');
  const notQ = { offsetToPos: () => ({ line: 0, ch: 8 }), getLine: () => 'note to self' };
  ok(suggest.onTrigger(8, notQ, pageQ) === null,
    'a line with no question offers nothing');
  ok(JSON.stringify(suggest.getSuggestions({ query: 'what is this sample?' })) === '["what is this sample?"]',
    'the suggestion is the question itself');
  const suggestHost = { html: '', createEl(tag, opts) { this.html += `<${tag}>${(opts && opts.text) || ''}</${tag}>`; } };
  suggest.renderSuggestion('what is this sample?', suggestHost);
  ok(suggestHost.html.includes('create open question') && suggestHost.html.includes('what is this sample?'),
    'the popup row names what it will do and the question');
  const spun = [];
  plugin.spinOffQuestion = async (f, q) => { spun.push([f, q]); return true; };
  plugin.app.workspace.getActiveFile = () => pageQ;
  await suggest.selectSuggestion('what is this sample?');
  ok(spun.length === 1 && spun[0][1] === 'what is this sample?',
    'accepting the suggestion spins the question off — the only creation path');

  // The big picture, written from the pane: a project with none gets
  // ＋ Big picture; the question: frontmatter lands whatever the note.
  const bareProj = {
    name: 'bare', file: { path: 'Projects/bare.md' }, shelved: false, fate: 'cold',
    stale: [], open: [], loose: [], done: 0, total: 0, pages: [],
    log: { aims: [], unfiled: [] },
  };
  const bareHost = makeEl();
  let bareBp = 0;
  renderPane(bareHost, bareProj, { paneTasks: true }, { editBp: () => { bareBp++; } }, 'Pages');
  ok(bareHost.innerHTML.includes('＋ Big picture') && bareHost.innerHTML.includes('data-edit-bp'),
    'a project with no big picture is offered ＋ Big picture');
  bareHost.querySelector('[data-edit-bp]').click();
  ok(bareBp === 1, '＋ Big picture hands over to the view');

  const setFm = async (lines) => {
    let out = null;
    plugin.editFile = async (f, fn) => { out = fn([...lines]); };
    await plugin.setBigPicture({ file: { path: 'Projects/x.md' } }, 'what does this assay show?');
    return out && out.join('\n');
  };
  ok((await setFm(['---', 'status: active', '---', '', 'body']))
    === '---\nstatus: active\nquestion: "what does this assay show?"\n---\n\nbody',
    'a frontmatter note gains its question before the closing fence');
  ok((await setFm(['---', 'question: "the old question"', 'status: active', '---', 'body']))
    === '---\nquestion: "what does this assay show?"\nstatus: active\n---\nbody',
    'an existing question is replaced in place');
  ok((await setFm(['body first', 'no frontmatter']))
    === '---\nquestion: "what does this assay show?"\n---\n\nbody first\nno frontmatter',
    'a bare note gains a frontmatter block carrying the question');

  // ---- a page's tie: right-click → to an aim, or back to the project ----
  // Reached through the registered view factory — the same instance
  // Obsidian would build — with the menu recording its items and the
  // fuzzy picker capturing its choices. setPageSection is patched to a
  // recorder here; the surgery tests below restore the real one.
  const paneView = registeredViews['index-project-view']({});
  const realSetPageSection = plugin.setPageSection;
  {
    const tiedPg = { name: 'R baseline', file: pageFile, section: 'Setting up browser files' };
    paneView.pageMenu(proj, tiedPg, {});
    const titles = stub.lastMenu.items.map((i) => i.title);
    ok(titles.includes('Tie to an aim…') && titles.includes('Leave it at the project'),
      'a tied page\'s right-click offers the tie: to an aim, or back to the project');
    let handed = null;
    plugin.setPageSection = async (pg, name) => { handed = [pg, name]; };
    stub.lastMenu.items.find((i) => i.title === 'Leave it at the project').fn();
    ok(JSON.stringify(handed) === JSON.stringify([tiedPg, null]),
      'leaving the project\'s pages unties the page — no section, no aim');
    stub.lastMenu.items.find((i) => i.title === 'Tie to an aim…').fn();
    const modal = stub.lastFuzzy;
    const picks = modal.getItems();
    ok(picks.length === 2 && picks[1].label.endsWith('› Setting up browser files')
      && picks[1].section === 'Setting up browser files',
      'the aim picker lists the aims, their sub-objectives under them');
    modal.onChooseItem(picks[1]);
    ok(JSON.stringify(handed) === JSON.stringify([tiedPg, 'Setting up browser files']),
      'choosing from the picker ties the page to that sub-objective');
  }
  {
    const plainPg = { name: 'Notes', file: pageFile, section: null };
    paneView.pageMenu(proj, plainPg, {});
    const titles = stub.lastMenu.items.map((i) => i.title);
    ok(titles.includes('Tie to an aim…') && !titles.includes('Leave it at the project'),
      'an untied page can be tied, but has nothing to leave');
    const qPg = { name: 'is it linear?', file: pageFile, section: 'Open questions' };
    paneView.pageMenu(proj, qPg, {});
    ok(!stub.lastMenu.items.some((i) => i.title === 'Tie to an aim…'),
      'a question\'s menu carries no tie — questions are their own list');
  }

  // The bottom folds' state rides the view, re-threaded per render — the
  // questions fold carries the question rows themselves now, clickable,
  // their menu the question's own.
  {
    paneView.notesOpen = true;
    paneView.qsOpen = true;
    const fhost = makeEl();
    renderPane(fhost, proj, { paneTasks: true, staleDays: 3 }, {
      openNote: (...a) => paneCalls.openNote.push(a), setSetting: () => {},
      addTask: () => {}, addAim: () => {}, addSub: () => {}, tickTask: () => {},
      headingMenu: () => {}, addPage: () => {}, taskMenu: () => {},
      pageMenu: (pg, ev) => paneCalls.pageMenu.push([pg, ev]),
      toggleNotes: () => {}, toggleQuestions: () => {}, moveTask: () => {}, moveSub: () => {},
    }, 'Pages', new Set(), true, true);
    ok(fhost.innerHTML.includes('data-extra-notes>') && fhost.innerHTML.includes('data-extra-qs>'),
      'open flags render the folds unfolded');
    const before = paneCalls.openNote.length;
    fhost.querySelectorAll('.ir-page-item')[2].click();
    ok(paneCalls.openNote.length === before + 1
      && paneCalls.openNote[before][0].path === 'Pages/Open questions/R baseline/q.md',
      'the questions fold holds the question rows, clickable to their notes');
    const rhost = makeEl();
    renderPane(rhost, proj, { paneTasks: true, staleDays: 3 }, {
      openNote: () => {}, setSetting: () => {}, addTask: () => {}, addAim: () => {},
      addSub: () => {}, tickTask: () => {}, headingMenu: () => {}, addPage: () => {},
      taskMenu: () => {}, pageMenu: () => {}, toggleNotes: () => {}, toggleQuestions: () => {},
      moveTask: () => {}, moveSub: () => {},
    }, 'Pages', new Set(), false, false);
    ok(rhost.innerHTML.includes('data-extra-notes hidden') && rhost.innerHTML.includes('data-extra-qs hidden'),
      'closed flags fold both away');
    const noQhost = makeEl();
    renderPane(noQhost, { ...proj, pages: proj.pages.filter((pg) => pg.section !== 'Open questions') },
      { paneTasks: true, staleDays: 3 }, {
        openNote: () => {}, setSetting: () => {}, addTask: () => {}, addAim: () => {},
        addSub: () => {}, tickTask: () => {}, headingMenu: () => {}, addPage: () => {},
        taskMenu: () => {}, pageMenu: () => {}, toggleNotes: () => {}, toggleQuestions: () => {},
        moveTask: () => {}, moveSub: () => {},
      }, 'Pages');
    ok(!noQhost.querySelector('[data-fold-qs]'),
      'a project with no questions shows no questions fold');
  }

  // The tie's surgery: the `section:` frontmatter field, whatever the
  // page's shape — retied in place, added to a bare block, untied from
  // both the field and the old importer's *Project / Section* line.
  plugin.setPageSection = realSetPageSection;
  const tieFm = async (lines, name) => {
    let out = null;
    plugin.editFile = async (f, fn) => { out = fn([...lines]); };
    await plugin.setPageSection({ file: { path: 'Pages/x.md' } }, name);
    return out ? out.join('\n') : out;
  };
  ok((await tieFm(['---', 'project: "[[methods paper]]"', '---', '', 'body'], 'Sub one'))
    === '---\nproject: "[[methods paper]]"\nsection: "Sub one"\n---\n\nbody',
    'a tie lands its section field inside the frontmatter block');
  ok((await tieFm(['---', 'section: "Old"', '---', 'body'], 'New'))
    === '---\nsection: "New"\n---\nbody',
    'an existing section is retied in place');
  ok((await tieFm(['body first'], 'Sub one'))
    === '---\nsection: "Sub one"\n---\n\nbody first',
    'a bare page gains a frontmatter block carrying the section');
  ok((await tieFm(['---', 'section: "Old"', '---', '*methods paper / Old*', 'body'], null))
    === '---\n---\nbody',
    'an untie lifts both the field and the legacy line, leaving no tie behind');
  ok((await tieFm(['---', 'status: active', '---', 'body'], null)) === null,
    'an untie with nothing tied writes nothing');

  console.log(failures ? `load-test: ${failures} FAILURE(S)` : 'load-test: all green');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('LOAD-TEST FAILURE:', e); process.exit(1); });