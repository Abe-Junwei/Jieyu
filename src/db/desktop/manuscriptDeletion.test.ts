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
  const root = mkdtempSync(join(tmpdir(), 'jieyu-manuscript-delete-'));
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

describe('manuscript mark delete', () => {
  it('hides a deleted manuscript, blocks its text, and leaves another manuscript writable', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const media = callDesktopSession(session.sessionId, 'media.create', {
      relpath: 'a.wav',
      sha256: 'aa',
      duration: 8,
    }) as { id: string };
    const first = seed(session.sessionId, '文稿', media.id);
    const second = seed(session.sessionId, '另一份', media.id);
    const unit = callDesktopSession(session.sessionId, 'units.create', {
      layerId: first.layerId,
      startTime: 0,
      endTime: 1,
      text: 'keep',
    }) as { id: string };
    const other = callDesktopSession(session.sessionId, 'units.create', {
      layerId: second.layerId,
      startTime: 0,
      endTime: 1,
      text: 'stay',
    }) as { id: string };
    const deleted = callDesktopSession(session.sessionId, 'manuscripts.delete', {
      id: first.manuscriptId,
    }) as { deletedAt: string | null; lifecycleGeneration: number };
    expect(deleted.deletedAt).toEqual(expect.any(String));
    expect(deleted.lifecycleGeneration).toBe(1);
    expect(callDesktopSession(session.sessionId, 'manuscripts.list', {})).toEqual([
      expect.objectContaining({ id: second.manuscriptId, deletedAt: null }),
    ]);
    expect(callDesktopSession(session.sessionId, 'manuscripts.listDeleted', {})).toEqual([
      expect.objectContaining({ id: first.manuscriptId, lifecycleGeneration: 1 }),
    ]);
    expect(() =>
      callDesktopSession(session.sessionId, 'manuscripts.delete', { id: first.manuscriptId }),
    ).toThrow('manuscript is deleted');
    expect(() =>
      callDesktopSession(session.sessionId, 'units.updateText', { unitId: unit.id, text: 'gone' }),
    ).toThrow('manuscript is deleted');
    expect(callDesktopSession(session.sessionId, 'units.list', { layerId: first.layerId })).toEqual(
      [expect.objectContaining({ id: unit.id, text: 'keep' })],
    );
    expect(
      callDesktopSession(session.sessionId, 'units.updateText', { unitId: other.id, text: 'kept' }),
    ).toMatchObject({ text: 'kept' });
    resetDesktopSessions();
    const reopened = openDesktopSession(dir, [dir]);
    expect(callDesktopSession(reopened.sessionId, 'manuscripts.list', {})).toEqual([
      expect.objectContaining({ id: second.manuscriptId }),
    ]);
    expect(callDesktopSession(reopened.sessionId, 'manuscripts.listDeleted', {})).toEqual([
      expect.objectContaining({ id: first.manuscriptId, deletedAt: deleted.deletedAt }),
    ]);
  });

  it('refuses delete while a run is going, then makes that run stale across restore', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const seeded = seed(session.sessionId, '文稿');
    const running = start(session.sessionId, seeded);
    expect(() =>
      callDesktopSession(session.sessionId, 'manuscripts.delete', { id: seeded.manuscriptId }),
    ).toThrow('manuscript has a running task');
    expect(callDesktopSession(session.sessionId, 'manuscripts.list', {})).toEqual([
      expect.objectContaining({ id: seeded.manuscriptId, lifecycleGeneration: 0, deletedAt: null }),
    ]);
    callDesktopSession(session.sessionId, 'modelRuns.interrupt', {});
    expect(
      callDesktopSession(session.sessionId, 'modelRuns.get', { runId: running.id }),
    ).toMatchObject({ status: 'interrupted' });
    const run = callDesktopSession(session.sessionId, 'modelRuns.finish', {
      runId: start(session.sessionId, seeded).id,
      status: 'ok',
      chunkCount: 1,
    }) as { id: string };
    const preview = callDesktopSession(session.sessionId, 'modelRuns.preview', {
      runId: run.id,
      candidates: [{ chunkIndex: 0, segmentIndex: 0, mediaStart: 0, mediaEnd: 1 }],
    }) as { timeMappingRevision: number; candidates: { targetFingerprint: string }[] };
    const candidate = preview.candidates[0];
    if (candidate === undefined) throw new Error('preview missing');
    const deleted = callDesktopSession(session.sessionId, 'manuscripts.delete', {
      id: seeded.manuscriptId,
    }) as { lifecycleGeneration: number };
    expect(deleted.lifecycleGeneration).toBe(1);
    expect(() =>
      accept(session.sessionId, run.id, preview.timeMappingRevision, candidate.targetFingerprint),
    ).toThrow('transcription run is stale');
    const restored = callDesktopSession(session.sessionId, 'manuscripts.restore', {
      id: seeded.manuscriptId,
    }) as { deletedAt: string | null; lifecycleGeneration: number };
    expect(restored).toMatchObject({ deletedAt: null, lifecycleGeneration: 2 });
    expect(() =>
      callDesktopSession(session.sessionId, 'manuscripts.restore', { id: seeded.manuscriptId }),
    ).toThrow('manuscript is active');
    expect(() =>
      accept(session.sessionId, run.id, preview.timeMappingRevision, candidate.targetFingerprint),
    ).toThrow('transcription run is stale');
    const next = callDesktopSession(session.sessionId, 'modelRuns.finish', {
      runId: start(session.sessionId, seeded).id,
      status: 'ok',
      chunkCount: 1,
    }) as { id: string };
    const fresh = callDesktopSession(session.sessionId, 'modelRuns.preview', {
      runId: next.id,
      candidates: [{ chunkIndex: 1, segmentIndex: 0, mediaStart: 2, mediaEnd: 3 }],
    }) as { timeMappingRevision: number; candidates: { targetFingerprint: string }[] };
    const freshCandidate = fresh.candidates[0];
    if (freshCandidate === undefined) throw new Error('preview missing');
    expect(
      callDesktopSession(session.sessionId, 'modelRuns.accept', {
        operationId: 'op-new',
        runId: next.id,
        chunkIndex: 1,
        segmentIndex: 0,
        mediaStart: 2,
        mediaEnd: 3,
        timeMappingRevision: fresh.timeMappingRevision,
        targetFingerprint: freshCandidate.targetFingerprint,
        text: 'after',
      }),
    ).toMatchObject({ text: 'after' });
    const written = callDesktopSession(session.sessionId, 'units.create', {
      layerId: seeded.layerId,
      startTime: 4,
      endTime: 5,
      text: 'hand',
    }) as { id: string };
    expect(
      callDesktopSession(session.sessionId, 'units.updateText', {
        unitId: written.id,
        text: 'handed',
      }),
    ).toMatchObject({ text: 'handed' });
    expect(callDesktopSession(session.sessionId, 'manuscripts.list', {})).toEqual([
      expect.objectContaining({ id: seeded.manuscriptId, lifecycleGeneration: 2, deletedAt: null }),
    ]);
    resetDesktopSessions();
    const db = new Database(join(dir, 'project.sqlite'), { readonly: true });
    const row = db
      .prepare(
        'SELECT generation, lifecycle_generation AS lifecycleGeneration, deleted_at AS deletedAt FROM manuscripts WHERE id = ?',
      )
      .get(seeded.manuscriptId) as {
      generation: number;
      lifecycleGeneration: number;
      deletedAt: string | null;
    };
    db.close();
    expect(row).toEqual({ generation: 1, lifecycleGeneration: 2, deletedAt: null });
  });
});

function seed(
  sessionId: string,
  title: string,
  mediaId?: string,
): { manuscriptId: string; layerId: string } {
  const media =
    mediaId === undefined
      ? (callDesktopSession(sessionId, 'media.create', {
          relpath: 'a.wav',
          sha256: 'aa',
          duration: 8,
        }) as { id: string })
      : { id: mediaId };
  const manuscript = callDesktopSession(sessionId, 'manuscripts.create', {
    title: { zh: title },
    mediaId: media.id,
  }) as { id: string };
  const layer = callDesktopSession(sessionId, 'layers.create', {
    manuscriptId: manuscript.id,
    key: title,
    name: { zh: '转写' },
    tierType: 'time-aligned',
    contentType: 'transcription',
  }) as { id: string };
  return { manuscriptId: manuscript.id, layerId: layer.id };
}

function start(
  sessionId: string,
  seeded: { manuscriptId: string; layerId: string },
): { id: string; status: string } {
  return callDesktopSession(sessionId, 'modelRuns.start', {
    manuscriptId: seeded.manuscriptId,
    layerId: seeded.layerId,
    modelId: 'local.whisper',
    modelVersion: '1',
    manifestSha256: 'abc',
    params: {},
    rangeStart: 0,
    rangeEnd: 8,
  }) as { id: string; status: string };
}

function accept(
  sessionId: string,
  runId: string,
  timeMappingRevision: number,
  targetFingerprint: string,
): void {
  callDesktopSession(sessionId, 'modelRuns.accept', {
    operationId: 'op-old',
    runId,
    chunkIndex: 0,
    segmentIndex: 0,
    mediaStart: 0,
    mediaEnd: 1,
    timeMappingRevision,
    targetFingerprint,
    text: 'late',
  });
}
