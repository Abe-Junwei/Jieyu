import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { releaseAllProjectLocks } from '../../desktop/skeleton/projectLock';
import { openProject } from './openProject';
import { updateBoundary } from './units';

const roots: string[] = [];
const T = '2026-10-25T00:00:00.000Z';

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-desktop-ops-'));
  roots.push(root);
  return root;
}

function projectRow(dir: string): void {
  const project = openProject(dir);
  project.db
    .prepare('INSERT INTO project (id, title_json, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run('p1', JSON.stringify({ zh: '项目' }), T, T);
  project.close();
}

afterEach(() => {
  releaseAllProjectLocks();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('desktop project operations', () => {
  it('registers a recording inside the folder and keeps the manuscript link', () => {
    const dir = folder();
    mkdirSync(join(dir, 'notes'));
    writeFileSync(join(dir, 'notes', 'a.wav'), '');
    const created = openProject(dir);
    const media = created.media.create({ relpath: 'notes/a.wav', sha256: 'aa', duration: 1.5 });
    const manuscript = created.manuscripts.create({ title: { zh: '文稿' }, mediaId: media.id });
    created.close();

    const reopened = openProject(dir);
    expect(reopened.media.get(media.id)).toEqual(media);
    expect(reopened.manuscripts.get(manuscript.id)?.mediaId).toBe(media.id);
    reopened.close();
  });

  it('rejects a path that leaves the folder or is not a file', () => {
    const dir = folder();
    const outside = folder();
    writeFileSync(join(outside, 'secret.wav'), '');
    symlinkSync(join(outside, 'secret.wav'), join(dir, 'link.wav'));
    const project = openProject(dir);

    expect(() =>
      project.media.create({ relpath: '../secret.wav', sha256: 'aa', duration: 1 }),
    ).toThrow('media path escapes the project folder');
    expect(() => project.media.create({ relpath: 'link.wav', sha256: 'aa', duration: 1 })).toThrow(
      'media path escapes the project folder',
    );
    expect(() =>
      project.media.create({ relpath: 'missing.wav', sha256: 'aa', duration: 1 }),
    ).toThrow('media file is missing');
    expect(project.db.prepare('SELECT COUNT(*) AS n FROM media').get()).toEqual({ n: 0 });
    project.close();
  });

  it('stores a speaker and replaces the whole settings object', () => {
    const dir = folder();
    projectRow(dir);
    const created = openProject(dir);
    const speaker = created.speakers.create({ name: '甲' });
    expect(created.speakers.get('missing')).toBeNull();
    expect(created.settings.get('p1')).toEqual({});
    const first = created.settings.replace('p1', {
      characterVariantLines: 'a',
      annotationAbbreviations: 'x',
    });
    const second = created.settings.replace('p1', { characterVariantLines: 'b' });
    expect(first).toEqual({ characterVariantLines: 'a', annotationAbbreviations: 'x' });
    expect(second).toEqual({ characterVariantLines: 'b' });
    expect(() => created.settings.replace('p1', [] as unknown as Record<string, unknown>)).toThrow(
      'project settings must be an object',
    );
    expect(() => created.settings.replace('p1', { sessionMemory: { facts: [] } })).toThrow(
      'project setting is unknown',
    );
    expect(() => created.settings.replace('p1', { laneLocks: [] })).toThrow(
      'project setting is unknown',
    );
    expect(created.settings.get('p1')).toEqual({ characterVariantLines: 'b' });
    created.close();

    const reopened = openProject(dir);
    expect(reopened.speakers.get(speaker.id)).toEqual(speaker);
    expect(reopened.settings.get('p1')).toEqual({ characterVariantLines: 'b' });
    reopened.close();
  });

  it('lists units by time and rolls back both sides of a boundary', () => {
    const dir = folder();
    const created = openProject(dir);
    created.db
      .prepare(
        'INSERT INTO media (id, relpath, sha256, filename, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('m1', 'a.wav', 'aa', 'a.wav', 3, T);
    const manuscript = created.manuscripts.create({ title: { zh: '文稿' }, mediaId: 'm1' });
    const layer = created.layers.create({
      manuscriptId: manuscript.id,
      key: 'tx',
      name: { zh: '转写' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    });
    const right = created.units.create({
      layerId: layer.id,
      startTime: 1,
      endTime: 2,
      text: '后',
    });
    const left = created.units.create({
      layerId: layer.id,
      startTime: 0,
      endTime: 1,
      text: '前',
    });
    expect(created.units.list(layer.id).map((unit) => unit.id)).toEqual([left.id, right.id]);

    const moved = created.units.updateBoundary({ leftId: left.id, rightId: right.id, time: 1.4 });
    expect(moved.left.endTime).toBe(1.4);
    expect(moved.right.startTime).toBe(1.4);
    expect(() =>
      updateBoundary(created.db, { leftId: left.id, rightId: right.id, time: 1.6 }, () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    created.close();

    const reopened = openProject(dir);
    const units = reopened.units.list(layer.id);
    expect(units.map((unit) => [unit.startTime, unit.endTime])).toEqual([
      [0, 1.4],
      [1.4, 2],
    ]);
    reopened.close();
  });
});
