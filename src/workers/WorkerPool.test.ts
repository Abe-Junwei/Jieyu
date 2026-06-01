import { afterEach, describe, expect, it, vi } from 'vitest';
import { getWorkerPool } from './WorkerPool';

describe('WorkerPool', () => {
  afterEach(() => {
    getWorkerPool().destroy();
  });

  it('register uses existingWorker without calling factory again', () => {
    const factory = vi.fn(
      () => ({ postMessage: vi.fn(), terminate: vi.fn() }) as unknown as Worker,
    );
    const existing = { postMessage: vi.fn(), terminate: vi.fn() } as unknown as Worker;

    const entry = getWorkerPool().register('test-id', 'Test', factory, existing);

    expect(factory).not.toHaveBeenCalled();
    expect(entry.worker).toBe(existing);
  });

  it('register calls factory once when existingWorker is omitted', () => {
    const created = { postMessage: vi.fn(), terminate: vi.fn() } as unknown as Worker;
    const factory = vi.fn(() => created);

    getWorkerPool().register('test-id', 'Test', factory);

    expect(factory).toHaveBeenCalledTimes(1);
  });
});
