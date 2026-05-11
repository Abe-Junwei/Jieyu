#!/usr/bin/env node
/**
 * Fails if ReadyWorkspace (or other pages) wire timeline **host** write APIs from `data.*`
 * (`useTranscriptionData`), which are undefined at runtime. See
 * docs/architecture/ReadyWorkspace-数据域与壳层装配边界.md
 */
import { spawnSync } from 'node:child_process';

/** Whole product tree; patterns are narrow enough to avoid fixtures noise. */
const roots = ['src'];
const patterns = [
  '(setSubSelectionRange|setDragPreview|zoomToPercent|zoomToUnit|setCtxMenu|reloadSegments):\\s*data\\.',
  '(reloadSegments|refreshSegmentUndoSnapshot|updateSegmentsLocally|layerAction|recordTimelineEdit):\\s*data\\.',
];

let found = false;
for (const pattern of patterns) {
  for (const root of roots) {
    const r = spawnSync('rg', ['-n', '--color', 'never', pattern, root], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (r.status === 0 && r.stdout.trim()) {
      found = true;
      process.stdout.write(r.stdout);
    } else if (r.status !== 1 && r.status !== 0) {
      process.stderr.write(r.stderr || `rg failed (${r.status})\n`);
      process.exit(2);
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
