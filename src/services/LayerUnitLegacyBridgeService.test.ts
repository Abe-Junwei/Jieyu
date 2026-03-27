import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { featureFlags } from '../ai/config/featureFlags';
import { db, getDb, type LayerSegmentDocType, type SegmentLinkDocType } from '../db';
import {
  buildClonedSegmentGraphForSplit,
  deleteLayerSegmentGraphBySegmentIds,
  deleteLayerSegmentGraphByUtteranceIds,
  deleteResidualLayerUnitGraphByMediaId,
  deleteResidualLayerUnitGraphByTextId,
  findResidualOrphanSegmentIds,
  listMergedLegacySegmentsByLayerId,
  restoreLayerSegmentGraphSnapshot,
  snapshotLayerSegmentGraphByLayerIds,
} from './LayerUnitLegacyBridgeService';

const NOW = '2026-03-27T00:00:00.000Z';

function makeSegment(overrides: Partial<LayerSegmentDocType> & { id: string }): LayerSegmentDocType {
  return {
    textId: 'text_1',
    mediaId: 'media_1',
    layerId: 'layer_independent_1',
    startTime: 1,
    endTime: 2,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('LayerUnitLegacyBridgeService segment graph snapshot', () => {
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
    (featureFlags as { legacySegmentationReadFallbackEnabled: boolean }).legacySegmentationReadFallbackEnabled = true;
  });

  it('snapshots LayerUnit-only segment graph and exposes derived_from as legacy-like links', async () => {
    const database = await getDb();

    await db.layer_units.put({
      id: 'seg_unit_snapshot_1',
      textId: 'text_1',
      mediaId: 'media_1',
      layerId: 'layer_independent_1',
      unitType: 'segment',
      parentUnitId: 'utt_parent_1',
      rootUnitId: 'utt_parent_1',
      startTime: 1,
      endTime: 2,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.layer_unit_contents.put({
      id: 'cnt_unit_snapshot_1',
      textId: 'text_1',
      unitId: 'seg_unit_snapshot_1',
      layerId: 'layer_independent_1',
      contentRole: 'primary_text',
      modality: 'text',
      text: 'unit-only-content',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.unit_relations.put({
      id: 'rel_unit_snapshot_1',
      textId: 'text_1',
      sourceUnitId: 'seg_unit_snapshot_1',
      targetUnitId: 'utt_parent_1',
      relationType: 'derived_from',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const snapshot = await snapshotLayerSegmentGraphByLayerIds(database, ['layer_independent_1']);

    expect(snapshot.segments.map((segment) => segment.id)).toEqual(['seg_unit_snapshot_1']);
    expect(snapshot.contents.map((content) => content.id)).toEqual(['cnt_unit_snapshot_1']);
    expect(snapshot.links).toEqual([
      expect.objectContaining<Partial<SegmentLinkDocType>>({
        id: 'rel_unit_snapshot_1',
        sourceSegmentId: 'seg_unit_snapshot_1',
        targetSegmentId: 'utt_parent_1',
        linkType: 'time_subdivision',
      }),
    ]);
  });

  it('restores snapshot into legacy and LayerUnit tables while removing stale graph rows', async () => {
    const database = await getDb();
    await db.layer_segments.put(makeSegment({ id: 'seg_stale_1' }));
    await db.layer_segment_contents.put({
      id: 'cnt_stale_1',
      textId: 'text_1',
      segmentId: 'seg_stale_1',
      layerId: 'layer_independent_1',
      modality: 'text',
      text: 'stale',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.segment_links.put({
      id: 'lnk_stale_1',
      textId: 'text_1',
      sourceSegmentId: 'seg_stale_1',
      targetSegmentId: 'utt_parent_old',
      linkType: 'bridge',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const snapshot = {
      segments: [makeSegment({ id: 'seg_restore_1', utteranceId: 'utt_parent_new' })],
      contents: [{
        id: 'cnt_restore_1',
        textId: 'text_1',
        segmentId: 'seg_restore_1',
        layerId: 'layer_independent_1',
        modality: 'text' as const,
        text: 'restored',
        sourceType: 'human' as const,
        createdAt: NOW,
        updatedAt: NOW,
      }],
      links: [{
        id: 'lnk_restore_1',
        textId: 'text_1',
        sourceSegmentId: 'seg_restore_1',
        targetSegmentId: 'utt_parent_new',
        linkType: 'time_subdivision' as const,
        createdAt: NOW,
        updatedAt: NOW,
      }],
    };

    await restoreLayerSegmentGraphSnapshot(database, snapshot, ['layer_independent_1']);

    expect(await db.layer_segments.get('seg_stale_1')).toBeUndefined();
    expect(await db.layer_segment_contents.get('cnt_stale_1')).toBeUndefined();
    expect(await db.segment_links.get('lnk_stale_1')).toBeUndefined();

    expect(await db.layer_segments.get('seg_restore_1')).toBeTruthy();
    expect(await db.layer_unit_contents.get('cnt_restore_1')).toBeTruthy();
    expect(await db.segment_links.get('lnk_restore_1')).toBeTruthy();
    expect(await db.unit_relations.get('lnk_restore_1')).toEqual(
      expect.objectContaining({
        sourceUnitId: 'seg_restore_1',
        targetUnitId: 'utt_parent_new',
        relationType: 'derived_from',
      }),
    );
  });

  it('restores snapshot as LayerUnit-only graph when legacy mirror writes are disabled', async () => {
    const database = await getDb();
    (featureFlags as { legacySegmentationMirrorWriteEnabled: boolean }).legacySegmentationMirrorWriteEnabled = false;

    const snapshot = {
      segments: [makeSegment({ id: 'seg_restore_flag_1', utteranceId: 'utt_parent_flag_1' })],
      contents: [{
        id: 'cnt_restore_flag_1',
        textId: 'text_1',
        segmentId: 'seg_restore_flag_1',
        layerId: 'layer_independent_1',
        modality: 'text' as const,
        text: 'restored-layerunit-only',
        sourceType: 'human' as const,
        createdAt: NOW,
        updatedAt: NOW,
      }],
      links: [{
        id: 'lnk_restore_flag_1',
        textId: 'text_1',
        sourceSegmentId: 'seg_restore_flag_1',
        targetSegmentId: 'utt_parent_flag_1',
        linkType: 'time_subdivision' as const,
        createdAt: NOW,
        updatedAt: NOW,
      }],
    };

    await restoreLayerSegmentGraphSnapshot(database, snapshot, ['layer_independent_1']);

    expect(await db.layer_segments.get('seg_restore_flag_1')).toBeUndefined();
    expect(await db.layer_segment_contents.get('cnt_restore_flag_1')).toBeUndefined();
    expect(await db.segment_links.get('lnk_restore_flag_1')).toBeUndefined();
    expect(await db.layer_units.get('seg_restore_flag_1')).toBeTruthy();
    expect(await db.layer_unit_contents.get('cnt_restore_flag_1')).toBeTruthy();
    expect(await db.unit_relations.get('lnk_restore_flag_1')).toEqual(
      expect.objectContaining({
        sourceUnitId: 'seg_restore_flag_1',
        targetUnitId: 'utt_parent_flag_1',
        relationType: 'derived_from',
      }),
    );

    const restored = await snapshotLayerSegmentGraphByLayerIds(database, ['layer_independent_1']);
    expect(restored.segments.map((segment) => segment.id)).toEqual(['seg_restore_flag_1']);
    expect(restored.contents.map((content) => content.id)).toEqual(['cnt_restore_flag_1']);
    expect(restored.links.map((link) => link.id)).toEqual(['lnk_restore_flag_1']);
  });

  it('ignores legacy-only segments when legacy read fallback is disabled', async () => {
    const database = await getDb();
    (featureFlags as { legacySegmentationReadFallbackEnabled: boolean }).legacySegmentationReadFallbackEnabled = false;

    await db.layer_segments.put(makeSegment({ id: 'seg_legacy_only_ignored' }));
    await db.layer_units.put({
      id: 'seg_unit_only_kept',
      textId: 'text_1',
      mediaId: 'media_1',
      layerId: 'layer_independent_1',
      unitType: 'segment',
      startTime: 3,
      endTime: 4,
      createdAt: NOW,
      updatedAt: NOW,
    });

    const segments = await listMergedLegacySegmentsByLayerId(database, 'layer_independent_1');
    const snapshot = await snapshotLayerSegmentGraphByLayerIds(database, ['layer_independent_1']);

    expect(segments.map((segment) => segment.id)).toEqual(['seg_unit_only_kept']);
    expect(snapshot.segments.map((segment) => segment.id)).toEqual(['seg_unit_only_kept']);
  });

  it('deletes LayerUnit-only segment graph by segment ids', async () => {
    const database = await getDb();

    await db.layer_units.put({
      id: 'seg_delete_helper_1',
      textId: 'text_1',
      mediaId: 'media_1',
      layerId: 'layer_independent_1',
      unitType: 'segment',
      parentUnitId: 'utt_delete_helper_1',
      rootUnitId: 'utt_delete_helper_1',
      startTime: 1,
      endTime: 2,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.layer_unit_contents.put({
      id: 'cnt_delete_helper_1',
      textId: 'text_1',
      unitId: 'seg_delete_helper_1',
      layerId: 'layer_independent_1',
      contentRole: 'primary_text',
      modality: 'text',
      text: 'delete-helper',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.unit_relations.put({
      id: 'rel_delete_helper_1',
      textId: 'text_1',
      sourceUnitId: 'seg_delete_helper_1',
      targetUnitId: 'utt_delete_helper_1',
      relationType: 'derived_from',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const result = await deleteLayerSegmentGraphBySegmentIds(database, ['seg_delete_helper_1']);

    expect(result.deletedSegmentIds).toEqual(['seg_delete_helper_1']);
    expect(result.affectedUtteranceIds).toEqual(['utt_delete_helper_1']);
    expect(await db.layer_units.get('seg_delete_helper_1')).toBeUndefined();
    expect(await db.layer_unit_contents.get('cnt_delete_helper_1')).toBeUndefined();
    expect(await db.unit_relations.get('rel_delete_helper_1')).toBeUndefined();
  });

  it('deletes direct legacy-residual child graph by utterance ids when stop-read is disabled', async () => {
    const database = await getDb();
    (featureFlags as { legacySegmentationReadFallbackEnabled: boolean }).legacySegmentationReadFallbackEnabled = false;

    await db.layer_segments.put(makeSegment({
      id: 'seg_delete_utt_legacy_1',
      utteranceId: 'utt_delete_helper_legacy',
    }));
    await db.layer_segment_contents.put({
      id: 'cnt_delete_utt_legacy_1',
      textId: 'text_1',
      segmentId: 'seg_delete_utt_legacy_1',
      layerId: 'layer_independent_1',
      modality: 'text',
      text: 'legacy-delete-helper',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.segment_links.put({
      id: 'lnk_delete_utt_legacy_1',
      textId: 'text_1',
      sourceSegmentId: 'seg_delete_utt_legacy_1',
      targetSegmentId: 'utt_delete_helper_legacy',
      linkType: 'time_subdivision',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const result = await deleteLayerSegmentGraphByUtteranceIds(database, ['utt_delete_helper_legacy']);

    expect(result.deletedSegmentIds).toEqual(['seg_delete_utt_legacy_1']);
    expect(await db.layer_segments.get('seg_delete_utt_legacy_1')).toBeUndefined();
    expect(await db.layer_segment_contents.get('cnt_delete_utt_legacy_1')).toBeUndefined();
    expect(await db.segment_links.get('lnk_delete_utt_legacy_1')).toBeUndefined();
  });

  it('deletes residual LayerUnit graph by text id', async () => {
    const database = await getDb();

    await db.layer_units.bulkAdd([
      {
        id: 'unit_residual_text_1',
        textId: 'text_residual',
        mediaId: 'media_residual',
        layerId: 'layer_residual',
        unitType: 'segment',
        startTime: 1,
        endTime: 2,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'unit_residual_text_keep',
        textId: 'text_keep',
        mediaId: 'media_keep',
        layerId: 'layer_keep',
        unitType: 'segment',
        startTime: 3,
        endTime: 4,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
    await db.layer_unit_contents.bulkAdd([
      {
        id: 'content_residual_text_1',
        textId: 'text_residual',
        unitId: 'unit_residual_text_1',
        layerId: 'layer_residual',
        contentRole: 'primary_text',
        modality: 'text',
        text: 'remove me',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'content_residual_text_keep',
        textId: 'text_keep',
        unitId: 'unit_residual_text_keep',
        layerId: 'layer_keep',
        contentRole: 'primary_text',
        modality: 'text',
        text: 'keep me',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
    await db.unit_relations.bulkAdd([
      {
        id: 'relation_residual_text_1',
        textId: 'text_residual',
        sourceUnitId: 'unit_residual_text_1',
        targetUnitId: 'target_residual_text_1',
        relationType: 'derived_from',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'relation_residual_text_keep',
        textId: 'text_keep',
        sourceUnitId: 'unit_residual_text_keep',
        targetUnitId: 'target_residual_text_keep',
        relationType: 'derived_from',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);

    const result = await deleteResidualLayerUnitGraphByTextId(database, 'text_residual');

    expect(result.deletedUnitIds).toEqual(['unit_residual_text_1']);
    expect(result.deletedContentIds).toEqual(['content_residual_text_1']);
    expect(result.deletedRelationIds).toEqual(['relation_residual_text_1']);
    expect(await db.layer_units.get('unit_residual_text_1')).toBeUndefined();
    expect(await db.layer_unit_contents.get('content_residual_text_1')).toBeUndefined();
    expect(await db.unit_relations.get('relation_residual_text_1')).toBeUndefined();
    expect(await db.layer_units.get('unit_residual_text_keep')).toBeTruthy();
    expect(await db.layer_unit_contents.get('content_residual_text_keep')).toBeTruthy();
    expect(await db.unit_relations.get('relation_residual_text_keep')).toBeTruthy();
  });

  it('deletes residual LayerUnit graph by media id', async () => {
    const database = await getDb();

    await db.layer_units.bulkAdd([
      {
        id: 'unit_residual_media_1',
        textId: 'text_media',
        mediaId: 'media_residual',
        layerId: 'layer_media',
        unitType: 'segment',
        startTime: 1,
        endTime: 2,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'unit_residual_media_2',
        textId: 'text_media',
        mediaId: 'media_residual',
        layerId: 'layer_media',
        unitType: 'segment',
        startTime: 2,
        endTime: 3,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'unit_residual_media_keep',
        textId: 'text_media_keep',
        mediaId: 'media_keep',
        layerId: 'layer_media_keep',
        unitType: 'segment',
        startTime: 4,
        endTime: 5,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
    await db.layer_unit_contents.bulkAdd([
      {
        id: 'content_residual_media_1',
        textId: 'text_media',
        unitId: 'unit_residual_media_1',
        layerId: 'layer_media',
        contentRole: 'primary_text',
        modality: 'text',
        text: 'remove media 1',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'content_residual_media_2',
        textId: 'text_media',
        unitId: 'unit_residual_media_2',
        layerId: 'layer_media',
        contentRole: 'primary_text',
        modality: 'text',
        text: 'remove media 2',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'content_residual_media_keep',
        textId: 'text_media_keep',
        unitId: 'unit_residual_media_keep',
        layerId: 'layer_media_keep',
        contentRole: 'primary_text',
        modality: 'text',
        text: 'keep media',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
    await db.unit_relations.bulkAdd([
      {
        id: 'relation_residual_media_1',
        textId: 'text_media',
        sourceUnitId: 'unit_residual_media_1',
        targetUnitId: 'unit_residual_media_2',
        relationType: 'derived_from',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'relation_residual_media_2',
        textId: 'text_media',
        sourceUnitId: 'unit_residual_media_keep',
        targetUnitId: 'unit_residual_media_1',
        relationType: 'aligned_to',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'relation_residual_media_keep',
        textId: 'text_media_keep',
        sourceUnitId: 'unit_residual_media_keep',
        targetUnitId: 'target_residual_media_keep',
        relationType: 'derived_from',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);

    const result = await deleteResidualLayerUnitGraphByMediaId(database, 'media_residual');

    expect(result.deletedUnitIds).toEqual(['unit_residual_media_1', 'unit_residual_media_2']);
    expect(result.deletedContentIds).toEqual(['content_residual_media_1', 'content_residual_media_2']);
    expect(result.deletedRelationIds.sort()).toEqual(['relation_residual_media_1', 'relation_residual_media_2']);
    expect(await db.layer_units.get('unit_residual_media_1')).toBeUndefined();
    expect(await db.layer_units.get('unit_residual_media_2')).toBeUndefined();
    expect(await db.layer_unit_contents.get('content_residual_media_1')).toBeUndefined();
    expect(await db.layer_unit_contents.get('content_residual_media_2')).toBeUndefined();
    expect(await db.unit_relations.get('relation_residual_media_1')).toBeUndefined();
    expect(await db.unit_relations.get('relation_residual_media_2')).toBeUndefined();
    expect(await db.layer_units.get('unit_residual_media_keep')).toBeTruthy();
    expect(await db.layer_unit_contents.get('content_residual_media_keep')).toBeTruthy();
    expect(await db.unit_relations.get('relation_residual_media_keep')).toBeTruthy();
  });

  it('finds legacy-only orphan segments even when stop-read fallback is disabled', async () => {
    const database = await getDb();
    (featureFlags as { legacySegmentationReadFallbackEnabled: boolean }).legacySegmentationReadFallbackEnabled = false;

    await db.layer_segments.bulkAdd([
      makeSegment({ id: 'seg_orphan_legacy_only' }),
      makeSegment({ id: 'seg_live_unit_only' }),
    ]);
    await db.layer_unit_contents.put({
      id: 'cnt_live_unit_only',
      textId: 'text_1',
      unitId: 'seg_live_unit_only',
      layerId: 'layer_independent_1',
      contentRole: 'primary_text',
      modality: 'text',
      text: 'unit-live',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const orphanIds = await findResidualOrphanSegmentIds(database, [
      'seg_orphan_legacy_only',
      'seg_live_unit_only',
    ]);

    expect(orphanIds).toEqual(['seg_orphan_legacy_only']);
  });

  it('builds cloned split graph from merged outgoing links', async () => {
    const database = await getDb();

    await db.layer_units.put({
      id: 'seg_split_helper_1',
      textId: 'text_1',
      mediaId: 'media_1',
      layerId: 'layer_independent_1',
      unitType: 'segment',
      startTime: 1,
      endTime: 3,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.layer_unit_contents.put({
      id: 'cnt_split_helper_1',
      textId: 'text_1',
      unitId: 'seg_split_helper_1',
      layerId: 'layer_independent_1',
      contentRole: 'primary_text',
      modality: 'text',
      text: 'split-helper',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.segment_links.put({
      id: 'lnk_split_helper_1',
      textId: 'text_1',
      sourceSegmentId: 'seg_split_helper_1',
      targetSegmentId: 'utt_parent_split_helper',
      linkType: 'time_subdivision',
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.unit_relations.bulkAdd([
      {
        id: 'lnk_split_helper_1',
        textId: 'text_1',
        sourceUnitId: 'seg_split_helper_1',
        targetUnitId: 'utt_parent_split_helper',
        relationType: 'derived_from',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'rel_split_helper_unit_only',
        textId: 'text_1',
        sourceUnitId: 'seg_split_helper_1',
        targetUnitId: 'ref_split_helper',
        relationType: 'linked_reference',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);

    const result = await buildClonedSegmentGraphForSplit(
      database,
      'seg_split_helper_1',
      'seg_split_helper_2',
      '2026-03-27T01:00:00.000Z',
    );

    expect(result.clonedContents).toHaveLength(1);
    expect(result.clonedContents[0]).toEqual(expect.objectContaining({
      segmentId: 'seg_split_helper_2',
      text: 'split-helper',
    }));
    expect(result.clonedLinks).toHaveLength(2);
    expect(result.clonedLinks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceSegmentId: 'seg_split_helper_2',
        targetSegmentId: 'utt_parent_split_helper',
        linkType: 'time_subdivision',
      }),
      expect.objectContaining({
        sourceSegmentId: 'seg_split_helper_2',
        targetSegmentId: 'ref_split_helper',
        linkType: 'projection',
      }),
    ]));
  });
});