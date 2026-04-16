// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { MediaItemDocType, LayerUnitDocType } from '../db';
import { useTranscriptionDerivedData } from './useTranscriptionDerivedData';
import type { TimelineUnit } from './transcriptionTypes';

function makeMedia(id: string): MediaItemDocType {
  return {
    id,
    textId: 'text-1',
    filename: `${id}.wav`,
    mimeType: 'audio/wav',
    isOfflineCached: false,
    createdAt: '2026-04-02T00:00:00.000Z',
    updatedAt: '2026-04-02T00:00:00.000Z',
  } as MediaItemDocType;
}

function makeUnit(id: string, mediaId: string, startTime: number): LayerUnitDocType {
  return {
    id,
    textId: 'text-1',
    mediaId,
    startTime,
    endTime: startTime + 1,
    createdAt: '2026-04-02T00:00:00.000Z',
    updatedAt: '2026-04-02T00:00:00.000Z',
    transcription: {},
  } as LayerUnitDocType;
}

describe('useTranscriptionDerivedData', () => {
  it('uses selectedMediaId as the current-media scope when there is no selected timeline unit', () => {
    const unitOnCurrentMedia = makeUnit('utt-current', 'media-1', 0);
    const unitOnOtherMedia = makeUnit('utt-other', 'media-2', 10);

    const { result } = renderHook(() => useTranscriptionDerivedData({
      layers: [],
      layerToDeleteId: '',
      selectedTimelineUnit: null,
      selectedMediaId: 'media-1',
      mediaItems: [makeMedia('media-1'), makeMedia('media-2')],
      units: [unitOnCurrentMedia, unitOnOtherMedia],
      translations: [],
    }));

    expect(result.current.selectedUnit).toBeUndefined();
    expect(result.current.selectedUnitMedia?.id).toBe('media-1');
    expect(result.current.unitsOnCurrentMedia.map((item) => item.id)).toEqual(['utt-current']);
    expect(result.current.selectedRowMeta).toBeNull();
  });

  it('keeps current-media unit scope anchored to selectedMediaId when selected unit is on another media', () => {
    const unitOnCurrentMedia = makeUnit('utt-current', 'media-1', 0);
    const unitOnOtherMedia = makeUnit('utt-other', 'media-2', 10);
    const selectedTimelineUnit: TimelineUnit = {
      kind: 'unit',
      layerId: 'layer-1',
      unitId: 'utt-other',
    };

    const { result } = renderHook(() => useTranscriptionDerivedData({
      layers: [],
      layerToDeleteId: '',
      selectedTimelineUnit,
      selectedMediaId: 'media-1',
      mediaItems: [makeMedia('media-1'), makeMedia('media-2')],
      units: [unitOnCurrentMedia, unitOnOtherMedia],
      translations: [],
    }));

    expect(result.current.selectedUnit?.id).toBe('utt-other');
    expect(result.current.selectedUnitMedia?.id).toBe('media-1');
    expect(result.current.unitsOnCurrentMedia.map((item) => item.id)).toEqual(['utt-current']);
    expect(result.current.selectedRowMeta).toBeNull();
  });
});
