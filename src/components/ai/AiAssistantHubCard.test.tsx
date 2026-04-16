// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AiAssistantHubCard } from './AiAssistantHubCard';
import { AiAssistantHubContext, type AiAssistantHubContextValue } from '../../contexts/AiAssistantHubContext';
import { LocaleProvider } from '../../i18n';
import { DEFAULT_AI_CHAT_CONTEXT_VALUE } from '../../contexts/AiChatContext';
import { DEFAULT_VOICE_AGENT_CONTEXT_VALUE } from '../../contexts/VoiceAgentContext';
import { pickAiAssistantHubContextValue } from '../../hooks/useAiAssistantHubContextValue';
import { pickAiChatContextValue } from '../../hooks/useAiChatContextValue';
import { pickVoiceAgentContextValue } from '../../hooks/useVoiceAgentContextValue';

vi.mock('./AiChatCard', () => ({
  AiChatCard: () => <div data-testid="mock-ai-chat-card">mock-chat</div>,
}));

const DEFAULT_HUB_VALUE = pickAiAssistantHubContextValue(
  pickAiChatContextValue(DEFAULT_AI_CHAT_CONTEXT_VALUE),
  pickVoiceAgentContextValue(DEFAULT_VOICE_AGENT_CONTEXT_VALUE),
);

function makeContextValue(overrides: Partial<AiAssistantHubContextValue> = {}): AiAssistantHubContextValue {
  return { ...DEFAULT_HUB_VALUE, aiChatEnabled: true, aiProviderLabel: 'Mock Provider', voiceEnabled: true, ...overrides };
}

describe('AiAssistantHubCard', () => {
  it('sends transcript to chat with voice prefix', () => {
    const onSendAiMessage = vi.fn().mockResolvedValue(undefined);

    render(
      <LocaleProvider locale="zh-CN">
        <AiAssistantHubContext.Provider
          value={makeContextValue({
            voiceEnabled: true,
            voiceInterimText: '测试语音输入',
            onSendAiMessage,
          })}
        >
          <AiAssistantHubCard />
        </AiAssistantHubContext.Provider>
      </LocaleProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /发送到聊天|Send to Chat/i }));

    expect(onSendAiMessage).toHaveBeenCalledWith('[语音] 测试语音输入');
  });

  it('handles pending voice confirmation actions', () => {
    const onVoiceConfirm = vi.fn();
    const onVoiceCancel = vi.fn();

    render(
      <LocaleProvider locale="zh-CN">
        <AiAssistantHubContext.Provider
          value={makeContextValue({
            voicePendingConfirm: {
              actionId: 'deleteSegment',
              label: '删除当前句段',
              fromFuzzy: true,
            },
            onVoiceConfirm,
            onVoiceCancel,
          })}
        >
          <AiAssistantHubCard />
        </AiAssistantHubContext.Provider>
      </LocaleProvider>,
    );

    expect(screen.getByText(/待确认：|Pending:/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /确认|Confirm/i }));
    fireEvent.click(screen.getByRole('button', { name: /取消|Cancel/i }));

    expect(onVoiceConfirm).toHaveBeenCalledTimes(1);
    expect(onVoiceCancel).toHaveBeenCalledTimes(1);
  });
});