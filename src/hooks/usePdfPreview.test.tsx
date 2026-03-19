// @vitest-environment jsdom
import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePdfPreview } from './usePdfPreview';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('usePdfPreview', () => {
  it('opens external PDF window once in StrictMode', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <React.StrictMode>{children}</React.StrictMode>
    );

    const { result } = renderHook(() => usePdfPreview(), { wrapper });

    act(() => {
      result.current.openPdfPreview('https://example.com/a.pdf', 'A', 3);
    });

    act(() => {
      result.current.handlePdfPreviewOpenExternal();
    });

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith('https://example.com/a.pdf#page=3', '_blank', 'noopener,noreferrer');
  });
});
