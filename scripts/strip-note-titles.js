/* One-shot cleanup for project notes imported before the title fix: the
   importer used to write `# Name` under the frontmatter, but the filename,
   Obsidian's tab title and the pane header all already name the project —
   the heading just repeats itself. This removes the title heading when it
   matches the note's own name, in place, idempotently, for every note
   under the projects folder. Run: node scripts/strip-note-titles.js <vault> [more vaults…] */

const fs = require('fs');
const path = require('path');

const FENCE = /^\s*-{3,}\s*$/;

function stripTitle(file) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  const base = path.basename(file, '.md');

  // Skip frontmatter, then leading blanks.
  let i = 0;
  if (FENCE.test(lines[0])) {
    for (i = 1; i < lines.length && !FENCE.test(lines[i]); i++);
    i++;
  }
  while (i < lines.length && lines[i].trim() === '') i++;

  const m = /^#\s+(.+?)\s*$/.exec(lines[i] || '');
  if (!m || m[1] !== base) return false; // no title, or a title with other text — leave it

  // The heading, plus the blank run that followed it.
  let j = i + 1;
  while (j < lines.length && lines[j].trim() === '') j++;
  const out = [...lines.slice(0, i), ...lines.slice(j)].join('\n');
  if (out === content) return false;
  fs.writeFileSync(file, out);
  return true;
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.name.endsWith('.md')) out.push(p);
  }
  return out;
}

const vaults = process.argv.slice(2);
if (!vaults.length) {
  console.error('Usage: node scripts/strip-note-titles.js <vault> [more vaults…]');
  process.exit(1);
}
for (const vault of vaults) {
  const folder = path.join(vault, 'Projects');
  if (!fs.existsSync(folder)) { console.log(`${vault}: no Projects folder, skipped`); continue; }
  let n = 0;
  for (const file of walk(folder, [])) if (stripTitle(file)) n++;
  console.log(`${vault}: removed the repeated title from ${n} note${n === 1 ? '' : 's'}`);
}