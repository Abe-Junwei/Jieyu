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
      db.layer_units.clear(),
      db.layer_unit_contents.clear(),
      db.unit_relations.clear(),
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

  it('mirrors segment/content writes into layer_units tables', async () => {
    const segment = makeSegment({ id: 'seg_unit_sync_1' });
    const content = makeContent({ id: 'cnt_unit_sync_1', segmentId: 'seg_unit_sync_1', text: '同步内容' });

    await LayerSegmentationV2Service.createSegmentWithContentAtomic(segment, content);

    const unit = await db.layer_units.get(segment.id);
    const unitContent = await db.layer_unit_contents.get(content.id);
    expect(unit?.unitType).toBe('segment');
    expect(unit?.layerId).toBe(segment.layerId);
    expect(unitContent?.unitId).toBe(segment.id);
    expect(unitContent?.text).toBe('同步内容');
  });

  it('supports canonical create and update flow', async () => {
    const segment = makeSegment({ id: 'seg_unit_only_write_1' });
    const content = makeContent({ id: 'cnt_unit_only_write_1', segmentId: 'seg_unit_only_write_1', text: '仅写 LayerUnit' });

    await LayerSegmentationV2Service.createSegmentWithContentAtomic(segment, content);
    await LayerSegmentationV2Service.updateSegment(segment.id, {
      startTime: 1.25,
      endTime: 2.25,
      updatedAt: '2026-03-27T00:01:00.000Z',
    });

    const segments = await LayerSegmentationV2Service.listSegmentsByLayerMedia(segment.layerId, segment.mediaId);
    const contents = await LayerSegmentationV2Service.listSegmentContents(segment.id);

    expect(await db.layer_units.get(segment.id)).toEqual(expect.objectContaining({
      startTime: 1.25,
      endTime: 2.25,
    }));
    expect(await db.layer_unit_contents.get(content.id)).toEqual(expect.objectContaining({
      unitId: segment.id,
      text: '仅写 LayerUnit',
    }));
    expect(segments).toHaveLength(1);
    expect(segments[0]?.id).toBe(segment.id);
    expect(segments[0]?.startTime).toBe(1.25);
    expect(contents).toHaveLength(1);
    expect(contents[0]?.id).toBe(content.id);
  });

  it('lists segments and contents from layer_units when legacy rows are absent', async () => {
    await db.layer_units.put({
      id: 'seg_unit_only_1',
      textId: 'text_1',
      mediaId: 'media_1',
      layerId: 'layer_trc_cmn',
      unitType: 'segment',
      startTime: 1,
      endTime: 2,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.layer_unit_contents.put({
      id: 'cnt_unit_only_1',
      textId: 'text_1',
      unitId: 'seg_unit_only_1',
      layerId: 'layer_trc_cmn',
      contentRole: 'primary_text',
      modality: 'text',
      text: '只存在于 LayerUnit',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const segments = await LayerSegmentationV2Service.listSegmentsByLayerMedia('layer_trc_cmn', 'media_1');
    const contents = await LayerSegmentationV2Service.listSegmentContents('seg_unit_only_1');

    expect(segments).toHaveLength(1);
    expect(segments[0]?.id).toBe('seg_unit_only_1');
    expect(contents).toHaveLength(1);
    expect(contents[0]?.text).toBe('只存在于 LayerUnit');
  });

  it('deletes segment content from legacy and LayerUnit tables', async () => {
    await db.layer_unit_contents.put({
      id: 'cnt_delete_1',
      textId: 'text_1',
      unitId: 'seg_delete_1',
      layerId: 'layer_trc_cmn',
      contentRole: 'primary_text',
      modality: 'text',
      text: 'to-delete',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });

    await LayerSegmentationV2Service.deleteSegmentContent('cnt_delete_1');

    expect(await db.layer_unit_contents.get('cnt_delete_1')).toBeUndefined();
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

    expect(await db.layer_units.get(seg1.id)).toBeUndefined();
    expect(await db.layer_unit_contents.where('unitId').equals(seg1.id).count()).toBe(0);
    expect(await db.unit_relations.where('sourceUnitId').equals(seg1.id).count()).toBe(0);
    expect(await db.unit_relations.where('targetUnitId').equals(seg1.id).count()).toBe(0);
    expect(await db.layer_units.get(seg2.id)).toBeTruthy();
  });

  it('deletes LayerUnit-only segment and cascades unit contents and links', async () => {
    await db.layer_units.put({
      id: 'seg_unit_delete_1',
      textId: 'text_1',
      mediaId: 'media_1',
      layerId: 'layer_trc_cmn',
      unitType: 'segment',
      startTime: 1,
      endTime: 2,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.layer_unit_contents.put({
      id: 'cnt_unit_delete_1',
      textId: 'text_1',
      unitId: 'seg_unit_delete_1',
      layerId: 'layer_trc_cmn',
      contentRole: 'primary_text',
      modality: 'text',
      text: 'LayerUnit only',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.unit_relations.put({
      id: 'lnk_unit_delete_1',
      textId: 'text_1',
      sourceUnitId: 'seg_unit_delete_1',
      targetUnitId: 'utt_parent_delete_1',
      relationType: 'derived_from',
      createdAt: NOW,
      updatedAt: NOW,
    });

    await LayerSegmentationV2Service.deleteSegment('seg_unit_delete_1');

    expect(await db.layer_units.get('seg_unit_delete_1')).toBeUndefined();
    expect(await db.layer_unit_contents.get('cnt_unit_delete_1')).toBeUndefined();
    expect(await db.unit_relations.get('lnk_unit_delete_1')).toBeUndefined();
  });

  it('cleans orphan segments via service API', async () => {
    await db.layer_units.bulkPut([
      {
        id: 'seg_orphan',
        textId: 'text_1',
        mediaId: 'media_1',
        layerId: 'layer_trc_cmn',
        unitType: 'segment',
        startTime: 1,
        endTime: 2,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'seg_live',
        textId: 'text_1',
        mediaId: 'media_1',
        layerId: 'layer_trc_cmn',
        unitType: 'segment',
        startTime: 2,
        endTime: 3,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
    await db.layer_unit_contents.put({
      id: 'cnt_live',
      textId: 'text_1',
      unitId: 'seg_live',
      layerId: 'layer_trc_cmn',
      contentRole: 'primary_text',
      modality: 'text',
      text: 'live',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.unit_relations.put({
      id: 'lnk_orphan',
      textId: 'text_1',
      sourceUnitId: 'seg_orphan',
      targetUnitId: 'seg_live',
      relationType: 'aligned_to',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const removed = await LayerSegmentationV2Service.cleanupOrphanSegments(['seg_orphan', 'seg_live']);

    expect(removed).toEqual(['seg_orphan']);
    expect(await db.layer_units.get('seg_orphan')).toBeUndefined();
    expect(await db.layer_units.get('seg_live')).toBeTruthy();
    expect(await db.unit_relations.get('lnk_orphan')).toBeUndefined();
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
    const dbFirst = await db.layer_units.get('seg_split_1');
    expect(dbFirst?.endTime).toBe(2.0);
    const allSegs = await db.layer_units.where('layerId').equals('layer_trc_cmn').toArray();
    expect(allSegs).toHaveLength(2);
  });

  it('clones segment contents to the second segment when splitting', async () => {
    const seg = makeSegment({ id: 'seg_split_with_content', startTime: 1.0, endTime: 3.0 });
    await LayerSegmentationV2Service.createSegment(seg);
    await LayerSegmentationV2Service.upsertSegmentContent(
      makeContent({ id: 'cnt_split_src', segmentId: seg.id, text: '原始内容' }),
    );

    const { second } = await LayerSegmentationV2Service.splitSegment(seg.id, 2.0);

    const firstContents = await db.layer_unit_contents.where('unitId').equals(seg.id).toArray();
    const secondContents = await db.layer_unit_contents.where('unitId').equals(second.id).toArray();
    expect(firstContents).toHaveLength(1);
    expect(secondContents).toHaveLength(1);
    expect(secondContents[0]?.text).toBe('原始内容');
  });

  it('splits a LayerUnit-only segment with contents', async () => {
    await db.layer_units.put({
      id: 'seg_unit_split_1',
      textId: 'text_1',
      mediaId: 'media_1',
      layerId: 'layer_trc_cmn',
      unitType: 'segment',
      startTime: 1,
      endTime: 3,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.layer_unit_contents.put({
      id: 'cnt_unit_split_1',
      textId: 'text_1',
      unitId: 'seg_unit_split_1',
      layerId: 'layer_trc_cmn',
      contentRole: 'primary_text',
      modality: 'text',
      text: '只在 LayerUnit 中',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const { first, second } = await LayerSegmentationV2Service.splitSegment('seg_unit_split_1', 2.0);

    expect(first.endTime).toBe(2.0);
    expect(second.startTime).toBe(2.0);
  expect(await db.layer_units.get('seg_unit_split_1')).toBeTruthy();
    expect(await db.layer_units.get(second.id)).toBeTruthy();
    const secondContents = await db.layer_unit_contents.where('unitId').equals(second.id).toArray();
    expect(secondContents).toHaveLength(1);
    expect(secondContents[0]?.text).toBe('只在 LayerUnit 中');
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
    const linksBefore = await db.unit_relations.where('sourceUnitId').equals('seg_split_link').toArray();
    expect(linksBefore).toHaveLength(1);

    const { second } = await LayerSegmentationV2Service.splitSegment('seg_split_link', 2.0);

    // 第一段保留原 link | First keeps original link
    const firstLinks = await db.unit_relations.where('sourceUnitId').equals('seg_split_link').toArray();
    expect(firstLinks).toHaveLength(1);
    expect(firstLinks[0]!.targetUnitId).toBe('utt_parent_split');

    // 第二段也获得克隆的 link | Second also gets a cloned link
    const secondLinks = await db.unit_relations.where('sourceUnitId').equals(second.id).toArray();
    expect(secondLinks).toHaveLength(1);
    expect(secondLinks[0]!.targetUnitId).toBe('utt_parent_split');
    expect(secondLinks[0]!.relationType).toBe('derived_from');
    expect(secondLinks[0]!.id).not.toBe(firstLinks[0]!.id);
  });

  it('clones LayerUnit-only source relations to the second segment when splitting', async () => {
    await db.layer_units.put({
      id: 'seg_unit_split_rel_1',
      textId: 'text_1',
      mediaId: 'media_1',
      layerId: 'layer_trc_cmn',
      unitType: 'segment',
      startTime: 1,
      endTime: 3,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.unit_relations.put({
      id: 'rel_split_parent_1',
      textId: 'text_1',
      sourceUnitId: 'seg_unit_split_rel_1',
      targetUnitId: 'utt_parent_split_rel',
      relationType: 'derived_from',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const { second } = await LayerSegmentationV2Service.splitSegment('seg_unit_split_rel_1', 2.0);

    const firstRelations = await db.unit_relations.where('sourceUnitId').equals('seg_unit_split_rel_1').toArray();
    const secondRelations = await db.unit_relations.where('sourceUnitId').equals(second.id).toArray();
    expect(firstRelations).toHaveLength(1);
    expect(secondRelations).toHaveLength(1);
    expect(secondRelations[0]!.targetUnitId).toBe('utt_parent_split_rel');
    expect(secondRelations[0]!.relationType).toBe('derived_from');
    expect(secondRelations[0]!.id).not.toBe(firstRelations[0]!.id);
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
    const kept = await db.layer_units.get('seg_merge_1');
    expect(kept?.startTime).toBe(1.0);
    expect(kept?.endTime).toBe(3.5);
    expect(await db.layer_units.get('seg_merge_2')).toBeUndefined();
  });

  it('merges adjacent LayerUnit-only segments', async () => {
    await db.layer_units.bulkPut([
      {
        id: 'seg_unit_merge_1',
        textId: 'text_1',
        mediaId: 'media_1',
        layerId: 'layer_trc_cmn',
        unitType: 'segment',
        startTime: 1,
        endTime: 2,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'seg_unit_merge_2',
        textId: 'text_1',
        mediaId: 'media_1',
        layerId: 'layer_trc_cmn',
        unitType: 'segment',
        startTime: 2,
        endTime: 3,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);

    const merged = await LayerSegmentationV2Service.mergeAdjacentSegments('seg_unit_merge_1', 'seg_unit_merge_2');

    expect(merged.startTime).toBe(1);
    expect(merged.endTime).toBe(3);
    expect(await db.layer_units.get('seg_unit_merge_2')).toBeUndefined();
    expect(await db.layer_units.get('seg_unit_merge_1')).toBeTruthy();
  });

  it('updates a LayerUnit-only segment in canonical storage', async () => {
    await db.layer_units.put({
      id: 'seg_unit_update_1',
      textId: 'text_1',
      mediaId: 'media_1',
      layerId: 'layer_trc_cmn',
      unitType: 'segment',
      startTime: 1,
      endTime: 2,
      createdAt: NOW,
      updatedAt: NOW,
    });

    await LayerSegmentationV2Service.updateSegment('seg_unit_update_1', {
      startTime: 1.25,
      endTime: 2.25,
      updatedAt: '2026-03-24T01:00:00.000Z',
    });

    const unit = await db.layer_units.get('seg_unit_update_1');
    expect(unit?.startTime).toBe(1.25);
    expect(unit?.endTime).toBe(2.25);
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

    expect(await db.layer_unit_contents.where('unitId').equals('seg_mc_2').count()).toBe(0);
    expect(await db.unit_relations.where('sourceUnitId').equals('seg_mc_2').count()).toBe(0);
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
    const stored = await db.layer_units.get('seg_pc_1');
    expect(stored).toBeTruthy();
    expect(stored!.startTime).toBe(1.0);
    expect(stored!.endTime).toBe(3.0);

    // 同时创建了 segment_link | Also created segment_link
    const links = await db.unit_relations.where('sourceUnitId').equals('seg_pc_1').toArray();
    expect(links).toHaveLength(1);
    expect(links[0]!.targetUnitId).toBe('utt_parent_1');
    expect(links[0]!.relationType).toBe('derived_from');
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
