// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Dispatch, SetStateAction } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { LayerDocType, UtteranceDocType } from '../db';
import type { AiPanelContextValue } from '../contexts/AiPanelContext';
import type { SaveState, TimelineUnit } from '../hooks/transcriptionTypes';
import { useTranscriptionAssistantController } from './useTranscriptionAssistantController';

const {
  mockBridgeTextForLayerTarget,
  mockResolveFallbackSourceOrthographyId,
} = vi.hoisted(() => ({
  mockBridgeTextForLayerTarget: vi.fn(async ({ text }: { text: string }) => text),
  mockResolveFallbackSourceOrthographyId: vi.fn(({ layers, selectedLayerId }: { layers: Array<{ layerType: string; orthographyId?: string }>; selectedLayerId?: string | null }) => {
    const normalizedSelectedLayerId = selectedLayerId?.trim();
    if (normalizedSelectedLayerId) return undefined;
    return layers.find((layer) => layer.layerType === 'transcription')?.orthographyId?.trim();
  }),
}));

vi.mock('../utils/orthographyRuntime', () => ({
  resolveFallbackSourceOrthographyId: mockResolveFallbackSourceOrthographyId,
  bridgeTextForLayerTarget: mockBridgeTextForLayerTarget,
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
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:00.000Z',
  } as LayerDocType;
}

function makeUtterance(id: string): UtteranceDocType {
  return {
    id,
    mediaId: 'media-1',
    textId: 'text-1',
    startTime: 0,
    endTime: 1,
    createdAt: '2026-03-30T00:00:00.000Z',
    updatedAt: '2026-03-30T00:00:00.000Z',
  } as UtteranceDocType;
}

type HookInput = Parameters<typeof useTranscriptionAssistantController>[0];

function createBaseInput(overrides: Partial<HookInput> = {}): HookInput {
  const utterance = makeUtterance('utt-1');
  const translationLayer = makeLayer('layer-tr', 'translation');
  const transcriptionLayer = makeLayer('layer-main');

  return {
    state: {
      phase: 'ready',
      dbName: 'jieyu',
      utteranceCount: 1,
      translationLayerCount: 1,
    },
    utterancesLength: 1,
    translationLayersLength: 1,
    aiConfidenceAvg: 0.9,
    selectedTimelineOwnerUtterance: utterance,
    selectedTimelineRowMeta: { rowNumber: 1, start: 0, end: 1 },
    selectedAiWarning: false,
    lexemeMatches: [{ id: 'lex-1', lemma: { eng: 'hello' } }],
    handleOpenWordNote: vi.fn(),
    handleOpenMorphemeNote: vi.fn(),
    handleUpdateTokenPos: vi.fn(),
    handleBatchUpdateTokenPosByForm: vi.fn(),
    aiPanelMode: 'auto',
    setAiPanelMode: vi.fn() as unknown as Dispatch<SetStateAction<NonNullable<AiPanelContextValue['aiPanelMode']>>>,
    aiCurrentTask: 'transcription',
    aiVisibleCards: undefined,
    selectedTranslationGapCount: 2,
    handleJumpToTranslationGap: vi.fn(),
    setAiPanelContext: vi.fn() as unknown as Dispatch<SetStateAction<AiPanelContextValue>>,
    selectedTimelineUnit: null as TimelineUnit | null,
    saveSegmentContentForLayer: vi.fn(async () => undefined),
    selectedLayerId: null,
    defaultTranscriptionLayerId: transcriptionLayer.id,
    translationLayers: [translationLayer],
    layers: [transcriptionLayer, translationLayer],
    utterancesOnCurrentMedia: [utterance],
    getUtteranceTextForLayer: vi.fn(() => ''),
    saveUtteranceText: vi.fn(async () => undefined),
    saveTextTranslationForUtterance: vi.fn(async () => undefined),
    setSaveState: vi.fn() as unknown as (state: SaveState) => void,
    nextUtteranceIdForVoiceDictation: 'utt-2',
    selectUtterance: vi.fn(),
    aiChatEnabled: true,
    aiChatSettings: {
      provider: 'mock',
      baseUrl: '',
      apiKey: '',
      model: '',
    } as unknown as HookInput['aiChatSettings'],
    pushUndo: vi.fn(),
    setUtterances: vi.fn() as unknown as Dispatch<SetStateAction<UtteranceDocType[]>>,
    ...overrides,
  };
}

describe('useTranscriptionAssistantController', () => {
  it('transforms dictation text before writing to the default transcription layer when no layer is explicitly selected', async () => {
    mockBridgeTextForLayerTarget.mockResolvedValueOnce('xf:translated text');
    const saveUtteranceText = vi.fn(async () => undefined);
    const selectUtterance = vi.fn();
    const { result } = renderHook(() => useTranscriptionAssistantController(createBaseInput({
      selectedLayerId: null,
      layers: [
        { ...makeLayer('layer-main'), orthographyId: 'orth-source' } as LayerDocType,
        { ...makeLayer('layer-tr', 'translation'), orthographyId: 'orth-target' } as LayerDocType,
      ],
      saveUtteranceText,
      selectUtterance,
    })));

    act(() => {
      result.current.handleVoiceDictation('translated text');
    });

    await waitFor(() => {
      expect(mockBridgeTextForLayerTarget).toHaveBeenCalledWith({
        text: 'translated text',
        layers: expect.arrayContaining([
          expect.objectContaining({ id: 'layer-main', orthographyId: 'orth-source' }),
          expect.objectContaining({ id: 'layer-tr', orthographyId: 'orth-target' }),
        ]),
        targetLayerId: 'layer-main',
        selectedLayerId: null,
        fallbackSourceOrthographyId: 'orth-source',
      });
      expect(saveUtteranceText).toHaveBeenCalledWith('utt-1', 'xf:translated text', 'layer-main');
      expect(selectUtterance).toHaveBeenCalledWith('utt-2');
    });
  });

  it('publishes AI panel context with derived ready-state stats', async () => {
    const setAiPanelContext = vi.fn() as unknown as Dispatch<SetStateAction<AiPanelContextValue>>;

    renderHook(() => useTranscriptionAssistantController(createBaseInput({ setAiPanelContext })));

    await waitFor(() => {
      expect(setAiPanelContext).toHaveBeenCalledWith(expect.objectContaining({
        dbName: 'jieyu',
        utteranceCount: 1,
        translationLayerCount: 1,
        selectedTranslationGapCount: 2,
      }));
    });
  });

  it('writes dictation to segment content with fallback orthography transform for segment-backed selection', async () => {
    const saveSegmentContentForLayer = vi.fn(async () => undefined);
    const saveUtteranceText = vi.fn(async () => undefined);
    const selectedTimelineUnit: TimelineUnit = { layerId: 'layer-seg', unitId: 'seg-1', kind: 'segment' };
    mockBridgeTextForLayerTarget.mockResolvedValueOnce('xf:segment text');
    const { result } = renderHook(() => useTranscriptionAssistantController(createBaseInput({
      selectedLayerId: null,
      selectedTimelineUnit,
      layers: [
        { ...makeLayer('layer-main'), orthographyId: 'orth-source' } as LayerDocType,
        { ...makeLayer('layer-seg', 'translation'), orthographyId: 'orth-target' } as LayerDocType,
      ],
      saveSegmentContentForLayer,
      saveUtteranceText,
    })));

    act(() => {
      result.current.handleVoiceDictation('segment text');
    });

    await waitFor(() => {
      expect(mockBridgeTextForLayerTarget).toHaveBeenCalledWith({
        text: 'segment text',
        layers: expect.arrayContaining([
          expect.objectContaining({ id: 'layer-main', orthographyId: 'orth-source' }),
          expect.objectContaining({ id: 'layer-seg', orthographyId: 'orth-target' }),
        ]),
        targetLayerId: 'layer-seg',
        selectedLayerId: null,
        fallbackSourceOrthographyId: 'orth-source',
      });
      expect(saveSegmentContentForLayer).toHaveBeenCalledWith('seg-1', 'layer-seg', 'xf:segment text');
    });
    expect(saveUtteranceText).not.toHaveBeenCalled();
  });

  it('persists dictation to the default transcription layer and auto-advances', async () => {
    const saveUtteranceText = vi.fn(async () => undefined);
    const selectUtterance = vi.fn();
    const { result } = renderHook(() => useTranscriptionAssistantController(createBaseInput({
      selectedLayerId: null,
      saveUtteranceText,
      selectUtterance,
    })));

    act(() => {
      result.current.handleVoiceDictation('translated text');
    });

    await waitFor(() => {
      expect(saveUtteranceText).toHaveBeenCalledWith('utt-1', 'translated text', 'layer-main');
      expect(selectUtterance).toHaveBeenCalledWith('utt-2');
    });
  });

  it('builds a continuous dictation pipeline for utterance-based voice dictation', async () => {
    const utterance1 = makeUtterance('utt-1');
    const utterance2 = makeUtterance('utt-2');
    const getUtteranceTextForLayer = vi.fn((utterance: UtteranceDocType) => (utterance.id === 'utt-1' ? '' : '已有内容'));
    const saveUtteranceText = vi.fn(async () => undefined);
    const selectUtterance = vi.fn();
    const { result } = renderHook(() => useTranscriptionAssistantController(createBaseInput({
      utterancesOnCurrentMedia: [utterance1, utterance2],
      getUtteranceTextForLayer,
      saveUtteranceText,
      selectUtterance,
    })));

    expect(result.current.voiceDictationPipeline?.config?.targetLayer).toBe('transcription');

    const segments = result.current.voiceDictationPipeline?.callbacks.getSegments();
    expect(segments).toEqual([
      expect.objectContaining({ segmentId: 'utt-1', existingText: null }),
      expect.objectContaining({ segmentId: 'utt-2', existingText: '已有内容' }),
    ]);

    await result.current.voiceDictationPipeline?.callbacks.fillSegment('utt-1', 'transcription', 'voice text');
    expect(saveUtteranceText).toHaveBeenCalledWith('utt-1', 'voice text', 'layer-main');

    result.current.voiceDictationPipeline?.callbacks.navigateTo('utt-2');
    expect(selectUtterance).toHaveBeenCalledWith('utt-2');
  });

  it('skips LLM voice intent resolution when AI chat is disabled', async () => {
    const { result } = renderHook(() => useTranscriptionAssistantController(createBaseInput({
      aiChatEnabled: false,
    })));

    await expect(result.current.handleResolveVoiceIntentWithLlm({
      text: '播放',
      mode: 'command',
      session: { id: 'session-1', startedAt: 0, entries: [], mode: 'command' },
    })).resolves.toBeNull();
  });
});