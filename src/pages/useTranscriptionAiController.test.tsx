// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayerDocType, UtteranceDocType } from '../db';
import { useTranscriptionAiController } from './useTranscriptionAiController';

const {
  mockUseAiChat,
  mockUseAiPanelLogic,
  mockUseAiToolCallHandler,
  mockTransformTextForLayerTarget,
  mockListRecentAiToolDecisionLogs,
} = vi.hoisted(() => ({
  mockUseAiChat: vi.fn(),
  mockUseAiPanelLogic: vi.fn(),
  mockUseAiToolCallHandler: vi.fn(),
  mockTransformTextForLayerTarget: vi.fn(async ({ text }: { text: string }) => text),
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
  transformTextForLayerTarget: mockTransformTextForLayerTarget,
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
    mockTransformTextForLayerTarget.mockClear();
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

    renderHook(() => useTranscriptionAiController({
      utterances: [utterance],
      selectedUnitIds: new Set([utterance.id]),
      selectedUtterance: utterance,
      selectedTimelineOwnerUtterance: utterance,
      selectedLayerId: '',
      selectionSnapshot: {
        timelineUnit: null,
        selectedUnitKind: null,
        activeUtteranceUnitId: utterance.id,
        selectedUtterance: utterance,
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
      utteranceCount: 1,
      translationLayerCount: 1,
      aiConfidenceAvg: null,
      undoHistory: [],
      createLayerWithActiveContext: vi.fn(async () => true),
      createNextUtterance: vi.fn(async () => undefined),
      splitUtterance: vi.fn(async () => undefined),
      deleteUtterance: vi.fn(async () => undefined),
      deleteSelectedUtterances: vi.fn(async () => undefined),
      deleteLayer: vi.fn(async () => undefined),
      toggleLayerLink: vi.fn(async () => undefined),
      saveUtteranceText: vi.fn(async () => undefined),
      saveTextTranslationForUtterance: vi.fn(async () => undefined),
      saveSegmentContentForLayer: vi.fn(async () => undefined),
      updateTokenPos: vi.fn(),
      batchUpdateTokenPosByForm: vi.fn(async () => 0),
      updateTokenGloss: vi.fn(),
      selectUtterance: vi.fn(),
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

    await toolHandlerInput.transformTextForLayerWrite({
      text: 'hello',
      targetLayerId: 'trl-target',
      selectedLayerId: '',
    });

    expect(mockTransformTextForLayerTarget).toHaveBeenCalledWith({
      text: 'hello',
      layers: [transcriptionLayer, translationLayer],
      targetLayerId: 'trl-target',
      selectedLayerId: '',
      fallbackSourceOrthographyId: 'orth-source',
    });
  });
});