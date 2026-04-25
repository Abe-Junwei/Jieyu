// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { AiChatCard } from './AiChatCard';
import * as replayUtils from './aiChatReplayUtils';
import { db } from '../../db';
import { normalizeAiChatSettings } from '../../ai/providers/providerCatalog';
import { AiAssistantHubContext, type AiAssistantHubContextValue } from '../../contexts/AiAssistantHubContext';
import { DEFAULT_AI_CHAT_CONTEXT_VALUE } from '../../contexts/AiChatContext';
import { DEFAULT_VOICE_AGENT_CONTEXT_VALUE } from '../../contexts/VoiceAgentContext';
import { pickAiAssistantHubContextValue } from '../../hooks/useAiAssistantHubContextValue';
import { pickAiChatContextValue } from '../../hooks/useAiChatContextValue';
import { pickVoiceAgentContextValue } from '../../hooks/useVoiceAgentContextValue';

const DEFAULT_HUB_VALUE = pickAiAssistantHubContextValue(
  pickAiChatContextValue(DEFAULT_AI_CHAT_CONTEXT_VALUE),
  pickVoiceAgentContextValue(DEFAULT_VOICE_AGENT_CONTEXT_VALUE),
);

function makeContextValue(overrides: Partial<AiAssistantHubContextValue> = {}): AiAssistantHubContextValue {
  return { ...DEFAULT_HUB_VALUE, aiChatEnabled: true, aiProviderLabel: 'Mock Provider', ...overrides };
}

async function clearAuditLogs(): Promise<void> {
  await db.audit_logs.clear();
}

describe('AiChatCard input submit', () => {
  beforeEach(async () => {
    await db.open();
    await clearAuditLogs();
  });

  afterEach(async () => {
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
    const onTestAiConnection = vi.fn(() => new Promise<void>((resolve) => {
      deferred.resolve = resolve;
    }));

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

    const testButton = within(view.container).getByRole('button', { name: /测试连接|test connection/i }) as HTMLButtonElement;
    fireEvent.click(testButton);

    expect(onTestAiConnection).toHaveBeenCalledTimes(1);
    const testingButton = within(view.container).getByRole('button', { name: /测试中|testing/i }) as HTMLButtonElement;
    expect(testingButton.disabled).toBe(true);

    deferred.resolve?.();

    await waitFor(() => {
      const revertedButton = within(view.container).getByRole('button', { name: /测试连接|test connection/i }) as HTMLButtonElement;
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

    expect(within(view.container).getByRole('button', { name: /测试连接|test connection/i })).toBeTruthy();
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

    const passwordInput = view.container.querySelector('input.ai-cfg-input[type="password"]') as HTMLInputElement | null;
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

    const sessionBudgetInput = within(view.container).getByRole('spinbutton', { name: /会话 Token 预算上限|Session token budget/i });
    fireEvent.change(sessionBudgetInput, { target: { value: '18000' } });

    const outputCapInput = within(view.container).getByRole('spinbutton', { name: /^单次输出 Token 封顶$|^Output token cap$/i });
    fireEvent.change(outputCapInput, { target: { value: '512' } });

    const retryCapInput = within(view.container).getByRole('spinbutton', { name: /重试升级 Token 上限|Retry output token cap/i });
    fireEvent.change(retryCapInput, { target: { value: '1024' } });

    expect(onUpdateAiChatSettings).toHaveBeenCalledWith({ sessionTokenBudget: 18000 });
    expect(onUpdateAiChatSettings).toHaveBeenCalledWith({ outputTokenCap: 512 });
    expect(onUpdateAiChatSettings).toHaveBeenCalledWith({ outputTokenRetryCap: 1024 });
  });

  it('renders the recommendation as an in-input ghost suggestion and nowhere else', () => {
    const view = render(
      <AiAssistantHubContext.Provider value={makeContextValue({
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
    expect(view.container.querySelector('.ai-chat-input-ghost-suggestion')?.textContent).toMatch(/row 8/i);
    expect(within(view.container).getByText(/translation layer/i)).toBeTruthy();
    expect(within(view.container).queryByRole('button', { name: /填入输入框|Use suggestion|忽略本条推荐|Dismiss suggestion/i })).toBeNull();
  });

  it('adapts in-input ghost recommendation using prior user prompts instead of only static context rules', () => {
    const view = render(
      <AiAssistantHubContext.Provider value={makeContextValue({
        currentPage: 'transcription',
        selectedUnitKind: 'unit',
        selectedLayerType: 'translation',
        selectedText: '这里是一条待处理的译文',
        aiMessages: [
          { id: 'u2', role: 'user', content: '请比较这两条译文差异并详细说明', status: 'done' },
          { id: 'a1', role: 'assistant', content: 'ok', status: 'done' },
          { id: 'u1', role: 'user', content: '继续复核翻译里的误译和漏译', status: 'done' },
        ],
        aiSessionMemory: {
          adaptiveInputProfile: {
            recentPrompts: ['请比较这两条译文差异并详细说明', '继续复核翻译里的误译和漏译'],
            dominantIntent: 'compare',
            preferredResponseStyle: 'detailed',
            topKeywords: ['译文', '翻译'],
            lastPromptExcerpt: '继续复核翻译里的误译和漏译',
          },
        },
      })}
      >
        <AiChatCard embedded />
      </AiAssistantHubContext.Provider>,
    );

    const ghost = view.container.querySelector('.ai-chat-input-ghost-suggestion');
    expect(ghost).not.toBeNull();
    expect(ghost!.textContent).toContain('recent ask');
    expect(ghost!.textContent).toContain('focus on');
    expect(ghost!.textContent).toContain('译文');
  });

  it('tracks recommendation exposure and exact adoption after Tab accepts suggestion', async () => {
    const onSendAiMessage = vi.fn().mockResolvedValue(undefined);
    const onTrackAiRecommendationEvent = vi.fn();

    const view = render(
      <AiAssistantHubContext.Provider value={makeContextValue({
        currentPage: 'transcription',
        selectedLayerType: 'translation',
        selectedText: '这里是一条待处理的译文',
        onSendAiMessage,
        onTrackAiRecommendationEvent,
      })}
      >
        <AiChatCard embedded />
      </AiAssistantHubContext.Provider>,
    );

    const input = within(view.container).getByRole('textbox') as HTMLInputElement;
    let recommendationPrompt = '';
    await waitFor(() => {
      expect(onTrackAiRecommendationEvent).toHaveBeenCalledWith(expect.objectContaining({
        type: 'shown',
      }));
      recommendationPrompt = (onTrackAiRecommendationEvent.mock.calls.find(
        ([event]) => event?.type === 'shown',
      )?.[0]?.prompt ?? '') as string;
      expect(recommendationPrompt.length).toBeGreaterThan(0);
    });

    fireEvent.keyDown(input, { key: 'Tab', code: 'Tab' });
    expect(input.value).toBe(recommendationPrompt);
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(onSendAiMessage).toHaveBeenCalledWith(recommendationPrompt);
    expect(onTrackAiRecommendationEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'accepted_exact',
      prompt: recommendationPrompt,
    }));
  });

  it('focus click does not auto-apply recommendation text', () => {
    const view = render(
      <AiAssistantHubContext.Provider value={makeContextValue({
        currentPage: 'transcription',
        selectedLayerType: 'translation',
        selectedText: '这里是一条待处理的译文',
      })}
      >
        <AiChatCard embedded />
      </AiAssistantHubContext.Provider>,
    );

    const input = within(view.container).getByRole('textbox') as HTMLInputElement;
    fireEvent.click(input);
    expect(input.value).toBe('');
  });

  it('tracks a fresh shown event when the same recommendation becomes visible again', async () => {
    const onTrackAiRecommendationEvent = vi.fn();

    const view = render(
      <AiAssistantHubContext.Provider value={makeContextValue({
        currentPage: 'transcription',
        selectedLayerType: 'translation',
        selectedText: '这里是一条待处理的译文',
        onTrackAiRecommendationEvent,
      })}
      >
        <AiChatCard embedded />
      </AiAssistantHubContext.Provider>,
    );

    const input = within(view.container).getByRole('textbox') as HTMLInputElement;
    await waitFor(() => {
      expect(onTrackAiRecommendationEvent.mock.calls.filter(([event]) => event?.type === 'shown')).toHaveLength(1);
    });

    const firstPrompt = (onTrackAiRecommendationEvent.mock.calls.find(
      ([event]) => event?.type === 'shown',
    )?.[0]?.prompt ?? '') as string;

    fireEvent.change(input, { target: { value: 'custom draft' } });
    fireEvent.change(input, { target: { value: '' } });

    await waitFor(() => {
      expect(onTrackAiRecommendationEvent.mock.calls.filter(([event]) => event?.type === 'shown')).toHaveLength(2);
    });

    const shownPrompts = onTrackAiRecommendationEvent.mock.calls
      .filter(([event]) => event?.type === 'shown')
      .map(([event]) => event.prompt);
    expect(shownPrompts).toEqual([firstPrompt, firstPrompt]);
  });

  it('applies the visible recommendation with ArrowRight instead of relying on Tab', async () => {
    const view = render(
      <AiAssistantHubContext.Provider value={makeContextValue({
        currentPage: 'transcription',
        selectedLayerType: 'translation',
        selectedText: '这里是一条待处理的译文',
      })}
      >
        <AiChatCard embedded />
      </AiAssistantHubContext.Provider>,
    );

    const input = within(view.container).getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('');
    fireEvent.keyDown(input, { key: 'ArrowRight', code: 'ArrowRight' });

    await waitFor(() => {
      expect(input.value.length).toBeGreaterThan(0);
    });
  });

  it('renders chat metrics bar once even when quick prompt templates are listed', () => {
    const view = render(
      <AiAssistantHubContext.Provider value={makeContextValue({
        aiInteractionMetrics: {
          turnCount: 2,
          successCount: 1,
          failureCount: 0,
          clarifyCount: 0,
          explainFallbackCount: 0,
          cancelCount: 0,
          recoveryCount: 0,
          totalInputTokens: 20,
          totalOutputTokens: 10,
          currentTurnTokens: 8,
        },
      })}
      >
        <AiChatCard embedded />
      </AiAssistantHubContext.Provider>,
    );

    expect(view.container.querySelectorAll('.ai-chat-metrics-bar')).toHaveLength(1);
  });

  it('shows agent loop progress when task session is executing with step metadata', () => {
    const view = render(
      <AiAssistantHubContext.Provider value={makeContextValue({
        aiTaskSession: {
          id: 'task-loop',
          status: 'executing',
          updatedAt: new Date().toISOString(),
          step: 2,
          maxSteps: 6,
        },
      })}
      >
        <AiChatCard embedded />
      </AiAssistantHubContext.Provider>,
    );

    expect(within(view.container).getByText(/Agent loop 2\/6|多步推理 2\/6/)).toBeTruthy();
  });

  it('shows compact task trace items for the latest tool steps', () => {
    const view = render(
      <AiAssistantHubContext.Provider value={makeContextValue({
        aiTaskSession: {
          id: 'task-trace',
          status: 'explaining',
          updatedAt: new Date().toISOString(),
          trace: [
            {
              phase: 'local_tool',
              stepNumber: 1,
              toolName: 'get_project_stats',
              outcome: 'done',
              durationMs: 18,
              timestamp: new Date().toISOString(),
            },
            {
              phase: 'clarify',
              stepNumber: 2,
              toolName: 'search_units',
              outcome: 'clarify',
              errorTaxonomy: 'query_ambiguous',
              timestamp: new Date().toISOString(),
            },
          ],
        },
      })}
      >
        <AiChatCard embedded />
      </AiAssistantHubContext.Provider>,
    );

    expect(within(view.container).getByText(/get_project_stats/)).toBeTruthy();
    expect(within(view.container).getByText(/18ms/)).toBeTruthy();
    expect(within(view.container).getByText(/需澄清|Needs input/i)).toBeTruthy();
  });

  it('renders follow-up chips from the latest local-query frame and sends the selected follow-up', () => {
    const onSendAiMessage = vi.fn().mockResolvedValue(undefined);
    const now = new Date().toISOString();
    const view = render(
      <AiAssistantHubContext.Provider value={makeContextValue({
        onSendAiMessage,
        aiMessages: [
          { id: 'u1', role: 'user', content: '当前范围有多少说话人？', status: 'done' },
          { id: 'a1', role: 'assistant', content: '结论：当前范围共有 3 位说话人。', status: 'done', generationSource: 'local' },
        ],
        aiSessionMemory: {
          localToolState: {
            updatedAt: now,
            lastFrame: {
              domain: 'project_stats',
              questionKind: 'count',
              metric: 'speaker_count',
              scope: 'current_scope',
              updatedAt: now,
            },
          },
        },
      })}
      >
        <AiChatCard embedded />
      </AiAssistantHubContext.Provider>,
    );

    const followUpButton = within(view.container).getByRole('button', { name: /按说话人分别统计|Break down by speaker/i });
    fireEvent.click(followUpButton);
    expect(onSendAiMessage).toHaveBeenCalledWith(expect.stringMatching(/说话人|speaker/i));
  });

  it('does not show stale follow-up chips when the latest assistant reply is not a local-query answer', () => {
    const now = new Date().toISOString();
    const view = render(
      <AiAssistantHubContext.Provider value={makeContextValue({
        aiMessages: [
          { id: 'u1', role: 'user', content: '当前范围有多少说话人？', status: 'done' },
          { id: 'a1', role: 'assistant', content: '结论：当前范围共有 3 位说话人。', status: 'done', generationSource: 'local' },
          { id: 'u2', role: 'user', content: '顺便解释一下这个缩写', status: 'done' },
          { id: 'a2', role: 'assistant', content: '这是一个普通解释回复。', status: 'done', generationSource: 'llm' },
        ],
        aiSessionMemory: {
          localToolState: {
            updatedAt: now,
            lastFrame: {
              domain: 'project_stats',
              questionKind: 'count',
              metric: 'speaker_count',
              scope: 'current_scope',
              updatedAt: now,
            },
          },
        },
      })}
      >
        <AiChatCard embedded />
      </AiAssistantHubContext.Provider>,
    );

    expect(within(view.container).queryByRole('button', { name: /按说话人分别统计|Break down by speaker/i })).toBeNull();
  });

  it('shows stop button while assistant is streaming without persistent hint', () => {
    const onSendAiMessage = vi.fn().mockResolvedValue(undefined);

    const view = render(
      <AiAssistantHubContext.Provider value={makeContextValue({ onSendAiMessage, aiIsStreaming: true })}>
        <AiChatCard embedded />
      </AiAssistantHubContext.Provider>,
    );

    expect(within(view.container).queryByText(/上一条回复仍在生成中|still streaming/i)).toBeNull();
    const stopButton = within(view.container).getByRole('button', { name: /停止|Stop/i }) as HTMLButtonElement;
    expect(stopButton.disabled).toBe(true);
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
    expect(within(view.container).getAllByText(/删除操作确认|destructive action/i).length).toBeGreaterThan(0);
    const sendButton = within(view.container).getByRole('button', { name: /发送|Send/i }) as HTMLButtonElement;
    expect(sendButton.disabled).toBe(true);
  });

  it('shows user-friendly pending target label instead of full internal id', () => {
    const onSendAiMessage = vi.fn().mockResolvedValue(undefined);
    const unitId = 'utt_1773986765082_joj08x';

    const view = render(
      <AiAssistantHubContext.Provider value={makeContextValue({
        onSendAiMessage,
        aiPendingToolCall: {
          call: { name: 'delete_transcription_segment', arguments: { unitId } },
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
    expect(within(view.container).queryByText(unitId)).toBeNull();
    expect(within(view.container).getByRole('button', { name: /确认删除|Confirm Delete/i })).toBeTruthy();
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

  it('renders RAG quick scenario shortcuts and injects the selected-text template into input', () => {
    const view = render(
      <AiAssistantHubContext.Provider
        value={makeContextValue({
          selectedUnit: {
            id: 'utt-quick-1',
            kind: 'unit',
            mediaId: 'media-1',
            layerId: 'layer-1',
            startTime: 1.25,
            endTime: 3.5,
            text: '这是一条待分析句子',
          } as unknown as AiAssistantHubContextValue['selectedUnit'],
        })}
      >
        <AiChatCard embedded />
      </AiAssistantHubContext.Provider>,
    );

    expect(within(view.container).queryByRole('button', { name: /RAG 快捷场景|RAG Quick Scenarios/i })).toBeNull();
    fireEvent.click(within(view.container).getByRole('button', { name: /RAG 问答模板|RAG QA Template/i }));

    const input = within(view.container).getByRole('textbox') as HTMLInputElement;
    expect(input.value).toContain('[RAG_SCENARIO:qa]');
    expect(input.value).toMatch(/问题：这是一条待分析句子|Question: 这是一条待分析句子/);
  });

  it('renders all RAG templates directly without More menu and injects the terminology template', () => {
    const view = render(
      <AiAssistantHubContext.Provider
        value={makeContextValue({
          selectedUnit: {
            id: 'utt-quick-2',
            kind: 'unit',
            mediaId: 'media-1',
            layerId: 'layer-1',
            startTime: 2.5,
            endTime: 4.75,
            text: '关键术语上下文',
          } as unknown as AiAssistantHubContextValue['selectedUnit'],
        })}
      >
        <AiChatCard embedded />
      </AiAssistantHubContext.Provider>,
    );

    expect(within(view.container).queryByRole('button', { name: /更多|More/i })).toBeNull();
    fireEvent.click(within(view.container).getByRole('button', { name: /RAG 术语查证模板|RAG Terminology Template/i }));

    const input = within(view.container).getByRole('textbox') as HTMLInputElement;
    expect(input.value).toContain('[RAG_SCENARIO:terminology]');
    expect(input.value).toMatch(/术语：关键术语上下文|Term: 关键术语上下文/);
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
                { type: 'unit', refId: 'u-1', label: '句段参考' },
              ],
            },
          ],
        })}
      >
        <AiChatCard embedded />
      </AiAssistantHubContext.Provider>,
    );

    const actionButtons = within(view.container).getAllByRole('button');
    const copyIndex = actionButtons.findIndex((btn) => /复制|Copy/i.test(btn.getAttribute('aria-label') ?? ''));
    const uttIndex = actionButtons.findIndex((btn) => (btn.textContent?.trim() ?? '') === '句段参考');
    const noteIndex = actionButtons.findIndex((btn) => (btn.textContent?.trim() ?? '') === '笔记参考');
    const pdfIndex = actionButtons.findIndex((btn) => (btn.textContent?.trim() ?? '') === '文档参考');

    expect(copyIndex).toBeGreaterThanOrEqual(0);
    expect(uttIndex).toBeGreaterThan(copyIndex);
    expect(noteIndex).toBeGreaterThan(uttIndex);
    expect(pdfIndex).toBeGreaterThan(noteIndex);
  });

  it('hides legacy unit id labels and shows friendly citation text', () => {
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
                { type: 'unit', refId: 'utt_1773986765082_joj08x', label: 'utt:utt_1773986765082_joj08x' },
              ],
            },
          ],
        })}
      >
        <AiChatCard embedded />
      </AiAssistantHubContext.Provider>,
    );

    expect(within(view.container).getByRole('button', { name: /语段参照|句段参考|Unit ref|Unit Ref/i })).toBeTruthy();
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

    const statusDot = within(view.container).getAllByRole('status')[0] as HTMLElement;
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

  it('copies assistant content with normalized source footer when citations exist', () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', {
      ...globalThis.navigator,
      clipboard: { writeText },
    });

    const view = render(
      <AiAssistantHubContext.Provider
        value={makeContextValue({
          aiMessages: [
            {
              id: 'ast-copy',
              role: 'assistant',
              content: '回答正文',
              status: 'done',
              citations: [
                { type: 'pdf', refId: 'pdf-1', label: '文档参考', snippet: '\u2067مرحبا\u2069\n  بالعالم' },
              ],
            },
          ],
        })}
      >
        <AiChatCard embedded />
      </AiAssistantHubContext.Provider>,
    );

    fireEvent.click(within(view.container).getByRole('button', { name: /复制|Copy/i }));

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('回答正文'));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('来源:'));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('文档参考: مرحبا بالعالم'));
  });

  it('shows model generated text for llm assistant replies', () => {
    const view = render(
      <AiAssistantHubContext.Provider
        value={makeContextValue({
          aiMessages: [
            {
              id: 'ast-llm',
              role: 'assistant',
              content: '这是大模型回复',
              status: 'done',
              generationSource: 'llm',
              generationModel: 'DeepSeek-Chat',
            },
          ],
        })}
      >
        <AiChatCard embedded />
      </AiAssistantHubContext.Provider>,
    );

    expect(within(view.container).getByText(/DeepSeek-Chat\s+生成|DeepSeek-Chat\s+Generated/i)).toBeTruthy();
  });

  it('does not show model generated text for local assistant replies', () => {
    const view = render(
      <AiAssistantHubContext.Provider
        value={makeContextValue({
          aiMessages: [
            {
              id: 'ast-local',
              role: 'assistant',
              content: '这是本地解析回复',
              status: 'done',
              generationSource: 'local',
            },
          ],
        })}
      >
        <AiChatCard embedded />
      </AiAssistantHubContext.Provider>,
    );

    expect(within(view.container).queryByText(/生成|Generated/i)).toBeNull();
  });

  it('opens replay details for a decision log requestId', async () => {
    const openReplayBundleByRequestIdSpy = vi.spyOn(replayUtils, 'openReplayBundleByRequestId').mockResolvedValue({
      bundle: {
        requestId: 'toolreq_ui_1',
        toolName: 'set_transcription_text',
        replayable: true,
        toolCall: { name: 'set_transcription_text', arguments: { unitId: 'u1', text: 'hello' } },
        context: { userText: '改成 hello' },
        decisions: [
          {
            id: 'decision-ui-1',
            toolName: 'set_transcription_text',
            decision: 'auto_confirmed',
            requestId: 'toolreq_ui_1',
            timestamp: '2026-03-21T15:00:01.000Z',
            source: 'ai',
            executed: true,
            message: '已写入。',
          },
        ],
      },
      errorMessage: null,
      snapshotDiff: null,
    });

    await db.audit_logs.bulkPut([
      {
        id: 'intent-ui-1',
        collection: 'ai_messages',
        documentId: 'msg-ui-1',
        action: 'update' as const,
        field: 'ai_tool_call_intent_assessment',
        oldValue: '',
        newValue: JSON.stringify({ decision: 'execute' }),
        source: 'ai' as const,
        timestamp: '2026-03-21T15:00:00.000Z',
        requestId: 'toolreq_ui_1',
        metadataJson: JSON.stringify({
          schemaVersion: 1,
          phase: 'intent',
          requestId: 'toolreq_ui_1',
          toolCall: { name: 'set_transcription_text', arguments: { unitId: 'u1', text: 'hello' } },
          context: { userText: '改成 hello' },
        }),
      },
      {
        id: 'decision-ui-1',
        collection: 'ai_messages',
        documentId: 'msg-ui-1',
        action: 'update' as const,
        field: 'ai_tool_call_decision',
        oldValue: 'auto:set_transcription_text',
        newValue: 'auto_confirmed:set_transcription_text',
        source: 'ai' as const,
        timestamp: '2026-03-21T15:00:01.000Z',
        requestId: 'toolreq_ui_1',
        metadataJson: JSON.stringify({
          schemaVersion: 1,
          phase: 'decision',
          requestId: 'toolreq_ui_1',
          source: 'ai',
          toolCall: { name: 'set_transcription_text', arguments: { unitId: 'u1', text: 'hello' } },
          context: { userText: '改成 hello' },
          executed: true,
          outcome: 'auto_confirmed',
          message: '已写入。',
        }),
      },
    ]);

    const view = render(
      <AiAssistantHubContext.Provider
        value={makeContextValue({
          aiToolDecisionLogs: [
            {
              id: 'decision-ui-1',
              toolName: 'set_transcription_text',
              decision: 'auto_confirmed',
              requestId: 'toolreq_ui_1',
              timestamp: '2026-03-21T15:00:01.000Z',
            },
          ],
        })}
      >
        <AiChatCard embedded />
      </AiAssistantHubContext.Provider>,
    );

    const decisionPanelToggle = within(view.container).getByRole('button', { name: /AI 决策|AI Decisions/i });
    expect(decisionPanelToggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(decisionPanelToggle);

    fireEvent.click(within(view.container).getByRole('button', { name: /查看\s*回放\s*\/\s*对比|Replay\s*\/\s*Compare/i }));

    await waitFor(() => {
      expect(openReplayBundleByRequestIdSpy).toHaveBeenCalledTimes(1);
    }, { timeout: 3000 });

    await waitFor(() => {
      expect(within(view.container).getByRole('button', { name: /展开详情|Show detail|收起详情|Hide detail/i })).toBeTruthy();
    }, { timeout: 3000 });
    const replayDetailToggle = within(view.container).getByRole('button', { name: /展开详情|Show detail|收起详情|Hide detail/i });
    if (/展开详情|Show detail/i.test(replayDetailToggle.textContent ?? '')) {
      fireEvent.click(replayDetailToggle);
    }

    await waitFor(() => {
      expect(within(view.container).getByText(/回放 \/ 对比|Replay \/ Compare/i)).toBeTruthy();
    }, { timeout: 3000 });

    await waitFor(() => {
      expect(within(view.container).getByText(/决策轨迹|Decision timeline/i)).toBeTruthy();
      expect(within(view.container).getByText(/Golden 快照预览|Golden Snapshot Preview/i)).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('keeps the AI decision panel collapsed by default', () => {
    const view = render(
      <AiAssistantHubContext.Provider
        value={makeContextValue({
          aiToolDecisionLogs: [
            {
              id: 'decision-default-closed-1',
              toolName: 'set_transcription_text',
              decision: 'auto_confirmed',
              requestId: 'toolreq_default_closed_1',
              timestamp: '2026-04-03T12:00:00.000Z',
            },
          ],
        })}
      >
        <AiChatCard embedded />
      </AiAssistantHubContext.Provider>,
    );

    const decisionPanelToggle = within(view.container).getByRole('button', { name: /AI 决策|AI Decisions/i });

    expect(decisionPanelToggle.getAttribute('aria-expanded')).toBe('false');
    expect(within(view.container).queryByRole('button', { name: /查看\s*回放\s*\/\s*对比|Replay\s*\/\s*Compare/i })).toBeNull();

    fireEvent.click(decisionPanelToggle);

    expect(decisionPanelToggle.getAttribute('aria-expanded')).toBe('true');
    expect(within(view.container).getByRole('button', { name: /查看\s*回放\s*\/\s*对比|Replay\s*\/\s*Compare/i })).toBeTruthy();
  });

  it('exports golden snapshot from the decision log entry', async () => {
    await db.audit_logs.bulkPut([
      {
        id: 'intent-ui-export-1',
        collection: 'ai_messages',
        documentId: 'msg-ui-export-1',
        action: 'update' as const,
        field: 'ai_tool_call_intent_assessment',
        oldValue: '',
        newValue: JSON.stringify({ decision: 'execute' }),
        source: 'ai' as const,
        timestamp: '2026-03-21T16:00:00.000Z',
        requestId: 'toolreq_ui_export_1',
        metadataJson: JSON.stringify({
          schemaVersion: 1,
          phase: 'intent',
          requestId: 'toolreq_ui_export_1',
          toolCall: { name: 'set_translation_text', arguments: { unitId: 'u1', layerId: 'trl-1', text: '你好' } },
        }),
      },
      {
        id: 'decision-ui-export-1',
        collection: 'ai_messages',
        documentId: 'msg-ui-export-1',
        action: 'update' as const,
        field: 'ai_tool_call_decision',
        oldValue: 'auto:set_translation_text',
        newValue: 'auto_confirmed:set_translation_text',
        source: 'ai' as const,
        timestamp: '2026-03-21T16:00:01.000Z',
        requestId: 'toolreq_ui_export_1',
        metadataJson: JSON.stringify({
          schemaVersion: 1,
          phase: 'decision',
          requestId: 'toolreq_ui_export_1',
          source: 'ai',
          toolCall: { name: 'set_translation_text', arguments: { unitId: 'u1', layerId: 'trl-1', text: '你好' } },
          executed: true,
          outcome: 'auto_confirmed',
        }),
      },
    ]);

    const createObjectURL = vi.fn(() => 'blob:mock');
    const revokeObjectURL = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    Object.defineProperty(window.URL, 'createObjectURL', { writable: true, value: createObjectURL });
    Object.defineProperty(window.URL, 'revokeObjectURL', { writable: true, value: revokeObjectURL });

    const view = render(
      <AiAssistantHubContext.Provider
        value={makeContextValue({
          aiToolDecisionLogs: [
            {
              id: 'decision-ui-export-1',
              toolName: 'set_translation_text',
              decision: 'auto_confirmed',
              requestId: 'toolreq_ui_export_1',
              timestamp: '2026-03-21T16:00:01.000Z',
            },
          ],
        })}
      >
        <AiChatCard embedded />
      </AiAssistantHubContext.Provider>,
    );

    fireEvent.click(within(view.container).getByRole('button', { name: /AI 决策|AI Decisions/i }));
    fireEvent.click(within(view.container).getByRole('button', { name: /导出快照|Export Snapshot/i }));

    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledTimes(1);
      expect(within(view.container).getByRole('button', { name: /已导出快照|Snapshot Exported/i })).toBeTruthy();
    });
  });

  it('imports a golden snapshot and renders diff panel against live replay bundle', async () => {
    // 写入回放数据 | Populate IndexedDB with replay data
    await db.audit_logs.bulkPut([
      {
        id: 'intent-import-1',
        collection: 'ai_messages',
        documentId: 'msg-import',
        action: 'update' as const,
        field: 'ai_tool_call_intent_assessment',
        oldValue: '',
        newValue: JSON.stringify({ decision: 'execute' }),
        source: 'ai' as const,
        timestamp: '2026-03-21T17:00:00.000Z',
        requestId: 'toolreq_import_1',
        metadataJson: JSON.stringify({
          phase: 'intent',
          requestId: 'toolreq_import_1',
          toolCall: { name: 'set_translation_text', arguments: { unitId: 'u1', layerId: 'trl-1', text: '你好' } },
          context: { userText: '补一条翻译' },
        }),
      },
      {
        id: 'decision-import-1',
        collection: 'ai_messages',
        documentId: 'msg-import',
        action: 'update' as const,
        field: 'ai_tool_call_decision',
        oldValue: '',
        newValue: 'auto_confirmed:set_translation_text',
        source: 'ai' as const,
        timestamp: '2026-03-21T17:00:01.000Z',
        requestId: 'toolreq_import_1',
        metadataJson: JSON.stringify({
          phase: 'decision',
          requestId: 'toolreq_import_1',
          toolCall: { name: 'set_translation_text', arguments: { unitId: 'u1', layerId: 'trl-1', text: '你好' } },
          context: { userText: '补一条翻译' },
          executed: true,
          outcome: 'auto_confirmed',
        }),
      },
    ]);

    // 准备 golden snapshot 内容，与数据库数据一致，diff 应当 matches=true
    // Prepare golden snapshot matching the DB data — diff should report matches=true
    const snapshotPayload = JSON.stringify({
      schemaVersion: 1,
      exportedAt: '2026-03-21T00:00:00.000Z',
      requestId: 'toolreq_import_1',
      toolName: 'set_translation_text',
      replayable: true,
      toolCall: { name: 'set_translation_text', arguments: { unitId: 'u1', layerId: 'trl-1', text: '你好' }, requestId: 'toolreq_import_1' },
      context: { userText: '补一条翻译' },
      latestDecision: { decision: 'auto_confirmed', executed: true, source: 'ai', timestamp: '2026-03-21T17:00:01.000Z' },
      decisions: [{ decision: 'auto_confirmed', executed: true, source: 'ai', timestamp: '2026-03-21T17:00:01.000Z' }],
    });

    // mock FileReader：readAsText 同步触发 onload | Mock FileReader: readAsText calls onload synchronously
    class MockFileReader {
      onload: ((e: { target: { result: string } }) => void) | null = null;
      readAsText(): void {
        this.onload?.({ target: { result: snapshotPayload } });
      }
    }
    vi.stubGlobal('FileReader', MockFileReader);

    const view = render(
      <AiAssistantHubContext.Provider
        value={makeContextValue({
          aiToolDecisionLogs: [
            {
              id: 'decision-import-1',
              toolName: 'set_translation_text',
              decision: 'auto_confirmed',
              requestId: 'toolreq_import_1',
              timestamp: '2026-03-21T17:00:01.000Z',
            },
          ],
        })}
      >
        <AiChatCard embedded />
      </AiAssistantHubContext.Provider>,
    );

    // 打开回放面板（已迁移到语音模块下方的 AI 决策折叠区）
    // Open replay panel from the AI decision section below voice input.
    fireEvent.click(within(view.container).getByRole('button', { name: /AI 决策|AI Decisions/i }));
    fireEvent.click(within(view.container).getByRole('button', { name: /Replay|回放/i }));
    await waitFor(() => {
      expect(within(view.container).getByRole('button', { name: /展开详情|Show detail|收起详情|Hide detail/i })).toBeTruthy();
    });
    const replayDetailToggle = within(view.container).getByRole('button', { name: /展开详情|Show detail|收起详情|Hide detail/i });
    if (/展开详情|Show detail/i.test(replayDetailToggle.textContent ?? '')) {
      fireEvent.click(replayDetailToggle);
    }
    // 模拟选中文件并触发导入 | Simulate file selection and trigger import
    await waitFor(() => {
      expect(document.querySelector('.ai-chat-replay-panel-file-input[type="file"][accept=".json"]')).not.toBeNull();
    });
    const fileInput = document.querySelector('.ai-chat-replay-panel-file-input[type="file"][accept=".json"]') as HTMLInputElement;
    const file = new File([snapshotPayload], 'golden.json', { type: 'application/json' });
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    fireEvent.change(fileInput);

    // 导入流程应完成且输入控件被复位
    await waitFor(() => {
      expect(fileInput.value).toBe('');
      expect(within(view.container).getByText('AI Chat')).toBeTruthy();
    });
  });
});
