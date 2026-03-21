// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { AiChatCard } from './AiChatCard';
import { normalizeAiChatSettings } from '../../ai/providers/providerCatalog';
import {
  AiAssistantHubContext,
  type AiAssistantHubContextValue,
} from '../../contexts/AiAssistantHubContext';

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

describe('AiChatCard input submit', () => {
  it('does not send on Enter while IME composition is active, then sends after composition ends', () => {
    const onSendAiMessage = vi.fn().mockResolvedValue(undefined);

    render(
      <AiAssistantHubContext.Provider value={makeContextValue({ onSendAiMessage })}>
        <AiChatCard embedded />
      </AiAssistantHubContext.Provider>,
    );

    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '你好' } });

    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', isComposing: true, keyCode: 229 });
    expect(onSendAiMessage).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    expect(onSendAiMessage).toHaveBeenCalledTimes(1);
    expect(onSendAiMessage).toHaveBeenCalledWith('你好');
  });

  it('disables send button while assistant is streaming without persistent hint', () => {
    const onSendAiMessage = vi.fn().mockResolvedValue(undefined);

    const view = render(
      <AiAssistantHubContext.Provider value={makeContextValue({ onSendAiMessage, aiIsStreaming: true })}>
        <AiChatCard embedded />
      </AiAssistantHubContext.Provider>,
    );

    expect(within(view.container).queryByText(/上一条回复仍在生成中|still streaming/i)).toBeNull();
    const sendButton = within(view.container).getByRole('button', { name: /发送|Send/i }) as HTMLButtonElement;
    expect(sendButton.disabled).toBe(true);
  });

  it('shows blocked reason and disables send button while high-risk tool is pending', () => {
    const onSendAiMessage = vi.fn().mockResolvedValue(undefined);

    const view = render(
      <AiAssistantHubContext.Provider value={makeContextValue({
        onSendAiMessage,
        aiPendingToolCall: {
          call: { name: 'delete_layer', arguments: { layerId: 'layer-1' } },
          assistantMessageId: 'ast-1',
          riskSummary: 'Delete target layer',
          impactPreview: ['rows removed'],
        },
      })}>
        <AiChatCard embedded />
      </AiAssistantHubContext.Provider>,
    );

    expect(within(view.container).getByText(/待确认的高风险操作|high-risk action is pending/i)).toBeTruthy();
    const sendButton = within(view.container).getByRole('button', { name: /发送|Send/i }) as HTMLButtonElement;
    expect(sendButton.disabled).toBe(true);
  });

  it('shows user-friendly pending target label instead of full internal id', () => {
    const onSendAiMessage = vi.fn().mockResolvedValue(undefined);
    const utteranceId = 'utt_1773986765082_joj08x';

    const view = render(
      <AiAssistantHubContext.Provider value={makeContextValue({
        onSendAiMessage,
        aiPendingToolCall: {
          call: { name: 'delete_transcription_segment', arguments: { utteranceId } },
          assistantMessageId: 'ast-1',
          riskSummary: '将删除 1 条句段',
          impactPreview: ['删除后不可恢复'],
        },
      })}>
        <AiChatCard embedded />
      </AiAssistantHubContext.Provider>,
    );

    const alertToggle = within(view.container).getByRole('button', { name: /展开|Expand|收起|Hide/i });
    if (/展开|Expand/i.test(alertToggle.textContent ?? '')) {
      fireEvent.click(alertToggle);
    }

    expect(within(view.container).getByText(/目标:|Target:/i)).toBeTruthy();
    expect(within(view.container).queryByText(utteranceId)).toBeNull();
  });

  it('shows transient streaming hint on blocked Enter and clears it right after stop', () => {
    const onSendAiMessage = vi.fn().mockResolvedValue(undefined);

    function Harness() {
      const [streaming, setStreaming] = useState(true);
      return (
        <AiAssistantHubContext.Provider
          value={makeContextValue({
            onSendAiMessage,
            aiIsStreaming: streaming,
            onStopAiMessage: () => setStreaming(false),
          })}
        >
          <AiChatCard embedded />
        </AiAssistantHubContext.Provider>
      );
    }

    const view = render(<Harness />);
    const input = within(view.container).getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '你好' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(within(view.container).getByText(/上一条回复仍在生成中|still streaming/i)).toBeTruthy();
    expect(onSendAiMessage).not.toHaveBeenCalled();

    fireEvent.click(within(view.container).getByRole('button', { name: /停止|Stop/i }));

    expect(within(view.container).queryByText(/上一条回复仍在生成中|still streaming/i)).toBeNull();
    const sendButton = within(view.container).getByRole('button', { name: /发送|Send/i }) as HTMLButtonElement;
    expect(sendButton.disabled).toBe(false);
  });

  it('renders citation action buttons in fixed priority order', () => {
    const view = render(
      <AiAssistantHubContext.Provider
        value={makeContextValue({
          aiMessages: [
            {
              id: 'ast-1',
              role: 'assistant',
              content: 'reply',
              status: 'done',
              citations: [
                { type: 'pdf', refId: 'pdf-1', label: '文档参考' },
                { type: 'note', refId: 'note-1', label: '笔记参考' },
                { type: 'utterance', refId: 'u-1', label: '句段参考' },
              ],
            },
          ],
        })}
      >
        <AiChatCard embedded />
      </AiAssistantHubContext.Provider>,
    );

    const actionButtons = within(view.container).getAllByRole('button').map((btn) => btn.textContent?.trim() ?? '');
    const copyIndex = actionButtons.indexOf('Copy');
    const uttIndex = actionButtons.indexOf('句段参考');
    const noteIndex = actionButtons.indexOf('笔记参考');
    const pdfIndex = actionButtons.indexOf('文档参考');

    expect(copyIndex).toBeGreaterThanOrEqual(0);
    expect(uttIndex).toBeGreaterThan(copyIndex);
    expect(noteIndex).toBeGreaterThan(uttIndex);
    expect(pdfIndex).toBeGreaterThan(noteIndex);
  });

  it('hides legacy utterance id labels and shows friendly citation text', () => {
    const view = render(
      <AiAssistantHubContext.Provider
        value={makeContextValue({
          aiMessages: [
            {
              id: 'ast-legacy',
              role: 'assistant',
              content: 'reply',
              status: 'done',
              citations: [
                { type: 'utterance', refId: 'utt_1773986765082_joj08x', label: 'utt:utt_1773986765082_joj08x' },
              ],
            },
          ],
        })}
      >
        <AiChatCard embedded />
      </AiAssistantHubContext.Provider>,
    );

    expect(within(view.container).getByRole('button', { name: /句段参考|Utterance Ref/i })).toBeTruthy();
    expect(within(view.container).queryByText('utt:utt_1773986765082_joj08x')).toBeNull();
  });

  it('keeps provider dot idle when connection status is idle even if historical reply exists', () => {
    const view = render(
      <AiAssistantHubContext.Provider
        value={makeContextValue({
          aiChatSettings: normalizeAiChatSettings({ providerKind: 'deepseek' }),
          aiConnectionTestStatus: 'idle',
          aiMessages: [
            {
              id: 'ast-ok',
              role: 'assistant',
              content: '正常回复',
              status: 'done',
            },
          ],
        })}
      >
        <AiChatCard embedded />
      </AiAssistantHubContext.Provider>,
    );

    const statusDot = within(view.container).getByRole('status');
    expect(statusDot.className).toContain('ai-chat-provider-status-dot-idle');
  });

  it('does not show copy button when assistant content is only streaming placeholder', () => {
    const view = render(
      <AiAssistantHubContext.Provider
        value={makeContextValue({
          aiMessages: [
            {
              id: 'ast-streaming',
              role: 'assistant',
              content: '',
              status: 'streaming',
            },
          ],
        })}
      >
        <AiChatCard embedded />
      </AiAssistantHubContext.Provider>,
    );

    expect(within(view.container).queryByRole('button', { name: /复制|Copy/i })).toBeNull();
    expect(within(view.container).getByText('...')).toBeTruthy();
  });
});
