import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
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
    await Promise.all([
      db.layer_segments.clear(),
      db.layer_segment_contents.clear(),
      db.segment_links.clear(),
    ]);
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

  // ── splitSegment tests ──

  it('splits a segment at the given time', async () => {
    const seg = makeSegment({ id: 'seg_split_1', startTime: 1.0, endTime: 3.0 });
    await LayerSegmentationV2Service.createSegment(seg);

    const { first, second } = await LayerSegmentationV2Service.splitSegment('seg_split_1', 2.0);

    expect(first.startTime).toBe(1.0);
    expect(first.endTime).toBe(2.0);
    expect(second.startTime).toBe(2.0);
    expect(second.endTime).toBe(3.0);
    expect(second.id).not.toBe('seg_split_1');

    // DB 验证 | Verify DB state
    const dbFirst = await db.layer_segments.get('seg_split_1');
    expect(dbFirst?.endTime).toBe(2.0);
    const allSegs = await db.layer_segments.where('layerId').equals('layer_trc_cmn').toArray();
    expect(allSegs).toHaveLength(2);
  });

  it('clones segment contents to the second segment when splitting', async () => {
    const seg = makeSegment({ id: 'seg_split_with_content', startTime: 1.0, endTime: 3.0 });
    await LayerSegmentationV2Service.createSegment(seg);
    await LayerSegmentationV2Service.upsertSegmentContent(
      makeContent({ id: 'cnt_split_src', segmentId: seg.id, text: '原始内容' }),
    );

    const { second } = await LayerSegmentationV2Service.splitSegment(seg.id, 2.0);

    const firstContents = await db.layer_segment_contents.where('segmentId').equals(seg.id).toArray();
    const secondContents = await db.layer_segment_contents.where('segmentId').equals(second.id).toArray();
    expect(firstContents).toHaveLength(1);
    expect(secondContents).toHaveLength(1);
    expect(secondContents[0]?.text).toBe('原始内容');
  });

  it('rejects split point too close to start boundary', async () => {
    const seg = makeSegment({ id: 'seg_split_close_start', startTime: 1.0, endTime: 3.0 });
    await LayerSegmentationV2Service.createSegment(seg);

    await expect(
      LayerSegmentationV2Service.splitSegment('seg_split_close_start', 1.02),
    ).rejects.toThrow(/too close/);
  });

  it('rejects split point too close to end boundary', async () => {
    const seg = makeSegment({ id: 'seg_split_close_end', startTime: 1.0, endTime: 3.0 });
    await LayerSegmentationV2Service.createSegment(seg);

    await expect(
      LayerSegmentationV2Service.splitSegment('seg_split_close_end', 2.98),
    ).rejects.toThrow(/too close/);
  });

  it('throws when splitting a non-existent segment', async () => {
    await expect(
      LayerSegmentationV2Service.splitSegment('seg_nonexistent', 1.5),
    ).rejects.toThrow(/not found/);
  });

  it('clones source segment_links to the second segment when splitting', async () => {
    const seg = makeSegment({ id: 'seg_split_link', startTime: 1.0, endTime: 3.0 });
    await LayerSegmentationV2Service.createSegmentWithParentConstraint(
      seg, 'utt_parent_split', 1.0, 3.0,
    );
    // 原段有一条 time_subdivision link | Original has a time_subdivision link
    const linksBefore = await db.segment_links.where('sourceSegmentId').equals('seg_split_link').toArray();
    expect(linksBefore).toHaveLength(1);

    const { second } = await LayerSegmentationV2Service.splitSegment('seg_split_link', 2.0);

    // 第一段保留原 link | First keeps original link
    const firstLinks = await db.segment_links.where('sourceSegmentId').equals('seg_split_link').toArray();
    expect(firstLinks).toHaveLength(1);
    expect(firstLinks[0]!.targetSegmentId).toBe('utt_parent_split');

    // 第二段也获得克隆的 link | Second also gets a cloned link
    const secondLinks = await db.segment_links.where('sourceSegmentId').equals(second.id).toArray();
    expect(secondLinks).toHaveLength(1);
    expect(secondLinks[0]!.targetSegmentId).toBe('utt_parent_split');
    expect(secondLinks[0]!.linkType).toBe('time_subdivision');
    expect(secondLinks[0]!.id).not.toBe(firstLinks[0]!.id);
  });

  // ── mergeAdjacentSegments tests ──

  it('merges two adjacent segments', async () => {
    const seg1 = makeSegment({ id: 'seg_merge_1', startTime: 1.0, endTime: 2.0 });
    const seg2 = makeSegment({ id: 'seg_merge_2', startTime: 2.0, endTime: 3.5 });
    await LayerSegmentationV2Service.createSegment(seg1);
    await LayerSegmentationV2Service.createSegment(seg2);

    const merged = await LayerSegmentationV2Service.mergeAdjacentSegments('seg_merge_1', 'seg_merge_2');

    expect(merged.id).toBe('seg_merge_1');
    expect(merged.startTime).toBe(1.0);
    expect(merged.endTime).toBe(3.5);

    // DB 验证 | Verify DB state
    const kept = await db.layer_segments.get('seg_merge_1');
    expect(kept?.startTime).toBe(1.0);
    expect(kept?.endTime).toBe(3.5);
    expect(await db.layer_segments.get('seg_merge_2')).toBeUndefined();
  });

  it('merge cascades deletion of removed segment contents and links', async () => {
    const seg1 = makeSegment({ id: 'seg_mc_1', startTime: 1.0, endTime: 2.0 });
    const seg2 = makeSegment({ id: 'seg_mc_2', startTime: 2.0, endTime: 3.0 });
    await LayerSegmentationV2Service.createSegment(seg1);
    await LayerSegmentationV2Service.createSegment(seg2);
    await LayerSegmentationV2Service.upsertSegmentContent(
      makeContent({ id: 'cnt_mc_2', segmentId: 'seg_mc_2', text: '被合并内容' }),
    );
    await LayerSegmentationV2Service.createSegmentLink(
      makeLink({ id: 'lnk_mc_1', sourceSegmentId: 'seg_mc_2', targetSegmentId: 'seg_mc_1' }),
    );

    await LayerSegmentationV2Service.mergeAdjacentSegments('seg_mc_1', 'seg_mc_2');

    expect(await db.layer_segment_contents.where('segmentId').equals('seg_mc_2').count()).toBe(0);
    expect(await db.segment_links.where('sourceSegmentId').equals('seg_mc_2').count()).toBe(0);
  });

  it('throws when merging with a non-existent segment', async () => {
    const seg = makeSegment({ id: 'seg_merge_exist', startTime: 1.0, endTime: 2.0 });
    await LayerSegmentationV2Service.createSegment(seg);

    await expect(
      LayerSegmentationV2Service.mergeAdjacentSegments('seg_merge_exist', 'seg_ghost'),
    ).rejects.toThrow(/not found/);
  });

  it('rejects merge for non-adjacent segments', async () => {
    const seg1 = makeSegment({ id: 'seg_nadj_1', startTime: 1.0, endTime: 2.0 });
    const seg2 = makeSegment({ id: 'seg_nadj_2', startTime: 2.0, endTime: 3.0 });
    const seg3 = makeSegment({ id: 'seg_nadj_3', startTime: 3.0, endTime: 4.0 });
    await LayerSegmentationV2Service.createSegment(seg1);
    await LayerSegmentationV2Service.createSegment(seg2);
    await LayerSegmentationV2Service.createSegment(seg3);

    await expect(
      LayerSegmentationV2Service.mergeAdjacentSegments(seg1.id, seg3.id),
    ).rejects.toThrow(/adjacent/);
  });

  // ── createSegmentWithParentConstraint 测试 | Tests ──

  it('creates segment clipped to parent utterance range with segment_link', async () => {
    const seg = makeSegment({ id: 'seg_pc_1', startTime: 0.5, endTime: 3.5 });
    const result = await LayerSegmentationV2Service.createSegmentWithParentConstraint(
      seg, 'utt_parent_1', 1.0, 3.0,
    );
    // 裁剪到父 utterance 范围 | Clipped to parent utterance range
    expect(result.startTime).toBe(1.0);
    expect(result.endTime).toBe(3.0);

    // 已写入 DB | Written to DB
    const stored = await db.layer_segments.get('seg_pc_1');
    expect(stored).toBeTruthy();
    expect(stored!.startTime).toBe(1.0);
    expect(stored!.endTime).toBe(3.0);

    // 同时创建了 segment_link | Also created segment_link
    const links = await db.segment_links.where('sourceSegmentId').equals('seg_pc_1').toArray();
    expect(links).toHaveLength(1);
    expect(links[0]!.targetSegmentId).toBe('utt_parent_1');
    expect(links[0]!.linkType).toBe('time_subdivision');
  });

  it('keeps segment unchanged when already inside parent range', async () => {
    const seg = makeSegment({ id: 'seg_pc_2', startTime: 1.5, endTime: 2.5 });
    const result = await LayerSegmentationV2Service.createSegmentWithParentConstraint(
      seg, 'utt_parent_2', 1.0, 3.0,
    );
    expect(result.startTime).toBe(1.5);
    expect(result.endTime).toBe(2.5);
  });

  it('rejects segment too short after clipping to parent', async () => {
    const seg = makeSegment({ id: 'seg_pc_3', startTime: 2.97, endTime: 3.5 });
    await expect(
      LayerSegmentationV2Service.createSegmentWithParentConstraint(
        seg, 'utt_parent_3', 1.0, 3.0,
      ),
    ).rejects.toThrow(/too short/i);
  });
});
