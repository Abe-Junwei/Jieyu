import { describe, expect, it, vi } from 'vitest';
import { quitAfterWindows } from './quitAfterWindows';

describe('quitAfterWindows', () => {
  it('releases the session only after a window saves and closes', async () => {
    const events: string[] = [];
    const closed = await quitAfterWindows(
      [
        {
          close: async () => {
            events.push('save');
            return true;
          },
        },
      ],
      () => {
        events.push('release');
      },
    );
    expect(closed).toBe(true);
    expect(events).toEqual(['save', 'release']);
  });

  it('releases the session only after a window discards and closes', async () => {
    const events: string[] = [];
    const closed = await quitAfterWindows(
      [
        {
          close: async () => {
            events.push('discard');
            return true;
          },
        },
      ],
      () => {
        events.push('release');
      },
    );
    expect(closed).toBe(true);
    expect(events).toEqual(['discard', 'release']);
  });

  it('keeps the session when the window stays', async () => {
    const release = vi.fn();
    const closed = await quitAfterWindows(
      [
        {
          close: async () => false,
        },
      ],
      release,
    );
    expect(closed).toBe(false);
    expect(release).not.toHaveBeenCalled();
  });
});
