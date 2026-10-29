import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { callDesktopSession } from './desktopCall';
import { updateUnitText } from './units';
import {
  closeDesktopSession,
  openDesktopSession,
  requireDesktopSession,
  resetDesktopSessions,
} from './projectSession';

const roots: string[] = [];

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-unit-text-undo-'));
  roots.push(root);
  writeFileSync(join(root, 'a.wav'), '');
  return root;
}

afterEach(() => {
  resetDesktopSessions();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function textOf(sessionId: string, unitId: string): string {
  return (callDesktopSession(sessionId, 'units.get', { id: unitId }) as { text: string }).text;
}

describe('session unit text undo', () => {
  it('undoes only the latest text write, then forgets it', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const unitId = seed(session.sessionId);
    callDesktopSession(session.sessionId, 'units.updateText', { unitId, text: 'ta' });
    callDesktopSession(session.sessionId, 'units.updateText', { unitId, text: 'za' });
    expect(callDesktopSession(session.sessionId, 'units.undoText', {})).toMatchObject({
      text: 'ta',
    });
    expect(() => callDesktopSession(session.sessionId, 'units.undoText', {})).toThrow(
      'unit text undo is empty',
    );
    callDesktopSession(session.sessionId, 'reopen', {});
    expect(textOf(session.sessionId, unitId)).toBe('ta');
  });

  it('keeps the record across a reread and drops it after another write, a closed session, or a stale row', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const unitId = seed(session.sessionId);
    const right = callDesktopSession(session.sessionId, 'units.create', {
      layerId: layerId(session.sessionId, unitId),
      startTime: 1,
      endTime: 2,
      text: '后',
    }) as { id: string };
    callDesktopSession(session.sessionId, 'units.updateText', { unitId, text: 'ta' });
    callDesktopSession(session.sessionId, 'units.list', {
      layerId: layerId(session.sessionId, unitId),
    });
    callDesktopSession(session.sessionId, 'units.updateText', { unitId, text: 'ta' });
    expect(callDesktopSession(session.sessionId, 'units.undoText', {})).toMatchObject({
      text: 'ka',
    });

    callDesktopSession(session.sessionId, 'units.updateText', { unitId, text: 'ta' });
    callDesktopSession(session.sessionId, 'units.updateBoundary', {
      leftId: unitId,
      rightId: right.id,
      time: 0.4,
    });
    expect(() => callDesktopSession(session.sessionId, 'units.undoText', {})).toThrow(
      'unit text undo is empty',
    );
    expect(textOf(session.sessionId, unitId)).toBe('ta');

    callDesktopSession(session.sessionId, 'units.updateText', { unitId, text: 'za' });
    updateUnitText(requireDesktopSession(session.sessionId).db, { unitId, text: 'qi' });
    expect(() => callDesktopSession(session.sessionId, 'units.undoText', {})).toThrow(
      'unit text undo is stale',
    );
    expect(textOf(session.sessionId, unitId)).toBe('qi');
    expect(() => callDesktopSession(session.sessionId, 'units.undoText', {})).toThrow(
      'unit text undo is empty',
    );

    callDesktopSession(session.sessionId, 'units.updateText', { unitId, text: 'ta' });
    closeDesktopSession(session.sessionId);
    const again = openDesktopSession(dir, [dir]);
    expect(() => callDesktopSession(again.sessionId, 'units.undoText', {})).toThrow(
      'unit text undo is empty',
    );
    expect(textOf(again.sessionId, unitId)).toBe('ta');
  });

  it('keeps the step across a project read and a failed text write, and drops it when a layer create is refused', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const unitId = seed(session.sessionId);
    callDesktopSession(session.sessionId, 'units.updateText', { unitId, text: 'ta' });
    callDesktopSession(session.sessionId, 'project.get', {});
    expect(() =>
      callDesktopSession(session.sessionId, 'units.updateText', { unitId: 'missing', text: 'no' }),
    ).toThrow('unit is missing');
    expect(callDesktopSession(session.sessionId, 'units.undoText', {})).toMatchObject({
      text: 'ka',
    });

    callDesktopSession(session.sessionId, 'units.updateText', { unitId, text: 'ta' });
    expect(() => callDesktopSession(session.sessionId, 'layers.create', { extra: 1 })).toThrow(
      'desktop call field extra is not supported',
    );
    expect(() => callDesktopSession(session.sessionId, 'units.undoText', {})).toThrow(
      'unit text undo is empty',
    );
  });
});

function seed(sessionId: string): string {
  const media = callDesktopSession(sessionId, 'media.create', {
    relpath: 'a.wav',
    sha256: 'aa',
    duration: 3,
  }) as { id: string };
  const manuscript = callDesktopSession(sessionId, 'manuscripts.create', {
    title: { zh: '文稿' },
    mediaId: media.id,
  }) as { id: string };
  const layer = callDesktopSession(sessionId, 'layers.create', {
    manuscriptId: manuscript.id,
    key: 'tx',
    name: { zh: '转写' },
    tierType: 'time-aligned',
    contentType: 'transcription',
  }) as { id: string };
  return (
    callDesktopSession(sessionId, 'units.create', {
      layerId: layer.id,
      startTime: 0,
      endTime: 1,
      text: 'ka',
    }) as { id: string }
  ).id;
}

function layerId(sessionId: string, unitId: string): string {
  return (callDesktopSession(sessionId, 'units.get', { id: unitId }) as { layerId: string })
    .layerId;
}
