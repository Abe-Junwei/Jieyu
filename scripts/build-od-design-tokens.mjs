#!/usr/bin/env node
/**
 * Generates design/jieyu-paper/tokens.css (Open Design token names, literal values)
 * from src/styles/tokens.css. See ADR-0106.
 *
 *   node scripts/build-od-design-tokens.mjs          regenerate (needs Playwright chromium)
 *   node scripts/build-od-design-tokens.mjs --check  hash-only check, no browser
 */
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'src/styles/tokens.css');
const outPath = path.join(root, 'design/jieyu-paper/tokens.css');
const designLink = path.join(root, 'DESIGN.md');
const designTarget = 'design/jieyu-paper/DESIGN.md';
const pixsoPath = path.join(root, 'design/jieyu-paper/pixso-variables.json');

// Open Design page-layout and Tailwind helpers that DESIGN.md does not name; Pixso does not get them (ADR-0118).
const PIXSO_SKIP = new Set([
  'section-y-desktop', 'container-max', 'container-gutter-desktop',
  'leading-body', 'leading-tight', 'tracking-display',
  'elev-flat', 'elev-ring', 'elev-raised',
  // Pixso does not render shadow spread; focus rings are drawn as ring layers in the components.
  'focus-ring', 'focus-ring-danger',
]);
// Effect styles have no modes in Pixso, so each shadow becomes a light and a dark style.
const PIXSO_EFFECT_NAMES = {
  'shadow-popover': ['阴影', '菜单与提示'],
  'shadow-float': ['阴影', '浮动面板'],
  'shadow-modal': ['阴影', '模态对话框'],
};
// Pixso cloud fonts lack Noto Sans (upright), Noto Sans Mono and Noto Serif SC; drafts use these stand-ins (ADR-0118 §7).
const PIXSO_FONT_STANDINS = {
  'font-display': 'Source Han Serif CN',
  'font-body': 'Noto Sans SC',
  'font-mono': 'JetBrains Mono',
  'font-ipa': 'Noto Sans SemiCondensed',
};

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

// [OD name, kind, source]. kind: color | shadow | length | raw | const.
// Source is a repo token name, or a CSS expression for shadow/const.
const GROUPS = [
  ['纸面与文字', [
    ['bg', 'color', 'surface-canvas'],
    ['surface', 'color', 'surface-panel'],
    ['context', 'color', 'chrome-context-bg'],
    ['surface-warm', 'color', 'theme-accent-tint'],
    ['fg', 'color', 'text-primary'],
    ['fg-2', 'color', 'text-secondary'],
    ['muted', 'color', 'text-tertiary'],
    ['meta', 'color', 'text-tertiary'],
    ['border', 'color', 'border-subtle'],
    ['border-soft', 'color', 'border-soft'],
    ['border-strong', 'color', 'border-strong'],
    ['border-control', 'color', 'border-control'],
    ['focus-color', 'color', 'focus-color'],
    ['text-selection', 'pair', ['#e2e2e2', '#3a3832']],
    ['accent', 'color', 'action-solid'],
    ['accent-on', 'color', 'text-on-action'],
    ['accent-hover', 'color', 'action-hover'],
    ['accent-active', 'color', 'action-active'],
    ['success', 'color', 'state-success-solid'],
    ['success-text', 'color', 'state-success-text'],
    ['success-bg', 'color', 'state-success-bg'],
    ['warn', 'color', 'state-warning-solid'],
    ['warn-text', 'color', 'state-warning-text'],
    ['warn-bg', 'color', 'state-warning-bg'],
    ['danger', 'color', 'state-danger-solid'],
    ['danger-text', 'color', 'state-danger-text'],
    ['danger-bg', 'color', 'state-danger-bg'],
    ['brand', 'color', 'brand-solid'],
    ['brand-on', 'color', 'brand-on'],
    ['brand-tint', 'color', 'brand-tint'],
    ['secondary', 'color', 'mark-secondary'],
    ['toast-bg', 'color', 'toast-bg'],
    ['toast-fg', 'color', 'toast-fg'],
    ['toast-border', 'color', 'toast-border'],
  ]],
  ['字体与字号（最小 12px）', [
    ['font-display', 'raw', 'font-display'],
    ['font-body', 'raw', 'font-sans'],
    ['font-mono', 'raw', 'font-mono'],
    ['font-ipa', 'raw', 'font-ipa'],
    ['text-xs', 'length', 'type-code-time-size'],
    ['text-sm', 'length', 'type-meta-tool-size'],
    ['text-base', 'length', 'type-body-reg-size'],
    ['text-lg', 'length', 'type-sub-h-size'],
    ['text-xl', 'length', 'type-main-h-size'],
    ['leading-xs', 'length', 'type-code-time-line'],
    ['leading-sm', 'length', 'type-meta-tool-line'],
    ['leading-base', 'length', 'type-body-reg-line'],
    ['leading-lg', 'length', 'type-sub-h-line'],
    ['leading-xl', 'length', 'type-main-h-line'],
    ['leading-body', 'const', '1.57'],
    ['leading-tight', 'const', '1.4'],
    ['tracking-display', 'const', '0'],
  ]],
  ['间距、圆角、控件', [
    ...[1, 2, 3, 4, 5, 6, 8, 10, 12, 16].map((n) => [`space-${n}`, 'length', `space-${n}`]),
    ['section-y-desktop', 'const', '24px'],
    ...['sm', 'md', 'lg', 'pill'].map((n) => [`radius-${n}`, 'length', `radius-${n}`]),
    ['control-height', 'length', 'btn-h-md'],
    ['control-height-compact', 'length', 'btn-h-sm'],
    ['rail-width', 'length', 'left-rail-width'],
    ['lane-height', 'length', 'timeline-lane-height'],
    ['container-max', 'const', '1440px'],
    ['container-gutter-desktop', 'const', '32px'],
  ]],
  ['遮罩与浮层阴影（工作面、面板、卡片无投影）', [
    ['scrim', 'color', 'scrim'],
    ['shadow-popover', 'shadow', 'var(--shadow-popover)'],
    ['shadow-float', 'shadow', 'var(--shadow-float)'],
    ['shadow-modal', 'shadow', 'var(--shadow-modal)'],
    ['elev-flat', 'const', 'none'],
    ['elev-ring', 'shadow', '0 0 0 1px var(--border-soft)'],
    ['elev-raised', 'shadow', 'var(--shadow-float)'],
    ['focus-ring', 'pair', ['0 0 0 3px rgb(17 17 17 / 14%)', '0 0 0 3px rgb(244 242 236 / 18%)']],
    ['focus-ring-danger', 'pair', ['0 0 0 3px rgb(220 38 38 / 16%)', '0 0 0 3px rgb(240 113 113 / 22%)']],
  ]],
  ['时间轴', [
    ['playhead', 'color', 'timeline-playhead-color'],
    ['selection', 'color', 'timeline-selection-bg'],
    ['confidence-mid', 'color', 'confidence-mid-mark'],
    ['confidence-low', 'color', 'confidence-low-mark'],
    ...[0, 1, 2, 3].map((n) => [`series-ink-${n}`, 'color', `series-ink-${n}`]),
  ]],
  ['动效与层级', [
    ['motion-fast', 'raw', 'duration-fast'],
    ['motion-base', 'raw', 'duration-normal'],
    ['ease-standard', 'raw', 'ease-default'],
    ['z-base', 'raw', 'z-base'],
    ['z-sticky', 'raw', 'z-sticky'],
    ['z-shell', 'raw', 'z-shell'],
    ['z-drawer', 'raw', 'z-drawer'],
    ['z-popover', 'raw', 'z-popover'],
    ['z-toast', 'raw', 'z-toast'],
    ['z-modal', 'raw', 'z-modal'],
  ]],
];

function readHeaderHash(text, key) {
  return text.match(new RegExp(`${key}: ([0-9a-f]{64})`))?.[1] ?? null;
}

function parseBlockVars(block) {
  const vars = {};
  for (const [, k, v] of block.matchAll(/--([a-z0-9-]+):\s*([^;]+);/gi)) vars[k] = v.trim();
  return vars;
}

function parseColor(value) {
  const hex = /^#([0-9a-f]{6})$/i.exec(value ?? '');
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const rgb = /^rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)%\)$/i.exec(value ?? '');
  if (!rgb) return null;
  return {
    r: Number(rgb[1]),
    g: Number(rgb[2]),
    b: Number(rgb[3]),
    a: Number(rgb[4]) / 100,
  };
}

function compositeColor(foreground, background) {
  return {
    r: foreground.r * foreground.a + background.r * (1 - foreground.a),
    g: foreground.g * foreground.a + background.g * (1 - foreground.a),
    b: foreground.b * foreground.a + background.b * (1 - foreground.a),
    a: 1,
  };
}

function contrastRatio(foreground, background, backdrop = background) {
  const fg = parseColor(foreground);
  const bg = parseColor(background);
  const underlay = parseColor(backdrop);
  if (!fg || !bg || !underlay) return null;
  const displayedBackground = bg.a === 1 ? bg : compositeColor(bg, underlay);
  const displayedForeground =
    fg.a === 1 ? fg : compositeColor(fg, displayedBackground);
  const relLum = ({ r, g, b }) => {
    const lin = (c) => {
      const s = c / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };
  const a = relLum(displayedForeground);
  const b = relLum(displayedBackground);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function pixsoColor(value) {
  const m = value.match(/^rgb\((\d+) (\d+) (\d+) \/ (\d+)%\)$/);
  const h = (n) => Number(n).toString(16).padStart(2, '0');
  return (m ? `#${h(m[1])}${h(m[2])}${h(m[3])}${h(Math.round((m[4] * 255) / 100))}` : value).toUpperCase();
}

function pixsoShadow(value) {
  const color = value.match(/rgb\([^)]*\)|#[0-9a-f]+/i)[0];
  const [x, y, radius, spread = 0] = value.replace(color, '').trim().split(/\s+/).map(parseFloat);
  return { type: 'DROP_SHADOW', offset: { x, y }, radius, spread, color: pixsoColor(color) };
}

/**
 * Pixso payload from [name, lightValue, darkValue] rows.
 * `variableSets` / `variables` go to write_variables as-is; `effectStyles` are written by name.
 */
export function buildPixsoPayload(rows) {
  const variables = {};
  const effectStyles = {};
  for (const [name, lv, dv] of rows) {
    if (PIXSO_SKIP.has(name)) continue;
    if (PIXSO_EFFECT_NAMES[name]) {
      const [group, label] = PIXSO_EFFECT_NAMES[name];
      effectStyles[`${group}/${label} --${name}`] = [pixsoShadow(lv)];
      effectStyles[`${group}-暗色/${label} --${name}`] = [pixsoShadow(dv)];
    } else if (/^(#|rgb\()/.test(lv)) {
      variables[`--${name}`] = { type: 'color', variableSet: '颜色', values: { 亮色: pixsoColor(lv), 暗色: pixsoColor(dv) } };
    } else if (/^-?[\d.]+(px|ms)?$/.test(lv)) {
      variables[`--${name}`] = { type: 'number', variableSet: '尺寸', values: { 默认: parseFloat(lv) } };
    } else if (name.startsWith('font-')) {
      const family = PIXSO_FONT_STANDINS[name] ?? lv.split(',')[0].replace(/['"]/g, '').trim();
      variables[`--${name}`] = { type: 'string', variableSet: '字体', values: { 默认: family } };
    } else {
      variables[`--${name}`] = { type: 'string', variableSet: '尺寸', values: { 默认: lv } };
    }
  }
  const variableSets = { 颜色: { modes: ['亮色', '暗色'] }, 尺寸: { modes: ['默认'] }, 字体: { modes: ['默认'] } };
  return { variableSets, variables, effectStyles };
}

function check() {
  const errors = [];
  const pixso = JSON.parse(readFileSync(pixsoPath, 'utf8'));
  const { variableSets, variables, effectStyles } = pixso;
  if (pixso.sourceSha256 !== sha256(readFileSync(sourcePath, 'utf8'))) {
    errors.push('design/jieyu-paper/pixso-variables.json is stale; run `npm run build:od-tokens`, then sync Pixso (ADR-0118).');
  }
  if (pixso.bodySha256 !== sha256(JSON.stringify({ variableSets, variables, effectStyles }))) {
    errors.push('design/jieyu-paper/pixso-variables.json was edited by hand; edit src/styles/tokens.css and run `npm run build:od-tokens`.');
  }
  const out = readFileSync(outPath, 'utf8');
  const body = out.slice(out.indexOf('\n:root') + 1);
  if (readHeaderHash(out, 'source-sha256') !== sha256(readFileSync(sourcePath, 'utf8'))) {
    errors.push('src/styles/tokens.css changed; run `npm run build:od-tokens`.');
  }
  if (readHeaderHash(out, 'body-sha256') !== sha256(body)) {
    errors.push('design/jieyu-paper/tokens.css was edited by hand; edit src/styles/tokens.css and run `npm run build:od-tokens`.');
  }
  const lightVars = parseBlockVars(body.match(/:root\s*\{([^}]*)\}/)?.[1] ?? '');
  const darkVars = {
    ...lightVars,
    ...parseBlockVars(body.match(/\[data-theme="dark"\]\s*\{([^}]*)\}/)?.[1] ?? ''),
  };
  const contrastPairs = [
    ['fg', 'surface', 4.5],
    ['fg-2', 'surface', 4.5],
    ['muted', 'surface', 4.5],
    ['fg', 'context', 4.5],
    ['fg-2', 'context', 4.5],
    ['muted', 'context', 4.5],
    ['focus-color', 'surface', 3],
    ['border-control', 'surface', 3],
    ['accent-on', 'accent', 4.5],
    ['brand-on', 'brand', 4.5],
    ['secondary', 'brand-tint', 4.5],
    ['toast-fg', 'toast-bg', 4.5],
    ['success-text', 'success-bg', 4.5],
    ['warn-text', 'warn-bg', 4.5],
    ['danger-text', 'danger-bg', 4.5],
  ];
  for (const [mode, vars] of [['light', lightVars], ['dark', darkVars]]) {
    for (const [foreground, background, minimum] of contrastPairs) {
      const ratio = contrastRatio(vars[foreground], vars[background], vars.surface);
      if (ratio === null || ratio < minimum) {
        errors.push(
          `--${foreground} (${vars[foreground]}) vs --${background} (${vars[background]}) in ${mode} mode is ${ratio === null ? 'invalid' : `${ratio.toFixed(2)}:1`} (minimum ${minimum}:1).`,
        );
      }
    }
  }
  const zStack = ['z-base', 'z-sticky', 'z-shell', 'z-drawer', 'z-popover', 'z-toast', 'z-modal'];
  const expectedZStack = [1, 20, 40, 80, 160, 240, 320];
  for (const [mode, vars] of [['light', lightVars], ['dark', darkVars]]) {
    const actual = zStack.map((token) => Number(vars[token]));
    if (actual.some((value, index) => value !== expectedZStack[index])) {
      errors.push(
        `Semantic z-index anchors in ${mode} mode must be ${expectedZStack.join(' < ')}; got ${actual.join(' < ')}.`,
      );
    }
  }
  if (!lstatSync(designLink).isSymbolicLink() || readlinkSync(designLink) !== designTarget) {
    errors.push(`DESIGN.md must be a symlink to ${designTarget}.`);
  }
  if (errors.length) {
    for (const e of errors) console.error(`[check:od-design-tokens] ${e}`);
    process.exit(1);
  }
  console.log('[check:od-design-tokens] OK');
}

async function build() {
  const { chromium } = await import('@playwright/test');
  const source = readFileSync(sourcePath, 'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(`<style>${source}</style><div id="p" style="position:absolute"></div>`);

  const resolveTheme = (theme) => page.evaluate(({ groups, theme }) => {
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
    const probe = document.getElementById('p');
    const ctx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
    const hex = (n) => n.toString(16).padStart(2, '0');
    const format = (r, g, b, a) => (a >= 1
      ? `#${hex(r)}${hex(g)}${hex(b)}`
      : `rgb(${r} ${g} ${b} / ${Math.round(a * 100)}%)`);
    const canon = (color) => {
      const rgb = color.match(/^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/);
      if (rgb) return format(+rgb[1], +rgb[2], +rgb[3], rgb[4] === undefined ? 1 : +rgb[4]);
      const srgb = color.match(/^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.]+))?\)$/);
      if (srgb) {
        const [r, g, b] = srgb.slice(1, 4).map((v) => Math.round(Math.min(1, Math.max(0, +v)) * 255));
        return format(r, g, b, srgb[4] === undefined ? 1 : +srgb[4]);
      }
      // Other color spaces: canvas rounding is acceptable for opaque colors only.
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return format(r, g, b, a / 255);
    };
    const read = ([, kind, src]) => {
      switch (kind) {
        case 'const': return src;
        case 'pair': return theme === 'dark' ? src[1] : src[0];
        case 'raw': return getComputedStyle(document.documentElement).getPropertyValue(`--${src}`).trim().replace(/\s+/g, ' ');
        case 'color':
          probe.style.backgroundColor = `var(--${src})`;
          return canon(getComputedStyle(probe).backgroundColor);
        case 'length':
          probe.style.width = `var(--${src})`;
          return getComputedStyle(probe).width.replace(/^0px$/, '0');
        case 'shadow': {
          probe.style.boxShadow = src;
          const computed = getComputedStyle(probe).boxShadow;
          if (computed === 'none') return 'none';
          return computed.split(/,(?![^(]*\))/).map((layer) => {
            const color = layer.match(/(?:rgba?|color|oklch|lab)\([^)]*\)|#[0-9a-f]+/i)?.[0] ?? '';
            const lengths = layer.replace(color, '').trim().split(/\s+/).map((l) => (l === '0px' ? '0' : l));
            if (lengths.length === 4 && lengths[3] === '0') lengths.pop();
            return `${lengths.join(' ')} ${canon(color)}`;
          }).join(', ');
        }
        default: throw new Error(`unknown kind ${kind}`);
      }
    };
    return groups.map(([, entries]) => entries.map((entry) => [entry[0], read(entry)]));
  }, { groups: GROUPS, theme });

  const light = await resolveTheme(null);
  const dark = await resolveTheme('dark');
  await browser.close();

  const lines = [':root {'];
  GROUPS.forEach(([title], gi) => {
    lines.push(`  /* ${title} */`);
    for (const [name, value] of light[gi]) lines.push(`  --${name}: ${value};`);
  });
  lines.push('}', '', '[data-theme="dark"] {');
  GROUPS.forEach((_, gi) => {
    dark[gi].forEach(([name, value], i) => {
      if (value !== light[gi][i][1]) lines.push(`  --${name}: ${value};`);
    });
  });
  lines.push('}', '');
  const body = lines.join('\n');
  const header = [
    '/*',
    ' * 生成文件，不要手改。改 src/styles/tokens.css 后运行 `npm run build:od-tokens`（ADR-0106）。',
    ` * source-sha256: ${sha256(source)}`,
    ` * body-sha256: ${sha256(body)}`,
    ' */',
  ].join('\n');
  writeFileSync(outPath, `${header}\n${body}`);
  console.log(`[build:od-tokens] wrote ${path.relative(root, outPath)}`);

  const payload = buildPixsoPayload(light.flatMap((group, gi) => group.map(([name, lv], i) => [name, lv, dark[gi][i][1]])));
  const pixso = {
    $comment: '生成文件，不要手改。改 src/styles/tokens.css 后运行 `npm run build:od-tokens`，再由代理同步到 Pixso（ADR-0118）。',
    sourceSha256: sha256(source),
    bodySha256: sha256(JSON.stringify(payload)),
    ...payload,
  };
  writeFileSync(pixsoPath, `${JSON.stringify(pixso, null, 2)}\n`);
  console.log(`[build:od-tokens] wrote ${path.relative(root, pixsoPath)}`);
}

if (process.argv[1]?.endsWith(`${path.sep}build-od-design-tokens.mjs`)) {
  if (process.argv.includes('--check')) check();
  else await build();
}
