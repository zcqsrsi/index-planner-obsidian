/* Scanner: vault markdown → the ring's flat model.
   A project is a note anywhere inside the projects folder — flat
   `Projects/x.md` or nested `Projects/<category>/x.md` — that carries a
   `status` frontmatter field (active | shelved; paused/done/scrapped/
   archived stay off the ring). At the top level the field is optional
   (a flat note is active by default); below it, the field is what tells
   a project note from a page. Its checkboxes are its tasks. Frontmatter
   `include: #tag` (or a list) gathers tagged tasks from anywhere else in
   the vault — the project note always wins, so a task never double-counts.

   Pages join a project dynamically, as they are kept together in Index:
   a `project: <name>` frontmatter field wins; else notes under
   `<pages folder>/<project name>/` (the importer's layout); else loose
   notes sitting beside exactly one project in the same folder — the
   pages-and-project-kept-together arrangement inside the projects tree.
   The `project:` field may carry the name bare or as a wikilink —
   `project: "[[name]]"`, what ＋ Page and the importer write — so the
   graph sees a real edge to the project note while the scanner reads
   the same owner either way. */

// Tasks emoji metadata — the same conventions the Tasks community plugin uses.
// 📅 due · ➕ created · ✅ done. Checkbox states: ' ' and '/' open, 'x' done,
// '-' scrapped.
const TASK_RE = /^ {0,10}[-*+] \[([ xX\/\-])\] (.*)$/;
const DUE_RE = /📅\s(\d{4}-\d{2}-\d{2})/;
const CREATED_RE = /➕\s(\d{4}-\d{2}-\d{2})/;
const DONE_RE = /✅\s(\d{4}-\d{2}-\d{2})/;
const TAG_RE = /#([\w\/\-]+)/g;

function parseTasks(content) {
  const out = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(TASK_RE);
    if (!m) continue;
    out.push(taskFromLine(m, i));
  }
  return out;
}

// One checkbox → one task record. Shared by the flat scan (the ring) and
// the quest log (the pane) so both shapes come off the same line.
function taskFromLine(m, i) {
  const text = m[2];
  const tags = [...text.matchAll(TAG_RE)].map(x => x[1]);
  return {
    line: i,
    text: text.replace(DUE_RE, '').replace(CREATED_RE, '').replace(DONE_RE, '').replace(TAG_RE, '').trim(),
    mark: m[1],
    status: m[1] === 'x' || m[1] === 'X' ? 'done' : m[1] === '-' ? 'scrapped' : 'open',
    due: (text.match(DUE_RE) || [])[1] || null,
    created: (text.match(CREATED_RE) || [])[1] || null,
    done: (text.match(DONE_RE) || [])[1] || null,
    tags,
    file: null, // filled by the caller
  };
}

// The quest log: the project note's heading hierarchy read as Index's
// structure — ## aims, ### sub-objectives, #### day rows, each checkbox
// nesting under the innermost container above it. A note that doesn't
// follow the convention still gets its tasks — they land in the unfiled
// bucket, like Index's floating tasks. A ### without a ## above it folds
// into an implicit General aim, as Index does.
function parseQuestLog(content) {
  const lines = content.split('\n');
  const log = { aims: [], unfiled: [], allTasks: [] };
  let aim = null, sub = null, day = null;

  // Frontmatter first, then the body.
  let i = 0;
  if (lines[0] && lines[0].trim() === '---') {
    for (i = 1; i < lines.length && lines[i].trim() !== '---'; i++);
    i++;
  }
  for (; i < lines.length; i++) {
    const h = /^(#{1,6})\s+(.*)$/.exec(lines[i]);
    if (h) {
      const level = h[1].length;
      const name = h[2].trim();
      // Containers remember their heading's line — the pane's quick-add
      // writes new rows relative to them.
      if (level === 1) { aim = null; sub = null; day = null; } // the note title
      else if (level === 2) {
        aim = { name, subs: [], tasks: [], line: i };
        log.aims.push(aim);
        sub = null; day = null;
      } else if (level === 3) {
        if (!aim) { aim = { name: null, subs: [], tasks: [], line: i }; log.aims.push(aim); }
        sub = { name, days: [], tasks: [], line: i };
        aim.subs.push(sub);
        day = null;
      } else {
        if (!aim) { aim = { name: null, subs: [], tasks: [], line: i }; log.aims.push(aim); }
        if (!sub) { sub = { name: null, days: [], tasks: [], line: i }; aim.subs.push(sub); }
        day = { name, tasks: [], line: i };
        sub.days.push(day);
      }
      continue;
    }
    const m = lines[i].match(TASK_RE);
    if (!m) continue;
    const t = taskFromLine(m, i);
    if (day) { t.day = day.name; day.tasks.push(t); }
    else if (sub) sub.tasks.push(t);
    else if (aim) aim.tasks.push(t);
    else log.unfiled.push(t);
    log.allTasks.push(t);
  }
  return log;
}

// ---- the pane's drag-and-drop surgery ----
// Pure line operations, so the harness can drive them without Obsidian:
// a task dragged to a new home, a sub-objective block picked up whole.
// The view wraps them in its fresh-read editNote, exactly as addTask does.

// Where the block a container owns ends: the next heading at its level or
// shallower (deeper headings — #### day rows — belong to it).
function blockEnd(lines, start, level) {
  for (let i = start + 1; i < lines.length; i++) {
    const h = /^(#{1,6})\s/.exec(lines[i]);
    if (h && h[1].length <= level) return i;
  }
  return lines.length;
}

// Insert new lines into the note keeping its blank-line rhythm: a blank
// before when the previous line carries text, a blank after when the next
// one does (a heading, say) — the note stays as readable as if hand-written.
function spliceTidy(lines, at, ...newLines) {
  const out = [...newLines];
  if (at < lines.length && lines[at].trim() !== '') out.push('');
  if (at > 0 && lines[at - 1].trim() !== '') out.unshift('');
  lines.splice(at, 0, ...out);
}

// A task's line, found by its hint and its words: the pane's parsed line is
// only a hint — the note may have moved underneath — so the line must also
// be a checkbox carrying the task's text. Identical twins stay ambiguous;
// the hint line settles those, the first match everything else.
function findTaskLine(lines, t) {
  if (!t || !t.text) return null;
  const isIt = (i) => i >= 0 && i < lines.length
    && TASK_RE.test(lines[i]) && lines[i].includes(t.text);
  if (isIt(t.line)) return t.line;
  for (let i = 0; i < lines.length; i++) if (isIt(i)) return i;
  return null;
}

// A task cut from where it sits and pasted where it lands, in one write.
// `drop` names the destination:
//   { mode: 'before', target }       — above the target task's own line
//   { mode: 'today', aimIdx, subIdx } — the sub-objective's today row (made
//                                       if the note has none yet, as addTask)
//   { mode: 'aim', aimIdx }           — directly under the aim, at its end
//   { mode: 'unfiled' }               — the note's end, floating
// The log is re-parsed after the cut, so every anchor below is post-cut
// true — no index arithmetic to get wrong. A destination that can't be
// found returns null and the note is left exactly as it was.
function movedTaskLines(lines, t, drop) {
  const src = findTaskLine(lines, t);
  if (src == null) return null;
  const raw = lines[src];
  lines.splice(src, 1);
  if (src > 0 && src < lines.length
      && lines[src - 1].trim() === '' && lines[src].trim() === '') lines.splice(src, 1);
  if (!drop || drop.mode === 'unfiled') {
    if (lines.length && lines[lines.length - 1].trim() !== '') lines.push('');
    lines.push(raw);
    return lines;
  }
  const log = parseQuestLog(lines.join('\n'));
  const aim = log.aims[drop.aimIdx];
  const sub = aim && drop.subIdx != null ? aim.subs[drop.subIdx] : null;
  if (drop.mode === 'today' && sub) {
    const today = todayStr();
    const day = sub.days.find((d) => parseDate(d.name) === today);
    if (day) {
      const at = (day.tasks.length ? day.tasks[day.tasks.length - 1].line : day.line) + 1;
      if (at < lines.length && lines[at].trim() === '') lines.splice(at, 0, raw);
      else spliceTidy(lines, at, raw);
      return lines;
    }
    spliceTidy(lines, blockEnd(lines, sub.line, 3), `#### ${today}`, '', raw);
    return lines;
  }
  if (drop.mode === 'aim' && aim) {
    spliceTidy(lines, blockEnd(lines, aim.line, 2), raw);
    return lines;
  }
  if (drop.mode === 'before' && drop.target && drop.target !== t) {
    const dst = findTaskLine(lines, drop.target);
    if (dst == null) return null;
    lines.splice(dst, 0, raw);
    return lines;
  }
  return null;
}

// A sub-objective picked up whole — heading, day rows and tasks, everything
// to the next heading at its level or shallower — and put down before
// another sub-objective ({ mode: 'before', aimIdx, subIdx }) or at an aim's
// end ({ mode: 'aim', aimIdx }). The block is trimmed of its surrounding
// blanks and spliceTidy restores the rhythm at the destination, so a move
// never smears double blanks into the note.
function movedSubLines(lines, drag, drop) {
  if (!drag || !drop) return null;
  const log = parseQuestLog(lines.join('\n'));
  const from = log.aims[drag.aimIdx] && log.aims[drag.aimIdx].subs[drag.subIdx];
  if (!from || from.line == null) return null;
  if (drop.mode === 'before' && drop.aimIdx === drag.aimIdx && drop.subIdx === drag.subIdx) return null;
  const end = blockEnd(lines, from.line, 3);
  const block = lines.splice(from.line, end - from.line);
  const hole = from.line;
  if (hole > 0 && hole < lines.length
      && lines[hole - 1].trim() === '' && lines[hole].trim() === '') lines.splice(hole, 1);
  while (block.length && block[0].trim() === '') block.shift();
  while (block.length && block[block.length - 1].trim() === '') block.pop();
  const after = parseQuestLog(lines.join('\n'));
  let at = null;
  if (drop.mode === 'before') {
    const tgt = after.aims[drop.aimIdx] && after.aims[drop.aimIdx].subs[drop.subIdx];
    if (!tgt) return null;
    at = tgt.line;
  } else if (drop.mode === 'aim') {
    const aim = after.aims[drop.aimIdx];
    if (!aim) return null;
    at = blockEnd(lines, aim.line, 2);
  } else return null;
  if (!block.length) return null;
  spliceTidy(lines, at, ...block);
  return lines;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function ageDays(dateStr) {
  if (!dateStr) return Infinity; // no created date → can't be proven young
  return Math.max(0, Math.floor((Date.now() - new Date(dateStr + 'T00:00:00').getTime()) / 86400000));
}

// No ➕ on a task → fall back to its file's creation time, so a fresh
// checkbox is never instantly stale.
function createdOf(task) {
  return task.created
    || (task.file && task.file.stat ? new Date(task.file.stat.ctime).toISOString().slice(0, 10) : null);
}

// The journal's date reader, ported from index-planner (onenote/journal.js):
// ISO, numeric day/month/year (the UK reading), and month-name forms, with
// ordinals and a leading weekday stripped. Only real month names survive.
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function fromParts(day, mon, yr) {
  const mi = MONTHS.indexOf(String(mon).toLowerCase().slice(0, 3));
  if (mi < 0 || day < 1 || day > 31) return null;
  let year = yr === undefined ? new Date().getFullYear() : Number(yr);
  if (year < 100) year += 2000;
  const d = new Date(year, mi, day);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseDate(raw) {
  let s = String(raw || '').trim();
  if (!s) return null;
  s = s.replace(/(\d)(st|nd|rd|th)\b/gi, '$1');
  s = s.replace(/^\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues?|weds?|thur?s?|fri|sat|sun)\b[,.]?\s*/i, '');
  s = s.trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(s);
  if (m) return fromParts(Number(m[3]), MONTHS[Number(m[2]) - 1], m[1]);
  m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/.exec(s);
  if (m) return fromParts(Number(m[1]), MONTHS[Number(m[2]) - 1], m[3]);
  m = /^(\d{1,2})\s+([a-z]{3})[a-z]*\.?(?:\s+(\d{2,4}))?/i.exec(s);
  if (m) return fromParts(Number(m[1]), m[2], m[3]);
  m = /^([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:\s+(\d{2,4}))?/i.exec(s);
  if (m) return fromParts(Number(m[2]), m[1], m[3]);
  return null;
}

// include: "#tag" | "#a, #b" | ["#a", "#b"] → Set of bare tags.
function includeTags(fm) {
  const raw = fm && fm.include;
  if (!raw) return new Set();
  const list = Array.isArray(raw) ? raw : String(raw).split(/[,\s]+/);
  return new Set(list.filter(Boolean).map(t => String(t).replace(/^#/, '')));
}

// A `project:` field's bare name: `wet lab`, `[[wet lab]]` (the wikilink
// ＋ Page and the importer write, so the graph draws the join) and its
// aliased form all name the same project. An unbracketed YAML `[[x]]`
// arrives as nested arrays — flattened here, so hand-written notes
// without the quotes still read.
function projectRef(v) {
  let s = Array.isArray(v) ? String((v.flat ? v.flat(2) : v)[0] ?? '') : String(v ?? '');
  s = s.trim();
  const m = /^\[\[(.*)\]\]$/.exec(s);
  if (m) s = m[1];
  return s.split('|')[0].trim();
}

// Question sentences in a note's body — the natural questions one writes
// while thinking, like "why did the replicate fail?" in a line of prose.
// Frontmatter, code fences, headings, tasks, quotes, tables and image/link
// lines are not prose; inside prose, each sentence ending in ? is one. The
// question object keeps the sentence verbatim — it is the question.
function questionSentences(content) {
  const lines = String(content).split('\n');
  const out = [];
  let inFence = false;
  let inFm = /^\s*-{3,}\s*$/.test(lines[0] || '');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (inFm) {
      if (i > 0 && /^\s*-{3,}\s*$/.test(l)) inFm = false;
      continue;
    }
    if (/^\s*```/.test(l)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const t = l.trim();
    if (!t || /^(#{1,6}\s|\||>|!\[|\[\[|- \[|\d+\.)/.test(t)) continue;
    for (const s of t.split(/(?<=[.?!])\s+/)) {
      const q = s.trim();
      if (q.endsWith('?') && q.length >= 8 && q.length <= 200) out.push(q);
    }
  }
  return out;
}

// Open checkboxes in a page that link a project — `- [ ] run the PCR
// [[methods paper]]` — are tasks of that project, written from the page.
// The link names the owner; the text minus the link is the task. Open
// checkboxes only: ticking the box in the page keeps the work local.
function pageTaskLinks(content) {
  const lines = String(content).split('\n');
  const out = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) { inFence = !inFence; continue; }
    if (inFence) continue;
    const box = /^(\s*)- \[ \]\s+(.*)$/.exec(lines[i]);
    if (box) {
      const link = /\[\[([^\]|#]+)(?:[^\]]*)?\]\]/.exec(box[2]); // first link, alias form included
      if (!link) continue;
      const text = box[2].replace(link[0], '').replace(/\s{2,}/g, ' ').trim();
      if (text) out.push({ line: i, text, link: link[1].trim() });
      continue;
    }
    // A bare "to do: …" line — prose, no checkbox to keep. A project named
    // on the line targets it; without one, link stays null and the note's
    // own project: frontmatter settles the target (gatherTaskLinks).
    const td = /^\s*(?:[-*]\s+)?to\s?do\s*:\s*(.+)$/i.exec(lines[i]);
    if (td) {
      const link = /\[\[([^\]|#]+)(?:[^\]]*)?\]\]/.exec(td[1]);
      const text = td[1].replace(link ? link[0] : '', '').replace(/\s{2,}/g, ' ').trim();
      if (text) out.push({ line: i, text, link: link ? link[1].trim() : null });
    }
  }
  return out;
}

async function buildModel(app, settings) {
  const today = todayStr();
  const projects = [];
  const projectFiles = new Set();
  const loosePages = []; // status-less notes below the top level
  const projectsInFolder = new Map(); // folder path → project objects

  const root = app.vault.getAbstractFileByPath(settings.projectsFolder);
  const groups = new Map(); // folder path → group meta, from folder notes
  if (root && root.children !== undefined) {
    const walk = async (folder, folderPath, depth) => {
      for (const child of folder.children) {
        if (child.children !== undefined) {
          await walk(child, folderPath ? `${folderPath}/${child.name}` : child.name, depth + 1);
        } else if (child.extension === 'md') {
          const cache = app.metadataCache.getFileCache(child);
          const fm = (cache && cache.frontmatter) || {};
          // A folder note — same name as its folder, no status — is the
          // group's own voice: colour and a big picture shared by the
          // member projects, as Index's groups. Never a project or a page.
          if (depth > 0 && fm.status === undefined && child.basename === folderPath.split('/').pop()) {
            groups.set(folderPath, {
              name: child.basename,
              file: child, // the folder note is the group's hub in the graph
              color: fm.color ?? fm.colour ?? null,
              question: fm.question != null ? String(fm.question) : null,
            });
            continue;
          }
          // Top level keeps the flat-vault reading: any note is a project,
          // status optional. Deeper, the status field is the discriminator —
          // a note without one is a page living beside its project.
          const isProject = fm.status !== undefined || depth === 0;
          if (!isProject) { loosePages.push({ file: child, folderPath, fm }); continue; }
          const status = String(fm.status || 'active');
          if (status === 'archived' || status === 'paused' || status === 'done' || status === 'scrapped') continue;
          const log = parseQuestLog(await app.vault.cachedRead(child));
          const tasks = log.allTasks;
          tasks.forEach(t => { t.file = child; });
          const project = {
            name: child.basename,
            file: child,
            color: fm.color ?? fm.colour ?? null, // both spellings appear in the wild
            shelved: status === 'shelved',
            question: fm.question != null ? String(fm.question) : null,
            tasks,
            log,
            includes: includeTags(fm),
            folderPath,
            pageFiles: new Map(), // path → page record, filled below
          };
          projects.push(project);
          projectFiles.add(child.path);
          if (!projectsInFolder.has(folderPath)) projectsInFolder.set(folderPath, []);
          projectsInFolder.get(folderPath).push(project);
        }
      }
    };
    await walk(root, '', 0);
  }
  projects.sort((a, b) => a.name.localeCompare(b.name) || a.file.path.localeCompare(b.file.path));

  // Tag-gathered tasks: every markdown file that is not itself a project
  // note contributes tasks tagged with a project's include tag. First
  // project in the list wins on a multi-tag task.
  const claimed = new Set(); // "path:line" → project index
  if (projects.some(p => p.includes.size)) {
    for (const file of app.vault.getMarkdownFiles()) {
      if (projectFiles.has(file.path)) continue;
      const fm = (app.metadataCache.getFileCache(file) || {}).frontmatter || {};
      const fileTags = new Set((Array.isArray(fm.tags) ? fm.tags : fm.tags ? [fm.tags] : []).map(String));
      const tasks = parseTasks(await app.vault.cachedRead(file));
      for (const t of tasks) {
        const lineTags = new Set(t.tags);
        for (let i = 0; i < projects.length; i++) {
          const inc = projects[i].includes;
          if (!inc.size) continue;
          const hit = [...inc].some(tag => lineTags.has(tag) || fileTags.has(tag));
          if (!hit) continue;
          const key = `${file.path}:${t.line}`;
          if (claimed.has(key)) break;
          claimed.add(key);
          projects[i].tasks.push({ ...t, file });
          projects[i].log.unfiled.push({ ...t, file }); // adrift, like Index's floating tasks
          break; // one project per task — the note's own project otherwise
        }
      }
    }
  }

  // ---- pages joined to projects, dynamically ----
  // A page carries its sub-objective when it can: a `section:` frontmatter
  // field (new imports), or the `*Project / Section*` line the old importer
  // wrote at the top of the body. That is what groups the pane's notes
  // side, as Index's per-section pages.
  const sectionOf = async (file, fm) => {
    if (fm && fm.section != null) return String(fm.section);
    try {
      const content = await app.vault.cachedRead(file);
      const m = /^\*[^*\n]+?\s*\/\s*([^*\n]+?)\*\s*$/m.exec(content.slice(0, 400));
      return m ? m[1].trim() : null;
    } catch (e) { return null; }
  };
  const addPage = async (project, file, fm) => {
    if (!project.pageFiles.has(file.path)) {
      const section = await sectionOf(file, fm);
      // Question-note filenames drop the "?" (forbidden in note names —
      // safeName dashes it), but the question mark is the point: display
      // names for Open questions carry it.
      const name = section === 'Open questions' && !/\?$/.test(file.basename)
        ? `${file.basename}?`
        : file.basename;
      project.pageFiles.set(file.path, {
        name,
        file,
        mtime: file.stat ? file.stat.mtime : 0,
        section,
      });
    }
  };
  const byName = new Map(); // name → projects with it (duplicates all join)
  projects.forEach(p => {
    if (!byName.has(p.name)) byName.set(p.name, []);
    byName.get(p.name).push(p);
  });

  // 1. Loose notes beside exactly one project in their folder — pages and
  //    project kept together inside the projects tree. A folder holding
  //    several projects gets no auto-join (which project owns a stray note
  //    there is not ours to guess); `project:` on the note settles it.
  // 2. The pages folder: Pages/<project name>/, the importer's layout.
  // 3. A `project: <name>` frontmatter field anywhere under the pages
  //    folder — the explicit override, winning over both.
  const pageOwners = []; // { project, file, fm }
  for (const lp of loosePages) {
    const owners = projectsInFolder.get(lp.folderPath) || [];
    if (owners.length === 1) pageOwners.push({ project: owners[0], file: lp.file, fm: lp.fm });
    else if (lp.fm.project) {
      for (const p of byName.get(projectRef(lp.fm.project)) || []) pageOwners.push({ project: p, file: lp.file, fm: lp.fm });
    }
  }
  const pagesFolder = app.vault.getAbstractFileByPath(settings.pagesFolder);
  // Recursive: question notes sit at Pages/Open questions/<project>/<q>.md,
  // a level deeper than the importer's Pages/<project>/<page>.md. A file
  // joins by `project:` when it says so; otherwise its immediate parent
  // folder's name must be the project's.
  const joinPages = (entry, parentName) => {
    if (!entry) return;
    if (entry.children === undefined) {
      if (entry.extension !== 'md') return;
      const fm = (app.metadataCache.getFileCache(entry) || {}).frontmatter || {};
      if (fm.project) {
        for (const p of byName.get(projectRef(fm.project)) || []) pageOwners.push({ project: p, file: entry, fm });
      } else if (parentName) {
        for (const p of byName.get(parentName) || []) pageOwners.push({ project: p, file: entry, fm });
      }
      return;
    }
    for (const child of entry.children) joinPages(child, entry.name);
  };
  joinPages(pagesFolder, null);
  for (const { project, file, fm } of pageOwners) await addPage(project, file, fm);

  // Fate per project: the worst condition among its open threads wins.
  const model = { projects: [], folderLabel: settings.projectsFolder, pagesFolder: settings.pagesFolder };
  for (const p of projects) {
    const open = p.tasks.filter(t => t.status === 'open');
    open.forEach(t => { t.loose = !!t.due && t.due < today; });
    const loose = open.filter(t => t.loose);
    const stale = open.filter(t => !t.due && ageDays(createdOf(t)) >= (settings.staleDays ?? 3));
    const done = p.tasks.filter(t => t.status === 'done').length;
    model.projects.push({
      name: p.name,
      file: p.file,
      color: p.color,
      shelved: p.shelved,
      question: p.question,
      open,
      loose,
      fate: loose.length ? 'overdue' : stale.length ? 'stale' : 'healthy',
      done,
      total: done + open.length,
      stale,
      folder: p.folderPath || '',
      group: groups.get(p.folderPath) || null,
      log: p.log,
      pages: [...p.pageFiles.values()].sort((a, b) => b.mtime - a.mtime),
    });
  }
  return model;
}

module.exports = { buildModel, parseTasks, parseQuestLog, ageDays, todayStr, createdOf, parseDate, projectRef, questionSentences, pageTaskLinks, TASK_RE, blockEnd, spliceTidy, findTaskLine, movedTaskLines, movedSubLines };