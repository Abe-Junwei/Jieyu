// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { MediaItemDocType, UtteranceDocType } from '../db';
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

function makeUtterance(id: string, mediaId: string, startTime: number): UtteranceDocType {
  return {
    id,
    textId: 'text-1',
    mediaId,
    startTime,
    endTime: startTime + 1,
    createdAt: '2026-04-02T00:00:00.000Z',
    updatedAt: '2026-04-02T00:00:00.000Z',
    transcription: {},
  } as UtteranceDocType;
}

describe('useTranscriptionDerivedData', () => {
  it('uses selectedMediaId as the current-media scope when there is no selected timeline unit', () => {
    const utteranceOnCurrentMedia = makeUtterance('utt-current', 'media-1', 0);
    const utteranceOnOtherMedia = makeUtterance('utt-other', 'media-2', 10);

    const { result } = renderHook(() => useTranscriptionDerivedData({
      layers: [],
      layerToDeleteId: '',
      selectedTimelineUnit: null,
      selectedMediaId: 'media-1',
      mediaItems: [makeMedia('media-1'), makeMedia('media-2')],
      utterances: [utteranceOnCurrentMedia, utteranceOnOtherMedia],
      translations: [],
    }));

    expect(result.current.selectedUtterance).toBeUndefined();
    expect(result.current.selectedUtteranceMedia?.id).toBe('media-1');
    expect(result.current.utterancesOnCurrentMedia.map((item) => item.id)).toEqual(['utt-current']);
    expect(result.current.selectedRowMeta).toBeNull();
  });

  it('keeps current-media utterance scope anchored to selectedMediaId when selected utterance is on another media', () => {
    const utteranceOnCurrentMedia = makeUtterance('utt-current', 'media-1', 0);
    const utteranceOnOtherMedia = makeUtterance('utt-other', 'media-2', 10);
    const selectedTimelineUnit: TimelineUnit = {
      kind: 'utterance',
      layerId: 'layer-1',
      unitId: 'utt-other',
    };

    const { result } = renderHook(() => useTranscriptionDerivedData({
      layers: [],
      layerToDeleteId: '',
      selectedTimelineUnit,
      selectedMediaId: 'media-1',
      mediaItems: [makeMedia('media-1'), makeMedia('media-2')],
      utterances: [utteranceOnCurrentMedia, utteranceOnOtherMedia],
      translations: [],
    }));

    expect(result.current.selectedUtterance?.id).toBe('utt-other');
    expect(result.current.selectedUtteranceMedia?.id).toBe('media-1');
    expect(result.current.utterancesOnCurrentMedia.map((item) => item.id)).toEqual(['utt-current']);
    expect(result.current.selectedRowMeta).toBeNull();
  });
});
