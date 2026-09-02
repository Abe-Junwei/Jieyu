/**
 * A10.6 / A12.3 — parallel readonly local-context tools, one commitToolEffects.
 * Does not replace the sequential policy/clarify path in streamCompletion.
 */

import { isReadOnlyLocalContextToolName } from '../policy/localContextToolEffects';
import type { LocalContextToolCall } from '../chat/localContextToolTypes';
import { commitToolEffects, type CommitToolEffectsContext } from './commitToolEffects';

export class ReadonlyToolBatchWriteRejectedError extends Error {
  readonly toolName: string;

  constructor(toolName: string) {
    super(`executeReadonlyToolBatch rejected write-like tool: ${toolName}`);
    this.name = 'ReadonlyToolBatchWriteRejectedError';
    this.toolName = toolName;
  }
}

export type ReadonlyToolBatchItem<TResult> = {
  call: LocalContextToolCall;
  execute: () => Promise<TResult>;
};

export type ReadonlyToolBatchOkResult = {
  ok: boolean;
  result?: unknown;
};

export async function executeReadonlyToolBatch<TResult extends ReadonlyToolBatchOkResult>(
  ctx: CommitToolEffectsContext,
  items: ReadonlyArray<ReadonlyToolBatchItem<TResult>>,
): Promise<TResult[]> {
  if (items.length === 0) return [];
  for (const item of items) {
    if (!isReadOnlyLocalContextToolName(item.call.name)) {
      throw new ReadonlyToolBatchWriteRejectedError(item.call.name);
    }
  }
  const results = await Promise.all(items.map((item) => item.execute()));
  commitToolEffects(ctx, {
    kind: 'local_context',
    callResults: items.map((item, index) => ({
      call: item.call,
      ok: results[index]?.ok ?? false,
      result: results[index]?.result,
    })),
  });
  return results;
}
