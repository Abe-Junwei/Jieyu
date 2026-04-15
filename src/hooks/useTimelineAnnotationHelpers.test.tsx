// @vitest-environment jsdom
import { fireEvent, render, screen, renderHook, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LayerDocType, LayerSegmentDocType, UtteranceDocType } from '../db';
import { useTimelineAnnotationHelpers } from './useTimelineAnnotationHelpers';

function makeSegmentDoc(
  id: string,
  layerId: string,
  startTime: number,
  endTime: number,
  utteranceId?: string,
): LayerSegmentDocType {
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
  };
}

function makeUtteranceDoc(id: string, startTime: number, endTime: number): UtteranceDocType {
  const now = new Date().toISOString();
  return {
    id,
    textId: 'text-1',
    mediaId: 'media-1',
    startTime,
    endTime,
    createdAt: now,
    updatedAt: now,
  };
}

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
      navigateUnitFromInput: vi.fn(),
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
      makeSegmentDoc('seg-2', 'layer-seg', 1, 2),
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
      navigateUnitFromInput: vi.fn(),
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
      makeSegmentDoc('seg-1', 'layer-dependent', 1, 2),
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
      navigateUnitFromInput: vi.fn(),
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
      makeUtteranceDoc('utt-1', 1, 2),
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

  it('renders self-certainty badge on segment row from host utterance', () => {
    const host: UtteranceDocType = {
      ...makeUtteranceDoc('utt-host', 1, 2),
      selfCertainty: 'certain',
    };
    const seg = makeSegmentDoc('seg-bound', 'layer-seg', 1, 2, 'utt-host');

    const { result } = renderHook(() => useTimelineAnnotationHelpers({
      manualSelectTsRef: { current: 0 },
      player: {
        isPlaying: false,
        stop: vi.fn(),
        seekTo: vi.fn(),
      },
      selectedTimelineUnit: null,
      selectUnitRange: vi.fn(),
      toggleUnitSelection: vi.fn(),
      selectTimelineUnit: vi.fn(),
      selectUnit: vi.fn(),
      selectSegment: vi.fn(),
      setSelectedLayerId: vi.fn(),
      onFocusLayerRow: vi.fn(),
      tierContainerRef: { current: null },
      zoomPxPerSec: 100,
      setCtxMenu: vi.fn(),
      navigateUnitFromInput: vi.fn(),
      waveformAreaRef: { current: null },
      dragPreview: null,
      selectedUnitIds: new Set(),
      focusedLayerRowId: 'layer-seg',
      zoomToUtterance: vi.fn(),
      startTimelineResizeDrag: vi.fn(),
      handleNoteClick: vi.fn(),
      resolveNoteIndicatorTarget: vi.fn(() => null),
      independentLayerIds: new Set(['layer-seg']),
      utterancesForSelfCertainty: [host],
    }));

    const { container } = render(result.current.renderAnnotationItem(
      seg,
      makeLayer('layer-seg'),
      'segment text',
      {
        onChange: vi.fn(),
        onBlur: vi.fn(),
      },
    ));

    expect(container.querySelector('.timeline-annotation-self-certainty--certain')).toBeTruthy();
  });

  it('renders self-certainty badge for independent segment rows when the segment id itself is the host utterance id', () => {
    const host: UtteranceDocType = {
      ...makeUtteranceDoc('seg-self-host', 1, 2),
      selfCertainty: 'uncertain',
    };
    const seg = makeSegmentDoc('seg-self-host', 'layer-seg', 1, 2);

    const { result } = renderHook(() => useTimelineAnnotationHelpers({
      manualSelectTsRef: { current: 0 },
      player: {
        isPlaying: false,
        stop: vi.fn(),
        seekTo: vi.fn(),
      },
      selectedTimelineUnit: null,
      selectUnitRange: vi.fn(),
      toggleUnitSelection: vi.fn(),
      selectTimelineUnit: vi.fn(),
      selectUnit: vi.fn(),
      selectSegment: vi.fn(),
      setSelectedLayerId: vi.fn(),
      onFocusLayerRow: vi.fn(),
      tierContainerRef: { current: null },
      zoomPxPerSec: 100,
      setCtxMenu: vi.fn(),
      navigateUnitFromInput: vi.fn(),
      waveformAreaRef: { current: null },
      dragPreview: null,
      selectedUnitIds: new Set(),
      focusedLayerRowId: 'layer-seg',
      zoomToUtterance: vi.fn(),
      startTimelineResizeDrag: vi.fn(),
      handleNoteClick: vi.fn(),
      resolveNoteIndicatorTarget: vi.fn(() => null),
      independentLayerIds: new Set(['layer-seg']),
      utterancesForSelfCertainty: [host],
    }));

    const { container } = render(result.current.renderAnnotationItem(
      seg,
      makeLayer('layer-seg'),
      'segment text',
      {
        onChange: vi.fn(),
        onBlur: vi.fn(),
      },
    ));

    expect(container.querySelector('.timeline-annotation-self-certainty--uncertain')).toBeTruthy();
  });
  it('renders self-certainty badge for a contained segment even without explicit parentUtteranceId', () => {
    const host: UtteranceDocType = {
      ...makeUtteranceDoc('utt-contained', 1, 2),
      selfCertainty: 'uncertain',
    };
    const seg = makeSegmentDoc('seg-loose', 'layer-seg', 1.2, 1.8);

    const { result } = renderHook(() => useTimelineAnnotationHelpers({
      manualSelectTsRef: { current: 0 },
      player: {
        isPlaying: false,
        stop: vi.fn(),
        seekTo: vi.fn(),
      },
      selectedTimelineUnit: null,
      selectUnitRange: vi.fn(),
      toggleUnitSelection: vi.fn(),
      selectTimelineUnit: vi.fn(),
      selectUnit: vi.fn(),
      selectSegment: vi.fn(),
      setSelectedLayerId: vi.fn(),
      onFocusLayerRow: vi.fn(),
      tierContainerRef: { current: null },
      zoomPxPerSec: 100,
      setCtxMenu: vi.fn(),
      navigateUnitFromInput: vi.fn(),
      waveformAreaRef: { current: null },
      dragPreview: null,
      selectedUnitIds: new Set(),
      focusedLayerRowId: 'layer-seg',
      zoomToUtterance: vi.fn(),
      startTimelineResizeDrag: vi.fn(),
      handleNoteClick: vi.fn(),
      resolveNoteIndicatorTarget: vi.fn(() => null),
      independentLayerIds: new Set(['layer-seg']),
      utterancesForSelfCertainty: [host],
    }));

    const { container } = render(result.current.renderAnnotationItem(
      seg,
      makeLayer('layer-seg'),
      'segment text',
      {
        onChange: vi.fn(),
        onBlur: vi.fn(),
      },
    ));

    expect(container.querySelector('.timeline-annotation-self-certainty--uncertain')).toBeTruthy();
  });

  it('renders self-certainty badge for timeline unit view segments via parentUtteranceId', () => {
    const host: UtteranceDocType = {
      ...makeUtteranceDoc('utt-timeline-parent', 1, 2),
      selfCertainty: 'certain',
    };
    const timelineViewLike = {
      id: 'seg-view-1',
      kind: 'segment' as const,
      mediaId: 'media-1',
      layerId: 'layer-seg',
      startTime: 8,
      endTime: 9,
      text: '',
      parentUtteranceId: 'utt-timeline-parent',
    };

    const { result } = renderHook(() => useTimelineAnnotationHelpers({
      manualSelectTsRef: { current: 0 },
      player: {
        isPlaying: false,
        stop: vi.fn(),
        seekTo: vi.fn(),
      },
      selectedTimelineUnit: null,
      selectUnitRange: vi.fn(),
      toggleUnitSelection: vi.fn(),
      selectTimelineUnit: vi.fn(),
      selectUnit: vi.fn(),
      selectSegment: vi.fn(),
      setSelectedLayerId: vi.fn(),
      onFocusLayerRow: vi.fn(),
      tierContainerRef: { current: null },
      zoomPxPerSec: 100,
      setCtxMenu: vi.fn(),
      navigateUnitFromInput: vi.fn(),
      waveformAreaRef: { current: null },
      dragPreview: null,
      selectedUnitIds: new Set(),
      focusedLayerRowId: 'layer-seg',
      zoomToUtterance: vi.fn(),
      startTimelineResizeDrag: vi.fn(),
      handleNoteClick: vi.fn(),
      resolveNoteIndicatorTarget: vi.fn(() => null),
      independentLayerIds: new Set(['layer-seg']),
      utterancesForSelfCertainty: [host],
    }));

    const { container } = render(result.current.renderAnnotationItem(
      timelineViewLike as unknown as LayerSegmentDocType,
      makeLayer('layer-seg'),
      'segment text',
      {
        onChange: vi.fn(),
        onBlur: vi.fn(),
      },
    ));

    expect(container.querySelector('.timeline-annotation-self-certainty--certain')).toBeTruthy();
  });

  it('omits the middle blank row when a lane has no variety or alias line', () => {
    const layer = {
      ...makeLayer('layer-label'),
      languageId: 'eng',
      orthographyId: 'eng-latn',
      name: { zho: '转写层' },
    } as LayerDocType;

    const { result } = renderHook(() => useTimelineAnnotationHelpers({
      manualSelectTsRef: { current: 0 },
      player: {
        isPlaying: false,
        stop: vi.fn(),
        seekTo: vi.fn(),
      },
      selectedTimelineUnit: null,
      selectUnitRange: vi.fn(),
      toggleUnitSelection: vi.fn(),
      selectTimelineUnit: vi.fn(),
      selectUnit: vi.fn(),
      selectSegment: vi.fn(),
      setSelectedLayerId: vi.fn(),
      onFocusLayerRow: vi.fn(),
      tierContainerRef: { current: null },
      zoomPxPerSec: 100,
      setCtxMenu: vi.fn(),
      navigateUnitFromInput: vi.fn(),
      waveformAreaRef: { current: null },
      dragPreview: null,
      selectedUnitIds: new Set(),
      focusedLayerRowId: 'layer-label',
      zoomToUtterance: vi.fn(),
      startTimelineResizeDrag: vi.fn(),
      handleNoteClick: vi.fn(),
      resolveNoteIndicatorTarget: vi.fn(() => null),
      independentLayerIds: new Set(['layer-label']),
      orthographies: [{
        id: 'eng-latn',
        languageId: 'eng',
        name: { 'zh-CN': '英语标准拼写' },
      } as any],
    }));

    const { container } = render(<div>{result.current.renderLaneLabel(layer)}</div>);

    expect(container.querySelectorAll('br')).toHaveLength(1);
    expect(container.textContent).toMatch(/(?:英语|English) eng/);
    expect(container.textContent).toContain('英语标准拼写');
  });

  it('renders the localized Tibetan name for legacy tib codes in lane headers', () => {
    const layer = {
      ...makeLayer('layer-tibetan'),
      languageId: 'tib',
      name: { zho: '藏语转写层' },
    } as LayerDocType;

    const { result } = renderHook(() => useTimelineAnnotationHelpers({
      manualSelectTsRef: { current: 0 },
      player: {
        isPlaying: false,
        stop: vi.fn(),
        seekTo: vi.fn(),
      },
      selectedTimelineUnit: null,
      selectUnitRange: vi.fn(),
      toggleUnitSelection: vi.fn(),
      selectTimelineUnit: vi.fn(),
      selectUnit: vi.fn(),
      selectSegment: vi.fn(),
      setSelectedLayerId: vi.fn(),
      onFocusLayerRow: vi.fn(),
      tierContainerRef: { current: null },
      zoomPxPerSec: 100,
      setCtxMenu: vi.fn(),
      navigateUnitFromInput: vi.fn(),
      waveformAreaRef: { current: null },
      dragPreview: null,
      selectedUnitIds: new Set(),
      focusedLayerRowId: 'layer-tibetan',
      zoomToUtterance: vi.fn(),
      startTimelineResizeDrag: vi.fn(),
      handleNoteClick: vi.fn(),
      resolveNoteIndicatorTarget: vi.fn(() => null),
      independentLayerIds: new Set(['layer-tibetan']),
      orthographies: [],
    }));

    const { container } = render(<div>{result.current.renderLaneLabel(layer)}</div>);

    expect(container.textContent).toContain('藏语');
    expect(container.textContent).not.toContain('tib藏语转写层');
  });
});