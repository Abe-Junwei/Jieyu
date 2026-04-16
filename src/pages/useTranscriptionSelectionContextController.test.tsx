// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { LayerDocType, LayerSegmentDocType, UtteranceDocType } from '../db';
import { createTimelineUnit } from '../hooks/transcriptionTypes';
import { useTranscriptionSelectionContextController } from './useTranscriptionSelectionContextController';

function makeLayer(id: string): LayerDocType {
  const now = new Date().toISOString();
  return {
    id,
    textId: 'text-1',
    key: `layer_${id}`,
    name: { zho: id },
    layerType: 'transcription',
    languageId: 'cmn',
    modality: 'text',
    acceptsAudio: false,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  } as LayerDocType;
}

function makeUtterance(id: string, startTime: number, endTime: number, mediaId = 'media-1'): UtteranceDocType {
  const now = new Date().toISOString();
  return {
    id,
    textId: 'text-1',
    mediaId,
    startTime,
    endTime,
    createdAt: now,
    updatedAt: now,
  } as UtteranceDocType;
}

function makeSegment(id: string, layerId: string, startTime: number, endTime: number, utteranceId?: string): LayerSegmentDocType {
  const now = new Date().toISOString();
  return {
    id,
    textId: 'text-1',
    mediaId: 'media-1',
    layerId,
    startTime,
    endTime,
    createdAt: now,
    updatedAt: now,
    ...(utteranceId ? { utteranceId } : {}),
  } as LayerSegmentDocType;
}

describe('useTranscriptionSelectionContextController', () => {
  it('prefers explicit segment owner utterance id when available', () => {
    const layer = makeLayer('layer-seg');
    const explicitOwner = makeUtterance('utt-explicit', 1, 2);
    const fallbackOwner = makeUtterance('utt-fallback', 1, 2);
    const segment = makeSegment('seg-1', layer.id, 1.2, 1.8, explicitOwner.id);

    const { result } = renderHook(() => useTranscriptionSelectionContextController({
      layers: [layer],
      mediaItems: [],
      utterances: [fallbackOwner, explicitOwner],
      utterancesOnCurrentMedia: [fallbackOwner, explicitOwner],
      selectedUnit: null,
      selectedTimelineUnit: createTimelineUnit(layer.id, segment.id, 'segment'),
      segmentsByLayer: new Map([[layer.id, [segment]]]),
    }));

    expect(result.current.selectedTimelineOwnerUnit?.id).toBe(explicitOwner.id);
  });

  it('uses fallback owner ranking: narrower containing span first, then center-distance tie-break', () => {
    const layer = makeLayer('layer-seg');
    const narrowContaining = makeUtterance('utt-narrow', 9, 13);
    const wideContaining = makeUtterance('utt-wide', 8, 14);
    const equalSpanCloserCenter = makeUtterance('utt-center-a', 19, 23);
    const equalSpanFartherCenter = makeUtterance('utt-center-b', 18.5, 22.5);
    const segmentNarrow = makeSegment('seg-narrow', layer.id, 10, 12);
    const segmentCenterTie = makeSegment('seg-center', layer.id, 20, 22);

    const { result: narrowResult } = renderHook(() => useTranscriptionSelectionContextController({
      layers: [layer],
      mediaItems: [],
      utterances: [wideContaining, narrowContaining],
      utterancesOnCurrentMedia: [wideContaining, narrowContaining],
      selectedUnit: null,
      selectedTimelineUnit: createTimelineUnit(layer.id, segmentNarrow.id, 'segment'),
      segmentsByLayer: new Map([[layer.id, [segmentNarrow]]]),
    }));

    expect(narrowResult.current.selectedTimelineOwnerUnit?.id).toBe(narrowContaining.id);

    const { result: centerTieResult } = renderHook(() => useTranscriptionSelectionContextController({
      layers: [layer],
      mediaItems: [],
      utterances: [equalSpanFartherCenter, equalSpanCloserCenter],
      utterancesOnCurrentMedia: [equalSpanFartherCenter, equalSpanCloserCenter],
      selectedUnit: null,
      selectedTimelineUnit: createTimelineUnit(layer.id, segmentCenterTie.id, 'segment'),
      segmentsByLayer: new Map([[layer.id, [segmentCenterTie]]]),
    }));

    expect(centerTieResult.current.selectedTimelineOwnerUnit?.id).toBe(equalSpanCloserCenter.id);
  });

  it('filters fallback owners by segment media id before overlap ranking', () => {
    const layer = makeLayer('layer-seg');
    const wrongMediaContaining = makeUtterance('utt-wrong-media', 9, 13, 'media-2');
    const correctMediaContaining = makeUtterance('utt-correct-media', 9, 13, 'media-1');
    const segment = makeSegment('seg-media', layer.id, 10, 12);

    const { result } = renderHook(() => useTranscriptionSelectionContextController({
      layers: [layer],
      mediaItems: [],
      utterances: [wrongMediaContaining, correctMediaContaining],
      utterancesOnCurrentMedia: [wrongMediaContaining, correctMediaContaining],
      selectedUnit: null,
      selectedTimelineUnit: createTimelineUnit(layer.id, segment.id, 'segment'),
      segmentsByLayer: new Map([[layer.id, [segment]]]),
    }));

    expect(result.current.selectedTimelineOwnerUnit?.id).toBe(correctMediaContaining.id);
  });

  it('uses overlap ranking when no utterance fully contains the segment', () => {
    const layer = makeLayer('layer-seg');
    const fartherCenter = makeUtterance('utt-overlap-far', 9, 10.8);
    const closerCenter = makeUtterance('utt-overlap-close', 11, 11.8);
    const segment = makeSegment('seg-overlap-only', layer.id, 10, 12);

    const { result } = renderHook(() => useTranscriptionSelectionContextController({
      layers: [layer],
      mediaItems: [],
      utterances: [fartherCenter, closerCenter],
      utterancesOnCurrentMedia: [fartherCenter, closerCenter],
      selectedUnit: null,
      selectedTimelineUnit: createTimelineUnit(layer.id, segment.id, 'segment'),
      segmentsByLayer: new Map([[layer.id, [segment]]]),
    }));

    expect(result.current.selectedTimelineOwnerUnit?.id).toBe(closerCenter.id);
  });

  it('returns null owner when no explicit owner and no overlapping fallback utterance exists', () => {
    const layer = makeLayer('layer-seg');
    const nonOverlapping = makeUtterance('utt-non-overlap', 20, 22);
    const segment = makeSegment('seg-no-owner', layer.id, 10, 12);

    const { result } = renderHook(() => useTranscriptionSelectionContextController({
      layers: [layer],
      mediaItems: [],
      utterances: [nonOverlapping],
      utterancesOnCurrentMedia: [nonOverlapping],
      selectedUnit: null,
      selectedTimelineUnit: createTimelineUnit(layer.id, segment.id, 'segment'),
      segmentsByLayer: new Map([[layer.id, [segment]]]),
    }));

    expect(result.current.selectedTimelineOwnerUnit).toBeNull();
  });
});
