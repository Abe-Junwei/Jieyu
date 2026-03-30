// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Dispatch, SetStateAction } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { LayerDocType, UtteranceDocType } from '../db';
import type { AiPanelContextValue } from '../contexts/AiPanelContext';
import type { SaveState, TimelineUnit } from '../hooks/transcriptionTypes';
import { useTranscriptionAssistantController } from './useTranscriptionAssistantController';

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
    translationLayers: [translationLayer],
    layers: [makeLayer('layer-main'), translationLayer],
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

  it('writes dictation directly to segment content for segment-backed selection', async () => {
    const saveSegmentContentForLayer = vi.fn(async () => undefined);
    const saveUtteranceText = vi.fn(async () => undefined);
    const selectedTimelineUnit: TimelineUnit = { layerId: 'layer-seg', unitId: 'seg-1', kind: 'segment' };
    const { result } = renderHook(() => useTranscriptionAssistantController(createBaseInput({
      selectedTimelineUnit,
      saveSegmentContentForLayer,
      saveUtteranceText,
    })));

    act(() => {
      result.current.handleVoiceDictation('segment text');
    });

    await waitFor(() => {
      expect(saveSegmentContentForLayer).toHaveBeenCalledWith('seg-1', 'layer-seg', 'segment text');
    });
    expect(saveUtteranceText).not.toHaveBeenCalled();
  });

  it('persists dictation to the fallback translation layer and auto-advances', async () => {
    const saveTextTranslationForUtterance = vi.fn(async () => undefined);
    const selectUtterance = vi.fn();
    const { result } = renderHook(() => useTranscriptionAssistantController(createBaseInput({
      selectedLayerId: null,
      saveTextTranslationForUtterance,
      selectUtterance,
    })));

    act(() => {
      result.current.handleVoiceDictation('translated text');
    });

    await waitFor(() => {
      expect(saveTextTranslationForUtterance).toHaveBeenCalledWith('utt-1', 'translated text', 'layer-tr');
      expect(selectUtterance).toHaveBeenCalledWith('utt-2');
    });
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