import type { PendingAiToolCall, PreviewContract } from '../chat/chatDomain.types';
import { buildAiChangeSetFromPendingToolCall, summarizeAiChatToolArgumentsForPreview } from './AiChangeSetProtocol';

const AI_CHANGE_TRANSACTION_PREVIEW_SCHEMA_VERSION = 1 as const;

type AiChangeTransactionPreviewKindV1 = 'propose_changes' | 'single_tool';

/**
 * One child step in a pending change transaction (propose batch row or single-tool scope row).
 * Aligns with `AiChangeSetItem` / `AiChangeSetPreview` data produced from the same `PendingAiToolCall`.
 */
interface AiChangeTransactionPreviewChildStepV1 {
  index: number;
  toolName: string;
  targetId: string;
  argsSummary: string;
}

/**
 * T3-a: canonical preview bundle for confirm UI and future dry-run (v1).
 * Built only from existing pending fields — no new persistence.
 */
export interface AiChangeTransactionPreviewV1 {
  schemaVersion: typeof AI_CHANGE_TRANSACTION_PREVIEW_SCHEMA_VERSION;
  kind: AiChangeTransactionPreviewKindV1;
  parentToolName: string;
  requestId?: string;
  /** Batch / tool headline (matches `AiChangeSet.description`). */
  headline: string;
  /**
   * Raw machine strings from `PendingAiToolCall.impactPreview`.
   * `AiChatAlertsPanel` continues to apply `normalizeImpactPreviewLines` + `slice(0, 3)` for display.
   */
  impactPreviewSourceLines: readonly string[];
  previewContract?: PreviewContract;
  childSteps: readonly AiChangeTransactionPreviewChildStepV1[];
  readModelEpochCaptured?: number;
  /** Same generation pass as `buildAiChangeSetFromPendingToolCall` for correlation. */
  changeSetSummaryId: string;
}

function inferPreviewKind(pending: PendingAiToolCall): AiChangeTransactionPreviewKindV1 {
  if (pending.call.name === 'propose_changes' && (pending.proposedChildCalls?.length ?? 0) > 0) {
    return 'propose_changes';
  }
  return 'single_tool';
}

/**
 * Derives the v1 preview DTO from a pending tool call. Idempotent w.r.t. pending snapshot.
 */
export function buildAiChangeTransactionPreviewV1(pending: PendingAiToolCall): AiChangeTransactionPreviewV1 {
  const changeSet = buildAiChangeSetFromPendingToolCall(pending);
  const kind = inferPreviewKind(pending);
  const argSummary = summarizeAiChatToolArgumentsForPreview(pending.call.arguments);
  const childSteps: AiChangeTransactionPreviewChildStepV1[] = changeSet.changes.map((ch, i) => ({
    index: i,
    toolName: kind === 'propose_changes' ? ch.field : pending.call.name,
    targetId: ch.unitId,
    argsSummary: kind === 'propose_changes' ? ch.after : argSummary,
  }));
  return {
    schemaVersion: AI_CHANGE_TRANSACTION_PREVIEW_SCHEMA_VERSION,
    kind,
    parentToolName: pending.call.name,
    ...((pending.requestId ?? pending.call.requestId) ? { requestId: pending.requestId ?? pending.call.requestId } : {}),
    headline: changeSet.description,
    impactPreviewSourceLines: Object.freeze([...(pending.impactPreview ?? [])]),
    ...(pending.previewContract ? { previewContract: pending.previewContract } : {}),
    childSteps: Object.freeze(childSteps),
    ...(pending.readModelEpochCaptured !== undefined ? { readModelEpochCaptured: pending.readModelEpochCaptured } : {}),
    changeSetSummaryId: changeSet.id,
  };
}
