import { describe, expect, it } from 'vitest';
import { batchApply, diagnoseQuality, findIncompleteUnits, suggestNextAction } from './intentTools';
import type { AiPromptContext } from './chatDomain.types';
import type { TimelineUnitView } from '../../hooks/timelineUnitView';

const units: TimelineUnitView[] = [
  {
    id: 'seg-1',
    kind: 'segment',
    mediaId: 'media-1',
    layerId: 'layer-a',
    startTime: 0,
    endTime: 1,
    text: '',
    annotationStatus: 'raw',
  },
  {
    id: 'utt-2',
    kind: 'utterance',
    mediaId: 'media-1',
    layerId: 'layer-a',
    startTime: 1,
    endTime: 2,
    text: 'done',
    annotationStatus: 'verified',
    speakerId: 'spk-1',
  },
];

const context: AiPromptContext = {
  shortTerm: {
    localUnitIndex: units,
  },
  longTerm: {
    waveformAnalysis: {
      gapCount: 1,
      overlapCount: 0,
      lowConfidenceCount: 0,
      maxGapSeconds: 0.2,
    },
  },
};

describe('intentTools', () => {
  it('finds incomplete units', () => {
    const result = findIncompleteUnits(context, {});
    expect(result.items[0]).toEqual(expect.objectContaining({ id: 'seg-1' }));
    expect(result.meta).toEqual(expect.objectContaining({
      totalIncomplete: 1,
      byLayer: [expect.objectContaining({ layerId: 'layer-a', count: 1 })],
    }));
  });

  it('diagnoses quality issues', () => {
    const result = diagnoseQuality(context);
    expect(result.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'missing_speaker' }),
      expect.objectContaining({ category: 'empty_text' }),
    ]));
    expect(result.meta).toEqual(expect.objectContaining({
      byLayer: expect.objectContaining({
        missingSpeaker: [expect.objectContaining({ layerId: 'layer-a', count: 1 })],
      }),
    }));
  });

  it('suggests next actions from project state', () => {
    expect(suggestNextAction(context).items[0]).toEqual(expect.objectContaining({ action: 'review_incomplete_units' }));
  });

  it('builds batch apply preview items', () => {
    const result = batchApply(context, { action: 'verify', unitIds: ['seg-1'] });
    expect(result.items[0]).toEqual(
      expect.objectContaining({ id: 'seg-1', action: 'verify' }),
    );
    expect(result.meta).toEqual(expect.objectContaining({
      requestedUnitIdCount: 1,
      matchedUnitIdCount: 1,
      chunkSize: 24,
      chunkCount: 1,
      byLayer: [expect.objectContaining({ layerId: 'layer-a', count: 1 })],
    }));
  });

  it('parses find_incomplete_units limit from numeric string', () => {
    const many: TimelineUnitView[] = Array.from({ length: 8 }, (_, index) => ({
      id: `u-${index}`,
      kind: 'segment',
      mediaId: 'm1',
      layerId: 'layer-a',
      startTime: index,
      endTime: index + 0.5,
      text: '',
      annotationStatus: 'raw',
    }));
    const ctx: AiPromptContext = { shortTerm: { localUnitIndex: many }, longTerm: {} };
    const result = findIncompleteUnits(ctx, { limit: '3' });
    expect(result.items).toHaveLength(3);
    expect(result.meta).toEqual(expect.objectContaining({ totalIncomplete: 8 }));
  });

  it('batch_apply reports unresolved unit ids and dedupes resolved targets', () => {
    const result = batchApply(context, {
      action: 'verify',
      unitIds: ['seg-1', 'missing-1', 'seg-1'],
    });
    expect(result.items).toHaveLength(1);
    expect(result.meta).toEqual(expect.objectContaining({
      requestedUnitIdCount: 3,
      matchedUnitIdCount: 1,
      chunkSize: 24,
      chunkCount: 1,
      unresolvedUnitIds: ['missing-1'],
    }));
  });

  it('batch_apply walks unitIds in bounded chunks for large batches', () => {
    const manyIds = Array.from({ length: 50 }, (_, i) => `u-${i}`);
    const localUnitIndex: TimelineUnitView[] = manyIds.map((id, index) => ({
      id,
      kind: 'utterance',
      mediaId: 'm1',
      layerId: 'layer-a',
      startTime: index,
      endTime: index + 0.5,
      text: 'x',
    }));
    const ctx: AiPromptContext = { shortTerm: { localUnitIndex }, longTerm: {} };
    const result = batchApply(ctx, { action: 'verify', unitIds: manyIds });
    expect(result.meta).toEqual(expect.objectContaining({
      chunkSize: 24,
      chunkCount: 3,
      matchedUnitIdCount: 50,
      requestedUnitIdCount: 50,
    }));
    expect(result.items).toHaveLength(50);
  });

  it('batch_apply truncates preview items when matches exceed cap', () => {
    const manyIds = Array.from({ length: 100 }, (_, i) => `u-${i}`);
    const localUnitIndex: TimelineUnitView[] = manyIds.map((id, index) => ({
      id,
      kind: 'utterance',
      mediaId: 'm1',
      layerId: 'layer-a',
      startTime: index,
      endTime: index + 0.5,
      text: 'x',
    }));
    const ctx: AiPromptContext = { shortTerm: { localUnitIndex }, longTerm: {} };
    const result = batchApply(ctx, { action: 'verify', unitIds: manyIds });
    expect(result.meta).toEqual(expect.objectContaining({
      previewTruncated: true,
      previewItemCap: 64,
      matchedUnitIdCount: 100,
    }));
    expect(result.items).toHaveLength(64);
  });

  it('diagnose_quality surfaces waveform overlap and low-confidence counts', () => {
    const ctx: AiPromptContext = {
      shortTerm: { localUnitIndex: units },
      longTerm: {
        waveformAnalysis: {
          gapCount: 0,
          overlapCount: 2,
          lowConfidenceCount: 3,
          maxGapSeconds: 0,
        },
      },
    };
    const result = diagnoseQuality(ctx);
    expect(result.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'waveform_overlap', count: 2 }),
      expect.objectContaining({ category: 'low_confidence_regions', count: 3 }),
    ]));
  });
});
