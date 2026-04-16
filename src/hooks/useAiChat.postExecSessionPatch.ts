/**
 * 工具执行成功后的 session memory 偏好补丁 | Post-exec session memory preference patching
 *
 * autoExecute / confirmExecution / confirmBatch 三处共用的
 * "成功执行后更新 lastToolName / lastLanguage / lastLayerId" 逻辑。
 * Shared logic for updating lastToolName / lastLanguage / lastLayerId
 * after a successful tool execution across auto/confirm/batch paths.
 */

import { patchSessionMemoryPreferences } from '../ai/chat/sessionMemory';
import type { AiChatToolName, AiSessionMemory } from '../ai/chat/chatDomain.types';

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
  let next: AiSessionMemory = patchSessionMemoryPreferences(
    { ...sessionMemory, lastToolName: toolName },
    { lastToolName: toolName },
  );
  if (language) {
    next = patchSessionMemoryPreferences(
      { ...next, lastLanguage: language },
      { lastLanguage: language },
    );
  }
  if (layerId) {
    next = patchSessionMemoryPreferences(
      { ...next, lastLayerId: layerId },
      { lastLayerId: layerId },
    );
  }
  return next;
}
