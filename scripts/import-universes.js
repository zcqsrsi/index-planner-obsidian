/* Import each Index universe as its own Obsidian vault — one shot, from
   the plain files, no Obsidian required. Run from the repo root:

     node scripts/import-universes.js <index-data-dir> [out-root]

   Each vault gets: Projects/ (one note per project), Pages/<notebook>/
   (page notes), attachments/ (only the files that universe's pages
   reference), the Index Ring plugin, and both paired themes. */

const fs = require('fs');
const path = require('path');
const { convertNotebooks, convertPage, safeName } = require('../importer.js');

const SRC = path.resolve(process.argv[2] || '.');
const OUT = path.resolve(process.argv[3] || path.join(SRC, '..', 'vaults'));
const PLUGIN = path.resolve(__dirname, '..');

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const writeIfNew = (p, content) => {
  if (fs.existsSync(p)) return false;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  return true;
};

const data = readJson(path.join(SRC, 'notebooks.json'));
const universes = data.universes || [{ id: null, name: 'Index' }];

// Attachment names referenced by a set of page blocks.
function referencedAttachments(pages) {
  const names = new Set();
  for (const page of pages) {
    for (const b of page.blocks || []) {
      if (b.type === 'image' && b.url && b.url.startsWith('note://')) {
        names.add(b.url.split('/').pop());
      }
    }
  }
  return names;
}

let report = [];
for (const u of universes) {
  const vaultName = safeName(u.name);
  const vault = path.join(OUT, vaultName);
  const notebooks = (data.notebooks || []).filter(nb => nb.universeId === u.id && nb.status !== 'archived');

  // Project notes. Name collisions within a vault get a numeric suffix;
  // the same map names the Pages/<notebook>/ folder so they correspond.
  const used = new Set();
  const unique = (s) => {
    let base = safeName(s), name = base, n = 2;
    while (used.has(name)) name = `${base} ${n++}`;
    used.add(name);
    return name;
  };
  const nbFolderOf = new Map(); // notebook → vault-safe unique name

  let nProjects = 0, nPages = 0;
  const pagesToImport = []; // { page, nbName, secName }
  for (const nb of notebooks) {
    const proj = convertNotebooks({ notebooks: [nb] })[0];
    nbFolderOf.set(nb.name, unique(nb.name));
    if (writeIfNew(path.join(vault, 'Projects', `${nbFolderOf.get(nb.name)}.md`), proj.content)) nProjects++;
    for (const sec of nb.sections || []) {
      for (const pgRef of sec.pages || []) {
        const pgId = pgRef && pgRef.id ? pgRef.id : pgRef;
        const src = path.join(SRC, 'pages', `${pgId}.json`);
        if (!fs.existsSync(src)) continue;
        pagesToImport.push({ page: readJson(src), nbName: nb.name, secName: sec.name });
      }
    }
  }

  // Page notes, one folder per notebook; duplicate titles get suffixed.
  const usedPageNames = new Set();
  const uniquePage = (s) => {
    let base = safeName(s), name = base, n = 2;
    while (usedPageNames.has(name)) name = `${base} ${n++}`;
    usedPageNames.add(name);
    return name;
  };
  for (const pg of pagesToImport) {
    const dest = path.join(vault, 'Pages', nbFolderOf.get(pg.nbName), `${uniquePage(pg.page.title || 'Untitled')}.md`);
    if (writeIfNew(dest, convertPage(pg.page, pg.nbName, pg.secName, '../../attachments'))) nPages++;
  }

  // Attachments: only what this universe's pages reference.
  let nAttach = 0;
  for (const name of referencedAttachments(pagesToImport.map(p => p.page))) {
    const src = path.join(SRC, 'attachments', name);
    if (fs.existsSync(src) && writeIfNew(path.join(vault, 'attachments', name), fs.readFileSync(src))) nAttach++;
  }

  // Plugin + themes + vault config. Obsidian needs the single-file bundle.
  const pluginDir = path.join(vault, '.obsidian', 'plugins', 'index');
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.copyFileSync(path.join(PLUGIN, 'dist', 'main.js'), path.join(pluginDir, 'main.js'));
  fs.copyFileSync(path.join(PLUGIN, 'styles.css'), path.join(pluginDir, 'styles.css'));
  fs.copyFileSync(path.join(PLUGIN, 'manifest.json'), path.join(pluginDir, 'manifest.json'));
  for (const t of ['Index Navy', 'Index']) {
    for (const f of ['manifest.json', 'theme.css']) {
      fs.mkdirSync(path.join(vault, '.obsidian', 'themes', t), { recursive: true });
      fs.copyFileSync(path.join(PLUGIN, 'themes', t, f), path.join(vault, '.obsidian', 'themes', t, f));
    }
  }
  writeIfNew(path.join(vault, '.obsidian', 'community-plugins.json'), '["index"]');
  writeIfNew(path.join(vault, '.obsidian', 'appearance.json'), JSON.stringify({ cssTheme: 'Index Navy' }, null, 2));

  report.push(`${vaultName}: ${nProjects} projects · ${nPages} pages · ${nAttach} attachments → ${vault}`);
}

console.log(report.join('\n'));