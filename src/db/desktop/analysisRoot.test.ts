import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { releaseAllProjectLocks, PROJECT_LOCK_NAME } from '../../desktop/skeleton/projectLock';
import { openProject } from './openProject';
import { getAnalysisRoot, writeAnalysisRoot } from './units';

const roots: string[] = [];
const T = '2026-10-25T00:00:00.000Z';

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-analysis-root-'));
  roots.push(root);
  return root;
}

function graph(text = 'ka') {
  return {
    payloadVersion: 1 as const,
    id: 'g1',
    text,
    nodes: [
      {
        id: 'n1',
        type: 'token' as const,
        label: text,
        domain: { form: { default: text }, index: 0, createdAt: T, updatedAt: T },
      },
    ],
    relations: [],
  };
}

afterEach(() => {
  releaseAllProjectLocks();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('analysis root', () => {
  it('stores a valid graph, reopens it, and leaves a new unit without one', () => {
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
    const unit = created.units.create({ layerId: layer.id, startTime: 0, endTime: 1, text: 'ka' });
    expect(getAnalysisRoot(created.db, unit.id)).toEqual({
      unitId: unit.id,
      graph: null,
      analysisGeneration: 0,
      graphFingerprint: '',
    });
    const stored = writeAnalysisRoot(created.db, {
      unitId: unit.id,
      graph: graph(),
      expectedAnalysisGeneration: 0,
    });
    expect(stored.analysisGeneration).toBe(1);
    expect(stored.graphFingerprint).toHaveLength(64);
    expect(stored.graph?.text).toBe('ka');
    created.close();

    const reopened = openProject(dir);
    expect(getAnalysisRoot(reopened.db, unit.id)).toEqual(stored);
    reopened.close();
  });

  it('rejects a stale generation and rolls back a failed write', () => {
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
    const unit = created.units.create({ layerId: layer.id, startTime: 0, endTime: 1, text: 'ka' });
    const stored = writeAnalysisRoot(created.db, {
      unitId: unit.id,
      graph: graph(),
      expectedAnalysisGeneration: 0,
    });
    expect(() =>
      writeAnalysisRoot(created.db, {
        unitId: unit.id,
        graph: graph(),
        expectedAnalysisGeneration: 0,
      }),
    ).toThrow('analysis generation does not match');
    expect(() =>
      writeAnalysisRoot(
        created.db,
        { unitId: unit.id, graph: graph(), expectedAnalysisGeneration: 1 },
        () => {
          throw new Error('injected');
        },
      ),
    ).toThrow('injected');
    created.close();

    const reopened = openProject(dir);
    expect(getAnalysisRoot(reopened.db, unit.id)).toEqual(stored);
    reopened.close();
  });

  it('rejects a version 4 library without changing its bytes', () => {
    const dir = folder();
    const file = join(dir, 'project.sqlite');
    openProject(dir).close();
    const db = new Database(file);
    db.exec('PRAGMA user_version = 4');
    db.close();
    const before = readFileSync(file);
    expect(() => openProject(dir)).toThrow('project.sqlite is not a Jieyu project library');
    expect(readFileSync(file)).toEqual(before);
    expect(readdirSync(dir).includes(PROJECT_LOCK_NAME)).toBe(false);
  });
});
