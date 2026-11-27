import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { callDesktopSession } from './desktopCall';
import { listOrphanActiveUnitTextNoteIds } from './notes';
import {
  closeDesktopSession,
  openDesktopSession,
  requireDesktopSession,
  resetDesktopSessions,
} from './projectSession';

const roots: string[] = [];

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-text-note-carrier-'));
  roots.push(root);
  writeFileSync(join(root, 'a.wav'), '');
  return root;
}

afterEach(() => {
  resetDesktopSessions();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function seed(sessionId: string): { unitId: string; layerId: string; textId: string } {
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
  const unit = callDesktopSession(sessionId, 'units.create', {
    layerId: layer.id,
    startMs: 0,
    endMs: 1000,
    text: 'ka',
  }) as { id: string };
  const text = requireDesktopSession(sessionId)
    .db.prepare(
      `SELECT id FROM unit_texts WHERE unit_id = ? AND layer_id = ? AND role = 'transcription'`,
    )
    .get(unit.id, layer.id) as { id: string };
  return { unitId: unit.id, layerId: layer.id, textId: text.id };
}

function noteOnText(sessionId: string, unitTextId: string, id = 'n1') {
  return callDesktopSession(sessionId, 'notes.create', {
    id,
    anchor: { kind: 'unit_text', unitTextId },
    content: { zh: '备注' },
  }) as { id: string; unitTextId: string | null; attachment: string };
}

describe('unit text note carriers (1b-6 6r)', () => {
  it('keeps the same unit_text id when clearing body with an active note, and readback survives reopen', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const seeded = seed(session.sessionId);
    noteOnText(session.sessionId, seeded.textId);
    callDesktopSession(session.sessionId, 'units.updateText', {
      unitId: seeded.unitId,
      text: '',
    });
    const db = requireDesktopSession(session.sessionId).db;
    expect(db.prepare('SELECT id, body FROM unit_texts WHERE id = ?').get(seeded.textId)).toEqual({
      id: seeded.textId,
      body: '',
    });
    expect(listOrphanActiveUnitTextNoteIds(db)).toEqual([]);
    expect(
      callDesktopSession(session.sessionId, 'notes.list', { unitId: seeded.unitId }),
    ).toMatchObject([{ id: 'n1', unitTextId: seeded.textId, attachment: 'active' }]);

    closeDesktopSession(session.sessionId);
    const again = openDesktopSession(dir, [dir]);
    const reopened = requireDesktopSession(again.sessionId).db;
    expect(
      reopened.prepare('SELECT id, body FROM unit_texts WHERE id = ?').get(seeded.textId),
    ).toEqual({ id: seeded.textId, body: '' });
    expect(listOrphanActiveUnitTextNoteIds(reopened)).toEqual([]);
    expect(
      callDesktopSession(again.sessionId, 'notes.list', { unitId: seeded.unitId }),
    ).toMatchObject([{ id: 'n1', unitTextId: seeded.textId, attachment: 'active' }]);
  });

  it('undoes a clear that kept the note carrier back to the original body and same id', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const seeded = seed(session.sessionId);
    noteOnText(session.sessionId, seeded.textId);
    callDesktopSession(session.sessionId, 'units.updateText', {
      unitId: seeded.unitId,
      text: '',
    });
    expect(callDesktopSession(session.sessionId, 'units.undoText', {})).toMatchObject({
      text: 'ka',
    });
    const db = requireDesktopSession(session.sessionId).db;
    expect(db.prepare('SELECT id, body FROM unit_texts WHERE id = ?').get(seeded.textId)).toEqual({
      id: seeded.textId,
      body: 'ka',
    });
    expect(listOrphanActiveUnitTextNoteIds(db)).toEqual([]);
  });

  it('keeps an empty audio carrier when the last recording is detached but a note remains', async () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const seeded = seed(session.sessionId);
    const manuscriptId = (
      requireDesktopSession(session.sessionId)
        .db.prepare('SELECT manuscript_id AS id FROM layers WHERE id = ?')
        .get(seeded.layerId) as { id: string }
    ).id;
    const audio = callDesktopSession(session.sessionId, 'recordings.createPair', {
      hostLayerId: seeded.layerId,
      kind: 'voice',
      audioName: { zh: '语音' },
      textName: { zh: '语音文本' },
    }) as { audioLayerId: string };
    callDesktopSession(session.sessionId, 'layers.create', {
      manuscriptId,
      key: `text-${audio.audioLayerId.slice(0, 8)}`,
      name: { zh: '语音文本' },
      tierType: 'symbolic-association',
      contentType: 'transcription',
      hosts: [{ hostLayerId: seeded.layerId, preferred: true }],
    });
    const bytes = Buffer.from('clip');
    await callDesktopSession(session.sessionId, 'recordings.attach', {
      unitId: seeded.unitId,
      layerId: audio.audioLayerId,
      mimeType: 'audio/webm;codecs=opus',
      bytes,
      operationId: randomUUID(),
    });
    const carrier = requireDesktopSession(session.sessionId)
      .db.prepare(`SELECT id, body FROM unit_texts WHERE unit_id = ? AND layer_id = ?`)
      .get(seeded.unitId, audio.audioLayerId) as { id: string; body: string };
    expect(carrier.body).toBe('');
    noteOnText(session.sessionId, carrier.id, 'audio-note');
    await callDesktopSession(session.sessionId, 'recordings.detach', {
      unitId: seeded.unitId,
      layerId: audio.audioLayerId,
    });
    const db = requireDesktopSession(session.sessionId).db;
    expect(db.prepare('SELECT id, body FROM unit_texts WHERE id = ?').get(carrier.id)).toEqual({
      id: carrier.id,
      body: '',
    });
    expect(
      db
        .prepare('SELECT COUNT(*) AS n FROM unit_text_audios WHERE unit_text_id = ?')
        .get(carrier.id),
    ).toEqual({ n: 0 });
    expect(listOrphanActiveUnitTextNoteIds(db)).toEqual([]);
    expect(createHash('sha256').update(bytes).digest('hex').length).toBe(64);
  });

  it('still removes notes with the unit when the unit is deleted', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const seeded = seed(session.sessionId);
    noteOnText(session.sessionId, seeded.textId);
    const preview = callDesktopSession(session.sessionId, 'units.deletePreview', {
      unitId: seeded.unitId,
    }) as { fingerprint: string };
    callDesktopSession(session.sessionId, 'units.delete', {
      unitId: seeded.unitId,
      fingerprint: preview.fingerprint,
    });
    const db = requireDesktopSession(session.sessionId).db;
    expect(db.prepare('SELECT id FROM unit_texts WHERE id = ?').get(seeded.textId)).toBeUndefined();
    expect(db.prepare('SELECT id FROM notes WHERE id = ?').get('n1')).toBeUndefined();
    expect(listOrphanActiveUnitTextNoteIds(db)).toEqual([]);
  });
});
