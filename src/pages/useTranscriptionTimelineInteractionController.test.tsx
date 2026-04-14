// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayerDocType, LayerSegmentDocType, UtteranceDocType } from '../db';
import { useTranscriptionTimelineInteractionController } from './useTranscriptionTimelineInteractionController';

const { mockUpdateSegment } = vi.hoisted(() => ({
  mockUpdateSegment: vi.fn<(segmentId: string, payload: unknown) => Promise<void>>(async () => undefined),
}));

vi.mock('../services/LayerSegmentationV2Service', () => ({
  LayerSegmentationV2Service: {
    updateSegment: (segmentId: string, payload: unknown) => mockUpdateSegment(segmentId, payload),
  },
}));

function makeLayer(id: string, layerType: LayerDocType['layerType'] = 'transcription'): LayerDocType {
  return {
    id,
    textId: 'text-1',
    key: id,
    name: { 'zh-CN': id },
    layerType,
    languageId: 'zh-CN',
    modality: 'text',
    createdAt: '2026-03-31T00:00:00.000Z',
    updatedAt: '2026-03-31T00:00:00.000Z',
  } as LayerDocType;
}

function makeUtterance(id: string, startTime: number, endTime: number): UtteranceDocType {
  return {
    id,
    mediaId: 'media-1',
    textId: 'text-1',
    startTime,
    endTime,
    createdAt: '2026-03-31T00:00:00.000Z',
    updatedAt: '2026-03-31T00:00:00.000Z',
  } as UtteranceDocType;
}

function makeSegment(id: string, layerId: string, startTime: number, endTime: number): LayerSegmentDocType {
  return {
    id,
    layerId,
    mediaId: 'media-1',
    textId: 'text-1',
    startTime,
    endTime,
    createdAt: '2026-03-31T00:00:00.000Z',
    updatedAt: '2026-03-31T00:00:00.000Z',
  } as LayerSegmentDocType;
}

type HookInput = Parameters<typeof useTranscriptionTimelineInteractionController>[0];

function createWaveformInstance() {
  const scrollParent = document.createElement('div');
  Object.defineProperty(scrollParent, 'scrollLeft', { configurable: true, value: 0, writable: true });
  Object.defineProperty(scrollParent, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ left: 0, top: 0, right: 400, bottom: 40, width: 400, height: 40 }),
  });

  const wrapper = document.createElement('div');
  Object.defineProperty(wrapper, 'scrollWidth', { configurable: true, value: 400 });
  Object.defineProperty(wrapper, 'parentElement', { configurable: true, value: scrollParent });

  return {
    getCurrentTime: vi.fn(() => 12),
    getWrapper: vi.fn(() => wrapper),
    getDuration: vi.fn(() => 40),
    getDecodedData: vi.fn(() => null),
  };
}

function createWaveCanvasElement() {
  const node = document.createElement('div');
  Object.defineProperty(node, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
  return node as HTMLDivElement;
}

function createBaseInput(overrides: Partial<HookInput> = {}): HookInput {
  const utterances = [makeUtterance('utt-1', 0, 5), makeUtterance('utt-2', 5, 8)];
  const waveformInstance = createWaveformInstance();
  const waveCanvas = createWaveCanvasElement();

  return {
    layers: [makeLayer('layer-main'), makeLayer('layer-tr', 'translation')],
    saveUtteranceText: vi.fn(async () => undefined),
    saveTextTranslationForUtterance: vi.fn(async () => undefined),
    utterances,
    selectUnit: vi.fn(),
    manualSelectTsRef: { current: 0 },
    player: {
      isPlaying: false,
      stop: vi.fn(),
      seekTo: vi.fn(),
      instanceRef: { current: waveformInstance },
    },
    locale: 'zh-CN',
    sidePaneRows: [],
    selectedTimelineUtteranceId: 'utt-1',
    onSetNotePopover: vi.fn(),
    onSetSidebarError: vi.fn(),
    onRevealSchemaLayer: vi.fn(),
    onOpenPdfPreviewRequest: vi.fn(),
    waveformTimelineItems: [
      { id: 'seg-1', startTime: 1, endTime: 2, mediaId: 'media-1' },
      { id: 'seg-2', startTime: 3, endTime: 4, mediaId: 'media-1' },
    ],
    runSplitAtTime: vi.fn(),
    activeLayerIdForEdits: 'layer-main',
    useSegmentWaveformRegions: true,
    selectTimelineUnit: vi.fn(),
    selectedTimelineUnit: null,
    toggleSegmentSelection: vi.fn(),
    selectSegmentRange: vi.fn(),
    toggleUnitSelection: vi.fn(),
    selectUnitRange: vi.fn(),
    setSubSelectionRange: vi.fn(),
    subSelectDragRef: { current: null },
    waveCanvasRef: { current: waveCanvas },
    zoomToPercent: vi.fn(),
    zoomToUtterance: vi.fn(),
    resolveSegmentRoutingForLayer: (layerId?: string) => ({
      segmentSourceLayer: layerId === 'layer-sub' ? makeLayer('layer-sub') : undefined,
      sourceLayerId: layerId ?? 'layer-main',
      editMode: layerId === 'layer-sub' ? 'time-subdivision' : 'utterance',
    }),
    segmentsByLayer: new Map([['layer-sub', [makeSegment('seg-1', 'layer-sub', 0, 2), makeSegment('seg-2', 'layer-sub', 3, 4)]]]),
    utterancesOnCurrentMedia: utterances,
    getNeighborBounds: vi.fn(() => ({ left: 0.2, right: 1.8 })),
    reloadSegments: vi.fn(async () => undefined),
    saveUtteranceTiming: vi.fn(async () => undefined),
    setSaveState: vi.fn(),
    selectedUnitIds: new Set<string>(),
    selectedWaveformRegionId: null,
    beginTimingGesture: vi.fn(),
    endTimingGesture: vi.fn(),
    makeSnapGuide: vi.fn((bounds, start, end) => ({ visible: true, start, end, bounds })),
    snapEnabled: false,
    setSnapGuide: vi.fn(),
    setDragPreview: vi.fn(),
    creatingSegmentRef: { current: false },
    markingModeRef: { current: false },
    setCtxMenu: vi.fn(),
    createUtteranceFromSelection: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('useTranscriptionTimelineInteractionController', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('routes search replace to transcription and translation saves', () => {
    const saveUtteranceText = vi.fn(async () => undefined);
    const saveTextTranslationForUtterance = vi.fn(async () => undefined);
    const { result } = renderHook(() => useTranscriptionTimelineInteractionController(createBaseInput({
      saveUtteranceText,
      saveTextTranslationForUtterance,
    })));

    act(() => {
      result.current.handleSearchReplace('utt-1', 'layer-main', 'old', 'new-transcription');
      result.current.handleSearchReplace('utt-1', 'layer-tr', 'old', 'new-translation');
      result.current.handleSearchReplace('utt-2', undefined, 'old', 'new-default');
    });

    expect(saveUtteranceText).toHaveBeenNthCalledWith(1, 'utt-1', 'new-transcription', 'layer-main');
    expect(saveTextTranslationForUtterance).toHaveBeenCalledWith('utt-1', 'new-translation', 'layer-tr');
    expect(saveUtteranceText).toHaveBeenNthCalledWith(2, 'utt-2', 'new-default');
  });

  it('routes split and zoom requests through waveform items', () => {
    const runSplitAtTime = vi.fn();
    const stop = vi.fn();
    const seekTo = vi.fn();
    const selectTimelineUnit = vi.fn();
    const zoomToPercent = vi.fn();
    const { result } = renderHook(() => useTranscriptionTimelineInteractionController(createBaseInput({
      runSplitAtTime,
      player: {
        isPlaying: true,
        stop,
        seekTo,
        instanceRef: { current: createWaveformInstance() },
      },
      selectTimelineUnit,
      zoomToPercent,
    })));

    expect(result.current.handleSplitAtTimeRequest(1.5)).toBe(true);
    expect(runSplitAtTime).toHaveBeenCalledWith('seg-1', 1.5);

    expect(result.current.handleZoomToSegmentRequest('seg-2', 6)).toBe(true);
    expect(stop).toHaveBeenCalled();
    expect(selectTimelineUnit).toHaveBeenCalledWith({ layerId: 'layer-main', unitId: 'seg-2', kind: 'segment' });
    expect(seekTo).toHaveBeenCalledWith(3);
    expect(zoomToPercent).toHaveBeenCalledWith(600, 0.5, 'custom');
  });

  it('computes waveform context menu split time and updates selection', () => {
    const stop = vi.fn();
    const selectTimelineUnit = vi.fn();
    const setCtxMenu = vi.fn();
    const { result } = renderHook(() => useTranscriptionTimelineInteractionController(createBaseInput({
      player: {
        isPlaying: true,
        stop,
        seekTo: vi.fn(),
        instanceRef: { current: createWaveformInstance() },
      },
      selectTimelineUnit,
      setCtxMenu,
    })));

    act(() => {
      result.current.handleWaveformRegionContextMenu('seg-1', 100, 24);
    });

    expect(stop).toHaveBeenCalled();
    expect(selectTimelineUnit).toHaveBeenCalledWith({ layerId: 'layer-main', unitId: 'seg-1', kind: 'segment' });
    expect(setCtxMenu).toHaveBeenCalledWith(expect.objectContaining({
      unitId: 'seg-1',
      layerId: 'layer-main',
      unitKind: 'segment',
      splitTime: 10,
    }));
  });

  it('keeps dependent layer id when opening waveform context menu in segment-backed mode', () => {
    const selectTimelineUnit = vi.fn();
    const setCtxMenu = vi.fn();

    const { result } = renderHook(() => useTranscriptionTimelineInteractionController(createBaseInput({
      activeLayerIdForEdits: 'layer-dependent',
      useSegmentWaveformRegions: true,
      selectTimelineUnit,
      setCtxMenu,
    })));

    act(() => {
      result.current.handleWaveformRegionContextMenu('seg-2', 80, 16);
    });

    expect(selectTimelineUnit).toHaveBeenCalledWith({ layerId: 'layer-dependent', unitId: 'seg-2', kind: 'segment' });
    expect(setCtxMenu).toHaveBeenCalledWith(expect.objectContaining({
      unitId: 'seg-2',
      layerId: 'layer-dependent',
      unitKind: 'segment',
    }));
  });

  it('routes waveform click, double-click and create through selection and creation handlers', async () => {
    const stop = vi.fn();
    const seekTo = vi.fn();
    const setSubSelectionRange = vi.fn();
    const selectSegmentRange = vi.fn();
    const zoomToUtterance = vi.fn();
    const createUtteranceFromSelection = vi.fn(async () => undefined);
    const { result } = renderHook(() => useTranscriptionTimelineInteractionController(createBaseInput({
      player: {
        isPlaying: true,
        stop,
        seekTo,
        instanceRef: { current: createWaveformInstance() },
      },
      setSubSelectionRange,
      selectedTimelineUnit: { layerId: 'layer-main', unitId: 'seg-2', kind: 'segment' },
      selectSegmentRange,
      zoomToUtterance,
      createUtteranceFromSelection,
    })));

    act(() => {
      result.current.handleWaveformRegionClick('seg-1', 1.4, new MouseEvent('click', { shiftKey: true }));
      result.current.handleWaveformRegionDoubleClick('seg-1', 1, 2);
      result.current.handleWaveformRegionCreate(2.5, 3.5);
    });

    expect(stop).toHaveBeenCalled();
    expect(setSubSelectionRange).toHaveBeenCalledWith(null);
    expect(seekTo).toHaveBeenCalledWith(1.4);
    expect(selectSegmentRange).toHaveBeenCalledWith('seg-2', 'seg-1', expect.any(Array));
    expect(zoomToUtterance).toHaveBeenCalledWith(1, 2);

    await act(async () => {
      await Promise.resolve();
    });
    expect(createUtteranceFromSelection).toHaveBeenCalledWith(2.5, 3.5);
  });

  it('creates segment on double-click when preference is set to create-segment', async () => {
    localStorage.setItem('jieyu:waveform-double-click-action', 'create-segment');

    const zoomToUtterance = vi.fn();
    const createUtteranceFromSelection = vi.fn(async () => undefined);
    const { result } = renderHook(() => useTranscriptionTimelineInteractionController(createBaseInput({
      useSegmentWaveformRegions: false,
      zoomToUtterance,
      createUtteranceFromSelection,
    })));

    act(() => {
      result.current.handleWaveformRegionDoubleClick('seg-1', 1, 2);
    });

    expect(zoomToUtterance).not.toHaveBeenCalled();
    await act(async () => {
      await Promise.resolve();
    });
    expect(createUtteranceFromSelection).toHaveBeenCalledWith(1, 2);
  });

  it('keeps double-click zoom in segment waveform mode even when preference is create-segment', () => {
    localStorage.setItem('jieyu:waveform-double-click-action', 'create-segment');

    const zoomToUtterance = vi.fn();
    const createUtteranceFromSelection = vi.fn(async () => undefined);
    const { result } = renderHook(() => useTranscriptionTimelineInteractionController(createBaseInput({
      useSegmentWaveformRegions: true,
      zoomToUtterance,
      createUtteranceFromSelection,
    })));

    act(() => {
      result.current.handleWaveformRegionDoubleClick('seg-1', 1, 2);
    });

    expect(zoomToUtterance).toHaveBeenCalledWith(1, 2);
    expect(createUtteranceFromSelection).not.toHaveBeenCalled();
  });

  it('captures Alt pointerdown into sub-selection drag state', () => {
    const subSelectDragRef = { current: null as { active: boolean; regionId: string; anchorTime: number; pointerId: number } | null };
    const waveCanvas = createWaveCanvasElement();
    const { result } = renderHook(() => useTranscriptionTimelineInteractionController(createBaseInput({
      subSelectDragRef,
      waveCanvasRef: { current: waveCanvas },
    })));

    act(() => {
      result.current.handleWaveformRegionAltPointerDown('seg-1', 1.25, 7, 90);
    });

    expect(subSelectDragRef.current).toEqual({ active: false, regionId: 'seg-1', anchorTime: 1.25, pointerId: 7 });
    expect((waveCanvas as HTMLDivElement & { setPointerCapture: ReturnType<typeof vi.fn> }).setPointerCapture).toHaveBeenCalledWith(7);
  });

  it('updates drag preview and auto-selects waveform items during playback time updates', () => {
    const stop = vi.fn();
    const beginTimingGesture = vi.fn();
    const setDragPreview = vi.fn();
    const setSnapGuide = vi.fn();
    const makeSnapGuide = vi.fn((bounds, start, end) => ({ visible: true, start, end, bounds }));
    const selectTimelineUnit = vi.fn();
    const { result } = renderHook(() => useTranscriptionTimelineInteractionController(createBaseInput({
      player: {
        isPlaying: true,
        stop,
        seekTo: vi.fn(),
        instanceRef: { current: createWaveformInstance() },
      },
      beginTimingGesture,
      setDragPreview,
      setSnapGuide,
      makeSnapGuide,
      selectTimelineUnit,
      selectedWaveformRegionId: 'seg-2',
    })));

    act(() => {
      result.current.handleWaveformRegionUpdate('seg-1', 1.2, 1.9);
      result.current.handleWaveformTimeUpdate(1.5);
    });

    expect(stop).toHaveBeenCalled();
    expect(beginTimingGesture).toHaveBeenCalledWith('seg-1');
    expect(setDragPreview).toHaveBeenCalledWith({ id: 'seg-1', start: 1.2, end: 1.9 });
    expect(makeSnapGuide).toHaveBeenCalled();
    expect(setSnapGuide).toHaveBeenCalled();
    expect(selectTimelineUnit).toHaveBeenCalledWith({ layerId: 'layer-main', unitId: 'seg-1', kind: 'segment' });
  });

  it('blocks waveform time-subdivision resize when dragged beyond parent utterance bounds', () => {
    mockUpdateSegment.mockClear();
    const setSaveState = vi.fn();
    const setSnapGuide = vi.fn();
    const { result } = renderHook(() => useTranscriptionTimelineInteractionController(createBaseInput({
      activeLayerIdForEdits: 'layer-sub',
      setSaveState,
      setSnapGuide,
    })));

    act(() => {
      result.current.handleWaveformRegionUpdateEnd('seg-1', -0.005, 5.005);
    });

    expect(mockUpdateSegment).not.toHaveBeenCalled();
    expect(setSaveState).toHaveBeenCalledWith({ kind: 'error', message: '无法将时间细分区间拖动到父句段范围之外。' });
    expect(setSnapGuide).toHaveBeenCalledWith({ visible: false });
  });

  it('clamps time-subdivision saves to parent utterance bounds', async () => {
    mockUpdateSegment.mockClear();
    const reloadSegments = vi.fn(async () => undefined);
    const setSaveState = vi.fn();
    const { result } = renderHook(() => useTranscriptionTimelineInteractionController(createBaseInput({
      reloadSegments,
      setSaveState,
    })));

    await act(async () => {
      await result.current.saveTimingRouted('seg-1', -0.005, 5.005, 'layer-sub');
    });

    expect(mockUpdateSegment).toHaveBeenCalledWith('seg-1', expect.objectContaining({
      startTime: 0,
      endTime: 5,
    }));
    expect(reloadSegments).toHaveBeenCalled();
    expect(setSaveState).toHaveBeenCalledWith({ kind: 'done', message: '已按父句段边界自动修正时间细分区间。' });
  });
});
