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

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

// [OD name, kind, source]. kind: color | shadow | length | raw | const.
// Source is a repo token name, or a CSS expression for shadow/const.
const GROUPS = [
  ['纸面与文字', [
    ['bg', 'color', 'surface-canvas'],
    ['surface', 'color', 'surface-panel'],
    ['surface-warm', 'color', 'theme-accent-tint'],
    ['fg', 'color', 'text-primary'],
    ['fg-2', 'color', 'text-secondary'],
    ['muted', 'color', 'text-tertiary'],
    ['meta', 'color', 'text-tertiary'],
    ['border', 'color', 'border-soft'],
    ['border-soft', 'color', 'border-subtle'],
    ['border-strong', 'color', 'border-strong'],
    ['border-control', 'color', 'border-control'],
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
    ['secondary', 'color', 'mark-secondary'],
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
    ['text-2xl', 'length', 'type-main-h-size'],
    ['text-3xl', 'length', 'type-main-h-size'],
    ['text-4xl', 'length', 'type-main-h-size'],
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
    ['section-y-tablet', 'const', '16px'],
    ['section-y-phone', 'const', '12px'],
    ...['sm', 'md', 'lg', 'pill'].map((n) => [`radius-${n}`, 'length', `radius-${n}`]),
    ['control-height', 'length', 'btn-h-md'],
    ['control-height-compact', 'length', 'btn-h-sm'],
    ['rail-width', 'length', 'left-rail-width'],
    ['lane-height', 'length', 'timeline-lane-height'],
    ['container-max', 'const', '1440px'],
    ['container-gutter-desktop', 'const', '32px'],
    ['container-gutter-tablet', 'const', '16px'],
    ['container-gutter-phone', 'const', '12px'],
  ]],
  ['遮罩与浮层阴影（工作面、面板、卡片无投影）', [
    ['scrim', 'color', 'scrim'],
    ['shadow-popover', 'shadow', 'var(--shadow-popover)'],
    ['shadow-float', 'shadow', 'var(--shadow-float)'],
    ['shadow-modal', 'shadow', 'var(--shadow-modal)'],
    ['elev-flat', 'const', 'none'],
    ['elev-ring', 'shadow', '0 0 0 1px var(--border-soft)'],
    ['elev-raised', 'shadow', 'var(--shadow-float)'],
    ['focus-ring', 'shadow', 'var(--shadow-focus)'],
  ]],
  ['时间轴', [
    ['playhead', 'color', 'timeline-playhead-color'],
    ['selection', 'color', 'timeline-selection-bg'],
    ['confidence-mid', 'color', 'confidence-mid-mark'],
    ['confidence-low', 'color', 'confidence-low-mark'],
    ...[0, 1, 2, 3].map((n) => [`series-ink-${n}`, 'color', `series-ink-${n}`]),
  ]],
  ['动效', [
    ['motion-fast', 'raw', 'duration-fast'],
    ['motion-base', 'raw', 'duration-normal'],
    ['ease-standard', 'raw', 'ease-default'],
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

function contrastRatio(hexA, hexB) {
  const relLum = (hex) => {
    if (!/^#[0-9a-f]{6}$/i.test(hex ?? '')) return null;
    const n = parseInt(hex.slice(1), 16);
    const lin = (c) => {
      const s = c / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  };
  const a = relLum(hexA);
  const b = relLum(hexB);
  if (a === null || b === null) return null;
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function check() {
  const errors = [];
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
  for (const [mode, vars] of [['light', lightVars], ['dark', darkVars]]) {
    const ratio = contrastRatio(vars['border-control'], vars.surface);
    if (ratio === null || ratio < 3) {
      errors.push(
        `--border-control (${vars['border-control']}) vs --surface (${vars.surface}) in ${mode} mode is ${ratio === null ? 'invalid' : `${ratio.toFixed(2)}:1`} (< 3:1, ADR-0108).`,
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
  const { chromium } = await import('playwright');
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
}

if (process.argv.includes('--check')) check();
else await build();
