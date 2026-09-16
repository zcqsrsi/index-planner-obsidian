/* One-shot repair for project notes imported before the frontmatter fix:
   the importer wrote `# Name` first and the `---` block after it, but
   Obsidian only parses YAML at the very top of a file — so status/color
   were invisible to the plugin (and every other plugin). This moves the
   block to the top, in place, idempotently, for every note under the
   projects folder. Run: node scripts/fix-frontmatter.js <vault> [more vaults…] */

const fs = require('fs');
const path = require('path');

const FENCE = /^\s*-{3,}\s*$/; // a real fence, however many dashes the hand added

function fixNote(file) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  if (FENCE.test(lines[0])) return false; // already fine

  // Find the frontmatter block: first fence pair that carries a status
  // line, anywhere in the first screen of the note.
  let j = -1;
  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    if (FENCE.test(lines[i])) { j = i; break; }
  }
  if (j === -1) return false;
  let k = j + 1;
  while (k < lines.length && !FENCE.test(lines[k])) k++;
  if (k >= lines.length) return false;
  const block = lines.slice(j + 1, k);
  if (!block.some(l => /^status\s*:/.test(l))) return false;

  // Move it to the top and normalize both fences to plain `---`.
  const out = ['---', ...block, '---', '', ...lines.slice(0, j), ...lines.slice(k + 1)].join('\n');
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
}

const vaults = process.argv.slice(2);
if (!vaults.length) {
  console.error('usage: node scripts/fix-frontmatter.js <vault> [more vaults…]');
  process.exit(1);
}
for (const vault of vaults) {
  const projectsDir = path.join(vault, 'Projects');
  if (!fs.existsSync(projectsDir)) { console.log(`${vault}: no Projects folder, skipped`); continue; }
  const notes = [];
  walk(projectsDir, notes);
  let fixed = 0;
  for (const n of notes) if (fixNote(n)) fixed++;
  console.log(`${vault}: ${fixed} of ${notes.length} notes repaired`);
}