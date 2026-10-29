import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { callDesktopSession } from '../desktopCall';
import { openDesktopSession, resetDesktopSessions } from '../projectSession';

const roots: string[] = [];
afterEach(() => {
  resetDesktopSessions();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function seed() {
  const folder = mkdtempSync(join(tmpdir(), 'jieyu-audit-life-'));
  roots.push(folder);
  writeFileSync(join(folder, 'a.wav'), '');
  const { sessionId } = openDesktopSession(folder, [folder]);
  const call = (method: string, args: unknown) => callDesktopSession(sessionId, method, args);
  const media = call('media.create', { relpath: 'a.wav', sha256: 'aa', duration: 4 }) as {
    id: string;
  };
  const manuscript = call('manuscripts.create', { mediaId: media.id, title: { und: 'M' } }) as {
    id: string;
  };
  const layer = call('layers.create', {
    manuscriptId: manuscript.id,
    key: 'tx',
    name: { und: 'T' },
    tierType: 'time-aligned',
    contentType: 'transcription',
  }) as { id: string };
  const unit = call('units.create', {
    layerId: layer.id,
    startTime: 0,
    endTime: 2,
    text: 'word',
  }) as { id: string };
  return { call, manuscript, unit, layer };
}

it('remaps morpheme surface token ids when a unit is split', () => {
  const { call, unit } = seed();
  call('units.updateText', { unitId: unit.id, text: 'pre-fix' });
  call('analysis.segmentWords', { unitId: unit.id });
  call('analysis.segmentMorphemes', { unitId: unit.id });
  const result = call('units.split', { unitId: unit.id, time: 1 }) as { right: { id: string } };
  call('reopen', {});
  expect(() => call('analysis.readState', { unitId: result.right.id })).not.toThrow();
});

it('rejects a preview outside the run range', () => {
  const { call, manuscript, layer } = seed();
  const run = call('modelRuns.start', {
    manuscriptId: manuscript.id,
    layerId: layer.id,
    modelId: 'm',
    modelVersion: '1',
    manifestSha256: 'x',
    params: {},
    rangeStart: 2,
    rangeEnd: 3,
  }) as { id: string };
  call('modelRuns.finish', { runId: run.id, status: 'ok', chunkCount: 1 });
  expect(() =>
    call('modelRuns.preview', {
      runId: run.id,
      candidates: [{ chunkIndex: 0, segmentIndex: 0, mediaStart: 3, mediaEnd: 4 }],
    }),
  ).toThrow('transcription range is outside the run');
  expect(() =>
    call('modelRuns.accept', {
      operationId: 'outside-run',
      runId: run.id,
      chunkIndex: 0,
      segmentIndex: 0,
      mediaStart: 3,
      mediaEnd: 4,
      timeMappingRevision: 0,
      targetFingerprint: 'none',
      text: 'outside-run',
    }),
  ).toThrow('transcription range is outside the run');
});

it('hides analysis text after the manuscript is deleted', () => {
  const { call, unit, manuscript } = seed();
  call('manuscripts.delete', { id: manuscript.id });
  expect(() => call('analysis.readState', { unitId: unit.id })).toThrow('manuscript is deleted');
});
