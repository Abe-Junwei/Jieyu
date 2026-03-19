import { getDb, type EmbeddingDoc, type EmbeddingSourceType } from '../../../db';
import {
  WorkerEmbeddingRuntime,
  type EmbeddingRuntime,
  type EmbeddingRuntimeOptions,
  type EmbeddingRuntimeProgress,
} from './EmbeddingRuntime';
import { TaskRunner } from '../tasks/TaskRunner';
import { getGlobalTaskRunner } from '../tasks/taskRunnerSingleton';
import {
  buildPdfEmbeddingSourceId,
  extractPdfDetailsPatch,
  extractPdfTextFragments,
  extractPdfTextFragmentsFromSource,
  isPdfMediaItem,
  splitPdfFragmentsToChunks,
} from './pdfTextUtils';

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
  chunkSizeChars?: number;
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

export class EmbeddingService {
  constructor(
    private readonly runtime: EmbeddingRuntime = new WorkerEmbeddingRuntime(),
    private readonly taskRunner: TaskRunner = getGlobalTaskRunner(),
  ) {}

  /**
   * 从 user_notes 表拉取全部笔记并向量化 | Vectorize all user notes from the user_notes table.
   * 自动过滤无文字内容的笔记 | Skips notes with empty text.
   */
  async buildNotesEmbeddings(options?: BuildEmbeddingsOptions): Promise<BuildEmbeddingsResult> {
    const db = await getDb();
    const noteRows = await db.collections.user_notes.find().exec();
    const sources: EmbeddingBuildSource[] = [];
    for (const row of noteRows) {
      const note = row.toJSON();
      // MultiLangString: prefer 'und' → 'en' → first available key | 优先取 'und'，其次 'en'，最后第一个非空值
      const content = note.content as Record<string, string>;
      const text = (content['und'] ?? content['en'] ?? Object.values(content).find((v) => v.trim()) ?? '').trim();
      if (!text) continue;
      sources.push({ sourceType: 'note', sourceId: note.id, text });
    }
    return this.buildEmbeddings(sources, options);
  }

  /**
   * 从 media_items 抽取 PDF 文本并向量化 | Build PDF embeddings from media_items extracted text fields.
   */
  async buildPdfEmbeddings(options?: BuildEmbeddingsOptions): Promise<BuildEmbeddingsResult> {
    const db = await getDb();
    const mediaRows = await db.collections.media_items.find().exec();
    const chunkSizeChars = Number.isFinite(options?.chunkSizeChars)
      ? Math.max(160, Math.floor(options?.chunkSizeChars ?? 720))
      : 720;

    const sources: EmbeddingBuildSource[] = [];
    for (const row of mediaRows) {
      const media = row.toJSON();
      if (!isPdfMediaItem(media)) continue;

      const details = media.details as Record<string, unknown> | undefined;
      const preExtracted = extractPdfTextFragments(details);
      let fragments = preExtracted;
      if (fragments.length === 0) {
        try {
          fragments = await extractPdfTextFragmentsFromSource(details);
          if (fragments.length > 0) {
            const patch = await extractPdfDetailsPatch(details);
            if (patch) {
              await db.collections.media_items.insert({
                ...media,
                details: {
                  ...(details ?? {}),
                  extractedText: patch.extractedText,
                  pages: patch.pages,
                  extractor: patch.extractor,
                  extractedAt: patch.extractedAt,
                },
              });
            }
          }
        } catch {
          // 跳过无法解析的 PDF，避免中断整批任务 | Skip unreadable PDFs to keep batch embedding resilient.
          fragments = [];
        }
      }
      const chunks = splitPdfFragmentsToChunks(fragments, chunkSizeChars);
      for (const chunk of chunks) {
        if (!chunk.text.trim()) continue;
        sources.push({
          sourceType: 'pdf',
          sourceId: buildPdfEmbeddingSourceId(media.id, chunk.page, chunk.chunk),
          text: chunk.text,
        });
      }
    }

    return this.buildEmbeddings(sources, options);
  }

  async buildEmbeddings(
    sources: EmbeddingBuildSource[],
    options?: BuildEmbeddingsOptions,
  ): Promise<BuildEmbeddingsResult> {
    const modelId = options?.modelId ?? DEFAULT_MODEL_ID;
    const modelVersion = options?.modelVersion ?? DEFAULT_MODEL_VERSION;
    const batchSize = normalizeBatchSize(options?.batchSize);
    const retries = normalizeRetries(options?.retries);
    const enqueued = await this.taskRunner.enqueue<BuildEmbeddingsResult>({
      taskType: 'embed',
      targetId: 'embeddings',
      targetType: 'batch',
      modelId,
      maxAttempts: 1,
      run: async ({ taskId }) => this.executeBuild(taskId, sources, {
        ...options,
        modelId,
        modelVersion,
        batchSize,
        retries,
      }),
    });

    return enqueued.result;
  }

  terminate(): void {
    this.runtime.terminate();
  }

  private async executeBuild(
    taskId: string,
    sources: EmbeddingBuildSource[],
    options: Required<Pick<BuildEmbeddingsOptions, 'modelId' | 'modelVersion' | 'batchSize' | 'retries'>> & BuildEmbeddingsOptions,
  ): Promise<BuildEmbeddingsResult> {
    const modelId = options.modelId;
    const modelVersion = options.modelVersion;
    const total = sources.length;
    const startedAt = Date.now();
    const db = await getDb();

    if (total === 0) {
      options.onProgress?.({ stage: 'done', processed: 0, total: 0 });
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

    options.onProgress?.({ stage: 'preparing', processed: 0, total });

    const runtimeOptions: EmbeddingRuntimeOptions = {
      modelId,
      retries: options.retries,
      onProgress: (progress) => {
        options.onProgress?.({
          stage: 'running',
          processed: 0,
          total,
          runtime: progress,
        });
      },
    };

    let generated = 0;
    let skipped = 0;

    await this.runtime.preload(runtimeOptions);

    const batches = chunkArray(sources, options.batchSize);
    let processed = 0;
    let batchElapsedSum = 0;

    for (const batch of batches) {
      const batchStartedAt = Date.now();
      const batchTexts = batch.map((item) => normalizeSourceText(item.text));
      const vectors = await this.runtime.embed(batchTexts, runtimeOptions);

      options.onProgress?.({ stage: 'persisting', processed: processed + batch.length, total });

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
      options.onProgress?.({ stage: 'running', processed, total });
    }

    options.onProgress?.({ stage: 'done', processed: total, total });

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
  }
}
