// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  LayerDocType,
  LayerSegmentDocType,
  MediaItemDocType,
  UtteranceDocType,
} from '../db';
import type { SaveState } from '../hooks/transcriptionTypes';
import { segmentToView, utteranceToView } from '../hooks/timelineUnitView';
import { LOCALE_PREFERENCE_STORAGE_KEY } from '../i18n';
import { useTranscriptionSegmentCreationController } from './useTranscriptionSegmentCreationController';

const { mockCreateSegment, mockCreateSegmentWithParentConstraint } = vi.hoisted(() => ({
  mockCreateSegment: vi.fn<(segment: LayerSegmentDocType) => Promise<void>>(async () => undefined),
  mockCreateSegmentWithParentConstraint: vi.fn<(
    segment: LayerSegmentDocType,
    parentId: string,
    parentStart: number,
    parentEnd: number,
  ) => Promise<void>>(async () => undefined),
}));

vi.mock('../services/LayerSegmentationV2Service', () => ({
  LayerSegmentationV2Service: {
    createSegment: (segment: LayerSegmentDocType) => mockCreateSegment(segment),
    createSegmentWithParentConstraint: (
      segment: LayerSegmentDocType,
      parentId: string,
      parentStart: number,
      parentEnd: number,
    ) => mockCreateSegmentWithParentConstraint(segment, parentId, parentStart, parentEnd),
  },
}));

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
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
  } as LayerDocType;
}

function makeSegment(id: string, layerId: string, startTime: number, endTime: number, speakerId?: string): LayerSegmentDocType {
  return {
    id,
    layerId,
    mediaId: 'media-1',
    textId: 'text-1',
    startTime,
    endTime,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    ...(speakerId ? { speakerId } : {}),
  } as LayerSegmentDocType;
}

function makeUtterance(id: string, startTime: number, endTime: number, speakerId?: string): UtteranceDocType {
  return {
    id,
    mediaId: 'media-1',
    textId: 'text-1',
    startTime,
    endTime,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    ...(speakerId ? { speakerId } : {}),
  } as UtteranceDocType;
}

function makeMedia(): MediaItemDocType {
  return {
    id: 'media-1',
    textId: 'text-1',
    filename: 'demo.wav',
    duration: 10,
    isOfflineCached: false,
    createdAt: '2026-04-01T00:00:00.000Z',
  } as MediaItemDocType;
}

type HookInput = Parameters<typeof useTranscriptionSegmentCreationController>[0];

function createUnitsOnCurrentMedia(
  segments: LayerSegmentDocType[],
  utterances: UtteranceDocType[],
  utteranceLayerId = 'layer-seg',
) {
  return [
    ...segments.map((segment) => segmentToView(segment, () => '')),
    ...utterances.map((utterance) => utteranceToView(utterance, utteranceLayerId)),
  ];
}

function createBaseInput(overrides: Partial<HookInput> = {}): HookInput {
  const defaultSegments = [
    makeSegment('seg-a', 'layer-seg', 0, 1),
    makeSegment('seg-b', 'layer-seg', 3, 4),
  ];
  const defaultUtterances = [makeUtterance('utt-1', 1.1, 2.5, 'spk-parent')];
  return {
    activeLayerIdForEdits: 'layer-seg',
    resolveSegmentRoutingForLayer: () => ({
      layer: makeLayer('layer-seg', 'independent_boundary'),
      segmentSourceLayer: makeLayer('layer-seg', 'independent_boundary'),
      sourceLayerId: 'layer-seg',
      editMode: 'independent-segment',
    }),
    selectedTimelineMedia: makeMedia(),
    unitsOnCurrentMedia: createUnitsOnCurrentMedia(defaultSegments, defaultUtterances),
    getUtteranceDocById: (id: string) => defaultUtterances.find((u) => u.id === id),
    findUtteranceDocContainingRange: (start: number, end: number) => defaultUtterances.find(
      (u) => u.startTime <= start + 0.01 && u.endTime >= end - 0.01,
    ),
    findOverlappingUtteranceDoc: (start: number, end: number) => defaultUtterances.find(
      (u) => u.startTime <= end - 0.01 && u.endTime >= start + 0.01,
    ),
    pushUndo: vi.fn(),
    reloadSegments: vi.fn(async () => undefined),
    refreshSegmentUndoSnapshot: vi.fn(async () => undefined),
    reloadSegmentContents: vi.fn(async () => undefined),
    selectTimelineUnit: vi.fn(),
    setSaveState: vi.fn() as unknown as (state: SaveState) => void,
    createNextUtterance: vi.fn(async () => undefined),
    createUtteranceFromSelection: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('useTranscriptionSegmentCreationController', () => {
  beforeEach(() => {
    window.localStorage.setItem(LOCALE_PREFERENCE_STORAGE_KEY, 'zh-CN');
    window.localStorage.removeItem('jieyu:new-segment-selection-behavior');
    mockCreateSegment.mockClear();
    mockCreateSegmentWithParentConstraint.mockClear();
  });

  afterEach(() => {
    window.localStorage.removeItem(LOCALE_PREFERENCE_STORAGE_KEY);
    window.localStorage.removeItem('jieyu:new-segment-selection-behavior');
  });

  it('creates independent segments with overlapping utterance linkage and inherits overlapping utterance speaker', async () => {
    const pushUndo = vi.fn();
    const selectTimelineUnit = vi.fn();
    const setSaveState = vi.fn() as unknown as (state: SaveState) => void;
    const { result } = renderHook(() => useTranscriptionSegmentCreationController(createBaseInput({
      pushUndo,
      selectTimelineUnit,
      setSaveState,
    })));

    await act(async () => {
      await result.current.createUtteranceFromSelectionRouted(1.2, 2.4);
    });

    expect(pushUndo).toHaveBeenCalledWith('从选区创建句段');
    expect(mockCreateSegment).toHaveBeenCalledWith(expect.objectContaining({
      layerId: 'layer-seg',
      startTime: 1.2,
      endTime: 2.4,
      utteranceId: 'utt-1',
      speakerId: 'spk-parent',
    }));
    expect(selectTimelineUnit).toHaveBeenCalledWith(expect.objectContaining({
      layerId: 'layer-seg',
      kind: 'segment',
    }));
    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'done',
      message: '已新建句段 00:01.2 - 00:02.4',
    }));
  });

  it('creates time-subdivision segments within parent bounds and inherits parent speaker', async () => {
    const pushUndo = vi.fn();
    const parentUtt = makeUtterance('utt-parent', 0.5, 2.5, 'spk-parent');
    const { result } = renderHook(() => useTranscriptionSegmentCreationController(createBaseInput({
      resolveSegmentRoutingForLayer: () => ({
        layer: makeLayer('layer-sub', 'time_subdivision'),
        segmentSourceLayer: makeLayer('layer-sub', 'time_subdivision'),
        sourceLayerId: 'layer-sub',
        editMode: 'time-subdivision',
      }),
      activeLayerIdForEdits: 'layer-sub',
      unitsOnCurrentMedia: createUnitsOnCurrentMedia([], [parentUtt], 'layer-sub'),
      getUtteranceDocById: (id: string) => (id === 'utt-parent' ? parentUtt : undefined),
      findUtteranceDocContainingRange: (start: number, end: number) => (
        parentUtt.startTime <= start + 0.01 && parentUtt.endTime >= end - 0.01 ? parentUtt : undefined
      ),
      findOverlappingUtteranceDoc: (start: number, end: number) => (
        parentUtt.startTime <= end - 0.01 && parentUtt.endTime >= start + 0.01 ? parentUtt : undefined
      ),
      pushUndo,
    })));

    await act(async () => {
      await result.current.createUtteranceFromSelectionRouted(0.6, 2.4);
    });

    expect(pushUndo).toHaveBeenCalledWith('从选区创建句段');
    expect(mockCreateSegmentWithParentConstraint).toHaveBeenCalledWith(
      expect.objectContaining({
        layerId: 'layer-sub',
        utteranceId: 'utt-parent',
        speakerId: 'spk-parent',
        startTime: 0.6,
        endTime: 2.4,
      }),
      'utt-parent',
      0.5,
      2.5,
    );
  });

  it('creates the next independent segment after a target segment', async () => {
    const pushUndo = vi.fn();
    const selectTimelineUnit = vi.fn();
    const setSaveState = vi.fn() as unknown as (state: SaveState) => void;
    const { result } = renderHook(() => useTranscriptionSegmentCreationController(createBaseInput({
      pushUndo,
      selectTimelineUnit,
      setSaveState,
    })));

    await act(async () => {
      await result.current.createNextSegmentRouted('seg-a');
    });

    expect(pushUndo).toHaveBeenCalledWith('创建句段');
    expect(mockCreateSegment).toHaveBeenCalledWith(expect.objectContaining({
      layerId: 'layer-seg',
      startTime: 1.02,
      endTime: 2.98,
    }));
    expect(selectTimelineUnit).toHaveBeenCalledWith(expect.objectContaining({
      layerId: 'layer-seg',
      kind: 'segment',
    }));
    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'done',
      message: '已创建新区间 00:01.0 - 00:03.0',
    }));
  });

  it('keeps current selection when segment selection preference is keep-current', async () => {
    window.localStorage.setItem('jieyu:new-segment-selection-behavior', 'keep-current');

    const selectTimelineUnit = vi.fn();
    const { result } = renderHook(() => useTranscriptionSegmentCreationController(createBaseInput({
      selectTimelineUnit,
    })));

    await act(async () => {
      await result.current.createUtteranceFromSelectionRouted(1.2, 2.4);
    });

    expect(selectTimelineUnit).not.toHaveBeenCalled();
  });

  it('reports an error when time-subdivision selection has no parent utterance', async () => {
    const pushUndo = vi.fn();
    const setSaveState = vi.fn() as unknown as (state: SaveState) => void;
    const parentUtt = makeUtterance('utt-parent', 0.5, 2.5, 'spk-parent');
    const { result } = renderHook(() => useTranscriptionSegmentCreationController(createBaseInput({
      resolveSegmentRoutingForLayer: () => ({
        layer: makeLayer('layer-sub', 'time_subdivision'),
        segmentSourceLayer: makeLayer('layer-sub', 'time_subdivision'),
        sourceLayerId: 'layer-sub',
        editMode: 'time-subdivision',
      }),
      activeLayerIdForEdits: 'layer-sub',
      unitsOnCurrentMedia: createUnitsOnCurrentMedia([], [parentUtt], 'layer-sub'),
      getUtteranceDocById: (id: string) => (id === 'utt-parent' ? parentUtt : undefined),
      findUtteranceDocContainingRange: (start: number, end: number) => (
        parentUtt.startTime <= start + 0.01 && parentUtt.endTime >= end - 0.01 ? parentUtt : undefined
      ),
      findOverlappingUtteranceDoc: (start: number, end: number) => (
        parentUtt.startTime <= end - 0.01 && parentUtt.endTime >= start + 0.01 ? parentUtt : undefined
      ),
      pushUndo,
      setSaveState,
    })));

    await act(async () => {
      await result.current.createUtteranceFromSelectionRouted(2.8, 3.2);
    });

    expect(mockCreateSegmentWithParentConstraint).not.toHaveBeenCalled();
    expect(pushUndo).not.toHaveBeenCalled();
    expect(setSaveState).toHaveBeenCalledWith({
      kind: 'error',
      message: '所选区间未落在任何句段范围内，无法在时间细分层创建。',
    });
  });

  it('falls back to utterance creation when current layer does not use segments', async () => {
    const createUtteranceFromSelection = vi.fn(async () => undefined);
    const createNextUtterance = vi.fn(async () => undefined);
    const { result } = renderHook(() => useTranscriptionSegmentCreationController(createBaseInput({
      resolveSegmentRoutingForLayer: () => ({
        layer: makeLayer('layer-main'),
        segmentSourceLayer: undefined,
        sourceLayerId: '',
        editMode: 'utterance',
      }),
      getUtteranceDocById: (id: string) => (id === 'utt-1' ? makeUtterance('utt-1', 1, 2, 'spk-focus') : undefined),
      createNextUtterance,
      createUtteranceFromSelection,
    })));

    await act(async () => {
      await result.current.createUtteranceFromSelectionRouted(4, 5);
    });

    expect(createUtteranceFromSelection).toHaveBeenCalledWith(4, 5, {
      focusedLayerId: 'layer-seg',
      selectionBehavior: 'select-created',
    });

    await act(async () => {
      await result.current.createNextSegmentRouted('utt-1');
    });

    expect(createNextUtterance).toHaveBeenCalledWith(expect.objectContaining({ id: 'utt-1' }), 10);
  });

  it('passes keep-current selection behavior to utterance creation when preference is enabled', async () => {
    window.localStorage.setItem('jieyu:new-segment-selection-behavior', 'keep-current');

    const createUtteranceFromSelection = vi.fn(async () => undefined);
    const { result } = renderHook(() => useTranscriptionSegmentCreationController(createBaseInput({
      resolveSegmentRoutingForLayer: () => ({
        layer: makeLayer('layer-main'),
        segmentSourceLayer: undefined,
        sourceLayerId: '',
        editMode: 'utterance',
      }),
      createUtteranceFromSelection,
    })));

    await act(async () => {
      await result.current.createUtteranceFromSelectionRouted(4, 5);
    });

    expect(createUtteranceFromSelection).toHaveBeenCalledWith(4, 5, expect.objectContaining({
      selectionBehavior: 'keep-current',
    }));
  });
});