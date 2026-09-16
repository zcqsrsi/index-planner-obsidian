/* The ring — the map, ported from index-planner renderer/views/dashboard.js.
   One segment per project, a plate per open thread, ticks for loose ends.
   The map is its own full page, as in the app: the hideable overview bar
   (the original's hero) up top, the ring given the room, the projects list
   docked at the bottom of the screen. Clicking a segment or list row opens
   the project pane as its own leaf beside this one (cb.openProject). Pure
   DOM: scanner.js builds the model, this only renders it. */

const { parseDate, todayStr } = require('./scanner.js');

const RING = {
  CX: 180, CY: 180, R: 140,
  GAP: 5,        // degrees between segments
  MIN_ARC: 8,    // an idle segment stays visible
  STROKE: 18,    // plate thickness
  PLATE_GAP: 3,  // degrees between plates
  MAX_PLATES: 24, // cap: beyond this the plates fuse into a band
  LIFT_PX: 6,    // hover: how far a plate detaches from the ring
};

const rad = (deg) => (deg * Math.PI) / 180;

// Bare-number banding: calm → warm → hot as the count climbs.
function bandFor(n) {
  if (n >= 13) return 'hot';
  if (n >= 6) return 'warm';
  return 'calm';
}

// Stroke-arc path from startDeg to endDeg (0° = 3 o'clock, clockwise).
function arcPath(cx, cy, r, startDeg, endDeg) {
  const large = endDeg - startDeg > 180 ? 1 : 0;
  const x1 = cx + Math.cos(rad(startDeg)) * r, y1 = cy + Math.sin(rad(startDeg)) * r;
  const x2 = cx + Math.cos(rad(endDeg)) * r, y2 = cy + Math.sin(rad(endDeg)) * r;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// Group folds on the legend are for looking, not deciding — session-only,
// as Index's legend folds, and cleared by a reload.
const foldedGroups = new Set();

// The lazy spin — the ring turns like the control room's hologram, slowly.
// The phase lives on the host element, not the DOM: the view rebuilds the
// whole ring on every note edit, and an animation restarted from scratch
// would snap the rotor back to 0° and jitter. The angle advances on the
// wall clock — each step clamped, so a background tab whose rAF throttled
// resumes where the eye left off rather than fast-forwarding — and freezes
// only while the pointer rests on the ring.
const SPIN_MS = 150000; // one full revolution, as the app's 150s spin

function advanceSpin(s, now) {
  const dt = Math.min(now - s.t0, 200);
  if (dt > 0) { s.angle = (s.angle + (dt / SPIN_MS) * 360) % 360; s.t0 = now; }
}

function startSpin(el, rotor) {
  const reduce = typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return; // the ring holds still; nothing keeps time
  const s = el._spin || (el._spin = { angle: 0, t0: performance.now(), paused: false });
  if (!s.paused) advanceSpin(s, performance.now());
  rotor.style.transform = `rotate(${s.angle}deg)`;
  if (typeof requestAnimationFrame !== 'function') return; // the harness
  const step = () => {
    if (!rotor.isConnected) return; // rebuilt or closed — the fresh render owns the loop
    if (!s.paused) {
      advanceSpin(s, performance.now());
      rotor.style.transform = `rotate(${s.angle}deg)`;
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// model.projects: [{ name, file, shelved, fate, open[], loose[], stale[],
//                    done, total, color, question, folder, group, log,
//                    pages[{ name, file }] }]
// settings: { ringScale, ringCount, ringHoverLift, showProjects, overviewHidden, staleDays }
// cb: { openFile(file, line?), openProject(name), setSetting(key, value), createProject() }
function renderRing(el, model, settings, cb) {
  const fated = model.projects;
  const totalOpen = fated.filter(f => !f.shelved).reduce((n, f) => n + f.open.length, 0);
  const looseTotal = fated.reduce((n, f) => n + f.loose.length, 0);
  const live = fated.filter(f => !f.shelved && f.open.length).length;

  // The overview bar, as the app's hideable hero: the day, then the counts
  // as chips — overdue loose ends, due today, open threads, active
  // projects — banded calm → warm → hot as the counts climb, and ＋ New
  // project as its one action. Hidden, it leaves its ⌃ overview link.
  const hidden = settings.overviewHidden === true;
  const today = todayStr();
  const overdue = looseTotal;
  const dueToday = fated.reduce((n, f) =>
    n + f.open.filter(t => t.due && parseDate(t.due) === today).length, 0);
  const active = fated.filter(f => !f.shelved).length;
  const now = new Date();
  const overviewHtml = hidden
    ? `<div class="ir-overview-row"><button class="ir-overview-toggle" data-overview-toggle title="Show the overview bar">⌃ overview</button></div>`
    : `<div class="ir-hero">
        <div class="ir-hero-date">
          <span class="ir-hero-day">${esc(now.toLocaleDateString(undefined, { weekday: 'long' }))}</span>
          <span class="ir-hero-sub">${esc(now.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }))}</span>
        </div>
        <div class="ir-hero-counts">
          ${overdue ? `<span class="ir-chip ir-chip-od" title="${overdue} loose end${overdue === 1 ? '' : 's'}"><b>${overdue}</b> overdue</span>` : ''}
          ${dueToday ? `<span class="ir-chip ir-chip-td" title="${dueToday} due today"><b>${dueToday}</b> today</span>` : ''}
          <span class="ir-chip b-${bandFor(totalOpen)}" title="${totalOpen} open task${totalOpen === 1 ? '' : 's'}"><b>${totalOpen}</b> open</span>
          <span class="ir-chip b-${bandFor(active)}" title="${active} active project${active === 1 ? '' : 's'}"><b>${active}</b> project${active === 1 ? '' : 's'}</span>
          <button class="ir-hero-new" data-new-project title="A new note under the projects folder, opened in its pane">＋ New project</button>
        </div>
        <button class="ir-overview-toggle" data-overview-toggle title="Hide the overview bar for a wider view">⌄ overview</button>
      </div>`;
  const wireOverview = () => {
    const toggle = el.querySelector('[data-overview-toggle]');
    if (toggle) toggle.addEventListener('click', () => cb.setSetting('overviewHidden', !hidden));
    const newBtn = el.querySelector('[data-new-project]');
    if (newBtn) newBtn.addEventListener('click', () => cb.createProject());
  };

  if (!fated.length) {
    el.innerHTML = `<div class="ir-wrap">
      ${overviewHtml}
      <div class="ir-stage"><div class="ir-empty">
        <div class="ir-empty-icon">◯</div>
        No projects — ＋ New project above starts one, or put a note anywhere under <code>${esc(model.folderLabel)}</code> with a
        <code>status</code> frontmatter field (top-level notes count without one), or import from Index (command palette).
      </div></div>
    </div>`;
    wireOverview();
    return;
  }

  const { CX, CY, R, GAP, MIN_ARC, STROKE, PLATE_GAP, MAX_PLATES } = RING;
  const usable = 360 - GAP * fated.length;

  // Segment spans: proportional to each project's open threads when ring
  // scaling is on; equal otherwise. Either way every project keeps a
  // visible sliver; above-minimum arcs shrink by their share of overflow.
  const weightSum = fated.reduce((n, f) => n + (f.shelved ? 1 : f.open.length), 0) || 1;
  let spans = settings.ringScale !== false
    ? fated.map(f => ((f.shelved ? 1 : f.open.length) / weightSum) * usable)
    : fated.map(() => usable / fated.length);
  spans = spans.map(s => Math.max(s, MIN_ARC));
  const excess = spans.reduce((a, b) => a + b, 0) - usable;
  if (excess > 0) {
    const slack = spans.map(s => s - MIN_ARC);
    const slackSum = slack.reduce((a, b) => a + b, 0) || 1;
    spans = spans.map((s, i) => s - (slack[i] / slackSum) * excess);
  }

  let angle = -90; // start at 12 o'clock
  let plates = '';
  let ticks = '';
  fated.forEach((f, i) => {
    const start = angle + GAP / 2;
    const span = spans[i] - GAP;
    const end = start + span;
    angle += spans[i];
    const fate = f.shelved ? 'shelved' : f.fate;

    // One plate per open thread (up to the cap), then a fused band.
    const n = Math.min(f.open.length, MAX_PLATES);
    const plate = (a0, a1, op, task) => {
      const mid = rad((a0 + a1) / 2);
      const label = task
        ? `${f.name} — ${task.text}${task.due ? ` · due ${task.due}` : ''}`
        : `${f.name} — dormant`;
      return `<g class="ir-plate-g" data-project="${i}" data-name="${esc(f.name)}"
        data-open="${f.open.length}" data-loose="${f.loose.length}"
        data-mx="${Math.cos(mid).toFixed(3)}" data-my="${Math.sin(mid).toFixed(3)}">
        <path class="ir-plate-hit" d="${arcPath(CX, CY, R, a0, a1)}" fill="none"
              stroke="transparent" stroke-width="${STROKE + 10}" pointer-events="stroke"></path>
        <path class="ir-plate f-${fate}" ${task ? `data-line="${task.line}"` : ''}
              d="${arcPath(CX, CY, R, a0, a1)}" fill="none" stroke-opacity="${op}" stroke-width="${STROKE}">
          <title>${esc(label)}</title></path></g>`;
    };
    if (n === 0) {
      plates += plate(start, end, f.shelved ? 0.3 : 0.35, null);
    } else {
      const pg = Math.min(PLATE_GAP, span / (n * 4));
      const pw = (span - pg * (n - 1)) / n;
      f.open.slice(0, n).forEach((t, j) => {
        const s0 = start + j * (pw + pg);
        plates += plate(s0, s0 + pw,
          f.shelved ? 0.3 : (t.loose ? 1 : (fate === 'healthy' ? 0.75 : 0.9)), t);
      });
    }

    // Done work: a thin inner arc eating into the project's span.
    if (!f.shelved && f.total > 0 && f.done > 0) {
      plates += `<path class="ir-done" d="${arcPath(CX, CY, R - STROKE / 2 - 6, start, start + span * (f.done / f.total))}"
        fill="none" stroke="var(--text-faint)" stroke-opacity="0.45" stroke-width="2.5">
        <title>${esc(f.name)} — ${f.done}/${f.total} resolved</title></path>`;
    }

    // Loose-end ticks riding their plates — never on a shelved segment.
    if (!f.shelved) f.loose.forEach((t, j) => {
      const a = f.loose.length === 1 ? (start + end) / 2 : start + (span * (j + 0.5)) / f.loose.length;
      const c = Math.cos(rad(a)), s = Math.sin(rad(a));
      ticks += `<line class="ir-tick" data-project="${i}" data-line="${t.line}"
        x1="${CX + c * (R - STROKE / 2 - 4)}" y1="${CY + s * (R - STROKE / 2 - 4)}"
        x2="${CX + c * (R + STROKE / 2 + 4)}" y2="${CY + s * (R + STROKE / 2 + 4)}"
        stroke="var(--ir-overdue)" stroke-width="2.5">
        <title>${esc(t.text)}${t.due ? ` — was due ${t.due}` : ''}</title></line>`;
    });
  });

  // The legend: top-level projects flat, foldered projects under foldable
  // group headers (the folder is the group, as Index's legend), shelved
  // projects in a Shelf section at the bottom.
  const rowHtml = (f, i) => `
    <button class="ir-legend-item" data-project="${i}">
      <span class="ir-dot f-${f.shelved ? 'shelved' : f.fate}"></span>
      <span class="ir-name">${esc(f.name)}</span>
      ${(f.stale || []).length ? `<span class="ir-stale-badge" title="${(f.stale || []).length} stale thread${f.stale.length === 1 ? '' : 's'}">${f.stale.length}</span>` : ''}
      <span class="ir-meta">${f.shelved ? 'on the shelf' : `${f.open.length} open${f.loose.length ? ` · ${f.loose.length} loose` : ''}`}</span>
    </button>`;
  const plainIdx = [], shelvedIdx = [], groupIdx = new Map();
  fated.forEach((f, i) => {
    if (f.shelved) shelvedIdx.push(i);
    else if (f.folder) {
      if (!groupIdx.has(f.folder)) groupIdx.set(f.folder, []);
      groupIdx.get(f.folder).push(i);
    } else plainIdx.push(i);
  });
  const groupHtml = (folder, idxs) => {
    const g = fated[idxs[0]].group || {};
    const label = g.name || folder.split('/').pop();
    const open = idxs.reduce((n, i) => n + fated[i].open.length, 0);
    const folded = foldedGroups.has(folder);
    const color = g.color ? ` style="color:${esc(g.color)}"` : '';
    return `<div class="ir-legend-group${folded ? ' is-folded' : ''}">
      <button class="ir-legend-group-head" data-group="${esc(folder)}" aria-expanded="${!folded}">
        <span class="ir-fold-caret">${folded ? '▸' : '▾'}</span>
        <span class="ir-legend-group-name"${color}>${esc(label)}</span>
        <span class="ir-meta">${idxs.length} project${idxs.length === 1 ? '' : 's'} · ${open} open</span>
      </button>
      <div class="ir-legend-group-block"${folded ? ' hidden' : ''}>${idxs.map(i => rowHtml(fated[i], i)).join('')}</div>
    </div>`;
  };
  const legend =
    plainIdx.map(i => rowHtml(fated[i], i)).join('')
    + [...groupIdx].map(([folder, idxs]) => groupHtml(folder, idxs)).join('')
    + (shelvedIdx.length ? `
      <div class="ir-shelf-head">Shelf</div>
      ${shelvedIdx.map(i => rowHtml(fated[i], i)).join('')}` : '');

  el.innerHTML = `
    <div class="ir-wrap">
      ${overviewHtml}
      <div class="ir-stage">
        <svg class="ir-ring" viewBox="0 0 360 360" role="img" aria-label="Projects ring">
          <g class="ir-rotor">${plates}${ticks}</g>
          ${settings.ringCount !== false
            ? `<text class="ir-center-num b-${bandFor(totalOpen)}" x="180" y="196">${totalOpen}</text>`
            : ''}
          <text class="ir-center-label" x="180" y="222"></text>
        </svg>
      </div>
      <div class="ir-status">${totalOpen} open · ${looseTotal} loose ${looseTotal === 1 ? 'end' : 'ends'} · ${live} live project${live === 1 ? '' : 's'} · click a project to open its pane</div>
      <div class="ir-projects">
        <div class="ir-legend" ${settings.showProjects === false ? 'hidden' : ''}>${legend}</div>
        <button class="ir-projects-head" data-fold="projects" aria-expanded="${settings.showProjects !== false}">
          <span class="ir-projects-title">Projects</span>
          <span class="ir-fold-caret">${settings.showProjects !== false ? '▾' : '▸'}</span>
        </button>
      </div>
    </div>`;
  wireOverview();

  // ---- wiring: the ring ----
  // The lazy spin first: driven from the host, so a rebuild (every note
  // edit re-renders the view) continues the phase instead of snapping back.
  // It rests only under the pointer.
  const rotor = el.querySelector('.ir-rotor');
  if (rotor) startSpin(el, rotor);
  const ringSvg = el.querySelector('.ir-ring');
  if (ringSvg) {
    ringSvg.addEventListener('mouseenter', () => { if (el._spin) el._spin.paused = true; });
    ringSvg.addEventListener('mouseleave', () => {
      if (el._spin) { el._spin.paused = false; el._spin.t0 = performance.now(); }
    });
  }
  const centerNum = el.querySelector('.ir-center-num');
  const centerLabel = el.querySelector('.ir-center-label');
  const liftOn = settings.ringHoverLift !== false;

  // A hovered project's title in the center must stay inside the ring —
  // a long one is trimmed to the hole's width, never overlapping plates.
  const CENTER_MAX = (R - STROKE / 2 - 12) * 2;
  const fitCenterLabel = () => {
    if (!centerLabel || typeof centerLabel.getComputedTextLength !== 'function') return;
    const len = centerLabel.getComputedTextLength();
    if (len <= CENTER_MAX) return;
    const s = centerLabel.textContent;
    const scale = s.length > 2 ? (s.length - 1) / len : 0;
    centerLabel.textContent = s.slice(0, Math.max(1, Math.floor(CENTER_MAX * scale))) + '…';
  };

  el.querySelectorAll('.ir-plate-g').forEach(g => {
    const vis = g.querySelector('.ir-plate');
    const p = model.projects[Number(g.dataset.project)];
    // A click opens the project pane; a double-click jumps straight into
    // the note — and lands at the task's line when a plate carries one.
    g.addEventListener('click', () => cb.openProject(p.name));
    g.addEventListener('dblclick', () => cb.openFile(p.file, vis.dataset.line !== undefined ? Number(vis.dataset.line) : undefined));
    if (centerLabel) {
      g.addEventListener('mouseenter', () => {
        const n = Number(g.dataset.open) || 0;
        if (centerNum) {
          centerNum.textContent = n;
          centerNum.setAttribute('class', `ir-center-num b-${bandFor(n)}`);
        }
        centerLabel.textContent = `${g.dataset.name}${Number(g.dataset.loose) ? ` · ${g.dataset.loose} loose` : ''}`;
        fitCenterLabel();
        if (liftOn) {
          vis.style.transform = `translate(${g.dataset.mx * RING.LIFT_PX}px, ${g.dataset.my * RING.LIFT_PX}px)`;
          vis.style.strokeWidth = Number(vis.getAttribute('stroke-width')) + 3;
        }
      });
      g.addEventListener('mouseleave', () => {
        if (centerNum) {
          centerNum.textContent = totalOpen;
          centerNum.setAttribute('class', `ir-center-num b-${bandFor(totalOpen)}`);
        }
        centerLabel.textContent = '';
        if (liftOn) {
          vis.style.transform = '';
          vis.style.strokeWidth = '';
        }
      });
    }
  });
  el.querySelectorAll('.ir-tick').forEach(t => {
    const p = model.projects[Number(t.dataset.project)];
    t.addEventListener('click', () => cb.openFile(p.file, Number(t.dataset.line)));
  });
  el.querySelectorAll('.ir-legend-item').forEach(btn => {
    const p = model.projects[Number(btn.dataset.project)];
    btn.addEventListener('click', () => cb.openProject(p.name));
    btn.addEventListener('dblclick', () => cb.openFile(p.file));
  });
  // Group folds: session-only, toggled in place.
  el.querySelectorAll('.ir-legend-group-head').forEach(head => {
    head.addEventListener('click', () => {
      const folder = head.dataset.group;
      const block = head.parentElement.querySelector('.ir-legend-group-block');
      const open = block.hidden;
      block.hidden = !open;
      head.querySelector('.ir-fold-caret').textContent = open ? '▾' : '▸';
      head.setAttribute('aria-expanded', String(open));
      head.parentElement.classList.toggle('is-folded', !open);
      if (open) foldedGroups.delete(folder); else foldedGroups.add(folder);
    });
  });

  // The hideable projects list: fold state persists through settings.
  const foldBtn = el.querySelector('.ir-projects-head');
  const legendEl = el.querySelector('.ir-legend');
  foldBtn.addEventListener('click', () => {
    const open = legendEl.hidden;
    legendEl.hidden = !open;
    foldBtn.querySelector('.ir-fold-caret').textContent = open ? '▾' : '▸';
    foldBtn.setAttribute('aria-expanded', String(open));
    cb.setSetting('showProjects', open);
  });
}

module.exports = { renderRing, bandFor };