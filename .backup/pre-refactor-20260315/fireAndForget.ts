/**
 * Fire-and-forget an async call with error handling.
 * Prevents unhandled promise rejections from `void asyncFn()` patterns.
 *
 * @param promise - The promise to execute
 * @param onError - Error handler (defaults to console.error)
 */
export function fireAndForget(
  promise: Promise<unknown>,
  onError?: (err: unknown) => void,
): void {
  promise.catch(onError ?? console.error);
}
