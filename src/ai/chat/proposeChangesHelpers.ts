import type { AiChatToolCall, AiChatToolName } from './chatDomain.types';
import { proposeChangesArgsSchema } from './toolCallSchemas';
import { AI_TOOL_CALL_ADAPTER_MAP } from '../../hooks/useAiToolCallHandler.adapters';

export type ParseProposedChildCallsResult =
  | { ok: true; description?: string; sourceEpoch?: number; children: AiChatToolCall[] }
  | { ok: false; error: string };

/**
 * Parse and validate `propose_changes` arguments into executable child tool calls.
 * Structural validation uses Zod; each child must map to a registered tool adapter (excluding nested propose_changes).
 */
export function parseProposedChildCallsFromArguments(arguments_: Record<string, unknown>): ParseProposedChildCallsResult {
  const structural = proposeChangesArgsSchema.safeParse(arguments_);
  if (!structural.success) {
    return {
      ok: false,
      error: structural.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
    };
  }

  const children: AiChatToolCall[] = [];
  for (let i = 0; i < structural.data.changes.length; i += 1) {
    const row = structural.data.changes[i]!;
    const rawName = (row.tool ?? row.name ?? '').trim();
    if (!rawName) {
      return { ok: false, error: `changes[${i}]: missing tool name` };
    }
    if (rawName === 'propose_changes') {
      return { ok: false, error: 'nested propose_changes is not allowed' };
    }
    if (!AI_TOOL_CALL_ADAPTER_MAP[rawName]) {
      return { ok: false, error: `changes[${i}]: unsupported tool "${rawName}"` };
    }
    const childArgs = row.arguments && typeof row.arguments === 'object' && !Array.isArray(row.arguments)
      ? row.arguments as Record<string, unknown>
      : {};
    children.push({
      name: rawName as AiChatToolName,
      arguments: childArgs,
    });
  }

  return {
    ok: true,
    ...(structural.data.description !== undefined ? { description: structural.data.description } : {}),
    ...(structural.data.sourceEpoch !== undefined ? { sourceEpoch: structural.data.sourceEpoch } : {}),
    children,
  };
}
