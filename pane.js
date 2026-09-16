/* The project pane — its own leaf beside the ring, as Index's Projects
   view: the big picture from the note's `question:` field, then the
   quest log read off the note's own headings (## aims, ### sub-objectives,
   #### day rows, checkboxes beneath), then the pages index. Every click
   opens the real note in the editor leaf beside this pane; nothing is a
   read-only copy. The write side lives here too, as in Index: quick-add
   inputs in today's row, ＋ Aim / ＋ Sub-objective buttons and the per-row
   ⋯ menu call back into the plugin, which writes the note — nobody
   hand-writes the convention. Pure DOM: the scanner builds the model,
   this only renders it. */

const { parseDate, ageDays, createdOf, todayStr } = require('./scanner.js');

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// Index's inline date heat: a date written into a title is coloured by how
// far out it is — hot through two days (overdue included), warm through a
// week, cold through a month. Ported from the app's markDates/dateHeat.
const DATE_SCAN = /\b\d{4}-\d{1,2}-\d{1,2}\b|\b\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\b|\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s+\d{2,4})?\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?\b/gi;

function heatOf(dateStr, today) {
  const d = Math.round((new Date(dateStr + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
  if (d <= 2) return 'hot';
  if (d <= 7) return 'warm';
  if (d <= 31) return 'cold';
  return null;
}

// Title text with its date tokens wrapped in their heat colour.
function heatHtml(text, today) {
  const s = String(text ?? '');
  let out = '', last = 0, m;
  DATE_SCAN.lastIndex = 0;
  while ((m = DATE_SCAN.exec(s))) {
    const heat = heatOf(parseDate(m[0]), today);
    if (!heat) continue;
    out += esc(s.slice(last, m.index))
      + `<span class="ir-date ir-date-${heat}">${esc(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  return out + esc(s.slice(last));
}

// project: { name, file, color, shelved, fate, open[], loose[], stale[],
//            done, total, question, group{ name, color, question } | null,
//            log{ aims[{name, subs[{name, days[{name, tasks[]}], tasks[],
//                         line}], tasks[], line}], unfiled[task] },
//            pages[{ name, file }] }
// settings: { paneTasks, staleDays, dayPulse, progressStyle }
// aimNotes: the pane-own Set of aims holding their notes list open —
//           passed in, so a re-render (every note edit) keeps them open.
// notesOpen / qsOpen: the pane-own flags for the bottom folds — closed by
//           default, so the pane is the quest log until asked otherwise.
// cb: { openNote(file, line?), setSetting(key, value),
//       addTask(spec, text), addAim(), addSub(aimIdx|-1),
//       tickTask(task), headingMenu({aimIdx, subIdx?, name, aimName}, ev),
//       addPage(), openGraph(), taskMenu(task, ev), pageMenu(page, ev),
//       toggleNotes(), toggleQuestions(),
//       moveTask(task, drop), moveSub(drag, drop) }
function renderPane(el, project, settings, cb, pagesFolder, aimNotes = new Set(), notesOpen = false, qsOpen = false) {
  if (!project) {
    el.innerHTML = `<div class="ir-empty">
      <div class="ir-empty-icon">◇</div>
      No project here — click a segment or a list row on the ring to open one.
    </div>`;
    return;
  }

  const today = todayStr();
  const staleDays = settings.staleDays ?? 3;
  const now = new Date();
  const frac = ((now - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000).toFixed(4);

  // ---- the quest log ----
  const rowTasks = []; // data-task index → the task record behind the row
  const taskRow = (t, opt = {}) => {
    const done = t.status === 'done';
    const idx = rowTasks.push(t) - 1;
    const tags = (t.tags || []).map((tag) => `<span class="ir-tag">#${esc(tag)}</span>`).join('');
    // Drag-and-drop: a row is pickable only when the task lives in this
    // project's own note (a tag-gathered or page checkbox stays put) and
    // is not a carried duplicate — the original, in its past row, is.
    const canDrag = !opt.carried && !(t.file && project.file && t.file.path !== project.file.path);
    return `<div class="ir-task ${done ? 'is-done' : ''} ${t.loose ? 'f-overdue' : ''} ${opt.carried ? 'is-carried' : ''}" data-task="${idx}"${opt.loc ? ` data-loc="${opt.loc}"` : ''}${opt.carried ? ' data-carried="1"' : ''}${canDrag ? ' draggable="true" data-drag="1"' : ''}>
      <span class="ir-task-box" aria-hidden="true"></span>
      <span class="ir-task-text">${heatHtml(t.text, today)}</span>
      ${opt.carried ? `<span class="ir-task-from">from ${esc(opt.carried)}</span>` : ''}
      ${opt.past && t.status === 'open' ? `<span class="ir-task-open-hint">still open</span>` : ''}
      ${tags}
      ${t.due ? `<span class="ir-task-due${t.loose ? ' late' : ''}">${t.due}</span>` : ''}
      <button class="ir-task-more" data-more="${idx}" title="Task menu">⋯</button>
    </div>`;
  };
  // Loose marks ride along on the rows even when set by the flat scan.
  const markLoose = (t) => {
    t.loose = t.loose || (!!t.due && t.status === 'open' && t.due < today);
    return t;
  };

  const tally = (tasks) => {
    const list = tasks.filter(t => t.status !== 'scrapped');
    return { done: list.filter(t => t.status === 'done').length, total: list.length };
  };
  const flatOf = (entry) => {
    let flat = entry.tasks.slice();
    if (entry.days) flat = flat.concat(entry.days.flatMap(d => d.tasks));
    if (entry.subs) flat = flat.concat(entry.subs.flatMap(s => s.tasks.concat(s.days.flatMap(d => d.tasks))));
    return flat;
  };
  const ctOf = (entry) => {
    const { done, total } = tally(flatOf(entry));
    return total ? `${done}/${total}` : '';
  };
  // The oldest open thread under a container, in days — Index's "oldest
  // thread" age on the aim. Undated creation falls back to the file's
  // creation time; nothing provable counts as ancient.
  const oldestOf = (entry) => {
    const ages = flatOf(entry)
      .filter(t => t.status === 'open' && !t.due)
      .map(t => ageDays(createdOf(t)))
      .filter(Number.isFinite);
    return ages.length ? Math.max(...ages) : 0;
  };
  const ageHtml = (entry) => {
    const days = oldestOf(entry);
    return days >= staleDays ? `<span class="ir-age">oldest thread ${days}d</span>` : '';
  };

  const pulse = settings.dayPulse === false ? '' : `<span class="ir-day-pulse" style="--frac:${frac}" aria-hidden="true"></span>`;
  const dayHtml = (d, opt = {}) => {
    const isToday = d.name != null && parseDate(d.name) === today;
    return `<div class="ir-day${isToday ? ' ir-day-today' : ''}">
      ${d.name ? `<div class="ir-day-head">${esc(d.name)}${isToday ? pulse : ''}</div>` : ''}
      ${d.tasks.map(t => taskRow(markLoose(t), opt)).join('')}
    </div>`;
  };

  // Sub-objectives carry Index's planner reading: day rows newest first,
  // today's row on top — and an open task from a past row reappears in
  // today's row with a "from <date>" chip, while its own row keeps it
  // with a "still open" hint. The quick-add input sits in today's row.
  const subHtml = (aimIdx, subIdx) => (s) => {
    const days = s.days.slice().reverse(); // written chronologically, read from today back
    const todayDay = days.find(d => parseDate(d.name) === today);
    const carried = [];
    for (const d of days) {
      const date = d.name != null ? parseDate(d.name) : null;
      if (date && date < today) for (const t of d.tasks) if (t.status === 'open') carried.push({ t, from: date });
    }
    const todayBlock = todayDay || { name: today, tasks: [] };
    const rest = days.filter(d => d !== todayDay);
    const loc = `${aimIdx}:${subIdx}`; // rows say where they sit, for drop targets
    return `<div class="ir-sub">
      <div class="ir-sub-head" data-aim="${aimIdx}" data-sub="${subIdx}" draggable="true" data-drag-sub="${aimIdx}:${subIdx}">
        <span class="ir-sub-name">${heatHtml(s.name, today)}</span>
        <span class="ir-sub-ct">${ctOf(s)}</span>
        ${ageHtml(s)}
      </div>
      ${s.tasks.length ? dayHtml({ name: null, tasks: s.tasks }, { loc }) : ''}
      <div class="ir-day ir-day-today">
        <div class="ir-day-head">${esc(todayBlock.name)}${pulse}</div>
        ${carried.map(c => taskRow(markLoose(c.t), { carried: c.from, loc })).join('')}
        ${todayBlock.tasks.map(t => taskRow(markLoose(t), { loc })).join('')}
        <div class="ir-add">
          <input class="ir-add-input" data-add-task="${aimIdx}:${subIdx}" placeholder="Add a task for today…">
        </div>
      </div>
      ${rest.map(d => dayHtml(d, { past: true, loc })).join('')}
    </div>`;
  };

  // ---- the pages index, grouped by their sub-objective as Index's
  // per-section notes ----
  const pages = project.pages || [];
  const pageRow = (pg, j) => `
    <button class="ir-page-item" data-page="${j}">
      <span class="ir-page-dot" aria-hidden="true"></span>
      <span class="ir-page-name">${esc(pg.name)}</span>
    </button>`;
  const plain = pages.map((pg, j) => ({ pg, j })).filter((x) => !x.pg.section);
  const questionsCt = pages.filter((pg) => pg.section === 'Open questions').length;
  const visible = pages.length - questionsCt;
  const sections = [];
  for (const [j, pg] of pages.entries()) {
    // Open questions never clutter the Notes side — the pane foot's button
    // is their home: the questions list leaf, with their count on it.
    if (!pg.section || pg.section === 'Open questions') continue;
    let sec = sections.find((s) => s.name === pg.section);
    if (!sec) { sec = { name: pg.section, items: [] }; sections.push(sec); }
    sec.items.push(pageRow(pg, j));
  }
  const pagesHtml =
    plain.map((x) => pageRow(x.pg, x.j)).join('')
    + sections.map((s) => `<div class="ir-pages-section">${esc(s.name)}</div>${s.items.join('')}`).join('');
  const qsRows = pages.filter((pg) => pg.section === 'Open questions')
    .map((pg) => pageRow(pg, pages.indexOf(pg))).join('');

  // The pages that belong to one aim, as Index tied its notes to the
  // sections: a page's section names one of the aim's sub-objectives, or
  // the aim itself. The aim head carries their count as its notes button.
  const aimPages = (a) => pages.filter((pg) => pg.section && pg.section !== 'Open questions'
    && (pg.section === a.name || a.subs.some((s) => s.name === pg.section)));

  const aimHtml = (a, aimIdx) => {
    const notes = aimPages(a);
    const notesOpen = notes.length && aimNotes.has(aimIdx);
    return `<article class="ir-aim">
    <div class="ir-aim-head" data-aim="${aimIdx}">
      <span class="ir-aim-mk">◇</span>
      <span class="ir-aim-name">${heatHtml(a.name || 'General', today)}</span>
      <span class="ir-aim-ct">${ctOf(a)}</span>
      ${ageHtml(a)}
      ${notes.length ? `<button class="ir-aim-notes${notesOpen ? ' is-on' : ''}" data-notes="${aimIdx}" title="Show this aim's pages">notes · ${notes.length}</button>` : ''}
      <button class="ir-add-mini" data-add-sub="${aimIdx}" title="Add a sub-objective under this aim">＋ Sub-objective</button>
    </div>
    ${notes.length ? `<div class="ir-aim-notes-list" data-aim-pages="${aimIdx}"${notesOpen ? '' : ' hidden'}>${notes.map((pg) => pageRow(pg, pages.indexOf(pg))).join('')}</div>` : ''}
    ${a.tasks.length ? dayHtml({ name: null, tasks: a.tasks }, { loc: String(aimIdx) }) : ''}
    ${a.subs.map((s, i) => subHtml(aimIdx, i)(s)).join('')}
  </article>`;
  };

  const log = project.log || { aims: [], unfiled: [] };
  const logHtml =
    `<div class="ir-add-tools">
      <button class="ir-add-btn" data-add-aim>＋ Aim</button>
      <button class="ir-add-btn" data-add-sub="-1">＋ Sub-objective</button>
    </div>`
    + log.aims.map(aimHtml).join('')
    + `<div class="ir-aim ir-unfiled">
        <div class="ir-aim-head">
          <span class="ir-aim-mk">≈</span>
          <span class="ir-aim-name">Unfiled</span>
          <span class="ir-aim-ct">${ctOf({ tasks: log.unfiled, subs: [], days: undefined })}</span>
        </div>
        ${log.unfiled.length ? dayHtml({ name: null, tasks: log.unfiled }, { loc: 'u' }) : '<div class="ir-pane-empty">No floating tasks.</div>'}
        <div class="ir-add">
          <input class="ir-add-input" data-add-task="u" placeholder="Add a task…">
        </div>
      </div>`;

  // ---- the pane head: fate, stale badge, progress glyph ----
  // The progress glyph, as the app's project head: pulse (the default) and
  // nodes are one mark per thread up to 14, done ones filled, the current
  // one alive; bar, comet and filament read the same fraction at a glance.
  // Chosen in Settings → Index → Progress glyph.
  const progressHtml = (doneT, total) => {
    if (!total) return '';
    const style = settings.progressStyle || 'pulse';
    const pct = Math.round((doneT / total) * 100);
    const title = `${doneT}/${total} done`;
    if (style === 'bar') {
      return `<span class="ir-progress ir-progress-bar" title="${title}"><span class="ir-pg-fill" style="width:${pct}%"></span></span>`;
    }
    if (style === 'comet') {
      // All done: the comet rests at the far end — a finished thing, not a
      // moving one. Open work is what makes the light travel.
      const idle = doneT >= total;
      return `<span class="ir-progress ir-pg-comet${idle ? ' is-idle' : ''}" title="${title}"></span>`;
    }
    if (style === 'filament') {
      return `<span class="ir-progress ir-pg-filament" title="${title}">`
        + `<span class="ir-pg-fil-fill" style="width:${pct}%"></span>`
        + `<span class="ir-pg-fil-head" style="left:${pct}%"></span></span>`;
    }
    const n = Math.min(total, 14);
    const fill = Math.round((doneT / total) * n);
    let nodes = '';
    for (let i = 0; i < n; i++) {
      const cls = i < fill ? ' is-done' : i === fill && doneT < total ? ' is-current' : '';
      nodes += `<span class="ir-pg-node${cls}"></span>`;
    }
    return `<span class="ir-progress is-${style}" title="${title}">${nodes}</span>`;
  };
  const staleN = (project.stale || []).length;

  // A group's big picture fills in for a project that has none of its own.
  const bp = project.question || (project.group && project.group.question);

  const folded = settings.paneTasks === false;
  el.innerHTML = `
    <div class="ir-pane">
      <div class="ir-pane-head">
        <span class="ir-dot f-${project.shelved ? 'shelved' : project.fate}"></span>
        <span class="ir-pane-name">${esc(project.name)}</span>
        ${staleN ? `<span class="ir-stale-badge">${staleN} stale</span>` : ''}
        ${progressHtml(project.done, project.total)}
        <span class="ir-pane-meta">${project.shelved ? 'on the shelf' : `${project.open.length} open${project.loose.length ? ` · ${project.loose.length} loose` : ''}`}${project.total ? ` · ${project.done}/${project.total} done` : ''}</span>
        <button class="ir-open-note" data-graph title="Open this project in the graph">Graph</button>
      </div>
      <div class="ir-pane-scroll">
        ${bp ? `
        <div class="ir-bp">
          <div class="ir-bp-label">Big picture<button class="ir-bp-edit" data-edit-bp title="Edit the big picture">✎</button></div>
          <div class="ir-bp-text">${esc(bp)}</div>
        </div>` : `
        <button class="ir-bp-add" data-edit-bp title="Give this project its question">＋ Big picture</button>`}
        <button class="ir-log-head" data-fold-tasks aria-expanded="${!folded}">
          <span class="ir-pane-title">Tasks</span>
          <span class="ir-fold-caret">${folded ? '▸' : '▾'}</span>
        </button>
        <div class="ir-log-body" ${folded ? 'hidden' : ''}>${logHtml || `<div class="ir-pane-empty">No tasks in this project's note yet — ＋ Aim starts the log.</div>`}</div>
        <div class="ir-pane-extras">
          <button class="ir-log-head" data-fold-notes aria-expanded="${notesOpen}">
            <span class="ir-pane-title">Notes</span>
            <span class="ir-pages-ct">${visible ? `${visible} page${visible === 1 ? '' : 's'}` : ''}</span>
            <span class="ir-fold-caret">${notesOpen ? '▾' : '▸'}</span>
          </button>
          <div class="ir-extras-body" data-extra-notes${notesOpen ? '' : ' hidden'}>
            ${visible ? pagesHtml : `<div class="ir-pane-empty">No pages joined yet — pages live in <code>${esc(pagesFolder || 'Pages')}/${esc(project.name)}/</code>, or carry a <code>project:</code> frontmatter field.</div>`}
            <div class="ir-pages-add"><button class="ir-add-mini" data-add-page>＋ Page</button></div>
          </div>
          ${questionsCt ? `
          <button class="ir-log-head" data-fold-qs aria-expanded="${qsOpen}">
            <span class="ir-pane-title">Open questions</span>
            <span class="ir-pages-ct">${questionsCt}</span>
            <span class="ir-fold-caret">${qsOpen ? '▾' : '▸'}</span>
          </button>
          <div class="ir-extras-body" data-extra-qs${qsOpen ? '' : ' hidden'}>${qsRows}</div>` : ''}
          <button class="ir-log-head" data-open-note title="Frontmatter, prose, the day headings themselves">
            <span class="ir-pane-title">Open the project note</span>
          </button>
        </div>
      </div>
    </div>`;

  // ---- wiring: the pane is the editor, the leaf is for prose ----
  // A task click is Index's tick cycle — the note is written in place, no
  // leaf. Double-click opens the real note at the line, for reading the
  // day's own words; the ⋯ button and right-click carry the rest.
  let dragging = null; // the drag payload, alive from dragstart to drop
  el.querySelectorAll('.ir-task').forEach(row => {
    const t = rowTasks[Number(row.dataset.task)];
    row.addEventListener('click', () => cb.tickTask(t));
    row.addEventListener('dblclick', () => cb.openNote(t.file || project.file, t.line));
    row.addEventListener('contextmenu', (ev) => { ev.preventDefault(); cb.taskMenu(t, ev); });
    // The pick-up: only the project note's own rows (data-drag), the
    // payload riding the closure until the drop hands it over.
    if (row.dataset.drag) {
      row.addEventListener('dragstart', (ev) => {
        dragging = { kind: 'task', t, loc: row.dataset.loc };
        row.classList.add('is-dragging');
        if (ev.dataTransfer) {
          ev.dataTransfer.setData('text/plain', 'index-task'); // Firefox requires it
          ev.dataTransfer.effectAllowed = 'move';
        }
      });
      row.addEventListener('dragend', () => { dragging = null; row.classList.remove('is-dragging'); });
    }
    // The put-down: above this row's own task. A carried duplicate stands
    // in today's row but its line is in a past day — onto that sub's
    // today row instead, where a dropped task belongs.
    row.addEventListener('dragover', (ev) => { if (dragging && dragging.kind === 'task') ev.preventDefault(); });
    row.addEventListener('drop', (ev) => {
      if (!dragging || dragging.kind !== 'task' || dragging.t === t) return;
      if (ev.preventDefault) ev.preventDefault();
      if (row.dataset.carried) {
        const [aimIdx, subIdx] = String(row.dataset.loc || '').split(':').map(Number);
        cb.moveTask(dragging.t, { mode: 'today', aimIdx, subIdx });
      } else {
        cb.moveTask(dragging.t, { mode: 'before', target: t });
      }
      dragging = null;
    });
  });
  // Aim and sub-objective headings open their menu in the pane — right-click:
  // rename, or delete the whole block. They are drop targets too: a task
  // dropped on an aim lands under it, on the unfiled head it goes floating;
  // a sub-objective dropped on an aim moves to that aim's end, on another
  // sub-objective it is inserted before it.
  el.querySelectorAll('.ir-aim-head').forEach(h => {
    h.addEventListener('dragover', (ev) => { if (dragging) ev.preventDefault(); });
    h.addEventListener('drop', (ev) => {
      if (!dragging) return;
      if (ev.preventDefault) ev.preventDefault();
      if (h.dataset.aim === undefined) {
        // The unfiled bucket's head is not a container — a task dropped
        // here leaves the log for the floating life.
        if (dragging.kind === 'task') cb.moveTask(dragging.t, { mode: 'unfiled' });
      } else {
        const aimIdx = Number(h.dataset.aim);
        if (dragging.kind === 'task') cb.moveTask(dragging.t, { mode: 'aim', aimIdx });
        else cb.moveSub(dragging, { mode: 'aim', aimIdx });
      }
      dragging = null;
    });
    if (h.dataset.aim === undefined) return; // the unfiled bucket's head carries no menu
    const aimIdx = Number(h.dataset.aim);
    h.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      cb.headingMenu({ aimIdx, name: log.aims[aimIdx] && log.aims[aimIdx].name }, ev);
    });
  });
  el.querySelectorAll('.ir-sub-head').forEach(h => {
    const aimIdx = Number(h.dataset.aim), subIdx = Number(h.dataset.sub);
    const aim = log.aims[aimIdx];
    const sub = aim && aim.subs[subIdx];
    h.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      // aimName rides along so a link can chain to the sub through its aim.
      cb.headingMenu({ aimIdx, subIdx, name: sub && sub.name, aimName: aim && aim.name }, ev);
    });
    // A sub-objective drags its whole block — heading, day rows, tasks —
    // to a new spot: before another sub-objective, or to an aim's end.
    h.addEventListener('dragstart', (ev) => {
      dragging = { kind: 'sub', aimIdx, subIdx };
      h.classList.add('is-dragging');
      if (ev.dataTransfer) {
        ev.dataTransfer.setData('text/plain', 'index-sub');
        ev.dataTransfer.effectAllowed = 'move';
      }
    });
    h.addEventListener('dragend', () => { dragging = null; h.classList.remove('is-dragging'); });
    h.addEventListener('dragover', (ev) => { if (dragging) ev.preventDefault(); });
    h.addEventListener('drop', (ev) => {
      if (!dragging) return;
      if (ev.preventDefault) ev.preventDefault();
      if (dragging.kind === 'task') cb.moveTask(dragging.t, { mode: 'today', aimIdx, subIdx });
      else if (dragging.aimIdx !== aimIdx || dragging.subIdx !== subIdx)
        cb.moveSub(dragging, { mode: 'before', aimIdx, subIdx });
      dragging = null;
    });
  });
  el.querySelectorAll('.ir-task-more').forEach(btn => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      cb.taskMenu(rowTasks[Number(btn.dataset.more)], ev);
    });
  });
  // ＋ Page at the Notes side's bottom — always there, so even a project
  // with no pages yet can create its first one.
  el.querySelectorAll('[data-add-page]').forEach(btn =>
    btn.addEventListener('click', () => cb.addPage()));
  // The big picture, added or edited where the pane reads it.
  el.querySelectorAll('[data-edit-bp]').forEach(btn =>
    btn.addEventListener('click', () => cb.editBp(project)));
  // An aim's notes button opens its pages in place, under its head —
  // Index's per-section notes. The choice rides the pane's own Set, so
  // every re-render keeps the open lists open; the list itself toggles
  // in the DOM, no rebuild, no rescan on the click.
  el.querySelectorAll('[data-notes]').forEach(btn => {
    btn.addEventListener('click', () => {
      const aimIdx = Number(btn.dataset.notes);
      const open = !aimNotes.has(aimIdx);
      if (open) aimNotes.add(aimIdx); else aimNotes.delete(aimIdx);
      const list = el.querySelector(`[data-aim-pages="${aimIdx}"]`);
      if (list) list.hidden = !open;
      btn.classList.toggle('is-on', open);
    });
  });
  // The graph jump: this project's own constellation, on demand.
  const graphBtn = el.querySelector('[data-graph]');
  if (graphBtn) graphBtn.addEventListener('click', () => cb.openGraph());
  // The bottom folds, exactly the Tasks fold's idiom at the top: Notes and
  // Open questions unfold their rows in place (the open flags ride the
  // view, re-threaded on every render), and the project-note row opens the
  // raw note behind the pane.
  el.querySelectorAll('[data-fold-notes]').forEach(btn =>
    btn.addEventListener('click', () => cb.toggleNotes()));
  const qsFold = el.querySelector('[data-fold-qs]');
  if (qsFold) qsFold.addEventListener('click', () => cb.toggleQuestions());
  const noteRow = el.querySelector('[data-open-note]');
  if (noteRow) noteRow.addEventListener('click', () => cb.openNote(project.file));
  el.querySelectorAll('.ir-page-item').forEach(btn => {
    const pg = pages[Number(btn.dataset.page)];
    btn.addEventListener('click', () => cb.openNote(pg.file));
    btn.addEventListener('dblclick', () => cb.openNote(pg.file));
    // Right-click a page for its menu — a question, there, becomes work.
    btn.addEventListener('contextmenu', (ev) => { ev.preventDefault(); cb.pageMenu(pg, ev); });
  });
  // Quick-add: Enter in the input writes the task through cb — the pane
  // never touches the note itself.
  el.querySelectorAll('[data-add-task]').forEach(input => {
    input.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter') return;
      const text = input.value.trim();
      if (!text) return;
      ev.preventDefault();
      if (input.dataset.addTask === 'u') cb.addTask({ kind: 'unfiled' }, text);
      else {
        const [aimIdx, subIdx] = input.dataset.addTask.split(':').map(Number);
        cb.addTask({ kind: 'today', aimIdx, subIdx }, text);
      }
      input.value = '';
    });
  });
  const aimBtn = el.querySelector('[data-add-aim]');
  if (aimBtn) aimBtn.addEventListener('click', () => cb.addAim());
  el.querySelectorAll('[data-add-sub]').forEach(btn => {
    btn.addEventListener('click', () => cb.addSub(Number(btn.dataset.addSub)));
  });

  // The tasks fold, persisted as the pane's own choice. The log stays in
  // the DOM and toggles in place — no rebuild, no rescan on the click.
  const foldBtn = el.querySelector('[data-fold-tasks]');
  const logBody = el.querySelector('.ir-log-body');
  foldBtn.addEventListener('click', () => {
    const open = logBody.hidden;
    logBody.hidden = !open;
    foldBtn.querySelector('.ir-fold-caret').textContent = open ? '▾' : '▸';
    foldBtn.setAttribute('aria-expanded', String(open));
    cb.setSetting('paneTasks', open);
  });
}

module.exports = { renderPane };