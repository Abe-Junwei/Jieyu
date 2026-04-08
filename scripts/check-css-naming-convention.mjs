import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const STYLES_DIR = path.join(ROOT, 'src', 'styles');
const BASELINE_PATH = path.join(ROOT, 'scripts', 'css-naming-convention-baseline.json');
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
  if (!fs.existsSync(BASELINE_PATH)) return { allowNoPnlRootFiles: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
    return {
      allowNoPnlRootFiles: Array.isArray(parsed?.allowNoPnlRootFiles) ? parsed.allowNoPnlRootFiles : [],
    };
  } catch {
    return { allowNoPnlRootFiles: [] };
  }
}

function writeBaselineFile(allowNoPnlRootFiles) {
  fs.writeFileSync(
    BASELINE_PATH,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), allowNoPnlRootFiles }, null, 2)}\n`,
    'utf8',
  );
}

function extractClasses(content) {
  const classes = new Set();
  const classRe = /\.([_a-zA-Z]+[_a-zA-Z0-9-]*)/g;
  let match;
  while ((match = classRe.exec(content))) {
    classes.add(match[1]);
  }
  return [...classes];
}

function main() {
  const cssFiles = walkFiles(STYLES_DIR, (p) => p.endsWith('.css'));
  const invalidClassNames = [];
  const noPnlRootFiles = [];

  const classPattern = /^[a-z][a-z0-9-]*(?:__(?:[a-z0-9-]+))?(?:--(?:[a-z0-9-]+))?$/;
  const pnlRootPattern = /^pnl-[a-z0-9-]+-(?:panel|dialog)$/;

  for (const filePath of cssFiles) {
    const relPath = path.relative(ROOT, filePath).replaceAll(path.sep, '/');
    const content = fs.readFileSync(filePath, 'utf8');
    const classes = extractClasses(content);

    for (const className of classes) {
      if (!classPattern.test(className)) {
        invalidClassNames.push(`${relPath}:${className}`);
      }
    }

    if (/src\/styles\/panels\/.*-(panel|dialog)\.css$/.test(relPath)) {
      const hasPnlRoot = classes.some((name) => pnlRootPattern.test(name));
      if (!hasPnlRoot) noPnlRootFiles.push(relPath);
    }
  }

  if (writeBaseline) {
    writeBaselineFile(noPnlRootFiles);
    console.log(`[check-css-naming-convention] baseline written (${noPnlRootFiles.length} files without pnl root)`);
    return;
  }

  const baseline = readBaseline();
  const allowedNoPnlRoot = new Set(baseline.allowNoPnlRootFiles);
  const newNoPnlRootViolations = noPnlRootFiles.filter((file) => !allowedNoPnlRoot.has(file));

  console.log(`[check-css-naming-convention] invalidClassNames=${invalidClassNames.length}, panelFilesWithoutPnlRoot=${noPnlRootFiles.length}`);

  const failures = [];
  if (invalidClassNames.length > 0) {
    failures.push(`invalid class names: ${invalidClassNames.slice(0, 20).join(', ')}`);
  }
  if (newNoPnlRootViolations.length > 0) {
    failures.push(`new panel/dialog files without pnl root: ${newNoPnlRootViolations.join(', ')}`);
  }

  if (failures.length > 0) {
    console.error('[check-css-naming-convention] failed');
    failures.forEach((item) => console.error(`  - ${item}`));
    process.exit(1);
  }

  console.log('[check-css-naming-convention] OK');
}

main();
