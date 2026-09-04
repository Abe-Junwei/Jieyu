/**
 * A13.4 — enqueue a parallel readonly batch on TaskRunner with shared agentRunId.
 * Does not replace send-turn sequential local-tool execution.
 */

import { assertBackgroundCatalogTool } from '../catalog/aiToolCatalog';
import type { TaskRunner } from '../tasks/TaskRunner';
import {
  executeReadonlyToolBatch,
  type ReadonlyToolBatchItem,
  type ReadonlyToolBatchOkResult,
} from './executeReadonlyToolBatch';
import type { CommitToolEffectsContext } from './commitToolEffects';

export async function enqueueReadonlyToolBatchTask<TResult extends ReadonlyToolBatchOkResult>(
  runner: TaskRunner,
  input: {
    agentRunId: string;
    targetId: string;
    ctx: CommitToolEffectsContext;
    items: ReadonlyArray<ReadonlyToolBatchItem<TResult>>;
  },
) {
  for (const item of input.items) {
    assertBackgroundCatalogTool(item.call.name);
  }
  return runner.enqueue({
    taskType: 'agent_loop',
    targetId: input.targetId,
    targetType: 'parallel_readonly_batch',
    agentRunId: input.agentRunId,
    resumable: false,
    initialCheckpoint: {
      kind: 'parallel_readonly_batch',
      data: { toolNames: input.items.map((item) => item.call.name) },
    },
    run: async () => executeReadonlyToolBatch(input.ctx, input.items),
  });
}
