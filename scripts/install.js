/* Dev install: copies the built plugin and every paired theme into each
   vault's .obsidian. Run after build:
   node scripts/install.js [vault…]  (default: the vaults registered in
   ~/Library/Application Support/obsidian/obsidian.json) */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const builtMain = fs.readFileSync(path.join(root, 'dist', 'main.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const manifest = fs.readFileSync(path.join(root, 'manifest.json'), 'utf8');
const themes = fs.readdirSync(path.join(root, 'themes'))
  .map((name) => ({
    name,
    css: fs.readFileSync(path.join(root, 'themes', name, 'theme.css'), 'utf8'),
    // Obsidian's theme dropdown only lists a folder carrying BOTH files —
    // a theme.css without its manifest.json is invisible in Appearance.
    manifest: fs.readFileSync(path.join(root, 'themes', name, 'manifest.json'), 'utf8'),
  }));

let vaults = process.argv.slice(2);
if (!vaults.length) {
  const obsidianJson = path.join(process.env.HOME, 'Library/Application Support/obsidian/obsidian.json');
  if (!fs.existsSync(obsidianJson)) { console.error('no vaults given and obsidian.json not found'); process.exit(1); }
  vaults = Object.values(JSON.parse(fs.readFileSync(obsidianJson, 'utf8')).vaults).map(v => v.path);
}

for (const vault of vaults) {
  if (!fs.existsSync(vault)) { console.log(`${vault}: missing, skipped`); continue; }
  const pluginDir = path.join(vault, '.obsidian', 'plugins', 'index');
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.writeFileSync(path.join(pluginDir, 'main.js'), builtMain);
  fs.writeFileSync(path.join(pluginDir, 'styles.css'), styles);
  fs.writeFileSync(path.join(pluginDir, 'manifest.json'), manifest);
  const themesDir = path.join(vault, '.obsidian', 'themes');
  for (const t of themes) {
    fs.mkdirSync(path.join(themesDir, t.name), { recursive: true });
    fs.writeFileSync(path.join(themesDir, t.name, 'theme.css'), t.css);
    fs.writeFileSync(path.join(themesDir, t.name, 'manifest.json'), t.manifest);
  }
  console.log(`${vault}: plugin v${JSON.parse(manifest).version} + ${themes.length} themes`);
}