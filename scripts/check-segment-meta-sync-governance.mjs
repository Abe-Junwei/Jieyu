import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const workspaceRoot = process.cwd();
const srcRoot = path.join(workspaceRoot, 'src');

const forbiddenPattern = /SegmentMetaService\.syncForUnitIds\([^)]*\)\.catch\(\(\)\s*=>\s*\{/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === 'node_modules') continue;
      walk(full, out);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry) || entry.endsWith('.test.ts') || entry.endsWith('.test.tsx')) {
      continue;
    }
    out.push(full);
  }
  return out;
}

const violations = [];
for (const file of walk(srcRoot)) {
  const content = readFileSync(file, 'utf8');
  if (forbiddenPattern.test(content)) {
    violations.push(path.relative(workspaceRoot, file));
  }
}

if (violations.length > 0) {
  console.error('[check-segment-meta-sync-governance] FAILED: empty catch on SegmentMetaService.syncForUnitIds');
  for (const file of violations) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

console.log('[check-segment-meta-sync-governance] OK');
