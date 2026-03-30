import type { AiChatContextValue } from '../contexts/AiChatContext';

type AssistantStatusTone = 'idle' | 'active' | 'warning' | 'error';

export interface TranscriptionAssistantStatusSummary {
  tone: AssistantStatusTone;
  headline: string;
  detail: string;
  chips: string[];
}

interface BuildTranscriptionAssistantStatusSummaryInput {
  locale: string;
  aiChatContextValue: Pick<AiChatContextValue, 'aiPendingToolCall' | 'aiTaskSession' | 'aiInteractionMetrics' | 'aiToolDecisionLogs'>;
  selectedAiWarning: boolean;
  selectedTranslationGapCount: number;
  aiSidebarError: string | null;
}

function isZh(locale: string): boolean {
  return locale === 'zh-CN';
}

function formatToolName(toolName: string | undefined, zh: boolean): string {
  if (!toolName) return zh ? '未指定工具' : 'Unknown tool';
  return toolName
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatTaskStatus(status: string | undefined, zh: boolean): string {
  switch (status) {
    case 'waiting_clarify':
      return zh ? '等待澄清' : 'Waiting for clarification';
    case 'waiting_confirm':
      return zh ? '等待确认' : 'Waiting for confirmation';
    case 'executing':
      return zh ? '执行中' : 'Executing';
    case 'explaining':
      return zh ? '解释中' : 'Explaining';
    case 'idle':
    default:
      return zh ? '空闲' : 'Idle';
  }
}

function pushChip(chips: string[], value: string | null | undefined) {
  if (!value || chips.includes(value)) return;
  chips.push(value);
}

export function buildTranscriptionAssistantStatusSummary(
  input: BuildTranscriptionAssistantStatusSummaryInput,
): TranscriptionAssistantStatusSummary {
  const zh = isZh(input.locale);
  const pendingToolCall = input.aiChatContextValue.aiPendingToolCall;
  const taskSession = input.aiChatContextValue.aiTaskSession;
  const metrics = input.aiChatContextValue.aiInteractionMetrics;
  const decisionLogs = input.aiChatContextValue.aiToolDecisionLogs ?? [];
  const sidebarError = input.aiSidebarError?.trim() ?? '';
  const chips: string[] = [];

  if (pendingToolCall) {
    pushChip(chips, `${zh ? '工具' : 'Tool'}: ${formatToolName(pendingToolCall.call.name, zh)}`);
    pushChip(chips, pendingToolCall.previewContract
      ? `${zh ? '影响' : 'Affects'} ${pendingToolCall.previewContract.affectedCount}`
      : null);
    pushChip(chips, input.selectedTranslationGapCount > 0
      ? `${zh ? '待补翻译' : 'Gaps'} ${input.selectedTranslationGapCount}`
      : null);
    return {
      tone: 'warning',
      headline: zh ? '待确认操作' : 'Pending confirmation',
      detail: pendingToolCall.riskSummary?.trim() || `${formatToolName(pendingToolCall.call.name, zh)} ${zh ? '等待用户确认。' : 'is waiting for confirmation.'}`,
      chips,
    };
  }

  if (sidebarError) {
    pushChip(chips, decisionLogs.length > 0 ? `${zh ? '决策日志' : 'Decisions'} ${decisionLogs.length}` : null);
    pushChip(chips, input.selectedAiWarning ? (zh ? '当前选中待复核' : 'Selection needs review') : null);
    return {
      tone: 'error',
      headline: zh ? '助手异常' : 'Assistant issue',
      detail: sidebarError,
      chips,
    };
  }

  if (taskSession && taskSession.status !== 'idle') {
    pushChip(chips, `${zh ? '任务' : 'Task'}: ${formatTaskStatus(taskSession.status, zh)}`);
    pushChip(chips, taskSession.toolName ? `${zh ? '工具' : 'Tool'}: ${formatToolName(taskSession.toolName, zh)}` : null);
    pushChip(chips, (taskSession.candidates?.length ?? 0) > 0 ? `${zh ? '候选' : 'Options'} ${taskSession.candidates?.length ?? 0}` : null);
    pushChip(chips, input.selectedTranslationGapCount > 0 ? `${zh ? '待补翻译' : 'Gaps'} ${input.selectedTranslationGapCount}` : null);
    return {
      tone: taskSession.status === 'executing' || taskSession.status === 'explaining' ? 'active' : 'warning',
      headline: zh ? '任务进行中' : 'Task in progress',
      detail: `${formatTaskStatus(taskSession.status, zh)}${taskSession.toolName ? ` · ${formatToolName(taskSession.toolName, zh)}` : ''}`,
      chips,
    };
  }

  if (input.selectedAiWarning || input.selectedTranslationGapCount > 0) {
    pushChip(chips, input.selectedAiWarning ? (zh ? '当前选中待复核' : 'Selection needs review') : null);
    pushChip(chips, input.selectedTranslationGapCount > 0 ? `${zh ? '待补翻译' : 'Gaps'} ${input.selectedTranslationGapCount}` : null);
    pushChip(chips, decisionLogs.length > 0 ? `${zh ? '决策日志' : 'Decisions'} ${decisionLogs.length}` : null);
    return {
      tone: 'warning',
      headline: zh ? '建议优先处理当前选中' : 'Selection needs attention',
      detail: input.selectedTranslationGapCount > 0
        ? (zh ? '当前选中仍有翻译缺口，可先补齐再继续后续操作。' : 'The current selection still has translation gaps to fill.')
        : (zh ? '当前选中存在 AI 风险信号，建议先复核。' : 'The current selection has AI risk signals and should be reviewed first.'),
      chips,
    };
  }

  if (metrics && (metrics.turnCount > 0 || decisionLogs.length > 0)) {
    pushChip(chips, `${zh ? '轮次' : 'Turns'} ${metrics.turnCount}`);
    pushChip(chips, metrics.successCount > 0 ? `${zh ? '成功' : 'Success'} ${metrics.successCount}` : null);
    pushChip(chips, metrics.failureCount > 0 ? `${zh ? '失败' : 'Failure'} ${metrics.failureCount}` : null);
    pushChip(chips, decisionLogs.length > 0 ? `${zh ? '决策日志' : 'Decisions'} ${decisionLogs.length}` : null);
    return {
      tone: 'active',
      headline: zh ? '助手已接管主流程' : 'Assistant is active',
      detail: zh ? '任务、决策与结果写回已进入可追踪状态。' : 'Task flow, decisions, and write-back are being tracked.',
      chips,
    };
  }

  return {
    tone: 'idle',
    headline: zh ? '助手待命' : 'Assistant ready',
    detail: zh ? '可以直接发起 AI、语音或检索主流程。' : 'AI, voice, and retrieval flows are ready to use.',
    chips: [],
  };
}
