// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useLocalStorage } from './useLocalStorage';

describe('useLocalStorage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('keeps setter identity stable after value updates', () => {
    const { result, rerender } = renderHook(() => useLocalStorage('stable-setter', 1));

    const initialSetter = result.current[1];

    act(() => {
      result.current[1](2);
    });

    rerender();

    expect(result.current[0]).toBe(2);
    expect(result.current[1]).toBe(initialSetter);
  });

  it('applies functional updates against the latest value', () => {
    const { result } = renderHook(() => useLocalStorage('functional-update', 0));

    act(() => {
      result.current[1]((prev) => prev + 1);
      result.current[1]((prev) => prev + 1);
    });

    expect(result.current[0]).toBe(2);
    expect(window.localStorage.getItem('functional-update')).toBe('2');
  });
});