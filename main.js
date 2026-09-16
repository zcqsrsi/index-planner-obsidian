/* Index — the Index projects ring as an Obsidian plugin.
   Plain JavaScript sources, bundled to one file by scripts/build.js
   (Obsidian evaluates main.js as a single virtual module). */

const {
  Plugin, ItemView, Modal, Menu, Notice, PluginSettingTab, Setting, debounce,
  addIcon, TFile, TFolder, FuzzySuggestModal, EditorSuggest,
} = require('obsidian');
const { renderRing } = require('./ring.js');
const { renderPane } = require('./pane.js');
const { buildModel, parseQuestLog, parseDate, todayStr, projectRef, questionSentences, pageTaskLinks, blockEnd, spliceTidy, movedTaskLines, movedSubLines } = require('./scanner.js');
const { convertNotebooks, convertPage, safeName } = require('./importer.js');

const VIEW_TYPE = 'index-ring-view';
const VIEW_TYPE_PROJECT = 'index-project-view';
const VIEW_TYPE_QUESTIONS = 'index-questions-view';
const RING_ICON = 'index-mark';

// The ribbon/view icon: the Index mark itself, filled — a direct port of
// the app logo's geometry (renderer/ui/logo.js): the tapered band with its
// 56° open slot, and the pulled-out segment, wider, with its curved outer
// spine. The band body is a hollow stroke (the holo look) while the floating
// segment stays filled; two short dash arcs ride the top left, the thin
// floating segments over the band's body. ×1.3 for optical size on the 100
// grid, 120° tilt as the app. Monochrome via currentColor. 100x100 viewBox.
const INDEX_ICON_SVG = `<g transform="rotate(120 50 50)">
  <g transform="translate(50 50) scale(1.3) translate(-50 -50)">
    <path d="M62.22 27.02L64.69 28.49L66.98 30.23L69.07 32.21L70.94 34.41L72.55 36.81L73.89 39.36L74.94 42.06L75.69 44.85L76.13 47.71L76.25 50.61L76.05 53.51L75.53 56.37L74.70 59.15L73.56 61.83L72.13 64.37L70.43 66.74L68.47 68.90L66.28 70.84L63.89 72.52L61.33 73.93L58.62 75.04L55.81 75.85L52.92 76.34L50.00 76.50L47.08 76.34L44.19 75.85L41.38 75.04L38.67 73.93L36.11 72.52L33.72 70.84L31.53 68.90L29.57 66.74L27.87 64.37L26.44 61.83L25.30 59.15L24.47 56.37L23.95 53.51L23.75 50.61L23.87 47.71L24.31 44.85L25.06 42.06L26.11 39.36L27.45 36.81L29.06 34.41L30.93 32.21L33.02 30.23L35.31 28.49L37.78 27.02L41.56 34.13L39.87 35.17L38.31 36.39L36.89 37.78L35.64 39.31L34.57 40.97L33.69 42.74L33.01 44.59L32.55 46.50L32.30 48.45L32.26 50.41L32.44 52.36L32.84 54.28L33.44 56.14L34.24 57.92L35.23 59.59L36.39 61.15L37.72 62.57L39.19 63.83L40.79 64.93L42.50 65.84L44.30 66.56L46.16 67.08L48.07 67.39L50.00 67.50L51.93 67.39L53.84 67.08L55.70 66.56L57.50 65.84L59.21 64.93L60.81 63.83L62.28 62.57L63.61 61.15L64.77 59.59L65.76 57.92L66.56 56.14L67.16 54.28L67.56 52.36L67.74 50.41L67.70 48.45L67.45 46.50L66.99 44.59L66.31 42.74L65.43 40.97L64.36 39.31L63.11 37.78L61.69 36.39L60.13 35.17L58.44 34.13Z" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linejoin="round"/>
    <path d="M37.27 16.84L38.25 16.34L39.23 15.85L40.24 15.39L41.26 14.94L42.30 14.53L43.36 14.15L44.43 13.82L45.52 13.53L46.63 13.30L47.75 13.14L48.87 13.03L50.00 13.00L51.13 13.03L52.25 13.14L53.37 13.30L54.48 13.53L55.57 13.82L56.64 14.15L57.70 14.53L58.74 14.94L59.76 15.39L60.77 15.85L61.75 16.34L62.73 16.84L59.67 24.81L58.90 24.52L58.12 24.26L57.33 24.02L56.53 23.81L55.73 23.62L54.92 23.46L54.11 23.32L53.29 23.20L52.47 23.11L51.65 23.05L50.82 23.01L50.00 23.00L49.18 23.01L48.35 23.05L47.53 23.11L46.71 23.20L45.89 23.32L45.08 23.46L44.27 23.62L43.47 23.81L42.67 24.02L41.88 24.26L41.10 24.52L40.33 24.81Z" fill="currentColor"/>
  </g>
  <g stroke="currentColor" stroke-width="5" stroke-linecap="round" fill="none">
    <path d="M20.1 36.1A33 33 0 0 1 24.8 28.8"/>
    <path d="M31.1 22.9A33 33 0 0 1 38.7 19.0"/>
  </g>
</g>`;

const DEFAULTS = {
  projectsFolder: 'Projects',
  pagesFolder: 'Pages',
  staleDays: 3,
  ringScale: true,
  ringCount: true,
  ringHoverLift: true,
  showProjects: true,
  // The map's overview bar — the original's hideable hero, hidden with
  // its ⌄ overview link and brought back the same way.
  overviewHidden: false,
  paneTasks: true,
  // Glyphs, as the app's Settings → Projects: the pane-head progress mark
  // and the day pulse dot. pulse is the app's default glyph style.
  progressStyle: 'pulse',
  dayPulse: true,
  // An open checkbox in a page that names a project — `- [ ] run the PCR
  // [[methods paper]]` — becomes that project's task as the page saves.
  taskLinks: true,
};

// ---- the view ----

class IndexRingView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return 'Index'; }
  getIcon() { return RING_ICON; }

  async onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass('index-ring-view');
    await this.render();
  }

  async render() {
    try {
      const model = await buildModel(this.app, this.plugin.settings);
      this.contentEl.empty();
      renderRing(this.contentEl, model, this.plugin.settings, {
        openFile: (file, line) => this.reveal(file, line),
        // A segment or list-row click opens the project pane beside this map.
        openProject: (name) => this.plugin.openProjectPane(name),
        setSetting: (key, value) => this.setSetting(key, value),
        // The overview bar's ＋ New project.
        createProject: () => this.plugin.createProject(),
      });
    } catch (e) {
      // The view must never die silently — a broken render says so in place.
      console.error('[index] render failed', e);
      this.contentEl.empty();
      this.contentEl.createEl('div', {
        cls: 'ir-empty',
        text: `Index failed to render: ${e.message}. The rest of the vault is unaffected; reloading the plugin or reopening this pane usually clears it.`,
      });
    }
  }

  setSetting(key, value) {
    if (!(key in DEFAULTS)) return;
    this.plugin.settings[key] = value;
    this.plugin.saveSettings();
    // The overview toggle has no in-place move — the hero and its hidden
    // link are different shapes — so the map re-renders to land the choice.
    this.render();
  }

  // Open the note behind a plate/tick; a tick also scrolls to its line.
  async reveal(file, line) {
    try {
      const leaf = this.app.workspace.getLeaf('tab');
      await leaf.openFile(file);
      const view = leaf.view;
      if (line !== undefined && line !== null && view && view.editor) {
        view.editor.setCursor({ line, ch: 0 });
        view.editor.scrollIntoView({ from: { line, ch: 0 }, to: { line: line + 1, ch: 0 } }, true);
      }
    } catch (e) {
      new Notice(`Index could not open ${file.path}: ${e.message}`);
      console.error('[index] open failed', e);
    }
  }
}

// ---- the pane's write side ----
// Quick-add, ＋ Aim / ＋ Sub-objective and the row menu write the project
// note itself — the pane recapitulates Index's editing flows while the
// note stays the single source of truth. Every write re-reads the note
// first and re-parses its log, so lines can never be spliced against a
// stale copy; the metadata change re-renders the pane within a breath.
// The line surgery itself (blockEnd, spliceTidy, the drag-and-drop moves)
// lives in scanner.js, pure and harness-tested.

class PromptModal extends Modal {
  // `value` prefills the input — the rename and edit prompts arrive holding
  // the current name/words, so a submit keeps everything but the change.
  constructor(view, title, placeholder, onSubmit, value) {
    super(view.app);
    this.title = title;
    this.placeholder = placeholder;
    this.onSubmit = onSubmit;
    this.value = value;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: this.title });
    const input = contentEl.createEl('input', { type: 'text', cls: 'ir-prompt-input' });
    input.placeholder = this.placeholder;
    if (this.value != null) input.value = this.value;
    const submit = () => {
      const v = input.value.trim();
      if (!v) return;
      this.close();
      this.onSubmit(v);
    };
    input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); submit(); } });
    new Setting(contentEl).addButton((b) => b.setButtonText('Add').setCta().onClick(submit));
    input.focus();
  }
}

// The fuzzy picker: choose from a list — a project for a question's task,
// an aim for a page's tie. Typing Enter on the highlighted row submits, as
// Obsidian's own palette does; items may be strings or objects with a
// `label` (the fuzzy text) and whatever else the choice needs.
class FuzzyPickerModal extends FuzzySuggestModal {
  constructor(app, items, onChoose, placeholder = 'Which one?', itemText = null) {
    super(app);
    this.picked = items;
    this.onChoose = onChoose;
    this.textOf = itemText || ((x) => String(x));
    this.setPlaceholder(placeholder);
  }
  getItems() { return this.picked; }
  getItemText(item) { return this.textOf(item); }
  onChooseItem(item) { this.onChoose(item); }
}

// The deadline picker: any date form Index reads. parseDate normalises it
// to the ISO the Tasks emoji metadata carries.
class DateModal extends Modal {
  constructor(view, onSubmit) {
    super(view.app);
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Deadline' });
    contentEl.createEl('p', {
      cls: 'setting-item-description',
      text: 'Any date form Index reads — 2026-09-30, 30/09/2026, 30 Sep, Sep 30.',
    });
    const input = contentEl.createEl('input', { type: 'text', cls: 'ir-prompt-input' });
    const submit = () => {
      const date = parseDate(input.value);
      if (!date) { new Notice('Index could not read that date — try 2026-09-30 or 30 Sep.'); return; }
      this.close();
      this.onSubmit(date);
    };
    input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); submit(); } });
    new Setting(contentEl).addButton((b) => b.setButtonText('Set').setCta().onClick(submit));
    input.focus();
  }
}

// ---- the project pane view: its own leaf beside the map ----

// The question autocomplete. A line that ends in '?' offers its question
// — one suggestion, "create open question". Taking the offer (Enter or a
// click) spins the question off into its note; ignoring it (keep typing,
// Escape) leaves everything as typed. Nothing is ever created invisibly
// behind a keystroke.
//
// Coexistence with completer plugins (Various Complements and friends):
// Obsidian walks editor suggests in registration order, stopping at the
// first whose trigger fires, and onTrigger returning null lets the walk
// fall through to the rest. This trigger is as narrow as it can be —
// cursor at the very end of a line that ends in '?' — a shape no word
// completer offers anything for, so the two never fight over a keystroke;
// the first letter of the next word closes this one and hands the editor
// straight back. One open suggest at a time, Enter serves whichever is
// open — the completer keeps its keys while it works.
class QuestionSuggest extends EditorSuggest {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }

  onTrigger(offset, editor, file) {
    try {
      if (!(file instanceof TFile)) return null;
      const projectsFolder = this.plugin.settings.projectsFolder || 'Projects';
      if (file.path.startsWith(`${projectsFolder}/`)) return null; // project notes are their own home
      const pos = editor.offsetToPos(offset);
      const line = editor.getLine(pos.line);
      if (pos.ch !== line.length || !line.trim().endsWith('?')) return null;
      const qs = questionSentences(line);
      const q = qs[qs.length - 1];
      if (!q || q.length < 8) return null;
      return { start: offset - line.length, end: offset, query: q };
    } catch (e) {
      return null;
    }
  }

  getSuggestions(ctx) { return [ctx.query]; }

  renderSuggestion(q, el) {
    el.createEl('div', { cls: 'ir-q-suggest-label', text: 'create open question' });
    el.createEl('div', { cls: 'ir-q-suggest-text', text: q });
  }

  async selectSuggestion(q) {
    try { this.close(); } catch (e) { /* already closed */ }
    const file = this.app.workspace.getActiveFile();
    if (file) await this.plugin.spinOffQuestion(file, q);
  }
}

class IndexProjectView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.projectName = null;
    this.projectPath = null; // the note's current path — rename-follow rebinds by it
    this.noteLeaf = null; // the editor leaf docked beside this pane
  }

  getViewType() { return VIEW_TYPE_PROJECT; }
  getDisplayText() { return this.projectName ? `Index — ${this.projectName}` : 'Index project'; }
  getIcon() { return RING_ICON; }

  // The project rides in the leaf's state — the workspace remembers which
  // pane held what across restarts, splits and window moves.
  getState() { return { project: this.projectName }; }

  async setState(state, result) {
    if (state && state.project) this.projectName = state.project;
    await super.setState(state, result);
    if (this.projectName) await this.renderPane();
  }

  async onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass('index-pane-view');
    if (!this.pulseTimer) {
      this.pulseTimer = this.registerInterval(window.setInterval(() => this.updatePulse(), 30000));
    }
    if (this.projectName) await this.renderPane();
  }

  // The day-pulse dot rides the fraction of the day, as Index's clock.
  updatePulse() {
    const n = new Date();
    const frac = ((n - new Date(n.getFullYear(), n.getMonth(), n.getDate())) / 86400000).toFixed(4);
    for (const el of this.contentEl.querySelectorAll('.ir-day-pulse')) {
      el.style.setProperty('--frac', frac);
    }
  }

  async renderPane() {
    try {
      const model = await buildModel(this.app, this.plugin.settings);
      const project = model.projects.find(p => p.name === this.projectName) || null;
      if (project && project.file) this.projectPath = project.file.path;
      // A re-render must not move the pane under the user: the scroll
      // position carries across the rebuild, and Enter in a quick-add
      // input keeps the focus there — typing the next task needs no
      // scroll-hunting and no click.
      const priorScroll = this.contentEl.querySelector('.ir-pane-scroll');
      const scrollTop = priorScroll ? priorScroll.scrollTop : 0;
      const active = typeof document !== 'undefined' ? document.activeElement : null;
      const refocus = active && active.classList && active.classList.contains('ir-add-input')
        ? (active.dataset.addTask || null) : null;
      this.contentEl.empty();
      // Which aims hold their notes list open — a pane-own Set, so a
      // re-render (every note edit) keeps the open lists open, and a
      // different project starts with every list closed. The bottom folds
      // go with them: Notes and Open questions closed until asked for.
      if (this.aimNotesFor !== this.projectName) {
        this.aimNotesFor = this.projectName;
        this.aimNotesOpen = new Set();
        this.notesOpen = false;
        this.qsOpen = false;
      }
      renderPane(this.contentEl, project, this.plugin.settings, {
        openNote: (file, line) => this.openNote(file, line),
        setSetting: (key, value) => this.setSetting(key, value),
        // The write side: the pane hands over intent, this view owns the
        // note surgery. Re-parsed fresh inside each write.
        addTask: (spec, text) => this.addTask(project && project.file, spec, text),
        addAim: () => new PromptModal(this, 'New aim', 'Name the aim',
          (name) => this.addHeading(project && project.file, 2, name)).open(),
        addSub: (aimIdx) => new PromptModal(this, 'New sub-objective', 'Name it',
          (name) => this.addHeading(project && project.file, 3, name, aimIdx < 0 ? null : aimIdx)).open(),
        tickTask: (task) => this.toggleMark(project, task),
        headingMenu: (spec, ev) => this.headingMenu(project, spec, ev),
        addPage: () => this.addPage(project, model),
        openGraph: () => this.plugin.openGraphLeaf(project && project.file),
        taskMenu: (task, ev) => this.taskMenu(project, task, ev),
        pageMenu: (pg, ev) => this.pageMenu(project, pg, ev),
        toggleNotes: () => { this.notesOpen = !this.notesOpen; this.renderPane(); },
        toggleQuestions: () => { this.qsOpen = !this.qsOpen; this.renderPane(); },
        editBp: () => this.editBigPicture(project),
        moveTask: (t, drop) => this.moveTask(project, t, drop),
        moveSub: (drag, drop) => this.moveSub(project, drag, drop),
      }, model.pagesFolder, this.aimNotesOpen, this.notesOpen, this.qsOpen);
      const scroll = this.contentEl.querySelector('.ir-pane-scroll');
      if (scroll) scroll.scrollTop = scrollTop;
      if (refocus) {
        const input = this.contentEl.querySelector(`[data-add-task="${refocus}"]`);
        if (input) input.focus();
      }
    } catch (e) {
      // The pane must never die silently — a broken render says so in place.
      console.error('[index] pane render failed', e);
      this.contentEl.empty();
      this.contentEl.createEl('div', {
        cls: 'ir-empty',
        text: `Index failed to render this pane: ${e.message}. The rest of the vault is unaffected; reloading the plugin or reopening this pane usually clears it.`,
      });
    }
  }

  // Read-modify-write of the project note, always from a fresh read.
  async editNote(file, fn) {
    if (!file) return;
    try {
      const content = await this.app.vault.read(file);
      const out = fn(content.split('\n'));
      if (out) await this.app.vault.modify(file, out.join('\n'));
    } catch (e) {
      new Notice(`Index could not write ${file.path}: ${e.message}`);
      console.error('[index] write failed', e);
    }
  }

  // A task into the log: today's day row of a sub-objective (the row is
  // created if the note doesn't have one yet — that's the whole point),
  // directly under a container, or floating at the end of the note.
  async addTask(file, spec, text) {
    const today = todayStr();
    const task = `- [ ] ${text} ➕ ${today}`;
    await this.editNote(file, (lines) => {
      if (!spec || spec.kind === 'unfiled' || spec.aimIdx == null) {
        if (lines.length && lines[lines.length - 1].trim() !== '') lines.push('');
        lines.push(task);
        return lines;
      }
      const log = parseQuestLog(lines.join('\n'));
      const aim = log.aims[spec.aimIdx];
      const sub = aim ? aim.subs[spec.subIdx] : null;
      if (spec.kind === 'today' && sub) {
        const day = sub.days.find((d) => parseDate(d.name) === today);
        if (day) {
          const at = (day.tasks.length ? day.tasks[day.tasks.length - 1].line : day.line) + 1;
          if (at < lines.length && lines[at].trim() === '') lines.splice(at, 0, task);
          else spliceTidy(lines, at, task);
          return lines;
        }
        spliceTidy(lines, blockEnd(lines, sub.line, 3), `#### ${today}`, '', task);
        return lines;
      }
      const anchor = sub || aim;
      if (!anchor) { lines.push(task); return lines; }
      spliceTidy(lines, blockEnd(lines, anchor.line, sub ? 3 : 2), task);
      return lines;
    });
  }

  // Drag and drop, the pane's reorder: a task cut from where it sits and
  // pasted where it lands — above another task, into a sub-objective's
  // today row, under an aim, or into the floating bucket — and a
  // sub-objective's whole block picked up and put down elsewhere. The
  // surgery is scanner.js's, pure over a fresh read.
  async moveTask(project, t, drop) {
    await this.editNote(project && project.file, (lines) => movedTaskLines(lines, t, drop));
  }

  async moveSub(project, drag, drop) {
    await this.editNote(project && project.file, (lines) => movedSubLines(lines, drag, drop));
  }

  // An aim or sub-objective heading. With an aim index the sub-objective
  // is written at that aim's end; otherwise both append to the note.
  async addHeading(file, level, name, afterAimIdx) {
    const heading = `${'#'.repeat(level)} ${name}`;
    await this.editNote(file, (lines) => {
      if (afterAimIdx != null) {
        const log = parseQuestLog(lines.join('\n'));
        const aim = log.aims[afterAimIdx];
        if (aim) { spliceTidy(lines, blockEnd(lines, aim.line, 2), heading); return lines; }
      }
      if (lines.length && lines[lines.length - 1].trim() !== '') lines.push('');
      lines.push(heading);
      return lines;
    });
  }

  // A container heading renamed in place — the pane's right-click.
  async renameHeading(file, spec, name) {
    await this.editNote(file, (lines) => {
      const log = parseQuestLog(lines.join('\n'));
      const aim = log.aims[spec.aimIdx];
      const anchor = spec.subIdx != null ? (aim && aim.subs[spec.subIdx]) : aim;
      if (!anchor || anchor.line == null || anchor.line >= lines.length) return null;
      const m = /^(#{2,6})\s+(.*)$/.exec(lines[anchor.line]);
      if (!m) return null;
      lines[anchor.line] = `${m[1]} ${name}`;
      return lines;
    });
  }

  // The big picture, editable where the pane reads it. The prompt arrives
  // holding the shown question (the project's own, else its group's), and
  // the submit writes the project note's question: frontmatter — a project
  // borrowing the group's big picture gets one of its own.
  editBigPicture(project) {
    const current = (project && project.question) || (project && project.group && project.group.question) || '';
    new PromptModal(this, 'Big picture', 'The question this project answers',
      (text) => this.plugin.setBigPicture(project, text), current).open();
  }

  // An aim or sub-objective heading's menu, on right-click in the pane:
  // rename it, copy a link to it for pages, or delete the whole block —
  // day rows and tasks with it.
  headingMenu(project, spec, ev) {
    const file = project && project.file;
    const menu = new Menu();
    menu.addItem((mi) => mi.setTitle('Rename…').setIcon('pencil')
      .onClick(() => new PromptModal(this, 'Rename', 'Rename it',
        (name) => this.renameHeading(file, spec, name), spec.name || '').open()));
    menu.addItem((mi) => mi.setTitle('Copy link for a page').setIcon('link')
      .onClick(() => this.copyHeadingLink(project, spec)));
    menu.addSeparator();
    menu.addItem((mi) => mi.setTitle('Delete').setIcon('trash-2')
      .onClick(() => this.deleteHeading(file, spec)));
    menu.showAtMouseEvent(ev);
  }

  // A link into the pane's own note: `[[project#Aim]]`, and a sub-objective
  // chains through its aim — `[[project#Aim#Sub]]` — which is how Obsidian
  // addresses a nested heading. Clicking it in a page lands on the very
  // lines the pane renders, and Obsidian keeps the link updated through
  // renames. Nothing is written; the link is copied to the clipboard.
  copyHeadingLink(project, spec) {
    const chain = spec.subIdx != null && spec.aimName
      ? `${spec.aimName}#${spec.name}` : spec.name;
    if (!chain) return;
    this.copyLink(`[[${project.name}#${chain}]]`);
  }

  // A task is not a heading — it needs a block reference. The task's line
  // gains a ^block-id (Obsidian's own mechanism, invisible in live preview)
  // if it has none, then the link — `[[note#^id]]`, the task's own note when
  // it is a floating one — goes to the clipboard.
  async copyTaskLink(project, t) {
    try {
      const file = (t && t.file) || (project && project.file);
      if (!file || !t || t.line == null) return;
      let id = null;
      await this.editNote(file, (lines) => {
        if (t.line >= lines.length) return null; // note moved under us
        const l = lines[t.line];
        const existing = /\^([\w-]+)\s*$/.exec(l);
        if (existing) { id = existing[1]; return null; }
        id = `ir-${Math.random().toString(36).slice(2, 7)}`;
        lines[t.line] = `${l.replace(/\s+$/, '')} ^${id}`;
        return lines;
      });
      if (id) this.copyLink(`[[${file.basename}#^${id}]]`);
    } catch (e) {
      new Notice(`Index could not copy the link: ${e.message}`);
      console.error('[index] link copy failed', e);
    }
  }

  copyLink(link) {
    navigator.clipboard.writeText(link)
      .then(() => new Notice(`Copied: ${link}`))
      .catch((e) => {
        new Notice('Index could not reach the clipboard');
        console.error('[index] clipboard failed', e);
      });
  }

  // Delete a container's whole block: its heading through the next heading
  // at its level or shallower, blanks tidied behind.
  async deleteHeading(file, spec) {
    await this.editNote(file, (lines) => {
      const log = parseQuestLog(lines.join('\n'));
      const aim = log.aims[spec.aimIdx];
      const anchor = spec.subIdx != null ? (aim && aim.subs[spec.subIdx]) : aim;
      if (!anchor || anchor.line == null || anchor.line >= lines.length) return null;
      const end = blockEnd(lines, anchor.line, spec.subIdx != null ? 3 : 2);
      lines.splice(anchor.line, end - anchor.line);
      if (anchor.line > 0 && anchor.line < lines.length
          && lines[anchor.line - 1].trim() === '' && lines[anchor.line].trim() === '') {
        lines.splice(anchor.line, 1);
      }
      return lines;
    });
  }

  // ＋ Page: a new page joined to this project — the project named in
  // frontmatter as a wikilink so the join is a real graph edge and survives
  // a later move — filed where the project's pages already live, not left
  // adrift. Destination, in order: the folder holding most of the project's
  // joined pages; beside the project note when it is the only project in
  // its subfolder (the kept-together arrangement); else the pages folder's
  // <project name>/ layout.
  addPage(project, model) {
    if (!project) return;
    new PromptModal(this, 'New page', 'Name the page', async (name) => {
      try {
        const { vault } = this.app;
        const pagesFolder = this.plugin.settings.pagesFolder || 'Pages';
        let dir;
        const tally = new Map(); // folder path → count, newest page first
        for (const pg of project.pages || []) {
          if (pg.section === 'Open questions') continue; // spun-off questions never pull ＋ Page their way
          const f = pg.file && pg.file.parent && pg.file.parent.path;
          if (!f) continue;
          tally.set(f, (tally.get(f) || 0) + 1);
        }
        let best = null, bestN = 0;
        for (const [f, n] of tally) if (n > bestN) { best = f; bestN = n; } // first max wins ties
        const sole = project.folder && model
          && model.projects.filter((p) => p.folder === project.folder).length === 1;
        if (best) dir = best;
        else if (sole) dir = project.file.parent.path;
        else dir = `${pagesFolder}/${project.name}`;
        if (dir && !vault.getAbstractFileByPath(dir)) await vault.createFolder(dir);
        const base = safeName(name);
        let dest = `${dir}/${base}.md`, n = 2;
        while (vault.getAbstractFileByPath(dest)) dest = `${dir}/${base} ${n++}.md`;
        const fmVal = (v) => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const file = await vault.create(dest,
          // The wikilink form — quoted, so YAML keeps it a string — makes
          // the join a real graph edge to the project note.
          `---\nproject: "[[${fmVal(project.name)}]]"\n---\n\n# ${name}\n\n`);
        await this.openNote(file);
      } catch (e) {
        new Notice(`Index could not create the page: ${e.message}`);
        console.error('[index] page create failed', e);
      }
    }).open();
  }

  // Index's tick cycle, the pane's plain task click: open → done (with the
  // done date), anything else → reopened.
  async toggleMark(project, t) {
    const file = (t && t.file) || (project && project.file);
    const today = todayStr();
    await this.editNote(file, (lines) => {
      if (!t || t.line == null || t.line >= lines.length) return null; // note moved under us — the rescan settles it
      let l = lines[t.line];
      if (t.status === 'open') {
        l = l.replace(/\[([ xX\/\-])\]/, '[x]');
        if (!/✅\s\d{4}-\d{2}-\d{2}/.test(l)) l += ` ✅ ${today}`;
      } else {
        l = l.replace(/\[([ xX\/\-])\]/, '[ ]').replace(/\s*✅\s\d{4}-\d{2}-\d{2}/, '');
      }
      lines[t.line] = l;
      return lines;
    });
  }

  // Edit a task's own words: the prompt arrives holding its current text
  // (tags kept), and the emoji metadata — 📅 ➕ ✅ — survives the rewrite.
  async editTask(project, t) {
    const file = (t && t.file) || (project && project.file);
    if (!file) return;
    let current = (t && t.text) || '';
    try {
      const lines = (await this.app.vault.read(file)).split('\n');
      const raw = t && t.line != null && t.line < lines.length ? lines[t.line] : '';
      const m = /^( {0,10}[-*+] \[[ xX\/\-]\] )(.*)$/.exec(raw);
      if (m) current = m[2].replace(/(?:📅|➕|✅)\s*\d{4}-\d{2}-\d{2}/g, '').trim();
    } catch (e) { /* the prefill falls back to the parsed text */ }
    new PromptModal(this, 'Edit task', 'Rewrite the task', async (text) => {
      await this.editNote(file, (lines) => {
        if (!t || t.line == null || t.line >= lines.length) return null;
        const m = /^( {0,10}[-*+] \[[ xX\/\-]\] )(.*)$/.exec(lines[t.line]);
        if (!m) return null;
        const meta = (m[2].match(/(?:📅|➕|✅)\s*\d{4}-\d{2}-\d{2}/g) || []).join(' ');
        lines[t.line] = `${m[1]}${text}${meta ? ` ${meta}` : ''}`;
        return lines;
      });
    }, current).open();
  }

  // Delete a task: the line leaves the note, blanks tidied behind it.
  async deleteTask(project, t) {
    const file = (t && t.file) || (project && project.file);
    await this.editNote(file, (lines) => {
      if (!t || t.line == null || t.line >= lines.length) return null;
      lines.splice(t.line, 1);
      if (t.line > 0 && t.line < lines.length
          && lines[t.line - 1].trim() === '' && lines[t.line].trim() === '') lines.splice(t.line, 1);
      return lines;
    });
  }

  // The task's ⋯ menu and right-click — the checkbox states and emoji
  // metadata written the way the scanner reads them.
  taskMenu(project, t, ev) {
    const menu = new Menu();
    const file = (t && t.file) || project.file;
    const edit = (fn) => this.editNote(file, (lines) => {
      if (!t || t.line == null || t.line >= lines.length) return null; // note moved under us — the rescan settles it
      lines[t.line] = fn(lines[t.line]);
      return lines;
    });
    const setMark = (mark) => (l) => l.replace(/\[([ xX\/\-])\]/, `[${mark}]`);
    if (t && t.status === 'open') {
      menu.addItem((mi) => mi.setTitle('Tick off').setIcon('check').onClick(() => this.toggleMark(project, t)));
      menu.addItem((mi) => mi.setTitle('Start').setIcon('play').onClick(() => edit(setMark('/'))));
      menu.addItem((mi) => mi.setTitle('Scrap').setIcon('ban').onClick(() => edit(setMark('-'))));
      menu.addSeparator();
      if (t.due) menu.addItem((mi) => mi.setTitle('Clear deadline')
        .onClick(() => edit((l) => l.replace(/\s*📅\s\d{4}-\d{2}-\d{2}/, ''))));
      menu.addItem((mi) => mi.setTitle('Set deadline…')
        .onClick(() => new DateModal(this, (date) => edit((l) =>
          l.replace(/\s*📅\s\d{4}-\d{2}-\d{2}/, '') + ` 📅 ${date}`)).open()));
    } else if (t) {
      menu.addItem((mi) => mi.setTitle('Reopen').setIcon('rotate-ccw').onClick(() => this.toggleMark(project, t)));
    }
    menu.addSeparator();
    menu.addItem((mi) => mi.setTitle('Edit…').setIcon('pencil').onClick(() => this.editTask(project, t)));
    menu.addItem((mi) => mi.setTitle('Delete').setIcon('trash-2').onClick(() => this.deleteTask(project, t)));
    menu.addSeparator();
    menu.addItem((mi) => mi.setTitle('Open at its line').setIcon('go-to-file')
      .onClick(() => this.openNote(file, t && t.line)));
    menu.addItem((mi) => mi.setTitle('Copy link for a page').setIcon('link')
      .onClick(() => this.copyTaskLink(project, t)));
    menu.showAtMouseEvent(ev);
  }

  // A page row's right-click. A question's menu grows the move Index makes
  // easy: stop wondering, start working — the question becomes a task in
  // this project, or in any other. A plain page's grows the tie: notes
  // belong to their sections in Index, and the section here is the
  // `section:` frontmatter field the pane's aim buttons read.
  pageMenu(project, pg, ev) {
    const menu = new Menu();
    menu.addItem((mi) => mi.setTitle('Open').setIcon('file-text')
      .onClick(() => this.openNote(pg.file)));
    if (pg.section === 'Open questions') {
      menu.addSeparator();
      if (project) menu.addItem((mi) => mi.setTitle('Make a task in this project').setIcon('check')
        .onClick(() => this.questionToTask(pg, project.name)));
      menu.addItem((mi) => mi.setTitle('Make a task in another project…').setIcon('corner-up-right')
        .onClick(async () => {
          try {
            const model = await buildModel(this.app, this.plugin.settings);
            const names = model.projects.filter((p) => !p.shelved).map((p) => p.name);
            new FuzzyPickerModal(this.app, names, (name) => this.questionToTask(pg, name), 'Which project?').open();
          } catch (e) { console.error('[index] picker failed', e); }
        }));
    } else if (project) {
      menu.addSeparator();
      menu.addItem((mi) => mi.setTitle('Tie to an aim…').setIcon('corner-down-right')
        .onClick(() => this.tieToAim(project, pg)));
      if (pg.section) menu.addItem((mi) => mi.setTitle('Leave it at the project').setIcon('square')
        .onClick(() => this.plugin.setPageSection(pg, null)));
    }
    menu.showAtMouseEvent(ev);
  }

  // The aim picker for a page's tie: every aim of this project, each of its
  // sub-objectives under it. The choice carries the section name the pane
  // groups by — the sub-objective when one is picked, else the aim itself.
  tieToAim(project, pg) {
    const aims = (project.log && project.log.aims) || [];
    const items = [];
    for (const a of aims) {
      items.push({ label: a.name || 'General', section: a.name || 'General' });
      for (const s of a.subs) if (s.name) items.push({ label: `${a.name || 'General'} › ${s.name}`, section: s.name });
    }
    if (!items.length) {
      new Notice('This project has no aims yet — ＋ Aim starts the log.');
      return;
    }
    new FuzzyPickerModal(this.app, items, (pick) => this.plugin.setPageSection(pg, pick.section),
      'Which aim?', (x) => x.label).open();
  }

  // The question becomes work: the task lands in the chosen project's
  // note (floating, for its unfiled bucket) as `- [ ] <question> ➕ today`,
  // and the question note carries a task: link to that project — the
  // question, its origin and its work, all kept together.
  async questionToTask(pg, targetName) {
    try {
      const model = await buildModel(this.app, this.plugin.settings);
      const target = model.projects.find((p) => p.name === targetName);
      if (!target) { new Notice(`“${targetName}” is not in the vault.`); return; }
      await this.addTask(target.file, { kind: 'unfiled' }, pg.name);
      await this.addFmLink(pg.file, 'task', target.name);
      new Notice(`Task from “${pg.name}” created in ${target.name}`);
    } catch (e) {
      new Notice(`Index could not create the task: ${e.message}`);
      console.error('[index] question to task failed', e);
    }
  }

  // Insert `key: "[[value]]"` into a note's frontmatter — adding the block
  // when the note has none. The write side of question → task.
  async addFmLink(file, key, value) {
    await this.editNote(file, (lines) => {
      const val = `${key}: "[[${value}]]"`;
      if (/^\s*-{3,}\s*$/.test(lines[0] || '')) {
        let i = 1;
        while (i < lines.length && !/^\s*-{3,}\s*$/.test(lines[i])) i++;
        if (i >= lines.length) return null; // unterminated — leave the note alone
        lines.splice(i, 0, val);
      } else {
        const head = ['---', val, '---'];
        if (lines.length && lines[0].trim() !== '') head.push('');
        lines.unshift(...head);
      }
      return lines;
    });
  }

  setSetting(key, value) {
    if (!(key in DEFAULTS)) return;
    this.plugin.settings[key] = value;
    this.plugin.saveSettings();
  }

  // Open the real note beside this pane — the pane is a navigator, the note
  // is the genuine article. The docked leaf is remembered, so every click
  // lands in the same editor until the user drags it or closes it; then a
  // fresh split opens beside the pane.
  async openNote(file, line) {
    try {
      const ws = this.app.workspace;
      if (!this.noteLeaf || !ws.getLeavesOfType('markdown').includes(this.noteLeaf)) {
        this.noteLeaf = ws.getLeaf('split', 'vertical');
      }
      await this.noteLeaf.openFile(file);
      const view = this.noteLeaf.view;
      if (line !== undefined && line !== null && view && view.editor) {
        view.editor.setCursor({ line, ch: 0 });
        view.editor.scrollIntoView({ from: { line, ch: 0 }, to: { line: line + 1, ch: 0 } }, true);
      }
      ws.revealLeaf(this.noteLeaf);
    } catch (e) {
      new Notice(`Index could not open ${file.path}: ${e.message}`);
      console.error('[index] open failed', e);
    }
  }
}

// The open-questions side list: a project's spun-off questions as their own
// leaf. The pane now shows questions inline in its Open questions fold, so
// nothing in the UI opens this leaf anymore — it stays registered so a
// workspace that still carries one of these leaves (pinned from earlier
// versions) keeps loading. A question opens its note beside it; a right-click
// hands the row to the project pane's pageMenu, so "make a task in this or
// another project" works from the list exactly as from the pane.
class IndexQuestionsView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.projectName = null;
    this.noteLeaf = null; // the editor leaf docked beside this list
  }

  getViewType() { return VIEW_TYPE_QUESTIONS; }
  getDisplayText() { return this.projectName ? `Questions — ${this.projectName}` : 'Index questions'; }
  getIcon() { return RING_ICON; }

  getState() { return { project: this.projectName }; }

  async setState(state, result) {
    if (state && state.project) this.projectName = state.project;
    await super.setState(state, result);
    if (this.projectName) await this.renderList();
  }

  async onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass('index-questions-view');
    if (this.projectName) await this.renderList();
  }

  async renderList() {
    try {
      const model = await buildModel(this.app, this.plugin.settings);
      const project = model.projects.find(p => p.name === this.projectName) || null;
      const questions = project
        ? project.pages.filter(pg => pg.section === 'Open questions')
        : [];
      this.contentEl.empty();
      const head = this.contentEl.createEl('div', { cls: 'ir-questions-head' });
      head.createEl('h3', { text: 'Open questions' });
      if (project) head.createEl('div', {
        cls: 'ir-questions-sub',
        text: `${project.name} · ${questions.length}`,
      });
      const list = this.contentEl.createEl('div', { cls: 'ir-questions-list' });
      if (!project) {
        list.createEl('div', { cls: 'ir-empty', text: 'No project — open the list from a project pane.' });
        return;
      }
      if (!questions.length) {
        list.createEl('div', {
          cls: 'ir-empty',
          text: 'No open questions yet. Type a question in a page — the moment the line ends in ?, Index offers to spin it off into its own note here.',
        });
        return;
      }
      for (const q of questions) {
        const row = list.createEl('div', { cls: 'ir-question-row' });
        row.createEl('span', { cls: 'ir-question-name', text: q.name });
        row.addEventListener('click', () => this.openNote(q.file));
        row.addEventListener('contextmenu', (ev) => {
          // The pane's row menu, verbatim — the pane view owns the surgery.
          const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_PROJECT);
          const pane = leaves.map((l) => l.view)
            .find((v) => v instanceof IndexProjectView && v.projectName === project.name);
          if (pane) pane.pageMenu(project, q, ev);
        });
      }
    } catch (e) {
      console.error('[index] questions render failed', e);
      this.contentEl.empty();
      this.contentEl.createEl('div', {
        cls: 'ir-empty',
        text: `Index failed to render the questions list: ${e.message}.`,
      });
    }
  }

  async openNote(file) {
    try {
      const ws = this.app.workspace;
      if (!this.noteLeaf || !ws.getLeavesOfType('markdown').includes(this.noteLeaf)) {
        this.noteLeaf = ws.getLeaf('split', 'vertical');
      }
      await this.noteLeaf.openFile(file);
      ws.revealLeaf(this.noteLeaf);
    } catch (e) {
      new Notice(`Index could not open ${file.path}: ${e.message}`);
      console.error('[index] open failed', e);
    }
  }
}

// ---- import: notebooks.json → project notes ----

class ImportModal extends Modal {
  constructor(plugin) {
    super(plugin.app);
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Import from Index' });
    contentEl.createEl('p', {
      text: 'Path to notebooks.json inside this vault. A sibling pages/ folder (Index page exports) is imported too. Existing notes are never overwritten.',
    });
    const suggested = this.app.vault.getAbstractFileByPath('notebooks.json') ? 'notebooks.json' : '';
    let path = suggested;
    new Setting(contentEl)
      .setName('notebooks.json path')
      .addText((text) => text.setValue(suggested).onChange((v) => { path = v; }));
    new Setting(contentEl)
      .addButton((btn) => btn
        .setButtonText('Import')
        .setCta()
        .onClick(() => {
          if (!path) { new Notice('Give the path to notebooks.json'); return; }
          this.close();
          runImport(this.plugin, path.trim());
        }));
  }
}

async function runImport(plugin, path) {
  const { app, settings } = plugin;
  const file = app.vault.getAbstractFileByPath(path);
  if (!file || file.children !== undefined) {
    new Notice(`Not found in the vault: ${path}`);
    return;
  }
  try {
    const data = JSON.parse(await app.vault.read(file));
    const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    const pagesDir = dir ? `${dir}/pages` : 'pages';
    const attachSrc = dir ? `${dir}/attachments` : 'attachments';

    // Folders first.
    for (const p of [settings.projectsFolder, settings.pagesFolder]) {
      if (!app.vault.getAbstractFileByPath(p)) await app.vault.createFolder(p);
    }

    // Projects. Name collisions within the run get a numeric suffix —
    // two notebooks can share a name.
    let nProjects = 0, skipped = 0;
    const usedNames = new Set();
    for (const proj of convertNotebooks(data)) {
      let base = safeName(proj.name), name = base, n = 2;
      while (usedNames.has(name)) name = `${base} ${n++}`;
      usedNames.add(name);
      const dest = `${settings.projectsFolder}/${name}.md`;
      if (app.vault.getAbstractFileByPath(dest)) { skipped++; continue; }
      await app.vault.create(dest, proj.content);
      nProjects++;
    }

    // Pages: sections reference page ids; the JSON sits in the sibling pages/.
    let nPages = 0;
    for (const nb of data.notebooks || []) {
      const nbFolder = `${settings.pagesFolder}/${safeName(nb.name)}`;
      let madeFolder = false;
      const mkdir = async () => {
        if (!madeFolder && !app.vault.getAbstractFileByPath(nbFolder)) await app.vault.createFolder(nbFolder);
        madeFolder = true;
      };
      // Duplicate page titles within a notebook get suffixed, not skipped.
      const usedPageNames = new Set();
      const uniqueName = (title, fallback) => {
        let base = safeName(title || fallback), name = base, n = 2;
        while (usedPageNames.has(name)) name = `${base} ${n++}`;
        usedPageNames.add(name);
        return name;
      };
      for (const sec of nb.sections || []) {
        for (const pgRef of sec.pages || []) {
          // sections hold page references { id, title, ... }, not bare ids
          const pgId = pgRef && pgRef.id ? pgRef.id : pgRef;
          const src = app.vault.getAbstractFileByPath(`${pagesDir}/${pgId}.json`);
          if (!src || src.children !== undefined) continue;
          const page = JSON.parse(await app.vault.read(src));
          await mkdir();
          const name = uniqueName(page.title, pgId);
          const dest = `${nbFolder}/${name}.md`;
          if (app.vault.getAbstractFileByPath(dest)) continue;
          // Pages sit one folder deep inside <pagesFolder>/<notebook>/.
          const attachRel = `../../attachments`;
          await app.vault.create(dest, convertPage(page, nb.name, sec.name, attachRel));
          nPages++;
        }
      }
    }

    // Attachments: copied once into the vault root attachments/ folder.
    let nAttach = 0;
    const attachFolder = app.vault.getAbstractFileByPath(attachSrc);
    if (attachFolder && attachFolder.children !== undefined) {
      if (!app.vault.getAbstractFileByPath('attachments')) await app.vault.createFolder('attachments');
      for (const f of attachFolder.children) {
        if (f.children !== undefined) continue;
        const dest = `attachments/${f.name}`;
        if (app.vault.getAbstractFileByPath(dest)) continue;
        await app.vault.copy(f, dest);
        nAttach++;
      }
    }

    new Notice(`Imported ${nProjects} projects · ${nPages} pages · ${nAttach} attachments${skipped ? ` · ${skipped} already present` : ''}`);
    plugin.rerender();
  } catch (e) {
    new Notice(`Import failed: ${e.message}`);
    console.error('[index] import failed', e);
  }
}

// ---- settings ----

class IndexRingSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;

    new Setting(containerEl)
      .setName('Projects folder')
      .setDesc('One note per project, anywhere inside — flat or in category folders. Inside subfolders a status field is required; at the top level any note counts.')
      .addText((t) => t.setValue(s.projectsFolder).onChange(async (v) => {
        s.projectsFolder = v.trim() || 'Projects';
        await this.plugin.saveSettings();
        this.plugin.rerender();
      }));
    new Setting(containerEl)
      .setName('Pages folder')
      .setDesc('Where the Index importer writes page notes.')
      .addText((t) => t.setValue(s.pagesFolder).onChange(async (v) => {
        s.pagesFolder = v.trim() || 'Pages';
        await this.plugin.saveSettings();
      }));
    new Setting(containerEl)
      .setName('Stale after (days)')
      .setDesc('An open task with no due date goes stale after this long.')
      .addText((t) => t.setValue(String(s.staleDays)).onChange(async (v) => {
        const n = Number(v);
        if (Number.isFinite(n) && n >= 0) { s.staleDays = Math.floor(n); await this.plugin.saveSettings(); this.plugin.rerender(); }
      }));
    new Setting(containerEl)
      .setName('Ring segment scaling')
      .setDesc('Segment spans grow with each project’s open tasks.')
      .addToggle((t) => t.setValue(s.ringScale).onChange(async (v) => {
        s.ringScale = v; await this.plugin.saveSettings(); this.plugin.rerender();
      }));
    new Setting(containerEl)
      .setName('Center count')
      .setDesc('The bare open-total number in the ring’s middle.')
      .addToggle((t) => t.setValue(s.ringCount).onChange(async (v) => {
        s.ringCount = v; await this.plugin.saveSettings(); this.plugin.rerender();
      }));
    new Setting(containerEl)
      .setName('Ring hover lift')
      .setDesc('A hovered plate detaches a little from the ring.')
      .addToggle((t) => t.setValue(s.ringHoverLift).onChange(async (v) => {
        s.ringHoverLift = v; await this.plugin.saveSettings(); this.plugin.rerender();
      }));
    new Setting(containerEl)
      .setName('Projects list')
      .setDesc('The list of projects under the ring. The fold button on the list itself also switches this.')
      .addToggle((t) => t.setValue(s.showProjects).onChange(async (v) => {
        s.showProjects = v; await this.plugin.saveSettings(); this.plugin.rerender();
      }));
    new Setting(containerEl)
      .setName('Tasks in the pane')
      .setDesc('The quest log in the project pane. The fold button on the pane itself also switches this.')
      .addToggle((t) => t.setValue(s.paneTasks).onChange(async (v) => {
        s.paneTasks = v; await this.plugin.saveSettings(); this.plugin.rerender();
      }));
    new Setting(containerEl)
      .setName('Progress glyph')
      .setDesc('The mark in the project pane’s head that fills as tasks complete.')
      .addDropdown((d) => d
        .addOption('pulse', 'Pulse')
        .addOption('nodes', 'Nodes')
        .addOption('bar', 'Bar')
        .addOption('comet', 'Comet')
        .addOption('filament', 'Filament')
        .setValue(s.progressStyle)
        .onChange(async (v) => {
          s.progressStyle = v; await this.plugin.saveSettings(); this.plugin.rerender();
        }));
    new Setting(containerEl)
      .setName('Day pulse')
      .setDesc('The dot riding the fraction of the day, on today’s row in the pane.')
      .addToggle((t) => t.setValue(s.dayPulse).onChange(async (v) => {
        s.dayPulse = v; await this.plugin.saveSettings(); this.plugin.rerender();
      }));
    new Setting(containerEl)
      .setName('Tasks from pages')
      .setDesc('Writing does the filing: an open checkbox in a page that names a project — `- [ ] run the PCR [[methods paper]]` — becomes that project’s task as the page saves, with a backlink to the page’s line. Questions are always explicit: Enter on the question line, the editor’s right-click, or the command palette.')
      .addToggle((t) => t.setValue(s.taskLinks).onChange(async (v) => {
        s.taskLinks = v; await this.plugin.saveSettings();
      }));
    containerEl.createEl('p', {
      cls: 'setting-item-description',
      text: 'Tag inclusion: put include: "#tag" in a project note’s frontmatter to gather that tag’s checkboxes from anywhere in the vault.',
    });
    containerEl.createEl('p', {
      cls: 'setting-item-description',
      text: 'Pages: a page in <pages folder>/<project name>/ joins to that project in the pane’s notes side; a project: "[[name]]" frontmatter field on the page names a different owner and wins — the wikilink makes the join a real graph edge. A group: "[[folder note]]" field on a project note ties it to its category folder’s note, the family’s hub in the graph.',
    });
    containerEl.createEl('p', {
      cls: 'setting-item-description',
      text: 'Open questions: type a question in a page — the moment the line ends in ?, Index offers "create open question" in the autocomplete (right-click the line, or use the command palette, for the same). Taking the offer spins it off into a note under <pages folder>/Open questions/<project>/, named after the question, linked back to the page — listed in the pane’s Open questions fold and drawn as an edge in the graph.',
    });
    containerEl.createEl('p', {
      cls: 'setting-item-description',
      text: 'Quest log: the pane reads the project note’s headings — ## aims, ### sub-objectives, #### day rows — with the checkboxes beneath them. Big picture comes from the note’s question: frontmatter field.',
    });
  }
}

// ---- plugin ----

module.exports = class IndexRingPlugin extends Plugin {
  async onload() {
    await this.loadSettings();

    addIcon(RING_ICON, INDEX_ICON_SVG);
    this.registerView(VIEW_TYPE, (leaf) => new IndexRingView(leaf, this));
    this.registerView(VIEW_TYPE_PROJECT, (leaf) => new IndexProjectView(leaf, this));
    this.registerView(VIEW_TYPE_QUESTIONS, (leaf) => new IndexQuestionsView(leaf, this));
    this.addRibbonIcon(RING_ICON, 'Index', () => this.activateView());
    this.addCommand({ id: 'open-ring', name: 'Open the ring', callback: () => this.activateView() });
    this.addCommand({ id: 'open-project-pane', name: 'Open the project pane (busiest project)', callback: () => this.openBusiestPane() });
    // The graph jump: the pane's project, or its whole group, in the local
    // graph — the pages orbit their note once they carry [[links]].
    this.addCommand({ id: 'graph-project', name: 'Open this project in the graph', callback: () => this.openPaneGraph(false) });
    this.addCommand({ id: 'graph-group', name: 'Open this group in the graph', callback: () => this.openPaneGraph(true) });
    // Questions are explicit: Enter on the question line (the keymap below),
    // the editor's right-click, or this command.
    this.addCommand({
      id: 'spin-off-question',
      name: 'Spin off the question on this line as its own note',
      editorCallback: (editor, ctx) => {
        try {
          const qs = questionSentences(editor.getLine(editor.getCursor().line));
          if (!qs.length) { new Notice('The line under the cursor is not a question.'); return; }
          this.spinOffQuestion(ctx.file, qs[qs.length - 1]);
        } catch (e) { console.error('[index] spin-off command failed', e); }
      },
    });
    // Project and folder colours painted onto the graph as colour groups.
    this.addCommand({ id: 'sync-graph-colors', name: 'Sync project colours to the graph', callback: () => this.syncGraphColors() });
    this.addCommand({ id: 'import', name: 'Import from Index notebooks.json', callback: () => new ImportModal(this).open() });
    this.addSettingTab(new IndexRingSettingTab(this.app, this));

    // A wikilink naming a project opens its pane leaf, not the raw note —
    // the pane is the project's face, as in Index. Capture-phase at the
    // document root so it runs before Obsidian's own link handlers; only
    // links that resolve to a project note are intercepted, everything
    // else (pages, folder notes, ordinary notes) clicks through untouched.
    this.registerDomEvent(document, 'click', (ev) => this.openProjectLink(ev), true);

    // The question autocomplete: a line ending in '?' offers its question
    // as a suggestion. Taking the offer (Enter, click) creates the open
    // question — nothing is ever created invisibly behind a keystroke.
    this.registerEditorSuggest(new QuestionSuggest(this.app, this));
    // Right-click a question in the editor: spin it off there.
    this.registerEvent(this.app.workspace.on('editor-menu', (menu, editor, ctx) => {
      try {
        const qs = questionSentences(editor.getLine(editor.getCursor().line));
        if (!qs.length || !ctx || !ctx.file) return;
        const q = qs[qs.length - 1];
        menu.addItem((mi) => mi.setTitle('Spin off open question').setIcon('help-circle')
          .onClick(() => this.spinOffQuestion(ctx.file, q)));
      } catch (e) { console.error('[index] editor menu failed', e); }
    }));

    // A graph click on a project lands in its pane, not only the raw note:
    // the leaf active just before a file opens tells where the click came
    // from — a graph view, and a ring project, opens the pane beside.
    this._lastActive = null;
    this.registerEvent(this.app.workspace.on('active-leaf-change', (leaf) => { this._lastActive = leaf; }));
    this.registerEvent(this.app.workspace.on('file-open', async (file) => {
      try {
        if (!(file instanceof TFile)) return;
        const prev = this._lastActive;
        const type = prev && prev.view && prev.view.getViewType ? prev.view.getViewType() : null;
        if (type !== 'graph' && type !== 'localgraph') return;
        this._lastActive = null;
        const model = await buildModel(this.app, this.settings);
        const project = model.projects.find((p) => p.file && p.file.path === file.path);
        if (project) await this.openProjectPane(project.name);
      } catch (e) { console.error('[index] graph click-through failed', e); }
    }));

    // Re-render on any vault change, debounced — the ring is a view, and
    // a checkbox ticked anywhere should be visible on it within a breath.
    const rerender = debounce(() => this.rerender(), 500, true);
    this.registerEvent(this.app.metadataCache.on('changed', rerender));
    this.registerEvent(this.app.metadataCache.on('deleted', rerender));
    this.registerEvent(this.app.metadataCache.on('renamed', rerender));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => this.followRename(file, oldPath)));
    // Tasks gather from page checkboxes as they are written — debounced, so
    // a burst of saves is one pass per file. Questions are explicit (Enter
    // over the question line, the editor's right-click, or the command).
    this._pendingQuestions = new Set();
    this._gatherPending = debounce(() => {
      const files = [...this._pendingQuestions];
      this._pendingQuestions.clear();
      (async () => {
        for (const file of files) await this.gatherTaskLinks(file);
      })();
    }, 2000, true);
    this.registerEvent(this.app.vault.on('modify', (file) => {
      if (!this.settings.taskLinks || !(file instanceof TFile)) return;
      this._pendingQuestions.add(file);
      this._gatherPending();
    }));
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULTS, await this.loadData());
  }

  saveSettings() {
    return this.saveData(this.settings);
  }

  // Read-modify-write at plugin level — the pane views carry their own
  // editNote; the gather and repair passes run here, no view attached.
  async editFile(file, fn) {
    if (!file) return;
    try {
      const out = fn((await this.app.vault.read(file)).split('\n'));
      if (out) await this.app.vault.modify(file, out.join('\n'));
    } catch (e) {
      console.error('[index] write failed', e);
    }
  }

  rerender() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof IndexRingView) view.render();
    }
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_PROJECT)) {
      const view = leaf.view;
      if (view instanceof IndexProjectView && view.projectName) view.renderPane();
    }
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_QUESTIONS)) {
      const view = leaf.view;
      if (view instanceof IndexQuestionsView && view.projectName) view.renderList();
    }
  }

  // A renamed project finds its pane again live — no restart, as the ring
  // rescans on the renamed event but panes bind by name and so kept looking
  // for the old one. The pane rebinds by path (it knows the note it held),
  // and <pages folder>/<old name>/ follows the rename too: Obsidian updates
  // [[links]] itself, but nothing else renames the pages folder.
  async followRename(file, oldPath) {
    try {
      if (!(file instanceof TFile)) return;
      const projectsFolder = this.settings.projectsFolder || 'Projects';
      const views = this.app.workspace.getLeavesOfType(VIEW_TYPE_PROJECT)
        .map((leaf) => leaf.view)
        .filter((v) => v instanceof IndexProjectView && v.projectPath === oldPath);
      if (!views.length && !oldPath.startsWith(`${projectsFolder}/`)) return;
      const model = await buildModel(this.app, this.settings);
      if (!model.projects.some((p) => p.file && p.file.path === file.path)) return; // not a project
      const oldName = oldPath.split('/').pop().replace(/\.md$/, '');
      const newName = file.basename;
      for (const view of views) {
        view.projectName = newName;
        view.projectPath = file.path;
        await view.renderPane();
      }
      if (oldName === newName) return;
      const { vault } = this.app;
      const pagesFolder = model.pagesFolder || this.settings.pagesFolder || 'Pages';
      const folder = vault.getAbstractFileByPath(`${pagesFolder}/${oldName}`);
      if (folder instanceof TFolder && !vault.getAbstractFileByPath(`${pagesFolder}/${newName}`)) {
        await vault.rename(folder, `${pagesFolder}/${newName}`);
      }
      // Safety net for the join fields: core link-updating rewrites [[links]]
      // on rename, but switched off — or on a build without it for properties —
      // pages keep naming the old project and the join breaks. Deferred a few
      // seconds so the link cache re-resolves first, then any note still
      // holding [[old name]] in one of our fields is repaired by hand.
      if (oldName !== newName) {
        window.setTimeout(() => this.repairStaleRefs(oldName, newName), 3000);
      }
    } catch (e) {
      console.error('[index] rename follow failed', e);
    }
  }

  // Hand-repair the join fields still pointing at a renamed note's old
  // name. The cache's unresolved links are the tell: after the rename,
  // [[old name]] resolves to nothing. Idempotent — a second pass finds
  // no holders.
  async repairStaleRefs(oldName, newName) {
    try {
      const cache = this.app.metadataCache;
      const unresolved = cache.unresolvedLinks || {};
      const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`^(\\s*(?:project|group|task|from)\\s*:\\s*.*?\\[\\[)${esc(oldName)}((?:\\]\\]|\\|))`);
      for (const path of Object.keys(unresolved)) {
        if (!unresolved[path][oldName]) continue;
        const f = this.app.vault.getAbstractFileByPath(path);
        if (!(f instanceof TFile)) continue;
        const lines = (await this.app.vault.read(f)).split('\n');
        let changed = false;
        for (let i = 0; i < lines.length; i++) {
          if (!re.test(lines[i])) continue;
          lines[i] = lines[i].replace(re, `$1${newName}$2`);
          changed = true;
        }
        if (changed) await this.app.vault.modify(f, lines.join('\n'));
      }
    } catch (e) {
      console.error('[index] stale ref repair failed', e);
    }
  }

  // A question becomes its own thread — a note under <pages folder>/
  // Open questions/<project>/, named after the question, the project a
  // quoted wikilink so the pane groups it and the graph draws the edge,
  // a `from:` link back to the page it arose in. Explicit, never
  // automatic: Enter on the question line, the editor's right-click, or
  // the command palette — the moment to spin it off is the author's.
  async spinOffQuestion(file, question) {
    try {
      const q = String(question || '').trim();
      if (!q.endsWith('?') || q.length < 8) return false;
      const model = await buildModel(this.app, this.settings);
      const owner = model.projects.find((p) => p.pages.some((pg) => pg.file.path === file.path));
      if (!owner) {
        new Notice(`Index could not tell which project “${file.basename}” belongs to — a project: "[[name]]" field on the page settles it.`);
        return false;
      }
      const made = await this.createQuestionNote(file, owner, q);
      if (made) new Notice(`Index spun off “${q}” from ${file.basename}`);
      return made;
    } catch (e) {
      new Notice(`Index could not spin off the question: ${e.message}`);
      console.error('[index] question spin-off failed', e);
      return false;
    }
  }

  // The note itself, shared by every spin-off path. Returns false when a
  // thread with that question already exists.
  async createQuestionNote(page, project, question) {
    const pagesFolder = this.settings.pagesFolder || 'Pages';
    const dir = `${pagesFolder}/Open questions/${project.name}`;
    const base = safeName(question).slice(0, 60);
    if (!base) return false;
    if (!this.app.vault.getAbstractFileByPath(dir)) await this.app.vault.createFolder(dir);
    if (this.app.vault.getAbstractFileByPath(`${dir}/${base}.md`)) return false; // already a thread
    await this.app.vault.create(`${dir}/${base}.md`, [
      '---',
      `project: "[[${project.name}]]"`,
      'section: "Open questions"',
      `from: "[[${page.basename}]]"`,
      '---',
      '',
      `# ${question}`,
      '',
      `Spun off from [[${page.basename}]] while writing.`,
      '',
    ].join('\n'));
    return true;
  }

  // The other direction of the link: an open checkbox in a page that names
  // a project — `- [ ] run the PCR [[methods paper]]` — becomes that
  // project's task, written as the page saves. The page's line gains a
  // block id; the task in the project's note carries the backlink to it,
  // so the pairing holds from both ends: the task's link lands on the
  // page's line, and the task ticks in the pane like any other. One task
  // per checkbox, ever; ticking the checkbox in the page keeps that work
  // local and spawns nothing.
  async gatherTaskLinks(file) {
    try {
      if (!this.settings.taskLinks) return; // the page→task gather switch
      if (!(file instanceof TFile)) return;
      const projectsFolder = this.settings.projectsFolder || 'Projects';
      if (file.path.startsWith(`${projectsFolder}/`)) return; // notes in the Projects tree count where they are
      const content = await this.app.vault.read(file);
      const tasks = pageTaskLinks(content);
      if (!tasks.length) return;
      const lines = content.split('\n');
      let made = 0;
      for (const t of tasks) {
        try {
          // A link named on the line targets that project; a linkless
          // "to do:" falls back to the note's own project: field.
          let target = t.link ? this.app.metadataCache.getFirstLinkpathDest(t.link, file.path) : null;
          if (!target && !t.link) {
            const fm = (this.app.metadataCache.getFileCache(file) || {}).frontmatter || {};
            const ref = fm.project ? projectRef(fm.project) : null;
            if (ref) target = this.app.metadataCache.getFirstLinkpathDest(ref, file.path);
          }
          if (!target || !(target instanceof TFile) || !target.path.startsWith(`${projectsFolder}/`)) continue;
          const priorId = /\^([\w-]+)\s*$/.exec(lines[t.line] || '');
          let id = priorId && priorId[1];
          if (!id) {
            let assign = `ir-${Math.random().toString(36).slice(2, 7)}`;
            await this.editFile(file, (ls) => {
              const ex = /\^([\w-]+)\s*$/.exec(ls[t.line] || '');
              if (ex) { id = ex[1]; return null; } // a concurrent pass added one — use it
              ls[t.line] = `${ls[t.line].replace(/\s+$/, '')} ^${assign}`;
              id = assign;
              return ls;
            });
          }
          if (!id) continue;
          const back = `[[${file.basename}#^${id}]]`;
          const projectContent = await this.app.vault.read(target);
          if (projectContent.includes(back)) continue; // already written
          await this.editFile(target, (ls) => {
            if (ls.some((l) => l.includes(back))) return null;
            if (ls.length && ls[ls.length - 1].trim() !== '') ls.push('');
            ls.push(`- [ ] ${t.text} ➕ ${todayStr()} ${back}`);
            return ls;
          });
          made++;
        } catch (e) {
          console.error('[index] task link gather failed for one line', e);
        }
      }
      if (made) new Notice(`Index created ${made} task${made === 1 ? '' : 's'} from ${file.basename} in its linked project${made === 1 ? '' : 's'}`);
    } catch (e) {
      console.error('[index] task link gather failed', e);
    }
  }

  // Is this file one of the ring's projects? Top level under the projects
  // folder: always. Deeper: a status field marks it, exactly as the scan.
  // Folders never count — the file explorer must keep expanding them.
  isProjectFile(file) {
    try {
      if (!(file instanceof TFile)) return false;
      const folder = this.settings.projectsFolder || 'Projects';
      if (!file || !file.path || !file.path.startsWith(`${folder}/`)) return false;
      const rel = file.path.slice(folder.length + 1);
      if (!rel.includes('/')) return true;
      const fm = (this.app.metadataCache.getFileCache(file) || {}).frontmatter || {};
      return fm.status !== undefined;
    } catch (e) {
      return false;
    }
  }

  // Click-through for [[project]] links and for the file browser: the pane
  // leaf opens instead of the raw note. Reading and preview mode render
  // real anchors with data-href; live preview renders spans, so the clicked
  // line is read from the editor (only when it holds exactly one link — an
  // ambiguous line is left to Obsidian). In the Files explorer a project
  // row click opens the pane too (scoped to the explorer's own leaf, so
  // trees elsewhere — bookmarks, search results — keep their behavior).
  // Everything resolving to a non-project clicks through.
  openProjectLink(ev) {
    try {
      if (ev.metaKey || ev.ctrlKey || ev.altKey || ev.shiftKey) return; // modifier clicks are Obsidian's
      const t = ev.target;
      if (!t || !t.closest) return;
      let dest = null;
      const a = t.closest('a.internal-link');
      if (a) {
        const linkpath = (a.getAttribute('data-href') || '').split('#')[0].trim();
        if (!linkpath) return;
        dest = this.app.metadataCache.getFirstLinkpathDest(linkpath, '');
      } else if (t.closest('.nav-file-title, .tree-item-self')
        && t.closest('.workspace-leaf-content[data-type="file-explorer"], .nav-files-container')) {
        // The file browser's rows carry the path directly.
        const p = (t.closest('[data-path]') || {}).getAttribute?.('data-path');
        if (!p) return;
        dest = this.app.vault.getAbstractFileByPath(p);
      } else if (t.closest('.cm-hmd-internal-link')) {
        const ed = this.app.workspace.activeEditor;
        const pos = ed && ed.editor ? ed.editor.posAtCoords({ x: ev.clientX, y: ev.clientY }) : null;
        if (!pos) return;
        const lineText = ed.editor.getLine(pos.line) || '';
        const links = [...lineText.matchAll(/\[\[([^\]|#]+)/g)].map((m) => m[1].trim());
        if (links.length !== 1) return;
        dest = this.app.metadataCache.getFirstLinkpathDest(links[0], '');
      } else {
        return;
      }
      if (!this.isProjectFile(dest)) return;
      ev.preventDefault();
      ev.stopPropagation();
      this.openProjectPane(dest.basename);
    } catch (e) {
      console.error('[index] project link interception failed', e);
    }
  }

  // The map's click-through: reuse the pane leaf wherever the user put it,
  // else split a fresh one beside the map. State carries the project, so a
  // pane living in another window still switches to the clicked project.
  // A fresh pane never splits the active leaf: from the Files explorer that
  // is a sidebar, and a pane in there is lost. The map leaf's own split is
  // the home ground.
  async openProjectPane(name) {
    try {
      const { workspace } = this.app;
      let leaf = workspace.getLeavesOfType(VIEW_TYPE_PROJECT)[0];
      if (!leaf) {
        const map = workspace.getLeavesOfType(VIEW_TYPE)[0];
        if (map && map.parent) {
          leaf = workspace.createLeafInParent(map.parent, map.parent.children.indexOf(map) + 1);
        }
      }
      if (!leaf) leaf = workspace.getLeaf('split', 'vertical');
      await leaf.setViewState({ type: VIEW_TYPE_PROJECT, active: true, state: { project: name } });
      workspace.revealLeaf(leaf);
    } catch (e) {
      new Notice(`Index could not open the project pane: ${e.message}`);
      console.error('[index] pane open failed', e);
    }
  }

  async openBusiestPane() {
    const model = await buildModel(this.app, this.settings);
    const busiest = model.projects
      .filter(p => !p.shelved)
      .sort((a, b) => b.open.length - a.open.length)[0] || model.projects[0];
    if (busiest) this.openProjectPane(busiest.name);
    else new Notice('No projects yet — put a note with a status field under the projects folder first.');
  }

  // The overview bar's ＋ New project: a named note under the projects
  // folder, active from its first line, opened in its pane right away.
  createProject() {
    new PromptModal(this, 'New project', 'Name the project', async (name) => {
      try {
        const clean = safeName(String(name || '').trim());
        if (!clean || clean === 'Untitled') return;
        const folder = this.settings.projectsFolder || 'Projects';
        const path = `${folder}/${clean}.md`;
        if (this.app.vault.getAbstractFileByPath(path)) {
          new Notice(`Index already has “${clean}”.`);
          this.openProjectPane(clean);
          return;
        }
        await this.app.vault.create(path, '---\nstatus: active\n---\n');
        new Notice(`Index created ${clean}`);
        this.openProjectPane(clean);
      } catch (e) {
        new Notice(`Index could not create the project: ${e.message}`);
        console.error('[index] project create failed', e);
      }
    }).open();
  }

  // The open-questions leaf: this project's questions in their own leaf
  // beside the pane. Reused like the pane leaf itself, so a workspace that
  // still carries one keeps the list where the user put it.
  // The big picture, writable from the pane: the project note's `question:`
  // frontmatter. A project with no question of its own edits into its own
  // — the group's big picture it was shown belongs to the group note.
  async setBigPicture(project, text) {
    try {
      if (!project || !project.file) return;
      const value = String(text || '').trim().replace(/"/g, "'");
      await this.editFile(project.file, (ls) => {
        if (ls[0] && ls[0].trim() === '---') {
          const end = ls.findIndex((l, i) => i > 0 && l.trim() === '---');
          const body = end === -1 ? ls.length : end; // the frontmatter block's close
          const qi = ls.findIndex((l, i) => i > 0 && i < body && /^question\s*:/.test(l));
          if (qi !== -1) {
            const out = [...ls];
            out[qi] = `question: "${value}"`;
            return out;
          }
          return [...ls.slice(0, body), `question: "${value}"`, ...ls.slice(body)];
        }
        return ['---', `question: "${value}"`, '---', '', ...ls];
      });
    } catch (e) {
      new Notice(`Index could not write the big picture: ${e.message}`);
      console.error('[index] big picture write failed', e);
    }
  }

  async openQuestionsView(name) {
    if (!name) return;
    try {
      const { workspace } = this.app;
      let leaf = workspace.getLeavesOfType(VIEW_TYPE_QUESTIONS)[0];
      if (!leaf) leaf = workspace.getLeaf('split', 'vertical');
      await leaf.setViewState({ type: VIEW_TYPE_QUESTIONS, active: true, state: { project: name } });
      workspace.revealLeaf(leaf);
    } catch (e) {
      new Notice(`Index could not open the questions list: ${e.message}`);
      console.error('[index] questions open failed', e);
    }
  }

  // A page's tie, written where the pane reads it: the `section:` field in
  // the page's frontmatter. A tie replaces whatever section the page
  // carried; an untie removes the field and the old importer's
  // `*Project / Section*` line both — either alone would hold the page to
  // its old aim — and the page rides at the project itself, under no aim.
  async setPageSection(pg, name) {
    if (!pg || !pg.file) return;
    try {
      const val = (v) => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      await this.editFile(pg.file, (lines) => {
        let changed = false;
        if (/^\s*-{3,}\s*$/.test(lines[0] || '')) {
          let i = 1;
          while (i < lines.length && !/^\s*-{3,}\s*$/.test(lines[i])) i++;
          if (i >= lines.length) return null; // unterminated — leave the note alone
          let at = -1;
          for (let j = 1; j < i; j++) if (/^\s*section\s*:/.test(lines[j])) { at = j; break; }
          if (name) {
            const field = `section: "${val(name)}"`;
            if (at !== -1) lines[at] = field; else lines.splice(i, 0, field);
            changed = true;
          } else if (at !== -1) {
            lines.splice(at, 1);
            changed = true;
          }
        } else if (name) {
          const head = ['---', `section: "${val(name)}"`, '---'];
          if (lines.length && lines[0].trim() !== '') head.push('');
          lines.unshift(...head);
          changed = true;
        }
        if (!name) {
          for (let j = 0; j < Math.min(lines.length, 8); j++) {
            if (/^\*[^*\n]+?\/[^*\n]+?\*\s*$/.test(lines[j])) { lines.splice(j, 1); changed = true; break; }
          }
        }
        return changed ? lines : null;
      });
    } catch (e) {
      new Notice(`Index could not tie the page: ${e.message}`);
      console.error('[index] page tie failed', e);
    }
  }

  // Paint the vault's graph with the project and folder colours, as colour
  // groups: one group per coloured project (its note's path), one per
  // coloured folder (the folder's path, tinted by the folder note's
  // colour). Groups the user made themselves are left alone — only our
  // path-prefixed entries are replaced, and anything else stays. The graph
  // plugin is internal API, so the whole pass guards and reports.
  async syncGraphColors() {
    try {
      const graph = this.app.internalPlugins
        && this.app.internalPlugins.getPluginById('graph');
      const inst = graph && graph.instance;
      if (!inst || !inst.options || typeof inst.saveOptions !== 'function') {
        new Notice('This Obsidian build does not expose the graph options — nothing written.');
        return;
      }
      const projectsFolder = this.settings.projectsFolder || 'Projects';
      const ours = `path:"${projectsFolder}`;
      const model = await buildModel(this.app, this.settings);
      const groups = [];
      const hex = (c) => {
        const m = /^#?([0-9a-f]{6})$/i.exec(String(c || '').trim());
        return m ? parseInt(m[1], 16) : null;
      };
      const seen = new Set(); // one folder group per folder, not per member
      for (const p of model.projects) {
        if (p.folder && p.group && p.group.color && !seen.has(p.folder)) {
          seen.add(p.folder);
          const c = hex(p.group.color);
          if (c !== null) groups.push({ query: `path:"${projectsFolder}/${p.folder}"`, color: { rgb: c } });
        }
      }
      for (const p of model.projects) {
        if (!p.group || !p.group.color) { // a project colour wins over its folder's
          const c = hex(p.color);
          if (c !== null) groups.push({ query: `path:"${p.file.path}"`, color: { rgb: c } });
        }
      }
      const foreign = (inst.options.colorGroups || []).filter((g) => !String(g && g.query || '').startsWith(ours));
      inst.options.colorGroups = [...foreign, ...groups];
      await inst.saveOptions();
      new Notice(`Graph colours synced: ${groups.length} group${groups.length === 1 ? '' : 's'} (colours set in project and folder notes).`);
    } catch (e) {
      new Notice(`Index could not sync the graph colours: ${e.message}`);
      console.error('[index] colour sync failed', e);
    }
  }

  // ---- the graph jump ----
  // Opens the local graph on a note, the same view state Obsidian's own
  // "Open local graph" command writes: type localgraph, state.file a path.
  // An existing local-graph leaf is reused, so repeated jumps land in the
  // same place instead of stacking tabs.
  async openGraphLeaf(file) {
    if (!file) return;
    try {
      const { workspace } = this.app;
      let leaf = workspace.getLeavesOfType('localgraph')[0];
      if (!leaf) leaf = workspace.getLeaf('split', 'vertical');
      await leaf.setViewState({ type: 'localgraph', active: true, state: { file: file.path } });
      workspace.revealLeaf(leaf);
    } catch (e) {
      new Notice(`Index could not open the graph: ${e.message}`);
      console.error('[index] graph open failed', e);
    }
  }

  // "This project" is the project the pane holds — the active pane when
  // there is one, else the first pane. With `ofGroup` the jump rides one
  // hop up, onto the group's folder note: every project in the folder
  // links to it, so the whole family is on the field at once.
  async openPaneGraph(ofGroup) {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_PROJECT);
    if (!leaves.length) { new Notice('No project pane open — open one from the ring first.'); return; }
    try {
      const active = this.app.workspace.activeLeaf;
      const leaf = (active && leaves.includes(active)) ? active : leaves[0];
      const name = leaf.view && leaf.view.projectName;
      const model = await buildModel(this.app, this.settings);
      const project = model.projects.find(p => p.name === name);
      if (!project) { new Notice(`The pane's project “${name}” is not in the vault (any more).`); return; }
      const file = ofGroup ? (project.group && project.group.file) : project.file;
      if (!file) {
        new Notice(ofGroup
          ? `“${project.name}” is not in a group folder, or the folder has no folder note — a note named after its folder is the group's hub.`
          : 'This project has no note file.');
        return;
      }
      await this.openGraphLeaf(file);
    } catch (e) {
      new Notice(`Index could not open the graph: ${e.message}`);
      console.error('[index] graph open failed', e);
    }
  }

  async activateView() {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE);
    const leaf = existing.length ? existing[0] : workspace.getLeaf('tab');
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    workspace.revealLeaf(leaf);
  }
};