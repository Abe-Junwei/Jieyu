// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayerDocType } from '../db';
import { useVoiceInteraction } from './useVoiceInteraction';

const mockUseVoiceAgent = vi.hoisted(() => vi.fn());

vi.mock('./useVoiceAgent', () => ({
  useVoiceAgent: (...args: unknown[]) => mockUseVoiceAgent(...args),
}));

function makeLayer(id: string, layerType: 'transcription' | 'translation'): LayerDocType {
  const now = '2026-03-26T00:00:00.000Z';
  return {
    id,
    textId: 'text-1',
    key: id,
    name: { zho: id },
    layerType,
    languageId: 'zho',
    modality: 'text',
    acceptsAudio: false,
    createdAt: now,
    updatedAt: now,
  } as LayerDocType;
}

describe('useVoiceInteraction', () => {
  beforeEach(() => {
    mockUseVoiceAgent.mockReturnValue({
      mode: 'dictation',
      agentState: 'idle',
      listening: false,
      engine: 'web-speech',
      detectedLang: null,
      notifyAiStreamStarted: vi.fn(),
      notifyAiStreamFinished: vi.fn(),
      testWhisperLocal: vi.fn(async () => ({ available: true })),
      setExternalError: vi.fn(),
      setCommercialProviderConfig: vi.fn(),
      commercialProviderKind: 'openai' as any,
      commercialProviderConfig: {},
      toggle: vi.fn(),
      switchEngine: vi.fn(),
      startRecording: vi.fn(async () => undefined),
      stopRecording: vi.fn(async () => undefined),
      isRecording: false,
      disambiguationOptions: [],
      pendingConfirm: null,
      error: null,
    });
  });

  it('falls back to defaultTranscriptionLayerId when selectedLayerId is empty string', () => {
    const trcDefault = makeLayer('trc-default', 'transcription');
    const trl = makeLayer('trl-1', 'translation');

    const { result } = renderHook(() => useVoiceInteraction({
      effectiveVoiceCorpusLang: 'zho',
      voiceCorpusLangOverride: '__auto__',
      executeAction: vi.fn(async () => undefined),
      handleResolveVoiceIntentWithLlm: vi.fn(async () => null),
      handleVoiceDictation: vi.fn(),
      onVoiceAnalysisResult: vi.fn(),
      selection: {
        activeUtteranceUnitId: 'utt-1',
        selectedUtterance: { id: 'utt-1', startTime: 0, endTime: 1 },
        selectedRowMeta: null,
        selectedLayerId: '',
        selectedUnitKind: 'utterance',
        selectedTimeRangeLabel: '0.00 - 1.00',
      },
      defaultTranscriptionLayerId: trcDefault.id,
      translationLayers: [trl],
      layers: [trcDefault, trl],
      formatLayerRailLabel: (layer) => `L:${layer.id}`,
      formatTime: (seconds) => seconds.toFixed(2),
      aiChatSend: vi.fn(async () => undefined),
      aiIsStreaming: false,
      aiMessages: [],
      localWhisperConfig: {},
      commercialProviderKind: 'openai' as any,
      commercialProviderConfig: {},
      onCommercialConfigChange: vi.fn(),
      setCommercialProviderKind: vi.fn(),
      setCommercialProviderConfig: vi.fn(),
      featureVoiceEnabled: true,
      toggleVoiceRef: { current: undefined },
    }));

    expect(result.current.voiceTargetSummary).toContain('L:trc-default');
  });

  it('passes continuous dictation pipeline wiring through to useVoiceAgent when provided', () => {
    const trcDefault = makeLayer('trc-default', 'transcription');
    const dictationPipeline = {
      callbacks: {
        getSegments: vi.fn(() => []),
        getCurrentSegmentId: vi.fn(() => null),
        fillSegment: vi.fn(async () => undefined),
        restoreSegment: vi.fn(async () => undefined),
        navigateTo: vi.fn(),
        navigateToNextUnannotated: vi.fn(() => null),
      },
      config: {
        targetLayer: 'transcription' as const,
        autoAdvance: true,
      },
    };

    renderHook(() => useVoiceInteraction({
      effectiveVoiceCorpusLang: 'zho',
      voiceCorpusLangOverride: '__auto__',
      executeAction: vi.fn(async () => undefined),
      handleResolveVoiceIntentWithLlm: vi.fn(async () => null),
      handleVoiceDictation: vi.fn(),
      dictationPipeline,
      onVoiceAnalysisResult: vi.fn(),
      selection: {
        activeUtteranceUnitId: 'utt-1',
        selectedUtterance: { id: 'utt-1', startTime: 0, endTime: 1 },
        selectedRowMeta: null,
        selectedLayerId: trcDefault.id,
        selectedUnitKind: 'utterance',
        selectedTimeRangeLabel: '0.00 - 1.00',
      },
      defaultTranscriptionLayerId: trcDefault.id,
      translationLayers: [],
      layers: [trcDefault],
      formatLayerRailLabel: (layer) => `L:${layer.id}`,
      formatTime: (seconds) => seconds.toFixed(2),
      aiChatSend: vi.fn(async () => undefined),
      aiIsStreaming: false,
      aiMessages: [],
      localWhisperConfig: {},
      commercialProviderKind: 'openai' as any,
      commercialProviderConfig: {},
      onCommercialConfigChange: vi.fn(),
      setCommercialProviderKind: vi.fn(),
      setCommercialProviderConfig: vi.fn(),
      featureVoiceEnabled: true,
      toggleVoiceRef: { current: undefined },
    }));

    const latestCall = mockUseVoiceAgent.mock.calls[mockUseVoiceAgent.mock.calls.length - 1];
    expect(latestCall?.[0]).toEqual(expect.objectContaining({ dictationPipeline }));
  });

  it('treats selectedRowMeta as a valid analysis target even when selectedUtterance is null', () => {
    const trcDefault = makeLayer('trc-default', 'transcription');

    mockUseVoiceAgent.mockReturnValue({
      mode: 'analysis',
      agentState: 'idle',
      listening: false,
      engine: 'web-speech',
      detectedLang: null,
      notifyAiStreamStarted: vi.fn(),
      notifyAiStreamFinished: vi.fn(),
      testWhisperLocal: vi.fn(async () => ({ available: true })),
      setExternalError: vi.fn(),
      setCommercialProviderConfig: vi.fn(),
      commercialProviderKind: 'openai' as any,
      commercialProviderConfig: {},
      toggle: vi.fn(),
      switchEngine: vi.fn(),
      startRecording: vi.fn(async () => undefined),
      stopRecording: vi.fn(async () => undefined),
      isRecording: false,
      disambiguationOptions: [],
      pendingConfirm: null,
      error: null,
    });

    const { result } = renderHook(() => useVoiceInteraction({
      effectiveVoiceCorpusLang: 'zho',
      voiceCorpusLangOverride: '__auto__',
      executeAction: vi.fn(async () => undefined),
      handleResolveVoiceIntentWithLlm: vi.fn(async () => null),
      handleVoiceDictation: vi.fn(),
      onVoiceAnalysisResult: vi.fn(),
      selection: {
        activeUtteranceUnitId: 'utt-1',
        selectedUtterance: null,
        selectedRowMeta: { rowNumber: 3, start: 12, end: 15 },
        selectedLayerId: trcDefault.id,
        selectedUnitKind: 'utterance',
        selectedTimeRangeLabel: '12.00 - 15.00',
      },
      defaultTranscriptionLayerId: trcDefault.id,
      translationLayers: [],
      layers: [trcDefault],
      formatLayerRailLabel: (layer) => `L:${layer.id}`,
      formatTime: (seconds) => seconds.toFixed(2),
      aiChatSend: vi.fn(async () => undefined),
      aiIsStreaming: false,
      aiMessages: [],
      localWhisperConfig: {},
      commercialProviderKind: 'openai' as any,
      commercialProviderConfig: {},
      onCommercialConfigChange: vi.fn(),
      setCommercialProviderKind: vi.fn(),
      setCommercialProviderConfig: vi.fn(),
      featureVoiceEnabled: true,
      toggleVoiceRef: { current: undefined },
    }));

    expect(result.current.voiceTargetSummary).toContain('第 3 句 / AI 分析备注');
    expect(result.current.voiceSelectionSummary).toBe('12.00 - 15.00');
  });

  it('surfaces analysis writeback failure in voice status and external error', async () => {
    const setExternalError = vi.fn();
    const setAnalysisFillCallback = vi.fn((utteranceId: string | null, callback: (content: string) => void) => {
      expect(utteranceId).toBe('utt-1');
      callback('分析结果文本');
    });

    mockUseVoiceAgent.mockReturnValue({
      mode: 'analysis',
      agentState: 'idle',
      listening: false,
      engine: 'web-speech',
      detectedLang: null,
      notifyAiStreamStarted: vi.fn(),
      notifyAiStreamFinished: vi.fn(),
      testWhisperLocal: vi.fn(async () => ({ available: true })),
      setExternalError,
      setCommercialProviderConfig: vi.fn(),
      setAnalysisFillCallback,
      commercialProviderKind: 'openai' as any,
      commercialProviderConfig: {},
      toggle: vi.fn(),
      switchEngine: vi.fn(),
      startRecording: vi.fn(async () => undefined),
      stopRecording: vi.fn(async () => undefined),
      isRecording: false,
      disambiguationOptions: [],
      pendingConfirm: null,
      error: null,
    });

    const onVoiceAnalysisResult = vi.fn(async () => ({ ok: false, message: '分析写回失败：目标不可用' }));
    const aiChatSend = vi.fn(async () => undefined);

    const { result } = renderHook(() => useVoiceInteraction({
      effectiveVoiceCorpusLang: 'zho',
      voiceCorpusLangOverride: '__auto__',
      executeAction: vi.fn(async () => undefined),
      handleResolveVoiceIntentWithLlm: vi.fn(async () => null),
      handleVoiceDictation: vi.fn(),
      onVoiceAnalysisResult,
      selection: {
        activeUtteranceUnitId: 'utt-1',
        selectedUtterance: { id: 'utt-1', startTime: 12, endTime: 15 },
        selectedRowMeta: { rowNumber: 3, start: 12, end: 15 },
        selectedLayerId: 'trc-default',
        selectedUnitKind: 'utterance',
        selectedTimeRangeLabel: '12.00 - 15.00',
      },
      defaultTranscriptionLayerId: 'trc-default',
      translationLayers: [],
      layers: [makeLayer('trc-default', 'transcription')],
      formatLayerRailLabel: (layer) => `L:${layer.id}`,
      formatTime: (seconds) => seconds.toFixed(2),
      aiChatSend,
      aiIsStreaming: false,
      aiMessages: [],
      localWhisperConfig: {},
      commercialProviderKind: 'openai' as any,
      commercialProviderConfig: {},
      onCommercialConfigChange: vi.fn(),
      setCommercialProviderKind: vi.fn(),
      setCommercialProviderConfig: vi.fn(),
      featureVoiceEnabled: true,
      toggleVoiceRef: { current: undefined },
    }));

    const latestCall = mockUseVoiceAgent.mock.calls[mockUseVoiceAgent.mock.calls.length - 1];
    const useVoiceAgentOptions = latestCall?.[0] as {
      sendToAiChat?: (text: string) => void;
    };

    await act(async () => {
      useVoiceAgentOptions.sendToAiChat?.('请分析这句');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(aiChatSend).toHaveBeenCalledWith('请分析这句');
    expect(onVoiceAnalysisResult).toHaveBeenCalledWith('utt-1', '分析结果文本');
    expect(setExternalError).toHaveBeenCalledWith('分析写回失败：目标不可用');
    expect(result.current.voiceStatusSummary).toContain('分析写回失败：目标不可用');
  });
});
