import type { AiChatToolCall } from './chatDomain.types';
import { validateToolCallArguments } from './toolCallHelpers';

/**
 * Phases of confirm-path dry-run failure (extend for read-model / policy checks without touching DB).
 */
export type ToolCallDryRunFailurePhase = 'args_schema';

export type ToolCallDryRunResult =
  | { ok: true }
  | { ok: false; phase: ToolCallDryRunFailurePhase; message: string };

/**
 * **T3-b — Confirm-path dry run (read-only).**
 *
 * - **Today:** `args_schema` delegates to `validateToolCallArguments` (Zod + legacy per-tool rules).
 * - **Not here:** auto-send / streaming pipeline still calls `validateToolCallArguments` directly — that path is “execute intent”, not “human confirm dry run”.
 * - **Future:** add phases (e.g. read-model target resolution) in this module only; keep `validateToolCallArguments` as the low-level argument contract.
 */
export function dryRunToolCallForConfirm(call: AiChatToolCall): ToolCallDryRunResult {
  const message = validateToolCallArguments(call);
  if (message) {
    return { ok: false, phase: 'args_schema', message };
  }
  return { ok: true };
}
