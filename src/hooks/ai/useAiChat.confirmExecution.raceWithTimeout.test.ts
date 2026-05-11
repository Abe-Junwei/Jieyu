import { describe, expect, it } from 'vitest';
import { raceWithTimeout } from './useAiChat.confirmExecution';

describe('raceWithTimeout', () => {
  it('resolves with primary result when primary finishes before timeout', async () => {
    await expect(raceWithTimeout(Promise.resolve('ok'), 50_000)).resolves.toBe('ok');
  });

  it('rejects when primary exceeds timeout', async () => {
    const never = new Promise(() => {});
    await expect(raceWithTimeout(never, 40)).rejects.toThrow(/Tool execution timed out after 40ms/);
  }, 2000);
});
