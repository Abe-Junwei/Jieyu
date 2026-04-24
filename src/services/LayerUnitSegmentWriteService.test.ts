import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db, getDb, type LayerUnitContentDocType, type LayerUnitDocType, type UnitRelationDocType } from '../db';
import { LayerUnitSegmentWriteService } from './LayerUnitSegmentWriteService';
import { deleteLayerUnitGraphByRecordIds } from './LayerUnitSegmentWritePrimitives';

const NOW = '2026-03-27T00:00:00.000Z';

describe('LayerUnitSegmentWriteService', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all([
      db.layer_units.clear(),
      db.layer_unit_contents.clear(),
      db.unit_relations.clear(),
    ]);
  });

  afterEach(() => {
    // noop
  });

  it('writes segment graph into LayerUnit canonical tables', async () => {
    const database = await getDb();

    const segment: LayerUnitDocType = {
      id: 'seg_flag_1',
      textId: 'text_flag',
      mediaId: 'media_flag',
      layerId: 'layer_flag',
      startTime: 0,
      endTime: 1,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const content: LayerUnitContentDocType = {
      id: 'cnt_flag_1',
      textId: 'text_flag',
      segmentId: 'seg_flag_1',
      layerId: 'layer_flag',
      modality: 'text',
      text: 'hello',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    };
    const link: UnitRelationDocType = {
      id: 'lnk_flag_1',
      textId: 'text_flag',
      sourceSegmentId: 'seg_flag_1',
      targetSegmentId: 'utt_flag_1',
      linkType: 'time_subdivision',
      createdAt: NOW,
      updatedAt: NOW,
    };

    await LayerUnitSegmentWriteService.insertSegments(database, [segment]);
    await LayerUnitSegmentWriteService.insertSegmentContents(database, [content]);
    await LayerUnitSegmentWriteService.insertSegmentLinks(database, [link]);
    await LayerUnitSegmentWriteService.updateSegmentPatch(database, segment.id, {
      startTime: 0.25,
      endTime: 0.9,
      updatedAt: '2026-03-27T00:01:00.000Z',
    });

    const unit = await db.layer_units.get(segment.id);
    const unitContent = await db.layer_unit_contents.get(content.id);
    const relation = await db.unit_relations.get(link.id);

    expect(unit?.startTime).toBe(0.25);
    expect(unit?.endTime).toBe(0.9);
    expect(unitContent?.unitId).toBe(segment.id);
    expect(unitContent?.text).toBe('hello');
    expect(unitContent?.segmentId).toBeUndefined();
    expect(relation?.sourceUnitId).toBe(segment.id);
    expect(relation?.targetUnitId).toBe('utt_flag_1');
    expect(relation?.relationType).toBe('derived_from');
    expect(relation?.sourceSegmentId).toBeUndefined();
    expect(relation?.targetSegmentId).toBeUndefined();
    expect(relation?.linkType).toBeUndefined();
  });

  it('deleteLayerUnitGraphByRecordIds removes units, contents, and relations in one write transaction (ARCH-3)', async () => {
    const database = await getDb();

    const unit: LayerUnitDocType = {
      id: 'arch3_u1',
      textId: 'arch3_t',
      mediaId: 'arch3_m',
      layerId: 'arch3_l',
      startTime: 0,
      endTime: 1,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const content: LayerUnitContentDocType = {
      id: 'arch3_c1',
      textId: 'arch3_t',
      segmentId: 'arch3_u1',
      layerId: 'arch3_l',
      modality: 'text',
      text: 'x',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    };
    const relation: UnitRelationDocType = {
      id: 'arch3_r1',
      textId: 'arch3_t',
      sourceSegmentId: 'arch3_u1',
      targetSegmentId: 'arch3_other',
      linkType: 'time_subdivision',
      createdAt: NOW,
      updatedAt: NOW,
    };

    await db.layer_units.bulkPut([unit]);
    await db.layer_unit_contents.bulkPut([content]);
    await db.unit_relations.bulkPut([relation]);

    await deleteLayerUnitGraphByRecordIds(database, {
      unitIds: [unit.id],
      contentIds: [content.id],
      relationIds: [relation.id],
    });

    expect(await db.layer_units.get(unit.id)).toBeUndefined();
    expect(await db.layer_unit_contents.get(content.id)).toBeUndefined();
    expect(await db.unit_relations.get(relation.id)).toBeUndefined();
  });

  it('upsertSegmentGraph writes units, contents, and relations in one rw transaction (ARCH-3)', async () => {
    const database = await getDb();

    const segment: LayerUnitDocType = {
      id: 'ug_seg_1',
      textId: 'ug_t',
      mediaId: 'ug_m',
      layerId: 'ug_l',
      startTime: 0,
      endTime: 1,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const content: LayerUnitContentDocType = {
      id: 'ug_c1',
      textId: 'ug_t',
      segmentId: 'ug_seg_1',
      layerId: 'ug_l',
      modality: 'text',
      text: 'g',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    };
    const link: UnitRelationDocType = {
      id: 'ug_r1',
      textId: 'ug_t',
      sourceSegmentId: 'ug_seg_1',
      targetSegmentId: 'ug_parent',
      linkType: 'time_subdivision',
      createdAt: NOW,
      updatedAt: NOW,
    };

    await LayerUnitSegmentWriteService.upsertSegmentGraph(database, {
      segments: [segment],
      contents: [content],
      links: [link],
    });

    const u = await db.layer_units.get('ug_seg_1');
    const c = await db.layer_unit_contents.get('ug_c1');
    const r = await db.unit_relations.get('ug_r1');
    expect(u?.unitType).toBe('segment');
    expect(c?.unitId).toBe('ug_seg_1');
    expect(r?.sourceUnitId).toBe('ug_seg_1');
  });
});
