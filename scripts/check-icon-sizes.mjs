#!/usr/bin/env node
/**
 * ADR-0111: product icons have two sizes (16px / 20px) and a fixed 1.75 stroke.
 * Only src/styles/foundation/jieyu-icon.css may size Lucide icons; JieyuIcon call sites may not pass size props.
 *
 *   node scripts/check-icon-sizes.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import * as csstree from 'css-tree';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');
const ICON_CSS = 'src/styles/foundation/jieyu-icon.css';
const SIZE_PROP_RE =
  /^(?:width|height|min-width|min-height|max-width|max-height|font-size|stroke-width|--jieyu-icon-.*)$/;
const ALLOWED_SIZE_VALUES = new Set(['16px', '20px']);
const JSX_SIZE_PROP_RE = /<JieyuIcon\b[^>]*?\s(?:size|width|height|strokeWidth)=/gs;
const JSX_ICON_TAG_RE = /<JieyuIcon\b[^>]*?\/?>/gs;

function walk(dir, ext, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, ext, out);
    else if (ext.some((e) => entry.name.endsWith(e))) out.push(full);
  }
  return out;
}

const rel = (file) => path.relative(ROOT, file).split(path.sep).join('/');
const errors = [];
const tsxFiles = walk(SRC, ['.tsx']);

// Class names passed to <JieyuIcon className>; rules whose subject is one of them also size the icon.
const iconClasses = new Set();
for (const file of tsxFiles) {
  for (const [tag] of fs.readFileSync(file, 'utf8').matchAll(JSX_ICON_TAG_RE)) {
    for (const [, literal] of tag.matchAll(/['"`]([^'"`]*)['"`]/g)) {
      for (const cls of literal.split(/\s+/))
        if (/^[a-z][\w-]*-[\w-]*$/.test(cls)) iconClasses.add(cls);
    }
  }
}
const subjectTargetsIcon = (selector) =>
  selector.split(',').some((part) => {
    const subject =
      part
        .trim()
        .split(/\s+|>|\+|~/)
        .filter(Boolean)
        .pop() ?? '';
    return (
      subject.includes('jieyu-icon') ||
      [...subject.matchAll(/\.([\w-]+)/g)].some(([, cls]) => iconClasses.has(cls))
    );
  });

for (const file of walk(SRC, ['.css'])) {
  const name = rel(file);
  const ast = csstree.parse(fs.readFileSync(file, 'utf8'), { positions: true, parseValue: false });
  csstree.walk(ast, {
    visit: 'Rule',
    enter(rule) {
      const selector = csstree.generate(rule.prelude);
      if (!selector.includes('jieyu-icon') && !subjectTargetsIcon(selector)) return;
      csstree.walk(rule.block, {
        visit: 'Declaration',
        enter(decl) {
          if (!SIZE_PROP_RE.test(decl.property)) return;
          const value = (decl.value?.value ?? csstree.generate(decl.value)).trim();
          const line = decl.loc?.start.line;
          if (name !== ICON_CSS) {
            errors.push(
              `${name}:${line} \`${selector}\` sets ${decl.property}; size icons only in ${ICON_CSS}`,
            );
          } else if (
            decl.property.startsWith('--jieyu-icon-size') &&
            !ALLOWED_SIZE_VALUES.has(value)
          ) {
            errors.push(`${name}:${line} ${decl.property}: ${value}; icon sizes are 16px or 20px`);
          } else if (decl.property === 'stroke-width' && value !== '1.75') {
            errors.push(`${name}:${line} stroke-width: ${value}; icon stroke is 1.75`);
          }
        },
      });
    },
  });
}

for (const file of tsxFiles) {
  const content = fs.readFileSync(file, 'utf8');
  for (const match of content.matchAll(JSX_SIZE_PROP_RE)) {
    const line = content.slice(0, match.index).split('\n').length;
    errors.push(`${rel(file)}:${line} <JieyuIcon> passes a size prop; use a jieyu-icon--* class`);
  }
}

if (errors.length > 0) {
  console.error(`[check-icon-sizes] FAIL (${errors.length})`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log('[check-icon-sizes] OK');
