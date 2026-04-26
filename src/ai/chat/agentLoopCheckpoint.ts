import { getDb, type AiTaskDoc } from '../../db';
import type { TaskRunnerCheckpoint } from '../tasks/TaskRunner';
import type { AiSessionMemoryPendingAgentLoopCheckpoint } from './chatDomain.types';

const AGENT_LOOP_CHECKPOINT_KIND = 'agent_loop_token_budget_warning';
const AGENT_LOOP_TARGET_TYPE = 'ai_chat_agent_loop';

function nowIso(): string {
  return new Date().toISOString();
}

function createAgentLoopTaskId(): string {
  return `task_agent_loop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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

export function toAgentLoopTaskCheckpoint(
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
  const step = typeof data.step === 'number' && Number.isFinite(data.step)
    ? Math.max(1, Math.floor(data.step))
    : undefined;
  if (!originalUserText || !continuationInput || step === undefined) return undefined;
  return {
    kind: 'token_budget_warning',
    taskId: task.id,
    originalUserText,
    continuationInput,
    step,
    ...(typeof data.estimatedRemainingTokens === 'number' && Number.isFinite(data.estimatedRemainingTokens)
      ? { estimatedRemainingTokens: Math.max(0, Math.floor(data.estimatedRemainingTokens)) }
      : {}),
    createdAt: readString(data.createdAt) || checkpoint.at || nowIso(),
  };
}

export async function persistAgentLoopCheckpointTask(input: {
  checkpoint: AiSessionMemoryPendingAgentLoopCheckpoint;
  targetId: string;
  modelId?: string;
}): Promise<string> {
  const db = await getDb();
  const timestamp = nowIso();
  const taskId = input.checkpoint.taskId ?? createAgentLoopTaskId();
  const checkpointJson = JSON.stringify({
    ...toAgentLoopTaskCheckpoint(input.checkpoint),
    at: timestamp,
  });
  const existing = await db.collections.ai_tasks.findOne({ selector: { id: taskId } }).exec();
  if (existing) {
    await db.collections.ai_tasks.update(taskId, {
      status: 'pending',
      checkpointJson,
      lastHeartbeatAt: timestamp,
      handoffReason: 'token_budget_warning',
      updatedAt: timestamp,
    });
    return taskId;
  }

  await db.collections.ai_tasks.insert({
    id: taskId,
    taskType: 'agent_loop',
    status: 'pending',
    targetId: input.targetId,
    targetType: AGENT_LOOP_TARGET_TYPE,
    ...(input.modelId ? { modelId: input.modelId } : {}),
    attempt: 0,
    maxAttempts: 1,
    checkpointJson,
    lastHeartbeatAt: timestamp,
    resumable: true,
    handoffReason: 'token_budget_warning',
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  return taskId;
}

export async function loadPendingAgentLoopCheckpointFromTaskId(
  taskId: string,
): Promise<AiSessionMemoryPendingAgentLoopCheckpoint | undefined> {
  const normalizedTaskId = taskId.trim();
  if (!normalizedTaskId) return undefined;
  const db = await getDb();
  const task = await db.collections.ai_tasks.findOne({ selector: { id: normalizedTaskId } }).exec();
  return task ? fromAgentLoopTaskCheckpoint(task) : undefined;
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