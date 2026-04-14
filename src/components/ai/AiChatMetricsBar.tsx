import { memo } from 'react';
import type { AiInteractionMetrics, AiSessionMemory } from '../../hooks/useAiChat';
import { formatToolName } from './aiChatCardUtils';
import { getAiChatMetricsBarMessages } from '../../i18n/aiChatMetricsBarMessages';

interface AiChatMetricsBarProps {
  isZh: boolean;
  aiInteractionMetrics: AiInteractionMetrics | null | undefined;
  aiSessionMemory: AiSessionMemory | null | undefined;
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
        <span className="ai-chat-metrics-bar__item ai-chat-metrics-bar__item--success" title={messages.successesTitle}>✓ {aiInteractionMetrics.successCount}</span>
      )}
      {aiInteractionMetrics.failureCount > 0 && (
        <span className="ai-chat-metrics-bar__item ai-chat-metrics-bar__item--failure" title={messages.failuresTitle}>✗ {aiInteractionMetrics.failureCount}</span>
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
        {messages.totalInputTokensLabel} {aiInteractionMetrics.totalInputTokens}
      </span>
      <span title={messages.totalOutputTokensTitle}>
        {messages.totalOutputTokensLabel} {aiInteractionMetrics.totalOutputTokens}
      </span>
      <span title={messages.currentTurnTokensTitle}>
        {messages.currentTurnTokensLabel} {aiInteractionMetrics.currentTurnTokens}
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
