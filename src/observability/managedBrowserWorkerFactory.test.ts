import { afterEach, describe, expect, it, vi } from 'vitest';
import { createManagedBrowserWorker } from './managedBrowserWorkerFactory';
import { trackBrowserWorkerLifecycle } from './trackBrowserWorkerLifecycle';

vi.mock('./trackBrowserWorkerLifecycle', () => ({
  trackBrowserWorkerLifecycle: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('createManagedBrowserWorker', () => {
  it('keeps normal worker URL unchanged', () => {
    const workerMock = { terminate: vi.fn() } as unknown as Worker;
    const workerCtor = vi.fn();
    class WorkerStub {
      constructor(...args: unknown[]) {
        workerCtor(...args);
        return workerMock;
      }
    }
    vi.stubGlobal('Worker', WorkerStub as unknown as typeof Worker);

    const trackedRelease = vi.fn();
    vi.mocked(trackBrowserWorkerLifecycle).mockReturnValue(trackedRelease);

    const out = createManagedBrowserWorker({
      url: new URL('https://example.com/worker.js'),
      options: { type: 'module' },
      tracking: { id: 'normal', source: 'test' },
    });

    const [workerUrl, workerOptions] = workerCtor.mock.calls[0] ?? [];
    expect(workerUrl).toBeInstanceOf(URL);
    expect((workerUrl as URL).href).toBe('https://example.com/worker.js');
    expect(workerOptions).toEqual({ type: 'module' });
    out.release();
    expect(trackedRelease).toHaveBeenCalledTimes(1);
  });

  it('converts data URL worker input to blob URL for CSP-safe spawn', () => {
    const workerMock = { terminate: vi.fn() } as unknown as Worker;
    const workerCtor = vi.fn();
    class WorkerStub {
      constructor(...args: unknown[]) {
        workerCtor(...args);
        return workerMock;
      }
    }
    vi.stubGlobal('Worker', WorkerStub as unknown as typeof Worker);

    const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-worker-url');
    const revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const trackedRelease = vi.fn();
    vi.mocked(trackBrowserWorkerLifecycle).mockReturnValue(trackedRelease);

    const out = createManagedBrowserWorker({
      url: new URL('data:video/mp2t;base64,ZXhwb3J0IGRlZmF1bHQgMTs='),
      options: { type: 'module' },
      tracking: { id: 'data-url', source: 'test' },
    });

    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    expect(workerCtor).toHaveBeenCalledWith('blob:test-worker-url', { type: 'module' });

    out.release();
    expect(trackedRelease).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith('blob:test-worker-url');
  });
});
