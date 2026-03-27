import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, getDb } from '../db';
import { LayerUnitRelationQueryService } from './LayerUnitRelationQueryService';

const NOW = '2026-03-27T00:00:00.000Z';

describe('LayerUnitRelationQueryService', () => {
  beforeEach(async () => {
    await db.open();
    await db.unit_relations.clear();
  });

  it('lists time-subdivision child ids from canonical relations', async () => {
    const database = await getDb();

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

    expect(childIds).toEqual(['seg_child_unit_1']);
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

  it('returns canonical children for residual-aware subdivision queries', async () => {
    const database = await getDb();
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

  it('residual-aware subdivision query matches canonical subdivision query', async () => {
    const database = await getDb();
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

    expect(childIds).toEqual(['seg_child_unit_residual']);
  });
});