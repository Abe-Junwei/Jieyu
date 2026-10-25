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
});
