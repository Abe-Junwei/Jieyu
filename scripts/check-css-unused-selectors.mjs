import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const STYLES_DIR = path.join(ROOT, 'src', 'styles');
const SRC_DIR = path.join(ROOT, 'src');
const BASELINE_PATH = path.join(ROOT, 'scripts', 'css-unused-selectors-baseline.json');
const args = new Set(process.argv.slice(2));
const writeBaseline = args.has('--write-baseline');

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
  return [...classes].sort();
}

function collectUsedClasses() {
  const srcFiles = walkFiles(SRC_DIR, (p) => /\.(ts|tsx|js|jsx)$/.test(p));
  const used = new Set();

  for (const filePath of srcFiles) {
    const content = fs.readFileSync(filePath, 'utf8');

    for (const match of content.matchAll(/className\s*=\s*(?:"([^"]+)"|'([^']+)')/g)) {
      const raw = match[1] ?? match[2] ?? '';
      raw.split(/\s+/).map((token) => token.trim()).filter(Boolean).forEach((token) => used.add(token));
    }

    for (const match of content.matchAll(/classList\.(?:add|remove|toggle)\(([^\)]*)\)/g)) {
      const raw = match[1] ?? '';
      for (const tokenMatch of raw.matchAll(/['"]([^'"]+)['"]/g)) {
        used.add(tokenMatch[1]);
      }
    }

    for (const match of content.matchAll(/querySelector(?:All)?\(([^\)]*)\)/g)) {
      const raw = match[1] ?? '';
      for (const tokenMatch of raw.matchAll(/['"]\.([A-Za-z_][A-Za-z0-9_-]*)['"]/g)) {
        used.add(tokenMatch[1]);
      }
    }
  }

  return used;
}

function isAutoAllowed(className) {
  return className.startsWith('is-')
    || className.startsWith('has-')
    || className === 'active'
    || className === 'primary'
    || className === 'secondary';
}

function main() {
  const cssClasses = collectCssClasses();
  const usedClasses = collectUsedClasses();
  const unused = cssClasses.filter((className) => !usedClasses.has(className) && !isAutoAllowed(className));

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
