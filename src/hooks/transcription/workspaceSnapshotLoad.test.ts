import { describe, expect, it, vi } from 'vitest';
import type { SaveState } from './transcriptionTypes';
import { reloadAfterWrite } from './workspaceSnapshotLoad';

function run(reload: () => Promise<void>) {
  const states: SaveState[] = [];
  const onReloaded = vi.fn();
  const done = reloadAfterWrite({
    reload,
    setSaveState: (state) => {
      states.push(state);
    },
    locale: 'zh-CN',
    onReloaded,
  });
  return { states, onReloaded, done };
}

describe('reloadAfterWrite', () => {
  it('runs onReloaded when the reload returns', async () => {
    const { states, onReloaded, done } = run(async () => undefined);
    await done;
    expect(onReloaded).toHaveBeenCalledTimes(1);
    expect(states).toEqual([]);
  });

  it('says the view is stale and retries only the reload', async () => {
    const reload = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('refresh failed'))
      .mockResolvedValueOnce(undefined);
    const { states, onReloaded, done } = run(reload);
    await done;
    expect(onReloaded).not.toHaveBeenCalled();
    const stale = states[0];
    expect(stale).toMatchObject({
      kind: 'viewStale',
      message: '已写入，视图还没刷新。',
      actionLabel: '重新刷新',
    });
    if (stale?.kind !== 'viewStale') throw new Error('expected viewStale');
    stale.onAction();
    await vi.waitFor(() => {
      expect(states.at(-1)).toEqual({ kind: 'idle' });
    });
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('keeps the stale notice when the retry fails again', async () => {
    const reload = vi.fn(async () => {
      throw new Error('still stale');
    });
    const { states, done } = run(reload);
    await done;
    const stale = states[0];
    if (stale?.kind !== 'viewStale') throw new Error('expected viewStale');
    stale.onAction();
    await vi.waitFor(() => {
      expect(states.filter((state) => state.kind === 'viewStale')).toHaveLength(2);
    });
    expect(states.some((state) => state.kind === 'idle')).toBe(false);
  });
});
