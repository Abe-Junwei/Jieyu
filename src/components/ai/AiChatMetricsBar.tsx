import { memo } from 'react';
import type { AiInteractionMetrics, AiSessionMemory } from '../../hooks/useAiChat';
import { formatToolName } from './aiChatCardUtils';
import { getAiChatMetricsBarMessages } from '../../i18n/messages';
import { CheckIcon, CrossIcon } from '../SvgIcons';

interface AiChatMetricsBarProps {
  isZh: boolean;
  aiInteractionMetrics: AiInteractionMetrics | null | undefined;
  aiSessionMemory: AiSessionMemory | null | undefined;
}

function formatMetricValue(value: number, available: boolean | undefined): string {
  return available ? String(value) : '—';
}

export const AiChatMetricsBar = memo(function AiChatMetricsBar({
  isZh,
  aiInteractionMetrics,
  aiSessionMemory,
}: AiChatMetricsBarProps) {
  if (!aiInteractionMetrics) return null;
  const messages = getAiChatMetricsBarMessages(isZh);
  const lastToolName = aiSessionMemory?.preferences?.lastToolName ?? aiSessionMemory?.lastToolName;

  return (
    <div className="ai-chat-metrics-bar">
      <span title={messages.turnsTitle}>{messages.turnsLabel} {aiInteractionMetrics.turnCount}</span>
      {aiInteractionMetrics.successCount > 0 && (
        <span className="ai-chat-metrics-bar__item ai-chat-metrics-bar__item--success" title={messages.successesTitle}><CheckIcon className="ai-chat-metrics-bar__icon" /> {aiInteractionMetrics.successCount}</span>
      )}
      {aiInteractionMetrics.failureCount > 0 && (
        <span className="ai-chat-metrics-bar__item ai-chat-metrics-bar__item--failure" title={messages.failuresTitle}><CrossIcon className="ai-chat-metrics-bar__icon" /> {aiInteractionMetrics.failureCount}</span>
      )}
      {aiInteractionMetrics.clarifyCount > 0 && (
        <span title={messages.clarificationsTitle}>{messages.clarificationsLabel} {aiInteractionMetrics.clarifyCount}</span>
      )}
      {aiInteractionMetrics.cancelCount > 0 && (
        <span title={messages.cancellationsTitle}>{messages.cancellationsLabel} {aiInteractionMetrics.cancelCount}</span>
      )}
      {aiInteractionMetrics.explainFallbackCount > 0 && (
        <span title={messages.explainFallbacksTitle}>{messages.explainFallbacksLabel} {aiInteractionMetrics.explainFallbackCount}</span>
      )}
      {aiInteractionMetrics.recoveryCount > 0 && (
        <span className="ai-chat-metrics-bar__item ai-chat-metrics-bar__item--recovery" title={messages.recoveriesTitle}>{messages.recoveriesLabel} {aiInteractionMetrics.recoveryCount}</span>
      )}
      <span title={messages.totalInputTokensTitle}>
        {messages.totalInputTokensLabel} {formatMetricValue(aiInteractionMetrics.totalInputTokens, aiInteractionMetrics.totalInputTokensAvailable)}
      </span>
      <span title={messages.totalOutputTokensTitle}>
        {messages.totalOutputTokensLabel} {formatMetricValue(aiInteractionMetrics.totalOutputTokens, aiInteractionMetrics.totalOutputTokensAvailable)}
      </span>
      <span title={messages.currentTurnTokensTitle}>
        {messages.currentTurnTokensLabel} {formatMetricValue(aiInteractionMetrics.currentTurnTokens, aiInteractionMetrics.currentTurnTokensAvailable)}
      </span>
      {lastToolName && (
        <span className="ai-chat-metrics-bar__last-tool" title={messages.lastToolTitle}>
          {formatToolName(isZh, lastToolName)}
        </span>
      )}
    </div>
  );
});

AiChatMetricsBar.displayName = 'AiChatMetricsBar';
