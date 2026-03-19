// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../db';
import { TaskRunner } from './TaskRunner';

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
