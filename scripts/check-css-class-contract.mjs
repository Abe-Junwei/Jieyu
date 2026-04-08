import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const STYLES_DIR = path.join(ROOT, 'src', 'styles');
const SRC_DIR = path.join(ROOT, 'src');
const BASELINE_PATH = path.join(ROOT, 'scripts', 'css-class-contract-baseline.json');

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

function collectCssClasses() {
  const cssFiles = walkFiles(STYLES_DIR, (p) => p.endsWith('.css'));
  const classes = new Set();
  const classRe = /\.([_a-zA-Z]+[_a-zA-Z0-9-]*)/g;
  for (const filePath of cssFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    let match;
    while ((match = classRe.exec(content))) {
      classes.add(match[1]);
    }
  }
  return classes;
}

function collectLiteralClassNames() {
  const srcFiles = walkFiles(SRC_DIR, (p) => p.endsWith('.ts') || p.endsWith('.tsx'));
  const classUsage = new Map();
  const classAttrRe = /className\s*=\s*(?:"([^"]+)"|'([^']+)')/g;

  for (const filePath of srcFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    let match;
    while ((match = classAttrRe.exec(content))) {
      const raw = match[1] ?? match[2] ?? '';
      const tokens = raw.split(/\s+/).map((token) => token.trim()).filter(Boolean);
      for (const token of tokens) {
        if (!classUsage.has(token)) classUsage.set(token, new Set());
        classUsage.get(token).add(path.relative(ROOT, filePath));
      }
    }
  }
  return classUsage;
}

function readBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
    if (!parsed || !Array.isArray(parsed.allowedMissing)) return [];
    return parsed.allowedMissing.filter((item) => typeof item === 'string').sort();
  } catch {
    return [];
  }
}

function writeBaselineFile(allowedMissing) {
  const next = {
    generatedAt: new Date().toISOString(),
    allowedMissing,
  };
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
}

function main() {
  if (!fs.existsSync(STYLES_DIR) || !fs.existsSync(SRC_DIR)) {
    console.error('[check-css-class-contract] src/styles or src missing');
    process.exitCode = 1;
    return;
  }

  const cssClasses = collectCssClasses();
  const classUsage = collectLiteralClassNames();
  const missing = [...classUsage.keys()].filter((name) => !cssClasses.has(name)).sort();

  if (writeBaseline) {
    writeBaselineFile(missing);
    console.log(`[check-css-class-contract] baseline written (${missing.length} allowed missing)`);
    return;
  }

  const baseline = readBaseline();
  const baselineSet = new Set(baseline);
  const newMissing = missing.filter((name) => !baselineSet.has(name));
  const fixedFromBaseline = baseline.filter((name) => !missing.includes(name));

  console.log(`[check-css-class-contract] css classes: ${cssClasses.size}, className literals: ${classUsage.size}, unresolved: ${missing.length}`);

  if (fixedFromBaseline.length > 0) {
    console.log(`[check-css-class-contract] ${fixedFromBaseline.length} baseline entries are now resolved (can prune baseline)`);
  }

  if (newMissing.length === 0) {
    console.log('[check-css-class-contract] no new unresolved className literals');
    return;
  }

  console.error(`[check-css-class-contract] detected ${newMissing.length} new unresolved className literals`);
  for (const className of newMissing.slice(0, 80)) {
    const files = [...(classUsage.get(className) ?? [])].slice(0, 3).join(', ');
    console.error(`  - ${className}  (${files})`);
  }

  if (strict) {
    process.exitCode = 1;
  }
}

main();
