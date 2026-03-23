// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../db';
import { TaskRunner, backoffDelay } from './TaskRunner';

async function clearTables(): Promise<void> {
  await db.ai_tasks.clear();
}

async function waitForTaskStatus(taskId: string, status: 'pending' | 'running' | 'done' | 'failed'): Promise<void> {
  for (let i = 0; i < 40; i += 1) {
    const row = await db.ai_tasks.get(taskId);
    if (row?.status === status) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Task ${taskId} did not reach status ${status}`);
}

describe('TaskRunner', () => {
  beforeEach(async () => {
    await db.open();
    await clearTables();
  });

  afterEach(async () => {
    await clearTables();
  });

  it('runs task and marks ai_task done', async () => {
    const runner = new TaskRunner(1);
    const enqueued = await runner.enqueue({
      taskType: 'embed',
      targetId: 'embeddings',
      targetType: 'batch',
      modelId: 'test-model',
      run: async () => 'ok',
    });

    const result = await enqueued.result;
    expect(result).toBe('ok');

    const row = await db.ai_tasks.get(enqueued.taskId);
    expect(row?.status).toBe('done');
  });

  it('retries when handler fails and then succeeds', async () => {
    const runner = new TaskRunner(1);
    let callCount = 0;

    const enqueued = await runner.enqueue({
      taskType: 'embed',
      targetId: 'embeddings',
      maxAttempts: 2,
      run: async () => {
        callCount += 1;
        if (callCount === 1) {
          throw new Error('first attempt failed');
        }
        return 'retry-ok';
      },
    });

    const result = await enqueued.result;
    expect(result).toBe('retry-ok');
    expect(callCount).toBe(2);

    const row = await db.ai_tasks.get(enqueued.taskId);
    expect(row?.status).toBe('done');
  });

  it('queues tasks when concurrency is 1', async () => {
    const runner = new TaskRunner(1);

    let releaseFirst: (() => void) = () => {};
    const first = await runner.enqueue({
      taskType: 'embed',
      targetId: 'embeddings',
      run: async () => new Promise<string>((resolve) => {
        releaseFirst = () => resolve('first-ok');
      }),
    });

    const second = await runner.enqueue({
      taskType: 'embed',
      targetId: 'embeddings',
      run: async () => 'second-ok',
    });

    const secondBeforeRelease = await db.ai_tasks.get(second.taskId);
    expect(secondBeforeRelease?.status).toBe('pending');

    releaseFirst();
    await first.result;
    await second.result;

    const secondAfter = await db.ai_tasks.get(second.taskId);
    expect(secondAfter?.status).toBe('done');
  });

  it('cancels a running task and marks it failed', async () => {
    const runner = new TaskRunner(1);

    const running = await runner.enqueue({
      taskType: 'embed',
      targetId: 'embeddings',
      run: async ({ signal }) => new Promise<string>((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')));
      }),
    });

    const cancelled = runner.cancel(running.taskId);
    expect(cancelled).toBe(true);

    await expect(running.result).rejects.toBeTruthy();
    const row = await db.ai_tasks.get(running.taskId);
    expect(row?.status).toBe('failed');
  });

  it('retries a failed task with original input', async () => {
    const runner = new TaskRunner(1);
    let attempts = 0;

    const first = await runner.enqueue({
      taskType: 'gloss',
      targetId: 'utt-1',
      run: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error('boom');
        }
        return 'ok';
      },
    });

    await expect(first.result).rejects.toBeTruthy();
    const retriedTaskId = await runner.retry(first.taskId);
    expect(typeof retriedTaskId).toBe('string');
    expect(retriedTaskId).not.toBe(first.taskId);

    const retried = await db.ai_tasks.get(retriedTaskId!);
    expect(retried?.taskType).toBe('gloss');
  });

  it('does not keep retry input for successful tasks', async () => {
    const runner = new TaskRunner(1);
    const task = await runner.enqueue({
      taskType: 'embed',
      targetId: 'embeddings',
      run: async () => 'ok',
    });

    await expect(task.result).resolves.toBe('ok');
    await expect(runner.retry(task.taskId)).resolves.toBeNull();
  });

  it('fails task on timeout and stores timeout message', async () => {
    const runner = new TaskRunner({ concurrency: 1, defaultTimeoutMs: 1000 });

    const enqueued = await runner.enqueue({
      taskType: 'embed',
      targetId: 'embeddings',
      run: async ({ signal }) => new Promise<string>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')));
      }),
    });

    await expect(enqueued.result).rejects.toBeTruthy();
    const row = await db.ai_tasks.get(enqueued.taskId);
    expect(row?.status).toBe('failed');
    expect(row?.errorMessage).toContain('Task timed out after');
  });

  it('recovers stale pending/running tasks on startup', async () => {
    const oldIso = new Date(Date.now() - 10 * 60_000).toISOString();
    await db.ai_tasks.bulkPut([
      {
        id: 'stale-running',
        taskType: 'embed',
        status: 'running',
        targetId: 'embeddings',
        createdAt: oldIso,
        updatedAt: oldIso,
      },
      {
        id: 'stale-pending',
        taskType: 'gloss',
        status: 'pending',
        targetId: 'utt-1',
        createdAt: oldIso,
        updatedAt: oldIso,
      },
    ]);

    // 构造函数会触发恢复流程 | Constructor triggers stale task recovery.
    const runner = new TaskRunner({ concurrency: 1, staleTaskTtlMs: 1000 });
    expect(runner).toBeDefined();

    await waitForTaskStatus('stale-running', 'failed');
    await waitForTaskStatus('stale-pending', 'failed');

    const runningRow = await db.ai_tasks.get('stale-running');
    const pendingRow = await db.ai_tasks.get('stale-pending');
    expect(runningRow?.errorMessage).toContain('Recovered as stale task');
    expect(pendingRow?.errorMessage).toContain('Recovered as stale task');
  });
});

describe('backoffDelay', () => {
  it('returns 0 for first attempt', () => {
    expect(backoffDelay(1)).toBe(0);
  });

  it('returns baseMs for second attempt', () => {
    expect(backoffDelay(2)).toBe(500);
  });

  it('doubles for each subsequent attempt', () => {
    expect(backoffDelay(3)).toBe(1000);
    expect(backoffDelay(4)).toBe(2000);
    expect(backoffDelay(5)).toBe(4000);
  });

  it('caps at maxMs', () => {
    expect(backoffDelay(10)).toBe(8000);
    expect(backoffDelay(20)).toBe(8000);
  });

  it('respects custom baseMs and maxMs', () => {
    expect(backoffDelay(2, 100, 300)).toBe(100);
    expect(backoffDelay(4, 100, 300)).toBe(300);
  });
});

describe('TaskRunner backoff', () => {
  beforeEach(async () => {
    await db.open();
    await clearTables();
  });

  afterEach(async () => {
    await clearTables();
  });

  it('applies backoff delay between retry attempts', async () => {
    const runner = new TaskRunner(1);
    const timestamps: number[] = [];

    const enqueued = await runner.enqueue({
      taskType: 'embed',
      targetId: 'embeddings',
      maxAttempts: 3,
      run: async ({ attempt }) => {
        timestamps.push(Date.now());
        if (attempt < 3) throw new Error(`fail-${attempt}`);
        return 'ok';
      },
    });

    const result = await enqueued.result;
    expect(result).toBe('ok');
    expect(timestamps).toHaveLength(3);

    // 第二次尝试应有 ≥400ms 退避（标称500ms，允许定时器抖动）
    // Second attempt should have ≥400ms backoff (nominal 500ms, allow timer jitter)
    const gap1 = timestamps[1]! - timestamps[0]!;
    expect(gap1).toBeGreaterThanOrEqual(400);

    // 第三次尝试应有 ≥800ms 退避（标称1000ms）
    // Third attempt should have ≥800ms backoff (nominal 1000ms)
    const gap2 = timestamps[2]! - timestamps[1]!;
    expect(gap2).toBeGreaterThanOrEqual(800);
  });
});
