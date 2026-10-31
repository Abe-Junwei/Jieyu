import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { releaseAllProjectLocks } from '../../desktop/skeleton/projectLock';
import { callDesktopSession } from './desktopCall';
import { openDesktopSession, requireDesktopSession, resetDesktopSessions } from './projectSession';

const roots: string[] = [];

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-delete-preview-'));
  roots.push(root);
  writeFileSync(join(root, 'a.wav'), '');
  writeFileSync(join(root, 'b.wav'), '');
  return root;
}

afterEach(() => {
  resetDesktopSessions();
  releaseAllProjectLocks();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('delete impact preview', () => {
  it('lists the recording and the manuscripts it would mark, without writing', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const early = seed(session.sessionId, '较早');
    const current = seed(session.sessionId, '当前', early.mediaId);
    const otherMedia = callDesktopSession(session.sessionId, 'media.create', {
      relpath: 'b.wav',
      sha256: 'bb',
      duration: 8,
    }) as { id: string };
    const other = seed(session.sessionId, '别的', otherMedia.id);
    callDesktopSession(session.sessionId, 'manuscripts.delete', { id: early.manuscriptId });
    const before = cycles(session.sessionId);

    expect(
      callDesktopSession(session.sessionId, 'manuscripts.previewDelete', {
        id: current.manuscriptId,
      }),
    ).toEqual({
      id: current.manuscriptId,
      title: { zh: '当前' },
      mediaId: early.mediaId,
      mediaRelpath: 'a.wav',
      alreadyDeleted: false,
      running: false,
    });
    const recording = callDesktopSession(session.sessionId, 'media.previewDelete', {
      id: early.mediaId,
    }) as {
      id: string;
      relpath: string;
      alreadyDeleted: boolean;
      running: boolean;
      manuscripts: {
        id: string;
        title: { zh: string };
        alreadyDeleted: boolean;
        retainUntil: string | null;
      }[];
    };
    expect(recording).toMatchObject({
      id: early.mediaId,
      relpath: 'a.wav',
      alreadyDeleted: false,
      running: false,
    });
    expect(recording.manuscripts).toHaveLength(2);
    expect(recording.manuscripts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: early.manuscriptId,
          title: { zh: '较早' },
          alreadyDeleted: true,
          retainUntil: expect.any(String),
        }),
        {
          id: current.manuscriptId,
          title: { zh: '当前' },
          alreadyDeleted: false,
          retainUntil: null,
        },
      ]),
    );
    expect(recording.manuscripts.map((row) => row.id)).not.toContain(other.manuscriptId);
    expect(cycles(session.sessionId)).toEqual(before);
    expect(callDesktopSession(session.sessionId, 'manuscripts.list', {})).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: current.manuscriptId, deletedAt: null }),
        expect.objectContaining({ id: other.manuscriptId, deletedAt: null }),
      ]),
    );
    expect(() =>
      callDesktopSession(session.sessionId, 'manuscripts.previewDelete', { id: 'missing' }),
    ).toThrow('manuscript is missing');
    expect(() =>
      callDesktopSession(session.sessionId, 'media.previewDelete', { id: 'missing' }),
    ).toThrow('media is missing');
  });

  it('reports a running transcription on the manuscript and on its recording', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const seeded = seed(session.sessionId, '文稿');
    callDesktopSession(session.sessionId, 'modelRuns.start', {
      manuscriptId: seeded.manuscriptId,
      layerId: seeded.layerId,
      modelId: 'local.whisper',
      modelVersion: '1',
      manifestSha256: 'abc',
      params: {},
      rangeStart: 0,
      rangeEnd: 8,
    });
    expect(
      callDesktopSession(session.sessionId, 'manuscripts.previewDelete', {
        id: seeded.manuscriptId,
      }),
    ).toMatchObject({ running: true, alreadyDeleted: false });
    expect(
      callDesktopSession(session.sessionId, 'media.previewDelete', { id: seeded.mediaId }),
    ).toMatchObject({ running: true, manuscripts: [{ id: seeded.manuscriptId }] });
    expect(callDesktopSession(session.sessionId, 'manuscripts.list', {})).toEqual([
      expect.objectContaining({ id: seeded.manuscriptId, deletedAt: null }),
    ]);
  });
});

function seed(
  sessionId: string,
  title: string,
  mediaId?: string,
): { manuscriptId: string; layerId: string; mediaId: string } {
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
  return { manuscriptId: manuscript.id, layerId: layer.id, mediaId: media.id };
}

function cycles(sessionId: string): unknown {
  return requireDesktopSession(sessionId)
    .db.prepare(
      `SELECT id, deleted_at AS deletedAt, retain_until AS retainUntil,
              reminder_shown_at AS reminderShownAt
       FROM manuscripts ORDER BY id`,
    )
    .all();
}
