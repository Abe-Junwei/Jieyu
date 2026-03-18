import { getDb, type AiTaskDoc, type EmbeddingDoc, type EmbeddingSourceType } from '../../../db';
import {
  WorkerEmbeddingRuntime,
  type EmbeddingRuntime,
  type EmbeddingRuntimeOptions,
  type EmbeddingRuntimeProgress,
} from './EmbeddingRuntime';

export interface EmbeddingBuildSource {
  sourceType: EmbeddingSourceType;
  sourceId: string;
  text: string;
}

export interface EmbeddingBuildProgress {
  stage: 'preparing' | 'running' | 'persisting' | 'done';
  processed: number;
  total: number;
  runtime?: EmbeddingRuntimeProgress;
}

export interface BuildEmbeddingsOptions {
  modelId?: string;
  modelVersion?: string;
  batchSize?: number;
  retries?: number;
  onProgress?: (progress: EmbeddingBuildProgress) => void;
}

export interface BuildEmbeddingsResult {
  taskId: string;
  total: number;
  generated: number;
  skipped: number;
  modelId: string;
  modelVersion: string;
  elapsedMs: number;
  averageBatchMs: number;
}

const DEFAULT_MODEL_ID = 'Xenova/multilingual-e5-small';
const DEFAULT_MODEL_VERSION = '2026-03';
const DEFAULT_BATCH_SIZE = 8;

function nowIso(): string {
  return new Date().toISOString();
}

function newTaskId(): string {
  return `task_embed_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeBatchSize(input: number | undefined): number {
  if (!Number.isFinite(input)) return DEFAULT_BATCH_SIZE;
  return Math.min(32, Math.max(1, Math.floor(input ?? DEFAULT_BATCH_SIZE)));
}

function normalizeRetries(input: number | undefined): number {
  if (!Number.isFinite(input)) return 2;
  return Math.min(3, Math.max(1, Math.floor(input ?? 2)));
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function normalizeSourceText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

function buildEmbeddingId(sourceType: EmbeddingSourceType, sourceId: string, modelId: string, modelVersion: string): string {
  return `${sourceType}::${sourceId}::${modelId}::${modelVersion}`;
}

function buildContentHash(sourceText: string, modelId: string, modelVersion: string): string {
  return fnv1a(`${modelId}::${modelVersion}::${sourceText}`);
}

function chunkArray<T>(input: T[], batchSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < input.length; i += batchSize) {
    chunks.push(input.slice(i, i + batchSize));
  }
  return chunks;
}

function createTask(taskId: string, modelId: string): AiTaskDoc {
  const timestamp = nowIso();
  return {
    id: taskId,
    taskType: 'embed',
    status: 'running',
    targetId: 'embeddings',
    targetType: 'batch',
    modelId,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export class EmbeddingService {
  constructor(private readonly runtime: EmbeddingRuntime = new WorkerEmbeddingRuntime()) {}

  async buildEmbeddings(
    sources: EmbeddingBuildSource[],
    options?: BuildEmbeddingsOptions,
  ): Promise<BuildEmbeddingsResult> {
    const modelId = options?.modelId ?? DEFAULT_MODEL_ID;
    const modelVersion = options?.modelVersion ?? DEFAULT_MODEL_VERSION;
    const batchSize = normalizeBatchSize(options?.batchSize);
    const retries = normalizeRetries(options?.retries);
    const taskId = newTaskId();
    const total = sources.length;
    const startedAt = Date.now();

    const db = await getDb();
    await db.collections.ai_tasks.insert(createTask(taskId, modelId));

    if (total === 0) {
      await db.collections.ai_tasks.insert({
        ...(await this.requireTask(db, taskId)),
        status: 'done',
        updatedAt: nowIso(),
      });
      options?.onProgress?.({ stage: 'done', processed: 0, total: 0 });
      return {
        taskId,
        total: 0,
        generated: 0,
        skipped: 0,
        modelId,
        modelVersion,
        elapsedMs: 0,
        averageBatchMs: 0,
      };
    }

    options?.onProgress?.({ stage: 'preparing', processed: 0, total });

    const runtimeOptions: EmbeddingRuntimeOptions = {
      modelId,
      retries,
      onProgress: (progress) => {
        options?.onProgress?.({
          stage: 'running',
          processed: 0,
          total,
          runtime: progress,
        });
      },
    };

    let generated = 0;
    let skipped = 0;

    try {
      await this.runtime.preload(runtimeOptions);

      const batches = chunkArray(sources, batchSize);
      let processed = 0;
      let batchElapsedSum = 0;

      for (const batch of batches) {
        const batchStartedAt = Date.now();
        const batchTexts = batch.map((item) => normalizeSourceText(item.text));
        const vectors = await this.runtime.embed(batchTexts, runtimeOptions);

        options?.onProgress?.({ stage: 'persisting', processed, total });

        const batchIds = batch.map((source) => (
          buildEmbeddingId(source.sourceType, source.sourceId, modelId, modelVersion)
        ));
        const existingRows = await db.collections.embeddings.findByIndexAnyOf('id', batchIds);
        const existingHashById = new Map<string, string>(
          existingRows.map((row) => {
            const item = row.toJSON();
            return [item.id, item.contentHash] as const;
          }),
        );

        const upserts: EmbeddingDoc[] = [];
        for (let i = 0; i < batch.length; i += 1) {
          const source = batch[i];
          if (!source) continue;

          const normalizedText = batchTexts[i] ?? '';
          const vector = vectors[i] ?? [];
          const id = buildEmbeddingId(source.sourceType, source.sourceId, modelId, modelVersion);
          const contentHash = buildContentHash(normalizedText, modelId, modelVersion);
          const existingHash = existingHashById.get(id);
          if (existingHash && existingHash === contentHash) {
            skipped += 1;
            continue;
          }

          upserts.push({
            id,
            sourceType: source.sourceType,
            sourceId: source.sourceId,
            model: modelId,
            modelVersion,
            contentHash,
            vector,
            createdAt: nowIso(),
          });
        }

        if (upserts.length > 0) {
          await db.collections.embeddings.bulkInsert(upserts);
          generated += upserts.length;
        }

        processed += batch.length;
        batchElapsedSum += Date.now() - batchStartedAt;
        options?.onProgress?.({ stage: 'running', processed, total });
      }

      await db.collections.ai_tasks.insert({
        ...(await this.requireTask(db, taskId)),
        status: 'done',
        updatedAt: nowIso(),
      });

      options?.onProgress?.({ stage: 'done', processed: total, total });

      return {
        taskId,
        total,
        generated,
        skipped,
        modelId,
        modelVersion,
        elapsedMs: Date.now() - startedAt,
        averageBatchMs: batches.length > 0 ? Math.round(batchElapsedSum / batches.length) : 0,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Embedding build failed';
      await db.collections.ai_tasks.insert({
        ...(await this.requireTask(db, taskId)),
        status: 'failed',
        errorMessage: message,
        updatedAt: nowIso(),
      });
      throw error;
    }
  }

  terminate(): void {
    this.runtime.terminate();
  }

  private async requireTask(
    db: Awaited<ReturnType<typeof getDb>>,
    taskId: string,
  ): Promise<AiTaskDoc> {
    const task = await db.collections.ai_tasks.findOne({ selector: { id: taskId } }).exec();
    if (!task) {
      throw new Error(`AI task not found: ${taskId}`);
    }
    return task.toJSON();
  }
}
