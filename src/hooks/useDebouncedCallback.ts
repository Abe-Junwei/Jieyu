import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

/**
 * Returns a debounced version of the callback.
 * Automatically cleans up pending timers on unmount.
 */
export function useDebouncedCallback<T extends (...args: never[]) => void>(
  callback: T,
  delayMs: number,
): { run: (...args: Parameters<T>) => void; cancel: () => void; flush: () => void } {
  const timerRef = useRef<number | undefined>(undefined);
  const callbackRef = useRef(callback);
  useLayoutEffect(() => {
    callbackRef.current = callback;
  });
  const argsRef = useRef<Parameters<T> | null>(null);

  const cancel = useCallback(() => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    argsRef.current = null;
  }, []);

  const flush = useCallback(() => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
      if (argsRef.current) {
        callbackRef.current(...argsRef.current);
        argsRef.current = null;
      }
    }
  }, []);

  const run = useCallback(
    (...args: Parameters<T>) => {
      argsRef.current = args;
      if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = undefined;
        argsRef.current = null;
        callbackRef.current(...args);
      }, delayMs);
    },
    [delayMs],
  );

  // Cleanup on unmount
  useEffect(() => () => cancel(), [cancel]);

  return { run, cancel, flush };
}
