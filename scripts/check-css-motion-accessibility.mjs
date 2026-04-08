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
  const transitionAllHits = [];
  const infiniteAnimationHits = [];
  let reducedMotionBlocks = 0;

  for (const filePath of cssFiles) {
    const relPath = path.relative(ROOT, filePath).replaceAll(path.sep, '/');
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);

    lines.forEach((line, index) => {
      if (/\btransition\s*:\s*all(?:\s|;)/i.test(line)) {
        transitionAllHits.push(`${relPath}:${index + 1}`);
      }
      if (/\banimation\s*:[^;]*\binfinite\b/i.test(line)) {
        infiniteAnimationHits.push(`${relPath}:${index + 1}`);
      }
      if (/@media\s*\(prefers-reduced-motion\s*:\s*reduce\)/i.test(line)) {
        reducedMotionBlocks += 1;
      }
    });
  }

  console.log(`[check-css-motion-accessibility] transition-all: ${transitionAllHits.length}, infinite-animation: ${infiniteAnimationHits.length}, reduced-motion-blocks: ${reducedMotionBlocks}`);

  const failures = [];
  if (transitionAllHits.length > 0) {
    failures.push(`forbidden transition: all usage found at ${transitionAllHits.slice(0, 20).join(', ')}`);
  }
  if (infiniteAnimationHits.length > 0 && reducedMotionBlocks === 0) {
    failures.push('infinite animations exist but prefers-reduced-motion fallback is missing');
  }

  if (failures.length > 0) {
    console.error('[check-css-motion-accessibility] failed');
    failures.forEach((item) => console.error(`  - ${item}`));
    process.exit(1);
  }

  console.log('[check-css-motion-accessibility] OK');
}

main();
