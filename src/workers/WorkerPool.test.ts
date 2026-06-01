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

  it('does not heartbeat-restart workers marked busy', () => {
    vi.useFakeTimers();
    const worker = {
      postMessage: vi.fn(),
      terminate: vi.fn(),
      addEventListener: vi.fn(),
    } as unknown as Worker;
    const factory = vi.fn(() => worker);

    getWorkerPool().register('busy-id', 'Busy', factory, worker);
    const entry = getWorkerPool().get('busy-id');
    expect(entry).toBeDefined();
    entry!.lastHeartbeatAt = Date.now() - 60_000;
    getWorkerPool().markBusy('busy-id');
    const factoryCallsAfterRegister = factory.mock.calls.length;

    vi.advanceTimersByTime(20_000);

    expect(factory.mock.calls.length).toBe(factoryCallsAfterRegister);
    expect(worker.terminate).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
