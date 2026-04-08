import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const STYLES_DIR = path.join(ROOT, 'src', 'styles');
const BASELINE_PATH = path.join(ROOT, 'scripts', 'css-a11y-baseline.json');
const INTERACTIVE_HINT_RE = /(btn|button|toggle|link|tab|action|nav|close|delete|select|input)/i;
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
  if (!fs.existsSync(BASELINE_PATH)) {
    return {
      focusVisibleMin: 1,
      allowedBadFocusBlocks: [],
      allowedHoverWithoutFocus: [],
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
    return {
      focusVisibleMin: typeof parsed?.focusVisibleMin === 'number' ? parsed.focusVisibleMin : 1,
      allowedBadFocusBlocks: Array.isArray(parsed?.allowedBadFocusBlocks) ? parsed.allowedBadFocusBlocks : [],
      allowedHoverWithoutFocus: Array.isArray(parsed?.allowedHoverWithoutFocus) ? parsed.allowedHoverWithoutFocus : [],
    };
  } catch {
    return {
      focusVisibleMin: 1,
      allowedBadFocusBlocks: [],
      allowedHoverWithoutFocus: [],
    };
  }
}

function writeBaselineFile({ focusVisibleMin, allowedBadFocusBlocks, allowedHoverWithoutFocus }) {
  fs.writeFileSync(
    BASELINE_PATH,
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      focusVisibleMin,
      allowedBadFocusBlocks,
      allowedHoverWithoutFocus,
    }, null, 2)}\n`,
    'utf8',
  );
}

function main() {
  const cssFiles = walkFiles(STYLES_DIR, (p) => p.endsWith('.css'));
  let focusVisibleSelectors = 0;
  let focusSelectors = 0;
  const badFocusBlocks = [];
  const hoverWithoutFocus = [];

  for (const filePath of cssFiles) {
    const relPath = path.relative(ROOT, filePath).replaceAll(path.sep, '/');
    const content = fs.readFileSync(filePath, 'utf8');
    focusVisibleSelectors += (content.match(/:focus-visible/g) ?? []).length;
    focusSelectors += (content.match(/:focus(?!-visible)/g) ?? []).length;

    const blockRe = /([^{}]*:focus[^{}]*)\{([^{}]*)\}/g;
    let match;
    while ((match = blockRe.exec(content))) {
      const selector = match[1];
      const body = match[2];
      const removesOutline = /outline\s*:\s*none\s*;?/i.test(body);
      const hasAlternativeCue = /(box-shadow\s*:|border-color\s*:|outline\s*:\s*(?!none))/i.test(body);
      if (removesOutline && !hasAlternativeCue) {
        badFocusBlocks.push(`${relPath} :: ${selector.trim()}`);
      }
    }

    const selectorBlockRe = /([^{}]+)\{[^{}]*\}/g;
    let selectorBlock;
    while ((selectorBlock = selectorBlockRe.exec(content))) {
      const selectorText = selectorBlock[1].trim();
      if (!selectorText.includes(':hover')) continue;
      if (selectorText.startsWith('@')) continue;

      const classNames = [...selectorText.matchAll(/\.([_a-zA-Z]+[_a-zA-Z0-9-]*)/g)].map((item) => item[1]);
      if (classNames.length === 0) continue;
      if (!classNames.some((name) => INTERACTIVE_HINT_RE.test(name))) continue;

      const hasFocusPeer = classNames.some((name) => (
        content.includes(`.${name}:focus-visible`)
        || content.includes(`.${name}:focus`)
      ));

      if (!hasFocusPeer) {
        hoverWithoutFocus.push(`${relPath} :: ${selectorText}`);
      }
    }
  }

  const dedupedBadFocusBlocks = [...new Set(badFocusBlocks)].sort();
  const dedupedHoverWithoutFocus = [...new Set(hoverWithoutFocus)].sort();

  if (writeBaseline) {
    writeBaselineFile({
      focusVisibleMin: 1,
      allowedBadFocusBlocks: dedupedBadFocusBlocks,
      allowedHoverWithoutFocus: dedupedHoverWithoutFocus,
    });
    console.log(`[check-css-a11y] baseline written (badFocus=${dedupedBadFocusBlocks.length}, hoverWithoutFocus=${dedupedHoverWithoutFocus.length})`);
    return;
  }

  const baseline = readBaseline();
  const allowedBadFocusSet = new Set(baseline.allowedBadFocusBlocks);
  const allowedHoverWithoutFocusSet = new Set(baseline.allowedHoverWithoutFocus);

  const badFocusRegressions = dedupedBadFocusBlocks.filter((item) => !allowedBadFocusSet.has(item));
  const hoverWithoutFocusRegressions = dedupedHoverWithoutFocus.filter((item) => !allowedHoverWithoutFocusSet.has(item));

  console.log(`[check-css-a11y] :focus-visible=${focusVisibleSelectors}, :focus=${focusSelectors}, focus-outline-issues=${dedupedBadFocusBlocks.length}, hover-without-focus=${dedupedHoverWithoutFocus.length}, regressions=${badFocusRegressions.length + hoverWithoutFocusRegressions.length}`);

  const failures = [];
  if (focusVisibleSelectors < baseline.focusVisibleMin) {
    failures.push(`:focus-visible selectors below baseline minimum: ${focusVisibleSelectors} < ${baseline.focusVisibleMin}`);
  }
  if (badFocusRegressions.length > 0) {
    failures.push(`focus blocks removing outline without replacement (regressions): ${badFocusRegressions.slice(0, 20).join(' | ')}`);
  }
  if (hoverWithoutFocusRegressions.length > 0) {
    failures.push(`interactive hover selectors without focus peer (regressions): ${hoverWithoutFocusRegressions.slice(0, 20).join(' | ')}`);
  }

  if (failures.length > 0) {
    console.error('[check-css-a11y] failed');
    failures.forEach((item) => console.error(`  - ${item}`));
    if (strict) process.exit(1);
    return;
  }

  console.log('[check-css-a11y] no regressions vs baseline');
}

main();
