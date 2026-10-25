import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  bindDesktopMediaSession,
  resetDesktopMediaGrants,
  resolveDesktopMedia,
} from '../../desktop/skeleton/desktopMediaGrant';
import { createDesktopClient } from './client';
import { callDesktopSession } from './desktopCall';
import { desktopMediaPlayUrl } from './mediaUrl';
import { loadDesktopProjectRead } from './projectRead';
import { openDesktopSession, requireDesktopSession, resetDesktopSessions } from './projectSession';

const roots: string[] = [];

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-project-read-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  resetDesktopSessions();
  resetDesktopMediaGrants();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('desktop project read', () => {
  it('lists the manuscript, plays the folder audio, and reads units after reopen', async () => {
    const dir = folder();
    writeFileSync(join(dir, 'a.wav'), '');
    const session = openDesktopSession(dir, [dir]);
    bindDesktopMediaSession(session.sessionId);
    const calls: string[] = [];
    const client = createDesktopClient({
      desktopCall: (sessionId, method, args) => {
        calls.push(method);
        return Promise.resolve(callDesktopSession(sessionId, method, args));
      },
    });
    const media = await client.createMedia(session.sessionId, {
      relpath: 'a.wav',
      sha256: 'aa',
      duration: 2,
    });
    const manuscript = await client.createManuscript(session.sessionId, {
      title: { zh: '文稿' },
      mediaId: media.id,
    });
    const layer = await client.createLayer(session.sessionId, {
      manuscriptId: manuscript.id,
      key: 'tx',
      name: { zh: '转写' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    });
    await client.createUnit(session.sessionId, {
      layerId: layer.id,
      startTime: 0,
      endTime: 1.2,
      text: '句子',
    });
    await client.reopen(session.sessionId);
    calls.length = 0;

    const model = await loadDesktopProjectRead(
      {
        listManuscripts: (sessionId) => client.listManuscripts(sessionId),
        listLayers: (sessionId, manuscriptId) => client.listLayers(sessionId, manuscriptId),
        listUnits: (sessionId, layerId) => client.listUnits(sessionId, layerId),
        mediaPlayUrl: async (sessionId, mediaId) => desktopMediaPlayUrl(sessionId, mediaId).url,
      },
      session.sessionId,
    );

    expect(model.manuscripts.map((item) => item.id)).toEqual([manuscript.id]);
    expect(model.units.map((unit) => unit.text)).toEqual(['句子']);
    expect(model.audioUrl?.startsWith('jieyu-media://local/')).toBe(true);
    const token = model.audioUrl?.slice('jieyu-media://local/'.length) ?? '';
    expect(resolveDesktopMedia(token)?.endsWith('a.wav')).toBe(true);
    expect(calls).toEqual(['manuscripts.list', 'layers.list', 'units.list']);
  });

  it('does not grant a url when the session is expired or the path escapes', () => {
    const firstDir = folder();
    const secondDir = folder();
    writeFileSync(join(firstDir, 'a.wav'), '');
    const first = openDesktopSession(firstDir, [firstDir, secondDir]);
    bindDesktopMediaSession(first.sessionId);
    const media = callDesktopSession(first.sessionId, 'media.create', {
      relpath: 'a.wav',
      sha256: 'aa',
      duration: 1,
    }) as { id: string };
    const second = openDesktopSession(secondDir, [firstDir, secondDir]);
    bindDesktopMediaSession(second.sessionId);
    expect(() => desktopMediaPlayUrl(first.sessionId, media.id)).toThrow('project session expired');
    expect(resolveDesktopMedia('not-a-token')).toBeNull();

    const live = openDesktopSession(firstDir, [firstDir, secondDir]);
    bindDesktopMediaSession(live.sessionId);
    requireDesktopSession(live.sessionId)
      .db.prepare(
        `INSERT INTO media (id, relpath, sha256, filename, duration, created_at)
         VALUES ('bad', '../outside.wav', 'aa', 'outside.wav', 1, '2026-10-25T00:00:00.000Z')`,
      )
      .run();
    expect(() => desktopMediaPlayUrl(live.sessionId, 'bad')).toThrow(
      'media path escapes the project folder',
    );
    expect(resolveDesktopMedia('bad')).toBeNull();
  });
});
