import { describe, expect, it } from 'vitest';
import { trashOutcome } from './trashOutcome';

describe('trash outcome', () => {
  it('leaves a rejection as a failure and a remaining file as unknown', async () => {
    const there = new Set(['kept']);
    await expect(
      trashOutcome(
        'kept',
        async () => {
          throw new Error('trash down');
        },
        (file) => there.has(file),
      ),
    ).rejects.toThrow('trash down');
    await expect(
      trashOutcome(
        'kept',
        async () => undefined,
        (file) => there.has(file),
      ),
    ).resolves.toBe('unknown');
    await expect(
      trashOutcome(
        'gone',
        async () => undefined,
        (file) => there.has(file),
      ),
    ).resolves.toBe('moved');
  });
});
