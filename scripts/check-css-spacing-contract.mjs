import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const RULES = [
  {
    file: 'src/styles/tokens.css',
    mustInclude: [
      '--space-stack-page:',
      '--space-stack-section:',
      '--space-title-content:',
      '--space-row-gap:',
      '--space-row-padding-y:',
      '--space-section-padding:',
    ],
  },
  {
    file: 'src/styles/foundation/panel-primitives.css',
    mustInclude: [
      'gap: var(--space-stack-section',
      'padding: var(--space-section-padding',
      'gap: var(--space-title-content',
      'gap: var(--space-row-gap',
      '.panel-subsection__description {',
    ],
  },
  {
    file: 'src/styles/foundation/panel-design-presets.css',
    mustInclude: [
      'gap: var(--space-stack-section',
      'padding: var(--space-section-padding',
    ],
  },
  {
    file: 'src/styles/foundation/language-asset-section-contract.css',
    mustInclude: [
      '--la-section-gap: var(--space-stack-page',
      'gap: var(--space-stack-section',
      'gap: var(--space-title-content',
    ],
  },
  {
    file: 'src/styles/panels/settings-modal.css',
    mustInclude: [
      '.settings-sections-stack',
      'gap: var(--space-stack-section',
      '.settings-section {',
      'gap: var(--space-title-content',
      '.settings-section-body',
      'gap: var(--space-row-gap',
      'padding: var(--space-row-padding-y, 10px) 0;',
    ],
    mustNotMatch: [/\.settings-ai-provider-selector-section\s*\+\s*\.settings-ai-provider-fields-section\s*\{[\s\S]*?margin-top\s*:/m, /margin-top\s*:\s*-\d+px/],
  },
  {
    file: 'src/styles/pages/language-metadata-workspace.css',
    mustInclude: [
      '.lm-workspace .ws-subsection { display: grid; gap: var(--space-stack-section, 12px); }',
      '.lm-subsection-header',
      'details.lm-subsection > .lm-grid + .panel-section__copy',
      'details.lm-subsection > .lm-geography-coverage-layout + .panel-section__copy',
      'gap: var(--space-title-content, 8px);',
      '.lm-geography-panel-header { display: grid; gap: var(--space-title-content, 8px); }',
      '.lm-geocode-bar { display: flex; gap: var(--space-row-gap, 8px); }',
    ],
  },
  {
    file: 'src/styles/pages/orthography-bridge-workspace.css',
    mustInclude: [
      '--la-list-gap: 2px;',
      'gap: var(--space-stack-section, 12px);',
      '.ob-bridge .orthography-builder-actions { gap: var(--space-row-gap, 8px); }',
    ],
  },
  {
    file: 'src/styles/pages/orthography-manager-panel.css',
    mustInclude: [
      '.om-body { display: grid; gap: var(--space-stack-page, 16px); min-height: 0; }',
      '.om-shell .om-browser',
      'gap: var(--space-stack-section, 12px);',
      '.om-browser-header { display: grid; gap: var(--space-title-content, 8px); justify-items: start; text-align: left; }',
      '.om-basic-grid > div',
      'gap: var(--space-title-content, 8px);',
    ],
  },
  {
    file: 'src/styles/panels/analysis-panel.css',
    mustInclude: [
      '.transcription-analysis-panel-body',
      'gap: var(--space-stack-section, 12px);',
      '.transcription-analysis-tab-content',
      '.transcription-analysis-acoustic-hero-card',
      'gap: var(--space-title-content, 8px);',
      '.transcription-analysis-acoustic-hotspots-list {',
      '.transcription-analysis-acoustic-export-scope {',
      '.transcription-analysis-acoustic-pinned-readout {',
    ],
  },
];

const SELECTOR_NO_LITERAL_RULES = [
  {
    file: 'src/styles/panels/settings-modal.css',
    selector: '.settings-sections-stack',
  },
  {
    file: 'src/styles/panels/settings-modal.css',
    selector: '.settings-section',
  },
  {
    file: 'src/styles/panels/settings-modal.css',
    selector: '.settings-section-body',
  },
  {
    file: 'src/styles/foundation/panel-primitives.css',
    selector: '.panel-section',
  },
  {
    file: 'src/styles/foundation/panel-primitives.css',
    selector: '.panel-section__copy',
  },
  {
    file: 'src/styles/foundation/panel-primitives.css',
    selector: '.panel-section__body',
  },
  {
    file: 'src/styles/pages/language-metadata-workspace.css',
    selector: '.lm-subsection-header',
  },
  {
    file: 'src/styles/pages/language-metadata-workspace.css',
    selector: '.lm-workspace details.lm-subsection > .lm-grid + .panel-section__copy',
  },
  {
    file: 'src/styles/pages/language-metadata-workspace.css',
    selector: '.lm-workspace details.lm-subsection > .lm-geography-coverage-layout + .panel-section__copy',
  },
  {
    file: 'src/styles/pages/language-metadata-workspace.css',
    selector: '.lm-grid',
  },
  {
    file: 'src/styles/pages/orthography-manager-panel.css',
    selector: '.om-body',
  },
  {
    file: 'src/styles/panels/analysis-panel.css',
    selector: '.transcription-analysis-panel-body',
  },
];

function readText(relPath) {
  const absPath = path.join(ROOT, relPath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`missing file: ${relPath}`);
  }
  return fs.readFileSync(absPath, 'utf8');
}

function escapeForRegex(input) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findSelectorBlock(text, selector) {
  const escaped = escapeForRegex(selector);
  const head = new RegExp(`${escaped}\\s*\\{`, 'm');
  const match = head.exec(text);
  if (!match) return null;
  const start = match.index + match[0].length;
  let depth = 1;
  let i = start;
  while (i < text.length && depth > 0) {
    const ch = text[i];
    if (ch === '{') depth += 1;
    if (ch === '}') depth -= 1;
    i += 1;
  }
  if (depth !== 0) return null;
  return text.slice(start, i - 1);
}

function main() {
  const failures = [];

  for (const rule of RULES) {
    const text = readText(rule.file);

    for (const expected of rule.mustInclude ?? []) {
      if (!text.includes(expected)) {
        failures.push(`${rule.file}: missing snippet -> ${expected}`);
      }
    }

    for (const pattern of rule.mustNotMatch ?? []) {
      if (pattern.test(text)) {
        failures.push(`${rule.file}: forbidden pattern -> ${pattern}`);
      }
    }
  }

  // 关键选择器禁止裸值间距（允许白名单 token）| Key selectors should not use literal spacing values
  for (const rule of SELECTOR_NO_LITERAL_RULES) {
    const text = readText(rule.file);
    const block = findSelectorBlock(text, rule.selector);
    if (!block) {
      failures.push(`${rule.file}: selector not found -> ${rule.selector}`);
      continue;
    }

    const literalMatches = [...block.matchAll(/\b(?:gap|margin-top|margin-bottom|padding-top|padding-bottom)\s*:\s*(?:4|6|8|10|12|14|16|18)px\b/gm)];
    for (const match of literalMatches) {
      const snippet = match[0];
      failures.push(`${rule.file}: ${rule.selector} has literal spacing -> ${snippet}`);
    }
  }

  console.log(`[check-css-spacing-contract] files=${RULES.length}, failures=${failures.length}`);

  if (failures.length > 0) {
    console.error('[check-css-spacing-contract] failed');
    failures.slice(0, 30).forEach((item) => console.error(`  - ${item}`));
    process.exit(1);
  }

  console.log('[check-css-spacing-contract] OK');
}

main();
