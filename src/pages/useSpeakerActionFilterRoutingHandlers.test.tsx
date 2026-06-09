// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LayerDocType, LayerUnitDocType } from '../types/jieyuDbDocTypes';
import { useSpeakerActionFilterRoutingHandlers } from './useSpeakerActionFilterRoutingHandlers';

function makeLayer(id: string): LayerDocType {
  return {
    id,
    textId: 'text-1',
    key: id,
    name: { 'zh-CN': id },
    layerType: 'transcription',
    languageId: 'zh-CN',
    modality: 'text',
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z',
  } as LayerDocType;
}

function makeSegment(id: string, layerId: string, speakerId?: string): LayerUnitDocType {
  return {
    id,
    layerId,
    mediaId: 'media-1',
    textId: 'text-1',
    startTime: 0,
    endTime: 1,
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z',
    ...(typeof speakerId === 'string' && speakerId.length > 0 ? { speakerId } : {}),
  } as LayerUnitDocType;
}

describe('useSpeakerActionFilterRoutingHandlers', () => {
  it('delegates select to base handler when segment layer is inactive', () => {
    const handleSelectSpeakerUnits = vi.fn();
    const selectTimelineUnit = vi.fn();

    const { result } = renderHook(() =>
      useSpeakerActionFilterRoutingHandlers({
        activeSpeakerManagementLayer: null,
        segmentsByLayer: new Map(),
        segmentContentByLayer: new Map(),
        resolveExplicitSpeakerKeyForSegment: () => 'unknown-speaker',
        speakerFilterOptionsForActions: [],
        handleSelectSpeakerUnits,
        handleClearSpeakerAssignments: vi.fn(),
        handleExportSpeakerSegments: vi.fn(),
        selectedTimelineUnit: null,
        selectTimelineUnit,
        setSelectedUnitIds: vi.fn(),
        setActiveSpeakerFilterKey: vi.fn(),
        setSegmentSpeakerDialogState: vi.fn(),
        formatTime: (seconds) => `${seconds}s`,
        setSaveState: vi.fn(),
        t: (key) => key,
        tf: (key) => key,
      }),
    );

    act(() => {
      result.current.handleSelectSpeakerUnitsRouted('spk-a');
    });

    expect(handleSelectSpeakerUnits).toHaveBeenCalledWith('spk-a');
    expect(selectTimelineUnit).not.toHaveBeenCalled();
  });

  it('opens clear dialog for segment-layer speaker assignments', () => {
    const layer = makeLayer('layer-seg');
    const segment = makeSegment('seg-1', 'layer-seg', 'spk-a');
    const setSegmentSpeakerDialogState = vi.fn();

    const { result } = renderHook(() =>
      useSpeakerActionFilterRoutingHandlers({
        activeSpeakerManagementLayer: layer,
        segmentsByLayer: new Map([[layer.id, [segment]]]),
        segmentContentByLayer: new Map([[layer.id, new Map()]]),
        resolveExplicitSpeakerKeyForSegment: (item) => item.speakerId ?? 'unknown-speaker',
        speakerFilterOptionsForActions: [{ key: 'spk-a', name: 'Alice', count: 1 }],
        handleSelectSpeakerUnits: vi.fn(),
        handleClearSpeakerAssignments: vi.fn(),
        handleExportSpeakerSegments: vi.fn(),
        selectedTimelineUnit: null,
        selectTimelineUnit: vi.fn(),
        setSelectedUnitIds: vi.fn(),
        setActiveSpeakerFilterKey: vi.fn(),
        setSegmentSpeakerDialogState,
        formatTime: (seconds) => `${seconds}s`,
        setSaveState: vi.fn(),
        t: (key) => key,
        tf: (key) => key,
      }),
    );

    act(() => {
      result.current.handleClearSpeakerAssignmentsRouted('spk-a');
    });

    expect(setSegmentSpeakerDialogState).toHaveBeenCalledWith({
      mode: 'clear',
      speakerKey: 'spk-a',
      speakerName: 'Alice',
      affectedCount: 1,
    });
  });
});
