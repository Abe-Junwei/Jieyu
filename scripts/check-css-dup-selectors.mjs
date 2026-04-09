import fs from 'node:fs';
import path from 'node:path';
import { collectDuplicateClassStats } from './css-duplicate-class-governance.mjs';

const ROOT = process.cwd();
const STYLES_DIR = path.join(ROOT, 'src', 'styles');
const BASELINE_PATH = path.join(ROOT, 'scripts', 'css-dup-selectors-baseline.json');

const args = new Set(process.argv.slice(2));
const writeBaseline = args.has('--write-baseline');
const strict = !args.has('--no-strict');

function readBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
    return Array.isArray(parsed?.allowedDuplicateClasses)
      ? parsed.allowedDuplicateClasses.filter((item) => typeof item === 'string').sort()
      : [];
  } catch {
    return [];
  }
}

function writeBaselineFile(duplicates) {
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    allowedDuplicateClasses: duplicates,
  }, null, 2)}\n`, 'utf8');
}

function main() {
  const { duplicateNames: duplicates, classMap } = collectDuplicateClassStats({
    rootDir: ROOT,
    stylesDir: STYLES_DIR,
  });

  if (writeBaseline) {
    writeBaselineFile(duplicates);
    console.log(`[check-css-dup-selectors] baseline written (${duplicates.length} root duplicate class names)`);
    return;
  }

  const allowed = new Set(readBaseline());
  const newDuplicates = duplicates.filter((name) => !allowed.has(name));

  console.log(`[check-css-dup-selectors] root duplicate class names across files: ${duplicates.length}`);
  const top = [...classMap.entries()]
    .filter(([, files]) => files.size > 1)
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 14);
  for (const [name, files] of top) {
    console.log(`  - ${name}: ${files.size} files`);
  }

  if (newDuplicates.length === 0) {
    console.log('[check-css-dup-selectors] no regressions vs baseline');
    return;
  }

  console.error(`[check-css-dup-selectors] ${newDuplicates.length} new duplicate class name(s) detected`);
  for (const className of newDuplicates.slice(0, 60)) {
    const files = [...(classMap.get(className) ?? [])].slice(0, 4).join(', ');
    console.error(`  - ${className} (${files})`);
  }

  if (strict) process.exit(1);
}

main();
