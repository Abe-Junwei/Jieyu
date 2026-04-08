import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'src');
const BASELINE_PATH = path.join(ROOT, 'scripts', 'css-inline-style-baseline.json');

const args = new Set(process.argv.slice(2));
const writeBaseline = args.has('--write-baseline');
const strict = !args.has('--no-strict');

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

function shouldSkip(relPath) {
  return /\.(test|spec)\.[tj]sx?$/.test(relPath)
    || /[\\/]__tests__[\\/]/.test(relPath)
    || relPath.endsWith('.d.ts');
}

function readBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return { total: 0, files: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
    const files = parsed && typeof parsed.files === 'object' && parsed.files ? parsed.files : {};
    return {
      total: typeof parsed?.total === 'number' ? parsed.total : 0,
      files,
    };
  } catch {
    return { total: 0, files: {} };
  }
}

function writeBaselineFile(total, fileCounts) {
  const files = Object.fromEntries(fileCounts);
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    total,
    files,
  }, null, 2)}\n`, 'utf8');
}

function main() {
  const tsxFiles = walkFiles(SRC_DIR, (p) => p.endsWith('.tsx') || p.endsWith('.jsx'));
  const linePattern = /style\s*=\s*\{\{/g;

  let total = 0;
  const fileCounts = new Map();

  for (const filePath of tsxFiles) {
    const relPath = path.relative(ROOT, filePath).replaceAll(path.sep, '/');
    if (shouldSkip(relPath)) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    let count = 0;
    for (const line of content.split(/\r?\n/)) {
      linePattern.lastIndex = 0;
      count += (line.match(linePattern) ?? []).length;
    }
    if (count > 0) {
      fileCounts.set(relPath, count);
      total += count;
    }
  }

  if (writeBaseline) {
    writeBaselineFile(total, fileCounts);
    console.log(`[check-css-inline-style] baseline written (total=${total}, files=${fileCounts.size})`);
    return;
  }

  const baseline = readBaseline();
  const failures = [];

  if (baseline.total > 0 && total > baseline.total) {
    failures.push(`total inline style occurrences increased: ${total} > baseline ${baseline.total}`);
  }

  for (const [file, count] of fileCounts.entries()) {
    const allowed = typeof baseline.files[file] === 'number' ? baseline.files[file] : 0;
    if (count > allowed) {
      failures.push(`${file}: ${count} > baseline ${allowed}`);
    }
  }

  const top = [...fileCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  console.log(`[check-css-inline-style] total inline style occurrences: ${total} across ${fileCounts.size} file(s)`);
  for (const [file, count] of top) {
    console.log(`  - ${file}: ${count}`);
  }

  if (failures.length === 0) {
    console.log('[check-css-inline-style] no regressions vs baseline');
    return;
  }

  console.error(`[check-css-inline-style] ${failures.length} regression(s) detected`);
  for (const item of failures.slice(0, 60)) {
    console.error(`  - ${item}`);
  }
  if (strict) process.exit(1);
}

main();
