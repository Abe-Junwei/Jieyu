import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openProject } from './openProject';
import { createUnit } from './units';

const roots: string[] = [];
const T = '2026-10-25T00:00:00.000Z';

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-desktop-create-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('desktop project create', () => {
  it('writes a manuscript, layer, and transcription, then reads them after reopen', () => {
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
    const unit = created.units.create({
      layerId: layer.id,
      startTime: 0,
      endTime: 1.2,
      text: '句子',
    });
    expect(created.manuscripts.get('missing')).toBeNull();
    expect(created.layers.get('missing')).toBeNull();
    expect(created.units.get('missing')).toBeNull();
    created.close();

    const reopened = openProject(dir);
    expect(reopened.manuscripts.get(manuscript.id)).toEqual(manuscript);
    expect(reopened.layers.get(layer.id)).toEqual(layer);
    expect(reopened.units.get(unit.id)).toEqual(unit);
    reopened.close();
  });

  it('rolls back the unit when the transcription insert fails', () => {
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
    const kept = created.units.create({
      layerId: layer.id,
      startTime: 0,
      endTime: 1,
      text: '旧句子',
    });
    expect(() =>
      createUnit(
        created.db,
        {
          layerId: layer.id,
          startTime: 1,
          endTime: 2,
          text: '失败',
        },
        () => {
          throw new Error('injected');
        },
      ),
    ).toThrow('injected');
    created.close();

    const reopened = openProject(dir);
    expect(reopened.units.get(kept.id)).toEqual(kept);
    expect(reopened.db.prepare('SELECT body FROM unit_texts').all()).toEqual([{ body: '旧句子' }]);
    const next = reopened.units.create({
      layerId: layer.id,
      startTime: 1,
      endTime: 2,
      text: '新句子',
    });
    reopened.close();

    const again = openProject(dir);
    expect(again.units.get(kept.id)?.text).toBe('旧句子');
    expect(again.units.get(next.id)?.text).toBe('新句子');
    expect(again.db.prepare('SELECT COUNT(*) AS n FROM units').get()).toEqual({ n: 2 });
    again.close();
  });
});
