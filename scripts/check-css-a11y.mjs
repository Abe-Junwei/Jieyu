import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const STYLES_DIR = path.join(ROOT, 'src', 'styles');

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

function main() {
  const cssFiles = walkFiles(STYLES_DIR, (p) => p.endsWith('.css'));
  let focusVisibleSelectors = 0;
  let focusSelectors = 0;
  const badFocusBlocks = [];

  for (const filePath of cssFiles) {
    const relPath = path.relative(ROOT, filePath).replaceAll(path.sep, '/');
    const content = fs.readFileSync(filePath, 'utf8');
    focusVisibleSelectors += (content.match(/:focus-visible/g) ?? []).length;
    focusSelectors += (content.match(/:focus(?!-visible)/g) ?? []).length;

    const blockRe = /([^{}]*:focus[^{}]*)\{([^{}]*)\}/g;
    let match;
    while ((match = blockRe.exec(content))) {
      const selector = match[1];
      const body = match[2];
      const removesOutline = /outline\s*:\s*none\s*;?/i.test(body);
      const hasAlternativeCue = /(box-shadow\s*:|border-color\s*:|outline\s*:\s*(?!none))/i.test(body);
      if (removesOutline && !hasAlternativeCue) {
        badFocusBlocks.push(`${relPath} :: ${selector.trim()}`);
      }
    }
  }

  console.log(`[check-css-a11y] :focus-visible=${focusVisibleSelectors}, :focus=${focusSelectors}, focus-outline-issues=${badFocusBlocks.length}`);

  const failures = [];
  if (focusVisibleSelectors === 0) {
    failures.push('no :focus-visible selectors found');
  }
  if (badFocusBlocks.length > 0) {
    failures.push(`focus blocks removing outline without replacement: ${badFocusBlocks.slice(0, 20).join(' | ')}`);
  }

  if (failures.length > 0) {
    console.error('[check-css-a11y] failed');
    failures.forEach((item) => console.error(`  - ${item}`));
    process.exit(1);
  }

  console.log('[check-css-a11y] OK');
}

main();
