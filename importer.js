/* Index → Obsidian, one shot. Pure conversion — the vault I/O lives in
   main.js so this module runs under plain node for testing.
   Projects → Projects/<name>.md (frontmatter + emoji-dated checkboxes).
   Pages → Pages/<notebook>/<page>.md (blocksToMarkdown, ported from
   index-planner renderer/export/exporters.js).
   Lossy, deliberately: page version history and the activity log stay in
   the backup; the living note carries only its content. */

const ENTITIES = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

function plain(html) {
  return String(html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g, m => ENTITIES[m])
    .replace(/\s+/g, ' ')
    .trim();
}

// Frontmatter value on one line; quote strings that could break YAML.
const fmVal = (s) => String(s).replace(/\n+/g, ' ').replace(/"/g, '\\"');

function dstr(epoch) {
  if (!epoch) return null;
  return new Date(epoch).toISOString().slice(0, 10);
}

// ---- project notes ----

function taskMarkdown(t) {
  const mark = t.status === 'done' ? 'x'
    : t.status === 'scrapped' ? '-'
    : t.status === 'in-progress' ? '/'
    : ' ';
  const meta = [];
  if (t.dueDate) meta.push(`📅 ${t.dueDate}`);
  if (t.createdAt) meta.push(`➕ ${dstr(t.createdAt)}`);
  if (t.status === 'done' && t.resolvedAt) meta.push(`✅ ${dstr(t.resolvedAt)}`);
  const tags = (t.tags || []).map(x => (x.startsWith('#') ? x : '#' + x)).join(' ');
  return `- [${mark}] ${t.title}${meta.length ? ' ' + meta.join(' ') : ''}${tags ? ' ' + tags : ''}`;
}

// One sub-objective: day-stamped task rows + the day diary, newest first —
// the same shape as Index's own sectionToMarkdown, with emoji dates added.
function sectionMarkdown(sec) {
  const parts = [`### ${sec.name}`];
  const tasks = sec.tasks || [];
  const dayKeys = [...new Set([...Object.keys(sec.days || {}), ...tasks.map(t => t.day)].filter(Boolean))]
    .sort().reverse();
  if (!dayKeys.length) {
    tasks.forEach(t => parts.push(taskMarkdown(t)));
    return parts.join('\n\n');
  }
  for (const day of dayKeys) {
    parts.push(`#### ${day}`);
    for (const t of tasks.filter(t => t.day === day)) parts.push(taskMarkdown(t));
    const note = sec.days?.[day]?.note;
    if (note) parts.push(plain(note).split('\n').map(l => `> ${l}`).join('\n'));
  }
  return parts.join('\n\n');
}

function projectMarkdown(nb) {
  const fm = [
    `status: ${nb.shelved ? 'shelved' : nb.status || 'active'}`,
    nb.color ? `color: "${fmVal(nb.color)}"` : null,
    nb.dueDate ? `due: ${nb.dueDate}` : null,
    nb.bigPicture?.text ? `question: "${fmVal(nb.bigPicture.text)}"` : null,
    nb.bigPictureResolution?.text ? `resolution: "${fmVal(nb.bigPictureResolution.text)}"` : null,
  ].filter(Boolean);

  const parts = [
    // Frontmatter first and no `# Name` title after it: the filename and
    // the pane header both already name the project — a note-title heading
    // just repeats itself under Obsidian's own tab title.
    `---\n${fm.join('\n')}\n---`,
  ];
  if (nb.description) parts.push(plain(nb.description));

  // Objectives tier their sections; sections outside any objective go loose.
  const tiered = new Set();
  for (const o of nb.objectives || []) {
    const own = (nb.sections || []).filter(s => s.objectiveId === o.id);
    if (!own.length) continue;
    parts.push(`## ${o.name}`);
    for (const sec of own) { tiered.add(sec.id); parts.push(sectionMarkdown(sec)); }
  }
  const loose = (nb.sections || []).filter(s => !tiered.has(s.id));
  if (loose.length) {
    parts.push(`## Threads`);
    for (const sec of loose) parts.push(sectionMarkdown(sec));
  }
  if ((nb.floatingTasks || []).length) {
    parts.push(`## Afloat`);
    for (const t of nb.floatingTasks) parts.push(taskMarkdown(t));
  }
  return parts.join('\n\n') + '\n';
}

// convertNotebooks(data) → [{ name, content, notebook }]
// Archived projects are skipped — they stayed behind in Index.
function convertNotebooks(data) {
  return (data.notebooks || [])
    .filter(nb => nb.status !== 'archived')
    .map(nb => ({ name: nb.name, content: projectMarkdown(nb), notebook: nb }));
}

// ---- pages ----

function tableToMarkdown(b) {
  const head = (b.cols || []).map(c => (c.name || '').replace(/\|/g, '\\|'));
  const line = (cells) => `| ${cells.join(' | ')} |`;
  const body = (b.rows || []).map(row =>
    line((b.cols || []).map(c => String(row[c.id] ?? '').replace(/\|/g, '\\|').replace(/\n/g, '<br>'))));
  return [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...body].join('\n');
}

function blocksToMarkdown(blocks, attachmentsPath) {
  const out = [];
  for (const b of blocks || []) {
    switch (b.type) {
      case 'heading': out.push(`${'#'.repeat(Math.min(b.level || 1, 4))} ${plain(b.html)}`); break;
      case 'todo': out.push(`- [${b.checked ? 'x' : ' '}] ${plain(b.html)}`); break;
      case 'list-item': {
        const indent = '  '.repeat(Math.min(b.indent || 0, 4));
        out.push(`${indent}${b.ordered ? '1.' : '-'} ${plain(b.html)}`);
        break;
      }
      case 'quote': out.push(plain(b.html).split('\n').map(l => `> ${l}`).join('\n')); break;
      case 'code': out.push('```\n' + (b.text || '') + '\n```'); break;
      case 'divider': out.push('---'); break;
      case 'table': out.push(tableToMarkdown(b), ''); break;
      case 'image': {
        let url = b.url || '';
        if (url.startsWith('note://')) url = `${attachmentsPath}/${url.split('/').pop()}`;
        out.push(`![${plain(b.name) || 'image'}](${url})`, '');
        break;
      }
      default: if (b.html !== undefined) out.push(plain(b.html));
    }
  }
  return out.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

// convertPage(page, nbName, secName, attachmentsPath) → full note content.
// Frontmatter carries the join and the sub-objective, so the pane can
// group the project's pages as Index's per-section notes. The join is a
// wikilink — quoted, so YAML keeps it a string — because Obsidian
// resolves frontmatter links into real graph edges.
function convertPage(page, nbName, secName, attachmentsPath) {
  const fm = [
    '---',
    `project: "[[${fmVal(nbName)}]]"`,
    `section: "${fmVal(secName)}"`,
    '---',
  ].join('\n');
  const parts = [fm, `# ${page.title || 'Untitled'}`];
  const body = blocksToMarkdown(page.blocks, attachmentsPath);
  if (body) parts.push(body);
  return parts.join('\n\n') + '\n';
}

// A filesystem- and vault-safe note name.
function safeName(s) {
  return String(s)
    .replace(/["']/g, '')                       // quotes drop, not dash
    .replace(/[\\/:*?<>|#]+/g, '-')             // the rest become dashes
    .replace(/\s+/g, ' ')
    .replace(/^-+|-+$/g, '')                    // no leading/trailing dashes
    .trim() || 'Untitled';
}

module.exports = { convertNotebooks, convertPage, blocksToMarkdown, taskMarkdown, safeName, plain, dstr };