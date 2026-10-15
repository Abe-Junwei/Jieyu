import { describe, expect, it, vi } from 'vitest';
import type { SaveState } from '../transcription/transcriptionTypes';
import { settleSpeakerWrite } from './speakerWriteOutcome';

const copy = {
  needsCheckMessage: 'check',
  viewStaleMessage: 'stale',
  retryLabel: 'reload',
};

describe('settleSpeakerWrite', () => {
  it('does not undo when the write throws, and re-reads before reporting', async () => {
    const order: string[] = [];
    const states: SaveState[] = [];
    const undo = vi.fn(async () => {
      order.push('undo');
    });
    const outcome = await settleSpeakerWrite({
      write: async () => {
        order.push('write');
        throw new Error('partial');
      },
      refresh: async () => {
        order.push('refresh');
      },
      reread: async () => {
        order.push('reread');
      },
      setSaveState: (state) => {
        states.push(state);
      },
      doneMessage: () => 'done',
      ...copy,
    });

    expect(outcome).toBe('unconfirmed');
    expect(order).toEqual(['write', 'reread']);
    expect(undo).not.toHaveBeenCalled();
    expect(states).toEqual([{ kind: 'error', message: 'check' }]);
  });

  it('reloads on retry when only the refresh fails, and does not run the write again', async () => {
    let refreshes = 0;
    let writes = 0;
    const states: SaveState[] = [];
    const outcome = await settleSpeakerWrite({
      write: async () => {
        writes += 1;
      },
      refresh: async () => {
        refreshes += 1;
        if (refreshes === 1) throw new Error('stats down');
      },
      reread: async () => {
        throw new Error('reread should not run');
      },
      setSaveState: (state) => {
        states.push(state);
      },
      doneMessage: () => 'done',
      ...copy,
    });

    expect(outcome).toBe('view-stale');
    expect(writes).toBe(1);
    const stale = states.at(-1);
    expect(stale).toMatchObject({ kind: 'viewStale', message: 'stale', actionLabel: 'reload' });
    if (stale?.kind === 'viewStale') stale.onAction();
    await vi.waitFor(() => {
      expect(states.at(-1)).toEqual({ kind: 'done', message: 'done' });
    });
    expect(writes).toBe(1);
    expect(refreshes).toBe(2);
  });
});
