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
import { clearSessionEdit } from './sessionEdit';
import {
  assignSpeaker,
  clearSpeaker,
  createAndAssignSpeaker,
  undoAssignSpeaker,
} from './speakerAssign';
import { listSpeakers } from './speakers';

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

describe('speaker assign manuscripts', () => {
  it('rejects a batch that spans manuscripts with no write and no undo frame', () => {
    const { session } = open();
    const left = seed(session.sessionId, 0, 1, '甲');
    const mediaId = (
      callDesktopSession(session.sessionId, 'media.list', {}) as { id: string }[]
    )[0]!.id;
    const otherMs = callDesktopSession(session.sessionId, 'manuscripts.create', {
      title: { zh: '另一稿' },
      mediaId,
    }) as { id: string };
    const otherLayer = callDesktopSession(session.sessionId, 'layers.create', {
      manuscriptId: otherMs.id,
      key: 'tx',
      name: { zh: '转写' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    }) as { id: string };
    const right = unit(session.sessionId, otherLayer.id, 0, 1, '乙');
    const speaker = callDesktopSession(session.sessionId, 'speakers.create', { name: '阿达' }) as {
      id: string;
    };
    clearSessionEdit(session.sessionId);
    const db = requireDesktopSession(session.sessionId).db;
    expect(() => assignSpeaker(db, { speakerId: speaker.id, unitIds: [left, right] })).toThrow(
      'speaker assign spans manuscripts',
    );
    expect(speakerOf(session.sessionId, left)).toBeNull();
    expect(speakerOf(session.sessionId, right)).toBeNull();
    expect(() => clearSpeaker(db, { unitIds: [left, right] })).toThrow(
      'speaker assign spans manuscripts',
    );
    expect(() =>
      callDesktopSession(session.sessionId, 'speakers.assign', {
        speakerId: speaker.id,
        unitIds: [left, right],
      }),
    ).toThrow('speaker assign spans manuscripts');
    expect(() => callDesktopSession(session.sessionId, 'units.undo', {})).toThrow(
      'unit text undo is empty',
    );
  });
});

describe('speaker clear', () => {
  it('clears one card, undoes it, and rejects a write that would overlap', () => {
    const { session } = open();
    const left = seed(session.sessionId, 0, 2000, '甲');
    const layerId = layerOf(session.sessionId, left);
    const ada = callDesktopSession(session.sessionId, 'speakers.create', { name: '阿达' }) as {
      id: string;
    };
    const bai = callDesktopSession(session.sessionId, 'speakers.create', { name: '白玛' }) as {
      id: string;
    };
    const db = requireDesktopSession(session.sessionId).db;
    assignSpeaker(db, { speakerId: ada.id, unitIds: [left] });
    const right = unit(session.sessionId, layerId, 1000, 3000, '乙');
    assignSpeaker(db, { speakerId: bai.id, unitIds: [right] });
    expect(() => assignSpeaker(db, { speakerId: ada.id, unitIds: [right] })).toThrow(
      /same speaker intervals overlap/,
    );
    expect(speakerOf(session.sessionId, right)).toBe(bai.id);

    const cleared = clearSpeaker(db, { unitIds: [right] });
    expect(cleared.undo?.speakerId).toBeNull();
    undoAssignSpeaker(db, cleared.undo!);
    expect(speakerOf(session.sessionId, right)).toBe(bai.id);
    callDesktopSession(session.sessionId, 'speakers.clear', { unitIds: [right] });
    expect(callDesktopSession(session.sessionId, 'units.undo', {})).toEqual([
      expect.objectContaining({ id: right, speakerId: bai.id }),
    ]);
    callDesktopSession(session.sessionId, 'speakers.clear', { unitIds: [right] });
    expect(() => clearSpeaker(db, { unitIds: [left] })).toThrow(/same speaker intervals overlap/);
    expect(speakerOf(session.sessionId, left)).toBe(ada.id);
    expect(speakerOf(session.sessionId, right)).toBeNull();
  });
});

describe('speaker create-and-assign', () => {
  it('assigns in one step, undoes assign only, and rolls back the speaker on failure', () => {
    const { session } = open();
    const left = seed(session.sessionId, 0, 1, '甲');
    const right = unit(session.sessionId, layerOf(session.sessionId, left), 1, 2, '乙');
    clearSessionEdit(session.sessionId);
    const db = requireDesktopSession(session.sessionId).db;

    expect(() =>
      createAndAssignSpeaker(db, { name: '新人', unitIds: [left, right] }, () => {
        throw new Error('injected');
      }),
    ).toThrow('injected');
    expect(listSpeakers(db).map((s) => s.name)).not.toContain('新人');
    expect(speakerOf(session.sessionId, left)).toBeNull();

    const created = callDesktopSession(session.sessionId, 'speakers.createAndAssign', {
      name: '新人',
      unitIds: [left, right],
    }) as { speaker: { id: string; name: string }; units: { id: string; speakerId: string }[] };
    expect(created.speaker.name).toBe('新人');
    expect(created.units.map((u) => u.speakerId)).toEqual([created.speaker.id, created.speaker.id]);
    expect(callDesktopSession(session.sessionId, 'units.undo', {})).toEqual([
      expect.objectContaining({ id: left, speakerId: null }),
      expect.objectContaining({ id: right, speakerId: null }),
    ]);
    expect(speakerOf(session.sessionId, left)).toBeNull();
    expect(listSpeakers(db).some((s) => s.id === created.speaker.id && s.name === '新人')).toBe(
      true,
    );
    expect(() => callDesktopSession(session.sessionId, 'units.redo', {})).not.toThrow();
    expect(speakerOf(session.sessionId, left)).toBe(created.speaker.id);
    expect(listSpeakers(db).filter((s) => s.name === '新人')).toHaveLength(1);
  });
});

describe('speaker assign edit receipts', () => {
  it('replays assign and clear without a second write, and refuses a reused id', () => {
    const { session } = open();
    const left = seed(session.sessionId, 0, 1, '甲');
    const speaker = callDesktopSession(session.sessionId, 'speakers.create', { name: '阿达' }) as {
      id: string;
    };
    clearSessionEdit(session.sessionId);
    const assign = {
      speakerId: speaker.id,
      unitIds: [left],
      operationId: 'op-assign',
    };
    const first = callDesktopSession(session.sessionId, 'speakers.assign', assign);
    expect(callDesktopSession(session.sessionId, 'speakers.assign', assign)).toEqual(first);
    expect(
      callDesktopSession(session.sessionId, 'units.inspectEdit', {
        operationId: 'op-assign',
        kind: 'speakerAssign',
        payload: { speakerId: speaker.id, unitIds: [left] },
      }),
    ).toEqual({ status: 'committed', result: first });
    const other = callDesktopSession(session.sessionId, 'speakers.create', { name: '白玛' }) as {
      id: string;
    };
    expect(() =>
      callDesktopSession(session.sessionId, 'speakers.assign', {
        speakerId: other.id,
        unitIds: [left],
        operationId: 'op-assign',
      }),
    ).toThrow('operation id conflict');
    expect(speakerOf(session.sessionId, left)).toBe(speaker.id);
    // One assign frame: replay did not push another.
    expect(callDesktopSession(session.sessionId, 'units.undo', {})).toEqual([
      expect.objectContaining({ id: left, speakerId: null }),
    ]);

    clearSessionEdit(session.sessionId);
    callDesktopSession(session.sessionId, 'speakers.assign', {
      speakerId: speaker.id,
      unitIds: [left],
    });
    const clear = { unitIds: [left], operationId: 'op-clear' };
    const cleared = callDesktopSession(session.sessionId, 'speakers.clear', clear);
    expect(callDesktopSession(session.sessionId, 'speakers.clear', clear)).toEqual(cleared);
    expect(speakerOf(session.sessionId, left)).toBeNull();
    expect(
      callDesktopSession(session.sessionId, 'units.inspectEdit', {
        operationId: 'op-clear',
        kind: 'speakerClear',
        payload: { unitIds: [left] },
      }),
    ).toEqual({ status: 'committed', result: cleared });
  });

  it('replays createAndAssign without a second speaker', () => {
    const { session } = open();
    const left = seed(session.sessionId, 0, 1, '甲');
    const right = unit(session.sessionId, layerOf(session.sessionId, left), 1, 2, '乙');
    clearSessionEdit(session.sessionId);
    const input = { name: '新人', unitIds: [left, right], operationId: 'op-caa' };
    const first = callDesktopSession(session.sessionId, 'speakers.createAndAssign', input) as {
      speaker: { id: string; name: string };
      units: { id: string; speakerId: string }[];
    };
    const again = callDesktopSession(session.sessionId, 'speakers.createAndAssign', input) as {
      speaker: { id: string };
      units: { id: string; speakerId: string }[];
    };
    expect(again.speaker.id).toBe(first.speaker.id);
    expect(again.units.map((u) => u.speakerId)).toEqual([first.speaker.id, first.speaker.id]);
    const db = requireDesktopSession(session.sessionId).db;
    expect(listSpeakers(db).filter((s) => s.name === '新人')).toHaveLength(1);
    expect(
      callDesktopSession(session.sessionId, 'units.inspectEdit', {
        operationId: 'op-caa',
        kind: 'speakerCreateAndAssign',
        payload: { name: '新人', unitIds: [left, right] },
      }),
    ).toEqual({ status: 'committed', result: first });
    expect(callDesktopSession(session.sessionId, 'units.undo', {})).toEqual([
      expect.objectContaining({ id: left, speakerId: null }),
      expect.objectContaining({ id: right, speakerId: null }),
    ]);
    expect(listSpeakers(db).filter((s) => s.name === '新人')).toHaveLength(1);
  });
});

describe('session speaker assign', () => {
  it('keeps the assign undo stack across create, patch, and redeliver', () => {
    const { session } = open();
    const left = seed(session.sessionId, 0, 1, '甲');
    const ada = callDesktopSession(session.sessionId, 'speakers.create', { name: '阿达' }) as {
      id: string;
    };
    clearSessionEdit(session.sessionId);
    callDesktopSession(session.sessionId, 'speakers.assign', {
      speakerId: ada.id,
      unitIds: [left],
    });
    const bai = callDesktopSession(session.sessionId, 'speakers.create', { name: '白玛' }) as {
      id: string;
    };
    expect(bai.id).toBeTruthy();
    callDesktopSession(session.sessionId, 'speakers.patch', {
      operationId: 'speaker-keep-1',
      id: ada.id,
      name: { expectedRevision: 0, value: '阿达改' },
    });
    callDesktopSession(session.sessionId, 'speakers.redeliver', { operationId: 'speaker-keep-1' });
    expect(callDesktopSession(session.sessionId, 'units.undo', {})).toEqual([
      expect.objectContaining({ id: left, speakerId: null }),
    ]);
    expect(speakerOf(session.sessionId, left)).toBeNull();
  });

  it('undoes the batch, and a catalog edit clears that record', () => {
    const { dir, session } = open();
    const left = seed(session.sessionId, 0, 1, '甲');
    const right = unit(session.sessionId, layerOf(session.sessionId, left), 1, 2, '乙');
    const speaker = callDesktopSession(session.sessionId, 'speakers.create', { name: '阿达' }) as {
      id: string;
    };
    clearSessionEdit(session.sessionId);
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
      startMs: start,
      endMs: end,
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
