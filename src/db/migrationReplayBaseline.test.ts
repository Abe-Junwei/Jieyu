import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { buildSegmentationV2BackfillRows, buildV28BackfillPlanForText, type LayerUnitContentDocType, type TierDefinitionDocType, type LayerUnitDocType } from './index';

const NOW = '2026-04-12T00:00:00.000Z';

function normalizeRows<T extends { id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.id.localeCompare(b.id));
}

describe('migration replay baseline', () => {
  it('replays v22 segmentation backfill fixture deterministically', () => {
    const units: LayerUnitDocType[] = [
      {
        id: 'utt_m1_1',
        textId: 'text_m1',
        mediaId: 'media_m1',
        startTime: 0,
        endTime: 1,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'utt_m1_2',
        textId: 'text_m1',
        mediaId: 'media_m1',
        startTime: 1,
        endTime: 2,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ];

    const tiers: TierDefinitionDocType[] = [
      {
        id: 'tier_trx_default',
        textId: 'text_m1',
        key: 'transcription-default',
        name: { default: 'Transcription' },
        tierType: 'time-aligned',
        contentType: 'transcription',
        isDefault: true,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'tier_trl_en',
        textId: 'text_m1',
        key: 'translation-en',
        name: { default: 'Translation EN' },
        tierType: 'time-aligned',
        contentType: 'translation',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ];

    const unitTexts: LayerUnitContentDocType[] = [
      {
        id: 'utx_m1_1',
        unitId: 'utt_m1_1',
        tierId: 'tier_trl_en',
        modality: 'text',
        text: 'hello',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      } as unknown as LayerUnitContentDocType,
      {
        id: 'utx_m1_2',
        unitId: 'utt_m1_2',
        tierId: 'tier_trx_default',
        modality: 'text',
        text: 'world',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      } as unknown as LayerUnitContentDocType,
    ];

    const rows = buildSegmentationV2BackfillRows({
      units,
      unitTexts,
      tiers,
      nowIso: NOW,
    });

    expect(normalizeRows(rows.segments).map((item) => item.id)).toEqual([
      'segv22_tier_trl_en_utt_m1_1',
      'segv22_tier_trx_default_utt_m1_1',
      'segv22_tier_trx_default_utt_m1_2',
    ]);

    expect(normalizeRows(rows.contents).map((item) => ({ id: item.id, segmentId: item.segmentId }))).toEqual([
      { id: 'utx_m1_1', segmentId: 'segv22_tier_trl_en_utt_m1_1' },
      { id: 'utx_m1_2', segmentId: 'segv22_tier_trx_default_utt_m1_2' },
    ]);

    expect(normalizeRows(rows.links).map((item) => ({
      id: item.id,
      sourceUnitId: item.sourceUnitId,
      targetUnitId: item.targetUnitId,
      relationType: item.relationType,
    }))).toEqual([
      {
        id: 'seglv22_tier_trl_en_utt_m1_1',
        sourceUnitId: 'segv22_tier_trx_default_utt_m1_1',
        targetUnitId: 'segv22_tier_trl_en_utt_m1_1',
        relationType: 'aligned_to',
      },
    ]);
  });

  it('replays v28 repair baseline for dangling segment references', () => {
    const unit: LayerUnitDocType = {
      id: 'utt_v28_fix',
      textId: 'text_m1',
      mediaId: 'media_m1',
      startTime: 4,
      endTime: 5,
      createdAt: NOW,
      updatedAt: NOW,
    };

    const text: LayerUnitContentDocType = {
      id: 'utx_v28_fix',
      unitId: 'utt_v28_fix',
      layerId: 'tier_trl_en',
      modality: 'text',
      text: 'repair me',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    };

    const existingContent: LayerUnitContentDocType = {
      id: 'utx_v28_fix',
      textId: 'text_m1',
      segmentId: 'seg_missing_old',
      layerId: 'tier_trl_en',
      modality: 'text',
      text: 'repair me',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: '2026-04-01T00:00:00.000Z',
    };

    const repairedPlan = buildV28BackfillPlanForText({
      text,
      unit,
      nowIso: NOW,
      existingContent,
      segmentExists: (segmentId) => segmentId === 'segv2_tier_trl_en_utt_v28_fix',
    });

    expect(repairedPlan).not.toBeNull();
    expect(repairedPlan?.segment.id).toBe('segv2_tier_trl_en_utt_v28_fix');
    expect(repairedPlan?.content.segmentId).toBe('segv2_tier_trl_en_utt_v28_fix');
    expect(repairedPlan?.content.updatedAt).toBe(NOW);

    const skippedPlan = buildV28BackfillPlanForText({
      text,
      unit,
      nowIso: NOW,
      existingContent: {
        ...existingContent,
        segmentId: 'seg_existing',
      },
      segmentExists: (segmentId) => segmentId === 'seg_existing',
    });

    expect(skippedPlan).toBeNull();
  });
});
