import { afterEach, describe, expect, it } from 'vitest';
import {
  getManagedWorkerRegistrySnapshot,
  markManagedWorkerTerminated,
  nextPhysicalWorkerId,
  recordManagedWorkerError,
  registerManagedWorker,
  resetManagedWorkerRegistryForTests,
} from './managedWorkerRegistry';

describe('managedWorkerRegistry', () => {
  afterEach(() => {
    resetManagedWorkerRegistryForTests();
  });

  it('registers workers and returns ordered snapshot', () => {
    registerManagedWorker('w-1', 'sourceA');
    registerManagedWorker('w-2', 'sourceB');

    const snap = getManagedWorkerRegistrySnapshot();
    expect(snap.map((e) => e.id)).toEqual(['w-1', 'w-2']);
    expect(snap[0]!.source).toBe('sourceA');
    expect(snap[0]!.state).toBe('live');
    expect(snap[0]!.errorEventCount).toBe(0);
  });

  it('nextPhysicalWorkerId appends a global monotonic sequence to each prefix', () => {
    expect(nextPhysicalWorkerId('emb')).toBe('emb-1');
    expect(nextPhysicalWorkerId('emb')).toBe('emb-2');
    expect(nextPhysicalWorkerId('vad')).toBe('vad-3');
  });

  it('recordManagedWorkerError updates counts and last message for live workers', () => {
    registerManagedWorker('w-err', 'src');
    recordManagedWorkerError('w-err', 'error', 'boom');
    recordManagedWorkerError('w-err', 'messageerror');

    const [e] = getManagedWorkerRegistrySnapshot();
    expect(e!.errorEventCount).toBe(1);
    expect(e!.messageErrorEventCount).toBe(1);
    expect(e!.lastErrorMessage).toBe('boom');
  });

  it('ignores errors for unknown or terminated workers', () => {
    registerManagedWorker('w-x', 'src');
    recordManagedWorkerError('missing', 'error', 'nope');
    markManagedWorkerTerminated('w-x');
    recordManagedWorkerError('w-x', 'error', 'late');

    const [e] = getManagedWorkerRegistrySnapshot();
    expect(e!.errorEventCount).toBe(0);
  });

  it('markManagedWorkerTerminated sets state and timestamp', () => {
    const before = Date.now();
    registerManagedWorker('w-t', 'src');
    markManagedWorkerTerminated('w-t');
    const after = Date.now();

    const [e] = getManagedWorkerRegistrySnapshot();
    expect(e!.state).toBe('terminated');
    expect(e!.terminatedAtMs).toBeGreaterThanOrEqual(before);
    expect(e!.terminatedAtMs).toBeLessThanOrEqual(after);
  });
});
