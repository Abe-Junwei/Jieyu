/**
 * 工具执行成功后的 session memory 偏好补丁 | Post-exec session memory preference patching
 *
 * Thin wrapper around `applyChatToolPreferenceEffects` (A10 unique commit is `commitToolEffects`).
 */

import { applyChatToolPreferenceEffects } from '../../ai/runtime/commitToolEffects';
import type { AiChatToolName, AiSessionMemory } from '../../ai/chat/chatDomain.types';

export interface PostExecSessionPatchInput {
  sessionMemory: AiSessionMemory;
  toolName: AiChatToolName;
  /** 工具参数中的 language 字段（可选） | language arg from tool call (optional) */
  language: string | undefined;
  /** 工具参数中的 layerId 字段（可选） | layerId arg from tool call (optional) */
  layerId: string | undefined;
}

/**
 * 返回补丁后的 session memory，不产生副作用 | Returns patched session memory, no side effects
 */
export function buildPostExecSessionMemory({
  sessionMemory,
  toolName,
  language,
  layerId,
}: PostExecSessionPatchInput): AiSessionMemory {
  return applyChatToolPreferenceEffects(sessionMemory, toolName, language, layerId);
}
