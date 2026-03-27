import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { featureFlags } from '../ai/config/featureFlags';
import { db, getDb } from '../db';
import { LayerUnitRelationQueryService } from './LayerUnitRelationQueryService';

const NOW = '2026-03-27T00:00:00.000Z';

describe('LayerUnitRelationQueryService', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all([
      db.segment_links.clear(),
      db.unit_relations.clear(),
    ]);
    (featureFlags as { legacySegmentationReadFallbackEnabled: boolean }).legacySegmentationReadFallbackEnabled = true;
  });

  afterEach(() => {
    (featureFlags as { legacySegmentationReadFallbackEnabled: boolean }).legacySegmentationReadFallbackEnabled = true;
  });

  it('lists time-subdivision child ids from mixed legacy and LayerUnit relations', async () => {
    const database = await getDb();

    await db.segment_links.put({
      id: 'lnk_child_legacy_1',
      textId: 'text_1',
      sourceSegmentId: 'seg_child_legacy_1',
      targetSegmentId: 'utt_parent_1',
      linkType: 'time_subdivision',
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.unit_relations.put({
      id: 'rel_child_unit_1',
      textId: 'text_1',
      sourceUnitId: 'seg_child_unit_1',
      targetUnitId: 'utt_parent_1',
      relationType: 'derived_from',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const childIds = await LayerUnitRelationQueryService.listTimeSubdivisionChildUnitIds(['utt_parent_1'], database);

    expect(childIds).toEqual(expect.arrayContaining(['seg_child_legacy_1', 'seg_child_unit_1']));
  });

  it('lists parent ids by child ids with relation-type filtering', async () => {
    const database = await getDb();

    await db.unit_relations.bulkPut([
      {
        id: 'rel_parent_1',
        textId: 'text_1',
        sourceUnitId: 'seg_child_2',
        targetUnitId: 'utt_parent_2',
        relationType: 'derived_from',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'rel_parent_2',
        textId: 'text_1',
        sourceUnitId: 'seg_child_2',
        targetUnitId: 'ref_target_2',
        relationType: 'linked_reference',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);

    const parentIds = await LayerUnitRelationQueryService.listParentUnitIdsByChildUnitIds(
      ['seg_child_2'],
      { relationType: 'derived_from' },
      database,
    );

    expect(parentIds).toEqual(['utt_parent_2']);
  });

  it('ignores legacy-only links when legacy read fallback is disabled', async () => {
    const database = await getDb();
    (featureFlags as { legacySegmentationReadFallbackEnabled: boolean }).legacySegmentationReadFallbackEnabled = false;

    await db.segment_links.put({
      id: 'lnk_child_legacy_ignored',
      textId: 'text_1',
      sourceSegmentId: 'seg_child_legacy_ignored',
      targetSegmentId: 'utt_parent_ignored',
      linkType: 'time_subdivision',
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.unit_relations.put({
      id: 'rel_child_unit_enabled',
      textId: 'text_1',
      sourceUnitId: 'seg_child_unit_enabled',
      targetUnitId: 'utt_parent_ignored',
      relationType: 'derived_from',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const childIds = await LayerUnitRelationQueryService.listTimeSubdivisionChildUnitIds(['utt_parent_ignored'], database);

    expect(childIds).toEqual(['seg_child_unit_enabled']);
  });

  it('keeps legacy-only links visible for residual-aware time-subdivision queries when stop-read is disabled', async () => {
    const database = await getDb();
    (featureFlags as { legacySegmentationReadFallbackEnabled: boolean }).legacySegmentationReadFallbackEnabled = false;

    await db.segment_links.put({
      id: 'lnk_child_legacy_residual',
      textId: 'text_1',
      sourceSegmentId: 'seg_child_legacy_residual',
      targetSegmentId: 'utt_parent_residual',
      linkType: 'time_subdivision',
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.unit_relations.put({
      id: 'rel_child_unit_residual',
      textId: 'text_1',
      sourceUnitId: 'seg_child_unit_residual',
      targetUnitId: 'utt_parent_residual',
      relationType: 'derived_from',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const childIds = await LayerUnitRelationQueryService.listResidualAwareTimeSubdivisionChildUnitIds(
      ['utt_parent_residual'],
      database,
    );

    expect(childIds).toEqual(expect.arrayContaining(['seg_child_legacy_residual', 'seg_child_unit_residual']));
  });
});