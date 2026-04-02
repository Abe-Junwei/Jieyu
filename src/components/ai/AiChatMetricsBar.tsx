import type { AiInteractionMetrics, AiSessionMemory } from '../../hooks/useAiChat';
import { formatToolName } from './aiChatCardUtils';
import { getAiChatMetricsBarMessages } from '../../i18n/aiChatMetricsBarMessages';

interface AiChatMetricsBarProps {
  isZh: boolean;
  aiInteractionMetrics: AiInteractionMetrics | null | undefined;
  aiSessionMemory: AiSessionMemory | null | undefined;
}

export function AiChatMetricsBar({
  isZh,
  aiInteractionMetrics,
  aiSessionMemory,
}: AiChatMetricsBarProps) {
  if (!aiInteractionMetrics) return null;
  const messages = getAiChatMetricsBarMessages(isZh);

  return (
    <div
      className="ai-chat-metrics-bar"
      style={{
        display: 'flex', gap: 8, flexWrap: 'wrap', padding: '3px 0',
        fontSize: 'calc(10px * var(--ui-font-scale, 1))', color: 'var(--text-secondary)', flexShrink: 0,
      }}
    >
      <span title={messages.turnsTitle}>{messages.turnsLabel} {aiInteractionMetrics.turnCount}</span>
      {aiInteractionMetrics.successCount > 0 && (
        <span style={{ color: 'var(--state-success-text)' }} title={messages.successesTitle}>✓ {aiInteractionMetrics.successCount}</span>
      )}
      {aiInteractionMetrics.failureCount > 0 && (
        <span style={{ color: 'var(--state-danger-solid)' }} title={messages.failuresTitle}>✗ {aiInteractionMetrics.failureCount}</span>
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
        <span style={{ color: 'var(--state-info-solid)' }} title={messages.recoveriesTitle}>{messages.recoveriesLabel} {aiInteractionMetrics.recoveryCount}</span>
      )}
      {aiSessionMemory?.lastToolName && (
        <span style={{ marginLeft: 'auto', fontStyle: 'italic' }} title={messages.lastToolTitle}>
          {formatToolName(isZh, aiSessionMemory.lastToolName)}
        </span>
      )}
    </div>
  );
}
