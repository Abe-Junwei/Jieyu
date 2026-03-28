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

function analyzeCssFile(filePath) {
  const css = fs.readFileSync(filePath, 'utf8');
  const lines = css.split('\n');
  let depth = 0;
  let maxDepth = 0;
  let maxLine = 0;
  const negatives = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const ch of line) {
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
    }
    if (depth < 0) {
      negatives.push({
        lineNum: index + 1,
        line: line.trim(),
      });
      depth = 0;
    }
    if (depth > maxDepth) {
      maxDepth = depth;
      maxLine = index + 1;
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
