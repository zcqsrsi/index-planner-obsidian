/* Builds a generic demo vault for the screenshots: six neutral projects
   with mixed fates (healthy, overdue loose end, stale), a rich pane project
   with day rows, pages joined by wikilink frontmatter and a spun-off
   question — no personal content anywhere. Run:
   node scripts/make-demo-vault.js <vault-path>   (default: index-ring-demo
   beside the repo). Wipes and rewrites the folder, installs the build and
   the Index Navy theme, and writes an appearance ready for the light shots
   (flip appearance.json "theme" to "obsidian" for the dark pair). */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const vault = path.resolve(process.argv[2] || path.join(root, '..', 'index-ring-demo'));

const wipe = (dir) => {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (name === '.obsidian') continue; // plugins/themes stay; layout churns
    fs.rmSync(p, { recursive: true, force: true });
  }
};
fs.mkdirSync(vault, { recursive: true });
wipe(vault);

const write = (rel, body) => {
  const p = path.join(vault, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
};

// ---- the projects: six, fates spread across the ring ----------------------
// Today's row and the carried task assume the day you run this on; the
// stale and loose ends are pinned to fixed old dates so the fates hold.

write('Projects/pilot study.md', `---
status: active
question: "does the protocol hold up at small scale?"
---

## Set up the runs

#### ${today()}
- [ ] calibrate the rig ➕ ${iso(-1)}
- [ ] dry run with water samples ➕ ${today()}
- [x] print the run sheet ✅ ${iso(-1)}

#### ${iso(-2)}
- [ ] order more reagents ➕ ${iso(-4)}

## Compare against the paper

### Tabulate the differences
- [ ] buffer concentration ➕ ${iso(-6)}
- [x] read the methods section twice ✅ ${iso(-5)}

#### ${iso(-7)}
- [x] borrow the settings table ✅ ${iso(-7)}
`);

write('Projects/assay validation.md', `---
status: active
question: "can the assay tell the samples apart?"
---

## Run the validation set

#### ${today()}
- [ ] plate the standards ➕ ${today()}

- [ ] chase the missing reagent 📅 ${iso(-3)} ➕ ${iso(-8)}

- [x] draft the plate map ✅ ${iso(-4)}
`);

write('Projects/field survey.md', `---
status: active
question: "where does the population actually live?"
---

## Plan the survey

### Sites
- [ ] shortlist the sites ➕ 2026-09-01
- [ ] book the van ➕ 2026-09-02
- [ ] print the field sheets ➕ 2026-09-03

### Permits
- [x] check the park rules ✅ 2026-09-05
`);

write('Projects/thesis chapter.md', `---
status: active
question: "what does the pilot actually show?"
---

## Methods

- [x] describe the rig ✅ 2026-09-02
- [x] write the protocol steps ✅ 2026-09-05
- [x] add the run table ✅ 2026-09-07
- [ ] final read-through ➕ ${iso(-2)}

## Results

#### ${today()}
- [ ] update figure 3 ➕ ${today()}
`);

write('Projects/Literature/reading programme.md', `---
status: active
group: "[[Literature]]"
---

## Weekly reading

- [ ] read the drift paper ➕ ${iso(-5)}
- [ ] read the survey methods paper ➕ ${iso(-4)}
`);

write('Projects/Literature/journal club.md', `---
status: active
group: "[[Literature]]"
---

## This month's sessions

- [ ] present the baseline paper ➕ ${iso(-1)}
`);

// The folder note: same name as its folder, no status — group meta only.
// It lives INSIDE the folder (depth > 0); at the top level any note is a
// project, and the group hub would ride the ring as a seventh segment.
write('Projects/Literature/Literature.md', `---
question: "what does the field already know?"
color: "#4f8ea0"
---

Notes that belong to the whole Literature family, not one project.
`);

// ---- the pages: joined by wikilink frontmatter, as ＋ Page writes them ----

write('Pages/pilot study/R baseline.md', `---
project: "[[pilot study]]"
section: "Set up the runs"
---

## R baseline

The dry run tracks against the paper's numbers.

- first pass at 40x
- second pass at 80x
- [ ] re-run the odd sample 📅 ${iso(2)}

\`\`\`
baseline := mean(run[0..n])
threshold <- baseline * 1.15
\`\`\`

> Anything above threshold gets a second look — always.

### Notes to self

The rig drifts when the room warms up.
`);

write('Pages/pilot study/observations.md', `---
project: "[[pilot study]]"
section: "Compare against the paper"
---

## Observations

Second run sat half a band above the first.
`);

// The spun-off question: its own note under Open questions, the project a
// wikilink, the origin page linked back so the graph holds the shape.
write('Pages/Open questions/pilot study/why did batch two drift.md', `---
project: "[[pilot study]]"
section: "Open questions"
---

from [[R baseline]]

Batch two drifted half a band. Temperature, or the reagent lot?
`);

// ---- .obsidian: the build, the Navy pair, appearance set for the light shots
const obsidian = path.join(vault, '.obsidian');
fs.mkdirSync(obsidian, { recursive: true });
const pluginDir = path.join(obsidian, 'plugins', 'index');
fs.mkdirSync(pluginDir, { recursive: true });
fs.copyFileSync(path.join(root, 'dist', 'main.js'), path.join(pluginDir, 'main.js'));
fs.copyFileSync(path.join(root, 'styles.css'), path.join(pluginDir, 'styles.css'));
fs.copyFileSync(path.join(root, 'manifest.json'), path.join(pluginDir, 'manifest.json'));

const themeDir = path.join(obsidian, 'themes', 'Index Navy');
fs.mkdirSync(themeDir, { recursive: true });
fs.copyFileSync(path.join(root, 'themes', 'Index Navy', 'theme.css'), path.join(themeDir, 'theme.css'));
fs.copyFileSync(path.join(root, 'themes', 'Index Navy', 'manifest.json'), path.join(themeDir, 'manifest.json'));

const json = (rel, obj) => fs.writeFileSync(path.join(obsidian, rel), JSON.stringify(obj, null, 2));
json('appearance.json', {
  cssTheme: 'Index Navy',
  theme: 'moonstone',
  accentColor: '#5ccef5',
  interfaceFontFamily: 'Helvetica Neue',
  textFontFamily: 'Helvetica Neue',
  baseFontSize: 16,
  translucency: false,
});
json('community-plugins.json', ['index']);
json('core-plugins.json', {
  'file-explorer': true, search: true, graph: true, backlink: true, outline: true,
  'tag-pane': true, 'page-preview': true, 'command-palette': true, 'daily-notes': false,
  templates: false, 'note-composer': false, sync: false, canvas: false, bookmarks: true,
});

console.log(`demo vault written to ${vault}`);

function today() { return new Date().toISOString().slice(0, 10); }
function iso(offset) { return new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10); }