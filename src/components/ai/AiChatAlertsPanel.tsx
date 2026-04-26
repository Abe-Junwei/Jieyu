import { memo, useEffect, useMemo, useState } from 'react';
import { buildAiChangeSetFromPendingToolCall } from '../../ai/changeset/AiChangeSetProtocol';
import type { AiSessionMemoryPendingAgentLoopCheckpoint } from '../../ai/chat/chatDomain.types';
import type { PendingAiToolCall } from '../../hooks/useAiChat';
import { t, useLocale } from '../../i18n';
import { formatPendingConfirmActionLabel, formatPendingTarget, formatPolicyReasonExplanation, formatToolName, normalizeImpactPreviewLines } from './aiChatCardUtils';
import { resolveTextDirectionFromLocale } from '../../utils/panelAdaptiveLayout';
import { PanelButton, PanelChip, PanelNote } from '../ui';
import { PanelSection } from '../ui/PanelSection';
import { PanelSummary } from '../ui/PanelSummary';
import { AiChangeSetPreview } from './AiChangeSetPreview';

interface AiChatAlertsPanelProps {
  isZh: boolean;
  aiIsStreaming?: boolean;
  errorWarningText: string;
  dismissedErrorWarning: boolean;
  alertCount: number;
  debugUiShowAll: boolean;
  showAlertBar: boolean;
  aiPendingToolCall: PendingAiToolCall | null | undefined;
  aiPendingAgentLoopCheckpoint?: AiSessionMemoryPendingAgentLoopCheckpoint | null | undefined;
  aiToolDecisionLogs?: Array<{ id: string; decision: string; reason?: string; reasonLabelEn?: string; reasonLabelZh?: string; message?: string; requestId?: string; timestamp: string }> | undefined;
  timelineReadModelEpoch?: number | undefined;
  onDismissErrorWarning: () => void;
  onToggleAlertBar: () => void;
  onOpenDecisionReplay?: ((requestId: string) => Promise<void> | void) | undefined;
  onResumeAgentLoop?: (() => Promise<void> | void) | undefined;
  onConfirmPendingToolCall?: (() => Promise<void>) | undefined;
  onCancelPendingToolCall?: (() => Promise<void>) | undefined;
}

const APPROVAL_HISTORY_FILTER_STORAGE_KEY = 'jieyu:ai-approval-history-filter';

function parseApprovalHistoryFilter(value: string | null): 'all' | 'blocked' | 'pending' | 'executed' {
  if (value === 'blocked' || value === 'pending' || value === 'executed') return value;
  return 'all';
}

export const AiChatAlertsPanel = memo(function AiChatAlertsPanel({
  isZh,
  aiIsStreaming = false,
  errorWarningText,
  dismissedErrorWarning,
  alertCount,
  debugUiShowAll,
  showAlertBar,
  aiPendingToolCall,
  aiPendingAgentLoopCheckpoint,
  aiToolDecisionLogs,
  timelineReadModelEpoch,
  onDismissErrorWarning,
  onToggleAlertBar,
  onOpenDecisionReplay,
  onResumeAgentLoop,
  onConfirmPendingToolCall,
  onCancelPendingToolCall,
}: AiChatAlertsPanelProps) {
  const locale = useLocale();
  const uiTextDirection = resolveTextDirectionFromLocale(locale);
  const [approvalHistoryFilter, setApprovalHistoryFilter] = useState<'all' | 'blocked' | 'pending' | 'executed'>(() => {
    if (typeof window === 'undefined') return 'all';
    return parseApprovalHistoryFilter(window.sessionStorage.getItem(APPROVAL_HISTORY_FILTER_STORAGE_KEY));
  });
  const hasToolPending = !!aiPendingToolCall;
  const hasAgentLoopHandoffPending = Boolean(aiPendingAgentLoopCheckpoint);
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
  const approvalReasonChain = useMemo(() => {
    if (!aiPendingToolCall) return [];
    const lines: string[] = [];
    if (aiPendingToolCall.approvalMode) {
      lines.push(`mode=${aiPendingToolCall.approvalMode}`);
    }
    if (aiPendingToolCall.riskTier) {
      lines.push(`risk=${aiPendingToolCall.riskTier}`);
    }
    if (aiPendingToolCall.policyReasonCode) {
      const policyReason = formatPolicyReasonExplanation(isZh, aiPendingToolCall.policyReasonCode);
      lines.push(`policy=${policyReason ?? aiPendingToolCall.policyReasonCode}`);
    }
    return lines;
  }, [aiPendingToolCall, isZh]);
  const summaryTitle = hasToolPending
    ? t(locale, 'ai.alerts.confirmDestructiveAction')
    : hasAgentLoopHandoffPending
      ? (isZh ? 'Agent Loop 交接' : 'Agent Loop Handoff')
    : t(locale, 'ai.alerts.demoDetails');
  const summaryDescription = hasToolPending
    ? aiPendingToolCall?.riskSummary ?? t(locale, 'ai.alerts.pendingToolCall')
    : hasAgentLoopHandoffPending
      ? (isZh ? '检测到可续跑检查点，可在审批面板中继续执行。' : 'A resumable checkpoint is available. Resume execution from the approval panel.')
    : t(locale, 'ai.alerts.demoModeHint');
  const approvalHistoryItems = useMemo(() => {
    const decisionLogs = aiToolDecisionLogs ?? [];
    if (decisionLogs.length === 0) return [];
    const approvalLogs = [...decisionLogs]
      .filter((item) => item.decision.includes('policy') || item.decision.includes('confirm') || item.decision.includes('execut'));
    const filtered = approvalLogs.filter((item) => {
      if (approvalHistoryFilter === 'all') return true;
      if (approvalHistoryFilter === 'blocked') return item.decision.includes('blocked');
      if (approvalHistoryFilter === 'pending') return item.decision.includes('pending');
      return item.decision.includes('confirm') || item.decision.includes('execut');
    });
    return filtered
      .slice(-3)
      .reverse();
  }, [aiToolDecisionLogs, approvalHistoryFilter]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(APPROVAL_HISTORY_FILTER_STORAGE_KEY, approvalHistoryFilter);
  }, [approvalHistoryFilter]);

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
                <PanelChip variant={(hasToolPending || hasAgentLoopHandoffPending) ? 'warning' : undefined}>{t(locale, 'ai.alerts.pendingToolCall')}</PanelChip>
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
            supportingText={(hasToolPending || hasAgentLoopHandoffPending) ? t(locale, 'ai.alerts.pendingToolCall') : undefined}
          >
            {showAlertBar && (
              <PanelSection
                className="ai-chat-alerts-body"
                title={hasToolPending
                  ? t(locale, 'ai.alerts.confirmDestructiveAction')
                  : (hasAgentLoopHandoffPending ? (isZh ? 'Agent Loop 交接' : 'Agent Loop Handoff') : t(locale, 'ai.alerts.demoDetails'))}
                description={hasToolPending
                  ? t(locale, 'ai.alerts.pendingToolCall')
                  : (hasAgentLoopHandoffPending
                    ? (isZh ? '等待继续执行确认。' : 'Waiting for resume confirmation.')
                    : t(locale, 'ai.alerts.demoModeHint'))}
              >
                {aiPendingToolCall ? (
                  <>
                    <div className="ai-chat-alerts-pending-meta" data-testid="ai-approval-center-mvp">
                      <span>{isZh ? '\u5ba1\u6279\u4e2d\u5fc3\uff08MVP\uff09' : 'Approval Center (MVP)'}</span>
                      {approvalReasonChain.map((entry) => <span key={entry}>{entry}</span>)}
                    </div>
                    {approvalHistoryItems.length > 0 && (
                      <div className="ai-chat-alerts-pending-grid" data-testid="ai-approval-history-mvp">
                        <div className="ai-chat-alerts-pending-row">{isZh ? '\u6700\u8fd1\u5ba1\u6279\u8bb0\u5f55' : 'Recent approval outcomes'}</div>
                        <div className="ai-chat-alerts-pending-row">
                          <span>{isZh ? '\u7ed3\u679c\u7b5b\u9009\uff1a' : 'Outcome filter:'}</span>
                          <select
                            value={approvalHistoryFilter}
                            onChange={(event) => setApprovalHistoryFilter(event.target.value as typeof approvalHistoryFilter)}
                            aria-label={isZh ? '\u5ba1\u6279\u7ed3\u679c\u7b5b\u9009' : 'Approval outcome filter'}
                          >
                            <option value="all">{isZh ? '\u5168\u90e8' : 'All'}</option>
                            <option value="blocked">{isZh ? '\u963b\u65ad' : 'Blocked'}</option>
                            <option value="pending">{isZh ? '\u5f85\u786e\u8ba4' : 'Pending'}</option>
                            <option value="executed">{isZh ? '\u5df2\u6267\u884c' : 'Executed'}</option>
                          </select>
                        </div>
                        {approvalHistoryItems.map((item) => (
                          <div className="ai-chat-alerts-pending-row" key={item.id}>
                            <span>
                              {item.decision}
                              {(item.reasonLabelEn || item.reasonLabelZh || item.reason)
                                ? ` · ${isZh ? (item.reasonLabelZh ?? formatPolicyReasonExplanation(true, item.reason) ?? item.reason) : (item.reasonLabelEn ?? formatPolicyReasonExplanation(false, item.reason) ?? item.reason)}`
                                : ''}
                              {item.message ? ` · ${item.message}` : ''}
                              {` · ${new Date(item.timestamp).toLocaleTimeString()}`}
                            </span>
                            {item.requestId && (
                              <PanelButton
                                variant="ghost"
                                className="ai-chat-alerts-toggle"
                                onClick={() => void onOpenDecisionReplay?.(item.requestId as string)}
                                disabled={!onOpenDecisionReplay}
                              >
                                {isZh ? '\u67e5\u770b\u56de\u653e' : 'Replay'}
                              </PanelButton>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="ai-chat-alerts-pending-grid">
                      <div className="ai-chat-alerts-pending-row">{t(locale, 'ai.alerts.action')}: {formatToolName(isZh, aiPendingToolCall.call.name)}</div>
                      {(() => {
                        const pendingTarget = formatPendingTarget(isZh, aiPendingToolCall.call);
                        if (!pendingTarget) return null;
                        return <div className="ai-chat-alerts-pending-row">{t(locale, 'ai.alerts.target')}: {pendingTarget}</div>;
                      })()}
                      {aiPendingToolCall.riskSummary && <div className="ai-chat-alerts-pending-risk">{aiPendingToolCall.riskSummary}</div>}
                      {aiPendingToolCall.policyReasonLabel && (
                        <div className="ai-chat-alerts-pending-risk">{aiPendingToolCall.policyReasonLabel}</div>
                      )}
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
                          {aiPendingToolCall.riskTier && <span>risk:{aiPendingToolCall.riskTier}</span>}
                          {aiPendingToolCall.approvalMode && <span>mode:{aiPendingToolCall.approvalMode}</span>}
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
                ) : aiPendingAgentLoopCheckpoint ? (
                  <>
                    <div className="ai-chat-alerts-pending-meta" data-testid="ai-agent-loop-handoff-mvp">
                      <span>{isZh ? '审批中心（Durable Handoff）' : 'Approval Center (Durable Handoff)'}</span>
                      <span>{`step=${aiPendingAgentLoopCheckpoint.step}`}</span>
                      {aiPendingAgentLoopCheckpoint.taskId && <span>{`task=${aiPendingAgentLoopCheckpoint.taskId}`}</span>}
                    </div>
                    <div className="ai-chat-alerts-pending-grid">
                      <div className="ai-chat-alerts-pending-row">
                        {isZh ? '原始请求：' : 'Original prompt: '}
                        {aiPendingAgentLoopCheckpoint.originalUserText}
                      </div>
                      <div className="ai-chat-alerts-pending-row">
                        {isZh ? '继续输入：' : 'Continuation: '}
                        {aiPendingAgentLoopCheckpoint.continuationInput}
                      </div>
                      {aiPendingAgentLoopCheckpoint.estimatedRemainingTokens !== undefined && (
                        <div className="ai-chat-alerts-pending-row">
                          {isZh
                            ? `剩余 token 预估：${aiPendingAgentLoopCheckpoint.estimatedRemainingTokens}`
                            : `Estimated remaining tokens: ${aiPendingAgentLoopCheckpoint.estimatedRemainingTokens}`}
                        </div>
                      )}
                    </div>
                    <div className="ai-chat-alerts-actions">
                      <PanelButton
                        variant="danger"
                        className="ai-chat-alerts-action-btn"
                        disabled={!onResumeAgentLoop || aiIsStreaming}
                        onClick={() => void onResumeAgentLoop?.()}
                      >
                        {isZh ? '继续执行' : 'Resume'}
                      </PanelButton>
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
