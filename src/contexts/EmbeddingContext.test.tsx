// @vitest-environment jsdom
import type { PropsWithChildren } from 'react';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DEFAULT_EMBEDDING_CONTEXT_VALUE, EmbeddingProvider, useEmbeddingContext } from './EmbeddingContext';

describe('EmbeddingContext', () => {
  it('throws when the provider is missing', () => {
    expect(() => renderHook(() => useEmbeddingContext())).toThrow(
      'useEmbeddingContext must be used within <EmbeddingProvider>',
    );
  });

  it('returns the provided context value', () => {
    const wrapper = ({ children }: PropsWithChildren) => (
      <EmbeddingProvider value={DEFAULT_EMBEDDING_CONTEXT_VALUE}>
        {children}
      </EmbeddingProvider>
    );

    const { result } = renderHook(() => useEmbeddingContext(), { wrapper });

    expect(result.current).toBe(DEFAULT_EMBEDDING_CONTEXT_VALUE);
  });
});