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
mustContain(path.join('src', 'hooks', 'transcription', 'timelineUnitView.ts'), 'transcriptionUnitLaneReadScope');
const readyWorkspaceBodyPath = path.join('src', 'pages', 'TranscriptionPage.ReadyWorkspace.body.tsx');
const readyWorkspaceOrchestratorPath = path.join(
  'src',
  'pages',
  'TranscriptionPage.ReadyWorkspaceOrchestrator.tsx',
);
const bodyHasLane = readFileSync(path.join(repoRoot, readyWorkspaceBodyPath), 'utf8').includes(
  'transcriptionLaneReadScope',
);
const orchestratorHasLane = readFileSync(
  path.join(repoRoot, readyWorkspaceOrchestratorPath),
  'utf8',
).includes('transcriptionLaneReadScope');
if (!bodyHasLane && !orchestratorHasLane) {
  console.error(
    `check-transcription-lane-read-scope: expected "transcriptionLaneReadScope" in ${readyWorkspaceBodyPath} and/or ${readyWorkspaceOrchestratorPath}`,
  );
  process.exit(1);
}
mustContain(path.join('src', 'pages', 'useTranscriptionAiController.ts'), 'timelineUnitViewIndex');

console.log('check-transcription-lane-read-scope passed');
