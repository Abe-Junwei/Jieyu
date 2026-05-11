// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AiChatCard } from './AiChatCard';
import { db } from '../../db';
import { normalizeAiChatSettings } from '../../ai/providers/providerCatalog';
import {
  AiAssistantHubContext,
  type AiAssistantHubContextValue,
} from '../../contexts/AiAssistantHubContext';
import { DEFAULT_AI_CHAT_CONTEXT_VALUE } from '../../contexts/AiChatContext';
import { DEFAULT_VOICE_AGENT_CONTEXT_VALUE } from '../../contexts/VoiceAgentContext';
import { pickAiAssistantHubContextValue } from '../../hooks/ai/useAiAssistantHubContextValue';
import { pickAiChatContextValue } from '../../hooks/ai/useAiChatContextValue';
import { pickVoiceAgentContextValue } from '../../hooks/voice/useVoiceAgentContextValue';
import { resetAssistantDialogueStateForTests } from '../../services/assistantDialogueState';

const DEFAULT_HUB_VALUE = pickAiAssistantHubContextValue(
  pickAiChatContextValue(DEFAULT_AI_CHAT_CONTEXT_VALUE),
  pickVoiceAgentContextValue(DEFAULT_VOICE_AGENT_CONTEXT_VALUE),
);

function makeContextValue(
  overrides: Partial<AiAssistantHubContextValue> = {},
): AiAssistantHubContextValue {
  return {
    ...DEFAULT_HUB_VALUE,
    aiChatEnabled: true,
    aiProviderLabel: 'Mock Provider',
    ...overrides,
  };
}

async function clearAuditLogs(): Promise<void> {
  await db.audit_logs.clear();
}

describe('AiChatCard input submit', () => {
  beforeEach(async () => {
    resetAssistantDialogueStateForTests();
    await db.open();
    await clearAuditLogs();
  });

  afterEach(async () => {
    resetAssistantDialogueStateForTests();
    await clearAuditLogs();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
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

  it('shows testing label during connection test and reverts to test-connection label afterwards', async () => {
    const deferred = { resolve: null as (() => void) | null };
    const onTestAiConnection = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          deferred.resolve = resolve;
        }),
    );

    const view = render(
      <AiAssistantHubContext.Provider
        value={makeContextValue({
          onTestAiConnection,
          aiChatSettings: normalizeAiChatSettings({ providerKind: 'anthropic' }),
        })}
      >
        <AiChatCard embedded />
      </AiAssistantHubContext.Provider>,
    );

    fireEvent.click(within(view.container).getByRole('button', { name: /配置|config/i }));

    const testButton = within(view.container).getByRole('button', {
      name: /测试连接|test connection/i,
    }) as HTMLButtonElement;
    fireEvent.click(testButton);

    expect(onTestAiConnection).toHaveBeenCalledTimes(1);
    const testingButton = within(view.container).getByRole('button', {
      name: /测试中|testing/i,
    }) as HTMLButtonElement;
    expect(testingButton.disabled).toBe(true);

    deferred.resolve?.();

    await waitFor(() => {
      const revertedButton = within(view.container).getByRole('button', {
        name: /测试连接|test connection/i,
      }) as HTMLButtonElement;
      expect(revertedButton.disabled).toBe(false);
    });
  });

  it('keeps connection button label as test-connection when status is success', () => {
    const view = render(
      <AiAssistantHubContext.Provider
        value={makeContextValue({
          aiConnectionTestStatus: 'success',
          aiChatSettings: normalizeAiChatSettings({ providerKind: 'anthropic' }),
        })}
      >
        <AiChatCard embedded />
      </AiAssistantHubContext.Provider>,
    );

    fireEvent.click(within(view.container).getByRole('button', { name: /配置|config/i }));

    expect(
      within(view.container).getByRole('button', { name: /测试连接|test connection/i }),
    ).toBeTruthy();
    expect(within(view.container).queryByRole('button', { name: /已连接|connected/i })).toBeNull();
  });

  it('renders provider password input inside a non-submitting form container', () => {
    const view = render(
      <AiAssistantHubContext.Provider
        value={makeContextValue({
          aiChatSettings: normalizeAiChatSettings({ providerKind: 'anthropic' }),
        })}
      >
        <AiChatCard embedded />
      </AiAssistantHubContext.Provider>,
    );

    fireEvent.click(within(view.container).getByRole('button', { name: /配置|config/i }));

    const passwordInput = view.container.querySelector(
      'input.ai-cfg-input[type="password"]',
    ) as HTMLInputElement | null;
    expect(passwordInput).toBeTruthy();
    expect(passwordInput?.closest('form')).toBeTruthy();
  });

  it('updates cost guard settings from provider config numeric inputs', () => {
    const onUpdateAiChatSettings = vi.fn();
    const view = render(
      <AiAssistantHubContext.Provider
        value={makeContextValue({
          onUpdateAiChatSettings,
          aiChatSettings: normalizeAiChatSettings({ providerKind: 'deepseek' }),
        })}
      >
        <AiChatCard embedded />
      </AiAssistantHubContext.Provider>,
    );

    fireEvent.click(within(view.container).getByRole('button', { name: /配置|config/i }));

    const sessionBudgetInput = within(view.container).getByRole('spinbutton', {
      name: /会话 Token 预算上限|Session token budget/i,
    });
    fireEvent.change(sessionBudgetInput, { target: { value: '18000' } });

    const outputCapInput = within(view.container).getByRole('spinbutton', {
      name: /^单次输出 Token 封顶$|^Output token cap$/i,
    });
    fireEvent.change(outputCapInput, { target: { value: '512' } });

    const retryCapInput = within(view.container).getByRole('spinbutton', {
      name: /重试升级 Token 上限|Retry output token cap/i,
    });
    fireEvent.change(retryCapInput, { target: { value: '1024' } });

    expect(onUpdateAiChatSettings).toHaveBeenCalledWith({ sessionTokenBudget: 18000 });
    expect(onUpdateAiChatSettings).toHaveBeenCalledWith({ outputTokenCap: 512 });
    expect(onUpdateAiChatSettings).toHaveBeenCalledWith({ outputTokenRetryCap: 1024 });
  });

  it('renders the recommendation as an in-input ghost suggestion and nowhere else', () => {
    const view = render(
      <AiAssistantHubContext.Provider
        value={makeContextValue({
          currentPage: 'transcription',
          selectedUnitKind: 'unit',
          selectedLayerType: 'translation',
          selectedText: '这是一条需要补充说明的译文',
          selectedTimeRangeLabel: '00:12-00:15',
          selectedRowMeta: { rowNumber: 8, start: 12, end: 15 },
        })}
      >
        <AiChatCard embedded />
      </AiAssistantHubContext.Provider>,
    );

    const input = within(view.container).getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('');
    expect(input.placeholder).toBe('');
    expect(view.container.querySelector('.ai-chat-input-ghost-suggestion')?.textContent).toMatch(
      /row 8/i,
    );
    expect(within(view.container).getByText(/translation layer/i)).toBeTruthy();
    expect(
      within(view.container).queryByRole('button', {
        name: /填入输入框|Use suggestion|忽略本条推荐|Dismiss suggestion/i,
      }),
    ).toBeNull();
  });

  it('renders pinned summary under user bubble and allows quick unpin', () => {
    const onToggleAiMessagePin = vi.fn();
    const view = render(
      <AiAssistantHubContext.Provider
        value={makeContextValue({
          aiMessages: [
            { id: 'usr-pin-1', role: 'user', content: '请记住：回答尽量简洁', status: 'done' },
          ],
          aiSessionMemory: {
            pinnedMessageIds: ['usr-pin-1'],
            pinnedMessageDigests: [
              {
                messageId: 'usr-pin-1',
                role: 'user',
                content: '请记住：回答尽量简洁',
                createdAt: '2026-04-25T12:00:00.000Z',
              },
            ],
          },
          onToggleAiMessagePin,
        })}
      >
        <AiChatCard embedded />
      </AiAssistantHubContext.Provider>,
    );

    expect(within(view.container).queryByText(/已钉住消息|Pinned messages/i)).toBeNull();
    const pinnedSummaryText = view.container.querySelector('.ai-chat-pinned-summary-text');
    expect((pinnedSummaryText?.textContent ?? '').trim().length).toBeGreaterThan(0);
    const pinnedSummaryPanel = view.container.querySelector(
      '.ai-chat-pinned-summary-panel',
    ) as HTMLElement | null;
    expect(pinnedSummaryPanel).toBeTruthy();
    fireEvent.click(
      within(pinnedSummaryPanel as HTMLElement).getByRole('button', { name: /取消钉住|Unpin/i }),
    );
    expect(onToggleAiMessagePin).toHaveBeenCalledWith('usr-pin-1');
  });

  it('renders directive console MVP and allows deactivating one directive', () => {
    const onDeactivateAiSessionDirective = vi.fn();
    const onPruneAiSessionDirectivesBySourceMessage = vi.fn();
    const view = render(
      <AiAssistantHubContext.Provider
        value={makeContextValue({
          aiSessionMemory: {
            directiveLedger: [
              {
                id: 'dir-1',
                category: 'response',
                scope: 'long_term',
                text: '请用英文回答',
                action: 'accepted',
                source: 'user_explicit',
                confidence: 0.9,
                createdAt: '2026-04-25T12:00:00.000Z',
              },
              {
                id: 'dir-2',
                category: 'response',
                scope: 'long_term',
                text: '继续使用英文',
                action: 'accepted',
                source: 'pinned_message',
                confidence: 0.9,
                createdAt: '2026-04-25T12:00:00.000Z',
                sourceMessageId: 'pin-msg-1',
              },
            ],
          },
          onDeactivateAiSessionDirective,
          onPruneAiSessionDirectivesBySourceMessage,
        })}
      >
        <AiChatCard embedded />
      </AiAssistantHubContext.Provider>,
    );

    const consolePanel = within(view.container).getByTestId('ai-directive-console-mvp');
    expect(within(consolePanel).getByText(/请用英文回答/)).toBeTruthy();
    expect(within(consolePanel).getAllByText('[response]').length).toBeGreaterThan(0);
    const sourceFilter = within(consolePanel).getByRole('combobox', {
      name: /指令来源筛选|Directive source filter/i,
    });
    fireEvent.change(sourceFilter, { target: { value: 'pinned_message' } });
    expect(within(consolePanel).queryByText(/请用英文回答/)).toBeNull();
    expect(within(consolePanel).getByText(/继续使用英文/)).toBeTruthy();
    const pruneBtn = within(consolePanel).getByRole('button', { name: /同源清理|Prune source/i });
    fireEvent.click(pruneBtn);
    expect(onPruneAiSessionDirectivesBySourceMessage).toHaveBeenCalledWith('pin-msg-1');
    const deactivateBtn = within(consolePanel).getByRole('button', { name: /停用|Deactivate/i });
    fireEvent.click(deactivateBtn);
    expect(onDeactivateAiSessionDirective).toHaveBeenCalledWith('dir-2');
  });
});
