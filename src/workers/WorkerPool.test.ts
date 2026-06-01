import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getWorkerPool } from './WorkerPool';

describe('WorkerPool', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    getWorkerPool().destroy();
    vi.useRealTimers();
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

  it('does not terminate service-owned workers on heartbeat timeout', () => {
    const terminate = vi.fn();
    const existing = {
      postMessage: vi.fn(),
      terminate,
      addEventListener: vi.fn(),
    } as unknown as Worker;
    const factory = vi.fn(() => existing);

    getWorkerPool().register('svc-owned', 'ServiceOwned', factory, existing);

    vi.advanceTimersByTime(60_000);

    expect(terminate).not.toHaveBeenCalled();
    expect(factory).not.toHaveBeenCalled();
  });
});
