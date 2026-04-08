import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const STYLES_DIR = path.join(ROOT, 'src', 'styles');
const BASELINE_PATH = path.join(ROOT, 'scripts', 'css-dup-selectors-baseline.json');

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
  const cssFiles = walkFiles(STYLES_DIR, (p) => p.endsWith('.css'));
  const classMap = new Map();
  const classRe = /\.([_a-zA-Z]+[_a-zA-Z0-9-]*)/g;

  for (const filePath of cssFiles) {
    const relPath = path.relative(ROOT, filePath).replaceAll(path.sep, '/');
    const content = fs.readFileSync(filePath, 'utf8');
    const seenInFile = new Set();
    let match;
    while ((match = classRe.exec(content))) {
      const className = match[1];
      if (seenInFile.has(className)) continue;
      seenInFile.add(className);
      if (!classMap.has(className)) classMap.set(className, new Set());
      classMap.get(className).add(relPath);
    }
  }

  const duplicates = [...classMap.entries()]
    .filter(([, files]) => files.size > 1)
    .map(([className]) => className)
    .sort();

  if (writeBaseline) {
    writeBaselineFile(duplicates);
    console.log(`[check-css-dup-selectors] baseline written (${duplicates.length} duplicate class names)`);
    return;
  }

  const allowed = new Set(readBaseline());
  const newDuplicates = duplicates.filter((name) => !allowed.has(name));

  console.log(`[check-css-dup-selectors] duplicate class names across files: ${duplicates.length}`);
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
