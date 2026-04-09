import fs from 'node:fs';
import path from 'node:path';
import { collectUnusedSelectorStats } from './css-unused-selector-governance.mjs';

const ROOT = process.cwd();
const STYLES_DIR = path.join(ROOT, 'src', 'styles');
const SRC_DIR = path.join(ROOT, 'src');
const TESTS_DIR = path.join(ROOT, 'tests');
const BASELINE_PATH = path.join(ROOT, 'scripts', 'css-unused-selectors-baseline.json');
const args = new Set(process.argv.slice(2));
const writeBaseline = args.has('--write-baseline');

function readBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return { allowedUnused: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
    return {
      allowedUnused: Array.isArray(parsed?.allowedUnused) ? parsed.allowedUnused : [],
    };
  } catch {
    return { allowedUnused: [] };
  }
}

function writeBaselineFile(allowedUnused) {
  fs.writeFileSync(
    BASELINE_PATH,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), allowedUnused }, null, 2)}\n`,
    'utf8',
  );
}


function main() {
  const { cssClasses, usedClasses, unused } = collectUnusedSelectorStats({
    rootDir: ROOT,
    stylesDir: STYLES_DIR,
    sourceRoots: [SRC_DIR, TESTS_DIR],
  });

  if (writeBaseline) {
    writeBaselineFile(unused);
    console.log(`[check-css-unused-selectors] baseline written (${unused.length} allowed unused selectors)`);
    return;
  }

  const baseline = readBaseline();
  const allowed = new Set(baseline.allowedUnused);
  const regressions = unused.filter((className) => !allowed.has(className));

  console.log(`[check-css-unused-selectors] cssClasses=${cssClasses.length}, usedClasses=${usedClasses.size}, currentUnused=${unused.length}, regressions=${regressions.length}`);

  if (regressions.length > 0) {
    console.error('[check-css-unused-selectors] failed');
    regressions.slice(0, 120).forEach((className) => console.error(`  - ${className}`));
    process.exit(1);
  }

  console.log('[check-css-unused-selectors] OK');
}

main();
