import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, it, expect } from 'vitest';
import { callDesktopSession } from '../db/desktop/desktopCall';
import { requireDesktopSession } from '../db/desktop/projectSession';
import { transcribeProject, cancelProjectTranscription } from './projectTranscription';
import { seed, disposeModelFixtures } from '../test/desktopModelFixture';
afterEach(disposeModelFixtures);
it('returns real HTTP candidates without storing their text, then accepts and reads provenance after reopen', async () => {
  const s = await seed();
  const result = await transcribeProject(s.sessionId, {
    modelId: s.model.id,
    manuscriptId: s.manuscriptId,
    layerId: s.layerId,
    start: 0,
    end: 2,
    requestId: 'run-ok',
  });
  expect(result.status).toBe('ok');
  expect(result.candidates).toHaveLength(2);
  expect(callDesktopSession(s.sessionId, 'units.list', { layerId: s.layerId })).toEqual([]);
  const first = result.candidates[0]!;
  callDesktopSession(s.sessionId, 'modelRuns.accept', {
    operationId: 'flow-accept',
    runId: result.runId,
    chunkIndex: first.chunkIndex,
    segmentIndex: first.segmentIndex,
    mediaStart: first.mediaStart,
    mediaEnd: first.mediaEnd,
    timeMappingRevision: result.timeMappingRevision,
    targetFingerprint: first.targetFingerprint,
    text: first.text,
  });
  callDesktopSession(s.sessionId, 'reopen', {});
  expect(callDesktopSession(s.sessionId, 'units.list', { layerId: s.layerId })).toMatchObject([
    { text: 'mock candidate', startTime: 0, endTime: 1 },
  ]);
  expect(callDesktopSession(s.sessionId, 'modelRuns.get', { runId: result.runId })).toMatchObject({
    status: 'ok',
    acceptedCount: 1,
    pendingCount: 1,
    chunkCount: 2,
  });
  const text = requireDesktopSession(s.sessionId)
    .db.prepare('SELECT provenance_json FROM unit_texts')
    .get() as { provenance_json: string };
  expect(JSON.parse(text.provenance_json)).toMatchObject({
    params: { modelRunId: result.runId },
    reviewStatus: 'confirmed',
  });
});
it('cancels the HTTP request and leaves a cancelled run with no candidate text', async () => {
  let arrived!: () => void;
  const started = new Promise<void>((r) => (arrived = r));
  const s = await seed(() => arrived());
  const pending = transcribeProject(s.sessionId, {
    modelId: s.model.id,
    manuscriptId: s.manuscriptId,
    layerId: s.layerId,
    start: 0,
    end: 1,
    requestId: 'cancel',
  });
  await started;
  cancelProjectTranscription(s.sessionId, 'cancel');
  const result = await pending;
  expect(result.status).toBe('cancelled');
  expect(callDesktopSession(s.sessionId, 'modelRuns.get', { runId: result.runId })).toMatchObject({
    status: 'cancelled',
    pendingCount: 0,
  });
});
it.each(['mapping', 'text'])(
  'refuses fresh preview credentials after %s changes in flight',
  async (change) => {
    let release!: () => void;
    let arrived!: () => void;
    const started = new Promise<void>((r) => (arrived = r));
    const s = await seed((request, res) => {
      arrived();
      release = () =>
        res.end(
          JSON.stringify({
            jieyu: '1',
            requestId: request.requestId,
            status: 'ok',
            model: { id: 'org.example.mock', version: '1' },
            result: { segments: [{ start: 0, end: 1, text: 'late' }] },
          }),
        );
    });
    const pending = transcribeProject(s.sessionId, {
      modelId: s.model.id,
      manuscriptId: s.manuscriptId,
      layerId: s.layerId,
      start: 0,
      end: 1,
      requestId: 'stale',
    });
    await started;
    if (change === 'mapping') {
      callDesktopSession(s.sessionId, 'manuscripts.setTimeMapping', {
        manuscriptId: s.manuscriptId,
        expectedRevision: 0,
        offsetSec: 1,
        scale: 1,
      });
    } else {
      callDesktopSession(s.sessionId, 'units.create', {
        layerId: s.layerId,
        startTime: 0,
        endTime: 1,
        text: 'concurrent edit',
      });
    }
    release();
    const result = await pending;
    expect(result.status).toBe('error');
    expect(result.candidates).toEqual([]);
    expect(callDesktopSession(s.sessionId, 'units.list', { layerId: s.layerId })).toMatchObject(
      change === 'mapping' ? [] : [{ text: 'concurrent edit' }],
    );
  },
);

it('keeps successful zero-output and malformed-response facts without creating units', async () => {
  for (const mode of ['empty', 'bad']) {
    const s = await seed((request, response) =>
      response.end(
        mode === 'bad'
          ? 'invalid JSON'
          : JSON.stringify({
              jieyu: '1',
              requestId: request.requestId,
              status: 'ok',
              model: { id: 'org.example.mock', version: '1' },
              result: { segments: [] },
            }),
      ),
    );
    const result = await transcribeProject(s.sessionId, {
      modelId: s.model.id,
      manuscriptId: s.manuscriptId,
      layerId: s.layerId,
      start: 0,
      end: 1,
      requestId: mode,
    });
    expect(result.status).toBe(mode === 'empty' ? 'ok' : 'error');
    expect(result.candidates).toEqual([]);
    expect(callDesktopSession(s.sessionId, 'modelRuns.get', { runId: result.runId })).toMatchObject(
      { status: mode === 'empty' ? 'ok' : 'error', pendingCount: 0, acceptedCount: 0 },
    );
    expect(callDesktopSession(s.sessionId, 'units.list', { layerId: s.layerId })).toEqual([]);
  }
});

it('returns no candidate from a run stopped before manuscript deletion and restoration', async () => {
  let release!: () => void;
  let arrived!: () => void;
  const started = new Promise<void>((r) => (arrived = r));
  const s = await seed((request, response) => {
    arrived();
    release = () =>
      response.end(
        JSON.stringify({
          jieyu: '1',
          requestId: request.requestId,
          status: 'ok',
          model: { id: 'org.example.mock', version: '1' },
          result: { segments: [{ start: 0, end: 1, text: 'late deleted candidate' }] },
        }),
      );
  });
  const pending = transcribeProject(s.sessionId, {
    modelId: s.model.id,
    manuscriptId: s.manuscriptId,
    layerId: s.layerId,
    start: 0,
    end: 1,
    requestId: 'delete',
  });
  await started;
  callDesktopSession(s.sessionId, 'modelRuns.stopManuscript', { id: s.manuscriptId });
  callDesktopSession(s.sessionId, 'manuscripts.delete', { id: s.manuscriptId });
  callDesktopSession(s.sessionId, 'manuscripts.restore', { id: s.manuscriptId });
  release();
  const result = await pending;
  expect(result.status).toBe('interrupted');
  expect(result.candidates).toEqual([]);
  callDesktopSession(s.sessionId, 'reopen', {});
  expect(callDesktopSession(s.sessionId, 'modelRuns.get', { runId: result.runId })).toMatchObject({
    status: 'interrupted',
    pendingCount: 0,
  });
  expect(callDesktopSession(s.sessionId, 'units.list', { layerId: s.layerId })).toEqual([]);
});

it('records unreadable audio as a failed run without creating text', async () => {
  const s = await seed();
  const row = requireDesktopSession(s.sessionId).db.prepare('SELECT relpath FROM media').get() as {
    relpath: string;
  };
  rmSync(join(s.dir, row.relpath));
  const result = await transcribeProject(s.sessionId, {
    modelId: s.model.id,
    manuscriptId: s.manuscriptId,
    layerId: s.layerId,
    start: 0,
    end: 1,
    requestId: 'missing-audio',
  });
  expect(result.status).toBe('error');
  callDesktopSession(s.sessionId, 'reopen', {});
  expect(callDesktopSession(s.sessionId, 'modelRuns.get', { runId: result.runId })).toMatchObject({
    status: 'error',
    pendingCount: 0,
  });
  expect(callDesktopSession(s.sessionId, 'units.list', { layerId: s.layerId })).toEqual([]);
});

it('does not write a late response into a newly opened project', async () => {
  let release!: () => void;
  let arrived!: () => void;
  const started = new Promise<void>((resolve) => (arrived = resolve));
  const old = await seed((request, response) => {
    arrived();
    release = () =>
      response.end(
        JSON.stringify({
          jieyu: '1',
          requestId: request.requestId,
          status: 'ok',
          model: { id: 'org.example.mock', version: '1' },
          result: { segments: [{ start: 0, end: 1, text: 'old project' }] },
        }),
      );
  });
  const pending = transcribeProject(old.sessionId, {
    modelId: old.model.id,
    manuscriptId: old.manuscriptId,
    layerId: old.layerId,
    start: 0,
    end: 1,
    requestId: 'old-project',
  });
  const rejected = expect(pending).rejects.toThrow('project session expired');
  await started;
  const next = await seed();
  release();
  await rejected;
  expect(callDesktopSession(next.sessionId, 'units.list', { layerId: next.layerId })).toEqual([]);
  expect(
    requireDesktopSession(next.sessionId)
      .db.prepare('SELECT count(*) AS count FROM model_runs')
      .get(),
  ).toEqual({ count: 0 });
});

it('bounds candidate text across chunks and saves no partial preview on overflow', async () => {
  const s = await seed((request, response) =>
    response.end(
      JSON.stringify({
        jieyu: '1',
        requestId: request.requestId,
        status: 'ok',
        model: { id: 'org.example.mock', version: '1' },
        result: { segments: [{ start: 0, end: 1, text: 'x'.repeat(5 * 1024 * 1024) }] },
      }),
    ),
  );
  const result = await transcribeProject(s.sessionId, {
    modelId: s.model.id,
    manuscriptId: s.manuscriptId,
    layerId: s.layerId,
    start: 0,
    end: 2,
    requestId: 'overflow',
  });
  expect(result.status).toBe('error');
  expect(result.candidates).toEqual([]);
  expect(callDesktopSession(s.sessionId, 'modelRuns.get', { runId: result.runId })).toMatchObject({
    status: 'error',
    pendingCount: 0,
  });
  expect(callDesktopSession(s.sessionId, 'units.list', { layerId: s.layerId })).toEqual([]);
});
