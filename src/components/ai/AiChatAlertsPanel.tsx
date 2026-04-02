import type { PendingAiToolCall } from '../../hooks/useAiChat';
import { t, useLocale } from '../../i18n';
import {
  formatPendingConfirmActionLabel,
  formatPendingTarget,
  formatToolName,
  normalizeImpactPreviewLines,
} from './aiChatCardUtils';
import { resolveTextDirectionFromLocale } from '../../utils/panelAdaptiveLayout';

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
  const locale = useLocale();
  const uiTextDirection = resolveTextDirectionFromLocale(locale);
  const hasToolPending = !!aiPendingToolCall;
  const impactPreviewLines = normalizeImpactPreviewLines(
    aiPendingToolCall?.impactPreview ?? [],
    aiPendingToolCall?.previewContract?.reversible ?? false,
  ).slice(0, 3);

  return (
    <>
      {errorWarningText && !dismissedErrorWarning && (
        <div className="ai-chat-alert-warning" role="status" aria-live="polite">
          <span className="ai-chat-alert-warning-text">{errorWarningText}</span>
          <button
            type="button"
            className="icon-btn ai-chat-alert-warning-dismiss"
            onClick={onDismissErrorWarning}
          >
            {t(locale, 'ai.alerts.dismiss')}
          </button>
        </div>
      )}

      {(alertCount > 0 || debugUiShowAll) && (
        <div data-testid="ai-chat-alerts-region" dir={uiTextDirection} className="ai-chat-alerts-region">
          <button
            type="button"
            onClick={onToggleAlertBar}
            className="ai-chat-alerts-toggle"
          >
            <span className="ai-chat-alerts-toggle-icon" aria-hidden="true">{hasToolPending ? '⚡' : '📋'}</span>
            <span className="ai-chat-alerts-toggle-summary">
              {hasToolPending && ` ${t(locale, 'ai.alerts.pendingToolCall')}`}
              {debugUiShowAll && !hasToolPending && ` ${t(locale, 'ai.alerts.demoDetails')}`}
            </span>
            <span className="ai-chat-alerts-toggle-caret">
              {showAlertBar ? `▲ ${t(locale, 'ai.alerts.hide')}` : `▼ ${t(locale, 'ai.alerts.expand')}`}
            </span>
          </button>

          {showAlertBar && (
            <div className="ai-chat-alerts-body">
              {aiPendingToolCall && (
                <div className="ai-chat-alerts-pending-card">
                  <div className="ai-chat-alerts-pending-title">{t(locale, 'ai.alerts.confirmDestructiveAction')}</div>
                  <div className="ai-chat-alerts-pending-row">{t(locale, 'ai.alerts.action')}: {formatToolName(isZh, aiPendingToolCall.call.name)}</div>
                  {(() => {
                    const pendingTarget = formatPendingTarget(isZh, aiPendingToolCall.call);
                    if (!pendingTarget) return null;
                    return <div className="ai-chat-alerts-pending-row">{t(locale, 'ai.alerts.target')}: {pendingTarget}</div>;
                  })()}
                  {aiPendingToolCall.riskSummary && <div className="ai-chat-alerts-pending-risk">{aiPendingToolCall.riskSummary}</div>}
                  {aiPendingToolCall.previewContract && (
                    <div className="ai-chat-alerts-pending-meta">
                      <span>{t(locale, 'ai.alerts.affects')}: {aiPendingToolCall.previewContract.affectedCount} {t(locale, 'ai.alerts.items')}</span>
                      {!aiPendingToolCall.previewContract.reversible && <span className="ai-chat-alerts-pending-danger">{t(locale, 'ai.alerts.irreversible')}</span>}
                      {(aiPendingToolCall.previewContract.cascadeTypes ?? []).length > 0 && (
                        <span>{t(locale, 'ai.alerts.cascade')}: {(aiPendingToolCall.previewContract.cascadeTypes ?? []).join(', ')}</span>
                      )}
                    </div>
                  )}
                  {impactPreviewLines.length > 0 && (
                    <ul className="ai-chat-alerts-impact-list">
                      {impactPreviewLines.map((line) => <li key={line}>{line}</li>)}
                    </ul>
                  )}
                  <div className="ai-chat-alerts-actions">
                    <button type="button" className="icon-btn ai-chat-alerts-action-btn" disabled={!onConfirmPendingToolCall} onClick={() => void onConfirmPendingToolCall?.()}>{formatPendingConfirmActionLabel(isZh, aiPendingToolCall.call.name)}</button>
                    <button type="button" className="icon-btn ai-chat-alerts-action-btn" disabled={!onCancelPendingToolCall} onClick={() => void onCancelPendingToolCall?.()}>{t(locale, 'ai.alerts.cancel')}</button>
                  </div>
                </div>
              )}
              {debugUiShowAll && !aiPendingToolCall && (
                <p className="small-text" style={{ margin: 0 }}>{t(locale, 'ai.alerts.demoModeHint')}</p>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
