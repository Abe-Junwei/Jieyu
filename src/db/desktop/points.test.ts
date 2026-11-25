import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { callDesktopSession } from './desktopCall';
import {
  closeDesktopSession,
  openDesktopSession,
  requireDesktopSession,
  resetDesktopSessions,
} from './projectSession';

const roots: string[] = [];

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-points-'));
  roots.push(root);
  writeFileSync(join(root, 'a.wav'), '');
  return root;
}

afterEach(() => {
  resetDesktopSessions();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function seed(
  sessionId: string,
  opts: { media?: boolean; duration?: number } = {},
): { manuscriptId: string; pointLayerId: string; textLayerId: string } {
  const mediaId =
    opts.media === false
      ? null
      : (
          callDesktopSession(sessionId, 'media.create', {
            relpath: 'a.wav',
            sha256: 'aa',
            duration: opts.duration ?? 3,
          }) as { id: string }
        ).id;
  const manuscript = callDesktopSession(sessionId, 'manuscripts.create', {
    title: { zh: '文稿' },
    mediaId,
  }) as { id: string };
  const textLayer = callDesktopSession(sessionId, 'layers.create', {
    manuscriptId: manuscript.id,
    key: 'tx',
    name: { zh: '转写' },
    tierType: 'time-aligned',
    contentType: 'transcription',
  }) as { id: string };
  const pointLayer = callDesktopSession(sessionId, 'layers.create', {
    manuscriptId: manuscript.id,
    key: 'pt',
    name: { zh: '事件' },
    tierType: 'time-aligned',
    contentType: 'point',
  }) as { id: string };
  return { manuscriptId: manuscript.id, pointLayerId: pointLayer.id, textLayerId: textLayer.id };
}

describe('desktop points', () => {
  it('creates, lists, updates label, moves, deletes, and survives reopen', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const { manuscriptId, pointLayerId } = seed(session.sessionId);
    const created = callDesktopSession(session.sessionId, 'points.create', {
      id: 'point-1',
      layerId: pointLayerId,
      timeMs: 1200,
      label: 'clap',
    }) as { id: string; timeMs: number; label: string; layerId: string };
    expect(created).toMatchObject({
      id: 'point-1',
      layerId: pointLayerId,
      timeMs: 1200,
      label: 'clap',
    });
    expect(callDesktopSession(session.sessionId, 'points.list', { manuscriptId })).toEqual([
      expect.objectContaining({ id: 'point-1', timeMs: 1200, label: 'clap' }),
    ]);
    expect(
      callDesktopSession(session.sessionId, 'points.updateLabel', {
        id: 'point-1',
        label: 'door',
      }),
    ).toMatchObject({ id: 'point-1', label: 'door', timeMs: 1200 });
    expect(
      callDesktopSession(session.sessionId, 'points.move', { id: 'point-1', timeMs: 1800 }),
    ).toMatchObject({ id: 'point-1', timeMs: 1800, label: 'door' });
    closeDesktopSession(session.sessionId);
    const again = openDesktopSession(dir, [dir]);
    expect(callDesktopSession(again.sessionId, 'points.get', { id: 'point-1' })).toMatchObject({
      id: 'point-1',
      layerId: pointLayerId,
      timeMs: 1800,
      label: 'door',
    });
    expect(callDesktopSession(again.sessionId, 'points.delete', { id: 'point-1' })).toEqual({
      id: 'point-1',
    });
    expect(callDesktopSession(again.sessionId, 'points.get', { id: 'point-1' })).toBeNull();
    expect(callDesktopSession(again.sessionId, 'points.list', { layerId: pointLayerId })).toEqual(
      [],
    );
  });

  it('rejects same-layer duplicate times without changing either point', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const { pointLayerId } = seed(session.sessionId);
    callDesktopSession(session.sessionId, 'points.create', {
      id: 'a',
      layerId: pointLayerId,
      timeMs: 500,
      label: 'a',
    });
    callDesktopSession(session.sessionId, 'points.create', {
      id: 'b',
      layerId: pointLayerId,
      timeMs: 900,
      label: 'b',
    });
    expect(() =>
      callDesktopSession(session.sessionId, 'points.create', {
        layerId: pointLayerId,
        timeMs: 500,
        label: 'dup',
      }),
    ).toThrow('point time is taken');
    expect(() =>
      callDesktopSession(session.sessionId, 'points.move', { id: 'b', timeMs: 500 }),
    ).toThrow('point time is taken');
    expect(callDesktopSession(session.sessionId, 'points.list', { layerId: pointLayerId })).toEqual(
      [
        expect.objectContaining({ id: 'a', timeMs: 500, label: 'a' }),
        expect.objectContaining({ id: 'b', timeMs: 900, label: 'b' }),
      ],
    );
  });

  it('allows the same millisecond on another point layer', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const { manuscriptId, pointLayerId } = seed(session.sessionId);
    const other = callDesktopSession(session.sessionId, 'layers.create', {
      manuscriptId,
      key: 'pt2',
      name: { zh: '事件二' },
      tierType: 'time-aligned',
      contentType: 'point',
    }) as { id: string };
    callDesktopSession(session.sessionId, 'points.create', {
      layerId: pointLayerId,
      timeMs: 400,
      label: 'one',
    });
    expect(
      callDesktopSession(session.sessionId, 'points.create', {
        layerId: other.id,
        timeMs: 400,
        label: 'two',
      }),
    ).toMatchObject({ layerId: other.id, timeMs: 400, label: 'two' });
  });

  it('rejects non-integer times, non-point layers, deleted layers, and media bounds', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const { manuscriptId, pointLayerId, textLayerId } = seed(session.sessionId, {
      duration: 2,
    });
    expect(() =>
      callDesktopSession(session.sessionId, 'points.create', {
        layerId: pointLayerId,
        timeMs: -1,
      }),
    ).toThrow('whole millisecond');
    expect(() =>
      callDesktopSession(session.sessionId, 'points.create', {
        layerId: pointLayerId,
        timeMs: 1.5,
      }),
    ).toThrow('whole millisecond');
    expect(() =>
      callDesktopSession(session.sessionId, 'points.create', {
        layerId: textLayerId,
        timeMs: 100,
      }),
    ).toThrow('point layer is required');
    expect(() =>
      callDesktopSession(session.sessionId, 'points.create', {
        layerId: pointLayerId,
        timeMs: 2001,
      }),
    ).toThrow('point is outside the media');
    const atEdge = callDesktopSession(session.sessionId, 'points.create', {
      id: 'edge',
      layerId: pointLayerId,
      timeMs: 2000,
    }) as { id: string; timeMs: number };
    expect(atEdge.timeMs).toBe(2000);
    callDesktopSession(session.sessionId, 'layers.delete', {
      id: pointLayerId,
      mode: 'soft',
    });
    expect(() =>
      callDesktopSession(session.sessionId, 'points.create', {
        layerId: pointLayerId,
        timeMs: 100,
      }),
    ).toThrow('layer is deleted');
    expect(callDesktopSession(session.sessionId, 'points.list', { manuscriptId })).toEqual([]);
  });

  it('keeps existing points without media range checks after the recording is unlinked', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const { manuscriptId, pointLayerId } = seed(session.sessionId, { duration: 2 });
    callDesktopSession(session.sessionId, 'points.create', {
      id: 'keep',
      layerId: pointLayerId,
      timeMs: 1500,
      label: 'kept',
    });
    // Unlink media without soft-deleting the manuscript (ADR-0122).
    requireDesktopSession(session.sessionId)
      .db.prepare('UPDATE manuscripts SET media_id = NULL, updated_at = ? WHERE id = ?')
      .run(new Date().toISOString(), manuscriptId);
    expect(callDesktopSession(session.sessionId, 'points.get', { id: 'keep' })).toMatchObject({
      id: 'keep',
      timeMs: 1500,
      label: 'kept',
    });
    expect(
      callDesktopSession(session.sessionId, 'points.move', { id: 'keep', timeMs: 9000 }),
    ).toMatchObject({ id: 'keep', timeMs: 9000 });
    expect(
      callDesktopSession(session.sessionId, 'points.create', {
        id: 'later',
        layerId: pointLayerId,
        timeMs: 12000,
        label: 'new',
      }),
    ).toMatchObject({ id: 'later', timeMs: 12000 });
    expect(
      (
        callDesktopSession(session.sessionId, 'points.list', { manuscriptId }) as Array<{
          id: string;
        }>
      ).map((row) => row.id),
    ).toEqual(['keep', 'later']);
  });

  it('undoes and redoes create, label, move, and delete with the same identities', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const { manuscriptId, pointLayerId } = seed(session.sessionId);
    const created = callDesktopSession(session.sessionId, 'points.create', {
      id: 'p1',
      layerId: pointLayerId,
      timeMs: 300,
      label: 'a',
    }) as { id: string };
    callDesktopSession(session.sessionId, 'points.updateLabel', { id: 'p1', label: 'b' });
    callDesktopSession(session.sessionId, 'points.move', { id: 'p1', timeMs: 800 });
    callDesktopSession(session.sessionId, 'units.undo', { manuscriptId });
    expect(callDesktopSession(session.sessionId, 'points.get', { id: 'p1' })).toMatchObject({
      timeMs: 300,
      label: 'b',
    });
    callDesktopSession(session.sessionId, 'units.undo', { manuscriptId });
    expect(callDesktopSession(session.sessionId, 'points.get', { id: 'p1' })).toMatchObject({
      timeMs: 300,
      label: 'a',
    });
    callDesktopSession(session.sessionId, 'units.redo', { manuscriptId });
    expect(callDesktopSession(session.sessionId, 'points.get', { id: 'p1' })).toMatchObject({
      label: 'b',
    });
    callDesktopSession(session.sessionId, 'units.redo', { manuscriptId });
    expect(callDesktopSession(session.sessionId, 'points.get', { id: 'p1' })).toMatchObject({
      timeMs: 800,
      label: 'b',
    });
    callDesktopSession(session.sessionId, 'points.delete', { id: 'p1' });
    expect(callDesktopSession(session.sessionId, 'points.get', { id: 'p1' })).toBeNull();
    callDesktopSession(session.sessionId, 'units.undo', { manuscriptId });
    expect(callDesktopSession(session.sessionId, 'points.get', { id: 'p1' })).toMatchObject({
      id: created.id,
      timeMs: 800,
      label: 'b',
    });
    callDesktopSession(session.sessionId, 'units.redo', { manuscriptId });
    expect(callDesktopSession(session.sessionId, 'points.get', { id: 'p1' })).toBeNull();
  });

  it('rejects stale undo when the restored time is taken, and receipt retry keeps one point', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const { manuscriptId, pointLayerId } = seed(session.sessionId);
    callDesktopSession(session.sessionId, 'points.create', {
      id: 'first',
      layerId: pointLayerId,
      timeMs: 100,
      label: 'one',
    });
    callDesktopSession(session.sessionId, 'points.move', { id: 'first', timeMs: 200 });
    const now = new Date().toISOString();
    requireDesktopSession(session.sessionId)
      .db.prepare(
        `INSERT INTO points (id, layer_id, time_ms, label, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run('blocker', pointLayerId, 100, 'block', now, now);
    expect(() => callDesktopSession(session.sessionId, 'units.undo', { manuscriptId })).toThrow(
      /stale/,
    );
    expect(callDesktopSession(session.sessionId, 'points.get', { id: 'first' })).toMatchObject({
      timeMs: 200,
      label: 'one',
    });
    expect(callDesktopSession(session.sessionId, 'points.get', { id: 'blocker' })).toMatchObject({
      timeMs: 100,
    });

    const operationId = 'op-point-retry';
    const once = callDesktopSession(session.sessionId, 'points.create', {
      operationId,
      id: 'retry',
      layerId: pointLayerId,
      timeMs: 400,
      label: 'r',
    }) as { id: string };
    const again = callDesktopSession(session.sessionId, 'points.create', {
      operationId,
      id: 'retry',
      layerId: pointLayerId,
      timeMs: 400,
      label: 'r',
    }) as { id: string };
    expect(again).toEqual(once);
    expect(
      (
        callDesktopSession(session.sessionId, 'points.list', { layerId: pointLayerId }) as Array<{
          id: string;
        }>
      ).filter((row) => row.id === 'retry'),
    ).toHaveLength(1);
  });

  it('hides points while the layer is soft-deleted and restores them with the layer', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const { manuscriptId, pointLayerId } = seed(session.sessionId);
    callDesktopSession(session.sessionId, 'points.create', {
      id: 'soft-1',
      layerId: pointLayerId,
      timeMs: 250,
      label: 'clap',
    });
    callDesktopSession(session.sessionId, 'layers.delete', { id: pointLayerId, mode: 'soft' });
    expect(callDesktopSession(session.sessionId, 'points.list', { manuscriptId })).toEqual([]);
    expect(callDesktopSession(session.sessionId, 'points.get', { id: 'soft-1' })).toBeNull();
    callDesktopSession(session.sessionId, 'layers.restore', { id: pointLayerId });
    expect(callDesktopSession(session.sessionId, 'points.get', { id: 'soft-1' })).toMatchObject({
      timeMs: 250,
      label: 'clap',
      layerId: pointLayerId,
    });
  });

  it('retimes points with the manuscript and leaves unit text untouched', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const { manuscriptId, pointLayerId, textLayerId } = seed(session.sessionId);
    const unit = callDesktopSession(session.sessionId, 'units.create', {
      layerId: textLayerId,
      startMs: 0,
      endMs: 1000,
      text: '句',
    }) as { id: string; text: string };
    callDesktopSession(session.sessionId, 'points.create', {
      id: 'rt-1',
      layerId: pointLayerId,
      timeMs: 400,
      label: 'hit',
    });
    expect(
      callDesktopSession(session.sessionId, 'manuscripts.retime', {
        manuscriptId,
        offsetMs: 100,
        scale: 2,
      }),
    ).toMatchObject({ count: 2 });
    expect(callDesktopSession(session.sessionId, 'points.get', { id: 'rt-1' })).toMatchObject({
      timeMs: 900,
      label: 'hit',
    });
    expect(callDesktopSession(session.sessionId, 'units.get', { id: unit.id })).toMatchObject({
      startMs: 100,
      endMs: 2100,
      text: '句',
    });
    callDesktopSession(session.sessionId, 'units.undo', { manuscriptId });
    expect(callDesktopSession(session.sessionId, 'points.get', { id: 'rt-1' })).toMatchObject({
      timeMs: 400,
      label: 'hit',
    });
    expect(callDesktopSession(session.sessionId, 'units.get', { id: unit.id })).toMatchObject({
      startMs: 0,
      endMs: 1000,
      text: '句',
    });
  });

  it('rejects cross-manuscript layer queries and empty list filters', () => {
    const dir = folder();
    writeFileSync(join(dir, 'b.wav'), '');
    const session = openDesktopSession(dir, [dir]);
    const first = seed(session.sessionId);
    const mediaB = callDesktopSession(session.sessionId, 'media.create', {
      relpath: 'b.wav',
      sha256: 'bb',
      duration: 3,
    }) as { id: string };
    const manuscriptB = callDesktopSession(session.sessionId, 'manuscripts.create', {
      title: { zh: '另一稿' },
      mediaId: mediaB.id,
    }) as { id: string };
    callDesktopSession(session.sessionId, 'points.create', {
      layerId: first.pointLayerId,
      timeMs: 100,
    });
    expect(() =>
      callDesktopSession(session.sessionId, 'points.list', {
        manuscriptId: manuscriptB.id,
        layerId: first.pointLayerId,
      }),
    ).toThrow('point layer is outside the manuscript');
    expect(() => callDesktopSession(session.sessionId, 'points.list', {})).toThrow(
      'needs a manuscript or layer',
    );
  });
});
