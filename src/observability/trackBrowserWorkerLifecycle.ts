import { markManagedWorkerTerminated, recordManagedWorkerError, registerManagedWorker } from './managedWorkerRegistry';

export interface TrackedBrowserWorkerSpec {
  /** 全局唯一，建议 `nextPhysicalWorkerId` 或固定名（单例 hook）。 */
  id: string;
  /** 人可读来源，如 `WhisperXVadService`。 */
  source: string;
}

/**
 * 在既有 `onerror` / `terminate` 之外登记 Worker，便于 `getManagedWorkerRegistrySnapshot`。
 * 返回的 `release` 应在 `worker.terminate()` 之前或之后调用一次（会移除本模块挂接的监听器并标记 `terminated`）。
 */
export function trackBrowserWorkerLifecycle(
  worker: Worker,
  spec: TrackedBrowserWorkerSpec,
): () => void {
  registerManagedWorker(spec.id, spec.source);

  const onError = (event: ErrorEvent) => {
    recordManagedWorkerError(
      spec.id,
      'error',
      (event as ErrorEvent & { message?: string }).message?.trim() || 'worker error',
    );
  };
  const onMessageError = () => {
    recordManagedWorkerError(spec.id, 'messageerror');
  };

  worker.addEventListener('error', onError);
  worker.addEventListener('messageerror', onMessageError);

  return () => {
    worker.removeEventListener('error', onError);
    worker.removeEventListener('messageerror', onMessageError);
    markManagedWorkerTerminated(spec.id);
  };
}
