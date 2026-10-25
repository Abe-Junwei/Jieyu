import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDesktopClient } from './client';
import { callDesktopSession } from './desktopCall';
import { openDesktopSession, requireDesktopSession, resetDesktopSessions } from './projectSession';

const roots: string[] = [];

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-desktop-call-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  resetDesktopSessions();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('desktop call', () => {
  it('creates a unit through one call, reopens, and reads the same unit', async () => {
    const dir = folder();
    writeFileSync(join(dir, 'a.wav'), '');
    const session = openDesktopSession(dir, [dir]);
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
      duration: 1.5,
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
    const unit = await client.createUnit(session.sessionId, {
      layerId: layer.id,
      startTime: 0,
      endTime: 1.2,
      text: '句子',
    });
    await client.reopen(session.sessionId);
    await expect(client.getUnit(session.sessionId, unit.id)).resolves.toEqual(unit);
    expect(calls).toEqual([
      'media.create',
      'manuscripts.create',
      'layers.create',
      'units.create',
      'reopen',
      'units.get',
    ]);
  });

  it('does not write when the session is expired or the method is unknown', () => {
    const firstDir = folder();
    const secondDir = folder();
    const first = openDesktopSession(firstDir, [firstDir, secondDir]);
    openDesktopSession(secondDir, [firstDir, secondDir]);
    expect(() =>
      callDesktopSession(first.sessionId, 'units.create', {
        layerId: 'missing',
        startTime: 0,
        endTime: 1,
        text: 'nope',
      }),
    ).toThrow('project session expired');

    expect(() =>
      callDesktopSession('not-granted', 'units.create', {
        layerId: 'missing',
        startTime: 0,
        endTime: 1,
        text: 'nope',
      }),
    ).toThrow('project session expired');

    const live = openDesktopSession(firstDir, [firstDir, secondDir]);
    expect(() => callDesktopSession(live.sessionId, 'units.delete', {})).toThrow(
      'unknown desktop call',
    );
    const count = requireDesktopSession(live.sessionId)
      .db.prepare('SELECT COUNT(*) AS n FROM units')
      .get() as { n: number };
    expect(count.n).toBe(0);
  });

  it('does not retry when the response is lost', async () => {
    let calls = 0;
    const client = createDesktopClient({
      desktopCall: () => {
        calls += 1;
        return Promise.reject(new Error('response lost'));
      },
    });
    await expect(
      client.createUnit('session', { layerId: 'layer', startTime: 0, endTime: 1, text: '句子' }),
    ).rejects.toThrow('response lost');
    expect(calls).toBe(1);
  });

  it('keeps better-sqlite3 out of the preload and the renderer client', () => {
    const preload = readFileSync(join(process.cwd(), 'electron/preload.ts'), 'utf8');
    const client = readFileSync(join(process.cwd(), 'src/db/desktop/client.ts'), 'utf8');
    const mainBuild = readFileSync(join(process.cwd(), 'electron/vite.config.ts'), 'utf8');
    expect(preload.includes('better-sqlite3')).toBe(false);
    expect(preload.includes("invoke('desktop:call'")).toBe(true);
    expect(client.includes('better-sqlite3')).toBe(false);
    expect(client.includes("from './desktopCall'")).toBe(false);
    expect(client.includes("from './projectSession'")).toBe(false);
    expect(mainBuild.includes("'better-sqlite3'")).toBe(true);
  });

  it('keeps declared layer and unit fields, and rejects a field it does not declare', () => {
    const dir = folder();
    writeFileSync(join(dir, 'a.wav'), '');
    const session = openDesktopSession(dir, [dir]);
    const media = callDesktopSession(session.sessionId, 'media.create', {
      relpath: 'a.wav',
      sha256: 'aa',
      duration: 4,
    }) as { id: string };
    const manuscript = callDesktopSession(session.sessionId, 'manuscripts.create', {
      title: { zh: '文稿' },
      mediaId: media.id,
    }) as { id: string };
    const language = callDesktopSession(session.sessionId, 'catalog.ensureProjectDefinition', {
      name: { zh: '示例' },
      sourceType: 'built-in-reviewed',
      iso6393: 'eng',
    }) as { id: string };
    const orthography = callDesktopSession(session.sessionId, 'orthographies.create', {
      languageId: language.id,
      name: { en: 'Latin' },
      scriptTag: 'Latn',
      sourceType: 'built-in-reviewed',
    }) as { id: string };
    const parent = callDesktopSession(session.sessionId, 'layers.create', {
      manuscriptId: manuscript.id,
      key: 'parent',
      name: { zh: '父层' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    }) as { id: string };
    const layer = callDesktopSession(session.sessionId, 'layers.create', {
      manuscriptId: manuscript.id,
      key: 'tx',
      name: { zh: '转写' },
      tierType: 'time-aligned',
      contentType: 'transcription',
      languageId: language.id,
      orthographyId: orthography.id,
      parentId: parent.id,
      sortOrder: 7,
    }) as {
      id: string;
      parentId: string | null;
      sortOrder: number;
      languageId: string | null;
      orthographyId: string | null;
    };
    expect(layer).toMatchObject({
      parentId: parent.id,
      sortOrder: 7,
      languageId: language.id,
      orthographyId: orthography.id,
    });
    const speaker = requireDesktopSession(session.sessionId).speakers.create({ name: '甲' });
    const parentUnit = callDesktopSession(session.sessionId, 'units.create', {
      layerId: layer.id,
      startTime: 0,
      endTime: 1,
      text: '父',
    }) as { id: string };
    const unit = callDesktopSession(session.sessionId, 'units.create', {
      layerId: layer.id,
      startTime: 1,
      endTime: 2,
      text: '子',
      speakerId: speaker.id,
      parentUnitId: parentUnit.id,
    }) as { id: string; speakerId: string | null; parentUnitId: string | null };
    expect(unit).toMatchObject({ speakerId: speaker.id, parentUnitId: parentUnit.id });
    const layersBefore = requireDesktopSession(session.sessionId)
      .db.prepare('SELECT COUNT(*) AS n FROM layers')
      .get() as { n: number };
    const unitsBefore = requireDesktopSession(session.sessionId)
      .db.prepare('SELECT COUNT(*) AS n FROM units')
      .get() as { n: number };
    expect(() =>
      callDesktopSession(session.sessionId, 'layers.create', {
        manuscriptId: manuscript.id,
        key: 'extra',
        name: { zh: '多' },
        tierType: 'time-aligned',
        contentType: 'note',
        extra: true,
      }),
    ).toThrow('desktop call field extra is not supported');
    expect(() =>
      callDesktopSession(session.sessionId, 'units.create', {
        layerId: layer.id,
        startTime: 2,
        endTime: 3,
        text: '丢',
        note: 'nope',
      }),
    ).toThrow('desktop call field note is not supported');
    expect(
      requireDesktopSession(session.sessionId).db.prepare('SELECT COUNT(*) AS n FROM layers').get(),
    ).toEqual(layersBefore);
    expect(
      requireDesktopSession(session.sessionId).db.prepare('SELECT COUNT(*) AS n FROM units').get(),
    ).toEqual(unitsBefore);
    callDesktopSession(session.sessionId, 'reopen', {});
    const layers = callDesktopSession(session.sessionId, 'layers.list', {
      manuscriptId: manuscript.id,
    }) as {
      key: string;
      parentId: string | null;
      sortOrder: number;
      languageId: string | null;
      orthographyId: string | null;
    }[];
    expect(layers.find((item) => item.key === 'tx')).toMatchObject({
      parentId: parent.id,
      sortOrder: 7,
      languageId: language.id,
      orthographyId: orthography.id,
    });
    expect(callDesktopSession(session.sessionId, 'units.get', { id: unit.id })).toMatchObject({
      speakerId: speaker.id,
      parentUnitId: parentUnit.id,
    });
  });
});
