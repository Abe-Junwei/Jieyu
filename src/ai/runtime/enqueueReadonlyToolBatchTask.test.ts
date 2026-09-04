// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../db';
import { BackgroundCatalogTrustError } from '../catalog/aiToolCatalog';
import { TaskRunner } from '../tasks/TaskRunner';
import { PARALLEL_READONLY_COMPOSED_STEP_SAMPLE } from '../vertical/composedWorkflowTemplates';
import { enqueueReadonlyToolBatchTask } from './enqueueReadonlyToolBatchTask';
import type { AiSessionMemory } from '../chat/chatDomain.types';

function makeCtx(sessionMemory: AiSessionMemory = { projectFacts: [] }) {
  return {
    sessionMemory,
    updateSessionMemory: vi.fn(),
    persistSessionMemory: vi.fn(),
  };
}

describe('enqueueReadonlyToolBatchTask', () => {
  beforeEach(async () => {
    await db.open();
    await db.ai_tasks.clear();
  });

  afterEach(async () => {
    await db.ai_tasks.clear();
  });

  it('enqueues the parallel readonly sample and persists agentRunId', async () => {
    const runner = new TaskRunner(1);
    const ctx = makeCtx();
    const items = PARALLEL_READONLY_COMPOSED_STEP_SAMPLE.toolNames.map((toolName) => ({
      call: {
        name: toolName,
        arguments: toolName === 'search_units' ? { query: 'hello' } : {},
      },
      execute: async () => ({ ok: true, result: { sample: toolName } }),
    }));

    const enqueued = await enqueueReadonlyToolBatchTask(runner, {
      agentRunId: 'run_parallel_sample',
      targetId: 'assistant-parallel',
      ctx,
      items,
    });

    const results = await enqueued.result;
    expect(results.map((item) => item.result)).toEqual([
      { sample: 'search_units' },
      { sample: 'list_layers' },
    ]);
    expect(ctx.updateSessionMemory).toHaveBeenCalledTimes(1);
    expect(ctx.persistSessionMemory).toHaveBeenCalledTimes(1);

    const stored = await db.ai_tasks.get(enqueued.taskId);
    expect(stored).toMatchObject({
      agentRunId: 'run_parallel_sample',
      taskType: 'agent_loop',
      targetType: 'parallel_readonly_batch',
      status: 'done',
      resumable: false,
    });
    expect(JSON.parse(stored?.checkpointJson ?? '{}')).toMatchObject({
      kind: 'parallel_readonly_batch',
      data: { toolNames: ['search_units', 'list_layers'] },
    });
  });

  it('rejects write catalog tools before enqueue', async () => {
    const runner = new TaskRunner(1);
    await expect(
      enqueueReadonlyToolBatchTask(runner, {
        agentRunId: 'run_illegal',
        targetId: 'assistant-illegal',
        ctx: makeCtx(),
        items: [
          {
            call: { name: 'batch_apply', arguments: {} },
            execute: async () => ({ ok: true, result: {} }),
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BackgroundCatalogTrustError);
    expect(await db.ai_tasks.count()).toBe(0);
  });
});
