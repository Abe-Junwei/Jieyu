#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const srcRoot = path.join(repoRoot, 'src');

const HOST_FILE = path.join(srcRoot, 'pages', 'TranscriptionTimelineWorkspaceHost.tsx');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const abs = path.join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) {
      out.push(...walk(abs));
      continue;
    }
    if (!abs.endsWith('.ts') && !abs.endsWith('.tsx')) continue;
    if (abs.includes('.test.') || abs.includes('.spec.')) continue;
    out.push(abs);
  }
  return out;
}

const files = walk(srcRoot);
const violations = [];

for (const file of files) {
  const content = readFileSync(file, 'utf8');
  const rel = path.relative(repoRoot, file);

  const horizontalRuntimeImport = /import\s*\{\s*TranscriptionTimelineHorizontalMediaLanes\s*\}\s*from\s*['\"][^'\"]*TranscriptionTimelineHorizontalMediaLanes['\"]/m.test(content);
  const horizontalRuntimeJsx = /<\s*TranscriptionTimelineHorizontalMediaLanes\b/m.test(content);
  if (file !== HOST_FILE && (horizontalRuntimeImport || horizontalRuntimeJsx)) {
    violations.push(`${rel}: only ${path.relative(repoRoot, HOST_FILE)} may reference TranscriptionTimelineHorizontalMediaLanes`);
  }

  if (/import\s*\{\s*TranscriptionTimelineTextOnly\s*\}/.test(content) || /<\s*TranscriptionTimelineTextOnly\b/.test(content)) {
    violations.push(`${rel}: legacy TranscriptionTimelineTextOnly runtime usage is forbidden`);
  }
}

if (violations.length > 0) {
  console.error('check-timeline-single-host-entry failed:');
  for (const line of violations) console.error(`- ${line}`);
  process.exit(1);
}

console.log('check-timeline-single-host-entry passed');
