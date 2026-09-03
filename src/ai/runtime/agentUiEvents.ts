/**
 * A11 — user-visible HITL events (write preview / block / confirm).
 * Same agentRunId as tool-decision audit. Not an ADK Event runtime.
 */

import { featureFlags } from '../config/featureFlags';
import type { AiChangeTransactionPreviewV1 } from '../changeset/aiChangeTransactionPreviewV1';
import { buildAiChangeTransactionPreviewV1 } from '../changeset/aiChangeTransactionPreviewV1';
import type { PendingAiToolCall } from '../chat/chatDomain.types';
import {
  getToolDecisionFailureTriage,
  type AiToolDecisionFailureTriage,
} from '../chat/toolDecisionFailureReason';

export type AgentUiEventKind =
  | 'write_preview_pending'
  | 'write_blocked'
  | 'write_confirmed'
  | 'write_cancelled';

export type AgentUiEvent = {
  kind: AgentUiEventKind;
  timestamp: string;
  agentRunId?: string;
  requestId?: string;
  toolName?: string;
  triage?: AiToolDecisionFailureTriage;
  reasonCode?: string;
  preview?: AiChangeTransactionPreviewV1;
};

export type AgentUiEventHandler = (event: AgentUiEvent) => void;

export class AgentUiEventBus {
  private readonly handlers = new Set<AgentUiEventHandler>();

  subscribe(handler: AgentUiEventHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  emit(event: AgentUiEvent): void {
    for (const handler of this.handlers) {
      handler(event);
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}

const defaultBus = new AgentUiEventBus();

export function getDefaultAgentUiEventBus(): AgentUiEventBus {
  return defaultBus;
}

export function resetDefaultAgentUiEventBusForTests(): void {
  defaultBus.clear();
}

function nowIso(): string {
  return new Date().toISOString();
}

export function publishAgentUiEvent(event: AgentUiEvent): void {
  if (!featureFlags.aiAgentUiPreviewEnabled) return;
  getDefaultAgentUiEventBus().emit(event);
}

export function publishAgentWritePreviewPending(input: {
  pending: PendingAiToolCall;
  agentRunId?: string;
}): void {
  const requestId = input.pending.requestId ?? input.pending.call.requestId;
  const agentRunId = input.agentRunId ?? input.pending.auditContext?.agentRunId;
  const preview = buildAiChangeTransactionPreviewV1(input.pending, agentRunId);
  publishAgentUiEvent({
    kind: 'write_preview_pending',
    timestamp: nowIso(),
    toolName: input.pending.call.name,
    ...(agentRunId ? { agentRunId } : {}),
    ...(requestId ? { requestId } : {}),
    ...(input.pending.policyReasonCode
      ? {
          reasonCode: input.pending.policyReasonCode,
          triage: getToolDecisionFailureTriage(input.pending.policyReasonCode),
        }
      : {}),
    preview,
  });
}

export function publishAgentWriteBlocked(input: {
  toolName: string;
  reasonCode: string;
  agentRunId?: string;
  requestId?: string;
}): void {
  publishAgentUiEvent({
    kind: 'write_blocked',
    timestamp: nowIso(),
    toolName: input.toolName,
    reasonCode: input.reasonCode,
    triage: getToolDecisionFailureTriage(input.reasonCode),
    ...(input.agentRunId ? { agentRunId: input.agentRunId } : {}),
    ...(input.requestId ? { requestId: input.requestId } : {}),
  });
}

export function publishAgentWriteConfirmed(input: {
  toolName: string;
  agentRunId?: string;
  requestId?: string;
}): void {
  publishAgentUiEvent({
    kind: 'write_confirmed',
    timestamp: nowIso(),
    toolName: input.toolName,
    ...(input.agentRunId ? { agentRunId: input.agentRunId } : {}),
    ...(input.requestId ? { requestId: input.requestId } : {}),
  });
}

export function publishAgentWriteCancelled(input: {
  toolName: string;
  agentRunId?: string;
  requestId?: string;
}): void {
  publishAgentUiEvent({
    kind: 'write_cancelled',
    timestamp: nowIso(),
    toolName: input.toolName,
    ...(input.agentRunId ? { agentRunId: input.agentRunId } : {}),
    ...(input.requestId ? { requestId: input.requestId } : {}),
  });
}
