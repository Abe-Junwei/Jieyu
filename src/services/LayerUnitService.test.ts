import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  db,
  type LayerContentRole,
  type LayerUnitContentDocType,
  type LayerUnitDocType,
  type UnitRelationDocType,
} from '../db';
import { LayerUnitService } from './LayerUnitService';

const NOW = '2026-03-27T00:00:00.000Z';

const DEFAULT_CONTENT_ROLE_PRIORITY: LayerContentRole[] = [
  'primary_text',
  'translation',
  'gloss',
  'note',
  'audio_ref',
];

function makeUnit(overrides: Partial<LayerUnitDocType> & { id: string }): LayerUnitDocType {
  return {
    textId: 'text_1',
    mediaId: 'media_1',
    layerId: 'layer_primary',
    unitType: 'utterance',
    startTime: 1,
    endTime: 2,
    status: 'raw',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeContent(
  overrides: Partial<LayerUnitContentDocType> & { id: string; unitId: string },
): LayerUnitContentDocType {
  return {
    textId: 'text_1',
    layerId: 'layer_primary',
    contentRole: 'primary_text',
    modality: 'text',
    text: '示例内容',
    sourceType: 'human',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeRelation(
  overrides: Partial<UnitRelationDocType> & { id: string; sourceUnitId: string; targetUnitId: string },
): UnitRelationDocType {
  return {
    textId: 'text_1',
    relationType: 'aligned_to',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

async function buildTimelineUnitsForTest(layerId: string, mediaId: string): Promise<Array<{
  unit: LayerUnitDocType;
  primaryContent?: LayerUnitContentDocType;
  contents: LayerUnitContentDocType[];
}>> {
  const units = await db.layer_units.where('[layerId+mediaId]').equals([layerId, mediaId]).toArray();
  units.sort((a, b) => a.startTime - b.startTime);

  const contents = units.length === 0
    ? []
    : await db.layer_unit_contents.where('unitId').anyOf(units.map((unit) => unit.id)).toArray();
  const contentsByUnit = new Map<string, LayerUnitContentDocType[]>();
  for (const content of contents) {
    const bucket = contentsByUnit.get(content.unitId);
    if (bucket) {
      bucket.push(content);
    } else {
      contentsByUnit.set(content.unitId, [content]);
    }
  }

  return units.map((unit) => {
    const unitContents = contentsByUnit.get(unit.id) ?? [];
    const primaryContent = DEFAULT_CONTENT_ROLE_PRIORITY
      .map((role) => unitContents.find((content) => content.contentRole === role))
      .find((content): content is LayerUnitContentDocType => Boolean(content));
    return {
      unit,
      ...(primaryContent ? { primaryContent } : {}),
      contents: unitContents,
    };
  });
}

describe('LayerUnitService', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all([
      db.layer_units.clear(),
      db.layer_unit_contents.clear(),
      db.unit_relations.clear(),
    ]);
  });

  it('creates unit and content atomically', async () => {
    const unit = makeUnit({ id: 'lu_1' });
    const content = makeContent({ id: 'luc_1', unitId: unit.id, text: '你好' });

    await LayerUnitService.createUnitWithContentAtomic(unit, content);

    const storedUnit = await db.layer_units.get(unit.id);
    const storedContents = await db.layer_unit_contents.where('unitId').equals(unit.id).toArray();
    expect(storedUnit?.id).toBe(unit.id);
    expect(storedContents).toHaveLength(1);
    expect(storedContents[0]?.text).toBe('你好');
  });

  it('assigns and clears speaker for multiple units', async () => {
    await db.layer_units.bulkPut([
      makeUnit({ id: 'lu_spk_1' }),
      makeUnit({ id: 'lu_spk_2' }),
    ]);

    await LayerUnitService.assignSpeakerToUnits(['lu_spk_1', 'lu_spk_2'], 'speaker_1');
    expect((await db.layer_units.get('lu_spk_1'))?.speakerId).toBe('speaker_1');
    expect((await db.layer_units.get('lu_spk_2'))?.speakerId).toBe('speaker_1');

    await LayerUnitService.assignSpeakerToUnits(['lu_spk_1', 'lu_spk_2']);
    expect((await db.layer_units.get('lu_spk_1'))?.speakerId).toBeUndefined();
    expect((await db.layer_units.get('lu_spk_2'))?.speakerId).toBeUndefined();
  });

  it('deletes unit with contents and relations cascaded', async () => {
    const unit = makeUnit({ id: 'lu_delete_1' });
    await db.layer_units.put(unit);
    await db.layer_unit_contents.put(makeContent({ id: 'luc_delete_1', unitId: unit.id }));
    await db.unit_relations.bulkPut([
      makeRelation({ id: 'lur_delete_source', sourceUnitId: unit.id, targetUnitId: 'lu_other_1' }),
      makeRelation({ id: 'lur_delete_target', sourceUnitId: 'lu_other_2', targetUnitId: unit.id }),
    ]);

    await LayerUnitService.deleteUnit(unit.id);

    expect(await db.layer_units.get(unit.id)).toBeUndefined();
    expect(await db.layer_unit_contents.where('unitId').equals(unit.id).count()).toBe(0);
    expect(await db.unit_relations.get('lur_delete_source')).toBeUndefined();
    expect(await db.unit_relations.get('lur_delete_target')).toBeUndefined();
  });

  it('splits a unit and clones contents plus source relations', async () => {
    const unit = makeUnit({ id: 'lu_split_1', startTime: 1, endTime: 3 });
    await LayerUnitService.createUnit(unit);
    await LayerUnitService.upsertUnitContent(makeContent({ id: 'luc_split_1', unitId: unit.id, text: '原始文本' }));
    await LayerUnitService.createUnitRelation(
      makeRelation({ id: 'lur_split_1', sourceUnitId: unit.id, targetUnitId: 'lu_parent_1' }),
    );

    const { first, second } = await LayerUnitService.splitUnit(unit.id, 2);

    expect(first.endTime).toBe(2);
    expect(second.startTime).toBe(2);
    expect(second.id).not.toBe(unit.id);

    const secondContents = await db.layer_unit_contents.where('unitId').equals(second.id).toArray();
    expect(secondContents).toHaveLength(1);
    expect(secondContents[0]?.text).toBe('原始文本');

    const secondRelations = await db.unit_relations.where('sourceUnitId').equals(second.id).toArray();
    expect(secondRelations).toHaveLength(1);
    expect(secondRelations[0]?.targetUnitId).toBe('lu_parent_1');
  });

  it('merges adjacent units and cascades removed payloads', async () => {
    const first = makeUnit({ id: 'lu_merge_1', startTime: 1, endTime: 2 });
    const second = makeUnit({ id: 'lu_merge_2', startTime: 2, endTime: 3 });
    await db.layer_units.bulkPut([first, second]);
    await db.layer_unit_contents.put(makeContent({ id: 'luc_merge_2', unitId: second.id }));
    await db.unit_relations.put(makeRelation({ id: 'lur_merge_2', sourceUnitId: second.id, targetUnitId: first.id }));

    const merged = await LayerUnitService.mergeAdjacentUnits(first.id, second.id);

    expect(merged.startTime).toBe(1);
    expect(merged.endTime).toBe(3);
    expect(await db.layer_units.get(second.id)).toBeUndefined();
    expect(await db.layer_unit_contents.where('unitId').equals(second.id).count()).toBe(0);
    expect(await db.unit_relations.where('sourceUnitId').equals(second.id).count()).toBe(0);
  });

  it('builds timeline units with preferred content selection', async () => {
    const unit = makeUnit({ id: 'lu_view_1', startTime: 4, endTime: 5, unitType: 'segment' });
    await LayerUnitService.createUnit(unit);
    await db.layer_unit_contents.bulkPut([
      makeContent({ id: 'luc_view_note', unitId: unit.id, contentRole: 'note', text: '说明' }),
      makeContent({ id: 'luc_view_primary', unitId: unit.id, contentRole: 'primary_text', text: '主文本' }),
    ]);

    const timeline = await buildTimelineUnitsForTest(unit.layerId, unit.mediaId);

    expect(timeline).toHaveLength(1);
    expect(timeline[0]?.unit.id).toBe(unit.id);
    expect(timeline[0]?.primaryContent?.text).toBe('主文本');
    expect(timeline[0]?.contents).toHaveLength(2);
  });
});