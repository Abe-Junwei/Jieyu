import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const STYLES_DIR = path.join(ROOT, 'src', 'styles');
const BASELINE_PATH = path.join(ROOT, 'scripts', 'css-token-usage-baseline.json');

const args = new Set(process.argv.slice(2));
const writeBaseline = args.has('--write-baseline');
const strict = !args.has('--no-strict');

const LINE_PATTERN = /(#([0-9a-fA-F]{3,8})\b|rgba?\()/g;
const ALLOW_RAW_COLOR_FILES = new Set(['src/styles/tokens.css']);

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

function readBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return { total: 0, files: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
    return {
      total: typeof parsed?.total === 'number' ? parsed.total : 0,
      files: parsed && typeof parsed.files === 'object' && parsed.files ? parsed.files : {},
    };
  } catch {
    return { total: 0, files: {} };
  }
}

function writeBaselineFile(total, fileCounts) {
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    total,
    files: Object.fromEntries(fileCounts),
  }, null, 2)}\n`, 'utf8');
}

function main() {
  const cssFiles = walkFiles(STYLES_DIR, (p) => p.endsWith('.css'));
  const fileCounts = new Map();
  let total = 0;

  for (const filePath of cssFiles) {
    const relPath = path.relative(ROOT, filePath).replaceAll(path.sep, '/');
    if (ALLOW_RAW_COLOR_FILES.has(relPath)) continue;

    const content = fs.readFileSync(filePath, 'utf8');
    let count = 0;
    for (const line of content.split(/\r?\n/)) {
      LINE_PATTERN.lastIndex = 0;
      count += (line.match(LINE_PATTERN) ?? []).length;
    }

    if (count > 0) {
      fileCounts.set(relPath, count);
      total += count;
    }
  }

  if (writeBaseline) {
    writeBaselineFile(total, fileCounts);
    console.log(`[check-css-token-usage] baseline written (total=${total}, files=${fileCounts.size})`);
    return;
  }

  const baseline = readBaseline();
  const failures = [];

  if (baseline.total > 0 && total > baseline.total) {
    failures.push(`total raw color usage increased: ${total} > baseline ${baseline.total}`);
  }

  for (const [file, count] of fileCounts.entries()) {
    const allowed = typeof baseline.files[file] === 'number' ? baseline.files[file] : 0;
    if (count > allowed) {
      failures.push(`${file}: ${count} > baseline ${allowed}`);
    }
  }

  const top = [...fileCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  console.log(`[check-css-token-usage] raw color matches (excluding tokens.css): ${total} across ${fileCounts.size} file(s)`);
  for (const [file, count] of top) {
    console.log(`  - ${file}: ${count}`);
  }

  if (failures.length === 0) {
    console.log('[check-css-token-usage] no regressions vs baseline');
    return;
  }

  console.error(`[check-css-token-usage] ${failures.length} regression(s) detected`);
  for (const item of failures.slice(0, 80)) {
    console.error(`  - ${item}`);
  }
  if (strict) process.exit(1);
}

main();
