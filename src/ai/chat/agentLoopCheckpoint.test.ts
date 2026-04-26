// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import {
  completeAgentLoopCheckpointTask,
  fromAgentLoopTaskCheckpoint,
  loadPendingAgentLoopCheckpointFromTaskId,
  persistAgentLoopCheckpointTask,
} from './agentLoopCheckpoint';

describe('agentLoopCheckpoint', () => {
  beforeEach(async () => {
    await db.open();
    await db.ai_tasks.clear();
  });

  it('persists pending agent-loop checkpoint as resumable ai_task row', async () => {
    const taskId = await persistAgentLoopCheckpointTask({
      targetId: 'assistant-1',
      modelId: 'mock-model',
      checkpoint: {
        kind: 'token_budget_warning',
        originalUserText: 'count speakers',
        continuationInput: '__LOCAL_TOOL_RESULT__',
        step: 2,
        estimatedRemainingTokens: 12000,
        createdAt: '2026-04-27T00:00:00.000Z',
      },
    });

    const task = await db.ai_tasks.get(taskId);
    expect(task).toMatchObject({
      taskType: 'agent_loop',
      status: 'pending',
      targetId: 'assistant-1',
      targetType: 'ai_chat_agent_loop',
      modelId: 'mock-model',
      resumable: true,
      handoffReason: 'token_budget_warning',
    });
    expect(fromAgentLoopTaskCheckpoint(task!)).toMatchObject({
      taskId,
      originalUserText: 'count speakers',
      continuationInput: '__LOCAL_TOOL_RESULT__',
      step: 2,
      estimatedRemainingTokens: 12000,
    });
  });

  it('loads pending checkpoint back from ai_task id', async () => {
    const taskId = await persistAgentLoopCheckpointTask({
      targetId: 'assistant-2',
      checkpoint: {
        kind: 'token_budget_warning',
        originalUserText: 'continue',
        continuationInput: 'payload',
        step: 1,
        createdAt: '2026-04-27T00:00:00.000Z',
      },
    });

    await expect(loadPendingAgentLoopCheckpointFromTaskId(taskId)).resolves.toMatchObject({
      taskId,
      originalUserText: 'continue',
      continuationInput: 'payload',
      step: 1,
    });
  });

  it('marks a consumed checkpoint task as done and non-resumable', async () => {
    const taskId = await persistAgentLoopCheckpointTask({
      targetId: 'assistant-3',
      checkpoint: {
        kind: 'token_budget_warning',
        originalUserText: 'continue later',
        continuationInput: 'payload',
        step: 1,
        createdAt: '2026-04-27T00:00:00.000Z',
      },
    });

    await completeAgentLoopCheckpointTask(taskId);

    const task = await db.ai_tasks.get(taskId);
    expect(task).toMatchObject({
      status: 'done',
      resumable: false,
    });
    expect(task?.completedAt).toBeTruthy();
  });
});