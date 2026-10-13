import { describe, expect, it } from 'vitest';
import { trackPageErrors } from './e2e/_helpers/pageErrorFilter';

describe('trackPageErrors', () => {
  it('reports unexpected aborts instead of hiding them as harmless cancellations', () => {
    let onPageError: ((error: Error) => void) | undefined;
    const errors = trackPageErrors({
      on: (_event, handler) => {
        onPageError = handler;
      },
    });

    onPageError?.(new Error('AbortError: IndexedDB transaction aborted'));
    onPageError?.(new Error('The user aborted a request while saving'));
    onPageError?.(new Error('ResizeObserver loop limit exceeded'));

    expect(errors).toEqual([
      'AbortError: IndexedDB transaction aborted',
      'The user aborted a request while saving',
    ]);
  });
});
