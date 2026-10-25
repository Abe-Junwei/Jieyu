import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { previewTextTimeMapping } from '../../services/LinguisticService.timeMapping';
import { callDesktopSession } from './desktopCall';
import { setManuscriptTimeMapping } from './manuscripts';
import { openProject } from './openProject';
import { openDesktopSession, resetDesktopSessions } from './projectSession';

const roots: string[] = [];

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-time-map-'));
  roots.push(root);
  writeFileSync(join(root, 'a.wav'), '');
  return root;
}

afterEach(() => {
  resetDesktopSessions();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('manuscript time mapping', () => {
  it('keeps literature seconds when the mapping changes and rolls back', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const media = callDesktopSession(session.sessionId, 'media.create', {
      relpath: 'a.wav',
      sha256: 'aa',
      duration: 12,
    }) as { id: string };
    const manuscript = callDesktopSession(session.sessionId, 'manuscripts.create', {
      title: { zh: '文稿' },
      mediaId: media.id,
    }) as { id: string };
    const layer = callDesktopSession(session.sessionId, 'layers.create', {
      manuscriptId: manuscript.id,
      key: 'tx',
      name: { zh: '转写' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    }) as { id: string };
    const left = callDesktopSession(session.sessionId, 'units.create', {
      layerId: layer.id,
      startTime: 1,
      endTime: 3,
      text: '前',
    }) as { id: string };
    const right = callDesktopSession(session.sessionId, 'units.create', {
      layerId: layer.id,
      startTime: 3,
      endTime: 5,
      text: '后',
    }) as { id: string };

    const mapped = callDesktopSession(session.sessionId, 'manuscripts.setTimeMapping', {
      manuscriptId: manuscript.id,
      expectedRevision: 0,
      offsetSec: 2,
      scale: 2,
    }) as {
      timeMapping: { offsetSec: number; scale: number; revision: number; sourceMediaId: string };
    };
    expect(mapped.timeMapping).toMatchObject({
      offsetSec: 2,
      scale: 2,
      revision: 1,
      sourceMediaId: media.id,
    });
    expect(
      previewTextTimeMapping({ startTime: 1, endTime: 3, offsetSec: 2, scale: 2 }),
    ).toMatchObject({
      realStartTime: 4,
      realEndTime: 8,
    });
    expect(unitTimes(session.sessionId, left.id, right.id)).toEqual([
      [1, 3],
      [3, 5],
    ]);

    callDesktopSession(session.sessionId, 'reopen', {});
    const again = callDesktopSession(session.sessionId, 'manuscripts.setTimeMapping', {
      manuscriptId: manuscript.id,
      expectedRevision: 1,
      offsetSec: 0,
      scale: 1,
    }) as { timeMappingHistory: { revision: number }[] };
    expect(again.timeMappingHistory.map((item) => item.revision)).toEqual([1]);
    expect(unitTimes(session.sessionId, left.id, right.id)).toEqual([
      [1, 3],
      [3, 5],
    ]);

    const restored = callDesktopSession(session.sessionId, 'manuscripts.rollbackTimeMapping', {
      manuscriptId: manuscript.id,
      expectedRevision: 2,
    }) as { timeMapping: { offsetSec: number; scale: number; revision: number } | null };
    expect(restored.timeMapping).toMatchObject({ offsetSec: 2, scale: 2, revision: 3 });
    const identity = callDesktopSession(session.sessionId, 'manuscripts.rollbackTimeMapping', {
      manuscriptId: manuscript.id,
      expectedRevision: 3,
    }) as { timeMapping: null; timeMappingRevision: number };
    expect(identity.timeMapping).toBeNull();
    expect(identity.timeMappingRevision).toBe(4);
    expect(unitTimes(session.sessionId, left.id, right.id)).toEqual([
      [1, 3],
      [3, 5],
    ]);

    let revision = identity.timeMappingRevision;
    let historyLength = 0;
    for (let step = 0; step < 9; step += 1) {
      const saved = callDesktopSession(session.sessionId, 'manuscripts.setTimeMapping', {
        manuscriptId: manuscript.id,
        expectedRevision: revision,
        offsetSec: step,
        scale: 1,
      }) as { timeMapping: { revision: number }; timeMappingHistory: unknown[] };
      revision = saved.timeMapping.revision;
      historyLength = saved.timeMappingHistory.length;
    }
    expect(revision).toBe(13);
    expect(historyLength).toBe(8);
    expect(unitTimes(session.sessionId, left.id, right.id)).toEqual([
      [1, 3],
      [3, 5],
    ]);
  });

  it('rejects a mapping revision that undo has already replaced', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const media = callDesktopSession(session.sessionId, 'media.create', {
      relpath: 'a.wav',
      sha256: 'aa',
      duration: 12,
    }) as { id: string };
    const manuscript = callDesktopSession(session.sessionId, 'manuscripts.create', {
      title: { zh: '文稿' },
      mediaId: media.id,
    }) as { id: string };
    callDesktopSession(session.sessionId, 'manuscripts.setTimeMapping', {
      manuscriptId: manuscript.id,
      expectedRevision: 0,
      offsetSec: 1,
      scale: 1,
    });
    callDesktopSession(session.sessionId, 'manuscripts.setTimeMapping', {
      manuscriptId: manuscript.id,
      expectedRevision: 1,
      offsetSec: 2,
      scale: 1,
    });
    const undone = callDesktopSession(session.sessionId, 'manuscripts.rollbackTimeMapping', {
      manuscriptId: manuscript.id,
      expectedRevision: 2,
    }) as { timeMapping: { offsetSec: number; revision: number } };
    expect(undone.timeMapping).toMatchObject({ offsetSec: 1, revision: 3 });
    callDesktopSession(session.sessionId, 'manuscripts.setTimeMapping', {
      manuscriptId: manuscript.id,
      expectedRevision: 3,
      offsetSec: 9,
      scale: 1,
    });
    expect(() =>
      callDesktopSession(session.sessionId, 'manuscripts.setTimeMapping', {
        manuscriptId: manuscript.id,
        expectedRevision: 2,
        offsetSec: 8,
        scale: 1,
      }),
    ).toThrow('time mapping revision mismatch');
    callDesktopSession(session.sessionId, 'reopen', {});
    const listed = callDesktopSession(session.sessionId, 'manuscripts.list', {}) as {
      timeMapping: { offsetSec: number; revision: number } | null;
    }[];
    expect(listed[0]?.timeMapping).toMatchObject({ offsetSec: 9, revision: 4 });
  });

  it('rolls back a rejected mapping and edits text without moving the boundary pair', () => {
    const dir = folder();
    const project = openProject(dir);
    const media = project.media.create({ relpath: 'a.wav', sha256: 'aa', duration: 12 });
    const manuscript = project.manuscripts.create({ title: { zh: '文稿' }, mediaId: media.id });
    const layer = project.layers.create({
      manuscriptId: manuscript.id,
      key: 'tx',
      name: { zh: '转写' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    });
    const left = project.units.create({ layerId: layer.id, startTime: 1, endTime: 3, text: '前' });
    const right = project.units.create({ layerId: layer.id, startTime: 3, endTime: 5, text: '后' });
    expect(() =>
      setManuscriptTimeMapping(
        project.db,
        { manuscriptId: manuscript.id, expectedRevision: 0, offsetSec: 2, scale: 2 },
        () => {
          throw new Error('mapping failed');
        },
      ),
    ).toThrow('mapping failed');
    expect(() =>
      setManuscriptTimeMapping(project.db, {
        manuscriptId: manuscript.id,
        expectedRevision: 4,
        offsetSec: 2,
        scale: 2,
      }),
    ).toThrow('time mapping revision mismatch');
    expect(() =>
      setManuscriptTimeMapping(project.db, {
        manuscriptId: manuscript.id,
        expectedRevision: 0,
        offsetSec: 2,
        scale: 2,
        sourceMediaId: 'other',
      }),
    ).toThrow('time mapping media does not match the manuscript');
    expect(project.manuscripts.get(manuscript.id)?.timeMapping).toBeNull();
    expect(project.units.get(left.id)?.startTime).toBe(1);

    const edited = project.units.get(left.id);
    expect(edited?.text).toBe('前');
    project.close();

    const session = openDesktopSession(dir, [dir]);
    const text = callDesktopSession(session.sessionId, 'units.updateText', {
      unitId: left.id,
      text: '改',
    }) as { text: string; startTime: number; endTime: number };
    expect(text).toMatchObject({ text: '改', startTime: 1, endTime: 3 });
    const moved = callDesktopSession(session.sessionId, 'units.updateBoundary', {
      leftId: left.id,
      rightId: right.id,
      time: 2,
    }) as { left: { endTime: number; text: string }; right: { startTime: number; text: string } };
    expect(moved.left).toMatchObject({ endTime: 2, text: '改' });
    expect(moved.right).toMatchObject({ startTime: 2, text: '后' });
    callDesktopSession(session.sessionId, 'reopen', {});
    expect(callDesktopSession(session.sessionId, 'units.get', { id: left.id })).toMatchObject({
      text: '改',
      endTime: 2,
    });
  });
});

function unitTimes(sessionId: string, leftId: string, rightId: string): number[][] {
  const left = callDesktopSession(sessionId, 'units.get', { id: leftId }) as {
    startTime: number;
    endTime: number;
  };
  const right = callDesktopSession(sessionId, 'units.get', { id: rightId }) as {
    startTime: number;
    endTime: number;
  };
  return [
    [left.startTime, left.endTime],
    [right.startTime, right.endTime],
  ];
}
