import { resolveAiChatStreamCompletion } from './useAiChat.streamCompletion';
import type { ResolveAiChatStreamCompletionParams, ResolveAiChatStreamCompletionResult } from './useAiChat.streamCompletion';

/** Per-turn identity + model output slice (varies between first completion and agent-loop steps). */
export type AiChatStreamCompletionCore = Pick<
  ResolveAiChatStreamCompletionParams,
  'assistantId' | 'assistantContent' | 'userText' | 'aiContext'
>;

/**
 * Merge stable send() wiring with per-call core fields, then run `resolveAiChatStreamCompletion`.
 * Keeps `useAiChat` call sites small and ensures first-turn vs agent-loop use the same shape.
 */
export async function finalizeAssistantStreamCompletion(
  core: AiChatStreamCompletionCore,
  env: Omit<ResolveAiChatStreamCompletionParams, keyof AiChatStreamCompletionCore>,
): Promise<ResolveAiChatStreamCompletionResult> {
  return resolveAiChatStreamCompletion({ ...env, ...core });
}
