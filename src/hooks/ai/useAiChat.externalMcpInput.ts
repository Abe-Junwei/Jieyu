/**
 * The input card an external MCP server asks for, shared by both runtimes.
 * The server question stays on the card; it never goes into the assistant message.
 */
import { completeExternalMcpInputForm } from '../../ai/mcp/client/externalMcpTurnBridge';
import { firstUnansweredCard } from '../../ai/runtime/aiRuntimeV2Pending';
import type { ExternalMcpInputCard } from '../../ai/mcp/client/externalMcpInputRequired';
import { t, type Locale } from '../../i18n';
import type { PendingAiToolCall } from './useAiChat.types';

export function buildExternalMcpInputPendingCall(input: {
  name: string;
  form: ExternalMcpInputCard;
  assistantMessageId: string;
  requestId?: string | undefined;
  conversationId?: string | null | undefined;
}): PendingAiToolCall {
  const { name, form, assistantMessageId, requestId, conversationId } = input;
  const call = {
    name,
    arguments: form.arguments,
    ...(requestId ? { requestId } : {}),
  } as PendingAiToolCall['call'];
  const prompt = form.requests[0]?.message;
  return {
    call,
    assistantMessageId,
    ...(prompt ? { riskSummary: prompt } : {}),
    approvalMode: 'user_preference',
    policyReasonCode: 'input_required',
    mcpInput: form,
    ...(requestId ? { requestId } : {}),
    ...(conversationId ? { conversationIdAtCapture: conversationId } : {}),
  };
}

export interface ExternalMcpInputCardDeps {
  locale: Locale;
  setPendingToolCall: (value: PendingAiToolCall | null) => void;
  setTaskIdle: () => void;
  applyAssistantMessageResult: (
    messageId: string,
    content: string,
    status?: 'done' | 'error',
    errorMessage?: string,
  ) => Promise<void>;
  writeToolDecisionAuditLog: (
    assistantMessageId: string,
    oldValue: string,
    newValue: string,
    source: 'human' | 'ai' | 'system',
    requestId?: string,
  ) => Promise<void>;
}

export async function confirmExternalMcpInputCard(
  pending: PendingAiToolCall & { mcpInput: ExternalMcpInputCard },
  draft: Record<string, string>,
  deps: ExternalMcpInputCardDeps,
): Promise<void> {
  const { assistantMessageId } = pending;
  const name = pending.call.name;
  const requestId = pending.call.requestId ?? pending.requestId;
  const outcome = await completeExternalMcpInputForm(pending.mcpInput, draft);
  if (outcome.kind === 'missing_required') return;
  if (outcome.kind === 'asked_again') {
    const prompt = outcome.form.requests[0]?.message;
    deps.setPendingToolCall({
      ...pending,
      mcpInput: outcome.form,
      ...(prompt ? { riskSummary: prompt } : {}),
    });
    await deps.applyAssistantMessageResult(
      assistantMessageId,
      t(deps.locale, 'ai.externalMcp.inputAskedAgain'),
      'done',
    );
    await deps.writeToolDecisionAuditLog(
      assistantMessageId,
      `pending:${name}`,
      `input_required_again:${name}`,
      'system',
      requestId,
    );
    return;
  }
  deps.setPendingToolCall(null);
  deps.setTaskIdle();
  await showQueuedApprovalCard(pending, deps.setPendingToolCall);
  if (outcome.kind === 'failed') {
    const message = t(deps.locale, 'ai.externalMcp.inputFailed');
    await deps.applyAssistantMessageResult(assistantMessageId, message, 'error', message);
    await deps.writeToolDecisionAuditLog(
      assistantMessageId,
      `pending:${name}`,
      `confirm_failed:${name}:${outcome.reason}`,
      'system',
      requestId,
    );
    return;
  }
  // The result is not fed to the model outside ToolLoopAgent; the user asks again to use it.
  await deps.applyAssistantMessageResult(
    assistantMessageId,
    t(deps.locale, 'ai.externalMcp.inputSubmitted'),
    'done',
  );
  await deps.writeToolDecisionAuditLog(
    assistantMessageId,
    `pending:${name}`,
    `approved:${name}:input_submitted`,
    'human',
    requestId,
  );
}

/**
 * An approval requested in the same ToolLoopAgent turn waits behind the input card
 * (it is saved in the turn state); show it once the input card is gone.
 */
export async function showQueuedApprovalCard(
  closed: PendingAiToolCall,
  setPendingToolCall: (value: PendingAiToolCall | null) => void,
): Promise<void> {
  if (!closed.conversationIdAtCapture) return;
  const next = await firstUnansweredCard(closed.conversationIdAtCapture, Date.now());
  if (next) setPendingToolCall(next as PendingAiToolCall);
}
