import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const STYLES_DIR = path.join(ROOT, 'src', 'styles');
const MATRIX_PATH = path.join(ROOT, 'scripts', 'css-browser-support-matrix.json');

/** 与 `ai-hub.css` 及 CSS 矩阵约定一致，便于全文检索与门禁 | Same probe as ai-hub.css + CSS matrix for grep + gate */
const BACKDROP_SUPPORTS_NOT_PROBE =
  '@supports not ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px)))';

const SUPPORTS_NOT_BACKDROP_FALLBACK = new RegExp(
  String.raw`@supports\s+not\s*\(\s*\(\s*-webkit-backdrop-filter:\s*blur\(1px\)\s*\)\s*or\s*\(\s*backdrop-filter:\s*blur\(1px\)\s*\)\s*\)`,
  'g',
);

function walkFiles(dirPath, matcher) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const nextPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(nextPath, matcher));
      continue;
    }
    if (entry.isFile() && matcher(nextPath)) files.push(nextPath);
  }
  return files.sort();
}

function readMatrix() {
  const raw = fs.readFileSync(MATRIX_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  return parsed?.features ?? {};
}

/**
 * 任意非 `none` 的 `backdrop-filter` / `-webkit-backdrop-filter`（含写在 `@supports` 正分支内的 blur）。
 * Any non-`none` backdrop-filter / -webkit-backdrop-filter (including blur inside positive @supports).
 */
function fileUsesBackdropFilterBeyondNone(content) {
  const decl = /(?:-webkit-)?backdrop-filter\s*:\s*([^;{}]+?)\s*(;|})/g;
  let m;
  while ((m = decl.exec(content)) !== null) {
    const v = m[1].trim().replace(/\s+/g, ' ');
    if (v.toLowerCase() !== 'none') return true;
  }
  return false;
}

function fileHasBackdropSupportsNotFallback(content) {
  return SUPPORTS_NOT_BACKDROP_FALLBACK.test(content);
}

function main() {
  if (!fs.existsSync(MATRIX_PATH)) {
    console.error('[check-css-compat] compatibility matrix missing: scripts/css-browser-support-matrix.json');
    process.exit(1);
  }

  const features = readMatrix();
  const requiredKeys = ['color-mix', 'field-sizing', 'backdrop-filter'];
  const missingKeys = requiredKeys.filter((key) => !features[key]);
  if (missingKeys.length > 0) {
    console.error(`[check-css-compat] compatibility matrix missing keys: ${missingKeys.join(', ')}`);
    process.exit(1);
  }

  const cssFiles = walkFiles(STYLES_DIR, (p) => p.endsWith('.css'));
  let colorMixCount = 0;
  let fieldSizingCount = 0;
  let backdropFilterCount = 0;
  /** 仍统计全局出现次数，便于趋势观察 | Global counts for trends */
  let backdropFallbackCount = 0;

  const backdropProbeViolations = [];

  for (const filePath of cssFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    colorMixCount += (content.match(/color-mix\(/g) ?? []).length;
    fieldSizingCount += (content.match(/field-sizing\s*:/g) ?? []).length;
    backdropFilterCount += (content.match(/(?:-webkit-)?backdrop-filter\s*:/g) ?? []).length;
    backdropFallbackCount += (content.match(SUPPORTS_NOT_BACKDROP_FALLBACK) ?? []).length;

    if (fileUsesBackdropFilterBeyondNone(content) && !fileHasBackdropSupportsNotFallback(content)) {
      backdropProbeViolations.push(path.relative(ROOT, filePath));
    }
  }

  console.log(
    `[check-css-compat] color-mix=${colorMixCount}, field-sizing=${fieldSizingCount}, backdrop-filter=${backdropFilterCount}, @supports-not-probe=${backdropFallbackCount}`,
  );

  if (backdropProbeViolations.length > 0) {
    console.error(
      '[check-css-compat] 以下文件含非 none 的 backdrop-filter，但缺少与矩阵一致的 `@supports not ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px)))` 降级块：',
    );
    for (const p of backdropProbeViolations) {
      console.error(`  - ${p}`);
    }
    console.error(`[check-css-compat] 探针字面量（可复制）: ${BACKDROP_SUPPORTS_NOT_PROBE}`);
    process.exit(1);
  }

  console.log('[check-css-compat] OK');
}

main();
