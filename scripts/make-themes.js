/* Generates the Obsidian theme pairs from index-planner's palette table
   (renderer/styles/themes.css), token-for-token the way the two hand-tuned
   themes ("Index", "Index Navy") were mapped. Fate colors follow the app's
   own FATE_COLOR: healthy=accent, overdue=keyword, stale=func — collisions
   (gold, silver: func === accent) are the app's too, ported verbatim.
   Hover shades derive by mixing the accent 82/18 toward the theme's fg —
   lighter in dark modes, darker in light modes. Run: node scripts/make-themes.js */

const fs = require('fs');
const path = require('path');

// [obsidianName, darkId, darkLabel, lightId, lightLabel, palette]
// Palette keys: bg, bgAlt (bg-alt), bgActive (bg-active), sidebar
// (sidebar-bg), sidebarFg, border, fg, fgDim, accent, accentFg, keyword,
// string, number, type, func.
const PAIRS = [
  ['Index Gold', 'index', 'Index (gold)', 'index-dawn', 'Index Dawn (gold)', {
    dark: { bg: '#191c1e', bgAlt: '#20252a', bgActive: '#2c3339', sidebar: '#16191b', sidebarFg: '#a09a8c', border: '#262b2f', fg: '#d6d2c6', fgDim: '#807a6c', accent: '#cfa050', accentFg: '#17130a', keyword: '#cc6a56', string: '#8fa870', number: '#7fa6b8', type: '#6e9a9c', func: '#cfa050' },
    light: { bg: '#f2efe6', bgAlt: '#eae7dc', bgActive: '#dfdccc', sidebar: '#e9e6db', sidebarFg: '#6e6a5c', border: '#d8d4c6', fg: '#33302a', fgDim: '#7d786a', accent: '#b3822a', accentFg: '#1d1405', keyword: '#b0472e', string: '#5f7d3a', number: '#38697e', type: '#3d7376', func: '#a3760f' },
  }],
  ['Index Bright', 'index-bright', 'Index Bright', 'index-daylight', 'Index Daylight', {
    dark: { bg: '#23292e', bgAlt: '#21272d', bgActive: '#2e363d', sidebar: '#171a1d', sidebarFg: '#beb6a7', border: '#2c333a', fg: '#f0ede3', fgDim: '#a1998b', accent: '#8abec0', accentFg: '#10161a', keyword: '#eb8163', string: '#b0d193', number: '#9dc8da', type: '#8abec0', func: '#eeba63' },
    light: { bg: '#f4f6f7', bgAlt: '#eaeeef', bgActive: '#dce3e6', sidebar: '#e8ecee', sidebarFg: '#5c666d', border: '#d3d9dc', fg: '#262b2f', fgDim: '#7c868c', accent: '#2e8a8d', accentFg: '#0d1a1c', keyword: '#c25438', string: '#57813f', number: '#2e6f8d', type: '#23767a', func: '#a06a12' },
  }],
  ['Index Bright Alt', 'index-bright-alt', 'Index Bright Alt (jade + gold)', 'index-daylight-alt', 'Index Daylight Alt', {
    dark: { bg: '#231f1a', bgAlt: '#21272d', bgActive: '#2e363d', sidebar: '#171a1d', sidebarFg: '#beb6a7', border: '#2c281f', fg: '#7ec2a1', fgDim: '#9c8f7c', accent: '#d3a25e', accentFg: '#17120a', keyword: '#c48fd6', string: '#7ec2a1', number: '#7ea8e6', type: '#d3a25e', func: '#3fc7c9' },
    light: { bg: '#f4f1ea', bgAlt: '#ece8de', bgActive: '#e0dccc', sidebar: '#e9e5da', sidebarFg: '#6b665a', border: '#dcd6c8', fg: '#2c4a3e', fgDim: '#8a8474', accent: '#a3722c', accentFg: '#1c1206', keyword: '#8a4bb0', string: '#2e7d5c', number: '#3563b8', type: '#a3722c', func: '#0e8a8d' },
  }],
  ['Index Silver', 'index-silver', 'Index Silver', 'index-silver-day', 'Index Silver Day', {
    dark: { bg: '#1c2024', bgAlt: '#20252b', bgActive: '#2d3640', sidebar: '#181b1f', sidebarFg: '#a8b0b8', border: '#2a3038', fg: '#e5e8ec', fgDim: '#83868c', accent: '#d7dde3', accentFg: '#14181c', keyword: '#c2788a', string: '#93b98a', number: '#b79bc4', type: '#6fa0c4', func: '#d7dde3' },
    light: { bg: '#f2f4f6', bgAlt: '#eaedf0', bgActive: '#dde2e7', sidebar: '#e7eaee', sidebarFg: '#606a74', border: '#d5dade', fg: '#2b3036', fgDim: '#7d858d', accent: '#3f4750', accentFg: '#f2f4f6', keyword: '#a84e66', string: '#4f7d49', number: '#7a4fa8', type: '#34699c', func: '#3f4750' },
  }],
  ['Index Silver Alt', 'index-silver-alt', 'Index Silver Alt (ice)', 'index-silver-frost', 'Index Silver Frost', {
    dark: { bg: '#1a1c1e', bgAlt: '#20252b', bgActive: '#2d3640', sidebar: '#181b1f', sidebarFg: '#a8b0b8', border: '#22262b', fg: '#e6ecf0', fgDim: '#8b9096', accent: '#c9e6f2', accentFg: '#101a20', keyword: '#d48fce', string: '#7fbaa6', number: '#8ab2e8', type: '#52c6c8', func: '#c9e6f2' },
    light: { bg: '#f1f5f8', bgAlt: '#e9eef2', bgActive: '#dce4ea', sidebar: '#e6ecf1', sidebarFg: '#5a6772', border: '#d4dee5', fg: '#26303a', fgDim: '#75828d', accent: '#2478a0', accentFg: '#f0f7fb', keyword: '#a34b86', string: '#2e7d68', number: '#33619e', type: '#0e7d80', func: '#2478a0' },
  }],
  ['Index Stock', 'index-stock', 'Index Stock', 'index-stock-paper', 'Index Stock Paper', {
    dark: { bg: '#191c1e', bgAlt: '#20252a', bgActive: '#2c3339', sidebar: '#16191b', sidebarFg: '#a09a8c', border: '#262b2f', fg: '#d6d2c6', fgDim: '#6f6a60', accent: '#cfa050', accentFg: '#17130a', keyword: '#d6d2c6', string: '#6e9a9c', number: '#cfa050', type: '#6e9a9c', func: '#cfa050' },
    light: { bg: '#f2efe6', bgAlt: '#eae7dc', bgActive: '#dfdccc', sidebar: '#e9e6db', sidebarFg: '#6e6a5c', border: '#d8d4c6', fg: '#33302a', fgDim: '#75705f', accent: '#a87d2a', accentFg: '#1c1405', keyword: '#4a463e', string: '#3d7376', number: '#a87d2a', type: '#3d7376', func: '#a87d2a' },
  }],
  ['Olive', 'olive', 'Olive (olive / military)', 'olive-dawn', 'Olive Dawn', {
    dark: { bg: '#1d1f1a', bgAlt: '#232619', bgActive: '#33361f', sidebar: '#191a17', sidebarFg: '#abb3bf', border: '#6e5323', fg: '#cfcfcf', fgDim: '#87907e', accent: '#ced971', accentFg: '#171a0b', keyword: '#e45e5e', string: '#c3e88d', number: '#82aaff', type: '#7ebdce', func: '#ced971' },
    light: { bg: '#f3f2e9', bgAlt: '#eaeada', bgActive: '#e0e1cc', sidebar: '#e9e9db', sidebarFg: '#666e5c', border: '#d0d2bd', fg: '#2e302a', fgDim: '#6d7462', accent: '#7a852e', accentFg: '#eef0e2', keyword: '#b23a2e', string: '#567d2e', number: '#3358a8', type: '#2e7286', func: '#6d7a1e' },
  }],
];

const lines = (mode, p) => `body.theme-${mode} {
  --background-primary: ${p.bg};
  --background-primary-alt: ${p.bgActive};
  --background-secondary: ${p.sidebar};
  --background-secondary-alt: ${p.bgAlt};
  --titlebar-background: ${p.sidebar};
  --titlebar-background-focused: ${p.sidebar};
  --titlebar-text: ${p.sidebarFg};
  --text-normal: ${p.fg};
  --text-muted: ${p.fgDim};
  --text-faint: color-mix(in srgb, ${p.fgDim} 66%, transparent);
  --text-accent: ${p.accent};
  --text-accent-hover: color-mix(in srgb, ${p.accent} 82%, ${p.fg});
  --text-on-accent: ${p.accentFg};
  --interactive-accent: ${p.accent};
  --interactive-accent-hover: color-mix(in srgb, ${p.accent} 82%, ${p.fg});
  --background-modifier-border: ${p.border};
  --background-modifier-border-hover: ${p.bgActive};
  --background-modifier-border-focus: ${p.accent};
  --checkbox-color: ${p.accent};
  --checkbox-color-hover: color-mix(in srgb, ${p.accent} 82%, ${p.fg});
  --checkbox-marker-color: ${p.accentFg};
  --link-color: ${p.accent};
  --link-color-hover: color-mix(in srgb, ${p.accent} 82%, ${p.fg});
  --link-unresolved-color: ${p.keyword};
  --code-background: ${p.bgAlt};
  --code-comment: ${p.fgDim};
  --code-function: ${p.func};
  --code-keyword: ${p.keyword};
  --code-string: ${p.string};
  --code-value: ${p.number};
  --code-property: ${p.type};
  --code-tag: ${p.keyword};
  --ir-healthy: ${p.accent};
  --ir-overdue: ${p.keyword};
  --ir-stale: ${p.func};
  --ir-dim: ${p.fgDim};
}`;

const root = path.join(__dirname, '..');
let made = 0;
for (const [name, darkId, darkLabel, lightId, lightLabel, pal] of PAIRS) {
  const dir = path.join(root, 'themes', name);
  fs.mkdirSync(dir, { recursive: true });
  const css = `/* ${name} — the ${darkId} pair from index-planner, ported to Obsidian.
   Light mode: ${lightLabel}. Dark mode: ${darkLabel}.
   The --ir-* tokens re-tune the Index Ring plugin's fate colors:
   healthy = accent, overdue = keyword, stale = func, as in the app's
   own FATE_COLOR table (so a pair where func equals accent shows it
   in the app too). Hover shades mix the accent toward the text colour. */

${lines('light', pal.light)}

${lines('dark', pal.dark)}
`;
  fs.writeFileSync(path.join(dir, 'theme.css'), css);
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ name }, null, 2) + '\n');
  made++;
  console.log(`wrote themes/${name}`);
}
console.log(`${made} theme pairs generated`);