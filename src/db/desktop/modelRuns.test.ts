import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { releaseAllProjectLocks } from '../../desktop/skeleton/projectLock';
import { callDesktopSession } from './desktopCall';
import { openDesktopSession, resetDesktopSessions } from './projectSession';

const roots: string[] = [];

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-model-run-'));
  roots.push(root);
  writeFileSync(join(root, 'a.wav'), '');
  return root;
}

afterEach(() => {
  resetDesktopSessions();
  releaseAllProjectLocks();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('transcription run storage', () => {
  it('keeps a row for zero output, failure, and cancel', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const seeded = seed(session.sessionId);
    const zero = start(session.sessionId, seeded);
    expect(
      callDesktopSession(session.sessionId, 'modelRuns.finish', {
        runId: zero.id,
        status: 'ok',
        chunkCount: 0,
      }),
    ).toMatchObject({ status: 'ok', chunkCount: 0, pendingCount: 0, acceptedCount: 0 });
    const failed = start(session.sessionId, seeded);
    expect(
      callDesktopSession(session.sessionId, 'modelRuns.finish', {
        runId: failed.id,
        status: 'error',
        chunkCount: 1,
        errorCode: 'timeout',
      }),
    ).toMatchObject({ status: 'error', errorCode: 'timeout' });
    const cancelled = start(session.sessionId, seeded);
    expect(
      callDesktopSession(session.sessionId, 'modelRuns.finish', {
        runId: cancelled.id,
        status: 'cancelled',
        chunkCount: 1,
      }),
    ).toMatchObject({ status: 'cancelled', errorCode: null });
    resetDesktopSessions();
    const reopened = openDesktopSession(dir, [dir]);
    expect(
      callDesktopSession(reopened.sessionId, 'modelRuns.get', { runId: zero.id }),
    ).toMatchObject({
      id: zero.id,
      status: 'ok',
      chunkCount: 0,
    });
    expect(
      callDesktopSession(reopened.sessionId, 'modelRuns.get', { runId: failed.id }),
    ).toMatchObject({
      status: 'error',
    });
    expect(
      callDesktopSession(reopened.sessionId, 'modelRuns.get', { runId: cancelled.id }),
    ).toMatchObject({
      status: 'cancelled',
    });
  });

  it('accepts one preview, rejects a stale or repeated write, and reads the fact after reopen', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const seeded = seed(session.sessionId);
    callDesktopSession(session.sessionId, 'units.create', {
      layerId: seeded.layerId,
      startTime: 1,
      endTime: 2,
      text: 'next',
    });
    const beside = callDesktopSession(session.sessionId, 'units.create', {
      layerId: seeded.layerId,
      startTime: 10,
      endTime: 11,
      text: 'keep',
    }) as { id: string };
    callDesktopSession(session.sessionId, 'units.updateText', { unitId: beside.id, text: 'kept' });
    const run = finishOk(session.sessionId, start(session.sessionId, seeded).id);
    const preview = callDesktopSession(session.sessionId, 'modelRuns.preview', {
      runId: run.id,
      candidates: [{ chunkIndex: 0, segmentIndex: 0, mediaStart: 0, mediaEnd: 1 }],
    }) as {
      pendingCount: number;
      timeMappingRevision: number;
      candidates: { candidateId: string; targetFingerprint: string; occupied: boolean }[];
    };
    expect(preview).toMatchObject({
      pendingCount: 1,
      timeMappingRevision: 0,
      candidates: [{ candidateId: '0:0', occupied: false }],
    });
    const first = preview.candidates[0];
    if (first === undefined) throw new Error('preview missing');
    expect(
      callDesktopSession(session.sessionId, 'modelRuns.readAcceptance', { operationId: 'op-1' }),
    ).toBeNull();
    expect(() =>
      callDesktopSession(session.sessionId, 'modelRuns.accept', {
        operationId: 'op-wrong',
        runId: run.id,
        chunkIndex: 0,
        segmentIndex: 0,
        mediaStart: 0,
        mediaEnd: 1,
        timeMappingRevision: preview.timeMappingRevision,
        targetFingerprint: 'wrong',
        text: 'nope',
      }),
    ).toThrow('transcription preview is stale');
    const accepted = callDesktopSession(session.sessionId, 'modelRuns.accept', {
      operationId: 'op-1',
      runId: run.id,
      chunkIndex: 0,
      segmentIndex: 0,
      mediaStart: 0,
      mediaEnd: 1,
      timeMappingRevision: preview.timeMappingRevision,
      targetFingerprint: first.targetFingerprint,
      text: 'ka',
    }) as { unitId: string; text: string; modelRunId: string };
    expect(accepted).toMatchObject({ text: 'ka', modelRunId: run.id, startTime: 0, endTime: 1 });
    expect(() =>
      callDesktopSession(session.sessionId, 'modelRuns.accept', {
        operationId: 'op-2',
        runId: run.id,
        chunkIndex: 0,
        segmentIndex: 0,
        mediaStart: 0,
        mediaEnd: 1,
        timeMappingRevision: preview.timeMappingRevision,
        targetFingerprint: first.targetFingerprint,
        text: 'again',
      }),
    ).toThrow('transcription run has no pending candidate');
    const again = callDesktopSession(session.sessionId, 'modelRuns.preview', {
      runId: run.id,
      candidates: [{ chunkIndex: 0, segmentIndex: 0, mediaStart: 4, mediaEnd: 5 }],
    }) as { candidates: { targetFingerprint: string }[] };
    const againCandidate = again.candidates[0];
    if (againCandidate === undefined) throw new Error('preview missing');
    expect(() =>
      callDesktopSession(session.sessionId, 'modelRuns.accept', {
        operationId: 'op-2',
        runId: run.id,
        chunkIndex: 0,
        segmentIndex: 0,
        mediaStart: 4,
        mediaEnd: 5,
        timeMappingRevision: preview.timeMappingRevision,
        targetFingerprint: againCandidate.targetFingerprint,
        text: 'again',
      }),
    ).toThrow('transcription candidate is already accepted');
    expect(() =>
      callDesktopSession(session.sessionId, 'modelRuns.accept', {
        operationId: 'op-1',
        runId: run.id,
        chunkIndex: 3,
        segmentIndex: 0,
        mediaStart: 6,
        mediaEnd: 7,
        timeMappingRevision: preview.timeMappingRevision,
        targetFingerprint: againCandidate.targetFingerprint,
        text: 'other',
      }),
    ).toThrow('transcription operation is already used');
    expect(
      (
        callDesktopSession(session.sessionId, 'units.list', { layerId: seeded.layerId }) as {
          text: string;
        }[]
      ).map((unit) => unit.text),
    ).toEqual(['ka', 'next', 'kept']);
    const occupiedRun = finishOk(session.sessionId, start(session.sessionId, seeded).id);
    const occupied = callDesktopSession(session.sessionId, 'modelRuns.preview', {
      runId: occupiedRun.id,
      candidates: [{ chunkIndex: 0, segmentIndex: 1, mediaStart: 0.5, mediaEnd: 1.5 }],
    }) as { candidates: { targetFingerprint: string }[] };
    const occupiedCandidate = occupied.candidates[0];
    if (occupiedCandidate === undefined) throw new Error('preview missing');
    expect(() =>
      callDesktopSession(session.sessionId, 'modelRuns.accept', {
        operationId: 'op-occupied',
        runId: occupiedRun.id,
        chunkIndex: 0,
        segmentIndex: 1,
        mediaStart: 0.5,
        mediaEnd: 1.5,
        timeMappingRevision: 0,
        targetFingerprint: occupiedCandidate.targetFingerprint,
        text: 'over',
      }),
    ).toThrow('transcription target is occupied');
    const staleRun = finishOk(session.sessionId, start(session.sessionId, seeded).id);
    const stale = callDesktopSession(session.sessionId, 'modelRuns.preview', {
      runId: staleRun.id,
      candidates: [{ chunkIndex: 1, segmentIndex: 0, mediaStart: 6, mediaEnd: 8 }],
    }) as { timeMappingRevision: number; candidates: { targetFingerprint: string }[] };
    const staleCandidate = stale.candidates[0];
    if (staleCandidate === undefined) throw new Error('preview missing');
    callDesktopSession(session.sessionId, 'manuscripts.setTimeMapping', {
      manuscriptId: seeded.manuscriptId,
      expectedRevision: 0,
      offsetSec: 1,
      scale: 2,
    });
    expect(() =>
      callDesktopSession(session.sessionId, 'modelRuns.accept', {
        operationId: 'op-stale',
        runId: staleRun.id,
        chunkIndex: 1,
        segmentIndex: 0,
        mediaStart: 6,
        mediaEnd: 8,
        timeMappingRevision: stale.timeMappingRevision,
        targetFingerprint: staleCandidate.targetFingerprint,
        text: 'old',
      }),
    ).toThrow('transcription preview is stale');
    const fresh = callDesktopSession(session.sessionId, 'modelRuns.preview', {
      runId: staleRun.id,
      candidates: [{ chunkIndex: 1, segmentIndex: 0, mediaStart: 6, mediaEnd: 8 }],
    }) as {
      timeMappingRevision: number;
      candidates: { manuscriptStart: number; manuscriptEnd: number; targetFingerprint: string }[];
    };
    const freshCandidate = fresh.candidates[0];
    if (freshCandidate === undefined) throw new Error('preview missing');
    expect(freshCandidate).toMatchObject({ manuscriptStart: 2.5, manuscriptEnd: 3.5 });
    expect(
      callDesktopSession(session.sessionId, 'modelRuns.accept', {
        operationId: 'op-fresh',
        runId: staleRun.id,
        chunkIndex: 1,
        segmentIndex: 0,
        mediaStart: 6,
        mediaEnd: 8,
        timeMappingRevision: fresh.timeMappingRevision,
        targetFingerprint: freshCandidate.targetFingerprint,
        text: 'mapped',
      }),
    ).toMatchObject({ text: 'mapped', startTime: 2.5, endTime: 3.5 });
    resetDesktopSessions();
    const reopened = openDesktopSession(dir, [dir]);
    expect(
      callDesktopSession(reopened.sessionId, 'modelRuns.readAcceptance', { operationId: 'op-1' }),
    ).toMatchObject({ runId: run.id, candidateId: '0:0', text: 'ka', modelRunId: run.id });
    expect(
      callDesktopSession(reopened.sessionId, 'modelRuns.get', { runId: run.id }),
    ).toMatchObject({
      status: 'ok',
      acceptedCount: 1,
      pendingCount: 1,
    });
    expect(
      callDesktopSession(reopened.sessionId, 'modelRuns.readAcceptance', {
        operationId: 'op-missing',
      }),
    ).toBeNull();
  });

  it('moves an unfinished run to abandoned and leaves rejected untouched', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const seeded = seed(session.sessionId);
    const running = start(session.sessionId, seeded);
    callDesktopSession(session.sessionId, 'modelRuns.preview', {
      runId: running.id,
      candidates: [
        { chunkIndex: 0, segmentIndex: 0, mediaStart: 0, mediaEnd: 1 },
        { chunkIndex: 0, segmentIndex: 1, mediaStart: 1, mediaEnd: 2 },
      ],
    });
    expect(callDesktopSession(session.sessionId, 'modelRuns.interrupt', {})).toMatchObject([
      {
        id: running.id,
        status: 'interrupted',
        pendingCount: 0,
        abandonedCount: 2,
        rejectedCount: 0,
      },
    ]);
    expect(() =>
      callDesktopSession(session.sessionId, 'modelRuns.accept', {
        operationId: 'op-dead',
        runId: running.id,
        chunkIndex: 0,
        segmentIndex: 0,
        mediaStart: 0,
        mediaEnd: 1,
        timeMappingRevision: 0,
        targetFingerprint: 'none',
        text: 'gone',
      }),
    ).toThrow('transcription run is not acceptable');
    const closed = finishOk(session.sessionId, start(session.sessionId, seeded).id);
    callDesktopSession(session.sessionId, 'modelRuns.preview', {
      runId: closed.id,
      candidates: [{ chunkIndex: 0, segmentIndex: 0, mediaStart: 2, mediaEnd: 3 }],
    });
    expect(
      callDesktopSession(session.sessionId, 'modelRuns.abandon', { runId: closed.id }),
    ).toMatchObject({
      status: 'ok',
      pendingCount: 0,
      abandonedCount: 1,
      rejectedCount: 0,
    });
    expect(() =>
      callDesktopSession(session.sessionId, 'modelRuns.accept', {
        operationId: 'op-closed',
        runId: closed.id,
        chunkIndex: 0,
        segmentIndex: 0,
        mediaStart: 2,
        mediaEnd: 3,
        timeMappingRevision: 0,
        targetFingerprint: 'none',
        text: 'gone',
      }),
    ).toThrow('transcription run has no pending candidate');
  });

  it('rejects a run after the lifecycle generation changes and keeps the previous text', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const seeded = seed(session.sessionId);
    const run = finishOk(session.sessionId, start(session.sessionId, seeded).id);
    const preview = callDesktopSession(session.sessionId, 'modelRuns.preview', {
      runId: run.id,
      candidates: [{ chunkIndex: 2, segmentIndex: 0, mediaStart: 4, mediaEnd: 5 }],
    }) as { timeMappingRevision: number; candidates: { targetFingerprint: string }[] };
    const candidate = preview.candidates[0];
    if (candidate === undefined) throw new Error('preview missing');
    resetDesktopSessions();
    const db = new Database(join(dir, 'project.sqlite'));
    db.prepare(
      'UPDATE manuscripts SET lifecycle_generation = lifecycle_generation + 1 WHERE id = ?',
    ).run(seeded.manuscriptId);
    db.close();
    const reopened = openDesktopSession(dir, [dir]);
    expect(() =>
      callDesktopSession(reopened.sessionId, 'modelRuns.accept', {
        operationId: 'op-life',
        runId: run.id,
        chunkIndex: 2,
        segmentIndex: 0,
        mediaStart: 4,
        mediaEnd: 5,
        timeMappingRevision: preview.timeMappingRevision,
        targetFingerprint: candidate.targetFingerprint,
        text: 'late',
      }),
    ).toThrow('transcription run is stale');
    expect(
      callDesktopSession(reopened.sessionId, 'units.list', { layerId: seeded.layerId }),
    ).toEqual([]);
    expect(
      callDesktopSession(reopened.sessionId, 'modelRuns.readAcceptance', {
        operationId: 'op-life',
      }),
    ).toBeNull();
  });

  it('refuses a run from before deletion after restore, then accepts a new run', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const seeded = seed(session.sessionId);
    const run = finishOk(session.sessionId, start(session.sessionId, seeded).id);
    callDesktopSession(session.sessionId, 'modelRuns.preview', {
      runId: run.id,
      candidates: [{ chunkIndex: 0, segmentIndex: 0, mediaStart: 0, mediaEnd: 1 }],
    });
    callDesktopSession(session.sessionId, 'manuscripts.delete', { id: seeded.manuscriptId });
    callDesktopSession(session.sessionId, 'manuscripts.restore', { id: seeded.manuscriptId });
    expect(() =>
      callDesktopSession(session.sessionId, 'modelRuns.preview', {
        runId: run.id,
        candidates: [{ chunkIndex: 1, segmentIndex: 0, mediaStart: 1, mediaEnd: 2 }],
      }),
    ).toThrow('transcription run is stale');
    expect(() =>
      callDesktopSession(session.sessionId, 'modelRuns.abandon', { runId: run.id }),
    ).toThrow('transcription run is stale');
    expect(callDesktopSession(session.sessionId, 'modelRuns.get', { runId: run.id })).toMatchObject(
      {
        status: 'ok',
        pendingCount: 1,
        abandonedCount: 0,
      },
    );
    const next = finishOk(session.sessionId, start(session.sessionId, seeded).id);
    const preview = callDesktopSession(session.sessionId, 'modelRuns.preview', {
      runId: next.id,
      candidates: [{ chunkIndex: 0, segmentIndex: 0, mediaStart: 2, mediaEnd: 3 }],
    }) as { timeMappingRevision: number; candidates: { targetFingerprint: string }[] };
    const candidate = preview.candidates[0];
    if (candidate === undefined) throw new Error('preview missing');
    expect(
      callDesktopSession(session.sessionId, 'modelRuns.accept', {
        operationId: 'op-next',
        runId: next.id,
        chunkIndex: 0,
        segmentIndex: 0,
        mediaStart: 2,
        mediaEnd: 3,
        timeMappingRevision: preview.timeMappingRevision,
        targetFingerprint: candidate.targetFingerprint,
        text: 'next',
      }),
    ).toMatchObject({ text: 'next' });
  });

  it('refuses finish and preview when the lifecycle generation moves during a running task', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const seeded = seed(session.sessionId);
    const running = start(session.sessionId, seeded);
    resetDesktopSessions();
    const db = new Database(join(dir, 'project.sqlite'));
    db.prepare(
      'UPDATE manuscripts SET lifecycle_generation = lifecycle_generation + 1 WHERE id = ?',
    ).run(seeded.manuscriptId);
    db.close();
    const reopened = openDesktopSession(dir, [dir]);
    expect(() =>
      callDesktopSession(reopened.sessionId, 'modelRuns.finish', {
        runId: running.id,
        status: 'ok',
        chunkCount: 1,
      }),
    ).toThrow('transcription run is stale');
    expect(() =>
      callDesktopSession(reopened.sessionId, 'modelRuns.preview', {
        runId: running.id,
        candidates: [{ chunkIndex: 0, segmentIndex: 0, mediaStart: 0, mediaEnd: 1 }],
      }),
    ).toThrow('transcription run is stale');
    expect(
      callDesktopSession(reopened.sessionId, 'modelRuns.get', { runId: running.id }),
    ).toMatchObject({ status: 'running', pendingCount: 0, finishedAt: null });
  });
});

function seed(sessionId: string): { manuscriptId: string; layerId: string } {
  const media = callDesktopSession(sessionId, 'media.create', {
    relpath: 'a.wav',
    sha256: 'aa',
    duration: 8,
  }) as { id: string };
  const manuscript = callDesktopSession(sessionId, 'manuscripts.create', {
    title: { zh: '文稿' },
    mediaId: media.id,
  }) as { id: string };
  const layer = callDesktopSession(sessionId, 'layers.create', {
    manuscriptId: manuscript.id,
    key: 'tx',
    name: { zh: '转写' },
    tierType: 'time-aligned',
    contentType: 'transcription',
  }) as { id: string };
  return { manuscriptId: manuscript.id, layerId: layer.id };
}

function start(
  sessionId: string,
  seeded: { manuscriptId: string; layerId: string },
): { id: string } {
  return callDesktopSession(sessionId, 'modelRuns.start', {
    manuscriptId: seeded.manuscriptId,
    layerId: seeded.layerId,
    modelId: 'local.whisper',
    modelVersion: '1',
    manifestSha256: 'abc',
    params: { language: 'muya' },
    rangeStart: 0,
    rangeEnd: 8,
  }) as { id: string };
}

function finishOk(sessionId: string, runId: string): { id: string } {
  return callDesktopSession(sessionId, 'modelRuns.finish', {
    runId,
    status: 'ok',
    chunkCount: 1,
  }) as { id: string };
}
