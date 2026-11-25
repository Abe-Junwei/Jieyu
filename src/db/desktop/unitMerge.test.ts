import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { finishAttachmentCleanup, readAttachmentFile, storeAttachmentFile } from './attachments';
import { callDesktopSession } from './desktopCall';
import { createDefinition, missingUnitFields, readFieldValue, setFieldValue } from './customFields';
import { mergeBaseline, mergePreview, mergeUnits, undoMerge } from './unitMerge';
import { insertTextAudio } from './unitTextAudios';
import { finishTextSave, inspectUnitTextSave, putUnitTextDraft, textSaveDigest } from './textSave';
import { putUnitTimeDraft } from './unitTimeDrafts';
import { updateUnitText, writeAnalysisRoot } from './units';
import { openDesktopSession, requireDesktopSession, resetDesktopSessions } from './projectSession';

const roots: string[] = [];
const T = '2026-10-25T00:00:00.000Z';

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-unit-merge-'));
  roots.push(root);
  writeFileSync(join(root, 'a.wav'), '');
  return root;
}

afterEach(() => {
  resetDesktopSessions();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function open() {
  const dir = folder();
  const session = openDesktopSession(dir, [dir]);
  const media = callDesktopSession(session.sessionId, 'media.create', {
    relpath: 'a.wav',
    sha256: 'aa',
    duration: 8,
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
  return { dir, sessionId: session.sessionId, manuscriptId: manuscript.id, layerId: layer.id };
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

function subdivision(
  sessionId: string,
  manuscriptId: string,
  layerId: string,
  key: string,
  tierType = 'time-subdivision',
): string {
  return (
    callDesktopSession(sessionId, 'layers.create', {
      manuscriptId,
      key,
      name: { zh: key },
      tierType,
      contentType: 'transcription',
      hosts: [{ hostLayerId: layerId }],
    }) as { id: string }
  ).id;
}

function textCount(
  db: ReturnType<typeof requireDesktopSession>['db'],
  ...unitIds: string[]
): number {
  return (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM unit_texts WHERE unit_id IN (${unitIds.map(() => '?').join(', ')})`,
      )
      .get(...unitIds) as { n: number }
  ).n;
}

function draftCount(db: ReturnType<typeof requireDesktopSession>['db'], unitId: string): number {
  return (
    db.prepare('SELECT COUNT(*) AS n FROM unit_text_drafts WHERE unit_id = ?').get(unitId) as {
      n: number;
    }
  ).n;
}

function linkCount(db: ReturnType<typeof requireDesktopSession>['db']): { n: number } {
  return db
    .prepare("SELECT COUNT(*) AS n FROM token_lexeme_links WHERE id = 'link-keep'")
    .get() as {
    n: number;
  };
}

function insertToken(
  db: ReturnType<typeof requireDesktopSession>['db'],
  unitId: string,
  id: string,
): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO tokens (
      id, unit_id, token_index, form_json, gloss_json, created_at, updated_at
    ) VALUES (?, ?, 0, '{}', '{}', ?, ?)`,
  ).run(id, unitId, now, now);
}

function graph(text: string, id: string) {
  return {
    payloadVersion: 1,
    id,
    text,
    nodes: [
      {
        id: `${id}-n`,
        type: 'token' as const,
        label: id,
        domain: {
          form: { default: text },
          index: 0,
          createdAt: T,
          updatedAt: T,
          provenance: { actorType: 'human' as const, method: 'manual' as const, createdAt: T },
        },
      },
      {
        id: `${id}-m`,
        type: 'morpheme' as const,
        label: 'm',
        domain: { form: { default: 'm' }, index: 0, createdAt: T, updatedAt: T },
        surfaceParts: [{ tokenId: `${id}-n`, formKey: 'default' }],
      },
    ],
    relations: [],
  };
}

describe('unit merge', () => {
  it('covers the gap and inserts the separator only when both sides have text', () => {
    const { sessionId, layerId } = open();
    const left = unit(sessionId, layerId, 0, 1000, '甲');
    const right = unit(sessionId, layerId, 2000, 3000, '乙');
    const db = requireDesktopSession(sessionId).db;
    const merged = mergeUnits(db, { keepId: left, removeId: right, separator: '、' });
    expect(merged.unit).toMatchObject({ startMs: 0, endMs: 3000, text: '甲、乙' });
    const settings = db.prepare('SELECT settings_json FROM project').get() as {
      settings_json: string;
    };
    expect(JSON.parse(settings.settings_json).mergeSeparator).toBe('、');
    expect(merged.unit.id).not.toBe(left);
    undoMerge(db, merged.undo);

    db.prepare('UPDATE unit_texts SET body = ? WHERE unit_id = ?').run('', right);
    const oneSide = mergeUnits(db, { keepId: left, removeId: right });
    expect(oneSide.unit.text).toBe('甲');
  });

  it('previews the gap and does not write', () => {
    const { sessionId, layerId } = open();
    const left = unit(sessionId, layerId, 0, 1000, '甲');
    const right = unit(sessionId, layerId, 2000, 3000, '乙');
    expect(
      callDesktopSession(sessionId, 'units.mergePreview', { keepId: left, removeId: right }),
    ).toMatchObject({
      keepId: left,
      removeId: right,
      gapMs: 1000,
      separator: ' ',
      noteCount: 0,
      earlier: [],
      later: [],
    });
    const db = requireDesktopSession(sessionId).db;
    expect(db.prepare('SELECT COUNT(*) AS n FROM units').get()).toEqual({ n: 2 });
  });

  it('previews the fixed UI separator even when an old project preference differs', () => {
    const { sessionId, layerId } = open();
    const left = unit(sessionId, layerId, 0, 1000, '甲');
    const right = unit(sessionId, layerId, 2000, 3000, '乙');
    const db = requireDesktopSession(sessionId).db;
    db.prepare('UPDATE project SET settings_json = ?').run('{"mergeSeparator":"、"}');
    const preview = mergePreview(db, { keepId: left, removeId: right });
    expect(preview.separator).toBe(' ');
    expect(preview.texts).toEqual([
      expect.objectContaining({ official: '甲 乙', result: '甲 乙' }),
    ]);
    expect(db.prepare('SELECT settings_json FROM project').get()).toEqual({
      settings_json: '{"mergeSeparator":"、"}',
    });
  });

  it('keeps an empty carrier when a text note remains, and undo restores that row id', () => {
    const { sessionId, layerId } = open();
    const left = unit(sessionId, layerId, 0, 1000, '甲');
    const right = unit(sessionId, layerId, 1000, 2000, '乙');
    const db = requireDesktopSession(sessionId).db;
    const textId = (
      db.prepare('SELECT id FROM unit_texts WHERE unit_id = ?').get(left) as { id: string }
    ).id;
    db.prepare('UPDATE unit_texts SET body = ? WHERE unit_id IN (?, ?)').run('', left, right);
    callDesktopSession(sessionId, 'notes.create', {
      anchor: { kind: 'unit_text', unitTextId: textId },
      content: { zh: '注' },
    });
    const merged = mergeUnits(db, { keepId: left, removeId: right });
    expect(db.prepare('SELECT unit_id, body FROM unit_texts WHERE id = ?').get(textId)).toEqual({
      unit_id: merged.unit.id,
      body: '',
    });
    undoMerge(db, merged.undo);
    expect(db.prepare('SELECT unit_id, body FROM unit_texts WHERE id = ?').get(textId)).toEqual({
      unit_id: left,
      body: '',
    });
  });

  it('reparents a child without moving its time and rejects one outside the span', () => {
    const { sessionId, manuscriptId, layerId } = open();
    const left = unit(sessionId, layerId, 0, 1000, '甲');
    const right = unit(sessionId, layerId, 1000, 2000, '乙');
    const sub = subdivision(sessionId, manuscriptId, layerId, 'sub');
    const child = (
      callDesktopSession(sessionId, 'units.create', {
        layerId: sub,
        parentUnitId: left,
        startMs: 100,
        endMs: 400,
        text: '子',
      }) as { id: string }
    ).id;
    const db = requireDesktopSession(sessionId).db;
    const merged = mergeUnits(db, { keepId: left, removeId: right });
    expect(
      db.prepare('SELECT parent_unit_id, start_ms, end_ms FROM units WHERE id = ?').get(child),
    ).toEqual({ parent_unit_id: merged.unit.id, start_ms: 100, end_ms: 400 });
    undoMerge(db, merged.undo);
    expect(db.prepare('SELECT parent_unit_id FROM units WHERE id = ?').get(child)).toEqual({
      parent_unit_id: left,
    });

    const outsideLeft = unit(sessionId, layerId, 3000, 4000, '丙');
    const outsideRight = unit(sessionId, layerId, 4000, 5000, '丁');
    const outside = (
      callDesktopSession(sessionId, 'units.create', {
        layerId: sub,
        parentUnitId: outsideRight,
        startMs: 4000,
        endMs: 4500,
        text: '外',
      }) as { id: string }
    ).id;
    db.prepare('UPDATE units SET end_ms = 5500 WHERE id = ?').run(outside);
    expect(() => mergeUnits(db, { keepId: outsideLeft, removeId: outsideRight })).toThrow(
      'a child falls outside the merged span',
    );
    expect(callDesktopSession(sessionId, 'units.get', { id: outsideLeft })).toMatchObject({
      id: outsideLeft,
    });
  });

  it('keeps an untimed child and rejects overlapping children', () => {
    const { sessionId, manuscriptId, layerId } = open();
    const left = unit(sessionId, layerId, 0, 1000, '甲');
    const right = unit(sessionId, layerId, 1000, 2000, '乙');
    const symbolic = subdivision(sessionId, manuscriptId, layerId, 'sym', 'symbolic-subdivision');
    const untimed = (
      callDesktopSession(sessionId, 'units.create', {
        layerId: symbolic,
        parentUnitId: left,
        startMs: null,
        endMs: null,
        text: '无',
      }) as { id: string }
    ).id;
    const db = requireDesktopSession(sessionId).db;
    const merged = mergeUnits(db, { keepId: left, removeId: right });
    expect(
      db.prepare('SELECT parent_unit_id, start_ms FROM units WHERE id = ?').get(untimed),
    ).toEqual({ parent_unit_id: merged.unit.id, start_ms: null });

    undoMerge(db, merged.undo);
    const sub = subdivision(sessionId, manuscriptId, layerId, 'sub');
    db.exec(`
      DROP TRIGGER units_same_speaker_no_overlap_insert;
      DROP TRIGGER units_same_speaker_no_overlap_update;
    `);
    const now = new Date().toISOString();
    const insertChild = db.prepare(
      `INSERT INTO units (
        id, layer_id, parent_unit_id, start_ms, end_ms, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    insertChild.run(randomUUID(), sub, left, 100, 500, 0, now, now);
    insertChild.run(randomUUID(), sub, right, 200, 600, 1, now, now);
    expect(() => mergeUnits(db, { keepId: left, removeId: right })).toThrow(
      'child intervals overlap',
    );
    expect(callDesktopSession(sessionId, 'units.get', { id: left })).toMatchObject({ text: '甲' });
  });

  it('writes nothing when fields differ or a time draft is open', () => {
    const { sessionId, layerId } = open();
    const left = unit(sessionId, layerId, 0, 1000, '甲');
    const right = unit(sessionId, layerId, 1000, 2000, '乙');
    const db = requireDesktopSession(sessionId).db;
    const field = createDefinition(db, {
      targetType: 'unit',
      name: { zh: '注' },
      fieldType: 'text',
    });
    setFieldValue(db, {
      definitionId: field.id,
      targetType: 'unit',
      targetId: left,
      value: '甲',
      expectedRevision: 1,
    });
    setFieldValue(db, {
      definitionId: field.id,
      targetType: 'unit',
      targetId: right,
      value: '乙',
      expectedRevision: 1,
    });
    expect(() => mergeUnits(db, { keepId: left, removeId: right })).toThrow('custom fields differ');
    expect(callDesktopSession(sessionId, 'units.get', { id: right })).toMatchObject({ text: '乙' });
    db.prepare('DELETE FROM custom_field_values WHERE target_id IN (?, ?)').run(left, right);
    putUnitTimeDraft(db, { unitId: left, edge: 'end', rawInput: '1.1', baseMs: 1000, issue: null });
    expect(() => mergeUnits(db, { keepId: left, removeId: right })).toThrow(
      'unit has a time draft',
    );
    expect(callDesktopSession(sessionId, 'units.get', { id: left })).toMatchObject({ endMs: 1000 });
  });

  it('rejects a baseline that no longer matches the clips or the children', () => {
    const { sessionId, dir, layerId } = open();
    const left = unit(sessionId, layerId, 0, 1000, '甲');
    const right = unit(sessionId, layerId, 1000, 2000, '乙');
    const db = requireDesktopSession(sessionId).db;
    const textId = (
      db.prepare('SELECT id FROM unit_texts WHERE unit_id = ?').get(left) as { id: string }
    ).id;
    const clip = storeAttachmentFile(db, dir, {
      kind: 'audio',
      mimeType: 'audio/wav',
      bytes: Buffer.from('clip-a'),
      operationId: 'clip-a',
    });
    insertTextAudio(db, {
      id: randomUUID(),
      unit_text_id: textId,
      file_id: clip.fileId,
      position: 1,
    });
    const baseline = mergeBaseline(db, { keepId: left, removeId: right });
    const extra = storeAttachmentFile(db, dir, {
      kind: 'audio',
      mimeType: 'audio/wav',
      bytes: Buffer.from('clip-b'),
      operationId: 'clip-b',
    });
    insertTextAudio(db, {
      id: randomUUID(),
      unit_text_id: textId,
      file_id: extra.fileId,
      position: 2,
    });
    expect(() => mergeUnits(db, { keepId: left, removeId: right, baseline })).toThrow(
      'merge baseline changed',
    );
    db.prepare('DELETE FROM unit_text_audios WHERE file_id = ?').run(extra.fileId);
    const childLayer = (
      callDesktopSession(sessionId, 'layers.create', {
        manuscriptId: (
          db.prepare('SELECT manuscript_id AS id FROM layers WHERE id = ?').get(layerId) as {
            id: string;
          }
        ).id,
        key: 'sub',
        name: { zh: '细分' },
        tierType: 'time-subdivision',
        contentType: 'transcription',
        hosts: [{ hostLayerId: layerId }],
      }) as { id: string }
    ).id;
    const child = (
      callDesktopSession(sessionId, 'units.create', {
        layerId: childLayer,
        parentUnitId: left,
        startMs: 100,
        endMs: 200,
        text: '子',
      }) as { id: string }
    ).id;
    const frozen = mergeBaseline(db, { keepId: left, removeId: right });
    db.prepare('UPDATE unit_texts SET body = ? WHERE unit_id = ?').run('改', child);
    expect(() => mergeUnits(db, { keepId: left, removeId: right, baseline: frozen })).toThrow(
      'merge baseline changed',
    );
    expect(callDesktopSession(sessionId, 'units.get', { id: left })).toMatchObject({ text: '甲' });
  });

  it('keeps one analysis graph and stores two review snapshots when both sides have one', () => {
    const { sessionId, layerId } = open();
    const left = unit(sessionId, layerId, 0, 1000, '甲');
    const right = unit(sessionId, layerId, 1000, 2000, '');
    const db = requireDesktopSession(sessionId).db;
    writeAnalysisRoot(db, {
      unitId: left,
      expectedAnalysisGeneration: 0,
      graph: graph('甲', 'g-left'),
    });
    insertToken(db, left, 'tok-left');
    db.prepare(
      `INSERT INTO lexemes (id, kind, entry_json, created_at, updated_at)
       VALUES ('lex-keep', 'entry', '{}', ?, ?)`,
    ).run(T, T);
    db.prepare(
      `INSERT INTO token_lexeme_links (id, target_type, target_id, lexeme_id, created_at, updated_at)
       VALUES ('link-keep', 'token', 'g-left-n', 'lex-keep', ?, ?)`,
    ).run(T, T);
    const kept = mergeUnits(db, { keepId: left, removeId: right });
    expect(
      db.prepare('SELECT analysis_graph_json FROM units WHERE id = ?').get(kept.unit.id),
    ).toMatchObject({
      analysis_graph_json: expect.stringContaining('g-left'),
    });
    expect(
      db.prepare('SELECT COUNT(*) AS n FROM tokens WHERE unit_id = ?').get(kept.unit.id),
    ).toEqual({ n: 1 });
    expect(linkCount(db)).toEqual({ n: 1 });
    undoMerge(db, kept.undo);
    expect(linkCount(db)).toEqual({ n: 1 });
    const redone = mergeUnits(db, {
      keepId: left,
      removeId: right,
      newId: kept.undo.newId,
    });
    expect(redone.unit.id).toBe(kept.unit.id);
    expect(linkCount(db)).toEqual({ n: 1 });
    undoMerge(db, redone.undo);

    updateUnitText(db, { unitId: right, text: '乙' });
    writeAnalysisRoot(db, {
      unitId: right,
      expectedAnalysisGeneration: 0,
      graph: graph('乙', 'g-right'),
    });
    insertToken(db, right, 'tok-right');
    const both = mergeUnits(db, { keepId: left, removeId: right });
    expect(
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM analysis_candidates
         WHERE unit_id = ? AND kind = 'review-snapshot'`,
        )
        .get(both.unit.id),
    ).toEqual({ n: 2 });
    expect(
      db.prepare('SELECT COUNT(*) AS n FROM tokens WHERE unit_id = ?').get(both.unit.id),
    ).toEqual({
      n: 0,
    });
    expect(
      db.prepare('SELECT analysis_graph_json FROM units WHERE id = ?').get(both.unit.id),
    ).toEqual({ analysis_graph_json: null });
  });

  it('joins a layer that exists only as a draft', () => {
    const { sessionId, manuscriptId, layerId } = open();
    const left = unit(sessionId, layerId, 0, 1000, '');
    const right = unit(sessionId, layerId, 1000, 2000, '');
    const db = requireDesktopSession(sessionId).db;
    putUnitTextDraft(db, { unitId: left, rawInput: '甲稿', baseBody: '' });
    putUnitTextDraft(db, { unitId: right, rawInput: '乙稿', baseBody: '' });
    expect(textCount(db, left, right)).toBe(0);
    const bothDrafts = mergeUnits(db, {
      keepId: left,
      removeId: right,
      baseline: mergePreview(db, { keepId: left, removeId: right }).baseline,
    });
    expect(bothDrafts.unit.text).toBe('甲稿 乙稿');
    expect(draftCount(db, bothDrafts.unit.id)).toBe(0);
    undoMerge(db, bothDrafts.undo);
    expect(draftCount(db, left)).toBe(1);
    expect(draftCount(db, right)).toBe(1);

    const held = unit(sessionId, layerId, 2000, 3000, '甲');
    const bare = unit(sessionId, layerId, 3000, 4000, '');
    putUnitTextDraft(db, { unitId: bare, rawInput: '乙稿', baseBody: '' });
    expect(textCount(db, bare)).toBe(0);
    expect(
      mergeUnits(db, {
        keepId: held,
        removeId: bare,
        baseline: mergePreview(db, { keepId: held, removeId: bare }).baseline,
      }).unit.text,
    ).toBe('甲 乙稿');

    const bareFirst = unit(sessionId, layerId, 4000, 5000, '');
    const heldLater = unit(sessionId, layerId, 5000, 6000, '乙');
    putUnitTextDraft(db, { unitId: bareFirst, rawInput: '甲稿', baseBody: '' });
    expect(textCount(db, bareFirst)).toBe(0);
    expect(
      mergeUnits(db, {
        keepId: bareFirst,
        removeId: heldLater,
        baseline: mergePreview(db, { keepId: bareFirst, removeId: heldLater }).baseline,
      }).unit.text,
    ).toBe('甲稿 乙');

    const host = unit(sessionId, layerId, 6000, 7000, '甲');
    const other = unit(sessionId, layerId, 7000, 8000, '乙');
    const translation = (
      callDesktopSession(sessionId, 'layers.create', {
        manuscriptId,
        key: 'tr',
        name: { zh: '翻译' },
        tierType: 'symbolic-association',
        contentType: 'translation',
        hosts: [{ hostLayerId: layerId }],
      }) as { id: string }
    ).id;
    putUnitTextDraft(db, {
      unitId: host,
      textLayerId: translation,
      rawInput: '译甲',
      baseBody: '',
    });
    putUnitTextDraft(db, {
      unitId: other,
      textLayerId: translation,
      rawInput: '译乙',
      baseBody: '',
    });
    expect(
      db.prepare('SELECT COUNT(*) AS n FROM unit_texts WHERE layer_id = ?').get(translation),
    ).toEqual({ n: 0 });
    expect(() => mergeUnits(db, { keepId: host, removeId: other })).toThrow(
      'merge drafts require confirmation',
    );
    const linked = mergeUnits(db, {
      keepId: host,
      removeId: other,
      baseline: mergePreview(db, { keepId: host, removeId: other }).baseline,
    });
    expect(
      db
        .prepare('SELECT body FROM unit_texts WHERE unit_id = ? AND layer_id = ?')
        .get(linked.unit.id, translation),
    ).toEqual({ body: '译甲 译乙' });
    expect(
      db.prepare('SELECT COUNT(*) AS n FROM unit_text_drafts WHERE layer_id = ?').get(translation),
    ).toEqual({ n: 0 });
    undoMerge(db, linked.undo);
    const preview = mergePreview(db, { keepId: host, removeId: other });
    expect(preview.texts.find((row) => row.layerId === translation)).toMatchObject({
      official: '',
      draft: '译甲 译乙',
      result: '译甲 译乙',
    });
    const corrected = mergeUnits(db, {
      keepId: host,
      removeId: other,
      baseline: preview.baseline,
      textOverrides: [{ layerId: translation, text: '校订译文' }],
    });
    expect(corrected.unit.text).toBe('甲 乙');
    expect(
      db
        .prepare('SELECT body FROM unit_texts WHERE unit_id = ? AND layer_id = ?')
        .get(corrected.unit.id, translation),
    ).toEqual({ body: '校订译文' });
    undoMerge(db, corrected.undo);
    expect(
      db.prepare('SELECT COUNT(*) AS n FROM unit_text_drafts WHERE layer_id = ?').get(translation),
    ).toEqual({ n: 2 });
  });

  it('retargets a reference held by another unit or a note, and undo puts it back', () => {
    const { sessionId, manuscriptId, layerId } = open();
    const left = unit(sessionId, layerId, 0, 1000, '甲');
    const right = unit(sessionId, layerId, 1000, 2000, '乙');
    const third = unit(sessionId, layerId, 3000, 4000, '丙');
    const db = requireDesktopSession(sessionId).db;
    const field = createDefinition(db, {
      targetType: 'unit',
      name: { zh: '外引' },
      fieldType: 'ref',
      targetTypes: ['unit'],
      cardinality: 'one',
    });
    const noteField = createDefinition(db, {
      targetType: 'note',
      name: { zh: '注引' },
      fieldType: 'ref',
      targetTypes: ['unit'],
      cardinality: 'one',
    });
    const pointer = { targetType: 'unit', targetId: left };
    setFieldValue(db, {
      definitionId: field.id,
      targetType: 'unit',
      targetId: third,
      value: pointer,
      expectedRevision: 1,
    });
    db.prepare(
      `INSERT INTO notes (id, anchor_kind, manuscript_id, content_json, created_at, updated_at)
       VALUES ('note-1', 'manuscript', ?, '{"default":"记"}', ?, ?)`,
    ).run(manuscriptId, T, T);
    setFieldValue(db, {
      definitionId: noteField.id,
      targetType: 'note',
      targetId: 'note-1',
      value: { targetType: 'unit', targetId: right },
      expectedRevision: 1,
    });
    const merged = mergeUnits(db, { keepId: left, removeId: right });
    expect(readFieldValue(db, field.id, 'unit', third)).toEqual({
      targetType: 'unit',
      targetId: merged.unit.id,
    });
    expect(readFieldValue(db, noteField.id, 'note', 'note-1')).toEqual({
      targetType: 'unit',
      targetId: merged.unit.id,
    });
    undoMerge(db, merged.undo);
    expect(readFieldValue(db, field.id, 'unit', third)).toEqual(pointer);
    expect(readFieldValue(db, noteField.id, 'note', 'note-1')).toEqual({
      targetType: 'unit',
      targetId: right,
    });
  });

  it('retargets a required reference that pointed at either merged unit', () => {
    const { sessionId, layerId } = open();
    const left = unit(sessionId, layerId, 0, 1000, '甲');
    const right = unit(sessionId, layerId, 1000, 2000, '乙');
    const db = requireDesktopSession(sessionId).db;
    const field = createDefinition(db, {
      targetType: 'unit',
      name: { zh: '必引' },
      fieldType: 'ref',
      targetTypes: ['unit'],
      cardinality: 'one',
      required: true,
    });
    const pointer = { targetType: 'unit', targetId: left };
    setFieldValue(db, {
      definitionId: field.id,
      targetType: 'unit',
      targetId: left,
      value: pointer,
      expectedRevision: 1,
    });
    setFieldValue(db, {
      definitionId: field.id,
      targetType: 'unit',
      targetId: right,
      value: pointer,
      expectedRevision: 1,
    });
    expect(missingUnitFields(db, left)).toEqual([]);
    const merged = mergeUnits(db, { keepId: left, removeId: right });
    expect(missingUnitFields(db, merged.unit.id)).toEqual([]);
    expect(readFieldValue(db, field.id, 'unit', merged.unit.id)).toEqual({
      targetType: 'unit',
      targetId: merged.unit.id,
    });
    undoMerge(db, merged.undo);
    expect(readFieldValue(db, field.id, 'unit', left)).toEqual(pointer);
    expect(readFieldValue(db, field.id, 'unit', right)).toEqual(pointer);
    expect(missingUnitFields(db, left)).toEqual([]);
  });

  it('refuses six clips until one is discarded, and undo can still read every file', async () => {
    const { sessionId, dir, layerId } = open();
    const left = unit(sessionId, layerId, 0, 1000, '甲');
    const right = unit(sessionId, layerId, 1000, 2000, '乙');
    const db = requireDesktopSession(sessionId).db;
    const textOf = (unitId: string) =>
      (db.prepare('SELECT id FROM unit_texts WHERE unit_id = ?').get(unitId) as { id: string }).id;
    const clips = [left, left, left, right, right, right].map((unitId, index) => {
      const stored = storeAttachmentFile(db, dir, {
        kind: 'audio',
        mimeType: 'audio/wav',
        bytes: Buffer.from(`clip-${index}`),
        operationId: `clip-${index}`,
      });
      const id = randomUUID();
      const position =
        (
          db
            .prepare('SELECT COUNT(*) AS n FROM unit_text_audios WHERE unit_text_id = ?')
            .get(textOf(unitId)) as {
            n: number;
          }
        ).n + 1;
      insertTextAudio(db, {
        id,
        unit_text_id: textOf(unitId),
        file_id: stored.fileId,
        position,
      });
      return { id, fileId: stored.fileId };
    });
    expect(() =>
      callDesktopSession(sessionId, 'units.merge', { keepId: left, removeId: right }),
    ).toThrow('too many recordings');
    expect(callDesktopSession(sessionId, 'units.get', { id: left })).toMatchObject({ id: left });
    const discarded = clips[5];
    if (!discarded) throw new Error('clip missing');
    const merged = callDesktopSession(sessionId, 'units.merge', {
      keepId: left,
      removeId: right,
      discardAudioIds: [discarded.id],
    }) as { id: string };
    expect(db.prepare('SELECT COUNT(*) AS n FROM unit_text_audios').get()).toEqual({ n: 5 });
    const cleanup = await finishAttachmentCleanup(db, dir, discarded.fileId, async () => {
      throw new Error('held file was trashed');
    });
    expect(cleanup.state).toBe('cleanup_pending');
    callDesktopSession(sessionId, 'units.undo', {});
    for (const clip of clips) {
      expect(readAttachmentFile(db, dir, clip.fileId).bytes.toString()).toContain('clip-');
    }
    expect(callDesktopSession(sessionId, 'units.get', { id: merged.id })).toBeNull();
  });

  it('refuses undo after a clip or a child changes, and a receipt retry does not merge twice', () => {
    const { sessionId, dir, layerId } = open();
    const left = unit(sessionId, layerId, 0, 1000, '甲');
    const right = unit(sessionId, layerId, 1000, 2000, '乙');
    const db = requireDesktopSession(sessionId).db;
    const textId = (
      db.prepare('SELECT id FROM unit_texts WHERE unit_id = ?').get(left) as { id: string }
    ).id;
    const stored = storeAttachmentFile(db, dir, {
      kind: 'audio',
      mimeType: 'audio/wav',
      bytes: Buffer.from('one'),
      operationId: 'one-clip',
    });
    const clipId = randomUUID();
    insertTextAudio(db, {
      id: clipId,
      unit_text_id: textId,
      file_id: stored.fileId,
      position: 1,
    });
    const sub = (
      callDesktopSession(sessionId, 'layers.create', {
        manuscriptId: (
          db.prepare('SELECT manuscript_id AS id FROM layers WHERE id = ?').get(layerId) as {
            id: string;
          }
        ).id,
        key: 'sub',
        name: { zh: '细分' },
        tierType: 'time-subdivision',
        contentType: 'transcription',
        hosts: [{ hostLayerId: layerId }],
      }) as { id: string }
    ).id;
    const child = (
      callDesktopSession(sessionId, 'units.create', {
        layerId: sub,
        parentUnitId: left,
        startMs: 100,
        endMs: 200,
        text: '子',
      }) as { id: string }
    ).id;
    const operationId = 'merge-once';
    const merged = callDesktopSession(sessionId, 'units.merge', {
      keepId: left,
      removeId: right,
      operationId,
    }) as { id: string };
    const retried = callDesktopSession(sessionId, 'units.merge', {
      keepId: left,
      removeId: right,
      operationId,
    }) as { id: string };
    expect(retried.id).toBe(merged.id);
    db.prepare('DELETE FROM unit_text_audios WHERE id = ?').run(clipId);
    expect(() => callDesktopSession(sessionId, 'units.undo', {})).toThrow(
      'unit merge undo is stale',
    );
    expect(callDesktopSession(sessionId, 'units.get', { id: merged.id })).toMatchObject({
      id: merged.id,
    });
    insertTextAudio(db, {
      id: clipId,
      unit_text_id: textId,
      file_id: stored.fileId,
      position: 1,
    });
    db.prepare('UPDATE unit_texts SET body = ? WHERE unit_id = ?').run('改', child);
    expect(() => callDesktopSession(sessionId, 'units.undo', {})).toThrow(
      'unit merge undo is stale',
    );
    db.prepare('UPDATE unit_texts SET body = ? WHERE unit_id = ?').run('子', child);
    const undone = callDesktopSession(sessionId, 'units.undo', {}) as { id: string };
    expect(undone.id).toBe(left);
    const redone = callDesktopSession(sessionId, 'units.redo', {}) as { id: string };
    expect(redone.id).toBe(merged.id);
    callDesktopSession(sessionId, 'units.undo', {});
    callDesktopSession(sessionId, 'units.undo', {});
    expect(callDesktopSession(sessionId, 'units.get', { id: left })).toMatchObject({ id: left });
    expect(callDesktopSession(sessionId, 'units.get', { id: merged.id })).toBeNull();
  });

  it('restores text save receipts when the merge is undone', () => {
    const { sessionId, layerId } = open();
    const left = unit(sessionId, layerId, 0, 1000, '甲');
    const right = unit(sessionId, layerId, 1000, 2000, '乙');
    const db = requireDesktopSession(sessionId).db;
    const digest = textSaveDigest(left, layerId, '甲');
    finishTextSave(db, {
      operationId: 'save-left',
      digest,
      unitId: left,
      textLayerId: layerId,
      text: '甲',
    });
    const merged = mergeUnits(db, { keepId: left, removeId: right });
    expect(inspectUnitTextSave(db, 'save-left', digest)).toBe('not-submitted');
    undoMerge(db, merged.undo);
    expect(inspectUnitTextSave(db, 'save-left', digest)).toBe('committed');
  });

  it('joins the frozen editor text and records the dropped text row', () => {
    const { sessionId, layerId } = open();
    const left = unit(sessionId, layerId, 0, 1000, '甲');
    const right = unit(sessionId, layerId, 1000, 2000, '乙');
    const db = requireDesktopSession(sessionId).db;
    const rightText = (
      db.prepare('SELECT id FROM unit_texts WHERE unit_id = ?').get(right) as { id: string }
    ).id;
    const leftText = (
      db.prepare('SELECT id FROM unit_texts WHERE unit_id = ?').get(left) as { id: string }
    ).id;
    const merged = mergeUnits(db, {
      keepId: left,
      removeId: right,
      operationId: 'merge-text',
      textLayerId: layerId,
      keepText: '甲甲',
      removeText: '乙乙',
    });
    expect(merged.unit.text).toBe('甲甲 乙乙');
    expect(
      db
        .prepare('SELECT kind, old_id, new_id FROM unit_span_maps WHERE operation_id = ?')
        .get('merge-text'),
    ).toEqual({ kind: 'merge', old_id: rightText, new_id: leftText });
  });

  it('refuses undo after a note is added on the merged unit', () => {
    const { sessionId, manuscriptId, layerId } = open();
    const left = unit(sessionId, layerId, 0, 1000, '甲');
    const right = unit(sessionId, layerId, 1000, 2000, '乙');
    const db = requireDesktopSession(sessionId).db;
    const merged = mergeUnits(db, { keepId: left, removeId: right });
    db.prepare(
      `INSERT INTO notes (
        id, anchor_kind, manuscript_id, unit_id, content_json, created_at, updated_at
      ) VALUES ('note-new', 'unit', ?, ?, '{"default":"后加"}', ?, ?)`,
    ).run(manuscriptId, merged.unit.id, T, T);
    expect(() => undoMerge(db, merged.undo)).toThrow('unit merge undo is stale');
    expect(db.prepare('SELECT id FROM units WHERE id = ?').get(merged.unit.id)).toEqual({
      id: merged.unit.id,
    });
    expect(db.prepare('SELECT id FROM notes WHERE id = ?').get('note-new')).toEqual({
      id: 'note-new',
    });
  });
});
