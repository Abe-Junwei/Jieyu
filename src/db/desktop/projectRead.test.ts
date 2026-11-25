import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  bindDesktopMediaSession,
  grantDesktopMedia,
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
      startMs: 0,
      endMs: 1200,
      text: '句子',
    });
    await client.reopen(session.sessionId);
    calls.length = 0;

    const model = await loadDesktopProjectRead(
      {
        listManuscripts: (sessionId) => client.listManuscripts(sessionId),
        listLayers: (sessionId, manuscriptId) => client.listLayers(sessionId, manuscriptId),
        listLayerLinks: (sessionId, manuscriptId) => client.listLayerLinks(sessionId, manuscriptId),
        listUnits: (sessionId, layerId) => client.listUnits(sessionId, layerId),
        listPoints: (sessionId, manuscriptId) => client.listPoints(sessionId, { manuscriptId }),
        mediaPlayUrl: async (sessionId, mediaId) => desktopMediaPlayUrl(sessionId, mediaId).url,
      },
      session.sessionId,
    );

    expect(model.manuscripts.map((item) => item.id)).toEqual([manuscript.id]);
    expect(model.units.map((unit) => unit.text)).toEqual(['句子']);
    expect(model.audioUrl?.startsWith('jieyu-media://local/')).toBe(true);
    const token = model.audioUrl?.slice('jieyu-media://local/'.length) ?? '';
    expect(resolveDesktopMedia(token)?.endsWith('a.wav')).toBe(true);
    expect(calls).toEqual([
      'manuscripts.list',
      'layers.list',
      'points.list',
      'units.list',
      'layers.listLinks',
    ]);
    expect(model.layers.map((item) => item.id)).toEqual([layer.id]);
    expect(model.units[0]?.startMs).toBe(0);
    expect(model.units[0]?.endMs).toBe(1200);
  });

  it('reads every layer and the parent-unit link after reopen', async () => {
    const dir = folder();
    writeFileSync(join(dir, 'a.wav'), '');
    const session = openDesktopSession(dir, [dir]);
    const client = createDesktopClient({
      desktopCall: (sessionId, method, args) =>
        Promise.resolve(callDesktopSession(sessionId, method, args)),
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
    const parentLayer = await client.createLayer(session.sessionId, {
      manuscriptId: manuscript.id,
      key: 'tx',
      name: { zh: '转写' },
      tierType: 'time-aligned',
      contentType: 'transcription',
      sortOrder: 0,
    });
    const childLayer = await client.createLayer(session.sessionId, {
      manuscriptId: manuscript.id,
      key: 'tl',
      name: { zh: '翻译' },
      tierType: 'time-aligned',
      contentType: 'translation',
      parentId: parentLayer.id,
      sortOrder: 1,
    });
    const parent = await client.createUnit(session.sessionId, {
      layerId: parentLayer.id,
      startMs: 0,
      endMs: 1000,
      text: '父段',
    });
    await client.createUnit(session.sessionId, {
      layerId: childLayer.id,
      startMs: 0,
      endMs: 1000,
      text: '子段',
      parentUnitId: parent.id,
    });
    await client.reopen(session.sessionId);

    const model = await loadDesktopProjectRead(
      {
        listManuscripts: (sessionId) => client.listManuscripts(sessionId),
        listLayers: (sessionId, manuscriptId) => client.listLayers(sessionId, manuscriptId),
        listLayerLinks: (sessionId, manuscriptId) => client.listLayerLinks(sessionId, manuscriptId),
        listUnits: (sessionId, layerId) => client.listUnits(sessionId, layerId),
        listPoints: (sessionId, manuscriptId) => client.listPoints(sessionId, { manuscriptId }),
        mediaPlayUrl: async (sessionId, mediaId) => desktopMediaPlayUrl(sessionId, mediaId).url,
      },
      session.sessionId,
      manuscript.id,
      false,
    );

    expect(model.layerId).toBe(parentLayer.id);
    expect(model.units.map((unit) => unit.text)).toEqual(['父段']);
    expect(
      model.layers.map((item) => [item.id, item.parentId, item.units.map((unit) => unit.text)]),
    ).toEqual([
      [parentLayer.id, null, ['父段']],
      [childLayer.id, parentLayer.id, ['子段']],
    ]);
    expect(model.layers[1]?.units[0]?.parentUnitId).toBe(parent.id);
    expect(model.audioUrl).toBeNull();

    const located = await loadDesktopProjectRead(
      {
        listManuscripts: (sessionId) => client.listManuscripts(sessionId),
        listLayers: (sessionId, manuscriptId) => client.listLayers(sessionId, manuscriptId),
        listLayerLinks: (sessionId, manuscriptId) => client.listLayerLinks(sessionId, manuscriptId),
        listUnits: (sessionId, layerId) => client.listUnits(sessionId, layerId),
        listPoints: (sessionId, manuscriptId) => client.listPoints(sessionId, { manuscriptId }),
        mediaPlayUrl: async (sessionId, mediaId) => desktopMediaPlayUrl(sessionId, mediaId).url,
      },
      session.sessionId,
      manuscript.id,
      false,
      childLayer.id,
    );
    expect(located.layerId).toBe(childLayer.id);
    expect(located.units.map((unit) => unit.text)).toEqual(['子段']);
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

  it('refuses a media grant when replacing the session with an unreadable project fails', () => {
    const root = folder();
    const first = join(root, 'first');
    const bad = join(root, 'bad');
    mkdirSync(first);
    const session = openDesktopSession(first, [first, bad]);
    bindDesktopMediaSession(session.sessionId);
    const token = grantDesktopMedia(session.sessionId, join(first, 'audio.wav'));
    mkdirSync(bad);
    writeFileSync(join(bad, 'project.sqlite'), 'invalid');
    expect(() => openDesktopSession(bad, [first, bad])).toThrow();
    expect(() => requireDesktopSession(session.sessionId)).toThrow('project session expired');
    expect(resolveDesktopMedia(token)).toBeNull();
  });
});
