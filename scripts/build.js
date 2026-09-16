/* Build: the module sources (main/ring/pane/scanner/importer.js) → dist/main.js.
   Obsidian evaluates a plugin's main.js as one virtual module, so relative
   requires cannot resolve — the plugin must ship as a single file. This is
   a hand-rolled bundler: no dependencies, no transforms, sources embedded
   verbatim. Run after any source change:  node scripts/build.js */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const MODULES = ['main.js', 'ring.js', 'pane.js', 'scanner.js', 'importer.js'];

const defs = MODULES.map((f) => JSON.stringify(fs.readFileSync(path.join(root, f), 'utf8')));

const bundle = `(function () {
// dist/main.js — the Index plugin, single-file as Obsidian requires.
// Built by scripts/build.js from main.js, ring.js, pane.js, scanner.js,
// importer.js. Do not edit here; edit the sources and rebuild.
var __obsidian = require("obsidian");
var __defs = {
  "main.js": ${defs[0]},
  "ring.js": ${defs[1]},
  "pane.js": ${defs[2]},
  "scanner.js": ${defs[3]},
  "importer.js": ${defs[4]}
};
var __cache = {};
function __load(name) {
  if (__cache[name]) return __cache[name].exports;
  var module = { exports: {} };
  __cache[name] = module;
  var factory = new Function("module", "exports", "require", __defs[name]);
  factory(module, module.exports, function (id) {
    // Relative ids are ours; everything else ("obsidian", Obsidian's exposed
    // "@codemirror/…" modules) belongs to the host's require — routing them
    // through __load would return an empty module instead of throwing or
    // resolving, so the guard in main.js would never see a failure.
    if (id === "obsidian") return __obsidian;
    if (/^\\.?\\//.test(id)) return __load(id.replace(/^\\.\\//, ""));
    return require(id);
  });
  return module.exports;
}
module.exports = __load("main.js");
})();
`;

const dist = path.join(root, 'dist');
fs.mkdirSync(dist, { recursive: true });
fs.writeFileSync(path.join(dist, 'main.js'), bundle);
console.log(`dist/main.js written (${(bundle.length / 1024).toFixed(1)} kB from ${MODULES.length} modules)`);