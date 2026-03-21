// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  pickAiAssistantHubContextValue,
  useAiAssistantHubContextValue,
} from './useAiAssistantHubContextValue';
import {
  DEFAULT_AI_PANEL_CONTEXT_VALUE,
  type AiPanelContextValue,
} from '../contexts/AiPanelContext';

function makeAiPanelContextValue(overrides: Partial<AiPanelContextValue> = {}): AiPanelContextValue {
  return {
    ...DEFAULT_AI_PANEL_CONTEXT_VALUE,
    selectedUtterance: null,
    selectedRowMeta: null,
    lexemeMatches: [],
    ...overrides,
  };
}

describe('useAiAssistantHubContextValue', () => {
  it('maps ai panel context values for assistant hub consumption', () => {
    const onSendAiMessage = vi.fn().mockResolvedValue(undefined);
    const onVoiceToggle = vi.fn();
    const source = makeAiPanelContextValue({
      aiChatEnabled: true,
      aiProviderLabel: 'Mock Provider',
      aiMessages: [
        {
          id: 'm1',
          role: 'user',
          content: 'hello',
          timestamp: Date.now(),
        },
      ],
      voiceEnabled: true,
      voiceListening: true,
      voiceMode: 'analysis',
      voiceInterimText: 'interim',
      onSendAiMessage,
      onVoiceToggle,
    });

    const { result } = renderHook(() => useAiAssistantHubContextValue(source));

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
    const mapped = pickAiAssistantHubContextValue(makeAiPanelContextValue());
    const keys = Object.keys(mapped).sort();
    const expected = [
      'aiChatEnabled',
      'aiChatSettings',
      'aiConnectionTestMessage',
      'aiConnectionTestStatus',
      'aiContextDebugSnapshot',
      'aiIsStreaming',
      'aiLastError',
      'aiMessages',
      'aiPendingToolCall',
      'aiProviderLabel',
      'aiToolDecisionLogs',
      'lexemeMatches',
      'observerStage',
      'onCancelPendingToolCall',
      'onClearAiMessages',
      'onConfirmPendingToolCall',
      'onJumpToCitation',
      'onSendAiMessage',
      'onStopAiMessage',
      'onTestAiConnection',
      'onUpdateAiChatSettings',
      'onVoiceCancel',
      'onVoiceConfirm',
      'onVoiceSetSafeMode',
      'onVoiceSwitchMode',
      'onVoiceToggle',
      'selectedRowMeta',
      'selectedUtterance',
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
