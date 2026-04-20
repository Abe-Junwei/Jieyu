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

function makeLayer(
  id: string,
  layerType: 'transcription' | 'translation',
  extras?: Pick<LayerDocType, 'parentLayerId'>,
): LayerDocType {
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
    ...(extras ?? {}),
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
        activeUnitId: 'utt-1',
        selectedUnit: { id: 'utt-1', startTime: 0, endTime: 1 },
        selectedRowMeta: null,
        selectedLayerId: '',
        selectedUnitKind: 'unit',
        selectedTimeRangeLabel: '0.00 - 1.00',
      },
      defaultTranscriptionLayerId: trcDefault.id,
      translationLayers: [trl],
      layers: [trcDefault, trl],
      formatSidePaneLayerLabel: (layer) => `L:${layer.id}`,
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

  it('falls back to host child translation layer instead of first translation layer when no layer is selected', () => {
    const trEn = makeLayer('tr-en', 'transcription');
    const trFr = makeLayer('tr-fr', 'transcription');
    const tlZh = makeLayer('tl-zh', 'translation', { parentLayerId: 'tr-en' });
    const tlFr = makeLayer('tl-fr', 'translation', { parentLayerId: 'tr-fr' });

    const { result } = renderHook(() => useVoiceInteraction({
      effectiveVoiceCorpusLang: 'zho',
      voiceCorpusLangOverride: '__auto__',
      executeAction: vi.fn(async () => undefined),
      handleResolveVoiceIntentWithLlm: vi.fn(async () => null),
      handleVoiceDictation: vi.fn(),
      onVoiceAnalysisResult: vi.fn(),
      selection: {
        activeUnitId: 'utt-1',
        selectedUnit: { id: 'utt-1', layerId: 'tr-fr', startTime: 0, endTime: 1 },
        selectedRowMeta: null,
        selectedLayerId: '',
        selectedUnitKind: 'unit',
        selectedTimeRangeLabel: '0.00 - 1.00',
      },
      translationLayers: [tlZh, tlFr],
      layers: [trEn, trFr, tlZh, tlFr],
      formatSidePaneLayerLabel: (layer) => `L:${layer.id}`,
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

    expect(result.current.voiceTargetSummary).toContain('L:tl-fr');
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
        activeUnitId: 'utt-1',
        selectedUnit: { id: 'utt-1', startTime: 0, endTime: 1 },
        selectedRowMeta: null,
        selectedLayerId: trcDefault.id,
        selectedUnitKind: 'unit',
        selectedTimeRangeLabel: '0.00 - 1.00',
      },
      defaultTranscriptionLayerId: trcDefault.id,
      translationLayers: [],
      layers: [trcDefault],
      formatSidePaneLayerLabel: (layer) => `L:${layer.id}`,
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

  it('treats selectedRowMeta as a valid analysis target even when selectedUnit is null', () => {
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
        activeUnitId: 'utt-1',
        selectedUnit: null,
        selectedRowMeta: { rowNumber: 3, start: 12, end: 15 },
        selectedLayerId: trcDefault.id,
        selectedUnitKind: 'unit',
        selectedTimeRangeLabel: '12.00 - 15.00',
      },
      defaultTranscriptionLayerId: trcDefault.id,
      translationLayers: [],
      layers: [trcDefault],
      formatSidePaneLayerLabel: (layer) => `L:${layer.id}`,
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

    expect(result.current.voiceTargetSummary).toMatch(/第 3 句 \/ AI 分析备注|Sentence 3 \/ AI analysis note/);
    expect(result.current.voiceSelectionSummary).toBe('12.00 - 15.00');
  });

  it('uses unified provider metadata for environment summary labels', () => {
    mockUseVoiceAgent.mockReturnValue({
      mode: 'dictation',
      agentState: 'idle',
      listening: false,
      engine: 'whisper-local',
      detectedLang: null,
      notifyAiStreamStarted: vi.fn(),
      notifyAiStreamFinished: vi.fn(),
      testWhisperLocal: vi.fn(async () => ({ available: true })),
      setExternalError: vi.fn(),
      setCommercialProviderConfig: vi.fn(),
      commercialProviderKind: 'groq',
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

    const trcDefault = makeLayer('trc-default', 'transcription');
    const { result } = renderHook(() => useVoiceInteraction({
      effectiveVoiceCorpusLang: 'zho',
      voiceCorpusLangOverride: null,
      executeAction: vi.fn(async () => undefined),
      handleResolveVoiceIntentWithLlm: vi.fn(async () => null),
      handleVoiceDictation: vi.fn(),
      onVoiceAnalysisResult: vi.fn(),
      selection: {
        activeUnitId: 'utt-1',
        selectedUnit: { id: 'utt-1', startTime: 0, endTime: 1 },
        selectedRowMeta: null,
        selectedLayerId: trcDefault.id,
        selectedUnitKind: 'unit',
        selectedTimeRangeLabel: '0.00 - 1.00',
      },
      defaultTranscriptionLayerId: trcDefault.id,
      translationLayers: [],
      layers: [trcDefault],
      formatSidePaneLayerLabel: (layer) => `L:${layer.id}`,
      formatTime: (seconds) => seconds.toFixed(2),
      aiChatSend: vi.fn(async () => undefined),
      aiIsStreaming: false,
      aiMessages: [],
      localWhisperConfig: {},
      commercialProviderKind: 'groq',
      commercialProviderConfig: {},
      onCommercialConfigChange: vi.fn(),
      setCommercialProviderKind: vi.fn(),
      setCommercialProviderConfig: vi.fn(),
      featureVoiceEnabled: true,
      toggleVoiceRef: { current: undefined },
    }));

    expect(result.current.voiceEnvironmentSummary).toContain('Distil-Whisper');
  });

  it('surfaces analysis writeback failure in voice status and external error', async () => {
    const setExternalError = vi.fn();
    const setAnalysisFillCallback = vi.fn((unitId: string | null, callback: (content: string) => void) => {
      expect(unitId).toBe('utt-1');
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
        activeUnitId: 'utt-1',
        selectedUnit: { id: 'utt-1', startTime: 12, endTime: 15 },
        selectedRowMeta: { rowNumber: 3, start: 12, end: 15 },
        selectedLayerId: 'trc-default',
        selectedUnitKind: 'unit',
        selectedTimeRangeLabel: '12.00 - 15.00',
      },
      defaultTranscriptionLayerId: 'trc-default',
      translationLayers: [],
      layers: [makeLayer('trc-default', 'transcription')],
      formatSidePaneLayerLabel: (layer) => `L:${layer.id}`,
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

  it('surfaces ai chat send failures and clears deferred analysis callback', async () => {
    const setExternalError = vi.fn();
    const setAnalysisFillCallback = vi.fn();

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

    const aiChatSend = vi.fn(async () => {
      throw new Error('AI 请求失败');
    });

    renderHook(() => useVoiceInteraction({
      effectiveVoiceCorpusLang: 'zho',
      voiceCorpusLangOverride: '__auto__',
      executeAction: vi.fn(async () => undefined),
      handleResolveVoiceIntentWithLlm: vi.fn(async () => null),
      handleVoiceDictation: vi.fn(),
      onVoiceAnalysisResult: vi.fn(),
      selection: {
        activeUnitId: 'utt-1',
        selectedUnit: { id: 'utt-1', startTime: 12, endTime: 15 },
        selectedRowMeta: { rowNumber: 3, start: 12, end: 15 },
        selectedLayerId: 'trc-default',
        selectedUnitKind: 'unit',
        selectedTimeRangeLabel: '12.00 - 15.00',
      },
      defaultTranscriptionLayerId: 'trc-default',
      translationLayers: [],
      layers: [makeLayer('trc-default', 'transcription')],
      formatSidePaneLayerLabel: (layer) => `L:${layer.id}`,
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
    expect(setExternalError).toHaveBeenCalledWith('AI 请求失败');
    expect(setAnalysisFillCallback).toHaveBeenNthCalledWith(1, 'utt-1', expect.any(Function));
    expect(setAnalysisFillCallback).toHaveBeenNthCalledWith(2, null, null);
  });

  it('surfaces whisper stopRecording failures instead of dropping them', async () => {
    const setExternalError = vi.fn();
    const stopRecording = vi.fn(async () => {
      throw new Error('停止录音失败');
    });

    mockUseVoiceAgent.mockReturnValue({
      mode: 'dictation',
      agentState: 'idle',
      listening: true,
      engine: 'whisper-local',
      detectedLang: null,
      notifyAiStreamStarted: vi.fn(),
      notifyAiStreamFinished: vi.fn(),
      testWhisperLocal: vi.fn(async () => ({ available: true })),
      setExternalError,
      setCommercialProviderConfig: vi.fn(),
      commercialProviderKind: 'openai' as any,
      commercialProviderConfig: {},
      toggle: vi.fn(),
      switchEngine: vi.fn(),
      startRecording: vi.fn(async () => undefined),
      stopRecording,
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
        activeUnitId: 'utt-1',
        selectedUnit: { id: 'utt-1', startTime: 0, endTime: 1 },
        selectedRowMeta: null,
        selectedLayerId: 'trc-default',
        selectedUnitKind: 'unit',
        selectedTimeRangeLabel: '0.00 - 1.00',
      },
      defaultTranscriptionLayerId: 'trc-default',
      translationLayers: [],
      layers: [makeLayer('trc-default', 'transcription')],
      formatSidePaneLayerLabel: (layer) => `L:${layer.id}`,
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

    await act(async () => {
      result.current.handleMicPointerUp();
      await Promise.resolve();
    });

    expect(stopRecording).toHaveBeenCalled();
    expect(setExternalError).toHaveBeenCalledWith('停止录音失败');
  });

  it('shows push-to-talk standby copy for whisper-local before recording starts', () => {
    mockUseVoiceAgent.mockReturnValue({
      mode: 'dictation',
      agentState: 'idle',
      listening: true,
      engine: 'whisper-local',
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
        activeUnitId: 'utt-1',
        selectedUnit: { id: 'utt-1', startTime: 0, endTime: 1 },
        selectedRowMeta: null,
        selectedLayerId: 'trc-default',
        selectedUnitKind: 'unit',
        selectedTimeRangeLabel: '0.00 - 1.00',
      },
      defaultTranscriptionLayerId: 'trc-default',
      translationLayers: [],
      layers: [makeLayer('trc-default', 'transcription')],
      formatSidePaneLayerLabel: (layer) => `L:${layer.id}`,
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

    expect(result.current.voiceStatusSummary).toMatch(/按住麦克风开始录音|Hold the mic to start recording/);
  });
});
