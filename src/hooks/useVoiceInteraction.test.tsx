// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
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
      activeUtteranceUnitId: 'utt-1',
      selectedUtterance: { id: 'utt-1', startTime: 0, endTime: 1 },
      selectedRowMeta: null,
      selectedLayerId: '',
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
      activeUtteranceUnitId: 'utt-1',
      selectedUtterance: null,
      selectedRowMeta: { rowNumber: 3, start: 12, end: 15 },
      selectedLayerId: trcDefault.id,
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
});
