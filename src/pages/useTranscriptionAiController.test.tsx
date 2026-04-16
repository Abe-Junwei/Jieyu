// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayerDocType, LayerSegmentDocType, UtteranceDocType } from '../db';
import { buildTimelineUnitViewIndex } from '../hooks/timelineUnitView';
import { useTranscriptionAiController } from './useTranscriptionAiController';

const {
  mockUseAiChat,
  mockUseAiPanelLogic,
  mockUseAiToolCallHandler,
  mockBridgeTextForLayerTarget,
  mockResolveFallbackSourceOrthographyId,
  mockListRecentAiToolDecisionLogs,
} = vi.hoisted(() => ({
  mockUseAiChat: vi.fn(),
  mockUseAiPanelLogic: vi.fn(),
  mockUseAiToolCallHandler: vi.fn(),
  mockBridgeTextForLayerTarget: vi.fn(async ({ text }: { text: string }) => text),
  mockResolveFallbackSourceOrthographyId: vi.fn(({ layers, selectedLayerId }: { layers: Array<{ layerType: string; orthographyId?: string }>; selectedLayerId?: string | null }) => {
    const normalizedSelectedLayerId = selectedLayerId?.trim();
    if (normalizedSelectedLayerId) return undefined;
    return layers.find((layer) => layer.layerType === 'transcription')?.orthographyId?.trim();
  }),
  mockListRecentAiToolDecisionLogs: vi.fn(async () => []),
}));

vi.mock('../hooks/useAiChat', () => ({
  useAiChat: mockUseAiChat,
}));

vi.mock('../hooks/useAiPanelLogic', () => ({
  useAiPanelLogic: mockUseAiPanelLogic,
  taskToPersona: vi.fn(() => 'transcription'),
}));

vi.mock('../hooks/useAiToolCallHandler', () => ({
  useAiToolCallHandler: mockUseAiToolCallHandler,
}));

vi.mock('../utils/orthographyRuntime', () => ({
  resolveFallbackSourceOrthographyId: mockResolveFallbackSourceOrthographyId,
  bridgeTextForLayerTarget: mockBridgeTextForLayerTarget,
}));

vi.mock('../ai/auditReplay', () => ({
  listRecentAiToolDecisionLogs: mockListRecentAiToolDecisionLogs,
}));

vi.mock('../ai/embeddings/DeferredEmbeddingSearchService', () => ({
  createDeferredEmbeddingSearchService: vi.fn(() => ({ search: vi.fn() })),
}));

vi.mock('./TranscriptionPage.helpers', () => ({
  loadEmbeddingProviderConfig: vi.fn(() => ({ kind: 'openai' })),
}));

function makeLayer(overrides: Partial<LayerDocType> & Pick<LayerDocType, 'id' | 'key' | 'layerType' | 'languageId'>): LayerDocType {
  const { id, key, layerType, languageId, ...restOverrides } = overrides;
  return {
    id,
    textId: 'text-1',
    key,
    name: overrides.name ?? { zho: key, eng: key },
    layerType,
    languageId,
    modality: 'text',
    acceptsAudio: false,
    createdAt: '2026-03-31T00:00:00.000Z',
    updatedAt: '2026-03-31T00:00:00.000Z',
    ...restOverrides,
  } as LayerDocType;
}

function makeUtterance(): UtteranceDocType {
  return {
    id: 'utt-1',
    textId: 'text-1',
    mediaId: 'media-1',
    startTime: 0,
    endTime: 1,
    createdAt: '2026-03-31T00:00:00.000Z',
    updatedAt: '2026-03-31T00:00:00.000Z',
  } as UtteranceDocType;
}

function makeUtteranceWithId(id: string, mediaId: string): UtteranceDocType {
  return {
    id,
    textId: 'text-1',
    mediaId,
    startTime: id === 'utt-1' ? 0 : 10,
    endTime: id === 'utt-1' ? 1 : 11,
    createdAt: '2026-03-31T00:00:00.000Z',
    updatedAt: '2026-03-31T00:00:00.000Z',
  } as UtteranceDocType;
}

function makeSegment(id: string, layerId: string, startTime: number, endTime: number): LayerSegmentDocType {
  return {
    id,
    textId: 'text-1',
    mediaId: 'media-1',
    layerId,
    startTime,
    endTime,
    createdAt: '2026-03-31T00:00:00.000Z',
    updatedAt: '2026-03-31T00:00:00.000Z',
  } as LayerSegmentDocType;
}

function makeTimelineUnitViewIndex(input: {
  utterances: UtteranceDocType[];
  utterancesOnCurrentMedia: UtteranceDocType[];
  segmentsByLayer?: ReadonlyMap<string, LayerSegmentDocType[]>;
  segmentContentByLayer?: ReadonlyMap<string, ReadonlyMap<string, { text?: string }>>;
  currentMediaId?: string;
}) {
  return buildTimelineUnitViewIndex({
    utterances: input.utterances,
    utterancesOnCurrentMedia: input.utterancesOnCurrentMedia,
    segmentsByLayer: input.segmentsByLayer,
    segmentContentByLayer: input.segmentContentByLayer,
    currentMediaId: input.currentMediaId,
    activeLayerIdForEdits: undefined,
    defaultTranscriptionLayerId: undefined,
    segmentsLoadComplete: true,
  });
}

function renderIndependentSegmentTimelineController(overrides?: {
  selectedSegmentId?: string;
  selectedSegmentText?: string;
  mergeWithPrevious?: (id: string) => Promise<void>;
  mergeWithNext?: (id: string) => Promise<void>;
}) {
  const handler = vi.fn(async () => ({ ok: true, message: 'ok' }));
  mockUseAiToolCallHandler.mockImplementation(() => handler);
  const utterances = [makeUtteranceWithId('utt-1', 'media-1')];
  const utterancesOnCurrentMedia = [makeUtteranceWithId('utt-1', 'media-1')];
  const segmentsByLayer = new Map([
    ['layer-independent', [
      makeSegment('seg-1', 'layer-independent', 0, 1),
      makeSegment('seg-2', 'layer-independent', 2, 3),
      makeSegment('seg-3', 'layer-independent', 4, 5),
    ]],
  ]);
  const segmentContentByLayer = new Map([
    ['layer-independent', new Map([
      ['seg-1', { text: '第一段' }],
      ['seg-2', { text: overrides?.selectedSegmentText ?? '第二段' }],
      ['seg-3', { text: '第三段' }],
    ])],
  ]);

  const selectedSegmentId = overrides?.selectedSegmentId ?? 'seg-2';
  const timelineUnitViewIndex = makeTimelineUnitViewIndex({
    utterances,
    utterancesOnCurrentMedia,
    segmentsByLayer,
    segmentContentByLayer,
    currentMediaId: 'media-1',
  });

  renderHook(() => useTranscriptionAiController({
    selectedUnitIds: new Set([selectedSegmentId]),
    selectedUnit: null,
    getUtteranceDocById: (id) => utterances.find((item) => item.id === id),
    selectedTimelineSegment: makeSegment(selectedSegmentId, 'layer-independent', 2, 3),
    selectedLayerId: 'layer-independent',
    activeLayerIdForEdits: 'layer-independent',
    resolveSegmentRoutingForLayer: () => ({
      layer: undefined,
      segmentSourceLayer: undefined,
      sourceLayerId: 'layer-independent',
      editMode: 'independent-segment',
    }),
    segmentsByLayer,
    segmentContentByLayer,
    selectionSnapshot: {
      timelineUnit: { layerId: 'layer-independent', unitId: selectedSegmentId, kind: 'segment' },
      selectedUnitKind: 'segment',
      activeUnitId: null,
      selectedUnit: timelineUnitViewIndex.byId.get(selectedSegmentId) ?? null,
      selectedRowMeta: null,
      selectedLayerId: 'layer-independent',
      selectedText: overrides?.selectedSegmentText ?? '第二段',
    },
    layers: [],
    transcriptionLayers: [],
    translationLayers: [],
    layerLinks: [],
    getUtteranceTextForLayer: () => '',
    formatTime: (seconds) => `${seconds}`,
    timelineUnitViewIndex,
    translationLayerCount: 0,
    aiConfidenceAvg: null,
    recentTimelineEditEvents: [],
    createLayerWithActiveContext: vi.fn(async () => true),
    createTranscriptionSegment: vi.fn(async () => undefined),
    splitTranscriptionSegment: vi.fn(async () => undefined),
    ...(overrides?.mergeWithPrevious ? { mergeWithPrevious: overrides.mergeWithPrevious } : {}),
    ...(overrides?.mergeWithNext ? { mergeWithNext: overrides.mergeWithNext } : {}),
    mergeSelectedUnits: vi.fn(async () => undefined),
    deleteUtterance: vi.fn(async () => undefined),
    deleteSelectedUnits: vi.fn(async () => undefined),
    deleteLayer: vi.fn(async () => undefined),
    toggleLayerLink: vi.fn(async () => undefined),
    saveUtteranceText: vi.fn(async () => undefined),
    saveTextTranslationForUtterance: vi.fn(async () => undefined),
    saveSegmentContentForLayer: vi.fn(async () => undefined),
    updateTokenPos: vi.fn(),
    batchUpdateTokenPosByForm: vi.fn(async () => 0),
    updateTokenGloss: vi.fn(),
    selectUnit: vi.fn(),
    setSaveState: vi.fn(),
    translationDrafts: {},
    translationTextByLayer: new Map(),
    locale: 'zh-CN',
    playerCurrentTime: 0,
    executeActionRef: { current: undefined },
    openSearchRef: { current: undefined },
    seekToTimeRef: { current: undefined },
    splitAtTimeRef: { current: undefined },
    zoomToSegmentRef: { current: undefined },
    handleExecuteRecommendation: vi.fn(),
  }));

  const latestAiChatCall = mockUseAiChat.mock.calls[mockUseAiChat.mock.calls.length - 1];
  return {
    handler,
    aiChatOptions: latestAiChatCall?.[0],
  };
}

describe('useTranscriptionAiController', () => {
  beforeEach(() => {
    mockUseAiToolCallHandler.mockImplementation(() => vi.fn());
    mockUseAiChat.mockImplementation(() => ({
      connectionTestStatus: 'idle',
      pendingToolCall: null,
    }));
    mockUseAiPanelLogic.mockImplementation(() => ({
      lexemeMatches: [],
      observerResult: { stage: 'idle' },
      actionableObserverRecommendations: [],
      selectedAiWarning: false,
      selectedTranslationGapCount: 0,
      aiCurrentTask: 'transcription',
      aiVisibleCards: [],
      handleJumpToTranslationGap: vi.fn(),
    }));
  });

  afterEach(() => {
    mockUseAiChat.mockClear();
    mockUseAiPanelLogic.mockClear();
    mockUseAiToolCallHandler.mockClear();
    mockBridgeTextForLayerTarget.mockClear();
    mockListRecentAiToolDecisionLogs.mockClear();
  });

  it('passes fallback source orthography when AI writes into a translation layer without selected source layer', async () => {
    const transcriptionLayer = makeLayer({
      id: 'trc-source',
      key: 'trc-source',
      layerType: 'transcription',
      languageId: 'zho',
      orthographyId: 'orth-source',
    });
    const translationLayer = makeLayer({
      id: 'trl-target',
      key: 'trl-target',
      layerType: 'translation',
      languageId: 'eng',
      orthographyId: 'orth-target',
    });
    const utterance = makeUtterance();
    const timelineUnitViewIndex = makeTimelineUnitViewIndex({
      utterances: [utterance],
      utterancesOnCurrentMedia: [utterance],
      currentMediaId: 'media-1',
    });

    renderHook(() => useTranscriptionAiController({
      selectedUnitIds: new Set([utterance.id]),
      selectedUnit: utterance,
      getUtteranceDocById: (id) => (id === utterance.id ? utterance : undefined),
      selectedLayerId: '',
      selectionSnapshot: {
        timelineUnit: null,
        selectedUnitKind: null,
        activeUnitId: utterance.id,
        selectedUnit: timelineUnitViewIndex.byId.get(utterance.id) ?? null,
        selectedRowMeta: null,
        selectedLayerId: null,
        selectedText: '',
      },
      layers: [transcriptionLayer, translationLayer],
      transcriptionLayers: [transcriptionLayer],
      translationLayers: [translationLayer],
      layerLinks: [],
      getUtteranceTextForLayer: () => '',
      formatTime: (seconds) => `${seconds}`,
      timelineUnitViewIndex,
      translationLayerCount: 1,
      aiConfidenceAvg: null,
      recentTimelineEditEvents: [],
      createLayerWithActiveContext: vi.fn(async () => true),
      createTranscriptionSegment: vi.fn(async () => undefined),
      splitTranscriptionSegment: vi.fn(async () => undefined),
      mergeSelectedUnits: vi.fn(async () => undefined),
      deleteUtterance: vi.fn(async () => undefined),
      deleteSelectedUnits: vi.fn(async () => undefined),
      deleteLayer: vi.fn(async () => undefined),
      toggleLayerLink: vi.fn(async () => undefined),
      saveUtteranceText: vi.fn(async () => undefined),
      saveTextTranslationForUtterance: vi.fn(async () => undefined),
      saveSegmentContentForLayer: vi.fn(async () => undefined),
      updateTokenPos: vi.fn(),
      batchUpdateTokenPosByForm: vi.fn(async () => 0),
      updateTokenGloss: vi.fn(),
      selectUnit: vi.fn(),
      setSaveState: vi.fn(),
      translationDrafts: {},
      translationTextByLayer: new Map(),
      locale: 'zh-CN',
      playerCurrentTime: 0,
      executeActionRef: { current: undefined },
      openSearchRef: { current: undefined },
      seekToTimeRef: { current: undefined },
      splitAtTimeRef: { current: undefined },
      zoomToSegmentRef: { current: undefined },
      handleExecuteRecommendation: vi.fn(),
    }));

    const toolHandlerInput = mockUseAiToolCallHandler.mock.calls[0]?.[0];
    expect(toolHandlerInput).toBeTruthy();

    await toolHandlerInput.bridgeTextForLayerWrite({
      text: 'hello',
      targetLayerId: 'trl-target',
      selectedLayerId: '',
    });

    expect(mockBridgeTextForLayerTarget).toHaveBeenCalledWith({
      text: 'hello',
      layers: [transcriptionLayer, translationLayer],
      targetLayerId: 'trl-target',
      selectedLayerId: '',
      fallbackSourceOrthographyId: 'orth-source',
    });
  });

  it('scopes delete-all preview and snapshot to utterances on current media', () => {
    const currentMediaUtterance = makeUtteranceWithId('utt-1', 'media-1');
    const otherMediaUtterance = makeUtteranceWithId('utt-2', 'media-2');
    const timelineUnitViewIndex = makeTimelineUnitViewIndex({
      utterances: [currentMediaUtterance, otherMediaUtterance],
      utterancesOnCurrentMedia: [currentMediaUtterance],
      currentMediaId: 'media-1',
    });

    renderHook(() => useTranscriptionAiController({
      selectedUnitIds: new Set([currentMediaUtterance.id]),
      selectedUnit: currentMediaUtterance,
      getUtteranceDocById: (id) => ([currentMediaUtterance, otherMediaUtterance].find((item) => item.id === id)),
      selectedLayerId: '',
      selectionSnapshot: {
        timelineUnit: null,
        selectedUnitKind: null,
        activeUnitId: currentMediaUtterance.id,
        selectedUnit: timelineUnitViewIndex.byId.get(currentMediaUtterance.id) ?? null,
        selectedRowMeta: null,
        selectedLayerId: null,
        selectedText: '',
      },
      layers: [],
      transcriptionLayers: [],
      translationLayers: [],
      layerLinks: [],
      getUtteranceTextForLayer: (utterance) => utterance.id === 'utt-1' ? '当前页句段' : '其他页句段',
      formatTime: (seconds) => `${seconds}`,
      timelineUnitViewIndex: makeTimelineUnitViewIndex({
        utterances: [currentMediaUtterance, otherMediaUtterance],
        utterancesOnCurrentMedia: [currentMediaUtterance],
        currentMediaId: 'media-1',
      }),
      translationLayerCount: 1,
      aiConfidenceAvg: null,
      recentTimelineEditEvents: [],
      createLayerWithActiveContext: vi.fn(async () => true),
      createTranscriptionSegment: vi.fn(async () => undefined),
      splitTranscriptionSegment: vi.fn(async () => undefined),
      mergeSelectedUnits: vi.fn(async () => undefined),
      deleteUtterance: vi.fn(async () => undefined),
      deleteSelectedUnits: vi.fn(async () => undefined),
      deleteLayer: vi.fn(async () => undefined),
      toggleLayerLink: vi.fn(async () => undefined),
      saveUtteranceText: vi.fn(async () => undefined),
      saveTextTranslationForUtterance: vi.fn(async () => undefined),
      saveSegmentContentForLayer: vi.fn(async () => undefined),
      updateTokenPos: vi.fn(),
      batchUpdateTokenPosByForm: vi.fn(async () => 0),
      updateTokenGloss: vi.fn(),
      selectUnit: vi.fn(),
      setSaveState: vi.fn(),
      translationDrafts: {},
      translationTextByLayer: new Map([
        ['layer-1', new Map([
          ['utt-1', { text: '保留当前页翻译' }],
          ['utt-2', { text: '不应计入预演' }],
        ])],
      ]),
      locale: 'zh-CN',
      playerCurrentTime: 0,
      executeActionRef: { current: undefined },
      openSearchRef: { current: undefined },
      seekToTimeRef: { current: undefined },
      splitAtTimeRef: { current: undefined },
      zoomToSegmentRef: { current: undefined },
      handleExecuteRecommendation: vi.fn(),
    }));

    const latestToolCallHandlerCall = mockUseAiToolCallHandler.mock.calls[mockUseAiToolCallHandler.mock.calls.length - 1];
    const toolHandlerInput = latestToolCallHandlerCall?.[0];
    expect(toolHandlerInput?.utterances?.map((utterance: UtteranceDocType) => utterance.id)).toEqual([currentMediaUtterance.id]);
    expect(toolHandlerInput?.getSegments().map((utterance: UtteranceDocType) => utterance.id)).toEqual([currentMediaUtterance.id]);

    const latestAiChatCall = mockUseAiChat.mock.calls[mockUseAiChat.mock.calls.length - 1];
    const aiChatOptions = latestAiChatCall?.[0];
    expect(aiChatOptions).toBeTruthy();

    const preparedCall = aiChatOptions.preparePendingToolCall({
      name: 'delete_transcription_segment',
      arguments: { allSegments: true },
    });
    expect(preparedCall.arguments.segmentIds).toEqual(['utt-1']);

    const riskCheck = aiChatOptions.onToolRiskCheck({
      name: 'delete_transcription_segment',
      arguments: { allSegments: true },
    });
    expect(riskCheck?.riskSummary).toContain('将删除第 1 条句段');
    expect(riskCheck?.impactPreview?.[1]).toContain('1 个翻译层包含内容');
  });

  it('still scopes AI segment resolution to current media when there is no selected segment', () => {
    const currentMediaUtterance = makeUtteranceWithId('utt-1', 'media-1');
    const otherMediaUtterance = makeUtteranceWithId('utt-2', 'media-2');
    const timelineUnitViewIndex = makeTimelineUnitViewIndex({
      utterances: [currentMediaUtterance, otherMediaUtterance],
      utterancesOnCurrentMedia: [currentMediaUtterance],
      currentMediaId: 'media-1',
    });

    renderHook(() => useTranscriptionAiController({
      selectedUnitIds: new Set(),
      selectedUnit: null,
      getUtteranceDocById: (id) => ([currentMediaUtterance, otherMediaUtterance].find((item) => item.id === id)),
      selectedLayerId: '',
      selectionSnapshot: {
        timelineUnit: null,
        selectedUnitKind: null,
        activeUnitId: null,
        selectedUnit: null,
        selectedRowMeta: null,
        selectedLayerId: null,
        selectedText: '',
      },
      layers: [],
      transcriptionLayers: [],
      translationLayers: [],
      layerLinks: [],
      getUtteranceTextForLayer: (utterance) => utterance.id === 'utt-1' ? '当前页句段' : '其他页句段',
      formatTime: (seconds) => `${seconds}`,
      timelineUnitViewIndex,
      translationLayerCount: 1,
      aiConfidenceAvg: null,
      recentTimelineEditEvents: [],
      createLayerWithActiveContext: vi.fn(async () => true),
      createTranscriptionSegment: vi.fn(async () => undefined),
      splitTranscriptionSegment: vi.fn(async () => undefined),
      mergeSelectedUnits: vi.fn(async () => undefined),
      deleteUtterance: vi.fn(async () => undefined),
      deleteSelectedUnits: vi.fn(async () => undefined),
      deleteLayer: vi.fn(async () => undefined),
      toggleLayerLink: vi.fn(async () => undefined),
      saveUtteranceText: vi.fn(async () => undefined),
      saveTextTranslationForUtterance: vi.fn(async () => undefined),
      saveSegmentContentForLayer: vi.fn(async () => undefined),
      updateTokenPos: vi.fn(),
      batchUpdateTokenPosByForm: vi.fn(async () => 0),
      updateTokenGloss: vi.fn(),
      selectUnit: vi.fn(),
      setSaveState: vi.fn(),
      translationDrafts: {},
      translationTextByLayer: new Map(),
      locale: 'zh-CN',
      playerCurrentTime: 0,
      executeActionRef: { current: undefined },
      openSearchRef: { current: undefined },
      seekToTimeRef: { current: undefined },
      splitAtTimeRef: { current: undefined },
      zoomToSegmentRef: { current: undefined },
      handleExecuteRecommendation: vi.fn(),
    }));

    const latestToolCallHandlerCall = mockUseAiToolCallHandler.mock.calls[mockUseAiToolCallHandler.mock.calls.length - 1];
    const toolHandlerInput = latestToolCallHandlerCall?.[0];
    expect(toolHandlerInput?.utterances?.map((utterance: UtteranceDocType) => utterance.id)).toEqual([currentMediaUtterance.id]);
    expect(toolHandlerInput?.selectedUnit).toBeUndefined();

    const latestAiChatCall = mockUseAiChat.mock.calls[mockUseAiChat.mock.calls.length - 1];
    const aiChatOptions = latestAiChatCall?.[0];
    expect(aiChatOptions).toBeTruthy();

    const preparedCall = aiChatOptions.preparePendingToolCall({
      name: 'delete_transcription_segment',
      arguments: { segmentIndex: 1 },
    });
    expect(preparedCall.arguments.segmentId).toBe('utt-1');
    expect(preparedCall.arguments.segmentIndex).toBeUndefined();

    const riskCheck = aiChatOptions.onToolRiskCheck({
      name: 'delete_transcription_segment',
      arguments: { segmentIndex: 1 },
    });
    expect(riskCheck?.riskSummary).toContain('第 1 条句段');
  });

  it('resolves selected owner utterance for AI from selected timeline segment when snapshot selectedUnit is missing', () => {
    const utterance = makeUtteranceWithId('utt-1', 'media-1');
    const selectedTimelineSegment = makeSegment('seg-1', 'layer-independent', 0.2, 0.8);
    const timelineUnitViewIndex = makeTimelineUnitViewIndex({
      utterances: [utterance],
      utterancesOnCurrentMedia: [utterance],
      currentMediaId: 'media-1',
    });

    renderHook(() => useTranscriptionAiController({
      selectedUnitIds: new Set([selectedTimelineSegment.id]),
      selectedUnit: null,
      getUtteranceDocById: (id) => (id === utterance.id ? utterance : undefined),
      selectedTimelineSegment,
      selectedLayerId: 'layer-independent',
      selectionSnapshot: {
        timelineUnit: { layerId: 'layer-independent', unitId: selectedTimelineSegment.id, kind: 'segment' },
        selectedUnitKind: 'segment',
        activeUnitId: null,
        selectedUnit: null,
        selectedRowMeta: null,
        selectedLayerId: 'layer-independent',
        selectedText: '',
      },
      layers: [],
      transcriptionLayers: [],
      translationLayers: [],
      layerLinks: [],
      getUtteranceTextForLayer: () => '',
      formatTime: (seconds) => `${seconds}`,
      timelineUnitViewIndex,
      translationLayerCount: 0,
      aiConfidenceAvg: null,
      recentTimelineEditEvents: [],
      createLayerWithActiveContext: vi.fn(async () => true),
      createTranscriptionSegment: vi.fn(async () => undefined),
      splitTranscriptionSegment: vi.fn(async () => undefined),
      mergeSelectedUnits: vi.fn(async () => undefined),
      deleteUtterance: vi.fn(async () => undefined),
      deleteSelectedUnits: vi.fn(async () => undefined),
      deleteLayer: vi.fn(async () => undefined),
      toggleLayerLink: vi.fn(async () => undefined),
      saveUtteranceText: vi.fn(async () => undefined),
      saveTextTranslationForUtterance: vi.fn(async () => undefined),
      saveSegmentContentForLayer: vi.fn(async () => undefined),
      updateTokenPos: vi.fn(),
      batchUpdateTokenPosByForm: vi.fn(async () => 0),
      updateTokenGloss: vi.fn(),
      selectUnit: vi.fn(),
      setSaveState: vi.fn(),
      translationDrafts: {},
      translationTextByLayer: new Map(),
      locale: 'zh-CN',
      playerCurrentTime: 0,
      executeActionRef: { current: undefined },
      openSearchRef: { current: undefined },
      seekToTimeRef: { current: undefined },
      splitAtTimeRef: { current: undefined },
      zoomToSegmentRef: { current: undefined },
      handleExecuteRecommendation: vi.fn(),
    }));

    const latestToolCallHandlerCall = mockUseAiToolCallHandler.mock.calls[mockUseAiToolCallHandler.mock.calls.length - 1];
    const toolHandlerInput = latestToolCallHandlerCall?.[0];
    expect(toolHandlerInput?.selectedUnit?.id).toBe(utterance.id);
  });

  it('recovers a previewable AI segment scope from the project when current-media utterances are temporarily empty', () => {
    const utterance1 = makeUtteranceWithId('utt-1', 'media-1');
    const utterance2 = {
      ...makeUtteranceWithId('utt-2', 'media-1'),
      startTime: 2,
      endTime: 3,
    } as UtteranceDocType;

    renderHook(() => useTranscriptionAiController({
      selectedUnitIds: new Set(),
      selectedUnit: null,
      getUtteranceDocById: (id) => ([utterance1, utterance2].find((item) => item.id === id)),
      selectedLayerId: '',
      selectionSnapshot: {
        timelineUnit: null,
        selectedUnitKind: null,
        activeUnitId: null,
        selectedUnit: null,
        selectedRowMeta: null,
        selectedLayerId: null,
        selectedText: '',
      },
      layers: [],
      transcriptionLayers: [],
      translationLayers: [],
      layerLinks: [],
      getUtteranceTextForLayer: (utterance) => utterance.id,
      formatTime: (seconds) => `${seconds}`,
      timelineUnitViewIndex: makeTimelineUnitViewIndex({
        utterances: [utterance1, utterance2],
        utterancesOnCurrentMedia: [],
        currentMediaId: 'media-1',
      }),
      translationLayerCount: 0,
      aiConfidenceAvg: null,
      recentTimelineEditEvents: [],
      createLayerWithActiveContext: vi.fn(async () => true),
      createTranscriptionSegment: vi.fn(async () => undefined),
      splitTranscriptionSegment: vi.fn(async () => undefined),
      mergeSelectedUnits: vi.fn(async () => undefined),
      deleteUtterance: vi.fn(async () => undefined),
      deleteSelectedUnits: vi.fn(async () => undefined),
      deleteLayer: vi.fn(async () => undefined),
      toggleLayerLink: vi.fn(async () => undefined),
      saveUtteranceText: vi.fn(async () => undefined),
      saveTextTranslationForUtterance: vi.fn(async () => undefined),
      saveSegmentContentForLayer: vi.fn(async () => undefined),
      updateTokenPos: vi.fn(),
      batchUpdateTokenPosByForm: vi.fn(async () => 0),
      updateTokenGloss: vi.fn(),
      selectUnit: vi.fn(),
      setSaveState: vi.fn(),
      translationDrafts: {},
      translationTextByLayer: new Map(),
      locale: 'zh-CN',
      playerCurrentTime: 0,
      executeActionRef: { current: undefined },
      openSearchRef: { current: undefined },
      seekToTimeRef: { current: undefined },
      splitAtTimeRef: { current: undefined },
      zoomToSegmentRef: { current: undefined },
      handleExecuteRecommendation: vi.fn(),
    }));

    const latestToolCallHandlerCall = mockUseAiToolCallHandler.mock.calls[mockUseAiToolCallHandler.mock.calls.length - 1];
    const toolHandlerInput = latestToolCallHandlerCall?.[0];
    expect(toolHandlerInput?.utterances?.map((utterance: UtteranceDocType) => utterance.id)).toEqual([utterance1.id, utterance2.id]);

    const latestAiChatCall = mockUseAiChat.mock.calls[mockUseAiChat.mock.calls.length - 1];
    const aiChatOptions = latestAiChatCall?.[0];
    expect(aiChatOptions).toBeTruthy();

    const preparedCall = aiChatOptions.preparePendingToolCall({
      name: 'delete_transcription_segment',
      arguments: { segmentIndex: 1 },
    });
    expect(preparedCall.arguments.segmentId).toBe('utt-1');

    const riskCheck = aiChatOptions.onToolRiskCheck({
      name: 'delete_transcription_segment',
      arguments: { segmentIndex: 1 },
    });
    expect(riskCheck?.requiresConfirmation).toBe(true);
    expect(riskCheck?.riskSummary).toContain('第 1 条句段');
  });

  it('publishes waveform analysis summary through AI chat context', () => {
    const overlapUtterance = {
      ...makeUtteranceWithId('utt-1', 'media-1'),
      endTime: 1.5,
    } as UtteranceDocType;
    const lowConfidenceUtterance = {
      ...makeUtteranceWithId('utt-2', 'media-1'),
      startTime: 1.2,
      endTime: 2.4,
      ai_metadata: { confidence: 0.61 },
    } as UtteranceDocType;
    const gapTargetUtterance = {
      ...makeUtteranceWithId('utt-3', 'media-1'),
      startTime: 3.5,
      endTime: 4.4,
    } as UtteranceDocType;

    const timelineUnitViewIndex = makeTimelineUnitViewIndex({
      utterances: [overlapUtterance, lowConfidenceUtterance, gapTargetUtterance],
      utterancesOnCurrentMedia: [overlapUtterance, lowConfidenceUtterance, gapTargetUtterance],
      currentMediaId: 'media-1',
    });

    renderHook(() => useTranscriptionAiController({
      selectedUnitIds: new Set(['utt-2']),
      selectedUnit: lowConfidenceUtterance,
      getUtteranceDocById: (id) => ([overlapUtterance, lowConfidenceUtterance, gapTargetUtterance].find((item) => item.id === id)),
      selectedLayerId: '',
      selectionSnapshot: {
        timelineUnit: null,
        selectedUnitKind: 'utterance',
        activeUnitId: lowConfidenceUtterance.id,
        selectedUnit: timelineUnitViewIndex.byId.get(lowConfidenceUtterance.id) ?? null,
        selectedRowMeta: null,
        selectedLayerId: null,
        selectedText: '低置信句段',
        selectedUnitStartSec: 1,
        selectedUnitEndSec: 2.5,
      },
      layers: [],
      transcriptionLayers: [],
      translationLayers: [],
      layerLinks: [],
      getUtteranceTextForLayer: (utterance) => utterance.id,
      formatTime: (seconds) => `${seconds}`,
      timelineUnitViewIndex,
      translationLayerCount: 0,
      aiConfidenceAvg: 0.8,
      recentTimelineEditEvents: [],
      createLayerWithActiveContext: vi.fn(async () => true),
      createTranscriptionSegment: vi.fn(async () => undefined),
      splitTranscriptionSegment: vi.fn(async () => undefined),
      mergeSelectedUnits: vi.fn(async () => undefined),
      deleteUtterance: vi.fn(async () => undefined),
      deleteSelectedUnits: vi.fn(async () => undefined),
      deleteLayer: vi.fn(async () => undefined),
      toggleLayerLink: vi.fn(async () => undefined),
      saveUtteranceText: vi.fn(async () => undefined),
      saveTextTranslationForUtterance: vi.fn(async () => undefined),
      saveSegmentContentForLayer: vi.fn(async () => undefined),
      updateTokenPos: vi.fn(),
      batchUpdateTokenPosByForm: vi.fn(async () => 0),
      updateTokenGloss: vi.fn(),
      selectUnit: vi.fn(),
      setSaveState: vi.fn(),
      translationDrafts: {},
      translationTextByLayer: new Map(),
      locale: 'zh-CN',
      playerCurrentTime: 1.3,
      executeActionRef: { current: undefined },
      openSearchRef: { current: undefined },
      seekToTimeRef: { current: undefined },
      splitAtTimeRef: { current: undefined },
      zoomToSegmentRef: { current: undefined },
      handleExecuteRecommendation: vi.fn(),
    }));

    const latestAiChatCall = mockUseAiChat.mock.calls[mockUseAiChat.mock.calls.length - 1];
    const aiChatOptions = latestAiChatCall?.[0];
    const context = aiChatOptions?.getContext?.();

    expect(context?.longTerm?.waveformAnalysis).toEqual(expect.objectContaining({
      lowConfidenceCount: 1,
      overlapCount: 1,
      gapCount: 1,
      selectionLowConfidenceCount: 1,
      selectionOverlapCount: 1,
      selectionGapCount: 1,
    }));
  });

  it('materializes and previews delete selectors against independent layer segments on the current timeline', async () => {
    const { handler, aiChatOptions } = renderIndependentSegmentTimelineController();
    expect(aiChatOptions).toBeTruthy();

    const preparedCall = aiChatOptions.preparePendingToolCall({
      name: 'delete_transcription_segment',
      arguments: { segmentIndex: 1 },
    });
    expect(preparedCall.arguments.segmentId).toBe('seg-1');
    expect(preparedCall.arguments.utteranceId).toBeUndefined();

    const riskCheck = aiChatOptions.onToolRiskCheck({
      name: 'delete_transcription_segment',
      arguments: { segmentIndex: 1 },
    });
    expect(riskCheck?.requiresConfirmation).toBe(true);
    expect(riskCheck?.impactPreview?.[0]).toContain('第一段');

    await aiChatOptions.onToolCall({
      name: 'delete_transcription_segment',
      arguments: { segmentIndex: 1 },
    });
    expect(handler).toHaveBeenCalledWith({
      name: 'delete_transcription_segment',
      arguments: { segmentId: 'seg-1' },
    });
  });

  it('materializes previous/next and delete-all selectors against independent layer segments on the current timeline', async () => {
    const { handler, aiChatOptions } = renderIndependentSegmentTimelineController();
    expect(aiChatOptions).toBeTruthy();

    const previousPrepared = aiChatOptions.preparePendingToolCall({
      name: 'delete_transcription_segment',
      arguments: { segmentPosition: 'previous' },
    });
    const nextPrepared = aiChatOptions.preparePendingToolCall({
      name: 'delete_transcription_segment',
      arguments: { segmentPosition: 'next' },
    });
    const allPrepared = aiChatOptions.preparePendingToolCall({
      name: 'delete_transcription_segment',
      arguments: { allSegments: true },
    });

    expect(previousPrepared.arguments.segmentId).toBe('seg-1');
    expect(nextPrepared.arguments.segmentId).toBe('seg-3');
    expect(allPrepared.arguments.segmentIds).toEqual(['seg-1', 'seg-2', 'seg-3']);

    const previousRisk = aiChatOptions.onToolRiskCheck({
      name: 'delete_transcription_segment',
      arguments: { segmentPosition: 'previous' },
    });
    const deleteAllRisk = aiChatOptions.onToolRiskCheck({
      name: 'delete_transcription_segment',
      arguments: { allSegments: true },
    });

    expect(previousRisk?.requiresConfirmation).toBe(true);
    expect(previousRisk?.impactPreview?.[0]).toContain('第一段');
    expect(deleteAllRisk?.requiresConfirmation).toBe(true);
    expect(deleteAllRisk?.riskSummary).toContain('将删除 3 条句段');

    await aiChatOptions.onToolCall({
      name: 'delete_transcription_segment',
      arguments: { segmentPosition: 'previous' },
    });
    await aiChatOptions.onToolCall({
      name: 'delete_transcription_segment',
      arguments: { segmentPosition: 'next' },
    });
    await aiChatOptions.onToolCall({
      name: 'delete_transcription_segment',
      arguments: { allSegments: true },
    });

    expect(handler).toHaveBeenNthCalledWith(1, {
      name: 'delete_transcription_segment',
      arguments: { segmentId: 'seg-1' },
    });
    expect(handler).toHaveBeenNthCalledWith(2, {
      name: 'delete_transcription_segment',
      arguments: { segmentId: 'seg-3' },
    });
    expect(handler).toHaveBeenNthCalledWith(3, {
      name: 'delete_transcription_segment',
      arguments: { segmentIds: ['seg-1', 'seg-2', 'seg-3'] },
    });
  });

  it('routes create and split calls against the current independent layer segment', async () => {
    const { handler, aiChatOptions } = renderIndependentSegmentTimelineController();
    expect(aiChatOptions).toBeTruthy();

    const preparedCreate = aiChatOptions.preparePendingToolCall({
      name: 'create_transcription_segment',
      arguments: {},
    });
    const preparedSplit = aiChatOptions.preparePendingToolCall({
      name: 'split_transcription_segment',
      arguments: { splitTime: 2.5 },
    });

    expect(preparedCreate.arguments.segmentId).toBe('seg-2');
    expect(preparedSplit.arguments.segmentId).toBe('seg-2');
    expect(preparedSplit.arguments.splitTime).toBe(2.5);

    await aiChatOptions.onToolCall({
      name: 'create_transcription_segment',
      arguments: {},
    });
    await aiChatOptions.onToolCall({
      name: 'split_transcription_segment',
      arguments: { splitTime: 2.5 },
    });

    expect(handler).toHaveBeenNthCalledWith(1, {
      name: 'create_transcription_segment',
      arguments: { segmentId: 'seg-2' },
    });
    expect(handler).toHaveBeenNthCalledWith(2, {
      name: 'split_transcription_segment',
      arguments: { segmentId: 'seg-2', splitTime: 2.5 },
    });
  });

  it('routes text and translation segment calls against the current independent layer segment', async () => {
    const { handler, aiChatOptions } = renderIndependentSegmentTimelineController();
    expect(aiChatOptions).toBeTruthy();

    const preparedSetTranscription = aiChatOptions.preparePendingToolCall({
      name: 'set_transcription_text',
      arguments: { text: '改写后文本' },
    });
    const preparedSetTranslation = aiChatOptions.preparePendingToolCall({
      name: 'set_translation_text',
      arguments: { layerId: 'trl-1', text: '译文' },
    });
    const preparedClearTranslation = aiChatOptions.preparePendingToolCall({
      name: 'clear_translation_segment',
      arguments: { layerId: 'trl-1' },
    });

    expect(preparedSetTranscription.arguments).toEqual({ segmentId: 'seg-2', text: '改写后文本' });
    expect(preparedSetTranslation.arguments).toEqual({ segmentId: 'seg-2', layerId: 'trl-1', text: '译文' });
    expect(preparedClearTranslation.arguments).toEqual({ segmentId: 'seg-2', layerId: 'trl-1' });

    await aiChatOptions.onToolCall({
      name: 'set_transcription_text',
      arguments: { text: '改写后文本' },
    });
    await aiChatOptions.onToolCall({
      name: 'set_translation_text',
      arguments: { layerId: 'trl-1', text: '译文' },
    });
    await aiChatOptions.onToolCall({
      name: 'clear_translation_segment',
      arguments: { layerId: 'trl-1' },
    });

    expect(handler).toHaveBeenNthCalledWith(1, {
      name: 'set_transcription_text',
      arguments: { segmentId: 'seg-2', text: '改写后文本' },
    });
    expect(handler).toHaveBeenNthCalledWith(2, {
      name: 'set_translation_text',
      arguments: { segmentId: 'seg-2', layerId: 'trl-1', text: '译文' },
    });
    expect(handler).toHaveBeenNthCalledWith(3, {
      name: 'clear_translation_segment',
      arguments: { segmentId: 'seg-2', layerId: 'trl-1' },
    });
  });

  it('threads targeted merge callbacks into the AI tool handler', () => {
    const mergeWithPrevious = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined);
    const mergeWithNext = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined);

    renderIndependentSegmentTimelineController({
      mergeWithPrevious,
      mergeWithNext,
    });

    const latestToolCallHandlerCall = mockUseAiToolCallHandler.mock.calls[mockUseAiToolCallHandler.mock.calls.length - 1];
    const toolHandlerInput = latestToolCallHandlerCall?.[0];
    expect(toolHandlerInput?.mergeWithPrevious).toBe(mergeWithPrevious);
    expect(toolHandlerInput?.mergeWithNext).toBe(mergeWithNext);
  });
});
