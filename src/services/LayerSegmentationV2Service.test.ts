import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { featureFlags } from '../ai/config/featureFlags';
import {
  db,
  type LayerSegmentContentDocType,
  type LayerSegmentDocType,
  type SegmentLinkDocType,
} from '../db';
import { LayerSegmentationV2Service } from './LayerSegmentationV2Service';

const NOW = '2026-03-24T00:00:00.000Z';

function makeSegment(overrides: Partial<LayerSegmentDocType> & { id: string }): LayerSegmentDocType {
  return {
    textId: 'text_1',
    mediaId: 'media_1',
    layerId: 'layer_trc_cmn',
    startTime: 1,
    endTime: 2,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeContent(overrides: Partial<LayerSegmentContentDocType> & { id: string; segmentId: string }): LayerSegmentContentDocType {
  return {
    textId: 'text_1',
    layerId: 'layer_trc_cmn',
    modality: 'text',
    text: '示例内容',
    sourceType: 'human',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeLink(overrides: Partial<SegmentLinkDocType> & { id: string; sourceSegmentId: string; targetSegmentId: string }): SegmentLinkDocType {
  return {
    textId: 'text_1',
    linkType: 'equivalent',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('LayerSegmentationV2Service', () => {
  beforeEach(async () => {
    await db.open();
    (featureFlags as { segmentBoundaryV2Enabled: boolean }).segmentBoundaryV2Enabled = true;
    await Promise.all([
      db.layer_segments.clear(),
      db.layer_segment_contents.clear(),
      db.segment_links.clear(),
    ]);
  });

  afterEach(() => {
    (featureFlags as { segmentBoundaryV2Enabled: boolean }).segmentBoundaryV2Enabled = false;
  });

  it('creates and queries segments with contents', async () => {
    const segment = makeSegment({ id: 'seg_1', layerId: 'layer_trc_cmn', mediaId: 'media_1' });
    await LayerSegmentationV2Service.createSegment(segment);

    await LayerSegmentationV2Service.upsertSegmentContent(
      makeContent({ id: 'cnt_1', segmentId: 'seg_1', text: '你好' }),
    );

    const segments = await LayerSegmentationV2Service.listSegmentsByLayerMedia('layer_trc_cmn', 'media_1');
    const contents = await LayerSegmentationV2Service.listSegmentContents('seg_1');

    expect(segments).toHaveLength(1);
    expect(segments[0]?.id).toBe('seg_1');
    expect(contents).toHaveLength(1);
    expect(contents[0]?.text).toBe('你好');
  });

  it('deletes segment and cascades related contents and links', async () => {
    const seg1 = makeSegment({ id: 'seg_del_1' });
    const seg2 = makeSegment({ id: 'seg_del_2' });

    await LayerSegmentationV2Service.createSegment(seg1);
    await LayerSegmentationV2Service.createSegment(seg2);
    await LayerSegmentationV2Service.upsertSegmentContent(makeContent({ id: 'cnt_del_1', segmentId: seg1.id }));
    await LayerSegmentationV2Service.createSegmentLink(
      makeLink({ id: 'lnk_del_1', sourceSegmentId: seg1.id, targetSegmentId: seg2.id }),
    );

    await LayerSegmentationV2Service.deleteSegment(seg1.id);

    expect(await db.layer_segments.get(seg1.id)).toBeUndefined();
    expect(await db.layer_segment_contents.where('segmentId').equals(seg1.id).count()).toBe(0);
    expect(await db.segment_links.where('sourceSegmentId').equals(seg1.id).count()).toBe(0);
    expect(await db.segment_links.where('targetSegmentId').equals(seg1.id).count()).toBe(0);
    expect(await db.layer_segments.get(seg2.id)).toBeTruthy();
  });

  it('gates operations behind feature flag', async () => {
    (featureFlags as { segmentBoundaryV2Enabled: boolean }).segmentBoundaryV2Enabled = false;

    await expect(
      LayerSegmentationV2Service.createSegment(makeSegment({ id: 'seg_flag_off' })),
    ).rejects.toThrow(/segmentBoundaryV2Enabled/);
  });

  it('cleans orphan segments via service API', async () => {
    await db.layer_segments.bulkPut([
      makeSegment({ id: 'seg_orphan' }),
      makeSegment({ id: 'seg_live' }),
    ]);
    await db.layer_segment_contents.put(makeContent({ id: 'cnt_live', segmentId: 'seg_live' }));
    await db.segment_links.put(makeLink({
      id: 'lnk_orphan',
      sourceSegmentId: 'seg_orphan',
      targetSegmentId: 'seg_live',
    }));

    const removed = await LayerSegmentationV2Service.cleanupOrphanSegments(['seg_orphan', 'seg_live']);

    expect(removed).toEqual(['seg_orphan']);
    expect(await db.layer_segments.get('seg_orphan')).toBeUndefined();
    expect(await db.layer_segments.get('seg_live')).toBeTruthy();
    expect(await db.segment_links.get('lnk_orphan')).toBeUndefined();
  });
});
