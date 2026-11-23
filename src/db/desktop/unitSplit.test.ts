import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { callDesktopSession } from './desktopCall';
import { storeAttachmentFile } from './attachments';
import { splitUnit, undoSplit } from './unitSplit';
import { insertTextAudio } from './unitTextAudios';
import { setFieldValue } from './customFields';
import {
  closeDesktopSession,
  desktopSessionFolder,
  openDesktopSession,
  requireDesktopSession,
  resetDesktopSessions,
} from './projectSession';
import { getAnalysisRoot } from './units';

const roots: string[] = [];

function open() {
  const dir = mkdtempSync(join(tmpdir(), 'jieyu-unit-split-'));
  roots.push(dir);
  writeFileSync(join(dir, 'a.wav'), '');
  return openDesktopSession(dir, [dir]);
}

afterEach(() => {
  resetDesktopSessions();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function seed(
  sessionId: string,
  end = 2000,
): { unitId: string; layerId: string; manuscriptId: string } {
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
  const unit = callDesktopSession(sessionId, 'units.create', {
    layerId: layer.id,
    startMs: 0,
    endMs: end,
    text: '原文句子',
  }) as { id: string };
  return { unitId: unit.id, layerId: layer.id, manuscriptId: manuscript.id };
}

describe('unit split', () => {
  it('moves the original text row onto the right when the cut is at the start', () => {
    const session = open();
    const { unitId } = seed(session.sessionId);
    const db = requireDesktopSession(session.sessionId).db;
    const textId = (
      db.prepare('SELECT id FROM unit_texts WHERE unit_id = ?').get(unitId) as { id: string }
    ).id;
    const split = callDesktopSession(session.sessionId, 'units.split', {
      unitId,
      time: 1000,
      cutIndex: 0,
      rawInput: '原文句子',
    }) as { left: { id: string; text: string }; right: { id: string; text: string } };
    expect(split.right.text).toBe('原文句子');
    expect(split.left.text).toBe('');
    expect(
      (db.prepare('SELECT unit_id FROM unit_texts WHERE id = ?').get(textId) as { unit_id: string })
        .unit_id,
    ).toBe(split.right.id);
  });

  it('keeps the transcription graph when the cut is on the translation layer', () => {
    const session = open();
    const { unitId, layerId, manuscriptId } = seed(session.sessionId);
    callDesktopSession(session.sessionId, 'analysis.segmentWords', { unitId });
    const translation = (
      callDesktopSession(session.sessionId, 'layers.create', {
        manuscriptId,
        key: 'tl',
        name: { zh: '翻译' },
        tierType: 'symbolic-association',
        contentType: 'translation',
        hosts: [{ hostLayerId: layerId }],
      }) as { id: string }
    ).id;
    callDesktopSession(session.sessionId, 'units.updateText', {
      unitId,
      textLayerId: translation,
      text: '翻译句子',
    });
    const split = callDesktopSession(session.sessionId, 'units.split', {
      unitId,
      time: 1000,
      textLayerId: translation,
      cutIndex: 2,
      rawInput: '翻译句子',
    }) as { left: { id: string }; right: { id: string } };
    const db = requireDesktopSession(session.sessionId).db;
    expect(getAnalysisRoot(db, split.left.id)?.graph?.text).toBe('原文句子');
    expect(getAnalysisRoot(db, split.right.id)?.graph ?? null).toBeNull();
    expect(
      db
        .prepare('SELECT body FROM unit_texts WHERE unit_id = ? AND layer_id = ?')
        .get(split.left.id, layerId),
    ).toMatchObject({ body: '原文句子' });
    expect(
      db
        .prepare('SELECT body FROM unit_texts WHERE unit_id = ? AND layer_id = ?')
        .get(split.right.id, translation),
    ).toMatchObject({ body: '句子' });
  });

  it('returns the stored ids when the same split receipt is sent again', () => {
    const session = open();
    const { unitId, layerId } = seed(session.sessionId);
    const first = callDesktopSession(session.sessionId, 'units.split', {
      unitId,
      time: 1000,
      operationId: 'split-once',
    }) as { left: { id: string }; right: { id: string } };
    const again = callDesktopSession(session.sessionId, 'units.split', {
      unitId,
      time: 1000,
      operationId: 'split-once',
    }) as { left: { id: string }; right: { id: string } };
    expect(again).toMatchObject({ left: { id: first.left.id }, right: { id: first.right.id } });
    const db = requireDesktopSession(session.sessionId).db;
    expect(
      (
        db.prepare('SELECT COUNT(*) AS n FROM units WHERE layer_id = ?').get(layerId) as {
          n: number;
        }
      ).n,
    ).toBe(2);
  });

  it('writes nothing when the draft base no longer matches the stored text', () => {
    const session = open();
    const { unitId } = seed(session.sessionId);
    callDesktopSession(session.sessionId, 'units.putTextDraft', {
      unitId,
      rawInput: '未存',
      baseBody: '原文句子',
    });
    const db = requireDesktopSession(session.sessionId).db;
    db.prepare('UPDATE unit_texts SET body = ? WHERE unit_id = ?').run('已改', unitId);
    expect(() =>
      callDesktopSession(session.sessionId, 'units.split', { unitId, time: 1000 }),
    ).toThrow('text draft conflicts');
    expect(callDesktopSession(session.sessionId, 'units.get', { id: unitId })).toMatchObject({
      endMs: 2000,
      text: '已改',
    });
  });

  it('splits a straddling child and rejects one that would be shorter than 10 milliseconds', () => {
    const session = open();
    const { unitId, layerId, manuscriptId } = seed(session.sessionId);
    const sub = (
      callDesktopSession(session.sessionId, 'layers.create', {
        manuscriptId,
        key: 'sub',
        name: { zh: '细分' },
        tierType: 'time-subdivision',
        contentType: 'transcription',
        hosts: [{ hostLayerId: layerId }],
      }) as { id: string }
    ).id;
    const child = (startMs: number, endMs: number) =>
      (
        callDesktopSession(session.sessionId, 'units.create', {
          layerId: sub,
          parentUnitId: unitId,
          startMs,
          endMs,
          text: '子',
        }) as { id: string }
      ).id;
    const leftChild = child(100, 400);
    const rightChild = child(1600, 1900);
    const across = child(400, 1600);
    const split = callDesktopSession(session.sessionId, 'units.split', {
      unitId,
      time: 1000,
    }) as { left: { id: string }; right: { id: string } };
    const db = requireDesktopSession(session.sessionId).db;
    const parentOf = (id: string) =>
      (
        db.prepare('SELECT parent_unit_id FROM units WHERE id = ?').get(id) as {
          parent_unit_id: string;
        }
      ).parent_unit_id;
    expect(parentOf(leftChild)).toBe(split.left.id);
    expect(parentOf(rightChild)).toBe(split.right.id);
    expect(callDesktopSession(session.sessionId, 'units.get', { id: across })).toBeNull();
    const pieces = db
      .prepare(
        'SELECT parent_unit_id, start_ms, end_ms FROM units WHERE layer_id = ? ORDER BY start_ms',
      )
      .all(sub) as { parent_unit_id: string; start_ms: number; end_ms: number }[];
    expect(pieces).toEqual([
      { parent_unit_id: split.left.id, start_ms: 100, end_ms: 400 },
      { parent_unit_id: split.left.id, start_ms: 400, end_ms: 1000 },
      { parent_unit_id: split.right.id, start_ms: 1000, end_ms: 1600 },
      { parent_unit_id: split.right.id, start_ms: 1600, end_ms: 1900 },
    ]);

    const tight = open();
    const again = seed(tight.sessionId);
    const tightSub = (
      callDesktopSession(tight.sessionId, 'layers.create', {
        manuscriptId: again.manuscriptId,
        key: 'sub',
        name: { zh: '细分' },
        tierType: 'time-subdivision',
        contentType: 'transcription',
        hosts: [{ hostLayerId: again.layerId }],
      }) as { id: string }
    ).id;
    callDesktopSession(tight.sessionId, 'units.create', {
      layerId: tightSub,
      parentUnitId: again.unitId,
      startMs: 995,
      endMs: 1005,
      text: '窄',
    });
    expect(() =>
      callDesktopSession(tight.sessionId, 'units.split', { unitId: again.unitId, time: 1000 }),
    ).toThrow('split point is outside the unit');
    expect(callDesktopSession(tight.sessionId, 'units.get', { id: again.unitId })).toMatchObject({
      endMs: 2000,
    });
  });

  it('reuses the split ids on redo and refuses undo after a note or speaker change', () => {
    const session = open();
    const { unitId } = seed(session.sessionId);
    const split = callDesktopSession(session.sessionId, 'units.split', {
      unitId,
      time: 1000,
      operationId: 'split-redo',
    }) as { left: { id: string }; right: { id: string } };
    expect(callDesktopSession(session.sessionId, 'units.undo', {})).toMatchObject({ id: unitId });
    const redone = callDesktopSession(session.sessionId, 'units.redo', {}) as {
      id: string;
    };
    expect(redone.id).toBe(split.left.id);
    const db = requireDesktopSession(session.sessionId).db;
    const ids = (
      db
        .prepare(`SELECT new_id FROM unit_span_maps WHERE operation_id = ? ORDER BY new_id`)
        .all('split-redo') as { new_id: string }[]
    ).map((row) => row.new_id);
    expect(ids).toEqual([split.left.id, split.right.id].sort());
    const projectId = (db.prepare('SELECT id FROM project').get() as { id: string }).id;
    const place = db
      .prepare(
        `SELECT layers.manuscript_id AS manuscriptId
         FROM units JOIN layers ON layers.id = units.layer_id
         WHERE units.id = ?`,
      )
      .get(split.left.id) as { manuscriptId: string };
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO notes (
         id, anchor_kind, project_id, manuscript_id, unit_id, content_json, created_at, updated_at
       ) VALUES (?, 'unit', ?, ?, ?, ?, ?, ?)`,
    ).run('added-note', projectId, place.manuscriptId, split.left.id, '{"zh":"后加"}', now, now);
    expect(() => callDesktopSession(session.sessionId, 'units.undo', {})).toThrow(
      'unit split undo is stale',
    );

    const speakerSession = open();
    const spoken = seed(speakerSession.sessionId);
    const speaker = callDesktopSession(speakerSession.sessionId, 'speakers.create', {
      name: '甲',
    }) as { id: string };
    const spokenSplit = callDesktopSession(speakerSession.sessionId, 'units.split', {
      unitId: spoken.unitId,
      time: 1000,
    }) as { left: { id: string } };
    requireDesktopSession(speakerSession.sessionId)
      .db.prepare('UPDATE units SET speaker_id = ? WHERE id = ?')
      .run(speaker.id, spokenSplit.left.id);
    expect(() => callDesktopSession(speakerSession.sessionId, 'units.undo', {})).toThrow(
      'unit split undo is stale',
    );
  });

  it('keeps a dictionary link through a clearing split, a reopen, and undo', () => {
    const session = open();
    const linked = linkWord(session.sessionId);
    callDesktopSession(session.sessionId, 'units.split', {
      unitId: linked.unitId,
      time: 1000,
      cutIndex: 2,
      rawInput: '原文句子',
    });
    expect(linkRow(session.sessionId, linked.linkId)).toEqual({
      id: linked.linkId,
      attachment: 'detached',
      target_id: linked.tokenId,
    });
    const dir = desktopSessionFolder(session.sessionId);
    closeDesktopSession(session.sessionId);
    const again = openDesktopSession(dir, [dir]);
    expect(linkRow(again.sessionId, linked.linkId)).toEqual({
      id: linked.linkId,
      attachment: 'detached',
      target_id: linked.tokenId,
    });

    const undoSession = open();
    const undoLinked = linkWord(undoSession.sessionId);
    callDesktopSession(undoSession.sessionId, 'units.split', {
      unitId: undoLinked.unitId,
      time: 1000,
      cutIndex: 2,
      rawInput: '原文句子',
    });
    expect(callDesktopSession(undoSession.sessionId, 'units.undo', {})).toMatchObject({
      id: undoLinked.unitId,
    });
    expect(linkRow(undoSession.sessionId, undoLinked.linkId)).toEqual({
      id: undoLinked.linkId,
      attachment: 'active',
      target_id: undoLinked.tokenId,
    });
  });

  it('refuses to undo a split after a new segment field changes', () => {
    const session = open();
    const { unitId } = seed(session.sessionId);
    const field = callDesktopSession(session.sessionId, 'customFields.createDefinition', {
      targetType: 'unit',
      name: { zh: '注' },
      fieldType: 'text',
    }) as { id: string };
    const split = callDesktopSession(session.sessionId, 'units.split', {
      unitId,
      time: 1000,
    }) as { left: { id: string } };
    setFieldValue(requireDesktopSession(session.sessionId).db, {
      definitionId: field.id,
      targetType: 'unit',
      targetId: split.left.id,
      value: '后改',
      expectedRevision: 1,
    });
    expect(() => callDesktopSession(session.sessionId, 'units.undo', {})).toThrow(
      'unit split undo is stale',
    );
    const db = requireDesktopSession(session.sessionId).db;
    expect(
      db
        .prepare(
          `SELECT value_json FROM custom_field_values
           WHERE target_type = 'unit' AND target_id = ? AND definition_id = ?`,
        )
        .get(split.left.id, field.id),
    ).toEqual({ value_json: JSON.stringify('后改') });
    expect(callDesktopSession(session.sessionId, 'units.get', { id: unitId })).toBeNull();
    expect(callDesktopSession(session.sessionId, 'units.get', { id: split.left.id })).toMatchObject(
      {
        id: split.left.id,
      },
    );
  });

  it('keeps a straddling child draft on its new left and closes the sort gap on undo', () => {
    const session = open();
    const { unitId, layerId, manuscriptId } = seed(session.sessionId);
    const later = (
      callDesktopSession(session.sessionId, 'units.create', {
        layerId,
        startMs: 2000,
        endMs: 2400,
        text: '后',
      }) as { id: string }
    ).id;
    const sub = (
      callDesktopSession(session.sessionId, 'layers.create', {
        manuscriptId,
        key: 'sub',
        name: { zh: '细分' },
        tierType: 'time-subdivision',
        contentType: 'transcription',
        hosts: [{ hostLayerId: layerId }],
      }) as { id: string }
    ).id;
    const child = (
      callDesktopSession(session.sessionId, 'units.create', {
        layerId: sub,
        parentUnitId: unitId,
        startMs: 400,
        endMs: 1600,
        text: '子',
      }) as { id: string }
    ).id;
    const db = requireDesktopSession(session.sessionId).db;
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO unit_text_drafts (unit_id, layer_id, raw_input, base_body, updated_at)
       VALUES (?, ?, '子改', '子', ?)`,
    ).run(child, sub, now);
    const sortOf = (id: string) =>
      (db.prepare('SELECT sort_order FROM units WHERE id = ?').get(id) as { sort_order: number })
        .sort_order;
    const laterSort = sortOf(later);
    const rootSort = sortOf(unitId);
    callDesktopSession(session.sessionId, 'units.split', { unitId, time: 1000 });
    const leftChild = db
      .prepare('SELECT id FROM units WHERE layer_id = ? AND start_ms = 400')
      .get(sub) as { id: string };
    expect(
      db.prepare('SELECT unit_id, raw_input FROM unit_text_drafts WHERE layer_id = ?').get(sub),
    ).toEqual({ unit_id: leftChild.id, raw_input: '子改' });
    expect(callDesktopSession(session.sessionId, 'units.undo', {})).toMatchObject({ id: unitId });
    expect(sortOf(unitId)).toBe(rootSort);
    expect(sortOf(later)).toBe(laterSort);
    expect(
      db.prepare('SELECT unit_id, raw_input FROM unit_text_drafts WHERE layer_id = ?').get(sub),
    ).toEqual({ unit_id: child, raw_input: '子改' });
  });
});

function linkWord(sessionId: string): { unitId: string; tokenId: string; linkId: string } {
  const { unitId } = seed(sessionId);
  const words = callDesktopSession(sessionId, 'analysis.segmentWords', { unitId }) as {
    id: string;
  }[];
  const tokenId = words[0]?.id;
  if (tokenId === undefined) throw new Error('word missing');
  callDesktopSession(sessionId, 'lexicon.createLinkedEntry', {
    targetId: tokenId,
    headword: 'word',
    translation: '词',
  });
  const link = requireDesktopSession(sessionId)
    .db.prepare('SELECT id FROM token_lexeme_links WHERE target_id = ? AND attachment = ?')
    .get(tokenId, 'active') as { id: string } | undefined;
  if (link === undefined) throw new Error('link missing');
  return { unitId, tokenId, linkId: link.id };
}

describe('unit split recordings', () => {
  it('refuses undo after a new recording is attached', () => {
    const session = open();
    const { unitId } = seed(session.sessionId);
    const db = requireDesktopSession(session.sessionId).db;
    const split = splitUnit(db, { unitId, time: 1000 });
    const textId = (
      db.prepare('SELECT id FROM unit_texts WHERE unit_id = ?').get(split.left.id) as {
        id: string;
      }
    ).id;
    const clip = storeAttachmentFile(db, desktopSessionFolder(session.sessionId), {
      kind: 'audio',
      mimeType: 'audio/wav',
      bytes: Buffer.from('new-take'),
      operationId: 'split-take',
    });
    insertTextAudio(db, {
      id: randomUUID(),
      unit_text_id: textId,
      file_id: clip.fileId,
      position: 1,
    });
    expect(() => undoSplit(db, split.undo)).toThrow('unit split undo is stale');
    expect(db.prepare('SELECT id FROM units WHERE id = ?').get(split.left.id)).toEqual({
      id: split.left.id,
    });
    expect(
      db.prepare('SELECT file_id FROM unit_text_audios WHERE unit_text_id = ?').get(textId),
    ).toEqual({ file_id: clip.fileId });
  });
});

function linkRow(
  sessionId: string,
  linkId: string,
): { id: string; attachment: string; target_id: string } | undefined {
  return requireDesktopSession(sessionId)
    .db.prepare('SELECT id, attachment, target_id FROM token_lexeme_links WHERE id = ?')
    .get(linkId) as { id: string; attachment: string; target_id: string } | undefined;
}
