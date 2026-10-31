import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { callDesktopSession } from './desktopCall';
import {
  closeDesktopSession,
  desktopSessionFolder,
  openDesktopSession,
  requireDesktopSession,
  resetDesktopSessions,
} from './projectSession';
import {
  createDefinition,
  missingUnitFields,
  readFieldValue,
  removeUnitValue,
  setFieldValue,
} from './customFields';
import { mergeUnits, splitUnit, undoMerge, undoSplit } from './unitSpan';
import { getAnalysisRoot, updateUnitText, writeAnalysisRoot } from './units';

const roots: string[] = [];

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-unit-span-'));
  roots.push(root);
  writeFileSync(join(root, 'a.wav'), '');
  return root;
}

afterEach(() => {
  resetDesktopSessions();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('unit span', () => {
  it('copies words, morphemes, notes, and links, then undo removes only the copy', () => {
    const session = open();
    const unitId = seed(session.sessionId, 0, 2, 'pre-fix');
    const words = callDesktopSession(session.sessionId, 'analysis.segmentWords', {
      unitId,
    }) as { id: string }[];
    const morphemes = callDesktopSession(session.sessionId, 'analysis.segmentMorphemes', {
      unitId,
    }) as { id: string }[];
    callDesktopSession(session.sessionId, 'notes.create', {
      anchor: { kind: 'unit', unitId },
      content: { zh: '语段' },
    });
    callDesktopSession(session.sessionId, 'notes.create', {
      anchor: { kind: 'token', unitId, tokenId: words[0]?.id },
      content: { zh: '词' },
    });
    callDesktopSession(session.sessionId, 'lexicon.createLinkedEntry', {
      targetId: words[0]?.id,
      headword: 'prefix',
      translation: '前缀',
    });
    const db = requireDesktopSession(session.sessionId).db;
    const split = splitUnit(db, { unitId, time: 1 });
    expect(split.left.endTime).toBe(1);
    expect(split.right.text).toBe('pre-fix');
    expect(count(db, 'SELECT COUNT(*) AS n FROM tokens WHERE unit_id = ?', unitId)).toBe(1);
    expect(count(db, 'SELECT COUNT(*) AS n FROM tokens WHERE unit_id = ?', split.right.id)).toBe(1);
    expect(count(db, 'SELECT COUNT(*) AS n FROM notes WHERE unit_id = ?', unitId)).toBe(2);
    expect(count(db, 'SELECT COUNT(*) AS n FROM notes WHERE unit_id = ?', split.right.id)).toBe(2);
    expect(
      ids(db, 'SELECT id FROM morphemes WHERE token_id = ?', words[0]?.id ?? '').sort(),
    ).toEqual(morphemes.map((row) => row.id).sort());
    const copiedToken = ids(db, 'SELECT id FROM tokens WHERE unit_id = ?', split.right.id)[0] ?? '';
    expect(ids(db, 'SELECT id FROM morphemes WHERE token_id = ?', copiedToken)).toHaveLength(2);
    expect(
      count(
        db,
        'SELECT COUNT(*) AS n FROM token_lexeme_links WHERE target_id = ?',
        words[0]?.id ?? '',
      ),
    ).toBe(1);
    expect(
      count(db, 'SELECT COUNT(*) AS n FROM token_lexeme_links WHERE target_id = ?', copiedToken),
    ).toBe(1);
    expect(
      callDesktopSession(session.sessionId, 'lexicon.listTokenLinks', { unitId: split.right.id }),
    ).toHaveLength(1);

    undoSplit(db, split.undo);
    expect(callDesktopSession(session.sessionId, 'units.get', { id: unitId })).toMatchObject({
      endTime: 2,
      text: 'pre-fix',
    });
    expect(callDesktopSession(session.sessionId, 'units.get', { id: split.right.id })).toBeNull();
    expect(count(db, 'SELECT COUNT(*) AS n FROM tokens WHERE unit_id = ?', split.right.id)).toBe(0);
    expect(count(db, 'SELECT COUNT(*) AS n FROM notes WHERE unit_id = ?', unitId)).toBe(2);
    callDesktopSession(session.sessionId, 'reopen', {});
    expect(callDesktopSession(session.sessionId, 'units.get', { id: unitId })).toMatchObject({
      endTime: 2,
    });
  });

  it('rolls a failed split back and leaves both units when the row changed later', () => {
    const session = open();
    const unitId = seed(session.sessionId, 0, 2, '原句');
    const db = requireDesktopSession(session.sessionId).db;
    expect(() =>
      splitUnit(db, { unitId, time: 1 }, () => {
        throw new Error('injected');
      }),
    ).toThrow('injected');
    expect(
      callDesktopSession(session.sessionId, 'units.list', {
        layerId: layerOf(session.sessionId, unitId),
      }),
    ).toHaveLength(1);
    expect(callDesktopSession(session.sessionId, 'units.get', { id: unitId })).toMatchObject({
      endTime: 2,
    });

    const split = splitUnit(db, { unitId, time: 1 });
    updateUnitText(db, { unitId, text: '后来' });
    expect(() => undoSplit(db, split.undo)).toThrow('unit split undo is stale');
    expect(
      callDesktopSession(session.sessionId, 'units.get', { id: split.right.id }),
    ).toMatchObject({
      text: '原句',
    });
    expect(callDesktopSession(session.sessionId, 'units.get', { id: unitId })).toMatchObject({
      text: '后来',
      endTime: 1,
    });
  });

  it('keeps the chosen id and restores the removed id', () => {
    const session = open();
    const left = seed(session.sessionId, 0, 1, '甲');
    const right = seedUnit(session.sessionId, layerOf(session.sessionId, left), 1, 2, '乙');
    const db = requireDesktopSession(session.sessionId).db;
    callDesktopSession(session.sessionId, 'notes.create', {
      id: 'keep-note',
      anchor: { kind: 'unit', unitId: left },
      content: { zh: '留' },
    });
    callDesktopSession(session.sessionId, 'notes.create', {
      id: 'drop-note',
      anchor: { kind: 'unit', unitId: right },
      content: { zh: '去' },
    });
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO analysis_candidates (
        id, unit_id, kind, status, graph_json, graph_fingerprint, manuscript_generation,
        analysis_generation, lifecycle_generation, text, projection_json, links_json, notes_json,
        definition_revisions_json, redacted_definition_ids_json, created_at, updated_at
      ) VALUES (?, ?, 'suggestion', 'pending', '{}', 'fp', 0, 0, 0, '乙', '{}', '[]', '[]', '[]', '[]', ?, ?)`,
    ).run('cand-1', right, now, now);
    expect(() =>
      mergeUnits(db, { keepId: left, removeId: right }, () => {
        throw new Error('injected');
      }),
    ).toThrow('injected');
    expect(count(db, 'SELECT COUNT(*) AS n FROM analysis_candidates WHERE id = ?', 'cand-1')).toBe(
      1,
    );

    const merged = mergeUnits(db, { keepId: left, removeId: right });
    expect(merged.unit).toMatchObject({ id: left, startTime: 0, endTime: 2, text: '甲' });
    expect(count(db, 'SELECT COUNT(*) AS n FROM notes WHERE id = ?', 'drop-note')).toBe(0);
    expect(count(db, 'SELECT COUNT(*) AS n FROM notes WHERE id = ?', 'keep-note')).toBe(1);
    expect(count(db, 'SELECT COUNT(*) AS n FROM analysis_candidates WHERE id = ?', 'cand-1')).toBe(
      0,
    );

    undoMerge(db, merged.undo);
    expect(callDesktopSession(session.sessionId, 'units.get', { id: right })).toMatchObject({
      id: right,
      startTime: 1,
      endTime: 2,
      text: '乙',
    });
    expect(count(db, 'SELECT COUNT(*) AS n FROM notes WHERE id = ?', 'drop-note')).toBe(1);
    expect(count(db, 'SELECT COUNT(*) AS n FROM analysis_candidates WHERE id = ?', 'cand-1')).toBe(
      1,
    );
    callDesktopSession(session.sessionId, 'reopen', {});
    expect(callDesktopSession(session.sessionId, 'units.get', { id: right })).toMatchObject({
      text: '乙',
    });

    const other = mergeUnits(requireDesktopSession(session.sessionId).db, {
      keepId: right,
      removeId: left,
    });
    expect(other.unit).toMatchObject({ id: right, startTime: 0, endTime: 2, text: '乙' });
    expect(callDesktopSession(session.sessionId, 'units.get', { id: left })).toBeNull();
    undoMerge(requireDesktopSession(session.sessionId).db, other.undo);
    expect(callDesktopSession(session.sessionId, 'units.get', { id: left })).toMatchObject({
      id: left,
      text: '甲',
      endTime: 1,
    });
  });

  it('copies a required field onto the new unit and rolls back when that field is missing', () => {
    const session = open();
    const unitId = seed(session.sessionId, 0, 2, 'pre-fix');
    const field = callDesktopSession(session.sessionId, 'customFields.createDefinition', {
      targetType: 'unit',
      name: { zh: '注' },
      fieldType: 'text',
      required: true,
    }) as { id: string };
    const db = requireDesktopSession(session.sessionId).db;
    expect(() => splitUnit(db, { unitId, time: 1 })).toThrow('unit is missing a required field');
    expect(callDesktopSession(session.sessionId, 'units.get', { id: unitId })).toMatchObject({
      endTime: 2,
    });
    callDesktopSession(session.sessionId, 'customFields.setValue', {
      definitionId: field.id,
      targetType: 'unit',
      targetId: unitId,
      value: 'filled',
      expectedRevision: 1,
    });
    const split = splitUnit(db, { unitId, time: 1 });
    const dir = desktopSessionFolder(session.sessionId);
    closeDesktopSession(session.sessionId);
    const again = openDesktopSession(dir, [dir]);
    expect(
      callDesktopSession(again.sessionId, 'customFields.missingUnitFields', {
        unitId: split.right.id,
      }),
    ).toEqual([]);
  });

  it('keeps custom reference identity and remaps graph structure onto the copy', () => {
    const session = open();
    const unitId = seed(session.sessionId, 0, 2, 'ka');
    const otherId = seedUnit(session.sessionId, layerOf(session.sessionId, unitId), 2, 3, '乙');
    const db = requireDesktopSession(session.sessionId).db;
    const select = callDesktopSession(session.sessionId, 'customFields.createDefinition', {
      targetType: 'unit',
      name: { zh: '类' },
      fieldType: 'select',
      options: [{ label: { zh: '甲' } }],
    }) as { id: string; options: { id: string }[] };
    const optionId = select.options[0]?.id ?? '';
    const unitRef = callDesktopSession(session.sessionId, 'customFields.createDefinition', {
      targetType: 'unit',
      name: { zh: '引' },
      fieldType: 'ref',
      targetTypes: ['unit'],
      cardinality: 'one',
    }) as { id: string };
    callDesktopSession(session.sessionId, 'notes.create', {
      id: 'unit-note',
      anchor: { kind: 'unit', unitId },
      content: { zh: '语段' },
    });
    const noteField = callDesktopSession(session.sessionId, 'customFields.createDefinition', {
      targetType: 'note',
      name: { zh: '注' },
      fieldType: 'text',
      required: true,
    }) as { id: string };
    const nodeField = callDesktopSession(session.sessionId, 'customFields.createDefinition', {
      targetType: 'analysis-node',
      name: { zh: '记' },
      fieldType: 'text',
      required: true,
    }) as { id: string };
    const nodeRef = callDesktopSession(session.sessionId, 'customFields.createDefinition', {
      targetType: 'analysis-node',
      name: { zh: '内引' },
      fieldType: 'ref',
      targetTypes: ['analysis-node'],
      cardinality: 'one',
    }) as { id: string };
    const danglingRef = callDesktopSession(session.sessionId, 'customFields.createDefinition', {
      targetType: 'analysis-node',
      name: { zh: '失效' },
      fieldType: 'ref',
      targetTypes: ['analysis-node'],
      cardinality: 'one',
    }) as { id: string };
    const relationField = callDesktopSession(session.sessionId, 'customFields.createDefinition', {
      targetType: 'analysis-relation',
      name: { zh: '边' },
      fieldType: 'text',
      required: true,
    }) as { id: string };
    callDesktopSession(session.sessionId, 'customFields.setValue', {
      definitionId: select.id,
      targetType: 'unit',
      targetId: unitId,
      value: optionId,
      expectedRevision: 1,
    });
    const externalRef = { targetType: 'unit', targetId: otherId };
    callDesktopSession(session.sessionId, 'customFields.setValue', {
      definitionId: unitRef.id,
      targetType: 'unit',
      targetId: unitId,
      value: externalRef,
      expectedRevision: 1,
    });
    callDesktopSession(session.sessionId, 'customFields.setValue', {
      definitionId: noteField.id,
      targetType: 'note',
      targetId: 'unit-note',
      value: '记',
      expectedRevision: 1,
    });
    const nodePointer = { targetType: 'analysis-node', targetId: 'n2', unitId };
    const danglingPointer = { targetType: 'analysis-node', targetId: 'n3', unitId };
    writeAnalysisRoot(db, {
      unitId,
      expectedAnalysisGeneration: 0,
      graph: {
        payloadVersion: 1,
        id: 'g1',
        text: 'ka',
        nodes: [
          {
            ...word('n1', 0),
            customFields: {
              [nodeField.id]: 'kept',
              [nodeRef.id]: nodePointer,
              [danglingRef.id]: danglingPointer,
            },
          },
          { ...word('n2', 1), customFields: { [nodeField.id]: 'other' } },
          { ...word('n3', 2), customFields: { [nodeField.id]: 'gone' } },
          {
            id: 'm',
            type: 'morpheme',
            label: 'k',
            domain: { form: { default: 'k' }, index: 0, createdAt: T, updatedAt: T },
            surfaceParts: [{ tokenId: 'n1', formKey: 'default' }],
            customFields: { [nodeField.id]: 'part' },
          },
        ],
        relations: [
          {
            id: 'r1',
            type: 'next',
            sourceId: 'n1',
            targetId: 'n2',
            customFields: { [relationField.id]: 'edge' },
          },
        ],
      },
    });
    const written = getAnalysisRoot(db, unitId);
    writeAnalysisRoot(db, {
      unitId,
      expectedAnalysisGeneration: written?.analysisGeneration ?? 0,
      graph: {
        payloadVersion: 1,
        id: 'g1',
        text: 'ka',
        nodes: (written?.graph?.nodes ?? []).filter((node) => node.id !== 'n3'),
        relations: written?.graph?.relations ?? [],
      },
    });
    const split = callDesktopSession(session.sessionId, 'units.split', {
      unitId,
      time: 1,
    }) as { left: { id: string }; right: { id: string } };
    const copiedNote = db
      .prepare('SELECT id FROM notes WHERE unit_id = ? AND id != ?')
      .get(split.right.id, 'unit-note') as { id: string };
    const copied = getAnalysisRoot(db, split.right.id)?.graph;
    const copiedNode = copied?.nodes.find((node) => node.customFields?.[nodeField.id] === 'kept');
    const copiedRelation = copied?.relations[0];
    expect(readFieldValue(db, select.id, 'unit', split.right.id)).toBe(optionId);
    expect(readFieldValue(db, unitRef.id, 'unit', split.right.id)).toEqual(externalRef);
    expect(readFieldValue(db, noteField.id, 'note', copiedNote.id)).toBe('记');
    expect(copiedNode?.customFields?.[nodeRef.id]).toEqual(nodePointer);
    expect(copiedNode?.customFields?.[danglingRef.id]).toEqual(danglingPointer);
    expect(copiedNode?.id).not.toBe('n1');
    expect(copiedRelation?.sourceId).not.toBe('n1');
    expect(copiedRelation?.targetId).not.toBe('n2');
    expect(copiedRelation?.customFields?.[relationField.id]).toBe('edge');
    expect(copied?.nodes.find((node) => node.type === 'morpheme')?.surfaceParts?.[0]?.tokenId).toBe(
      copiedNode?.id,
    );
    expect(
      getAnalysisRoot(db, unitId)
        ?.graph?.nodes.map((node) => node.id)
        .sort(),
    ).toEqual(['m', 'n1', 'n2']);
    const dir = desktopSessionFolder(session.sessionId);
    closeDesktopSession(session.sessionId);
    const again = openDesktopSession(dir, [dir]);
    const againDb = requireDesktopSession(again.sessionId).db;
    expect(readFieldValue(againDb, unitRef.id, 'unit', split.right.id)).toEqual(externalRef);
    expect(
      getAnalysisRoot(againDb, split.right.id)?.graph?.nodes.find(
        (node) => node.customFields?.[nodeField.id] === 'kept',
      )?.customFields?.[danglingRef.id],
    ).toEqual(danglingPointer);
    expect(
      getAnalysisRoot(againDb, split.right.id)?.graph?.nodes.find(
        (node) => node.customFields?.[nodeField.id] === 'kept',
      )?.customFields?.[nodeRef.id],
    ).toEqual(nodePointer);
  });

  it('rolls back a split that would copy an invalid required reference and keeps the previous undo', () => {
    const session = open();
    const unitId = seed(session.sessionId, 0, 4, 'ka');
    const targetId = seedUnit(session.sessionId, layerOf(session.sessionId, unitId), 4, 5, '乙');
    const db = requireDesktopSession(session.sessionId).db;
    const field = callDesktopSession(session.sessionId, 'customFields.createDefinition', {
      targetType: 'unit',
      name: { zh: '必引' },
      fieldType: 'ref',
      targetTypes: ['unit'],
      cardinality: 'one',
      required: true,
    }) as { id: string };
    callDesktopSession(session.sessionId, 'customFields.setValue', {
      definitionId: field.id,
      targetType: 'unit',
      targetId: unitId,
      value: { targetType: 'unit', targetId: targetId },
      expectedRevision: 1,
    });
    const split = callDesktopSession(session.sessionId, 'units.split', {
      unitId,
      time: 2,
    }) as { left: { id: string; endTime: number }; right: { id: string } };
    removeUnitValue(db, { definitionId: field.id, unitId: split.left.id });
    const optional = createDefinition(db, {
      targetType: 'unit',
      name: { zh: '另' },
      fieldType: 'text',
    });
    setFieldValue(db, {
      definitionId: optional.id,
      targetType: 'unit',
      targetId: split.left.id,
      value: 'still',
      expectedRevision: 1,
    });
    const generation = generationOf(db, split.left.id);
    const fingerprint = getAnalysisRoot(db, split.left.id)?.graphFingerprint ?? '';
    expect(() =>
      callDesktopSession(session.sessionId, 'units.split', { unitId: split.left.id, time: 1 }),
    ).toThrow('unit is missing a required field');
    expect(callDesktopSession(session.sessionId, 'units.get', { id: split.left.id })).toMatchObject(
      { endTime: split.left.endTime },
    );
    expect(generationOf(db, split.left.id)).toBe(generation);
    expect(getAnalysisRoot(db, split.left.id)?.graphFingerprint ?? '').toBe(fingerprint);
    expect(callDesktopSession(session.sessionId, 'units.undo', {})).toMatchObject({
      id: unitId,
      endTime: 4,
    });
    expect(callDesktopSession(session.sessionId, 'units.get', { id: split.right.id })).toBeNull();
  });

  it('keeps a merged-away reference identity and revalidates only the same id', () => {
    const session = open();
    const unitId = seed(session.sessionId, 0, 2, 'ka');
    const targetId = seedUnit(session.sessionId, layerOf(session.sessionId, unitId), 2, 3, '乙');
    const db = requireDesktopSession(session.sessionId).db;
    const field = callDesktopSession(session.sessionId, 'customFields.createDefinition', {
      targetType: 'unit',
      name: { zh: '必引' },
      fieldType: 'ref',
      targetTypes: ['unit'],
      cardinality: 'one',
      required: true,
    }) as { id: string };
    const pointer = { targetType: 'unit', targetId };
    callDesktopSession(session.sessionId, 'customFields.setValue', {
      definitionId: field.id,
      targetType: 'unit',
      targetId: unitId,
      value: pointer,
      expectedRevision: 1,
    });
    const merged = mergeUnits(db, { keepId: unitId, removeId: targetId });
    expect(readFieldValue(db, field.id, 'unit', unitId)).toEqual(pointer);
    const optional = createDefinition(db, {
      targetType: 'unit',
      name: { zh: '另' },
      fieldType: 'text',
    });
    setFieldValue(db, {
      definitionId: optional.id,
      targetType: 'unit',
      targetId: unitId,
      value: 'still',
      expectedRevision: 1,
    });
    expect(() => splitUnit(db, { unitId, time: 1 })).toThrow('unit is missing a required field');
    expect(callDesktopSession(session.sessionId, 'units.get', { id: unitId })).toMatchObject({
      endTime: 3,
      text: 'ka',
    });
    expect(readFieldValue(db, optional.id, 'unit', unitId)).toBe('still');
    undoMerge(db, merged.undo);
    expect(missingUnitFields(db, unitId)).toEqual([]);
    const namesake = (
      callDesktopSession(session.sessionId, 'units.create', {
        layerId: layerOf(session.sessionId, unitId),
        startTime: 3,
        endTime: 4,
        text: '乙',
        fieldValues: { [field.id]: pointer },
      }) as { id: string }
    ).id;
    expect(namesake).not.toBe(targetId);
    expect(readFieldValue(db, field.id, 'unit', unitId)).toEqual(pointer);
  });

  it('rejects a split outside the span and units that cannot merge', () => {
    const session = open();
    const left = seed(session.sessionId, 0, 1, '甲');
    const gap = seedUnit(session.sessionId, layerOf(session.sessionId, left), 2, 3, '乙');
    const otherLayer = callDesktopSession(session.sessionId, 'layers.create', {
      manuscriptId: manuscriptOf(session.sessionId, left),
      key: 'tx2',
      name: { zh: '另一层' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    }) as { id: string };
    const foreign = seedUnit(session.sessionId, otherLayer.id, 1, 2, '丙');
    const db = requireDesktopSession(session.sessionId).db;
    expect(() => splitUnit(db, { unitId: left, time: 0.01 })).toThrow(
      'split point is outside the unit',
    );
    expect(() => mergeUnits(db, { keepId: left, removeId: gap })).toThrow('units are not adjacent');
    expect(() => mergeUnits(db, { keepId: left, removeId: foreign })).toThrow(
      'units are not in the same layer',
    );
  });
});

describe('session unit span undo', () => {
  it('undoes only the newest split, and a text save replaces that record', () => {
    const session = open();
    const unitId = seed(session.sessionId, 0, 2, '原句');
    const first = callDesktopSession(session.sessionId, 'units.split', {
      unitId,
      time: 1,
    }) as { left: { id: string }; right: { id: string } };
    expect(() => callDesktopSession(session.sessionId, 'units.undoText', {})).toThrow(
      'unit text undo is empty',
    );
    const second = callDesktopSession(session.sessionId, 'units.split', {
      unitId: first.left.id,
      time: 0.5,
    }) as { right: { id: string } };
    expect(callDesktopSession(session.sessionId, 'units.undo', {})).toMatchObject({
      id: first.left.id,
      endTime: 1,
    });
    expect(callDesktopSession(session.sessionId, 'units.get', { id: second.right.id })).toBeNull();
    expect(
      callDesktopSession(session.sessionId, 'units.get', { id: first.right.id }),
    ).toMatchObject({
      startTime: 1,
    });
    expect(() => callDesktopSession(session.sessionId, 'units.undo', {})).toThrow(
      'unit text undo is empty',
    );

    callDesktopSession(session.sessionId, 'units.split', { unitId: first.left.id, time: 0.5 });
    callDesktopSession(session.sessionId, 'units.updateText', {
      unitId: first.left.id,
      text: '改过',
    });
    expect(callDesktopSession(session.sessionId, 'units.undo', {})).toMatchObject({ text: '原句' });
    expect(
      callDesktopSession(session.sessionId, 'units.list', {
        layerId: layerOf(session.sessionId, unitId),
      }),
    ).toHaveLength(3);
  });

  it('drops the record after a boundary move or a closed session', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const unitId = seed(session.sessionId, 0, 2, '原句');
    const split = callDesktopSession(session.sessionId, 'units.split', {
      unitId,
      time: 1,
    }) as { left: { id: string }; right: { id: string } };
    callDesktopSession(session.sessionId, 'units.updateBoundary', {
      leftId: split.left.id,
      rightId: split.right.id,
      time: 1.2,
    });
    expect(() => callDesktopSession(session.sessionId, 'units.undo', {})).toThrow(
      'unit text undo is empty',
    );
    expect(callDesktopSession(session.sessionId, 'units.get', { id: split.left.id })).toMatchObject(
      {
        endTime: 1.2,
      },
    );

    callDesktopSession(session.sessionId, 'units.split', { unitId: split.right.id, time: 1.6 });
    closeDesktopSession(session.sessionId);
    const again = openDesktopSession(dir, [dir]);
    expect(() => callDesktopSession(again.sessionId, 'units.undo', {})).toThrow(
      'unit text undo is empty',
    );
    expect(
      callDesktopSession(again.sessionId, 'units.list', {
        layerId: layerOf(again.sessionId, unitId),
      }),
    ).toHaveLength(3);
  });

  it('clears a stale split and does not delete the newer unit', () => {
    const session = open();
    const unitId = seed(session.sessionId, 0, 2, '原句');
    const split = callDesktopSession(session.sessionId, 'units.split', {
      unitId,
      time: 1,
    }) as { right: { id: string } };
    updateUnitText(requireDesktopSession(session.sessionId).db, { unitId, text: '后来' });
    expect(() => callDesktopSession(session.sessionId, 'units.undo', {})).toThrow(
      'unit split undo is stale',
    );
    expect(
      callDesktopSession(session.sessionId, 'units.get', { id: split.right.id }),
    ).toMatchObject({
      text: '原句',
    });
    expect(() => callDesktopSession(session.sessionId, 'units.undo', {})).toThrow(
      'unit text undo is empty',
    );
  });

  it('reads the copied unit after a split that moved morpheme surfaces', () => {
    const session = open();
    const unitId = seed(session.sessionId, 0, 2, 'word');
    callDesktopSession(session.sessionId, 'units.updateText', { unitId, text: 'pre-fix' });
    callDesktopSession(session.sessionId, 'analysis.segmentWords', { unitId });
    callDesktopSession(session.sessionId, 'analysis.segmentMorphemes', { unitId });
    const result = callDesktopSession(session.sessionId, 'units.split', {
      unitId,
      time: 1,
    }) as { right: { id: string } };
    callDesktopSession(session.sessionId, 'reopen', {});
    expect(() =>
      callDesktopSession(session.sessionId, 'analysis.readState', { unitId: result.right.id }),
    ).not.toThrow();
  });
});

function open() {
  const dir = folder();
  return openDesktopSession(dir, [dir]);
}

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
  return seedUnit(sessionId, layer.id, start, end, text);
}

function seedUnit(
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

const T = '2026-10-25T00:00:00.000Z';

function word(id: string, index: number) {
  return {
    id,
    type: 'token' as const,
    label: id,
    domain: {
      form: { default: 'ka' },
      index,
      createdAt: T,
      updatedAt: T,
      provenance: { actorType: 'human' as const, method: 'manual' as const, createdAt: T },
    },
  };
}

function generationOf(db: ReturnType<typeof requireDesktopSession>['db'], unitId: string): number {
  return (
    db
      .prepare(
        `SELECT manuscripts.lifecycle_generation AS generation
         FROM units
         JOIN layers ON layers.id = units.layer_id
         JOIN manuscripts ON manuscripts.id = layers.manuscript_id
         WHERE units.id = ?`,
      )
      .get(unitId) as { generation: number }
  ).generation;
}

function layerOf(sessionId: string, unitId: string): string {
  return (callDesktopSession(sessionId, 'units.get', { id: unitId }) as { layerId: string })
    .layerId;
}

function manuscriptOf(sessionId: string, unitId: string): string {
  const row = requireDesktopSession(sessionId)
    .db.prepare(
      `SELECT layers.manuscript_id AS id
       FROM units JOIN layers ON layers.id = units.layer_id
       WHERE units.id = ?`,
    )
    .get(unitId) as { id: string };
  return row.id;
}

function count(
  db: ReturnType<typeof requireDesktopSession>['db'],
  sql: string,
  id: string,
): number {
  return (db.prepare(sql).get(id) as { n: number }).n;
}

function ids(
  db: ReturnType<typeof requireDesktopSession>['db'],
  sql: string,
  id: string,
): string[] {
  return (db.prepare(sql).all(id) as { id: string }[]).map((row) => row.id);
}
