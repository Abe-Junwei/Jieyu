import { getDb, type AiTaskDoc } from '../../db';
import type { TaskRunner, TaskRunnerCheckpoint } from '../tasks/TaskRunner';
import { getGlobalTaskRunner } from '../tasks/taskRunnerSingleton';
import type { AiSessionMemoryPendingAgentLoopCheckpoint } from './chatDomain.types';

const AGENT_LOOP_CHECKPOINT_KIND = 'agent_loop_token_budget_warning';
const AGENT_LOOP_TARGET_TYPE = 'ai_chat_agent_loop';

function nowIso(): string {
  return new Date().toISOString();
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseCheckpointJson(value: string | undefined): TaskRunnerCheckpoint | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const rec = parsed as Record<string, unknown>;
    const kind = readString(rec.kind);
    if (!kind) return null;
    return {
      kind,
      ...(typeof rec.message === 'string' ? { message: rec.message } : {}),
      ...(rec.data && typeof rec.data === 'object' && !Array.isArray(rec.data)
        ? { data: rec.data as Record<string, unknown> }
        : {}),
      ...(typeof rec.at === 'string' ? { at: rec.at } : {}),
    };
  } catch {
    return null;
  }
}

function isPendingResumableAgentLoopTask(
  task: Pick<AiTaskDoc, 'taskType' | 'status' | 'resumable' | 'handoffReason'>,
): boolean {
  return (
    task.taskType === 'agent_loop' &&
    task.status === 'pending' &&
    task.resumable !== false &&
    task.handoffReason === 'token_budget_warning'
  );
}

function toAgentLoopTaskCheckpoint(
  checkpoint: AiSessionMemoryPendingAgentLoopCheckpoint,
): TaskRunnerCheckpoint {
  return {
    kind: AGENT_LOOP_CHECKPOINT_KIND,
    data: {
      originalUserText: checkpoint.originalUserText,
      continuationInput: checkpoint.continuationInput,
      step: checkpoint.step,
      ...(checkpoint.estimatedRemainingTokens !== undefined
        ? { estimatedRemainingTokens: checkpoint.estimatedRemainingTokens }
        : {}),
      createdAt: checkpoint.createdAt,
    },
  };
}

export function fromAgentLoopTaskCheckpoint(
  task: Pick<AiTaskDoc, 'id' | 'checkpointJson'>,
): AiSessionMemoryPendingAgentLoopCheckpoint | undefined {
  const checkpoint = parseCheckpointJson(task.checkpointJson);
  if (!checkpoint || checkpoint.kind !== AGENT_LOOP_CHECKPOINT_KIND) return undefined;
  const data = checkpoint.data ?? {};
  const originalUserText = readString(data.originalUserText);
  const continuationInput = readString(data.continuationInput);
  const step =
    typeof data.step === 'number' && Number.isFinite(data.step)
      ? Math.max(1, Math.floor(data.step))
      : undefined;
  if (!originalUserText || !continuationInput || step === undefined) return undefined;
  return {
    kind: 'token_budget_warning',
    taskId: task.id,
    originalUserText,
    continuationInput,
    step,
    ...(typeof data.estimatedRemainingTokens === 'number' &&
    Number.isFinite(data.estimatedRemainingTokens)
      ? { estimatedRemainingTokens: Math.max(0, Math.floor(data.estimatedRemainingTokens)) }
      : {}),
    createdAt: readString(data.createdAt) || checkpoint.at || nowIso(),
  };
}

export async function persistAgentLoopCheckpointTask(
  input: {
    checkpoint: AiSessionMemoryPendingAgentLoopCheckpoint;
    targetId: string;
    modelId?: string;
    agentRunId?: string;
  },
  runner: Pick<TaskRunner, 'parkCheckpoint'> = getGlobalTaskRunner(),
): Promise<string> {
  return runner.parkCheckpoint({
    ...(input.checkpoint.taskId ? { taskId: input.checkpoint.taskId } : {}),
    targetId: input.targetId,
    targetType: AGENT_LOOP_TARGET_TYPE,
    ...(input.modelId ? { modelId: input.modelId } : {}),
    ...(input.agentRunId ? { agentRunId: input.agentRunId } : {}),
    checkpoint: toAgentLoopTaskCheckpoint(input.checkpoint),
    handoffReason: 'token_budget_warning',
    resumable: true,
  });
}

export async function loadPendingAgentLoopCheckpointFromTaskId(
  taskId: string,
): Promise<AiSessionMemoryPendingAgentLoopCheckpoint | undefined> {
  const normalizedTaskId = taskId.trim();
  if (!normalizedTaskId) return undefined;
  const db = await getDb();
  const task = await db.collections.ai_tasks.findOne({ selector: { id: normalizedTaskId } }).exec();
  if (!task) return undefined;
  const row = task.toJSON();
  if (!isPendingResumableAgentLoopTask(row)) return undefined;
  return fromAgentLoopTaskCheckpoint(row);
}

/** Resolve the conversation that owns an agent-loop checkpoint task (via assistant message target). */
export async function resolveAgentLoopCheckpointConversationId(
  checkpoint: Pick<AiSessionMemoryPendingAgentLoopCheckpoint, 'taskId'>,
): Promise<string | undefined> {
  const taskId = checkpoint.taskId?.trim();
  if (!taskId) return undefined;
  const db = await getDb();
  const task = await db.collections.ai_tasks.findOne({ selector: { id: taskId } }).exec();
  if (!task) return undefined;
  return resolveConversationIdForAgentLoopTarget(task.toJSON().targetId);
}

export type LoadLatestPendingAgentLoopCheckpointOptions = Readonly<{
  /** When set, only return a checkpoint whose assistant message belongs to this conversation. */
  conversationId?: string;
}>;

async function resolveConversationIdForAgentLoopTarget(
  targetId: string,
): Promise<string | undefined> {
  const normalizedTargetId = targetId.trim();
  if (!normalizedTargetId) return undefined;
  const db = await getDb();
  const message = await db.collections.ai_messages
    .findOne({ selector: { id: normalizedTargetId } })
    .exec();
  const conversationId = message?.toJSON().conversationId?.trim();
  return conversationId || undefined;
}

export async function loadLatestPendingAgentLoopCheckpoint(
  options?: LoadLatestPendingAgentLoopCheckpointOptions,
): Promise<AiSessionMemoryPendingAgentLoopCheckpoint | undefined> {
  const scopedConversationId = options?.conversationId?.trim();
  const db = await getDb();
  const pendingTasks = (await db.collections.ai_tasks.find().exec())
    .map((item) => item.toJSON())
    .filter((row) => isPendingResumableAgentLoopTask(row))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  for (const task of pendingTasks) {
    if (scopedConversationId) {
      const targetConversationId = await resolveConversationIdForAgentLoopTarget(task.targetId);
      if (targetConversationId !== scopedConversationId) continue;
    }
    const checkpoint = fromAgentLoopTaskCheckpoint(task);
    if (checkpoint) return checkpoint;
  }
  return undefined;
}

export async function completeAgentLoopCheckpointTask(taskId: string): Promise<void> {
  const normalizedTaskId = taskId.trim();
  if (!normalizedTaskId) return;
  const db = await getDb();
  const timestamp = nowIso();
  await db.collections.ai_tasks.update(normalizedTaskId, {
    status: 'done',
    resumable: false,
    completedAt: timestamp,
    updatedAt: timestamp,
  });
}

export async function cancelAgentLoopCheckpointTask(taskId: string): Promise<void> {
  const normalizedTaskId = taskId.trim();
  if (!normalizedTaskId) return;
  const db = await getDb();
  const timestamp = nowIso();
  await db.collections.ai_tasks.update(normalizedTaskId, {
    status: 'failed',
    resumable: false,
    errorMessage: 'cancelled_by_user',
    completedAt: timestamp,
    updatedAt: timestamp,
  });
}
