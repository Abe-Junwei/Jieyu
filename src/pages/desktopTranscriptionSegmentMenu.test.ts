import { describe, expect, it, vi } from 'vitest';
import { segmentMenuActions } from './desktopTranscriptionSegmentMenu';

describe('segmentMenuActions', () => {
  it('merges the open segment and skips a sub-segment', () => {
    const closeMenu = vi.fn();
    const onMerge = vi.fn();
    const open = segmentMenuActions({ unitId: 'a' }, closeMenu, {
      canMerge: () => true,
      onMerge,
    });
    expect(open.canMerge).toBe(true);
    open.onAskMerge?.();
    expect(closeMenu).toHaveBeenCalledOnce();
    expect(onMerge).toHaveBeenCalledWith('a');

    const sub = segmentMenuActions({ unitId: 'a', sub: true }, closeMenu, {
      canMerge: () => true,
      onMerge,
    });
    expect(sub.canMerge).toBe(false);
    sub.onAskMerge?.();
    expect(onMerge).toHaveBeenCalledOnce();
  });

  it('does not ask whether an empty id can merge', () => {
    const canMerge = vi.fn(() => true);
    const actions = segmentMenuActions(null, () => undefined, {
      canMerge,
      onMerge: () => undefined,
    });
    expect(actions.canMerge).toBe(false);
    expect(canMerge).not.toHaveBeenCalled();
  });
});
