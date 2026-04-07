import { getDb, type EmbeddingDoc, type EmbeddingSourceType } from '../../db';
import type { EmbeddingProvider } from './EmbeddingProvider';
import type { EmbeddingRuntimeProgress } from './EmbeddingRuntime';
import { TaskRunner } from '../tasks/TaskRunner';
import { getGlobalTaskRunner } from '../tasks/taskRunnerSingleton';
import { createLogger } from '../../observability/logger';
import {
  buildPdfEmbeddingSourceId,
  extractPdfDetailsPatch,
  extractPdfTextFragments,
  extractPdfTextFragmentsFromSource,
  isPdfMediaItem,
} from './pdfTextUtils';
import { semanticChunk } from './semanticChunker';
import { DEFAULT_LOCAL_EMBEDDING_MODEL_ID } from './localEmbeddingModelConfig';

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
  /** Set when local model failed to load and FNV-hash fallback is in use */
  usingFallback?: boolean;
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
  /** True if the local embedding model was unavailable and FNV-hash fallback was used */
  usingFallback?: boolean;
}

const DEFAULT_MODEL_VERSION = '2026-03';
const DEFAULT_BATCH_SIZE = 8;
const log = createLogger('EmbeddingService');

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
  private readonly inFlightBuilds = new Map<string, Promise<BuildEmbeddingsResult>>();

  constructor(
    private readonly provider: EmbeddingProvider,
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

      // 长笔记（> 300 字）走语义分块 | Long notes (>300 chars) use semantic chunking
      if (text.length > 300) {
        const chunks = semanticChunk(text, { maxChars: 600, overlapSentences: 1 });
        for (let ci = 0; ci < chunks.length; ci += 1) {
          const chunkText = chunks[ci];
          if (chunkText && chunkText.trim()) {
            sources.push({
              sourceType: 'note',
              sourceId: chunks.length > 1 ? `${note.id}#chunk=${ci + 1}` : note.id,
              text: chunkText.trim(),
            });
          }
        }
      } else {
        sources.push({ sourceType: 'note', sourceId: note.id, text });
      }
    }
    return this.buildEmbeddings(sources, options);
  }

  /**
   * 从 media_items 抽取 PDF 文本并向量化 | Build PDF embeddings from media_items extracted text fields.
   * 阶段 A：使用语义感知分块（句子边界 + 滑动窗口重叠）替代硬字符数切分。
   * Phase A: uses semantic-aware chunking (sentence boundary + sliding overlap) instead of hard char truncation.
   */
  async buildPdfEmbeddings(options?: BuildEmbeddingsOptions): Promise<BuildEmbeddingsResult> {
    const db = await getDb();
    const mediaRows = await db.collections.media_items.find().exec();
    const maxChars = Number.isFinite(options?.chunkSizeChars)
      ? Math.max(160, Math.floor(options?.chunkSizeChars ?? 600))
      : 600;

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
        } catch (error) {
          // 跳过无法解析的 PDF，避免中断整批任务 | Skip unreadable PDFs to keep batch embedding resilient.
          log.warn('Failed to extract text from PDF source, skip current media item', {
            mediaId: media.id,
            error: error instanceof Error ? error.message : String(error),
          });
          fragments = [];
        }
      }

      // 阶段 A：语义感知分块 — 跨 fragment 拼接文本后整体分块，保留页码元数据
      // Phase A: semantic chunking — concatenate fragment text then chunk, preserving page metadata
      let globalChunkIndex = 0;
      for (const fragment of fragments) {
        if (!fragment.text.trim()) continue;
        const chunks = semanticChunk(fragment.text, { maxChars, overlapSentences: 1 });
        for (const chunkText of chunks) {
          if (!chunkText.trim()) continue;
          globalChunkIndex += 1;
          sources.push({
            sourceType: 'pdf',
            sourceId: buildPdfEmbeddingSourceId(media.id, fragment.page, globalChunkIndex),
            text: chunkText,
          });
        }
      }
    }

    return this.buildEmbeddings(sources, options);
  }

  async buildEmbeddings(
    sources: EmbeddingBuildSource[],
    options?: BuildEmbeddingsOptions,
  ): Promise<BuildEmbeddingsResult> {
    const modelId = options?.modelId ?? this.provider.modelId ?? DEFAULT_LOCAL_EMBEDDING_MODEL_ID;
    const modelVersion = options?.modelVersion ?? DEFAULT_MODEL_VERSION;
    const batchSize = normalizeBatchSize(options?.batchSize);
    const retries = normalizeRetries(options?.retries);
    const taskFingerprint = this.buildTaskFingerprint(sources, {
      modelId,
      modelVersion,
      batchSize,
      retries,
    });
    const existing = this.inFlightBuilds.get(taskFingerprint);
    if (existing) {
      return existing;
    }

    const running = (async () => {
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
    })();

    this.inFlightBuilds.set(taskFingerprint, running);
    try {
      return await running;
    } finally {
      this.inFlightBuilds.delete(taskFingerprint);
    }
  }

  terminate(): void {
    this.provider.terminate();
  }

  private async embedWithRetry(texts: string[], retries: number): Promise<number[][]> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        return await this.provider.embed(texts);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Embedding failed after retries');
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
        usingFallback: false,
      };
    }

    options.onProgress?.({ stage: 'preparing', processed: 0, total });

    let generated = 0;
    let skipped = 0;
    let usingFallback = false;

    // Capture usingFallback from preload progress if the provider surfaces it
    await this.provider.preload?.({
      onProgress: (progress) => {
        if (progress.usingFallback) {
          usingFallback = true;
          options.onProgress?.({ stage: 'preparing', processed: 0, total, usingFallback: true });
        }
      },
    });

    const batches = chunkArray(sources, options.batchSize);
    let processed = 0;
    let batchElapsedSum = 0;

    for (const batch of batches) {
      const batchStartedAt = Date.now();
      const batchTexts = batch.map((item) => normalizeSourceText(item.text));
      const vectors = await this.embedWithRetry(batchTexts, options.retries);

      options.onProgress?.({ stage: 'persisting', processed: processed + batch.length, total, usingFallback });

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
      options.onProgress?.({ stage: 'running', processed, total, usingFallback });
    }

    options.onProgress?.({ stage: 'done', processed: total, total, usingFallback });

    return {
      taskId,
      total,
      generated,
      skipped,
      modelId,
      modelVersion,
      elapsedMs: Date.now() - startedAt,
      averageBatchMs: batches.length > 0 ? Math.round(batchElapsedSum / batches.length) : 0,
      usingFallback,
    };
  }

  private buildTaskFingerprint(
    sources: EmbeddingBuildSource[],
    options: { modelId: string; modelVersion: string; batchSize: number; retries: number },
  ): string {
    const sourceSignature = sources
      .map((source) => `${source.sourceType}:${source.sourceId}:${fnv1a(normalizeSourceText(source.text))}`)
      .join('|');
    return fnv1a([
      options.modelId,
      options.modelVersion,
      String(options.batchSize),
      String(options.retries),
      sourceSignature,
    ].join('::'));
  }
}
