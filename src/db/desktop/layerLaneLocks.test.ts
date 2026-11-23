import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { callDesktopSession } from './desktopCall';
import { clearLaneLocks, listLaneLocks, replaceLaneLocks } from './layerLaneLocks';
import {
  closeDesktopSession,
  openDesktopSession,
  requireDesktopSession,
  resetDesktopSessions,
} from './projectSession';

const roots: string[] = [];

function open() {
  const dir = mkdtempSync(join(tmpdir(), 'jieyu-lane-locks-'));
  roots.push(dir);
  writeFileSync(join(dir, 'a.wav'), '');
  return { dir, session: openDesktopSession(dir, [dir]) };
}

afterEach(() => {
  resetDesktopSessions();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('lane locks', () => {
  it('replaces a layer in one transaction and reads the same rows after reopen', () => {
    const { dir, session } = open();
    const layerId = layer(session.sessionId);
    const ada = speaker(session.sessionId, '阿达');
    const bai = speaker(session.sessionId, '白玛');
    const db = requireDesktopSession(session.sessionId).db;
    replaceLaneLocks(db, {
      layerId,
      locks: [
        { speakerId: ada, laneIndex: 0 },
        { speakerId: bai, laneIndex: 1 },
      ],
    });
    expect(() =>
      replaceLaneLocks(db, {
        layerId,
        locks: [
          { speakerId: ada, laneIndex: 1 },
          { speakerId: bai, laneIndex: 1 },
        ],
      }),
    ).toThrow('lane index repeats');
    expect(() =>
      replaceLaneLocks(db, { layerId, locks: [{ speakerId: 'missing', laneIndex: 2 }] }),
    ).toThrow('speaker is missing');
    expect(listLaneLocks(db, layerId)).toEqual([
      { layerId, speakerId: ada, laneIndex: 0 },
      { layerId, speakerId: bai, laneIndex: 1 },
    ]);
    clearLaneLocks(db, { layerId, speakerIds: [ada] });
    expect(listLaneLocks(db, layerId)).toEqual([{ layerId, speakerId: bai, laneIndex: 1 }]);
    closeDesktopSession(session.sessionId);
    const again = openDesktopSession(dir, [dir]);
    expect(listLaneLocks(requireDesktopSession(again.sessionId).db, layerId)).toEqual([
      { layerId, speakerId: bai, laneIndex: 1 },
    ]);
  });

  it('rejects a lock when the layer or its manuscript is deleted', () => {
    const { session } = open();
    const made = manuscriptLayer(session.sessionId);
    const ada = speaker(session.sessionId, '阿达');
    const db = requireDesktopSession(session.sessionId).db;
    const kept = [{ layerId: made.layerId, speakerId: ada, laneIndex: 0 }];
    replaceLaneLocks(db, { layerId: made.layerId, locks: kept });
    callDesktopSession(session.sessionId, 'layers.delete', { id: made.layerId, mode: 'soft' });
    expect(() =>
      replaceLaneLocks(db, { layerId: made.layerId, locks: [{ speakerId: ada, laneIndex: 1 }] }),
    ).toThrow('layer is deleted');
    expect(listLaneLocks(db, made.layerId)).toEqual(kept);

    const second = open();
    const other = manuscriptLayer(second.session.sessionId);
    const bai = speaker(second.session.sessionId, '白玛');
    const otherDb = requireDesktopSession(second.session.sessionId).db;
    const still = [{ layerId: other.layerId, speakerId: bai, laneIndex: 0 }];
    replaceLaneLocks(otherDb, { layerId: other.layerId, locks: still });
    callDesktopSession(second.session.sessionId, 'manuscripts.delete', { id: other.manuscriptId });
    expect(() =>
      replaceLaneLocks(otherDb, {
        layerId: other.layerId,
        locks: [{ speakerId: bai, laneIndex: 1 }],
      }),
    ).toThrow('manuscript is deleted');
    expect(listLaneLocks(otherDb, other.layerId)).toEqual(still);
  });
});

function manuscriptLayer(sessionId: string): { manuscriptId: string; layerId: string } {
  const media = callDesktopSession(sessionId, 'media.create', {
    relpath: 'a.wav',
    sha256: 'aa',
    duration: 4,
  }) as { id: string };
  const manuscript = callDesktopSession(sessionId, 'manuscripts.create', {
    title: { zh: '文稿' },
    mediaId: media.id,
  }) as { id: string };
  const layerId = (
    callDesktopSession(sessionId, 'layers.create', {
      manuscriptId: manuscript.id,
      key: 'tx',
      name: { zh: '转写' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    }) as { id: string }
  ).id;
  return { manuscriptId: manuscript.id, layerId };
}

function layer(sessionId: string): string {
  return manuscriptLayer(sessionId).layerId;
}

function speaker(sessionId: string, name: string): string {
  return (callDesktopSession(sessionId, 'speakers.create', { name }) as { id: string }).id;
}
