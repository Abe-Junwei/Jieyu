import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { featureFlags } from '../ai/config/featureFlags';
import { db, getDb, type LayerSegmentContentDocType, type LayerSegmentDocType, type SegmentLinkDocType } from '../db';
import { LegacyMirrorService } from './LegacyMirrorService';

const NOW = '2026-03-27T00:00:00.000Z';

describe('LegacyMirrorService', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all([
      db.layer_segments.clear(),
      db.layer_segment_contents.clear(),
      db.segment_links.clear(),
      db.layer_units.clear(),
      db.layer_unit_contents.clear(),
      db.unit_relations.clear(),
    ]);
    (featureFlags as { legacySegmentationMirrorWriteEnabled: boolean }).legacySegmentationMirrorWriteEnabled = true;
  });

  afterEach(() => {
    (featureFlags as { legacySegmentationMirrorWriteEnabled: boolean }).legacySegmentationMirrorWriteEnabled = true;
  });

  it('can skip legacy segmentation insert and update writes while keeping LayerUnit rows current', async () => {
    const database = await getDb();
    (featureFlags as { legacySegmentationMirrorWriteEnabled: boolean }).legacySegmentationMirrorWriteEnabled = false;

    const segment: LayerSegmentDocType = {
      id: 'seg_flag_1',
      textId: 'text_flag',
      mediaId: 'media_flag',
      layerId: 'layer_flag',
      startTime: 0,
      endTime: 1,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const content: LayerSegmentContentDocType = {
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
    const link: SegmentLinkDocType = {
      id: 'lnk_flag_1',
      textId: 'text_flag',
      sourceSegmentId: 'seg_flag_1',
      targetSegmentId: 'utt_flag_1',
      linkType: 'time_subdivision',
      createdAt: NOW,
      updatedAt: NOW,
    };

    await LegacyMirrorService.insertSegments(database, [segment]);
    await LegacyMirrorService.insertSegmentContents(database, [content]);
    await LegacyMirrorService.insertSegmentLinks(database, [link]);
    await LegacyMirrorService.updateSegmentPatch(database, segment.id, {
      startTime: 0.25,
      endTime: 0.9,
      updatedAt: '2026-03-27T00:01:00.000Z',
    });

    expect(await db.layer_segments.get(segment.id)).toBeUndefined();
    expect(await db.layer_segment_contents.get(content.id)).toBeUndefined();
    expect(await db.segment_links.get(link.id)).toBeUndefined();

    const unit = await db.layer_units.get(segment.id);
    const unitContent = await db.layer_unit_contents.get(content.id);
    const relation = await db.unit_relations.get(link.id);

    expect(unit?.startTime).toBe(0.25);
    expect(unit?.endTime).toBe(0.9);
    expect(unitContent?.unitId).toBe(segment.id);
    expect(unitContent?.text).toBe('hello');
    expect(relation?.sourceUnitId).toBe(segment.id);
    expect(relation?.targetUnitId).toBe('utt_flag_1');
    expect(relation?.relationType).toBe('derived_from');
  });
});