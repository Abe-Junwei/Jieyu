import { t, useLocale } from '../../i18n';
import type { DictKey } from '../../i18n/dictKeys';
import { featureFlags } from '../../ai/config/featureFlags';
import { buildAiChangeTransactionPreviewV1 } from '../../ai/changeset/aiChangeTransactionPreviewV1';
import {
  getToolDecisionFailureTriage,
  type AiToolDecisionFailureTriage,
} from '../../ai/chat/toolDecisionFailureReason';
import type { PendingAiToolCall } from '../../hooks/useAiChat';
import { useAgentUiEvents } from '../../hooks/ai/useAgentUiEvents';

const TRIAGE_DICT_KEY: Record<AiToolDecisionFailureTriage, DictKey> = {
  clarify: 'ai.alerts.triageClarify',
  human: 'ai.alerts.triageHuman',
  retry: 'ai.alerts.triageRetry',
  abandon: 'ai.alerts.triageAbandon',
};

export function AgentWritePreviewSection({ pending }: { pending: PendingAiToolCall }) {
  const locale = useLocale();
  const latestEvent = useAgentUiEvents();
  if (!featureFlags.aiAgentUiPreviewEnabled) return null;

  const pendingRequestId = pending.requestId ?? pending.call.requestId;
  const agentRunId =
    latestEvent?.requestId && latestEvent.requestId === pendingRequestId
      ? latestEvent.agentRunId
      : (pending.auditContext?.agentRunId ?? latestEvent?.agentRunId);
  const preview = buildAiChangeTransactionPreviewV1(pending, agentRunId);
  const reasonCode = pending.policyReasonCode ?? latestEvent?.reasonCode;
  const triage = reasonCode ? getToolDecisionFailureTriage(reasonCode) : latestEvent?.triage;

  return (
    <div
      className="ai-agent-write-preview"
      data-testid="ai-agent-write-preview"
      data-agent-run-id={preview.agentRunId ?? ''}
      data-preview-kind={preview.kind}
    >
      <div className="ai-chat-alerts-pending-row">{t(locale, 'ai.alerts.writePreviewHeading')}</div>
      {triage ? (
        <div className="ai-chat-alerts-pending-row" data-testid="ai-agent-write-preview-triage">
          {t(locale, TRIAGE_DICT_KEY[triage])}
        </div>
      ) : null}
      <ul className="ai-agent-write-preview-steps">
        {preview.childSteps.map((step) => (
          <li key={`${step.index}:${step.toolName}:${step.targetId}`}>
            <code>{step.targetId || preview.parentToolName}</code> {step.toolName}
            {step.argsSummary ? ` · ${step.argsSummary}` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}
