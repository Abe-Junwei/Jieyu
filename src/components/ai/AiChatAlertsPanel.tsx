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
          border: '1px solid var(--state-warning-border)',
          background: 'color-mix(in srgb, var(--state-warning-bg) 90%, transparent)',
          color: 'var(--state-warning-text)',
          fontSize: 'calc(11px * var(--ui-font-scale, 1))',
        }}>
          <span>{errorWarningText}</span>
          <button
            type="button"
            className="icon-btn"
            style={{ height: 22, minWidth: 'calc(54px * var(--ui-font-scale, 1))', fontSize: 'calc(10px * var(--ui-font-scale, 1))' }}
            onClick={onDismissErrorWarning}
          >
            {t(locale, 'ai.alerts.dismiss')}
          </button>
        </div>
      )}

      {(alertCount > 0 || debugUiShowAll) && (
        <div data-testid="ai-chat-alerts-region" dir={uiTextDirection} style={{ borderTop: '1px solid color-mix(in srgb, var(--border-soft) 45%, transparent)', flexShrink: 0 }}>
          <button
            type="button"
            onClick={onToggleAlertBar}
            style={{
              width: '100%', background: 'none', border: 'none', padding: '5px 10px',
              display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
              fontSize: 'calc(11px * var(--ui-font-scale, 1))', color: 'var(--state-warning-text)',
            }}
          >
            <span style={{ fontSize: 'calc(14px * var(--ui-font-scale, 1))' }}>{hasToolPending ? '⚡' : '📋'}</span>
            <span style={{ flex: 1, textAlign: 'left' }}>
              {hasToolPending && ` ${t(locale, 'ai.alerts.pendingToolCall')}`}
              {debugUiShowAll && !hasToolPending && ` ${t(locale, 'ai.alerts.demoDetails')}`}
            </span>
            <span style={{ fontSize: 'calc(10px * var(--ui-font-scale, 1))', opacity: 0.6 }}>
              {showAlertBar ? `▲ ${t(locale, 'ai.alerts.hide')}` : `▼ ${t(locale, 'ai.alerts.expand')}`}
            </span>
          </button>

          {showAlertBar && (
            <div style={{ padding: '0 10px 8px', display: 'grid', gap: 6 }}>
              {aiPendingToolCall && (
                <div style={{ border: '1px solid var(--state-warning-solid)', background: 'var(--state-warning-bg)', borderRadius: 6, padding: '6px 8px', display: 'grid', gap: 4 }}>
                  <div style={{ fontSize: 'calc(11px * var(--ui-font-scale, 1))', fontWeight: 600, color: 'var(--state-warning-text)' }}>{t(locale, 'ai.alerts.confirmDestructiveAction')}</div>
                  <div style={{ fontSize: 'calc(11px * var(--ui-font-scale, 1))' }}>{t(locale, 'ai.alerts.action')}: {formatToolName(isZh, aiPendingToolCall.call.name)}</div>
                  {(() => {
                    const pendingTarget = formatPendingTarget(isZh, aiPendingToolCall.call);
                    if (!pendingTarget) return null;
                    return <div style={{ fontSize: 'calc(11px * var(--ui-font-scale, 1))' }}>{t(locale, 'ai.alerts.target')}: {pendingTarget}</div>;
                  })()}
                  {aiPendingToolCall.riskSummary && <div style={{ fontSize: 'calc(11px * var(--ui-font-scale, 1))', color: 'var(--state-warning-text)' }}>{aiPendingToolCall.riskSummary}</div>}
                  {aiPendingToolCall.previewContract && (
                    <div style={{ fontSize: 'calc(10px * var(--ui-font-scale, 1))', color: 'var(--state-warning-text)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span>{t(locale, 'ai.alerts.affects')}: {aiPendingToolCall.previewContract.affectedCount} {t(locale, 'ai.alerts.items')}</span>
                      {!aiPendingToolCall.previewContract.reversible && <span style={{ color: 'var(--state-danger-text)' }}>{t(locale, 'ai.alerts.irreversible')}</span>}
                      {(aiPendingToolCall.previewContract.cascadeTypes ?? []).length > 0 && (
                        <span>{t(locale, 'ai.alerts.cascade')}: {(aiPendingToolCall.previewContract.cascadeTypes ?? []).join(', ')}</span>
                      )}
                    </div>
                  )}
                  {normalizeImpactPreviewLines(
                    aiPendingToolCall.impactPreview ?? [],
                    aiPendingToolCall.previewContract?.reversible ?? false,
                  ).length > 0 && (
                    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 'calc(10px * var(--ui-font-scale, 1))', color: 'var(--state-warning-text)' }}>
                      {normalizeImpactPreviewLines(
                        aiPendingToolCall.impactPreview ?? [],
                        aiPendingToolCall.previewContract?.reversible ?? false,
                      ).slice(0, 3).map((line) => <li key={line}>{line}</li>)}
                    </ul>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="icon-btn" style={{ height: 24, minWidth: 'calc(92px * var(--ui-font-scale, 1))', fontSize: 'calc(11px * var(--ui-font-scale, 1))' }} disabled={!onConfirmPendingToolCall} onClick={() => void onConfirmPendingToolCall?.()}>{formatPendingConfirmActionLabel(isZh, aiPendingToolCall.call.name)}</button>
                    <button type="button" className="icon-btn" style={{ height: 24, minWidth: 'calc(64px * var(--ui-font-scale, 1))', fontSize: 'calc(11px * var(--ui-font-scale, 1))' }} disabled={!onCancelPendingToolCall} onClick={() => void onCancelPendingToolCall?.()}>{t(locale, 'ai.alerts.cancel')}</button>
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
