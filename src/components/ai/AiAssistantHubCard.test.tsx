// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AiAssistantHubCard } from './AiAssistantHubCard';
import {
  AiAssistantHubContext,
  type AiAssistantHubContextValue,
} from '../../contexts/AiAssistantHubContext';

vi.mock('./AiChatCard', () => ({
  AiChatCard: () => <div data-testid="mock-ai-chat-card">mock-chat</div>,
}));

function makeContextValue(overrides: Partial<AiAssistantHubContextValue> = {}): AiAssistantHubContextValue {
  return {
    selectedUtterance: null,
    selectedRowMeta: null,
    lexemeMatches: [],
    aiChatEnabled: true,
    aiProviderLabel: 'Mock Provider',
    aiMessages: [],
    aiIsStreaming: false,
    aiLastError: null,
    aiConnectionTestStatus: 'idle',
    aiConnectionTestMessage: null,
    aiContextDebugSnapshot: null,
    aiPendingToolCall: null,
    aiToolDecisionLogs: [],
    voiceEnabled: true,
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

describe('AiAssistantHubCard', () => {
  it('sends transcript to chat with voice prefix', () => {
    const onSendAiMessage = vi.fn().mockResolvedValue(undefined);

    render(
      <AiAssistantHubContext.Provider
        value={makeContextValue({
          voiceEnabled: true,
          voiceInterimText: '测试语音输入',
          onSendAiMessage,
        })}
      >
        <AiAssistantHubCard />
      </AiAssistantHubContext.Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /发送到聊天|Send to Chat/i }));

    expect(onSendAiMessage).toHaveBeenCalledWith('[语音] 测试语音输入');
  });

  it('handles pending voice confirmation actions', () => {
    const onVoiceConfirm = vi.fn();
    const onVoiceCancel = vi.fn();

    render(
      <AiAssistantHubContext.Provider
        value={makeContextValue({
          voicePendingConfirm: {
            actionId: 'delete',
            label: '[模糊] 删除当前句段',
          },
          onVoiceConfirm,
          onVoiceCancel,
        })}
      >
        <AiAssistantHubCard />
      </AiAssistantHubContext.Provider>,
    );

    expect(screen.getByText(/待确认：|Pending:/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /确认|Confirm/i }));
    fireEvent.click(screen.getByRole('button', { name: /取消|Cancel/i }));

    expect(onVoiceConfirm).toHaveBeenCalledTimes(1);
    expect(onVoiceCancel).toHaveBeenCalledTimes(1);
  });
});