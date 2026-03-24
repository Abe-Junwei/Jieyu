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
        fontSize: 10, color: '#64748b', flexShrink: 0,
      }}
    >
      <span title={isZh ? '对话轮次' : 'Turns'}>{isZh ? '轮次' : 'Turns'} {aiInteractionMetrics.turnCount}</span>
      {aiInteractionMetrics.successCount > 0 && (
        <span style={{ color: '#16a34a' }} title={isZh ? '执行成功' : 'Successes'}>✓ {aiInteractionMetrics.successCount}</span>
      )}
      {aiInteractionMetrics.failureCount > 0 && (
        <span style={{ color: '#dc2626' }} title={isZh ? '执行失败' : 'Failures'}>✗ {aiInteractionMetrics.failureCount}</span>
      )}
      {aiInteractionMetrics.clarifyCount > 0 && (
        <span title={isZh ? '澄清次数' : 'Clarifications'}>{isZh ? '澄清' : 'Clarify'} {aiInteractionMetrics.clarifyCount}</span>
      )}
      {aiInteractionMetrics.cancelCount > 0 && (
        <span title={isZh ? '取消次数' : 'Cancellations'}>{isZh ? '取消' : 'Cancel'} {aiInteractionMetrics.cancelCount}</span>
      )}
      {aiInteractionMetrics.explainFallbackCount > 0 && (
        <span title={isZh ? '解释回退' : 'Explain fallbacks'}>{isZh ? '解释' : 'Explain'} {aiInteractionMetrics.explainFallbackCount}</span>
      )}
      {aiInteractionMetrics.recoveryCount > 0 && (
        <span style={{ color: '#2563eb' }} title={isZh ? '恢复次数' : 'Recoveries'}>{isZh ? '恢复' : 'Recover'} {aiInteractionMetrics.recoveryCount}</span>
      )}
      {aiSessionMemory?.lastToolName && (
        <span style={{ marginLeft: 'auto', fontStyle: 'italic' }} title={isZh ? '上次工具' : 'Last tool'}>
          {formatToolName(isZh, aiSessionMemory.lastToolName)}
        </span>
      )}
    </div>
  );
}
