// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { useTranscriptionAutoSaveActions } from './useTranscriptionAutoSaveActions';

describe('useTranscriptionAutoSaveActions (#504)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('A in-flight → schedule B → A finishes → clear → B must not overwrite C', async () => {
    const { result } = renderHook(() => {
      const autoSaveTimersRef = useRef<Record<string, number>>({});
      const actions = useTranscriptionAutoSaveActions({ autoSaveTimersRef });
      return { ...actions, autoSaveTimersRef };
    });

    const writes: string[] = [];
    let resolveA!: () => void;
    const saveA = new Promise<void>((resolve) => {
      resolveA = resolve;
    });

    act(() => {
      result.current.scheduleAutoSave('row-1', async () => {
        writes.push('A');
        await saveA;
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(550);
    });
    expect(writes).toEqual(['A']);

    act(() => {
      result.current.scheduleAutoSave('row-1', async () => {
        writes.push('B');
      });
    });
    const timerB = result.current.autoSaveTimersRef.current['row-1'];
    expect(timerB).toBeDefined();

    await act(async () => {
      resolveA();
      await Promise.resolve();
      await Promise.resolve();
    });

    // After A finishes, B's timer record must still be clearable (#504).
    expect(result.current.autoSaveTimersRef.current['row-1']).toBe(timerB);

    // Blur: clear pending debounce, then write C directly.
    act(() => {
      result.current.clearAutoSaveTimer('row-1');
      writes.push('C');
    });
    expect(result.current.autoSaveTimersRef.current['row-1']).toBeUndefined();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(writes).toEqual(['A', 'C']);
    expect(writes).not.toContain('B');
  });
});
