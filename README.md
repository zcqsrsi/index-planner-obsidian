# Index for Obsidian: approach sustained exploratory projects with trackable tasks and organised notes.

Index is a project planner and notebook that dynamically reacts to the work you need to do. When undertaking open-ended projects (like a PhD), with many moving parts, drawing up to-do lists is easy, but actually keeping your bearings is hard.

This plugin brings Index to Obsidian. It is the companion to the [macOS app](https://github.com/zcqsrsi/index-planner). The ring, the project pane and the workbooks are here, but the notes are plain markdown in your vault and the structure is your own headings. The plugin only draws the picture. Remove it and every note keeps working.

Everything about Index was designed with the aim of creating a calm, pleasant and productive workspace. Therefore, instead of traditional long lists of overdue reminders(!), Index includes more abstract ways to present your workload. The focal point is a floating ring that tracks your projects, allowing you to get to grips with the tasks ahead with a simple glance. Integrates with Obsidian's graph view to show pages, questions and tasks gathered around their projects as constellations.

## Install

From the [Releases](https://github.com/zcqsrsi/index/releases/latest) page:

1. Download `main.js`, `styles.css` and `manifest.json`.
2. Copy all three into `<your vault>/.obsidian/plugins/index/`.
3. Settings → Community plugins → turn off Restricted mode and enable Index.

Or with [BRAT](https://github.com/TfTHacker/obsidian42-brat): add this repository as a beta plugin and BRAT keeps it updated.

The ribbon button (the Index mark) opens the map. The command palette carries the rest:

| Command | Action |
|---|---|
| Index: Open the ring | the map |
| Index: Open the project pane (busiest project) | the busiest project's pane |
| Index: Open this project in the graph | the local graph on the project's note |
| Index: Open this group in the graph | the group hub, one hop out |
| Index: Spin off the question on this line as its own note | question to its own note |
| Index: Sync project colours to the graph | project and folder colours into the colour groups |
| Index: Import from Index notebooks.json | bring the macOS app's work over |

Bind any of them to keys in Settings → Hotkeys. Settings → Index holds the folders, the stale threshold, the ring behaviour and the pane's folds.

## Building from source

No framework, no bundler; plain readable JavaScript bundled by one script. You need Node.js.

```
git clone https://github.com/zcqsrsi/index.git
cd index
node scripts/build.js       # bundle the sources → dist/main.js (what Obsidian loads)
node scripts/load-test.js    # 193 assertions under a stubbed API + regex DOM
node scripts/install.js      # copy the build + themes into your vaults
node scripts/make-themes.js   # regenerate the nine paired themes
node scripts/make-demo-vault.js  # rebuild the demo vault used for the screenshots
```

The importer also runs over a whole Index data directory: `node scripts/import-universes.js <index-data-dir> [out-root]` writes one vault per universe.

## Notes & limits

- The sky view is Obsidian's own graph, driven by real wikilinks; there is no separate plugin view.
- Project panes are leaves. Drag them, tab them, send them to their own window; the layout persists.
- Desktop and mobile. The pane's drag and drop needs a pointer; everything else works anywhere.
- The macOS app keeps features that belong to Obsidian here: the Log, full-text search, snapshot backups, PDF export.

## License

[MIT](LICENSE) — Copyright (c) 2026 Roop Singh Virk
