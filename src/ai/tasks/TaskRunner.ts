import { getDb, type AiTaskDoc } from '../../../db';

export interface TaskRunContext {
  taskId: string;
  signal: AbortSignal;
  attempt: number;
  maxAttempts: number;
}

export interface EnqueueTaskInput<TResult> {
  taskType: AiTaskDoc['taskType'];
  targetId: string;
  targetType?: string;
  modelId?: string;
  maxAttempts?: number;
  timeoutMs?: number;
  run: (context: TaskRunContext) => Promise<TResult>;
}

export interface TaskRunnerOptions {
  concurrency?: number;
  defaultTimeoutMs?: number;
  staleTaskTtlMs?: number;
}

export interface EnqueueTaskResult<TResult> {
  taskId: string;
  result: Promise<TResult>;
  cancel: () => void;
}

interface InternalTask<TResult> {
  taskId: string;
  input: EnqueueTaskInput<TResult>;
  controller: AbortController;
  resolve: (value: TResult) => void;
  reject: (reason: unknown) => void;
  promise: Promise<TResult>;
  maxAttempts: number;
  timeoutMs: number;
  started: boolean;
  completed: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

function createTaskId(taskType: AiTaskDoc['taskType']): string {
  return `task_${taskType}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeMaxAttempts(input: number | undefined): number {
  if (!Number.isFinite(input)) return 1;
  return Math.min(5, Math.max(1, Math.floor(input ?? 1)));
}

function normalizeTimeoutMs(input: number | undefined, fallback: number): number {
  if (!Number.isFinite(input)) return fallback;
  return Math.max(1000, Math.floor(input ?? fallback));
}

class TaskTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Task timed out after ${timeoutMs}ms`);
    this.name = 'TaskTimeoutError';
  }
}

/** 指数退避延迟 | Exponential backoff delay (attempt 1-indexed, cap at maxMs) */
export function backoffDelay(attempt: number, baseMs = 500, maxMs = 8000): number {
  // attempt=1 → 0ms (第一次不等), attempt=2 → baseMs, attempt=3 → baseMs*2, ...
  if (attempt <= 1) return 0;
  return Math.min(baseMs * 2 ** (attempt - 2), maxMs);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

export class TaskRunner {
  private readonly concurrency: number;

  private readonly defaultTimeoutMs: number;

  private readonly staleTaskTtlMs: number;

  private readonly queue: string[] = [];

  private readonly tasks = new Map<string, InternalTask<unknown>>();

  private readonly retryInputs = new Map<string, EnqueueTaskInput<unknown>>();

  private activeCount = 0;

  private pumpQueued = false;

  constructor(concurrencyOrOptions: number | TaskRunnerOptions = 1, options?: TaskRunnerOptions) {
    const merged = typeof concurrencyOrOptions === 'number'
      ? { ...(options ?? {}), concurrency: concurrencyOrOptions }
      : { ...concurrencyOrOptions };

    this.concurrency = Math.max(1, Math.floor(merged.concurrency ?? 1));
    this.defaultTimeoutMs = normalizeTimeoutMs(merged.defaultTimeoutMs, 30_000);
    this.staleTaskTtlMs = normalizeTimeoutMs(merged.staleTaskTtlMs, 5 * 60_000);

    // 最佳努力恢复：把上次崩溃遗留的 pending/running 任务标记为 failed。 | Best-effort recovery: mark pending/running tasks left from a crash as failed.
    void this.recoverStaleTasks().catch((error) => {
      console.error('[TaskRunner] recoverStaleTasks failed:', error);
    });
  }

  async enqueue<TResult>(input: EnqueueTaskInput<TResult>): Promise<EnqueueTaskResult<TResult>> {
    const taskId = createTaskId(input.taskType);
    const maxAttempts = normalizeMaxAttempts(input.maxAttempts);
    const timeoutMs = normalizeTimeoutMs(input.timeoutMs, this.defaultTimeoutMs);
    const controller = new AbortController();

    let resolve!: (value: TResult) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<TResult>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    const internalTask: InternalTask<TResult> = {
      taskId,
      input,
      controller,
      resolve,
      reject,
      promise,
      maxAttempts,
      timeoutMs,
      started: false,
      completed: false,
    };
    this.tasks.set(taskId, internalTask as InternalTask<unknown>);
    this.queue.push(taskId);

    const db = await getDb();
    const timestamp = nowIso();
    await db.collections.ai_tasks.insert({
      id: taskId,
      taskType: input.taskType,
      status: 'pending',
      targetId: input.targetId,
      ...(input.targetType ? { targetType: input.targetType } : {}),
      ...(input.modelId ? { modelId: input.modelId } : {}),
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    this.schedulePumpQueue();

    return {
      taskId,
      result: promise,
      cancel: () => {
        controller.abort();
      },
    };
  }

  cancel(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.completed) return false;
    task.controller.abort();
    return true;
  }

  async retry(taskId: string): Promise<string | null> {
    const retryInput = this.retryInputs.get(taskId);
    if (!retryInput) return null;

    this.retryInputs.delete(taskId);
    try {
      const enqueued = await this.enqueue(retryInput as EnqueueTaskInput<unknown>);
      return enqueued.taskId;
    } catch (error) {
      this.retryInputs.set(taskId, retryInput);
      throw error;
    }
  }

  private schedulePumpQueue(): void {
    if (this.pumpQueued) return;
    this.pumpQueued = true;
    queueMicrotask(() => {
      this.pumpQueued = false;
      this.pumpQueue();
    });
  }

  private pumpQueue(): void {
    while (this.activeCount < this.concurrency) {
      const taskId = this.queue.shift();
      if (!taskId) return;
      const task = this.tasks.get(taskId);
      if (!task || task.started || task.completed) {
        continue;
      }
      task.started = true;
      this.activeCount += 1;
      void this.runTask(task);
    }
  }

  private async runTask<TResult>(task: InternalTask<TResult>): Promise<void> {
    const db = await getDb();
    let terminalStatus: AiTaskDoc['status'] = 'failed';

    try {
      await this.updateTaskStatus(db, task.taskId, 'running');

      let lastError: unknown = new Error('Task failed');
      for (let attempt = 1; attempt <= task.maxAttempts; attempt += 1) {
        if (task.controller.signal.aborted) {
          throw new Error('Task cancelled');
        }

        try {
          const result = await this.runWithTimeout(task, attempt);
          if (task.controller.signal.aborted) {
            throw new Error('Task cancelled');
          }
          await this.updateTaskStatus(db, task.taskId, 'done');
          terminalStatus = 'done';
          task.completed = true;
          task.resolve(result);
          return;
        } catch (error) {
          lastError = error;
          if (task.controller.signal.aborted) {
            break;
          }
          if (attempt < task.maxAttempts) {
            const delay = backoffDelay(attempt + 1);
            if (delay > 0) await sleep(delay, task.controller.signal);
            if (task.controller.signal.aborted) break;
            await this.updateTaskStatus(db, task.taskId, 'running');
            continue;
          }
        }
      }

      const message = lastError instanceof TaskTimeoutError
        ? lastError.message
        : (task.controller.signal.aborted
          ? 'Task cancelled'
          : (lastError instanceof Error ? lastError.message : 'Task failed'));

      await this.updateTaskStatus(db, task.taskId, 'failed', message);
      terminalStatus = 'failed';
      task.completed = true;
      task.reject(lastError);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Task failed';
      await this.updateTaskStatus(db, task.taskId, 'failed', message);
      terminalStatus = 'failed';
      task.completed = true;
      task.reject(error);
    } finally {
      this.tasks.delete(task.taskId);
      if (terminalStatus === 'done') {
        this.retryInputs.delete(task.taskId);
      } else {
        this.retryInputs.set(task.taskId, task.input as EnqueueTaskInput<unknown>);
      }
      this.activeCount = Math.max(0, this.activeCount - 1);
      this.schedulePumpQueue();
    }
  }

  private async runWithTimeout<TResult>(task: InternalTask<TResult>, attempt: number): Promise<TResult> {
    const timeoutMs = task.timeoutMs;
    let timer: ReturnType<typeof setTimeout> | null = null;

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          task.controller.abort();
          reject(new TaskTimeoutError(timeoutMs));
        }, timeoutMs);
      });

      const result = await Promise.race([
        task.input.run({
            taskId: task.taskId,
            signal: task.controller.signal,
            attempt,
            maxAttempts: task.maxAttempts,
          }),
        timeoutPromise,
      ]);

      return result as TResult;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async recoverStaleTasks(): Promise<void> {
    const db = await getDb();
    const now = Date.now();

    const runningRows = await db.collections.ai_tasks.findByIndex('status', 'running');
    const pendingRows = await db.collections.ai_tasks.findByIndex('status', 'pending');
    const staleRows = [...runningRows, ...pendingRows]
      .map((row) => row.toJSON())
      .filter((row) => now - Date.parse(row.updatedAt) >= this.staleTaskTtlMs);

    for (const row of staleRows) {
      await db.collections.ai_tasks.insert({
        ...row,
        status: 'failed',
        errorMessage: row.errorMessage ?? 'Recovered as stale task after app restart',
        updatedAt: nowIso(),
      });
    }

    // 通知 UI：有过期任务被恢复 | Notify UI: stale tasks were recovered
    if (staleRows.length > 0) {
      window.dispatchEvent(new CustomEvent('taskrunner:stale-recovered', {
        detail: { count: staleRows.length },
      }));
    }
  }

  private async updateTaskStatus(
    db: Awaited<ReturnType<typeof getDb>>,
    taskId: string,
    status: AiTaskDoc['status'],
    errorMessage?: string,
  ): Promise<void> {
    const row = await db.collections.ai_tasks.findOne({ selector: { id: taskId } }).exec();
    if (!row) return;

    await db.collections.ai_tasks.update(taskId, {
      status,
      updatedAt: nowIso(),
      ...(errorMessage ? { errorMessage } : {}),
    });
  }
}
