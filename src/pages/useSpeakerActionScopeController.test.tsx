// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LayerDocType, LayerUnitDocType, SpeakerDocType } from '../db';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import { unitToView } from '../hooks/timelineUnitView';
import { useSpeakerActionScopeController } from './useSpeakerActionScopeController';

function makeUnit(id: string, startTime: number, endTime: number, speakerId?: string): LayerUnitDocType {
  return {
    id,
    mediaId: 'media-1',
    textId: 'text-1',
    startTime,
    endTime,
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z',
    ...(speakerId ? { speakerId } : {}),
  } as LayerUnitDocType;
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
  unitId?: string;
  speakerId?: string;
}): LayerUnitDocType {
  return {
    id,
    layerId,
    mediaId: 'media-1',
    textId: 'text-1',
    startTime,
    endTime,
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z',
    ...(options?.unitId ? { unitId: options.unitId } : {}),
    ...(options?.speakerId ? { speakerId: options.speakerId } : {}),
  } as LayerUnitDocType;
}

function segmentToUnitView(segment: LayerUnitDocType): TimelineUnitView {
  return {
    id: segment.id,
    kind: 'segment',
    mediaId: segment.mediaId ?? '',
    layerId: segment.layerId ?? '',
    startTime: segment.startTime,
    endTime: segment.endTime,
    text: '',
    ...(segment.unitId ? { parentUnitId: segment.unitId } : {}),
  };
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
    const units = [makeUnit('utt-1', 0, 2, 'spk-owner')];
    const segments = [
      makeSegment('seg-explicit', 'layer-seg', 0, 1, { unitId: 'utt-1', speakerId: 'spk-explicit' }),
      makeSegment('seg-inherited', 'layer-seg', 1, 2, { unitId: 'utt-1' }),
    ];
    const unitsOnCurrentMedia = units.map((u) => unitToView(u, 'layer-seg'));
    const unitViewById = new Map<string, TimelineUnitView>([
      ...unitsOnCurrentMedia.map((u) => [u.id, u] as const),
      ...segments.map((s) => [s.id, segmentToUnitView(s)] as const),
    ]);

    const { result } = renderHook(() => useSpeakerActionScopeController({
      unitsOnCurrentMedia,
      unitViewById,
      getUnitDocById: (id: string) => units.find((u) => u.id === id),
      segmentsByLayer: new Map([['layer-seg', segments]]),
      speakers: [makeSpeaker('spk-explicit', '显式说话人'), makeSpeaker('spk-owner', '继承说话人')],
      layers: [makeLayer('layer-seg', 'independent_boundary')],
      defaultTranscriptionLayerId: 'layer-seg',
      selectedLayerId: 'layer-seg',
      selectedUnitIds: new Set(['seg-explicit', 'seg-inherited']),
      selectedTimelineUnit: null,
      getUnitSpeakerKey: (unit) => unit.speakerId ?? 'unknown-speaker',
    }));

    expect(result.current.activeSpeakerManagementLayer?.id).toBe('layer-seg');
    expect(result.current.speakerFilterOptionsForActions.map((item) => item.key)).toEqual(['spk-explicit']);
    expect(result.current.segmentSpeakerAssignmentsOnCurrentMedia).toEqual([
      { unitId: 'seg-explicit', speakerKey: 'spk-explicit' },
    ]);
    expect(result.current.selectedSegmentIdsForSpeakerActions.sort()).toEqual(['seg-explicit', 'seg-inherited']);
    expect(Array.from(result.current.selectedSpeakerUnitIdsForActionsSet).sort()).toEqual(['seg-explicit', 'seg-inherited']);
  });

  it('maps selected timeline segments back to owner unit ids', () => {
    const utt = makeUnit('utt-1', 0, 2, 'spk-1');
    const seg = makeSegment('seg-1', 'layer-seg', 0, 2, { unitId: 'utt-1', speakerId: 'spk-1' });
    const unitsOnCurrentMedia = [unitToView(utt, 'layer-seg')];
    const unitViewById = new Map<string, TimelineUnitView>([
      ...unitsOnCurrentMedia.map((u) => [u.id, u] as const),
      [seg.id, segmentToUnitView(seg)],
    ]);
    const { result } = renderHook(() => useSpeakerActionScopeController({
      unitsOnCurrentMedia,
      unitViewById,
      getUnitDocById: (id: string) => (id === 'utt-1' ? utt : undefined),
      segmentsByLayer: new Map([['layer-seg', [seg]]]),
      speakers: [makeSpeaker('spk-1', 'Alice')],
      layers: [makeLayer('layer-seg', 'independent_boundary')],
      defaultTranscriptionLayerId: 'layer-seg',
      selectedLayerId: 'layer-seg',
      selectedUnitIds: new Set(),
      selectedTimelineUnit: { unitId: 'seg-1', layerId: 'layer-seg', kind: 'segment' },
      getUnitSpeakerKey: (unit) => unit.speakerId ?? 'unknown-speaker',
    }));

    expect(result.current.selectedUnitIdsForSpeakerActions).toEqual(['seg-1']);
    expect(result.current.resolveSpeakerActionUnitIds(['seg-1'])).toEqual(['utt-1']);
    expect(result.current.selectedBatchSegmentsForSpeakerActions.map((item) => item.id)).toEqual(['seg-1']);
  });
});