const fs = require('fs');
const css = fs.readFileSync('src/styles.css', 'utf8');
let depth = 0, lineNum = 0;
const lines = css.split('\n');
for (const line of lines) {
  lineNum++;
  for (const ch of line) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
  }
}
console.log('Final brace depth:', depth, '(should be 0)');

// Find imbalance region by scanning in chunks
let d2 = 0;
lineNum = 0;
for (const line of lines) {
  lineNum++;
  for (const ch of line) {
    if (ch === '{') d2++;
    else if (ch === '}') d2--;
  }
  if (d2 < 0) {
    console.log('Depth went negative at line:', lineNum, '->', line.trim());
    d2 = 0;
  }
}

// Show where unclosed blocks are (depth keeps rising)
d2 = 0;
let maxDepth = 0, maxLine = 0;
const highDepthLines = [];
lineNum = 0;
for (const line of lines) {
  lineNum++;
  for (const ch of line) {
    if (ch === '{') d2++;
    else if (ch === '}') d2--;
  }
  if (d2 > maxDepth) { maxDepth = d2; maxLine = lineNum; }
  if (d2 > 2) highDepthLines.push({ lineNum, depth: d2, line: line.trim().substring(0, 80) });
}
console.log('Max depth:', maxDepth, 'at line:', maxLine);
// Show first 20 high-depth lines
highDepthLines.slice(0, 20).forEach(x => console.log(`  L${x.lineNum} depth=${x.depth}: ${x.line}`));
