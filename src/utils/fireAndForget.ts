/**
 * Fire-and-forget an async call with error handling.
 * Prevents unhandled promise rejections from `void asyncFn()` patterns.
 *
 * @param promise - The promise to execute
 * @param onError - Error handler (defaults to console.error)
 */
export const FIRE_AND_FORGET_ERROR_EVENT = 'jieyu:fire-and-forget-error' as const;

export interface FireAndForgetErrorDetail {
  context?: string;
  error: unknown;
}

export function fireAndForget(
  promise: Promise<unknown>,
  onError?: (err: unknown) => void,
  context?: string,
): void {
  promise.catch((err) => {
    if (onError) {
      onError(err);
    } else {
      console.error('[fireAndForget] Unhandled async error:', err);
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
        const detail: FireAndForgetErrorDetail = {
          ...(typeof context === 'string' && context.trim().length > 0 ? { context: context.trim() } : {}),
          error: err,
        };
        window.dispatchEvent(new CustomEvent<FireAndForgetErrorDetail>(FIRE_AND_FORGET_ERROR_EVENT, { detail }));
      }
    }
  });
}
