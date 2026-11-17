import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { callDesktopSession } from './desktopCall';
import { openProject } from './openProject';
import {
  closeDesktopSession,
  openDesktopSession,
  requireDesktopSession,
  resetDesktopSessions,
} from './projectSession';
import {
  inspectUnitTextSave,
  putUnitTextDraft,
  readUnitTextDraft,
  textSaveDigest,
} from './textSave';

const roots: string[] = [];

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-text-save-'));
  roots.push(root);
  writeFileSync(join(root, 'a.wav'), '');
  return root;
}

afterEach(() => {
  resetDesktopSessions();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
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

function generation(sessionId: string, unitId: string): number {
  const row = requireDesktopSession(sessionId)
    .db.prepare(
      `SELECT manuscripts.generation AS generation
       FROM units
       JOIN layers ON layers.id = units.layer_id
       JOIN manuscripts ON manuscripts.id = layers.manuscript_id
       WHERE units.id = ?`,
    )
    .get(unitId) as { generation: number };
  return row.generation;
}

describe('unit text save receipt and draft', () => {
  it('writes a receipt once and rejects a second payload for the same operation', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const unitId = seed(session.sessionId);
    const before = generation(session.sessionId, unitId);
    callDesktopSession(session.sessionId, 'units.updateText', {
      unitId,
      text: 'ta',
      operationId: 'op-1',
    });
    const after = generation(session.sessionId, unitId);
    expect(after).toBe(before + 1);
    callDesktopSession(session.sessionId, 'units.updateText', {
      unitId,
      text: 'ta',
      operationId: 'op-1',
    });
    expect(generation(session.sessionId, unitId)).toBe(after);
    expect(
      inspectUnitTextSave(
        requireDesktopSession(session.sessionId).db,
        'op-1',
        textSaveDigest(unitId, 'ta'),
      ),
    ).toBe('committed');
    expect(
      callDesktopSession(session.sessionId, 'units.inspectTextSave', {
        operationId: 'op-1',
        unitId,
        text: 'ta',
      }),
    ).toBe('committed');
    expect(
      callDesktopSession(session.sessionId, 'units.inspectTextSave', {
        operationId: 'missing',
        unitId,
        text: 'ta',
      }),
    ).toBe('not-submitted');
    expect(() =>
      callDesktopSession(session.sessionId, 'units.updateText', {
        unitId,
        text: 'za',
        operationId: 'op-1',
      }),
    ).toThrow('operation id conflict');
    expect(
      (callDesktopSession(session.sessionId, 'units.get', { id: unitId }) as { text: string }).text,
    ).toBe('ta');
  });

  it('keeps an uncommitted draft across reopen and drops it when that text commits', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const unitId = seed(session.sessionId);
    const draft = putUnitTextDraft(requireDesktopSession(session.sessionId).db, {
      unitId,
      rawInput: '',
      baseBody: 'ka',
    });
    expect(draft?.rawInput).toBe('');
    closeDesktopSession(session.sessionId);
    const reopened = openProject(dir);
    expect(readUnitTextDraft(reopened.db, unitId)).toMatchObject({
      unitId,
      rawInput: '',
      baseBody: 'ka',
    });
    reopened.close();
    const again = openDesktopSession(dir, [dir]);
    callDesktopSession(again.sessionId, 'units.updateText', {
      unitId,
      text: 'ta',
      operationId: 'op-2',
    });
    expect(readUnitTextDraft(requireDesktopSession(again.sessionId).db, unitId)?.rawInput).toBe('');
    putUnitTextDraft(requireDesktopSession(again.sessionId).db, {
      unitId,
      rawInput: 'ta',
      baseBody: 'ka',
    });
    callDesktopSession(again.sessionId, 'units.updateText', {
      unitId,
      text: 'ta',
      operationId: 'op-3',
    });
    expect(readUnitTextDraft(requireDesktopSession(again.sessionId).db, unitId)).toBeNull();
  });

  it('refuses a user_version 27 file without rewriting it', () => {
    const dir = folder();
    openProject(dir).close();
    const file = join(dir, 'project.sqlite');
    const db = new Database(file);
    db.exec('PRAGMA user_version = 27');
    db.close();
    const before = readFileSync(file);
    expect(() => openProject(dir)).toThrow('project.sqlite is not a Jieyu project library');
    expect(readFileSync(file)).toEqual(before);
  });
});
