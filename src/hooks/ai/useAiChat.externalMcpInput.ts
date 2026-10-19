/**
 * The input card an external MCP server asks for, shared by both runtimes.
 * The server question stays on the card; it never goes into the assistant message.
 */
import type { ExternalMcpInputCard } from '../../ai/mcp/client/externalMcpInputRequired';
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
