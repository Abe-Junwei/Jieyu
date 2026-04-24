import { trackBrowserWorkerLifecycle, type TrackedBrowserWorkerSpec } from './trackBrowserWorkerLifecycle';

export interface ManagedBrowserWorkerFactoryInput {
  url: URL;
  options?: WorkerOptions;
  tracking: TrackedBrowserWorkerSpec;
}

export interface ManagedBrowserWorkerFactoryOutput {
  worker: Worker;
  release: () => void;
}

export function createManagedBrowserWorker(
  input: ManagedBrowserWorkerFactoryInput,
): ManagedBrowserWorkerFactoryOutput {
  const worker = new Worker(input.url, input.options ?? { type: 'module' });
  const release = trackBrowserWorkerLifecycle(worker, input.tracking);
  return { worker, release };
}
