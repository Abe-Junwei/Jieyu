import type { AiChatContextValue } from '../contexts/AiChatContext';
import { normalizeLocale, t, tf } from '../i18n';

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

function formatToolName(toolName: string | undefined, locale: 'zh-CN' | 'en-US'): string {
  if (!toolName) return t(locale, 'transcription.assistant.toolUnknown');
  return toolName
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatTaskStatus(status: string | undefined, locale: 'zh-CN' | 'en-US'): string {
  switch (status) {
    case 'waiting_clarify':
      return t(locale, 'transcription.assistant.taskStatus.waitingClarify');
    case 'waiting_confirm':
      return t(locale, 'transcription.assistant.taskStatus.waitingConfirm');
    case 'executing':
      return t(locale, 'transcription.assistant.taskStatus.executing');
    case 'explaining':
      return t(locale, 'transcription.assistant.taskStatus.explaining');
    case 'idle':
    default:
      return t(locale, 'transcription.assistant.taskStatus.idle');
  }
}

function pushChip(chips: string[], value: string | null | undefined) {
  if (!value || chips.includes(value)) return;
  chips.push(value);
}

export function buildTranscriptionAssistantStatusSummary(
  input: BuildTranscriptionAssistantStatusSummaryInput,
): TranscriptionAssistantStatusSummary {
  const locale = normalizeLocale(input.locale) ?? 'zh-CN';
  const pendingToolCall = input.aiChatContextValue.aiPendingToolCall;
  const taskSession = input.aiChatContextValue.aiTaskSession;
  const metrics = input.aiChatContextValue.aiInteractionMetrics;
  const decisionLogs = input.aiChatContextValue.aiToolDecisionLogs ?? [];
  const sidebarError = input.aiSidebarError?.trim() ?? '';
  const chips: string[] = [];

  if (pendingToolCall) {
    pushChip(chips, tf(locale, 'transcription.assistant.chip.tool', {
      tool: formatToolName(pendingToolCall.call.name, locale),
    }));
    pushChip(chips, pendingToolCall.previewContract
      ? tf(locale, 'transcription.assistant.chip.affects', {
        count: pendingToolCall.previewContract.affectedCount,
      })
      : null);
    pushChip(chips, input.selectedTranslationGapCount > 0
      ? tf(locale, 'transcription.assistant.chip.gaps', { count: input.selectedTranslationGapCount })
      : null);
    return {
      tone: 'warning',
      headline: t(locale, 'transcription.assistant.headline.pendingConfirmation'),
      detail: pendingToolCall.riskSummary?.trim() || tf(locale, 'transcription.assistant.detail.pendingConfirmation', {
        tool: formatToolName(pendingToolCall.call.name, locale),
      }),
      chips,
    };
  }

  if (sidebarError) {
    pushChip(chips, decisionLogs.length > 0
      ? tf(locale, 'transcription.assistant.chip.decisions', { count: decisionLogs.length })
      : null);
    pushChip(chips, input.selectedAiWarning ? t(locale, 'transcription.assistant.chip.selectionNeedsReview') : null);
    return {
      tone: 'error',
      headline: t(locale, 'transcription.assistant.headline.issue'),
      detail: sidebarError,
      chips,
    };
  }

  if (taskSession && taskSession.status !== 'idle') {
    pushChip(chips, tf(locale, 'transcription.assistant.chip.task', {
      status: formatTaskStatus(taskSession.status, locale),
    }));
    pushChip(chips, taskSession.toolName
      ? tf(locale, 'transcription.assistant.chip.tool', { tool: formatToolName(taskSession.toolName, locale) })
      : null);
    pushChip(chips, (taskSession.candidates?.length ?? 0) > 0
      ? tf(locale, 'transcription.assistant.chip.options', { count: taskSession.candidates?.length ?? 0 })
      : null);
    pushChip(chips, input.selectedTranslationGapCount > 0
      ? tf(locale, 'transcription.assistant.chip.gaps', { count: input.selectedTranslationGapCount })
      : null);
    return {
      tone: taskSession.status === 'executing' || taskSession.status === 'explaining' ? 'active' : 'warning',
      headline: t(locale, 'transcription.assistant.headline.taskInProgress'),
      detail: `${formatTaskStatus(taskSession.status, locale)}${taskSession.toolName ? ` · ${formatToolName(taskSession.toolName, locale)}` : ''}`,
      chips,
    };
  }

  if (input.selectedAiWarning || input.selectedTranslationGapCount > 0) {
    pushChip(chips, input.selectedAiWarning ? t(locale, 'transcription.assistant.chip.selectionNeedsReview') : null);
    pushChip(chips, input.selectedTranslationGapCount > 0
      ? tf(locale, 'transcription.assistant.chip.gaps', { count: input.selectedTranslationGapCount })
      : null);
    pushChip(chips, decisionLogs.length > 0
      ? tf(locale, 'transcription.assistant.chip.decisions', { count: decisionLogs.length })
      : null);
    return {
      tone: 'warning',
      headline: t(locale, 'transcription.assistant.headline.selectionNeedsAttention'),
      detail: input.selectedTranslationGapCount > 0
        ? t(locale, 'transcription.assistant.detail.selectionHasGaps')
        : t(locale, 'transcription.assistant.detail.selectionHasRisk'),
      chips,
    };
  }

  if (metrics && (metrics.turnCount > 0 || decisionLogs.length > 0)) {
    pushChip(chips, tf(locale, 'transcription.assistant.chip.turns', { count: metrics.turnCount }));
    pushChip(chips, metrics.successCount > 0
      ? tf(locale, 'transcription.assistant.chip.success', { count: metrics.successCount })
      : null);
    pushChip(chips, metrics.failureCount > 0
      ? tf(locale, 'transcription.assistant.chip.failure', { count: metrics.failureCount })
      : null);
    pushChip(chips, decisionLogs.length > 0
      ? tf(locale, 'transcription.assistant.chip.decisions', { count: decisionLogs.length })
      : null);
    return {
      tone: 'active',
      headline: t(locale, 'transcription.assistant.headline.active'),
      detail: t(locale, 'transcription.assistant.detail.active'),
      chips,
    };
  }

  return {
    tone: 'idle',
    headline: t(locale, 'transcription.assistant.headline.ready'),
    detail: t(locale, 'transcription.assistant.detail.ready'),
    chips: [],
  };
}
