// @vitest-environment jsdom
import { fireEvent, render, screen, renderHook, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LayerDocType } from '../db';
import { useTimelineAnnotationHelpers } from './useTimelineAnnotationHelpers';

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

afterEach(() => {
  cleanup();
});

describe('useTimelineAnnotationHelpers', () => {
  it('preserves existing multi-selection when context-clicking a selected segment', () => {
    const selectTimelineUnit = vi.fn();
    const selectSegment = vi.fn();
    const selectUnit = vi.fn();
    const setSelectedLayerId = vi.fn();
    const onFocusLayerRow = vi.fn();
    const setCtxMenu = vi.fn();

    const { result } = renderHook(() => useTimelineAnnotationHelpers({
      manualSelectTsRef: { current: 0 },
      player: {
        isPlaying: false,
        stop: vi.fn(),
        seekTo: vi.fn(),
      },
      selectedTimelineUnit: { layerId: 'layer-seg', unitId: 'seg-1', kind: 'segment' },
      selectUnitRange: vi.fn(),
      toggleUnitSelection: vi.fn(),
      selectTimelineUnit,
      selectUnit,
      selectSegment,
      setSelectedLayerId,
      onFocusLayerRow,
      tierContainerRef: { current: null },
      zoomPxPerSec: 100,
      setCtxMenu,
      navigateUtteranceFromInput: vi.fn(),
      waveformAreaRef: { current: null },
      dragPreview: null,
      selectedUnitIds: new Set(['seg-1', 'seg-2']),
      focusedLayerRowId: 'layer-seg',
      zoomToUtterance: vi.fn(),
      startTimelineResizeDrag: vi.fn(),
      handleNoteClick: vi.fn(),
      resolveNoteIndicatorTarget: vi.fn(() => null),
      independentLayerIds: new Set(['layer-seg']),
    }));

    render(result.current.renderAnnotationItem(
      { id: 'seg-2', startTime: 1, endTime: 2 },
      makeLayer('layer-seg'),
      'segment-2',
      {
        onChange: vi.fn(),
        onBlur: vi.fn(),
      },
    ));

    fireEvent.contextMenu(screen.getByText('segment-2'));

    expect(selectTimelineUnit).not.toHaveBeenCalled();
    expect(selectSegment).not.toHaveBeenCalled();
    expect(selectUnit).not.toHaveBeenCalled();
    expect(setSelectedLayerId).toHaveBeenCalledWith('layer-seg');
    expect(onFocusLayerRow).toHaveBeenCalledWith('layer-seg');
    expect(setCtxMenu).toHaveBeenCalledWith({
      x: 0,
      y: 0,
      unitId: 'seg-2',
      layerId: 'layer-seg',
      unitKind: 'segment',
      splitTime: 1.001,
    });
  });

  it('routes dependent segment-backed lane context menu with segment unit kind', () => {
    const setCtxMenu = vi.fn();

    const { result } = renderHook(() => useTimelineAnnotationHelpers({
      manualSelectTsRef: { current: 0 },
      player: {
        isPlaying: false,
        stop: vi.fn(),
        seekTo: vi.fn(),
      },
      selectedTimelineUnit: { layerId: 'layer-dependent', unitId: 'seg-1', kind: 'segment' },
      selectUnitRange: vi.fn(),
      toggleUnitSelection: vi.fn(),
      selectTimelineUnit: vi.fn(),
      selectUnit: vi.fn(),
      selectSegment: vi.fn(),
      setSelectedLayerId: vi.fn(),
      onFocusLayerRow: vi.fn(),
      tierContainerRef: { current: null },
      zoomPxPerSec: 100,
      setCtxMenu,
      navigateUtteranceFromInput: vi.fn(),
      waveformAreaRef: { current: null },
      dragPreview: null,
      selectedUnitIds: new Set(['seg-1']),
      focusedLayerRowId: 'layer-dependent',
      zoomToUtterance: vi.fn(),
      startTimelineResizeDrag: vi.fn(),
      handleNoteClick: vi.fn(),
      resolveNoteIndicatorTarget: vi.fn(() => null),
      independentLayerIds: new Set(['layer-dependent']),
    }));

    render(result.current.renderAnnotationItem(
      { id: 'seg-1', startTime: 1, endTime: 2 },
      makeLayer('layer-dependent'),
      'segment-dependent',
      {
        onChange: vi.fn(),
        onBlur: vi.fn(),
      },
    ));

    fireEvent.contextMenu(screen.getByTitle('00:01.0 – 00:02.0'));

    expect(setCtxMenu).toHaveBeenCalledWith(expect.objectContaining({
      unitId: 'seg-1',
      layerId: 'layer-dependent',
      unitKind: 'segment',
    }));
  });

  it('opens shared context menu when right-clicking active annotation input', () => {
    const setCtxMenu = vi.fn();

    const { result } = renderHook(() => useTimelineAnnotationHelpers({
      manualSelectTsRef: { current: 0 },
      player: {
        isPlaying: false,
        stop: vi.fn(),
        seekTo: vi.fn(),
      },
      selectedTimelineUnit: { layerId: 'layer-input', unitId: 'utt-1', kind: 'utterance' },
      selectUnitRange: vi.fn(),
      toggleUnitSelection: vi.fn(),
      selectTimelineUnit: vi.fn(),
      selectUnit: vi.fn(),
      selectSegment: vi.fn(),
      setSelectedLayerId: vi.fn(),
      onFocusLayerRow: vi.fn(),
      tierContainerRef: { current: null },
      zoomPxPerSec: 100,
      setCtxMenu,
      navigateUtteranceFromInput: vi.fn(),
      waveformAreaRef: { current: null },
      dragPreview: null,
      selectedUnitIds: new Set(['utt-1']),
      focusedLayerRowId: 'layer-input',
      zoomToUtterance: vi.fn(),
      startTimelineResizeDrag: vi.fn(),
      handleNoteClick: vi.fn(),
      resolveNoteIndicatorTarget: vi.fn(() => null),
      independentLayerIds: new Set(),
    }));

    render(result.current.renderAnnotationItem(
      { id: 'utt-1', startTime: 1, endTime: 2 },
      makeLayer('layer-input'),
      'draft text',
      {
        onChange: vi.fn(),
        onBlur: vi.fn(),
      },
    ));

    fireEvent.contextMenu(screen.getByRole('textbox'));

    expect(setCtxMenu).toHaveBeenCalledWith(expect.objectContaining({
      unitId: 'utt-1',
      layerId: 'layer-input',
      unitKind: 'utterance',
      splitTime: 1.001,
      x: 0,
      y: 0,
    }));
  });
});