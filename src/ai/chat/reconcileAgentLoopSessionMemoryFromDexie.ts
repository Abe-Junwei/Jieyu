import type { AiSessionMemory } from './chatDomain.types';
import { loadLatestPendingAgentLoopCheckpoint, loadPendingAgentLoopCheckpointFromTaskId } from './agentLoopCheckpoint';

function pendingAgentLoopCheckpointEqual(
  a: NonNullable<AiSessionMemory['pendingAgentLoopCheckpoint']>,
  b: NonNullable<AiSessionMemory['pendingAgentLoopCheckpoint']>,
): boolean {
  return a.taskId === b.taskId
    && a.step === b.step
    && a.originalUserText === b.originalUserText
    && a.continuationInput === b.continuationInput
    && a.createdAt === b.createdAt
    && (a.estimatedRemainingTokens ?? null) === (b.estimatedRemainingTokens ?? null)
    && a.kind === b.kind;
}

/**
 * Align `pendingAgentLoopCheckpoint` in session memory with durable `ai_tasks` rows.
 * - Cold start (no pending in session): hydrate from the latest pending resumable `agent_loop` row if any.
 * - Session holds `taskId`: reload from DB; drop pending if the task is no longer resumable.
 */
export async function reconcilePendingAgentLoopCheckpointFromDexie(
  current: AiSessionMemory,
): Promise<AiSessionMemory> {
  const pending = current.pendingAgentLoopCheckpoint ?? null;
  if (pending?.taskId) {
    const durable = await loadPendingAgentLoopCheckpointFromTaskId(pending.taskId.trim());
    if (!durable) {
      const { pendingAgentLoopCheckpoint: _removed, ...rest } = current;
      // 另一 tab 已终态该 task 后：清空悬挂项并再尝试「最新可续跑」行（多 tab / 取消竞态）
      return reconcilePendingAgentLoopCheckpointFromDexie(rest);
    }
    if (pendingAgentLoopCheckpointEqual(pending, durable)) {
      return current;
    }
    return { ...current, pendingAgentLoopCheckpoint: durable };
  }
  if (pending) {
    return current;
  }
  const latest = await loadLatestPendingAgentLoopCheckpoint();
  if (!latest) {
    return current;
  }
  return { ...current, pendingAgentLoopCheckpoint: latest };
}
