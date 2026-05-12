#!/usr/bin/env node
/**
 * Fails if ReadyWorkspace (or other pages) wire timeline **host** write APIs from `data.*`
 * (`useTranscriptionData`), which are undefined at runtime. See
 * docs/architecture/ReadyWorkspace-数据域与壳层装配边界.md
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

/** Whole product tree; patterns are narrow enough to avoid fixtures noise. */
const roots = ['src'];
const patterns = [
  /(setSubSelectionRange|setDragPreview|zoomToPercent|zoomToUnit|setCtxMenu|reloadSegments):\s*data\./,
  /(reloadSegments|refreshSegmentUndoSnapshot|updateSegmentsLocally|layerAction|recordTimelineEdit):\s*data\./,
];

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

function walk(dir) {
  const files = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
    const fullPath = join(dir, entry);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }
    const dot = entry.lastIndexOf('.');
    const ext = dot >= 0 ? entry.slice(dot) : '';
    if (SOURCE_EXTENSIONS.has(ext)) files.push(fullPath);
  }
  return files;
}

const repoRoot = process.cwd();
let found = false;

for (const root of roots) {
  const absRoot = join(repoRoot, root);
  for (const filePath of walk(absRoot)) {
    let content;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] ?? '';
      for (const pattern of patterns) {
        if (pattern.test(line)) {
          found = true;
          const rel = relative(repoRoot, filePath).replace(/\\/g, '/');
          process.stdout.write(`${rel}:${i + 1}:${line}\n`);
        }
      }
    }
  }
}

if (found) {
  process.stderr.write(
    '\n[audit-ready-workspace-timeline-host-from-data] Host timeline write APIs must not be sourced from `data.`; see docs/architecture/ReadyWorkspace-数据域与壳层装配边界.md\n',
  );
  process.exit(1);
}

process.stdout.write('[audit-ready-workspace-timeline-host-from-data] OK\n');
