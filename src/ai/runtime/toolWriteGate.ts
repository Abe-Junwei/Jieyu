import type { AiChatToolCall, AiPromptContext } from '../chat/chatDomain.types';
import type { LocalContextToolCall } from '../chat/localContextToolTypes';
import { hasResolvableSelectionTargetForTool } from '../chat/toolCallPlanner';
import { getAiToolPolicy } from '../policy/aiToolPolicyMatrix';
import {
  getLocalContextToolEffect,
  isReadOnlyLocalContextToolName,
} from '../policy/localContextToolEffects';
import { isWriteLikeToolCall } from '../policy/resolveExecutionPolicy';

export type ToolWriteGateReasonCode =
  | 'gate_disabled'
  | 'readonly_allowed'
  | 'context_unavailable'
  | 'scope_target_unresolved'
  | 'destructive_denied'
  | 'write_preview_allowed';

export type ToolWriteGateDecision =
  | { allowed: true; reasonCode: ToolWriteGateReasonCode }
  | { allowed: false; reasonCode: ToolWriteGateReasonCode; message: string };

export function assertLocalContextToolAllowed(
  call: LocalContextToolCall,
  context: AiPromptContext | null,
  options: { gateEnabled: boolean },
): ToolWriteGateDecision {
  if (!options.gateEnabled) {
    return { allowed: true, reasonCode: 'gate_disabled' };
  }

  if (isReadOnlyLocalContextToolName(call.name)) {
    return { allowed: true, reasonCode: 'readonly_allowed' };
  }

  if (!context) {
    return {
      allowed: false,
      reasonCode: 'context_unavailable',
      message: 'Tool execution requires an active project context.',
    };
  }

  const effect = getLocalContextToolEffect(call.name);
  if (effect === 'write_preview') {
    return { allowed: true, reasonCode: 'write_preview_allowed' };
  }

  return { allowed: true, reasonCode: 'readonly_allowed' };
}

export function assertAiChatToolWriteAllowed(
  toolCall: AiChatToolCall,
  context: AiPromptContext | null,
  options: { gateEnabled: boolean; destructiveAllowed: boolean },
): ToolWriteGateDecision {
  if (!options.gateEnabled) {
    return { allowed: true, reasonCode: 'gate_disabled' };
  }

  if (!isWriteLikeToolCall(toolCall)) {
    return { allowed: true, reasonCode: 'readonly_allowed' };
  }

  const policy = getAiToolPolicy(toolCall.name);
  if (policy.destructive && !options.destructiveAllowed) {
    return {
      allowed: false,
      reasonCode: 'destructive_denied',
      message: 'Destructive tool calls are disabled for this session.',
    };
  }

  if (
    policy.requiresExplicitTarget &&
    !hasResolvableSelectionTargetForTool(toolCall.name, context)
  ) {
    return {
      allowed: false,
      reasonCode: 'scope_target_unresolved',
      message: 'Write target is outside the current scope or unresolved.',
    };
  }

  return { allowed: true, reasonCode: 'write_preview_allowed' };
}
