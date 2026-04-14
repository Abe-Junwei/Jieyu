// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LayerDocType, LayerSegmentDocType, SpeakerDocType, UtteranceDocType } from '../db';
import { useSpeakerActionScopeController } from './useSpeakerActionScopeController';

function makeUtterance(id: string, startTime: number, endTime: number, speakerId?: string): UtteranceDocType {
  return {
    id,
    mediaId: 'media-1',
    textId: 'text-1',
    startTime,
    endTime,
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z',
    ...(speakerId ? { speakerId } : {}),
  } as UtteranceDocType;
}

function makeLayer(id: string, constraint?: LayerDocType['constraint']): LayerDocType {
  return {
    id,
    textId: 'text-1',
    key: id,
    name: { 'zh-CN': id },
    layerType: 'transcription',
    languageId: 'zh-CN',
    modality: 'text',
    ...(constraint ? { constraint } : {}),
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z',
  } as LayerDocType;
}

function makeSegment(id: string, layerId: string, startTime: number, endTime: number, options?: {
  utteranceId?: string;
  speakerId?: string;
}): LayerSegmentDocType {
  return {
    id,
    layerId,
    mediaId: 'media-1',
    textId: 'text-1',
    startTime,
    endTime,
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z',
    ...(options?.utteranceId ? { utteranceId: options.utteranceId } : {}),
    ...(options?.speakerId ? { speakerId: options.speakerId } : {}),
  } as LayerSegmentDocType;
}

function makeSpeaker(id: string, name: string): SpeakerDocType {
  return {
    id,
    name,
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z',
  } as SpeakerDocType;
}

describe('useSpeakerActionScopeController', () => {
  it('uses explicit segment speaker labels for independent speaker management layers', () => {
    const utterances = [makeUtterance('utt-1', 0, 2, 'spk-owner')];
    const segments = [
      makeSegment('seg-explicit', 'layer-seg', 0, 1, { utteranceId: 'utt-1', speakerId: 'spk-explicit' }),
      makeSegment('seg-inherited', 'layer-seg', 1, 2, { utteranceId: 'utt-1' }),
    ];

    const { result } = renderHook(() => useSpeakerActionScopeController({
      utterancesOnCurrentMedia: utterances,
      segmentsByLayer: new Map([['layer-seg', segments]]),
      speakers: [makeSpeaker('spk-explicit', '显式说话人'), makeSpeaker('spk-owner', '继承说话人')],
      layers: [makeLayer('layer-seg', 'independent_boundary')],
      defaultTranscriptionLayerId: 'layer-seg',
      selectedLayerId: 'layer-seg',
      selectedUnitIds: new Set(['seg-explicit', 'seg-inherited']),
      selectedTimelineUnit: null,
      getUtteranceSpeakerKey: (utterance) => utterance.speakerId ?? 'unknown-speaker',
    }));

    expect(result.current.activeSpeakerManagementLayer?.id).toBe('layer-seg');
    expect(result.current.speakerFilterOptionsForActions.map((item) => item.key)).toEqual(['spk-explicit']);
    expect(result.current.segmentSpeakerAssignmentsOnCurrentMedia).toEqual([
      { unitId: 'seg-explicit', speakerKey: 'spk-explicit' },
      { unitId: 'seg-inherited', speakerKey: 'spk-owner' },
    ]);
    expect(result.current.selectedSegmentIdsForSpeakerActions.sort()).toEqual(['seg-explicit', 'seg-inherited']);
    expect(Array.from(result.current.selectedSpeakerUnitIdsForActionsSet).sort()).toEqual(['seg-explicit', 'seg-inherited']);
  });

  it('maps selected timeline segments back to owner utterance ids', () => {
    const { result } = renderHook(() => useSpeakerActionScopeController({
      utterancesOnCurrentMedia: [makeUtterance('utt-1', 0, 2, 'spk-1')],
      segmentsByLayer: new Map([[
        'layer-seg',
        [makeSegment('seg-1', 'layer-seg', 0, 2, { utteranceId: 'utt-1', speakerId: 'spk-1' })],
      ]]),
      speakers: [makeSpeaker('spk-1', 'Alice')],
      layers: [makeLayer('layer-seg', 'independent_boundary')],
      defaultTranscriptionLayerId: 'layer-seg',
      selectedLayerId: 'layer-seg',
      selectedUnitIds: new Set(),
      selectedTimelineUnit: { unitId: 'seg-1' },
      getUtteranceSpeakerKey: (utterance) => utterance.speakerId ?? 'unknown-speaker',
    }));

    expect(result.current.selectedUnitIdsForSpeakerActions).toEqual(['seg-1']);
    expect(result.current.resolveSpeakerActionUtteranceIds(['seg-1'])).toEqual(['utt-1']);
    expect(result.current.selectedBatchSegmentsForSpeakerActions.map((item) => item.id)).toEqual(['seg-1']);
  });
});