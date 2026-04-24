#!/usr/bin/env node
/**
 * Regression guard for ADR 0020: canonical transcription lane read scope must stay wired
 * through the timeline index + vertical paired-reading resolver.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

function mustContain(relPath, needle) {
  const abs = path.join(repoRoot, relPath);
  const text = readFileSync(abs, 'utf8');
  if (!text.includes(needle)) {
    console.error(`check-transcription-lane-read-scope: ${relPath} must contain substring:\n  ${needle}`);
    process.exit(1);
  }
}

mustContain(
  path.join('src', 'components', 'transcriptionTimelineVerticalViewHelpers.tsx'),
  'resolveCanonicalUnitForTranscriptionLaneRow',
);
mustContain(path.join('src', 'hooks', 'timelineUnitView.ts'), 'transcriptionUnitLaneReadScope');
mustContain(
  path.join('src', 'pages', 'TranscriptionPage.ReadyWorkspace.tsx'),
  'transcriptionLaneReadScope',
);
mustContain(path.join('src', 'pages', 'useTranscriptionAiController.ts'), 'timelineUnitViewIndex');

console.log('check-transcription-lane-read-scope passed');
