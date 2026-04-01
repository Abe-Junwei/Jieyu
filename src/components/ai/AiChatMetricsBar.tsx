import type { AiInteractionMetrics, AiSessionMemory } from '../../hooks/useAiChat';
import { formatToolName } from './aiChatCardUtils';

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

  return (
    <div
      className="ai-chat-metrics-bar"
      style={{
        display: 'flex', gap: 8, flexWrap: 'wrap', padding: '3px 0',
        fontSize: 10, color: 'var(--text-secondary)', flexShrink: 0,
      }}
    >
      <span title={isZh ? '\u5bf9\u8bdd\u8f6e\u6b21' : 'Turns'}>{isZh ? '\u8f6e\u6b21' : 'Turns'} {aiInteractionMetrics.turnCount}</span>
      {aiInteractionMetrics.successCount > 0 && (
        <span style={{ color: 'var(--state-success-text)' }} title={isZh ? '\u6267\u884c\u6210\u529f' : 'Successes'}>✓ {aiInteractionMetrics.successCount}</span>
      )}
      {aiInteractionMetrics.failureCount > 0 && (
        <span style={{ color: 'var(--state-danger-solid)' }} title={isZh ? '\u6267\u884c\u5931\u8d25' : 'Failures'}>✗ {aiInteractionMetrics.failureCount}</span>
      )}
      {aiInteractionMetrics.clarifyCount > 0 && (
        <span title={isZh ? '\u6f84\u6e05\u6b21\u6570' : 'Clarifications'}>{isZh ? '\u6f84\u6e05' : 'Clarify'} {aiInteractionMetrics.clarifyCount}</span>
      )}
      {aiInteractionMetrics.cancelCount > 0 && (
        <span title={isZh ? '\u53d6\u6d88\u6b21\u6570' : 'Cancellations'}>{isZh ? '\u53d6\u6d88' : 'Cancel'} {aiInteractionMetrics.cancelCount}</span>
      )}
      {aiInteractionMetrics.explainFallbackCount > 0 && (
        <span title={isZh ? '\u89e3\u91ca\u56de\u9000' : 'Explain fallbacks'}>{isZh ? '\u89e3\u91ca' : 'Explain'} {aiInteractionMetrics.explainFallbackCount}</span>
      )}
      {aiInteractionMetrics.recoveryCount > 0 && (
        <span style={{ color: 'var(--state-info-solid)' }} title={isZh ? '\u6062\u590d\u6b21\u6570' : 'Recoveries'}>{isZh ? '\u6062\u590d' : 'Recover'} {aiInteractionMetrics.recoveryCount}</span>
      )}
      {aiSessionMemory?.lastToolName && (
        <span style={{ marginLeft: 'auto', fontStyle: 'italic' }} title={isZh ? '\u4e0a\u6b21\u5de5\u5177' : 'Last tool'}>
          {formatToolName(isZh, aiSessionMemory.lastToolName)}
        </span>
      )}
    </div>
  );
}
