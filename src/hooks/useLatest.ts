import { useRef, useLayoutEffect } from 'react';

/**
 * Returns a ref that always holds the latest value.
 * Avoids stale closures in callbacks without triggering re-renders.
 * Uses useLayoutEffect to safely update in concurrent mode.
 */
export function useLatest<T>(value: T): { readonly current: T } {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
