import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { releaseAllProjectLocks } from '../../desktop/skeleton/projectLock';
import { callDesktopSession } from './desktopCall';
import { openDesktopSession, requireDesktopSession, resetDesktopSessions } from './projectSession';

const roots: string[] = [];

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-register-recording-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  resetDesktopSessions();
  releaseAllProjectLocks();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

const layer = {
  layerKey: 'tx',
  layerName: { zh: '转写' },
  tierType: 'time-aligned',
  contentType: 'transcription',
};

describe('registerRecording', () => {
  it('writes the recording, manuscript, and layer in one call and keeps the same manuscript', () => {
    const dir = folder();
    writeFileSync(join(dir, 'a.wav'), 'wav');
    const session = openDesktopSession(dir, [dir]);
    const input = {
      relpath: 'a.wav',
      sha256: 'aa',
      duration: 1.5,
      title: { und: 'a' },
      ...layer,
    };
    const first = callDesktopSession(session.sessionId, 'recordings.register', input) as {
      mediaId: string;
      manuscriptId: string;
      created: boolean;
    };
    expect(first.created).toBe(true);
    const again = callDesktopSession(session.sessionId, 'recordings.register', input) as {
      manuscriptId: string;
      created: boolean;
    };
    expect(again).toMatchObject({ manuscriptId: first.manuscriptId, created: false });
    expect(
      callDesktopSession(session.sessionId, 'layers.list', { manuscriptId: first.manuscriptId }),
    ).toHaveLength(1);
    expect(count(session.sessionId, 'media')).toBe(1);
    expect(count(session.sessionId, 'manuscripts')).toBe(1);
  });

  it('leaves no rows when the layer cannot be stored', () => {
    const dir = folder();
    writeFileSync(join(dir, 'a.wav'), 'wav');
    const session = openDesktopSession(dir, [dir]);
    expect(() =>
      callDesktopSession(session.sessionId, 'recordings.register', {
        relpath: 'a.wav',
        sha256: 'aa',
        duration: 1.5,
        title: { und: 'a' },
        ...layer,
        contentType: 'nope',
      }),
    ).toThrow();
    expect(count(session.sessionId, 'media')).toBe(0);
    expect(count(session.sessionId, 'manuscripts')).toBe(0);
    expect(count(session.sessionId, 'layers')).toBe(0);
  });

  it('keeps the layer list empty when the recording has no layer', () => {
    const dir = folder();
    writeFileSync(join(dir, 'a.wav'), 'wav');
    const session = openDesktopSession(dir, [dir]);
    const registered = callDesktopSession(session.sessionId, 'recordings.register', {
      relpath: 'a.wav',
      sha256: 'aa',
      duration: 1.5,
      title: { und: 'a' },
    }) as { manuscriptId: string };
    expect(
      callDesktopSession(session.sessionId, 'layers.list', {
        manuscriptId: registered.manuscriptId,
      }),
    ).toEqual([]);
  });
});

function count(sessionId: string, table: 'media' | 'manuscripts' | 'layers'): number {
  const row = requireDesktopSession(sessionId)
    .db.prepare(`SELECT COUNT(*) AS n FROM ${table}`)
    .get() as { n: number };
  return row.n;
}
