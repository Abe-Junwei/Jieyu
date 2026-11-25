import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join, sep } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  bindDesktopMediaSession,
  resetDesktopMediaGrants,
  resolveDesktopMedia,
} from '../../desktop/skeleton/desktopMediaGrant';
import { createDesktopClient } from './client';
import { callDesktopSession } from './desktopCall';
import { copyRecordingIntoProject, projectFolderForNewImport } from './importRecordingFile';
import { desktopMediaPlayUrl } from './mediaUrl';
import { loadDesktopProjectRead } from './projectRead';
import { openDesktopSession, resetDesktopSessions } from './projectSession';

const roots: string[] = [];

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-import-recording-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  resetDesktopSessions();
  resetDesktopMediaGrants();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('copyRecordingIntoProject', () => {
  it('copies the file into the project and the reopened manuscript plays those bytes', async () => {
    const dir = folder();
    const source = join(folder(), 'take.wav');
    writeFileSync(source, 'wav-bytes');
    const copied = await copyRecordingIntoProject(dir, source);
    expect(readFileSync(join(dir, copied.relpath)).toString()).toBe('wav-bytes');
    expect(await copyRecordingIntoProject(dir, source)).toMatchObject({ relpath: copied.relpath });

    const session = openDesktopSession(dir, [dir]);
    bindDesktopMediaSession(session.sessionId);
    const client = createDesktopClient({
      desktopCall: (sessionId, method, args) =>
        Promise.resolve(callDesktopSession(sessionId, method, args)),
    });
    const media = await client.createMedia(session.sessionId, {
      relpath: copied.relpath,
      sha256: copied.sha256,
      duration: 1.25,
    });
    const manuscript = await client.createManuscript(session.sessionId, {
      title: { und: 'take' },
      mediaId: media.id,
    });
    await client.createLayer(session.sessionId, {
      manuscriptId: manuscript.id,
      key: 'tx',
      name: { zh: '转写' },
      tierType: 'time-aligned',
      contentType: 'transcription',
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
    );
    const token = model.audioUrl?.slice('jieyu-media://local/'.length) ?? '';
    expect(resolveDesktopMedia(token)?.endsWith(copied.relpath)).toBe(true);
    expect(readFileSync(resolveDesktopMedia(token) ?? '').toString()).toBe('wav-bytes');
  });

  it('leaves an older library untouched and picks the next folder', () => {
    const root = folder();
    const older = join(root, 'take');
    mkdirSync(older);
    writeFileSync(join(older, 'project.sqlite'), 'old');
    expect(projectFolderForNewImport(root, 'take', () => false)).toBe(join(root, 'take 2'));
    expect(readFileSync(join(older, 'project.sqlite')).toString()).toBe('old');
    expect(projectFolderForNewImport(root, 'take', () => true)).toBe(older);
  });

  it('keeps a dot-dot audio stem inside the workspace root', () => {
    const root = folder();
    for (const file of ['...wav', '.. .wav', '..wav']) {
      const created = projectFolderForNewImport(root, basename(file, extname(file)), () => true);
      expect(created === root || created.startsWith(`${root}${sep}`)).toBe(true);
      expect(basename(created)).not.toBe('..');
      expect(basename(created)).not.toBe('.');
    }
  });

  it('refuses a file that is not audio', async () => {
    const dir = folder();
    const source = join(folder(), 'notes.txt');
    writeFileSync(source, 'nope');
    await expect(copyRecordingIntoProject(dir, source)).rejects.toThrow('media file is missing');
  });
});
