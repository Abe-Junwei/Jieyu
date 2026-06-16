// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import {
  completeAgentLoopCheckpointTask,
  loadPendingAgentLoopCheckpointFromTaskId,
  persistAgentLoopCheckpointTask,
} from './agentLoopCheckpoint';
import { reconcilePendingAgentLoopCheckpointFromDexie } from './reconcileAgentLoopSessionMemoryFromDexie';

describe('reconcilePendingAgentLoopCheckpointFromDexie', () => {
  beforeEach(async () => {
    await db.open();
    await db.ai_tasks.clear();
  });

  it('hydrates from latest pending ai_tasks row when session has no checkpoint', async () => {
    const taskId = await persistAgentLoopCheckpointTask({
      targetId: 'assistant-cold',
      checkpoint: {
        kind: 'token_budget_warning',
        originalUserText: 'hello',
        continuationInput: 'payload',
        step: 1,
        createdAt: '2026-05-01T00:00:00.000Z',
      },
    });

    const next = await reconcilePendingAgentLoopCheckpointFromDexie({});
    expect(next.pendingAgentLoopCheckpoint).toMatchObject({
      taskId,
      originalUserText: 'hello',
      continuationInput: 'payload',
      step: 1,
    });
  });

  it('clears session checkpoint when durable task is no longer pending', async () => {
    const taskId = await persistAgentLoopCheckpointTask({
      targetId: 'assistant-stale',
      checkpoint: {
        kind: 'token_budget_warning',
        originalUserText: 'a',
        continuationInput: 'b',
        step: 1,
        createdAt: '2026-05-01T00:00:00.000Z',
      },
    });
    await completeAgentLoopCheckpointTask(taskId);

    const next = await reconcilePendingAgentLoopCheckpointFromDexie({
      pendingAgentLoopCheckpoint: {
        kind: 'token_budget_warning',
        taskId,
        originalUserText: 'a',
        continuationInput: 'b',
        step: 1,
        createdAt: '2026-05-01T00:00:00.000Z',
      },
    });
    expect(next.pendingAgentLoopCheckpoint).toBeUndefined();
  });

  it('after stale taskId clears, hydrates the latest remaining pending row (multi-tab style)', async () => {
    const staleId = await persistAgentLoopCheckpointTask({
      targetId: 'assistant-stale-mt',
      checkpoint: {
        kind: 'token_budget_warning',
        originalUserText: 'old-tab',
        continuationInput: 'p-old',
        step: 1,
        createdAt: '2026-05-01T00:00:00.000Z',
      },
    });
    await completeAgentLoopCheckpointTask(staleId);

    const freshId = await persistAgentLoopCheckpointTask({
      targetId: 'assistant-fresh-mt',
      checkpoint: {
        kind: 'token_budget_warning',
        originalUserText: 'new-tab',
        continuationInput: 'p-new',
        step: 1,
        createdAt: '2026-05-01T00:01:00.000Z',
      },
    });
    await db.ai_tasks.update(freshId, { updatedAt: '2026-05-01T00:02:00.000Z' });

    const next = await reconcilePendingAgentLoopCheckpointFromDexie({
      pendingAgentLoopCheckpoint: {
        kind: 'token_budget_warning',
        taskId: staleId,
        originalUserText: 'old-tab',
        continuationInput: 'p-old',
        step: 1,
        createdAt: '2026-05-01T00:00:00.000Z',
      },
    });
    expect(next.pendingAgentLoopCheckpoint?.taskId).toBe(freshId);
    expect(next.pendingAgentLoopCheckpoint?.originalUserText).toBe('new-tab');
  });

  it('skips global latest hydrate when allowGlobalHydrate is false', async () => {
    await persistAgentLoopCheckpointTask({
      targetId: 'assistant-no-global',
      checkpoint: {
        kind: 'token_budget_warning',
        originalUserText: 'other-conv',
        continuationInput: 'payload',
        step: 1,
        createdAt: '2026-05-01T00:00:00.000Z',
      },
    });

    const next = await reconcilePendingAgentLoopCheckpointFromDexie(
      {},
      {
        allowGlobalHydrate: false,
      },
    );
    expect(next.pendingAgentLoopCheckpoint).toBeUndefined();
  });

  it('scopes global hydrate to the active conversation via assistant message targetId', async () => {
    const timestamp = '2026-05-01T00:00:00.000Z';
    await db.ai_conversations.bulkAdd([
      {
        id: 'conv-a',
        title: 'A',
        mode: 'assistant',
        providerId: 'mock',
        model: 'mock',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'conv-b',
        title: 'B',
        mode: 'assistant',
        providerId: 'mock',
        model: 'mock',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ]);
    await db.ai_messages.add({
      id: 'assistant-conv-a',
      conversationId: 'conv-a',
      role: 'assistant',
      content: 'handoff',
      status: 'done',
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await persistAgentLoopCheckpointTask({
      targetId: 'assistant-conv-a',
      checkpoint: {
        kind: 'token_budget_warning',
        originalUserText: 'conv-a-handoff',
        continuationInput: 'payload-a',
        step: 1,
        createdAt: timestamp,
      },
    });

    const scopedToA = await reconcilePendingAgentLoopCheckpointFromDexie(
      {},
      { conversationId: 'conv-a' },
    );
    expect(scopedToA.pendingAgentLoopCheckpoint?.originalUserText).toBe('conv-a-handoff');

    const scopedToB = await reconcilePendingAgentLoopCheckpointFromDexie(
      {},
      { conversationId: 'conv-b' },
    );
    expect(scopedToB.pendingAgentLoopCheckpoint).toBeUndefined();
  });

  it('returns same reference when session checkpoint already matches durable row', async () => {
    const taskId = await persistAgentLoopCheckpointTask({
      targetId: 'assistant-same',
      checkpoint: {
        kind: 'token_budget_warning',
        originalUserText: 'same',
        continuationInput: 'body',
        step: 2,
        createdAt: '2026-05-01T01:00:00.000Z',
      },
    });
    const loaded = await loadPendingAgentLoopCheckpointFromTaskId(taskId);
    expect(loaded).toBeTruthy();
    const memory = { pendingAgentLoopCheckpoint: loaded! };
    const next = await reconcilePendingAgentLoopCheckpointFromDexie(memory);
    expect(next).toBe(memory);
  });
});
