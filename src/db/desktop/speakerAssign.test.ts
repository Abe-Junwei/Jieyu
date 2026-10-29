import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { callDesktopSession } from './desktopCall';
import {
  closeDesktopSession,
  openDesktopSession,
  requireDesktopSession,
  resetDesktopSessions,
} from './projectSession';
import { assignSpeaker, undoAssignSpeaker } from './speakerAssign';

const roots: string[] = [];

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-speaker-assign-'));
  roots.push(root);
  writeFileSync(join(root, 'a.wav'), '');
  return root;
}

function open() {
  const dir = folder();
  return { dir, session: openDesktopSession(dir, [dir]) };
}

afterEach(() => {
  resetDesktopSessions();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('speaker assign', () => {
  it('assigns every unit in one transaction and restores the previous ids', () => {
    const { session } = open();
    const left = seed(session.sessionId, 0, 1, '甲');
    const right = unit(session.sessionId, layerOf(session.sessionId, left), 1, 2, '乙');
    const speaker = callDesktopSession(session.sessionId, 'speakers.create', { name: '阿达' }) as {
      id: string;
    };
    const db = requireDesktopSession(session.sessionId).db;
    expect(() => assignSpeaker(db, { speakerId: speaker.id, unitIds: [left, 'missing'] })).toThrow(
      'unit is missing',
    );
    expect(speakerOf(session.sessionId, left)).toBeNull();

    expect(() =>
      assignSpeaker(db, { speakerId: speaker.id, unitIds: [left, right] }, () => {
        throw new Error('injected');
      }),
    ).toThrow('injected');
    expect(speakerOf(session.sessionId, left)).toBeNull();
    expect(speakerOf(session.sessionId, right)).toBeNull();

    const assigned = assignSpeaker(db, { speakerId: speaker.id, unitIds: [left, right] });
    expect(assigned.units.map((item) => item.speakerId)).toEqual([speaker.id, speaker.id]);
    undoAssignSpeaker(db, assigned.undo!);
    expect(speakerOf(session.sessionId, left)).toBeNull();
    expect(speakerOf(session.sessionId, right)).toBeNull();
    callDesktopSession(session.sessionId, 'reopen', {});
    expect(speakerOf(session.sessionId, left)).toBeNull();
  });

  it('leaves both rows when one unit changed later', () => {
    const { session } = open();
    const left = seed(session.sessionId, 0, 1, '甲');
    const right = unit(session.sessionId, layerOf(session.sessionId, left), 1, 2, '乙');
    const speaker = callDesktopSession(session.sessionId, 'speakers.create', { name: '阿达' }) as {
      id: string;
    };
    const db = requireDesktopSession(session.sessionId).db;
    const assigned = assignSpeaker(db, { speakerId: speaker.id, unitIds: [left, right] });
    db.prepare('UPDATE units SET speaker_id = NULL WHERE id = ?').run(left);
    expect(() => undoAssignSpeaker(db, assigned.undo!)).toThrow('speaker assign undo is stale');
    expect(speakerOf(session.sessionId, right)).toBe(speaker.id);
    expect(speakerOf(session.sessionId, left)).toBeNull();
  });
});

describe('session speaker assign', () => {
  it('undoes the batch, and a catalog edit clears that record', () => {
    const { dir, session } = open();
    const left = seed(session.sessionId, 0, 1, '甲');
    const right = unit(session.sessionId, layerOf(session.sessionId, left), 1, 2, '乙');
    const speaker = callDesktopSession(session.sessionId, 'speakers.create', { name: '阿达' }) as {
      id: string;
    };
    callDesktopSession(session.sessionId, 'speakers.assign', {
      speakerId: speaker.id,
      unitIds: [left, right],
    });
    expect(callDesktopSession(session.sessionId, 'units.undo', {})).toEqual([
      expect.objectContaining({ id: left, speakerId: null }),
      expect.objectContaining({ id: right, speakerId: null }),
    ]);
    expect(() => callDesktopSession(session.sessionId, 'units.undo', {})).toThrow(
      'unit text undo is empty',
    );

    callDesktopSession(session.sessionId, 'speakers.assign', {
      speakerId: speaker.id,
      unitIds: [left, right],
    });
    const language = callDesktopSession(session.sessionId, 'catalog.ensureProjectDefinition', {
      name: { zh: '示例' },
      sourceType: 'user-custom',
      iso6393: 'eng',
    }) as { id: string };
    callDesktopSession(session.sessionId, 'catalog.updateLanguage', {
      id: language.id,
      locale: 'zh',
      value: '木雅',
    });
    expect(() => callDesktopSession(session.sessionId, 'units.undo', {})).toThrow(
      'unit text undo is empty',
    );
    expect(speakerOf(session.sessionId, left)).toBe(speaker.id);

    requireDesktopSession(session.sessionId)
      .db.prepare('UPDATE units SET speaker_id = NULL WHERE id = ?')
      .run(left);
    callDesktopSession(session.sessionId, 'speakers.assign', {
      speakerId: speaker.id,
      unitIds: [left, right],
    });
    closeDesktopSession(session.sessionId);
    const again = openDesktopSession(dir, [dir]);
    expect(() => callDesktopSession(again.sessionId, 'units.undo', {})).toThrow(
      'unit text undo is empty',
    );
    expect(speakerOf(again.sessionId, right)).toBe(speaker.id);
  });
});

function seed(sessionId: string, start: number, end: number, text: string): string {
  const media = callDesktopSession(sessionId, 'media.create', {
    relpath: 'a.wav',
    sha256: 'aa',
    duration: 4,
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
  return unit(sessionId, layer.id, start, end, text);
}

function unit(
  sessionId: string,
  layerId: string,
  start: number,
  end: number,
  text: string,
): string {
  return (
    callDesktopSession(sessionId, 'units.create', {
      layerId,
      startTime: start,
      endTime: end,
      text,
    }) as { id: string }
  ).id;
}

function layerOf(sessionId: string, unitId: string): string {
  return (callDesktopSession(sessionId, 'units.get', { id: unitId }) as { layerId: string })
    .layerId;
}

function speakerOf(sessionId: string, unitId: string): string | null {
  return (
    callDesktopSession(sessionId, 'units.get', { id: unitId }) as { speakerId: string | null }
  ).speakerId;
}
