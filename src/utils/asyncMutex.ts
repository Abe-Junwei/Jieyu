/**
 * Lightweight async mutex for serializing async operations.
 * Guarantees that only one async critical section runs at a time;
 * subsequent callers wait their turn via a promise queue.
 */
export function createAsyncMutex() {
  let pending: Promise<void> = Promise.resolve();

  /**
   * Execute `fn` exclusively — if another call is in progress,
   * this one waits until that completes before starting.
   */
  async function run<T>(fn: () => Promise<T>): Promise<T> {
    // Chain behind whatever is currently pending
    const next = pending.then(fn, fn);
    // Update the tail; swallow the value so `pending` stays Promise<void>
    pending = next.then(() => {}, () => {});
    return next;
  }

  return { run };
}
