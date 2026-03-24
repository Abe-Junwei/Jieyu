import type { PendingAiToolCall } from '../../hooks/useAiChat';
import {
  formatPendingConfirmActionLabel,
  formatPendingTarget,
  formatToolName,
  normalizeImpactPreviewLines,
} from './aiChatCardUtils';

interface AiChatAlertsPanelProps {
  isZh: boolean;
  errorWarningText: string;
  dismissedErrorWarning: boolean;
  alertCount: number;
  debugUiShowAll: boolean;
  showAlertBar: boolean;
  aiPendingToolCall: PendingAiToolCall | null | undefined;
  onDismissErrorWarning: () => void;
  onToggleAlertBar: () => void;
  onConfirmPendingToolCall?: (() => Promise<void>) | undefined;
  onCancelPendingToolCall?: (() => Promise<void>) | undefined;
}

export function AiChatAlertsPanel({
  isZh,
  errorWarningText,
  dismissedErrorWarning,
  alertCount,
  debugUiShowAll,
  showAlertBar,
  aiPendingToolCall,
  onDismissErrorWarning,
  onToggleAlertBar,
  onConfirmPendingToolCall,
  onCancelPendingToolCall,
}: AiChatAlertsPanelProps) {
  const hasToolPending = !!aiPendingToolCall;

  return (
    <>
      {errorWarningText && !dismissedErrorWarning && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '6px 8px',
          borderRadius: 8,
          border: '1px solid rgba(245, 158, 11, 0.4)',
          background: 'rgba(255, 251, 235, 0.9)',
          color: '#92400e',
          fontSize: 11,
        }}>
          <span>{errorWarningText}</span>
          <button
            type="button"
            className="icon-btn"
            style={{ height: 22, minWidth: 54, fontSize: 10 }}
            onClick={onDismissErrorWarning}
          >
            {isZh ? '清除' : 'Dismiss'}
          </button>
        </div>
      )}

      {(alertCount > 0 || debugUiShowAll) && (
        <div style={{ borderTop: '1px solid rgba(148,163,184,0.15)', flexShrink: 0 }}>
          <button
            type="button"
            onClick={onToggleAlertBar}
            style={{
              width: '100%', background: 'none', border: 'none', padding: '5px 10px',
              display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
              fontSize: 11, color: '#92400e',
            }}
          >
            <span style={{ fontSize: 14 }}>{hasToolPending ? '⚡' : '📋'}</span>
            <span style={{ flex: 1, textAlign: 'left' }}>
              {hasToolPending && ` ${isZh ? '待确认工具调用' : 'Tool call pending'}`}
              {debugUiShowAll && !hasToolPending && ` ${isZh ? '演示：告警详情区' : 'Demo: alert details'}`}
            </span>
            <span style={{ fontSize: 10, opacity: 0.6 }}>{showAlertBar ? (isZh ? '▲ 收起' : '▲ Hide') : (isZh ? '▼ 展开' : '▼ Expand')}</span>
          </button>

          {showAlertBar && (
            <div style={{ padding: '0 10px 8px', display: 'grid', gap: 6 }}>
              {aiPendingToolCall && (
                <div style={{ border: '1px solid #f59e0b', background: '#fffbeb', borderRadius: 6, padding: '6px 8px', display: 'grid', gap: 4 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#92400e' }}>{isZh ? '⚡ 删除操作确认' : '⚡ Confirm Destructive Action'}</div>
                  <div style={{ fontSize: 11 }}>{isZh ? '操作' : 'Action'}: {formatToolName(isZh, aiPendingToolCall.call.name)}</div>
                  {(() => {
                    const pendingTarget = formatPendingTarget(isZh, aiPendingToolCall.call);
                    if (!pendingTarget) return null;
                    return <div style={{ fontSize: 11 }}>{isZh ? '目标' : 'Target'}: {pendingTarget}</div>;
                  })()}
                  {aiPendingToolCall.riskSummary && <div style={{ fontSize: 11, color: '#92400e' }}>{aiPendingToolCall.riskSummary}</div>}
                  {aiPendingToolCall.previewContract && (
                    <div style={{ fontSize: 10, color: '#78350f', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span>{isZh ? '影响' : 'Affects'}: {aiPendingToolCall.previewContract.affectedCount} {isZh ? '项' : 'item(s)'}</span>
                      {!aiPendingToolCall.previewContract.reversible && <span style={{ color: '#b91c1c' }}>{isZh ? '不可逆' : 'Irreversible'}</span>}
                      {(aiPendingToolCall.previewContract.cascadeTypes ?? []).length > 0 && (
                        <span>{isZh ? '级联' : 'Cascade'}: {(aiPendingToolCall.previewContract.cascadeTypes ?? []).join(', ')}</span>
                      )}
                    </div>
                  )}
                  {normalizeImpactPreviewLines(
                    aiPendingToolCall.impactPreview ?? [],
                    aiPendingToolCall.previewContract?.reversible ?? false,
                  ).length > 0 && (
                    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 10, color: '#7c2d12' }}>
                      {normalizeImpactPreviewLines(
                        aiPendingToolCall.impactPreview ?? [],
                        aiPendingToolCall.previewContract?.reversible ?? false,
                      ).slice(0, 3).map((line) => <li key={line}>{line}</li>)}
                    </ul>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="icon-btn" style={{ height: 24, minWidth: 92, fontSize: 11 }} disabled={!onConfirmPendingToolCall} onClick={() => void onConfirmPendingToolCall?.()}>{formatPendingConfirmActionLabel(isZh, aiPendingToolCall.call.name)}</button>
                    <button type="button" className="icon-btn" style={{ height: 24, minWidth: 64, fontSize: 11 }} disabled={!onCancelPendingToolCall} onClick={() => void onCancelPendingToolCall?.()}>{isZh ? '取消' : 'Cancel'}</button>
                  </div>
                </div>
              )}
              {debugUiShowAll && !aiPendingToolCall && (
                <p className="small-text" style={{ margin: 0 }}>{isZh ? '演示模式：这里会显示错误和待确认工具调用详情。' : 'Demo mode: error and pending tool-call details appear here.'}</p>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
