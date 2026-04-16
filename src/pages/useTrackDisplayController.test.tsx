// @vitest-environment jsdom
import { act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LayerDocType, LayerUnitDocType } from '../db';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import { useTrackDisplayController } from './useTrackDisplayController';

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

function makeSegment(id: string, layerId: string, startTime: number, endTime: number, speakerId?: string): LayerUnitDocType {
  return {
    id,
    layerId,
    mediaId: 'media-1',
    textId: 'text-1',
    startTime,
    endTime,
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z',
    ...(speakerId ? { speakerId } : {}),
  } as LayerUnitDocType;
}

describe('useTrackDisplayController', () => {
  it('switches single mode to multi-auto when overlap exists on the active layer', () => {
    const setTranscriptionTrackMode = vi.fn();

    renderHook(() => useTrackDisplayController({
      unitsOnCurrentMedia: [
        makeUnit('utt-1', 0, 2, 'spk-a'),
        makeUnit('utt-2', 1, 3, 'spk-b'),
      ],
      timelineRenderUnits: [
        makeUnit('utt-1', 0, 2, 'spk-a'),
        makeUnit('utt-2', 1, 3, 'spk-b'),
      ],
      activeLayerIdForEdits: 'layer-1',
      defaultTranscriptionLayerId: 'layer-1',
      layers: [makeLayer('layer-1')],
      segmentsByLayer: new Map<string, LayerUnitDocType[]>(),
      segmentSpeakerAssignmentsOnCurrentMedia: [],
      transcriptionTrackMode: 'single',
      setTranscriptionTrackMode,
      laneLockMap: {},
      setLaneLockMap: vi.fn(),
      selectedSpeakerIdsForTrackLock: [],
      speakerNameById: {},
      setLockConflictToast: vi.fn(),
      getUnitSpeakerKey: (unit) => unit.speakerId ?? 'unknown-speaker',
    }));

    expect(setTranscriptionTrackMode).toHaveBeenCalledWith('multi-auto');
  });

  it('switches to multi-auto using timelineUnitsOnCurrentMedia when overlapping views are provided', () => {
    const setTranscriptionTrackMode = vi.fn();

    const views: TimelineUnitView[] = [
      { id: 'v1', kind: 'unit', mediaId: 'media-1', layerId: 'layer-1', startTime: 0, endTime: 2, text: 'a', speakerId: 'spk-a' },
      { id: 'v2', kind: 'unit', mediaId: 'media-1', layerId: 'layer-1', startTime: 1, endTime: 3, text: 'b', speakerId: 'spk-b' },
    ];

    renderHook(() => useTrackDisplayController({
      unitsOnCurrentMedia: [],
      timelineUnitsOnCurrentMedia: views,
      timelineRenderUnits: [
        makeUnit('v1', 0, 2, 'spk-a'),
        makeUnit('v2', 1, 3, 'spk-b'),
      ],
      activeLayerIdForEdits: 'layer-1',
      defaultTranscriptionLayerId: 'layer-1',
      layers: [makeLayer('layer-1')],
      segmentsByLayer: new Map<string, LayerUnitDocType[]>(),
      segmentSpeakerAssignmentsOnCurrentMedia: [],
      transcriptionTrackMode: 'single',
      setTranscriptionTrackMode,
      laneLockMap: {},
      setLaneLockMap: vi.fn(),
      selectedSpeakerIdsForTrackLock: [],
      speakerNameById: {},
      setLockConflictToast: vi.fn(),
      getUnitSpeakerKey: (unit) => unit.speakerId ?? 'unknown-speaker',
    }));

    expect(setTranscriptionTrackMode).toHaveBeenCalledWith('multi-auto');
  });

  it('uses timelineUnitsOnCurrentMedia for speaker sort keys', () => {
    const views: TimelineUnitView[] = [
      { id: 'v1', kind: 'unit', mediaId: 'media-1', layerId: 'layer-1', startTime: 0, endTime: 1, text: 'a', speakerId: 'spk-b' },
      { id: 'v2', kind: 'unit', mediaId: 'media-1', layerId: 'layer-1', startTime: 1, endTime: 2, text: 'b', speakerId: 'spk-a' },
    ];

    const { result } = renderHook(() => useTrackDisplayController({
      unitsOnCurrentMedia: [],
      timelineUnitsOnCurrentMedia: views,
      timelineRenderUnits: [],
      activeLayerIdForEdits: 'layer-1',
      defaultTranscriptionLayerId: 'layer-1',
      layers: [makeLayer('layer-1')],
      segmentsByLayer: new Map<string, LayerUnitDocType[]>(),
      segmentSpeakerAssignmentsOnCurrentMedia: [],
      transcriptionTrackMode: 'multi-auto',
      setTranscriptionTrackMode: vi.fn(),
      laneLockMap: {},
      setLaneLockMap: vi.fn(),
      selectedSpeakerIdsForTrackLock: [],
      speakerNameById: {},
      setLockConflictToast: vi.fn(),
      getUnitSpeakerKey: (unit) => unit.speakerId ?? 'unknown-speaker',
    }));

    expect(result.current.speakerSortKeyById['spk-b']).toBe(0);
    expect(result.current.speakerSortKeyById['spk-a']).toBe(1);
  });

  it('clears fixed layout state and surfaces conflict toast on reset', () => {
    const setLaneLockMap = vi.fn();
    const setTranscriptionTrackMode = vi.fn();
    const setLockConflictToast = vi.fn();

    const { result } = renderHook(() => useTrackDisplayController({
      unitsOnCurrentMedia: [
        makeUnit('utt-1', 0, 4, 'spk-a'),
        makeUnit('utt-2', 1, 3, 'spk-a'),
      ],
      timelineRenderUnits: [
        makeUnit('utt-1', 0, 4, 'spk-a'),
        makeUnit('utt-2', 1, 3, 'spk-a'),
      ],
      activeLayerIdForEdits: 'layer-1',
      defaultTranscriptionLayerId: 'layer-1',
      layers: [makeLayer('layer-1', 'independent_boundary')],
      segmentsByLayer: new Map<string, LayerUnitDocType[]>([
        ['layer-1', [makeSegment('seg-1', 'layer-1', 0, 2, 'spk-a')]],
      ]),
      segmentSpeakerAssignmentsOnCurrentMedia: [],
      transcriptionTrackMode: 'multi-speaker-fixed',
      setTranscriptionTrackMode,
      laneLockMap: { 'spk-a': 0 },
      setLaneLockMap,
      selectedSpeakerIdsForTrackLock: ['spk-a'],
      speakerNameById: { 'spk-a': '说话人 A' },
      setLockConflictToast,
      getUnitSpeakerKey: (unit) => unit.speakerId ?? 'unknown-speaker',
    }));

    act(() => {
      result.current.handleResetTrackAutoLayout();
    });

    expect(setLaneLockMap).toHaveBeenCalledWith({});
    expect(setTranscriptionTrackMode).toHaveBeenCalledWith('multi-auto');
    expect(setLockConflictToast).toHaveBeenCalledWith(expect.objectContaining({
      count: 1,
      speakers: ['说话人 A'],
      nonce: expect.any(Number),
    }));
  });
});