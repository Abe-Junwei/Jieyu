import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  db,
  type LayerUnitContentDocType,
  type LayerUnitDocType,
  type UnitRelationDocType,
} from '../db';
import { putTestUnitAsLayerUnit } from '../db/putTestUnitAsLayerUnit';
import { LayerSegmentationV2Service } from './LayerSegmentationV2Service';

const NOW = '2026-03-24T00:00:00.000Z';

function makeSegment(overrides: Partial<LayerUnitDocType> & { id: string }): LayerUnitDocType {
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

function makeContent(
  overrides: Partial<LayerUnitContentDocType> & { id: string; segmentId: string },
): LayerUnitContentDocType {
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

function makeLink(
  overrides: Partial<UnitRelationDocType> & {
    id: string;
    sourceSegmentId: string;
    targetSegmentId: string;
  },
): UnitRelationDocType {
  return {
    textId: 'text_1',
    linkType: 'equivalent',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('LayerSegmentationV2Service.mergeAdjacentSegmentChain', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all([
      db.tier_definitions.clear(),
      db.layer_units.clear(),
      db.layer_unit_contents.clear(),
      db.unit_relations.clear(),
    ]);
  });

  it('merges a contiguous selection in one step and keeps only the survivor content', async () => {
    await LayerSegmentationV2Service.createSegment(
      makeSegment({ id: 'seg_chain_1', startTime: 0, endTime: 1 }),
    );
    await LayerSegmentationV2Service.createSegment(
      makeSegment({ id: 'seg_chain_2', startTime: 1, endTime: 2 }),
    );
    await LayerSegmentationV2Service.createSegment(
      makeSegment({ id: 'seg_chain_3', startTime: 2, endTime: 4 }),
    );
    await LayerSegmentationV2Service.upsertSegmentContent(
      makeContent({ id: 'cnt_chain_1', segmentId: 'seg_chain_1', text: '甲' }),
    );
    await LayerSegmentationV2Service.upsertSegmentContent(
      makeContent({ id: 'cnt_chain_2', segmentId: 'seg_chain_2', text: '乙' }),
    );
    await LayerSegmentationV2Service.upsertSegmentContent(
      makeContent({ id: 'cnt_chain_3', segmentId: 'seg_chain_3', text: '丙' }),
    );
    await LayerSegmentationV2Service.createSegmentLink(
      makeLink({
        id: 'lnk_chain_2',
        sourceSegmentId: 'seg_chain_2',
        targetSegmentId: 'seg_chain_1',
      }),
    );

    const merged = await LayerSegmentationV2Service.mergeAdjacentSegmentChain('seg_chain_1', [
      'seg_chain_2',
      'seg_chain_3',
    ]);

    expect(merged.id).toBe('seg_chain_1');
    expect(merged.startTime).toBe(0);
    expect(merged.endTime).toBe(4);
    const kept = await db.layer_units.get('seg_chain_1');
    expect(kept?.startTime).toBe(0);
    expect(kept?.endTime).toBe(4);
    expect(await db.layer_units.get('seg_chain_2')).toBeUndefined();
    expect(await db.layer_units.get('seg_chain_3')).toBeUndefined();
    expect(
      (await LayerSegmentationV2Service.listSegmentContents('seg_chain_1')).map((row) => row.text),
    ).toEqual(['甲']);
    expect(await db.layer_unit_contents.where('unitId').equals('seg_chain_2').count()).toBe(0);
    expect(await db.layer_unit_contents.where('unitId').equals('seg_chain_3').count()).toBe(0);
    expect(await db.unit_relations.where('sourceUnitId').equals('seg_chain_2').count()).toBe(0);
  });

  it('leaves every original segment and its content when a later delete in the chain fails', async () => {
    await LayerSegmentationV2Service.createSegment(
      makeSegment({ id: 'seg_chain_fail_1', startTime: 0, endTime: 1 }),
    );
    await LayerSegmentationV2Service.createSegment(
      makeSegment({ id: 'seg_chain_fail_2', startTime: 1, endTime: 2 }),
    );
    await LayerSegmentationV2Service.createSegment(
      makeSegment({ id: 'seg_chain_fail_3', startTime: 2, endTime: 4 }),
    );
    await LayerSegmentationV2Service.upsertSegmentContent(
      makeContent({ id: 'cnt_chain_fail_1', segmentId: 'seg_chain_fail_1', text: '甲' }),
    );
    await LayerSegmentationV2Service.upsertSegmentContent(
      makeContent({ id: 'cnt_chain_fail_2', segmentId: 'seg_chain_fail_2', text: '乙' }),
    );
    await LayerSegmentationV2Service.upsertSegmentContent(
      makeContent({ id: 'cnt_chain_fail_3', segmentId: 'seg_chain_fail_3', text: '丙' }),
    );
    const fail = (primKey: string) => {
      if (primKey === 'seg_chain_fail_3') throw new Error('cascade failed');
    };
    db.layer_units.hook('deleting', fail);
    try {
      await expect(
        LayerSegmentationV2Service.mergeAdjacentSegmentChain('seg_chain_fail_1', [
          'seg_chain_fail_2',
          'seg_chain_fail_3',
        ]),
      ).rejects.toThrow(/cascade failed/);
    } finally {
      db.layer_units.hook('deleting').unsubscribe(fail);
    }

    const rows = await LayerSegmentationV2Service.listSegmentsByLayerMedia(
      'layer_trc_cmn',
      'media_1',
    );
    expect(rows.map((row) => [row.id, row.startTime, row.endTime])).toEqual([
      ['seg_chain_fail_1', 0, 1],
      ['seg_chain_fail_2', 1, 2],
      ['seg_chain_fail_3', 2, 4],
    ]);
    expect(
      (await LayerSegmentationV2Service.listSegmentContents('seg_chain_fail_1')).map(
        (row) => row.text,
      ),
    ).toEqual(['甲']);
    expect(
      (await LayerSegmentationV2Service.listSegmentContents('seg_chain_fail_2')).map(
        (row) => row.text,
      ),
    ).toEqual(['乙']);
    expect(
      (await LayerSegmentationV2Service.listSegmentContents('seg_chain_fail_3')).map(
        (row) => row.text,
      ),
    ).toEqual(['丙']);
  });

  it('does not keep an earlier pair when a later selected segment is already gone', async () => {
    await LayerSegmentationV2Service.createSegment(
      makeSegment({ id: 'seg_chain_missing_1', startTime: 0, endTime: 1 }),
    );
    await LayerSegmentationV2Service.createSegment(
      makeSegment({ id: 'seg_chain_missing_2', startTime: 1, endTime: 2 }),
    );
    await LayerSegmentationV2Service.upsertSegmentContent(
      makeContent({ id: 'cnt_chain_missing_1', segmentId: 'seg_chain_missing_1', text: '甲' }),
    );
    await LayerSegmentationV2Service.upsertSegmentContent(
      makeContent({ id: 'cnt_chain_missing_2', segmentId: 'seg_chain_missing_2', text: '乙' }),
    );

    await expect(
      LayerSegmentationV2Service.mergeAdjacentSegmentChain('seg_chain_missing_1', [
        'seg_chain_missing_2',
        'seg_chain_missing_3',
      ]),
    ).rejects.toThrow(/not found/);

    const rows = await LayerSegmentationV2Service.listSegmentsByLayerMedia(
      'layer_trc_cmn',
      'media_1',
    );
    expect(rows.map((row) => [row.id, row.startTime, row.endTime])).toEqual([
      ['seg_chain_missing_1', 0, 1],
      ['seg_chain_missing_2', 1, 2],
    ]);
    expect(
      (await LayerSegmentationV2Service.listSegmentContents('seg_chain_missing_1')).map(
        (row) => row.text,
      ),
    ).toEqual(['甲']);
    expect(
      (await LayerSegmentationV2Service.listSegmentContents('seg_chain_missing_2')).map(
        (row) => row.text,
      ),
    ).toEqual(['乙']);
  });

  it('rejects a chain with a sibling between the selection and writes nothing', async () => {
    await LayerSegmentationV2Service.createSegment(
      makeSegment({ id: 'seg_chain_gap_1', startTime: 0, endTime: 1 }),
    );
    await LayerSegmentationV2Service.createSegment(
      makeSegment({ id: 'seg_chain_gap_2', startTime: 1, endTime: 2 }),
    );
    await LayerSegmentationV2Service.createSegment(
      makeSegment({ id: 'seg_chain_gap_3', startTime: 2, endTime: 3 }),
    );
    await LayerSegmentationV2Service.upsertSegmentContent(
      makeContent({ id: 'cnt_chain_gap_2', segmentId: 'seg_chain_gap_2', text: '乙' }),
    );

    await expect(
      LayerSegmentationV2Service.mergeAdjacentSegmentChain('seg_chain_gap_1', ['seg_chain_gap_3']),
    ).rejects.toThrow(/adjacent/);

    expect((await db.layer_units.get('seg_chain_gap_1'))?.endTime).toBe(1);
    expect(await db.layer_units.get('seg_chain_gap_2')).toBeTruthy();
    expect(await db.layer_units.get('seg_chain_gap_3')).toBeTruthy();
    expect(
      (await LayerSegmentationV2Service.listSegmentContents('seg_chain_gap_2')).map(
        (row) => row.text,
      ),
    ).toEqual(['乙']);
  });

  it('clamps a merged chain to the parent unit once', async () => {
    await putTestUnitAsLayerUnit(
      db,
      {
        id: 'utt_parent_chain_clamp',
        textId: 'text_1',
        mediaId: 'media_1',
        startTime: 1,
        endTime: 3,
        createdAt: NOW,
        updatedAt: NOW,
      } as LayerUnitDocType,
      'layer_trc_cmn',
    );
    await db.layer_units.bulkPut([
      {
        id: 'seg_chain_clamp_1',
        textId: 'text_1',
        mediaId: 'media_1',
        layerId: 'layer_trc_cmn',
        unitType: 'segment',
        startTime: 0.5,
        endTime: 1.5,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'seg_chain_clamp_2',
        textId: 'text_1',
        mediaId: 'media_1',
        layerId: 'layer_trc_cmn',
        unitType: 'segment',
        startTime: 1.5,
        endTime: 2.5,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'seg_chain_clamp_3',
        textId: 'text_1',
        mediaId: 'media_1',
        layerId: 'layer_trc_cmn',
        unitType: 'segment',
        startTime: 2.5,
        endTime: 3.5,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
    await db.unit_relations.bulkPut([
      {
        id: 'rel_chain_clamp_1',
        textId: 'text_1',
        sourceUnitId: 'seg_chain_clamp_1',
        targetUnitId: 'utt_parent_chain_clamp',
        relationType: 'derived_from',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'rel_chain_clamp_2',
        textId: 'text_1',
        sourceUnitId: 'seg_chain_clamp_2',
        targetUnitId: 'utt_parent_chain_clamp',
        relationType: 'derived_from',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'rel_chain_clamp_3',
        textId: 'text_1',
        sourceUnitId: 'seg_chain_clamp_3',
        targetUnitId: 'utt_parent_chain_clamp',
        relationType: 'derived_from',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);

    const merged = await LayerSegmentationV2Service.mergeAdjacentSegmentChain('seg_chain_clamp_1', [
      'seg_chain_clamp_2',
      'seg_chain_clamp_3',
    ]);

    expect(merged.startTime).toBe(1);
    expect(merged.endTime).toBe(3);
    expect(await db.layer_units.get('seg_chain_clamp_2')).toBeUndefined();
    expect(await db.layer_units.get('seg_chain_clamp_3')).toBeUndefined();
    expect(await db.unit_relations.where('sourceUnitId').equals('seg_chain_clamp_1').count()).toBe(
      1,
    );
  });
});
