// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { pickAiAssistantHubContextValue, useAiAssistantHubContextValue } from './useAiAssistantHubContextValue';
import type { AiChatContextValue } from '../contexts/AiChatContext';
import type { VoiceAgentContextValue } from '../contexts/VoiceAgentContext';
import { pickAiChatContextValue } from './useAiChatContextValue';
import { pickVoiceAgentContextValue } from './useVoiceAgentContextValue';

function makeAiChatSource(overrides: Partial<AiChatContextValue> = {}): Partial<AiChatContextValue> {
  return {
    selectedUnit: null,
    selectedRowMeta: null,
    lexemeMatches: [],
    aiChatEnabled: false,
    aiToolDecisionLogs: [],
    observerStage: 'collecting',
    observerRecommendations: [],
    ...overrides,
  };
}

function makeVoiceSource(overrides: Partial<VoiceAgentContextValue> = {}): Partial<VoiceAgentContextValue> {
  return {
    voiceEnabled: false,
    voiceListening: false,
    voiceSpeechActive: false,
    voiceMode: 'command',
    voiceInterimText: '',
    voiceFinalText: '',
    voiceConfidence: 0,
    voiceError: null,
    voiceSafeMode: false,
    voicePendingConfirm: null,
    ...overrides,
  };
}

describe('useAiAssistantHubContextValue', () => {
  it('maps ai panel context values for assistant hub consumption', () => {
    const onSendAiMessage = vi.fn().mockResolvedValue(undefined);
    const onVoiceToggle = vi.fn();
    const chatSource = makeAiChatSource({
      aiChatEnabled: true,
      aiProviderLabel: 'Mock Provider',
      aiMessages: [
        {
          id: 'm1',
          role: 'user',
          content: 'hello',
        },
      ],
      onSendAiMessage,
    });
    const voiceSource = makeVoiceSource({
      voiceEnabled: true,
      voiceListening: true,
      voiceMode: 'analysis',
      voiceInterimText: 'interim',
      onVoiceToggle,
    });

    const { result } = renderHook(() =>
      useAiAssistantHubContextValue(pickAiChatContextValue(chatSource), pickVoiceAgentContextValue(voiceSource))
    );

    expect(result.current.aiChatEnabled).toBe(true);
    expect(result.current.aiProviderLabel).toBe('Mock Provider');
    expect(result.current.aiMessages?.[0]?.content).toBe('hello');
    expect(result.current.voiceEnabled).toBe(true);
    expect(result.current.voiceListening).toBe(true);
    expect(result.current.voiceMode).toBe('analysis');
    expect(result.current.voiceInterimText).toBe('interim');
    expect(result.current.onSendAiMessage).toBe(onSendAiMessage);
    expect(result.current.onVoiceToggle).toBe(onVoiceToggle);
  });

  it('only exposes the assistant-hub field subset', () => {
    const mapped = pickAiAssistantHubContextValue(
      pickAiChatContextValue(makeAiChatSource()),
      pickVoiceAgentContextValue(makeVoiceSource()),
    );
    const keys = Object.keys(mapped).sort();
    const expected = [
      'aiChatEnabled',
      'aiChatSettings',
      'aiConnectionTestMessage',
      'aiConnectionTestStatus',
      'aiContextDebugSnapshot',
      'aiInteractionMetrics',
      'aiIsStreaming',
      'aiLastError',
      'aiMessages',
      'aiPendingToolCall',
      'aiProviderLabel',
      'aiSessionMemory',
      'aiTaskSession',
      'aiToolDecisionLogs',
      'currentPage',
      'lexemeMatches',
      'observerStage',
      'onCancelPendingToolCall',
      'onClearAiMessages',
      'onConfirmPendingToolCall',
      'onDeactivateAiSessionDirective',
      'onJumpToCitation',
      'onPruneAiSessionDirectivesBySourceMessage',
      'onSendAiMessage',
      'onStopAiMessage',
      'onTestAiConnection',
      'onToggleAiMessagePin',
      'onTrackAiRecommendationEvent',
      'onUpdateAiChatSettings',
      'onVoiceCancel',
      'onVoiceConfirm',
      'onVoiceSetSafeMode',
      'onVoiceSwitchMode',
      'onVoiceToggle',
      'selectedRowMeta',
      'selectedText',
      'selectedTimeRangeLabel',
      'selectedUnitKind',
      'selectedUnit',
      'voiceConfidence',
      'voiceEnabled',
      'voiceError',
      'voiceFinalText',
      'voiceInterimText',
      'voiceListening',
      'voiceMode',
      'voicePendingConfirm',
      'voiceSafeMode',
      'voiceSpeechActive',
    ].sort();

    expect(keys).toEqual(expected);
  });
});
