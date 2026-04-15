import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, getDb, type LayerUnitContentDocType, type LayerUnitDocType, type SegmentLinkDocType } from '../db';
import {
  buildClonedSegmentGraphForSplit,
  deleteLayerSegmentGraphByUtteranceIds,
  deleteResidualLayerUnitGraphByMediaId,
  deleteResidualLayerUnitGraphByTextId,
  findOrphanSegmentIds,
  restoreLayerSegmentGraphSnapshot,
  snapshotLayerSegmentGraphByLayerIds,
} from './LayerSegmentGraphService';

const NOW = '2026-03-27T00:00:00.000Z';

function makeLink(overrides: Partial<SegmentLinkDocType> & { id: string; sourceSegmentId: string; targetSegmentId: string }): SegmentLinkDocType {
  return {
    textId: 'text_1',
    linkType: 'time_subdivision',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('LayerSegmentGraphService', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all([
      db.layer_units.clear(),
      db.layer_unit_contents.clear(),
      db.unit_relations.clear(),
    ]);
  });

  it('snapshots canonical segment graph and exposes relation links as legacy-like links', async () => {
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

    expect(snapshot.units.map((unit) => unit.id)).toEqual(['seg_unit_snapshot_1']);
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

  it('snapshots preserve non-primary layer_unit_contents roles (undo fidelity)', async () => {
    const database = await getDb();
    await db.layer_units.put({
      id: 'seg_gloss_host',
      textId: 'text_1',
      mediaId: 'media_1',
      layerId: 'layer_independent_1',
      unitType: 'segment',
      startTime: 0,
      endTime: 1,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.layer_unit_contents.put({
      id: 'cnt_gloss_1',
      textId: 'text_1',
      unitId: 'seg_gloss_host',
      layerId: 'layer_independent_1',
      contentRole: 'gloss',
      modality: 'text',
      text: 'gloss-line',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const snapshot = await snapshotLayerSegmentGraphByLayerIds(database, ['layer_independent_1']);
    const gloss = snapshot.contents.find((c) => c.id === 'cnt_gloss_1');
    expect(gloss?.contentRole).toBe('gloss');
    expect(gloss?.text).toBe('gloss-line');
  });

  it('restores snapshot into canonical tables while removing stale graph rows', async () => {
    const database = await getDb();
    await db.layer_units.put({
      id: 'seg_stale_1',
      textId: 'text_1',
      mediaId: 'media_1',
      layerId: 'layer_independent_1',
      unitType: 'segment',
      startTime: 0,
      endTime: 1,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.layer_unit_contents.put({
      id: 'cnt_stale_1',
      textId: 'text_1',
      unitId: 'seg_stale_1',
      layerId: 'layer_independent_1',
      contentRole: 'primary_text',
      modality: 'text',
      text: 'stale',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.unit_relations.put({
      id: 'rel_stale_1',
      textId: 'text_1',
      sourceUnitId: 'seg_stale_1',
      targetUnitId: 'utt_parent_1',
      relationType: 'derived_from',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const snapshot = {
      units: [{
        id: 'seg_restore_1',
        textId: 'text_1',
        mediaId: 'media_1',
        layerId: 'layer_independent_1',
        unitType: 'segment' as const,
        startTime: 1,
        endTime: 2,
        createdAt: NOW,
        updatedAt: NOW,
      } satisfies LayerUnitDocType],
      contents: [{
        id: 'cnt_restore_1',
        textId: 'text_1',
        unitId: 'seg_restore_1',
        layerId: 'layer_independent_1',
        contentRole: 'primary_text',
        modality: 'text',
        text: 'restored',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      } satisfies LayerUnitContentDocType],
      links: [makeLink({ id: 'lnk_restore_1', sourceSegmentId: 'seg_restore_1', targetSegmentId: 'utt_parent_1' })],
    };

    await restoreLayerSegmentGraphSnapshot(database, snapshot, ['layer_independent_1']);

    expect(await db.layer_units.get('seg_stale_1')).toBeUndefined();
    expect(await db.layer_unit_contents.get('cnt_stale_1')).toBeUndefined();
    expect(await db.unit_relations.get('rel_stale_1')).toBeUndefined();
    expect(await db.layer_units.get('seg_restore_1')).toBeTruthy();
    expect(await db.layer_unit_contents.get('cnt_restore_1')).toBeTruthy();
    expect(await db.unit_relations.get('lnk_restore_1')).toBeTruthy();
  });

  it('deletes direct and time-subdivision segments for utterance cascade', async () => {
    const database = await getDb();
    await db.layer_units.bulkPut([
      {
        id: 'seg_parent_direct_1',
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
      },
      {
        id: 'seg_child_sub_1',
        textId: 'text_1',
        mediaId: 'media_1',
        layerId: 'layer_independent_1',
        unitType: 'segment',
        startTime: 1,
        endTime: 1.5,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
    await db.layer_unit_contents.bulkPut([
      {
        id: 'cnt_parent_direct_1',
        textId: 'text_1',
        unitId: 'seg_parent_direct_1',
        layerId: 'layer_independent_1',
        contentRole: 'primary_text',
        modality: 'text',
        text: 'direct',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'cnt_child_sub_1',
        textId: 'text_1',
        unitId: 'seg_child_sub_1',
        layerId: 'layer_independent_1',
        contentRole: 'primary_text',
        modality: 'text',
        text: 'child',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
    await db.unit_relations.put({
      id: 'rel_sub_parent_1',
      textId: 'text_1',
      sourceUnitId: 'seg_child_sub_1',
      targetUnitId: 'utt_parent_1',
      relationType: 'derived_from',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const result = await deleteLayerSegmentGraphByUtteranceIds(database, ['utt_parent_1']);

    expect(result.deletedSegmentIds.sort()).toEqual(['seg_child_sub_1', 'seg_parent_direct_1']);
    expect(await db.layer_units.get('seg_parent_direct_1')).toBeUndefined();
    expect(await db.layer_units.get('seg_child_sub_1')).toBeUndefined();
    expect(await db.layer_unit_contents.get('cnt_child_sub_1')).toBeUndefined();
    expect(await db.unit_relations.get('rel_sub_parent_1')).toBeUndefined();
  });

  it('finds orphan segment ids from canonical graph', async () => {
    const database = await getDb();
    await db.layer_units.bulkPut([
      {
        id: 'seg_orphan',
        textId: 'text_1',
        mediaId: 'media_1',
        layerId: 'layer_independent_1',
        unitType: 'segment',
        startTime: 0,
        endTime: 1,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'seg_live',
        textId: 'text_1',
        mediaId: 'media_1',
        layerId: 'layer_independent_1',
        unitType: 'segment',
        startTime: 1,
        endTime: 2,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
    await db.layer_unit_contents.put({
      id: 'cnt_live',
      textId: 'text_1',
      unitId: 'seg_live',
      layerId: 'layer_independent_1',
      contentRole: 'primary_text',
      modality: 'text',
      text: 'live',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const orphanIds = await findOrphanSegmentIds(database, ['seg_orphan', 'seg_live']);

    expect(orphanIds).toEqual(['seg_orphan']);
  });

  it('deletes residual LayerUnit graphs by text/media scopes', async () => {
    const database = await getDb();
    await db.layer_units.bulkPut([
      {
        id: 'seg_text_residual_1',
        textId: 'text_residual',
        mediaId: 'media_residual',
        layerId: 'layer_residual',
        unitType: 'segment',
        startTime: 0,
        endTime: 1,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'seg_media_residual_1',
        textId: 'text_other',
        mediaId: 'media_residual',
        layerId: 'layer_residual',
        unitType: 'segment',
        startTime: 1,
        endTime: 2,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
    await db.layer_unit_contents.bulkPut([
      {
        id: 'cnt_text_residual_1',
        textId: 'text_residual',
        unitId: 'seg_text_residual_1',
        layerId: 'layer_residual',
        contentRole: 'primary_text',
        modality: 'text',
        text: 'text residual',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'cnt_media_residual_1',
        textId: 'text_other',
        unitId: 'seg_media_residual_1',
        layerId: 'layer_residual',
        contentRole: 'primary_text',
        modality: 'text',
        text: 'media residual',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);

    const textResult = await deleteResidualLayerUnitGraphByTextId(database, 'text_residual');
    expect(textResult.deletedUnitIds).toEqual(['seg_text_residual_1']);
    expect(await db.layer_units.get('seg_text_residual_1')).toBeUndefined();
    expect(await db.layer_units.get('seg_media_residual_1')).toBeTruthy();

    const mediaResult = await deleteResidualLayerUnitGraphByMediaId(database, 'media_residual');
    expect(mediaResult.deletedUnitIds).toEqual(['seg_media_residual_1']);
    expect(await db.layer_units.get('seg_media_residual_1')).toBeUndefined();
  });

  it('clones canonical contents and outgoing links for split', async () => {
    const database = await getDb();
    await db.layer_unit_contents.put({
      id: 'cnt_split_1',
      textId: 'text_1',
      unitId: 'seg_split_1',
      layerId: 'layer_independent_1',
      contentRole: 'primary_text',
      modality: 'text',
      text: 'split me',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.unit_relations.put({
      id: 'rel_split_1',
      textId: 'text_1',
      sourceUnitId: 'seg_split_1',
      targetUnitId: 'utt_parent_1',
      relationType: 'derived_from',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const result = await buildClonedSegmentGraphForSplit(database, 'seg_split_1', 'seg_split_2', '2026-03-27T00:01:00.000Z');

    expect(result.clonedContents).toEqual([
      expect.objectContaining({
        segmentId: 'seg_split_2',
        text: 'split me',
      }),
    ]);
    expect(result.clonedLinks).toEqual([
      expect.objectContaining({
        sourceSegmentId: 'seg_split_2',
        targetSegmentId: 'utt_parent_1',
        linkType: 'time_subdivision',
      }),
    ]);
  });
});