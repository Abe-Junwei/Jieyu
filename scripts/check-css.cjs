const fs = require('fs');
const path = require('path');

const stylesDir = path.join(process.cwd(), 'src', 'styles');

function listCssFiles(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const nextPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listCssFiles(nextPath));
      continue;
    }
    if (entry.isFile() && nextPath.endsWith('.css')) {
      files.push(nextPath);
    }
  }
  return files.sort();
}

/** Line number (1-based) for index in css */
function lineNumberAt(css, index) {
  let line = 1;
  for (let i = 0; i < index && i < css.length; i += 1) {
    if (css[i] === '\n') line += 1;
  }
  return line;
}

function lineSnippetAt(css, lineNum) {
  let line = 1;
  let start = 0;
  for (let i = 0; i <= css.length; i += 1) {
    if (i === css.length || css[i] === '\n') {
      if (line === lineNum) {
        return css.slice(start, i).trim();
      }
      line += 1;
      start = i + 1;
    }
  }
  return '';
}

/**
 * Brace depth scan that ignores `{` / `}` inside strings and comments (reduces false positives).
 */
function analyzeCssFile(filePath) {
  const css = fs.readFileSync(filePath, 'utf8');
  let depth = 0;
  let maxDepth = 0;
  let maxLine = 0;
  const negatives = [];

  let state = 'normal';
  let escaped = false;

  for (let index = 0; index < css.length; index += 1) {
    const ch = css[index];
    const next = css[index + 1] ?? '';

    if (state === 'line-comment') {
      if (ch === '\n') state = 'normal';
      continue;
    }

    if (state === 'block-comment') {
      if (ch === '*' && next === '/') {
        state = 'normal';
        index += 1;
      }
      continue;
    }

    if (state === 'single-quote' || state === 'double-quote') {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (state === 'single-quote' && ch === "'") {
        state = 'normal';
        continue;
      }
      if (state === 'double-quote' && ch === '"') {
        state = 'normal';
        continue;
      }
      continue;
    }

    if (ch === '/' && next === '/') {
      state = 'line-comment';
      index += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      state = 'block-comment';
      index += 1;
      continue;
    }
    if (ch === "'") {
      state = 'single-quote';
      escaped = false;
      continue;
    }
    if (ch === '"') {
      state = 'double-quote';
      escaped = false;
      continue;
    }

    if (ch === '{') {
      depth += 1;
      const ln = lineNumberAt(css, index);
      if (depth > maxDepth) {
        maxDepth = depth;
        maxLine = ln;
      }
      continue;
    }
    if (ch === '}') {
      depth -= 1;
      if (depth < 0) {
        const ln = lineNumberAt(css, index);
        negatives.push({
          lineNum: ln,
          line: lineSnippetAt(css, ln),
        });
        depth = 0;
      }
    }
  }

  return {
    filePath,
    finalDepth: depth,
    maxDepth,
    maxLine,
    negatives,
  };
}

function main() {
  if (!fs.existsSync(stylesDir)) {
    console.error(`[check-css] styles directory not found: ${stylesDir}`);
    process.exitCode = 1;
    return;
  }

  const cssFiles = listCssFiles(stylesDir);
  if (cssFiles.length === 0) {
    console.log('[check-css] No CSS files found under src/styles');
    return;
  }

  const failures = [];
  console.log(`[check-css] Checking ${cssFiles.length} CSS files under src/styles`);

  for (const filePath of cssFiles) {
    const result = analyzeCssFile(filePath);
    const relativePath = path.relative(process.cwd(), result.filePath);
    if (result.finalDepth === 0 && result.negatives.length === 0) {
      console.log(`[OK] ${relativePath} (maxDepth=${result.maxDepth} @ L${result.maxLine || 1})`);
      continue;
    }

    failures.push(result);
    console.error(`[FAIL] ${relativePath} (finalDepth=${result.finalDepth}, maxDepth=${result.maxDepth} @ L${result.maxLine || 1})`);
    for (const negative of result.negatives.slice(0, 5)) {
      console.error(`  negative depth at L${negative.lineNum}: ${negative.line}`);
    }
  }

  if (failures.length > 0) {
    console.error(`[check-css] ${failures.length} file(s) failed brace balance check`);
    process.exitCode = 1;
    return;
  }

  console.log('[check-css] All CSS files passed brace balance check');
}

main();
