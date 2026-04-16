import { memo, useMemo } from 'react';
import { buildAiChangeSetFromPendingToolCall } from '../../ai/changeset/AiChangeSetProtocol';
import type { PendingAiToolCall } from '../../hooks/useAiChat';
import { t, useLocale } from '../../i18n';
import { formatPendingConfirmActionLabel, formatPendingTarget, formatToolName, normalizeImpactPreviewLines } from './aiChatCardUtils';
import { resolveTextDirectionFromLocale } from '../../utils/panelAdaptiveLayout';
import { PanelButton, PanelChip, PanelNote } from '../ui';
import { PanelSection } from '../ui/PanelSection';
import { PanelSummary } from '../ui/PanelSummary';
import { AiChangeSetPreview } from './AiChangeSetPreview';

interface AiChatAlertsPanelProps {
  isZh: boolean;
  errorWarningText: string;
  dismissedErrorWarning: boolean;
  alertCount: number;
  debugUiShowAll: boolean;
  showAlertBar: boolean;
  aiPendingToolCall: PendingAiToolCall | null | undefined;
  timelineReadModelEpoch?: number | undefined;
  onDismissErrorWarning: () => void;
  onToggleAlertBar: () => void;
  onConfirmPendingToolCall?: (() => Promise<void>) | undefined;
  onCancelPendingToolCall?: (() => Promise<void>) | undefined;
}

export const AiChatAlertsPanel = memo(function AiChatAlertsPanel({
  isZh,
  errorWarningText,
  dismissedErrorWarning,
  alertCount,
  debugUiShowAll,
  showAlertBar,
  aiPendingToolCall,
  timelineReadModelEpoch,
  onDismissErrorWarning,
  onToggleAlertBar,
  onConfirmPendingToolCall,
  onCancelPendingToolCall,
}: AiChatAlertsPanelProps) {
  const locale = useLocale();
  const uiTextDirection = resolveTextDirectionFromLocale(locale);
  const hasToolPending = !!aiPendingToolCall;
  const pendingChangeSet = useMemo(
    () => (aiPendingToolCall ? buildAiChangeSetFromPendingToolCall(aiPendingToolCall) : null),
    [aiPendingToolCall],
  );
  const readModelStale = Boolean(
    aiPendingToolCall?.readModelEpochCaptured !== undefined
      && timelineReadModelEpoch !== undefined
      && aiPendingToolCall.readModelEpochCaptured !== timelineReadModelEpoch,
  );
  const impactPreviewLines = normalizeImpactPreviewLines(
    aiPendingToolCall?.impactPreview ?? [],
    aiPendingToolCall?.previewContract?.reversible ?? false,
  ).slice(0, 3);
  const summaryTitle = hasToolPending
    ? t(locale, 'ai.alerts.confirmDestructiveAction')
    : t(locale, 'ai.alerts.demoDetails');
  const summaryDescription = hasToolPending
    ? aiPendingToolCall?.riskSummary ?? t(locale, 'ai.alerts.pendingToolCall')
    : t(locale, 'ai.alerts.demoModeHint');

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
        <div data-testid="ai-chat-alerts-region" dir={uiTextDirection} className="ai-chat-alerts-region panel-design-match-content">
          <PanelSummary
            className="ai-chat-alerts-card"
            title={summaryTitle}
            description={summaryDescription}
            meta={(
              <div className="panel-meta ai-chat-alerts-summary-meta">
                <PanelChip variant={hasToolPending ? 'warning' : undefined}>{t(locale, 'ai.alerts.pendingToolCall')}</PanelChip>
                <PanelChip>{alertCount}</PanelChip>
                <PanelButton
                  variant="ghost"
                  className="ai-chat-alerts-toggle"
                  onClick={onToggleAlertBar}
                  aria-expanded={showAlertBar}
                >
                  {showAlertBar ? t(locale, 'ai.alerts.hide') : t(locale, 'ai.alerts.expand')}
                </PanelButton>
              </div>
            )}
            supportingText={hasToolPending ? t(locale, 'ai.alerts.pendingToolCall') : undefined}
          >
            {showAlertBar && (
              <PanelSection
                className="ai-chat-alerts-body"
                title={hasToolPending ? t(locale, 'ai.alerts.confirmDestructiveAction') : t(locale, 'ai.alerts.demoDetails')}
                description={hasToolPending ? t(locale, 'ai.alerts.pendingToolCall') : t(locale, 'ai.alerts.demoModeHint')}
              >
                {aiPendingToolCall ? (
                  <>
                    <div className="ai-chat-alerts-pending-grid">
                      <div className="ai-chat-alerts-pending-row">{t(locale, 'ai.alerts.action')}: {formatToolName(isZh, aiPendingToolCall.call.name)}</div>
                      {(() => {
                        const pendingTarget = formatPendingTarget(isZh, aiPendingToolCall.call);
                        if (!pendingTarget) return null;
                        return <div className="ai-chat-alerts-pending-row">{t(locale, 'ai.alerts.target')}: {pendingTarget}</div>;
                      })()}
                      {aiPendingToolCall.riskSummary && <div className="ai-chat-alerts-pending-risk">{aiPendingToolCall.riskSummary}</div>}
                      {readModelStale && (
                        <div className="ai-chat-alerts-pending-risk" role="status">
                          {t(locale, 'ai.alerts.staleReadModelWarning')}
                        </div>
                      )}
                      {pendingChangeSet && (
                        <AiChangeSetPreview changeSet={pendingChangeSet} showActions={false} />
                      )}
                      {aiPendingToolCall.previewContract && (
                        <div className="ai-chat-alerts-pending-meta">
                          <span>{t(locale, 'ai.alerts.affects')}: {aiPendingToolCall.previewContract.affectedCount} {t(locale, 'ai.alerts.items')}</span>
                          {!aiPendingToolCall.previewContract.reversible && <span className="ai-chat-alerts-pending-danger">{t(locale, 'ai.alerts.irreversible')}</span>}
                          {(aiPendingToolCall.previewContract.cascadeTypes ?? []).length > 0 && (
                            <span>{t(locale, 'ai.alerts.cascade')}: {(aiPendingToolCall.previewContract.cascadeTypes ?? []).join(', ')}</span>
                          )}
                        </div>
                      )}
                    </div>
                    {impactPreviewLines.length > 0 && (
                      <ul className="ai-chat-alerts-impact-list">
                        {impactPreviewLines.map((line) => <li key={line}>{line}</li>)}
                      </ul>
                    )}
                    <div className="ai-chat-alerts-actions">
                      <PanelButton variant="danger" className="ai-chat-alerts-action-btn" disabled={!onConfirmPendingToolCall || readModelStale} onClick={() => void onConfirmPendingToolCall?.()}>{formatPendingConfirmActionLabel(isZh, aiPendingToolCall.call.name)}</PanelButton>
                      <PanelButton variant="ghost" className="ai-chat-alerts-action-btn" disabled={!onCancelPendingToolCall} onClick={() => void onCancelPendingToolCall?.()}>{t(locale, 'ai.alerts.cancel')}</PanelButton>
                    </div>
                  </>
                ) : (
                  <PanelNote className="ai-chat-alerts-demo-note">{t(locale, 'ai.alerts.demoModeHint')}</PanelNote>
                )}
              </PanelSection>
            )}
          </PanelSummary>
        </div>
      )}
    </>
  );
});

AiChatAlertsPanel.displayName = 'AiChatAlertsPanel';
