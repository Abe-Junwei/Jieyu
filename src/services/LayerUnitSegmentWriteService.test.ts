import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db, getDb, type LayerUnitContentDocType, type LayerUnitDocType, type UnitRelationDocType } from '../db';
import { LayerUnitSegmentWriteService } from './LayerUnitSegmentWriteService';

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
});
