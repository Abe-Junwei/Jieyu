import { describe, expect, it } from 'vitest';
import { createBackgroundMemoryFlushQuotaState } from './backgroundMemoryFlushQuota';

describe('createBackgroundMemoryFlushQuotaState', () => {
  it('increments per conversation independently', () => {
    const q = createBackgroundMemoryFlushQuotaState();
    expect(q.getCompletedWriteFlushCount('a')).toBe(0);
    q.consumeSuccessfulWriteFlush('a');
    expect(q.getCompletedWriteFlushCount('a')).toBe(1);
    expect(q.getCompletedWriteFlushCount('b')).toBe(0);
    q.consumeSuccessfulWriteFlush('b');
    expect(q.getCompletedWriteFlushCount('b')).toBe(1);
  });
});
