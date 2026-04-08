import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const STYLES_DIR = path.join(ROOT, 'src', 'styles');
const MATRIX_PATH = path.join(ROOT, 'scripts', 'css-browser-support-matrix.json');

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
  let backdropFallbackCount = 0;

  for (const filePath of cssFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    colorMixCount += (content.match(/color-mix\(/g) ?? []).length;
    fieldSizingCount += (content.match(/field-sizing\s*:/g) ?? []).length;
    backdropFilterCount += (content.match(/(?:-webkit-)?backdrop-filter\s*:/g) ?? []).length;
    backdropFallbackCount += (content.match(/@supports\s+not\s*\(\(-webkit-backdrop-filter:|@supports\s+not\s*\(\(backdrop-filter:/g) ?? []).length;
  }

  console.log(`[check-css-compat] color-mix=${colorMixCount}, field-sizing=${fieldSizingCount}, backdrop-filter=${backdropFilterCount}, backdrop-fallback=${backdropFallbackCount}`);

  if (backdropFilterCount > 0 && backdropFallbackCount === 0) {
    console.error('[check-css-compat] backdrop-filter is used but no @supports not fallback found');
    process.exit(1);
  }

  console.log('[check-css-compat] OK');
}

main();
