import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { callDesktopSession } from '../desktopCall';
import { openDesktopSession, resetDesktopSessions, requireDesktopSession } from '../projectSession';
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
  return { call, media, manuscript, unit, layer, sessionId };
}
it('AUDIT split copy keeps its words visible through the production read API', () => {
  const { call, unit } = seed();
  const words = call('analysis.segmentWords', { unitId: unit.id }) as { id: string }[];
  call('lexicon.createLinkedEntry', { targetId: words[0]!.id, headword: 'word', translation: 'W' });
  const result = call('units.split', { unitId: unit.id, time: 1 }) as { right: { id: string } };
  expect(call('lexicon.listTokenLinks', { unitId: result.right.id })).toHaveLength(1);
});
it('AUDIT a deleted recording cannot acquire a new active manuscript', () => {
  const { call, media } = seed();
  call('media.delete', { id: media.id });
  expect(() => call('manuscripts.create', { mediaId: media.id, title: { und: 'new' } })).toThrow();
});
it('AUDIT deleting a note on a deleted manuscript is rejected', () => {
  const { call, unit, manuscript } = seed();
  const note = call('notes.create', {
    anchor: { kind: 'unit', unitId: unit.id },
    content: { und: 'retain' },
  }) as { id: string };
  call('manuscripts.delete', { id: manuscript.id });
  expect(() => call('notes.delete', { id: note.id })).toThrow();
});
it('AUDIT ordinary unit get excludes deleted manuscript text', () => {
  const { call, unit, manuscript } = seed();
  call('manuscripts.delete', { id: manuscript.id });
  expect(call('units.get', { id: unit.id })).toBeNull();
});

it('AUDIT accepting a different range than preview is rejected', () => {
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
  const preview = call('modelRuns.preview', {
    runId: run.id,
    candidates: [{ chunkIndex: 0, segmentIndex: 0, mediaStart: 2, mediaEnd: 3 }],
  }) as { timeMappingRevision: number; candidates: { targetFingerprint: string }[] };
  expect(() =>
    call('modelRuns.accept', {
      operationId: 'op',
      runId: run.id,
      chunkIndex: 0,
      segmentIndex: 0,
      mediaStart: 100,
      mediaEnd: 101,
      timeMappingRevision: preview.timeMappingRevision,
      targetFingerprint: preview.candidates[0]!.targetFingerprint,
      text: 'outside',
    }),
  ).toThrow();
});

it('AUDIT segmentWords rolls back graph when projection insert fails', () => {
  const { call, unit, sessionId } = seed();
  const db = requireDesktopSession(sessionId).db;
  db.exec(
    "CREATE TEMP TRIGGER audit_fail_token BEFORE INSERT ON tokens BEGIN SELECT RAISE(ABORT, 'audit injected token failure'); END",
  );
  expect(() => call('analysis.segmentWords', { unitId: unit.id })).toThrow(
    'audit injected token failure',
  );
  call('reopen', {});
  expect(call('analysis.readState', { unitId: unit.id })).toMatchObject({
    graph: null,
    analysisGeneration: 0,
    graphFingerprint: '',
  });
});
