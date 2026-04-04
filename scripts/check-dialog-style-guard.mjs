import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SRC_DIR = join(ROOT, 'src');
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css']);

const FORBIDDEN_TOKENS = [
  {
    label: 'floating-panel legacy class',
    pattern: /(?:^|[^\w-])floating-panel(?:-[a-z-]+)?(?:[^\w-]|$)/g,
  },
  {
    label: 'legacy side-pane action token',
    pattern: /(?:^|[^\w-])transcription-side-pane-action-(?:btn(?:-active|-danger)?|icon|popover(?:-[a-z-]+)?|input|row(?:-fill)?)(?:[^\w-]|$)/g,
  },
  {
    label: 'legacy layer-action-popover class',
    pattern: /(?:^|[^\w-])layer-action-popover-(?:backdrop|card|title|body|fieldset(?:-legend)?|feedback(?:-error)?|copy|meta-note|radio-option(?:-block)?)(?:[^\w-]|$)/g,
  },
  {
    label: 'legacy compact button token',
    pattern: /(?:^|[^\w-])btn-sm(?:[^\w-]|$)/g,
  },
  {
    label: 'legacy AI compact button token',
    pattern: /(?:^|[^\w-])ai-btn-sm(?:[^\w-]|$)/g,
  },
  {
    label: 'legacy panel organization surface token',
    pattern: /(?:^|[^\w-])panel-organization-surface(?:-emphasis)?(?:[^\w-]|$)/g,
    allowInFiles: [
      'src/styles/foundation/panel-primitives.css',
      'src/styles/foundation/panel-design-presets.css',
    ],
  },
  {
    label: 'legacy floating width token',
    pattern: /(?:^|[^\w-])adaptiveFloatingWidth(?:[^\w-]|$)|--floating-panel-auto-width/g,
  },
  {
    label: 'unclamped dialog auto width usage',
    pattern: /width\s*:\s*var\(--dialog-auto-width/g,
  },
];

function walk(dir) {
  const entries = readdirSync(dir);
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }

    const dot = entry.lastIndexOf('.');
    const ext = dot >= 0 ? entry.slice(dot) : '';
    if (SOURCE_EXTENSIONS.has(ext)) files.push(fullPath);
  }
  return files;
}

function shouldSkip(relPath) {
  return /\.(test|spec)\.[tj]sx?$/.test(relPath)
    || /[\\/]__tests__[\\/]/.test(relPath)
    || relPath.endsWith('.d.ts');
}

function findViolations(content, relPath) {
  const violations = [];
  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    for (const rule of FORBIDDEN_TOKENS) {
      if (rule.allowInFiles?.includes(relPath)) continue;
      rule.pattern.lastIndex = 0;
      if (!rule.pattern.test(line)) continue;
      violations.push({
        line: index + 1,
        label: rule.label,
        text: line.trim(),
      });
    }
  }
  return violations;
}

function main() {
  const files = walk(SRC_DIR);
  const violations = [];

  for (const file of files) {
    const relPath = relative(ROOT, file);
    if (shouldSkip(relPath)) continue;

    const content = readFileSync(file, 'utf8');
    const fileViolations = findViolations(content, relPath);
    for (const item of fileViolations) {
      violations.push({
        file: relPath,
        ...item,
      });
    }
  }

  if (violations.length === 0) {
    console.log('[check-dialog-style-guard] OK: no legacy panel class usage found in source files.');
    return;
  }

  console.error('[check-dialog-style-guard] Found legacy dialog/panel style tokens in source files:\n');
  for (const item of violations) {
    console.error(`- ${item.file}:${item.line} [${item.label}] -> ${item.text}`);
  }
  process.exit(1);
}

main();