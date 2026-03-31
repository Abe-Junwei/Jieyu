// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { AiChatCard } from './AiChatCard';
import { db } from '../../db';
import { normalizeAiChatSettings } from '../../ai/providers/providerCatalog';
import {
  AiAssistantHubContext,
  type AiAssistantHubContextValue,
} from '../../contexts/AiAssistantHubContext';
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
    expect(within(view.container).getByText(/删除操作确认|destructive action/i)).toBeTruthy();
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
          selectedUtterance: {
            id: 'utt-quick-1',
            startTime: 1.25,
            endTime: 3.5,
            transcription: { default: '这是一条待分析句子' },
          } as unknown as AiAssistantHubContextValue['selectedUtterance'],
        })}
      >
        <AiChatCard embedded />
      </AiAssistantHubContext.Provider>,
    );

    expect(within(view.container).getByText(/RAG 快捷场景|RAG Quick Scenarios/i)).toBeTruthy();

    fireEvent.click(within(view.container).getByRole('button', { name: 'RAG 问答模板' }));

    const input = within(view.container).getByRole('textbox') as HTMLInputElement;
    expect(input.value).toContain('[RAG_SCENARIO:qa]');
    expect(input.value).toContain('问题：这是一条待分析句子');
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
          toolCall: { name: 'set_transcription_text', arguments: { utteranceId: 'u1', text: 'hello' } },
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
          toolCall: { name: 'set_transcription_text', arguments: { utteranceId: 'u1', text: 'hello' } },
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

    fireEvent.click(within(view.container).getByRole('button', { name: /查看回放\/对比|Replay \/ Compare/i }));
    await waitFor(() => {
      expect(within(view.container).getByRole('button', { name: /展开详情|Show detail|收起详情|Hide detail/i })).toBeTruthy();
    }, { timeout: 3000 });
    const replayDetailToggle = within(view.container).getByRole('button', { name: /展开详情|Show detail|收起详情|Hide detail/i });
    if (/展开详情|Show detail/i.test(replayDetailToggle.textContent ?? '')) {
      fireEvent.click(replayDetailToggle);
    }

    await waitFor(() => {
      expect(within(view.container).getByText(/回放 \/ 对比|Replay \/ Compare/i)).toBeTruthy();
      expect(within(view.container).getByText(/决策轨迹|Decision timeline/i)).toBeTruthy();
      expect(within(view.container).getByText(/Golden 快照预览|Golden Snapshot Preview/i)).toBeTruthy();
    }, { timeout: 3000 });
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
          toolCall: { name: 'set_translation_text', arguments: { utteranceId: 'u1', layerId: 'trl-1', text: '你好' } },
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
          toolCall: { name: 'set_translation_text', arguments: { utteranceId: 'u1', layerId: 'trl-1', text: '你好' } },
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
          toolCall: { name: 'set_translation_text', arguments: { utteranceId: 'u1', layerId: 'trl-1', text: '你好' } },
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
          toolCall: { name: 'set_translation_text', arguments: { utteranceId: 'u1', layerId: 'trl-1', text: '你好' } },
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
      toolCall: { name: 'set_translation_text', arguments: { utteranceId: 'u1', layerId: 'trl-1', text: '你好' }, requestId: 'toolreq_import_1' },
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
    fireEvent.click(within(view.container).getByRole('button', { name: /Replay|回放/i }));
    await waitFor(() => {
      expect(within(view.container).getByRole('button', { name: /展开详情|Show detail|收起详情|Hide detail/i })).toBeTruthy();
    });
    const replayDetailToggle = within(view.container).getByRole('button', { name: /展开详情|Show detail|收起详情|Hide detail/i });
    if (/展开详情|Show detail/i.test(replayDetailToggle.textContent ?? '')) {
      fireEvent.click(replayDetailToggle);
    }
    // 模拟选中文件并触发导入 | Simulate file selection and trigger import
    const fileInput = view.container.querySelector('input[type="file"][accept=".json"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();
    const file = new File([snapshotPayload], 'golden.json', { type: 'application/json' });
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    fireEvent.change(fileInput);

    // diff 面板应当出现，且 matches=true
    await waitFor(() => {
      expect(within(view.container).getByText(/Snapshot Diff|快照对比/i)).toBeTruthy();
      expect(within(view.container).getByText(/✓ Matches|✓ 一致/i)).toBeTruthy();
    });
  });
});
