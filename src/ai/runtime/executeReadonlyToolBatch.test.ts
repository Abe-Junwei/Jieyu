import { describe, expect, it, vi } from 'vitest';
import {
  executeReadonlyToolBatch,
  ReadonlyToolBatchWriteRejectedError,
} from './executeReadonlyToolBatch';
import type { AiSessionMemory } from '../chat/chatDomain.types';

function makeCtx(sessionMemory: AiSessionMemory = { projectFacts: [] }) {
  return {
    sessionMemory,
    updateSessionMemory: vi.fn(),
    persistSessionMemory: vi.fn(),
  };
}

describe('executeReadonlyToolBatch', () => {
  it('rejects write-like tools before execute or commit', async () => {
    const ctx = makeCtx();
    const execute = vi.fn(async () => ({ ok: true, result: {} }));
    await expect(
      executeReadonlyToolBatch(ctx, [{ call: { name: 'batch_apply', arguments: {} }, execute }]),
    ).rejects.toBeInstanceOf(ReadonlyToolBatchWriteRejectedError);
    expect(execute).not.toHaveBeenCalled();
    expect(ctx.updateSessionMemory).not.toHaveBeenCalled();
    expect(ctx.persistSessionMemory).not.toHaveBeenCalled();
  });

  it('rejects a mixed batch before any execute', async () => {
    const ctx = makeCtx();
    const readExecute = vi.fn(async () => ({ ok: true, result: { unitIds: ['u1'] } }));
    const writeExecute = vi.fn(async () => ({ ok: true, result: {} }));
    await expect(
      executeReadonlyToolBatch(ctx, [
        { call: { name: 'search_units', arguments: { query: 'hello' } }, execute: readExecute },
        { call: { name: 'batch_apply', arguments: {} }, execute: writeExecute },
      ]),
    ).rejects.toMatchObject({
      name: 'ReadonlyToolBatchWriteRejectedError',
      toolName: 'batch_apply',
    });
    expect(readExecute).not.toHaveBeenCalled();
    expect(writeExecute).not.toHaveBeenCalled();
    expect(ctx.persistSessionMemory).not.toHaveBeenCalled();
  });

  it('runs readonly tools in parallel and commits once', async () => {
    const ctx = makeCtx();
    let started = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const search = vi.fn(async () => {
      started += 1;
      await gate;
      return { ok: true, result: { unitIds: ['u1'] } };
    });
    const layers = vi.fn(async () => {
      started += 1;
      await gate;
      return { ok: true, result: { layers: [] } };
    });
    const pending = executeReadonlyToolBatch<{ ok: boolean; result?: unknown }>(ctx, [
      { call: { name: 'search_units', arguments: { query: 'hello' } }, execute: search },
      { call: { name: 'list_layers', arguments: {} }, execute: layers },
    ]);
    await vi.waitFor(() => {
      expect(started).toBe(2);
    });
    expect(ctx.persistSessionMemory).not.toHaveBeenCalled();
    release();
    const results = await pending;
    expect(results).toEqual([
      { ok: true, result: { unitIds: ['u1'] } },
      { ok: true, result: { layers: [] } },
    ]);
    expect(ctx.updateSessionMemory).toHaveBeenCalledTimes(1);
    expect(ctx.persistSessionMemory).toHaveBeenCalledTimes(1);
  });

  it('returns without commit when the batch is empty', async () => {
    const ctx = makeCtx();
    await expect(executeReadonlyToolBatch(ctx, [])).resolves.toEqual([]);
    expect(ctx.persistSessionMemory).not.toHaveBeenCalled();
  });
});
