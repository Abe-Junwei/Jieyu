import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const STYLES_DIR = path.join(ROOT, 'src', 'styles');
const BASELINE_PATH = path.join(ROOT, 'scripts', 'css-visual-baseline.json');
const args = new Set(process.argv.slice(2));
const writeBaselineMode = args.has('--write-baseline');

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

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function currentSnapshot() {
  const cssFiles = walkFiles(STYLES_DIR, (p) => p.endsWith('.css'));
  const fileHashes = {};
  for (const filePath of cssFiles) {
    const rel = path.relative(ROOT, filePath).replaceAll(path.sep, '/');
    const content = fs.readFileSync(filePath, 'utf8');
    fileHashes[rel] = sha256(content);
  }
  const aggregate = sha256(JSON.stringify(fileHashes));
  return { aggregate, fileHashes };
}

function readBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
}

function writeBaseline(snapshot) {
  fs.writeFileSync(
    BASELINE_PATH,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), ...snapshot }, null, 2)}\n`,
    'utf8',
  );
}

function main() {
  const snapshot = currentSnapshot();

  if (writeBaselineMode) {
    writeBaseline(snapshot);
    console.log(`[test-visual-css] baseline written (${Object.keys(snapshot.fileHashes).length} files)`);
    return;
  }

  const baseline = readBaseline();
  if (!baseline) {
    console.error('[test-visual-css] baseline missing, run with --write-baseline first');
    process.exit(1);
  }

  const failures = [];
  const before = baseline.fileHashes ?? {};
  const after = snapshot.fileHashes;

  for (const key of Object.keys(after)) {
    if (!(key in before)) failures.push(`new css file without baseline: ${key}`);
    else if (before[key] !== after[key]) failures.push(`css snapshot changed: ${key}`);
  }

  for (const key of Object.keys(before)) {
    if (!(key in after)) failures.push(`baseline file missing now: ${key}`);
  }

  console.log(`[test-visual-css] files=${Object.keys(after).length}, changes=${failures.length}`);

  if (failures.length > 0) {
    console.error('[test-visual-css] failed');
    failures.slice(0, 120).forEach((item) => console.error(`  - ${item}`));
    process.exit(1);
  }

  console.log('[test-visual-css] OK');
}

main();
