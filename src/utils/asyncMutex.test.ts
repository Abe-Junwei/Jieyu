import { describe, expect, it } from 'vitest';
import { createAsyncMutex } from './asyncMutex';

describe('createAsyncMutex', () => {
  it('serializes concurrent async calls', async () => {
    const mutex = createAsyncMutex();
    const order: number[] = [];

    const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    // Launch 3 tasks concurrently — they should run sequentially
    const p1 = mutex.run(async () => { order.push(1); await delay(30); order.push(2); });
    const p2 = mutex.run(async () => { order.push(3); await delay(10); order.push(4); });
    const p3 = mutex.run(async () => { order.push(5); order.push(6); });

    await Promise.all([p1, p2, p3]);

    // Each task should fully complete before the next starts
    expect(order).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('still runs subsequent tasks if earlier task throws', async () => {
    const mutex = createAsyncMutex();
    const results: string[] = [];

    const p1 = mutex.run(async () => { throw new Error('boom'); });
    const p2 = mutex.run(async () => { results.push('ok'); });

    await expect(p1).rejects.toThrow('boom');
    await p2;
    expect(results).toEqual(['ok']);
  });

  it('returns the value from the executed function', async () => {
    const mutex = createAsyncMutex();
    const result = await mutex.run(async () => 42);
    expect(result).toBe(42);
  });
});
