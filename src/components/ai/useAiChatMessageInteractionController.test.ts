// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAiChatMessageInteractionController } from './useAiChatMessageInteractionController';

describe('useAiChatMessageInteractionController', () => {
  it('toggles optimistic pin sets correctly', () => {
    const onToggleAiMessagePin = vi.fn();
    const { result } = renderHook(() => useAiChatMessageInteractionController({
      onToggleAiMessagePin,
      onJumpToCitation: undefined,
    }));

    act(() => result.current.toggleMessagePin('m1', false));
    expect(result.current.optimisticPinnedMessageIds.has('m1')).toBe(true);
    expect(result.current.optimisticUnpinnedMessageIds.has('m1')).toBe(false);

    act(() => result.current.toggleMessagePin('m1', true));
    expect(result.current.optimisticPinnedMessageIds.has('m1')).toBe(false);
    expect(result.current.optimisticUnpinnedMessageIds.has('m1')).toBe(true);
    expect(onToggleAiMessagePin).toHaveBeenCalledTimes(2);
  });

  it('copies message and clears copied state by timer', () => {
    vi.useFakeTimers();
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', {
      ...globalThis.navigator,
      clipboard: { writeText },
    });
    const { result } = renderHook(() => useAiChatMessageInteractionController({
      onToggleAiMessagePin: undefined,
      onJumpToCitation: undefined,
    }));

    act(() => result.current.copyAssistantMessage('m2', 'hello'));
    expect(result.current.copiedMessageId).toBe('m2');
    expect(writeText).toHaveBeenCalledWith('hello');

    act(() => {
      vi.advanceTimersByTime(1300);
    });
    expect(result.current.copiedMessageId).toBe(null);
    vi.useRealTimers();
  });
});
