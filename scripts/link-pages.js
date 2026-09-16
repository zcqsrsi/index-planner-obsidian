/* One-shot retrofit for the graph: makes the project–page join real edges.
   A page joined by folder structure or by a plain `project: name` field
   carries no link the graph can see — this writes the join the way
   ＋ Page and the importer now do, as a wikilink: `project: "[[name]]"`
   (quoted, so YAML keeps it a string). And a project in a category folder
   gains `group: "[[<folder note>]]"`, so every project in Projects/
   Literature/ ties to the same hub and the family reads as one thing.
   In place, idempotent — existing values are normalised, never overwritten.
   Run: node scripts/link-pages.js <vault> [more vaults…] */

const fs = require('fs');
const path = require('path');
const { projectRef } = require('../scanner.js');

const FENCE = /^\s*-{3,}\s*$/;
const KEY_RE = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/;
// Off-ring statuses — such notes are still projects, just not on the ring.
const OFF_RING = new Set(['archived', 'paused', 'done', 'scrapped']);

// The frontmatter block, if the note opens with a terminated one.
// map: key → { line, value } (first occurrence wins, as YAML does);
// close: the closing fence's line index.
function readFm(lines) {
  if (!FENCE.test(lines[0] || '')) return null;
  let close = 1;
  while (close < lines.length && !FENCE.test(lines[close])) close++;
  if (close >= lines.length) return null; // unterminated — leave the note alone
  const map = new Map();
  for (let i = 1; i < close; i++) {
    const m = KEY_RE.exec(lines[i]);
    if (m && !map.has(m[1])) map.set(m[1], { line: i, value: m[2] });
  }
  return { close, map };
}

// A YAML scalar's bare text — quotes off, ends trimmed.
function bare(v) {
  const s = String(v ?? '').trim();
  return (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ? s.slice(1, -1).trim() : s;
}

// Make `key` carry "[[name]]" — or leave the note be. An existing field is
// normalised to a link; with `fallbackName` a missing field is inserted.
// Already-linked fields (alias included) and exotic YAML (flow arrays,
// multiline) are left untouched. Returns the new content, or null when
// nothing changed.
function ensureLink(content, key, fallbackName) {
  const lines = content.split('\n');
  const fm = readFm(lines);
  const entry = fm && fm.map.get(key);
  if (entry) {
    const raw = bare(entry.value);
    if (/^\[\[.*\]\]$/.test(raw)) return null; // already a link
    if (raw.startsWith('[') || /^>|^\|/.test(raw)) return null; // flow/multiline — not ours to rewrite
    const name = projectRef(raw);
    if (!name) return null;
    lines[entry.line] = `${key}: "[[${name}]]"`;
    return lines.join('\n');
  }
  if (!fallbackName) return null;
  const value = `${key}: "[[${fallbackName}]]"`;
  if (!fm) {
    const head = ['---', value, '---'];
    if (lines.length && lines[0].trim() !== '') head.push('');
    return [...head, ...lines].join('\n');
  }
  lines.splice(fm.close, 0, value);
  return lines.join('\n');
}

function walk(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.name.endsWith('.md')) out.push(p);
  }
  return out;
}

const vaults = process.argv.slice(2);
if (!vaults.length) {
  console.error('Usage: node scripts/link-pages.js <vault> [more vaults…]');
  process.exit(1);
}
for (const vault of vaults) {
  const projectsDir = path.join(vault, 'Projects');
  const pagesDir = path.join(vault, 'Pages');
  if (!fs.existsSync(projectsDir)) { console.log(`${vault}: no Projects folder, skipped`); continue; }

  // Pass 1 — the shape of the projects tree: project notes (name → path,
  // on-ring or not), and each folder's note (the group's hub in the graph).
  const projects = new Map(); // name → { path, ring }
  const folders = new Map(); // folder abs path → { note: name | null, ringCount }
  const noteFm = (p) => { try { return readFm(fs.readFileSync(p, 'utf8').split('\n')); } catch (e) { return null; } };
  for (const p of walk(projectsDir, [])) {
    const isDeep = path.relative(projectsDir, p).split(path.sep).length > 1;
    const folderPath = path.dirname(p);
    const folderName = path.basename(folderPath);
    if (!folders.has(folderPath)) folders.set(folderPath, { note: null, ringCount: 0 });
    const folder = folders.get(folderPath);
    const fm = noteFm(p);
    const hasStatus = !!(fm && fm.map.has('status'));
    if (isDeep && !hasStatus && path.basename(p, '.md') === folderName) {
      folder.note = folderName; // the folder note — never a project or a page
      continue;
    }
    if (!isDeep || hasStatus) { // a project note — deep ones need the status field
      const status = fm ? bare(fm.map.get('status').value) : null;
      const ring = !OFF_RING.has(String(status || 'active'));
      projects.set(path.basename(p, '.md'), { path: p, ring });
      if (isDeep && ring) folder.ringCount++;
    }
  }

  // Pass 2 — the edits. `project:` becomes a link wherever it appears;
  // pages that only folder structure held get their owner named outright;
  // project notes under a folder with its note get the group hub.
  let nLinked = 0, nNormalized = 0, nGroups = 0;
  const done = new Set();
  const handle = (p, kind) => {
    if (done.has(p)) return;
    done.add(p);
    let content;
    try { content = fs.readFileSync(p, 'utf8'); } catch (e) { return; }
    let out = content;

    const normalized = ensureLink(out, 'project', null); // plain → link, anywhere
    if (normalized) { out = normalized; nNormalized++; }

    if (kind === 'projects') {
      const isDeep = path.relative(projectsDir, p).split(path.sep).length > 1;
      const fm = readFm(out.split('\n'));
      const hasStatus = !!(fm && fm.map.has('status'));
      const folder = folders.get(path.dirname(p));
      if (isDeep && !hasStatus) {
        // a page beside projects — the unambiguous single-owner join, made explicit
        if (folder && folder.ringCount === 1) {
          const owner = [...projects.entries()].find(([, pr]) => pr.ring && path.dirname(pr.path) === path.dirname(p));
          if (owner) {
            const next = ensureLink(out, 'project', owner[0]);
            if (next) { out = next; nLinked++; }
          }
        }
      } else if (folder && folder.note) {
        const next = ensureLink(out, 'group', folder.note);
        if (next) { out = next; nGroups++; }
      }
    } else if (kind === 'pages') {
      // Pages/<project name>/ — the folder's project, named on the page
      const owner = path.basename(path.dirname(p));
      if (projects.has(owner)) {
        const next = ensureLink(out, 'project', owner);
        if (next) { out = next; nLinked++; }
      }
    }

    if (out !== content) fs.writeFileSync(p, out);
  };
  for (const p of walk(projectsDir, [])) handle(p, 'projects');
  if (fs.existsSync(pagesDir)) for (const p of walk(pagesDir, [])) handle(p, 'pages');
  for (const p of walk(vault, [])) handle(p, null); // plain project: fields anywhere else

  console.log(`${vault}: ${nLinked} page${nLinked === 1 ? '' : 's'} joined by an explicit [[link]], `
    + `${nNormalized} project: field${nNormalized === 1 ? '' : 's'} normalised to links, `
    + `${nGroups} group link${nGroups === 1 ? '' : 's'} written`);
  for (const [folderPath, folder] of folders) {
    if (folder.ringCount > 1 && !folder.note) {
      console.log(`  ${path.relative(vault, folderPath)}: ${folder.ringCount} projects, no folder note — `
        + `add ${path.basename(folderPath)}.md to tie the family in the graph`);
    }
  }
}