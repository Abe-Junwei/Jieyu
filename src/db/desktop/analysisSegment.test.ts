import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { releaseAllProjectLocks } from '../../desktop/skeleton/projectLock';
import { callDesktopSession } from './desktopCall';
import { openProject } from './openProject';
import { openDesktopSession, resetDesktopSessions } from './projectSession';

const roots: string[] = [];
const T = '2026-10-26T00:00:00.000Z';

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-segment-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  resetDesktopSessions();
  releaseAllProjectLocks();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('segmentUnitWords', () => {
  it('splits a unit on whitespace once and reads the same words after reopen', () => {
    const dir = folder();
    const project = openProject(dir);
    project.db
      .prepare(
        'INSERT INTO media (id, relpath, sha256, filename, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('m1', 'a.wav', 'aa', 'a.wav', 3, T);
    const manuscript = project.manuscripts.create({ title: { zh: '文稿' }, mediaId: 'm1' });
    const layer = project.layers.create({
      manuscriptId: manuscript.id,
      key: 'tx',
      name: { zh: '转写' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    });
    const unit = project.units.create({
      layerId: layer.id,
      startTime: 0,
      endTime: 1,
      text: 'alpha  beta',
    });
    project.close();

    const session = openDesktopSession(dir, [dir]);
    const first = callDesktopSession(session.sessionId, 'analysis.segmentWords', {
      unitId: unit.id,
    }) as { id: string; form: string }[];
    expect(first.map((word) => word.form)).toEqual(['alpha', 'beta']);
    const generation = (
      callDesktopSession(session.sessionId, 'analysis.readState', { unitId: unit.id }) as {
        analysisGeneration: number;
      }
    ).analysisGeneration;
    expect(
      callDesktopSession(session.sessionId, 'analysis.segmentWords', { unitId: unit.id }),
    ).toEqual(first);
    expect(
      callDesktopSession(session.sessionId, 'analysis.readState', { unitId: unit.id }),
    ).toMatchObject({ analysisGeneration: generation });
    expect(callDesktopSession(session.sessionId, 'units.get', { id: unit.id })).toMatchObject({
      text: 'alpha  beta',
    });
    resetDesktopSessions();

    const reopened = openDesktopSession(dir, [dir]);
    expect(
      callDesktopSession(reopened.sessionId, 'analysis.listWords', { unitId: unit.id }),
    ).toEqual(first);
    resetDesktopSessions();
  });
});
