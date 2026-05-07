import { isDestructiveToolCall } from '../chat/toolCallHelpers';
import type { AiChatToolCall, AiSessionMemory } from '../chat/chatDomain.types';
import {
  resolveBackgroundToolSandboxDecision,
  type BackgroundToolSandboxDecision,
  type BackgroundToolSandboxProfile,
} from '../sandbox/backgroundToolSandbox';

/** Virtual workspace root for AI chat session sidecar sandbox checks (not host OS paths). */
const AI_CHAT_SESSION_SIDECAR_SANDBOX_VIRTUAL_ROOT = '/ai-chat-runtime';

/** Virtual write paths for non–main-chain session mutations (F4 capability isolation). */
export const AI_CHAT_SESSION_SIDECAR_WRITE_PATH = {
  backgroundExtraction: 'session-memory/background-extraction',
  pinnedMessageDirective: 'session-memory/pinned-message-directive',
  sendPreflightDirective: 'session-memory/send-preflight-directive',
} as const;
export type AiChatSessionSidecarWritePath = (typeof AI_CHAT_SESSION_SIDECAR_WRITE_PATH)[keyof typeof AI_CHAT_SESSION_SIDECAR_WRITE_PATH];

export type PolicyShapeToolCall = { name: string; arguments: Record<string, unknown> };

function isBatchToolCall(call: PolicyShapeToolCall): boolean {
  return Object.values(call.arguments).some((value) => Array.isArray(value) && value.length > 1)
    || call.name === 'propose_changes'
    || call.name === 'merge_transcription_segments';
}

export function isWriteLikeToolCall(call: PolicyShapeToolCall): boolean {
  if (isDestructiveToolCall(call.name as AiChatToolCall['name'])) return true;
  return /^(create_|set_|split_|merge_|clear_|link_|unlink_|add_|remove_|switch_|auto_gloss_)/.test(call.name)
    || call.name === 'propose_changes';
}

export type UserDirectivePolicyDecision =
  | { action: 'allow' }
  | {
      action: 'block';
      reason: 'user_directive_never_execute' | 'user_directive_deny_destructive' | 'user_directive_deny_batch';
      message: string;
    }
  | {
      action: 'confirm';
      reason: 'user_directive_confirmation_required';
      message: string;
    };

/**
 * Session-level tool execution preferences (T2 policy family).
 * Used on the main chat chain before destructive gate / auto-execute.
 */
export function resolveUserDirectivePolicyDecision(
  toolCall: PolicyShapeToolCall,
  sessionMemory: AiSessionMemory,
): UserDirectivePolicyDecision {
  const toolPreference = sessionMemory.toolPreferences?.autoExecute;
  const safetyPreferences = sessionMemory.safetyPreferences;
  const policyBlocksDestructive = safetyPreferences?.denyDestructive === true && isDestructiveToolCall(toolCall.name as AiChatToolCall['name']);
  const policyBlocksBatch = safetyPreferences?.denyBatch === true && isBatchToolCall(toolCall);
  const policyBlocksExecution = toolPreference === 'never' || policyBlocksDestructive || policyBlocksBatch;
  if (policyBlocksExecution) {
    const reason = toolPreference === 'never'
      ? 'user_directive_never_execute'
      : policyBlocksDestructive
        ? 'user_directive_deny_destructive'
        : 'user_directive_deny_batch';
    const message = reason === 'user_directive_never_execute'
      ? 'Blocked by user directive: do not execute tools automatically.'
      : reason === 'user_directive_deny_destructive'
        ? 'Blocked by user directive: destructive actions are disabled.'
        : 'Blocked by user directive: batch actions are disabled.';
    return { action: 'block', reason, message };
  }

  const policyRequiresConfirmation = toolPreference === 'ask_first'
    || (safetyPreferences?.requireImpactPreview === true && isWriteLikeToolCall(toolCall));
  if (policyRequiresConfirmation) {
    return {
      action: 'confirm',
      reason: 'user_directive_confirmation_required',
      message: 'User directive requires confirmation before execution.',
    };
  }

  return { action: 'allow' };
}

export interface ResolveAiChatBackgroundMemorySandboxPolicyParams {
  sandboxEnabled: boolean;
  profile: BackgroundToolSandboxProfile;
  authorizedWriteDirs: readonly string[];
}

/** Shared input for F4 session sidecar gates (pinned / send-preflight / background flush). */
export type AiChatSessionSidecarSandboxContext = ResolveAiChatBackgroundMemorySandboxPolicyParams;

export type ResolveAiChatSessionSidecarSandboxPolicyParams = ResolveAiChatBackgroundMemorySandboxPolicyParams & {
  virtualWritePath: AiChatSessionSidecarWritePath;
};

/**
 * F4 session sidecar writes (pinned replay, send-preflight directives, background memory flush):
 * same sandbox decision shape as other background file-write checks.
 */
export function resolveAiChatSessionSidecarSandboxPolicy(
  params: ResolveAiChatSessionSidecarSandboxPolicyParams,
): BackgroundToolSandboxDecision {
  return resolveBackgroundToolSandboxDecision({
    enabled: params.sandboxEnabled,
    profile: params.profile,
    kind: 'file_write',
    workspaceRoot: AI_CHAT_SESSION_SIDECAR_SANDBOX_VIRTUAL_ROOT,
    path: params.virtualWritePath,
    authorizedWriteDirs: params.authorizedWriteDirs,
  });
}

/**
 * F4 / background memory flush: same sandbox decision shape as file-write checks elsewhere.
 * Centralizes the virtual path pair so main-chain and background policy docs share one anchor.
 */
export function resolveAiChatBackgroundMemorySandboxPolicy(
  params: ResolveAiChatBackgroundMemorySandboxPolicyParams,
): BackgroundToolSandboxDecision {
  return resolveAiChatSessionSidecarSandboxPolicy({
    ...params,
    virtualWritePath: AI_CHAT_SESSION_SIDECAR_WRITE_PATH.backgroundExtraction,
  });
}
