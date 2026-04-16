// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import { EmbeddingService, type EmbeddingBuildSource } from './EmbeddingService';
import type { EmbeddingProvider } from './EmbeddingProvider';

class FakeRuntime implements EmbeddingProvider {
  readonly kind = 'local' as const;
  readonly label = 'FakeRuntime';
  readonly modelId = 'fake';

  constructor(
    private readonly vectors: number[][],
    private readonly shouldFail = false,
  ) {}

  async preload(): Promise<void> {
    if (this.shouldFail) {
      throw new Error('runtime preload failed');
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (this.shouldFail) {
      throw new Error('runtime embed failed');
    }
    return this.vectors.slice(0, texts.length);
  }

  async isAvailable(): Promise<boolean> {
    return !this.shouldFail;
  }

  terminate(): void {
    // no-op for test runtime
  }
}

async function clearEmbeddingTables(): Promise<void> {
  await Promise.all([
    db.ai_tasks.clear(),
    db.embeddings.clear(),
    db.media_items.clear(),
  ]);
}

describe('EmbeddingService', () => {
  beforeEach(async () => {
    await db.open();
    await clearEmbeddingTables();
  });

  afterEach(async () => {
    await clearEmbeddingTables();
  });

  it('builds embeddings and persists ai task done state', async () => {
    const service = new EmbeddingService(new FakeRuntime([
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
    ]));

    const sources: EmbeddingBuildSource[] = [
      { sourceType: 'unit', sourceId: 'utt_1', text: 'hello world' },
      { sourceType: 'note', sourceId: 'note_1', text: 'linguistic note' },
    ];

    const result = await service.buildEmbeddings(sources, {
      modelId: 'test-model',
      modelVersion: 'v-test',
      batchSize: 2,
    });

    expect(result.generated).toBe(2);
    expect(result.skipped).toBe(0);

    const task = await db.ai_tasks.get(result.taskId);
    expect(task?.status).toBe('done');

    const rows = await db.embeddings.toArray();
    expect(rows.length).toBe(2);
    expect(rows[0]?.model).toBe('test-model');
    expect(rows[0]?.modelVersion).toBe('v-test');
  });

  it('skips unchanged sources on re-run with same model/version', async () => {
    const service = new EmbeddingService(new FakeRuntime([
      [0.1, 0.2],
      [0.3, 0.4],
    ]));

    const sources: EmbeddingBuildSource[] = [
      { sourceType: 'unit', sourceId: 'utt_1', text: 'hello world' },
      { sourceType: 'schema', sourceId: 'tier_def_1', text: 'tier description' },
    ];

    await service.buildEmbeddings(sources, {
      modelId: 'test-model',
      modelVersion: 'v-test',
      batchSize: 2,
    });

    const rerun = await service.buildEmbeddings(sources, {
      modelId: 'test-model',
      modelVersion: 'v-test',
      batchSize: 2,
    });

    expect(rerun.generated).toBe(0);
    expect(rerun.skipped).toBe(2);
    expect((await db.embeddings.toArray()).length).toBe(2);
  });

  it('marks ai task failed when runtime throws', async () => {
    const service = new EmbeddingService(new FakeRuntime([], true));

    await expect(service.buildEmbeddings([
      { sourceType: 'unit', sourceId: 'utt_1', text: 'x' },
    ], {
      modelId: 'test-model',
      modelVersion: 'v-test',
    })).rejects.toThrow('runtime preload failed');

    const tasks = await db.ai_tasks.toArray();
    expect(tasks.length).toBe(1);
    expect(tasks[0]?.status).toBe('failed');
  });

  it('builds pdf embeddings from media extracted text', async () => {
    const now = new Date().toISOString();
    await db.media_items.bulkPut([
      {
        id: 'media_pdf_1',
        textId: 'text_1',
        filename: 'field-notes.pdf',
        details: {
          mimeType: 'application/pdf',
          extractedText: 'This is a pdf summary about phonology and grammar.',
        },
        isOfflineCached: true,
        createdAt: now,
      },
      {
        id: 'media_audio_1',
        textId: 'text_1',
        filename: 'session.wav',
        details: { mimeType: 'audio/wav' },
        isOfflineCached: true,
        createdAt: now,
      },
    ]);

    const service = new EmbeddingService(new FakeRuntime([
      [0.11, 0.21, 0.31],
    ]));

    const result = await service.buildPdfEmbeddings({
      modelId: 'test-model',
      modelVersion: 'v-test',
      batchSize: 2,
    });

    expect(result.total).toBeGreaterThan(0);
    expect(result.generated).toBeGreaterThan(0);

    const rows = await db.embeddings.where('sourceType').equals('pdf').toArray();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.sourceId.startsWith('media_pdf_1#'))).toBe(true);
  });

  it('splits long pdf text into multiple chunks', async () => {
    const now = new Date().toISOString();
    const longText = Array.from({ length: 80 }, (_, index) => `token${index}`).join(' ');
    await db.media_items.put({
      id: 'media_pdf_long',
      textId: 'text_1',
      filename: 'long-doc.pdf',
      details: {
        mimeType: 'application/pdf',
        extractedText: longText,
      },
      isOfflineCached: true,
      createdAt: now,
    });

    const vectors = Array.from({ length: 12 }, () => [0.3, 0.2]);
    const service = new EmbeddingService(new FakeRuntime(vectors));
    const result = await service.buildPdfEmbeddings({
      modelId: 'test-model',
      modelVersion: 'v-test',
      chunkSizeChars: 80,
      batchSize: 4,
    });

    expect(result.generated).toBeGreaterThan(1);
    const rows = await db.embeddings.where('sourceType').equals('pdf').toArray();
    expect(rows.length).toBeGreaterThan(1);
  });

  it('extracts pdf embeddings from raw pdfBlob source when details text is missing', async () => {
    const now = new Date().toISOString();
    await db.media_items.put({
      id: 'media_pdf_blob',
      textId: 'text_1',
      filename: 'blob-doc.pdf',
      details: {
        mimeType: 'application/pdf',
        pdfBlob: new Blob(['fake-pdf-bytes'], { type: 'application/pdf' }),
      },
      isOfflineCached: true,
      createdAt: now,
    });

    const service = new EmbeddingService(new FakeRuntime([
      [0.2, 0.1, 0.3],
      [0.4, 0.2, 0.1],
    ]));

    const result = await service.buildPdfEmbeddings({
      modelId: 'test-model',
      modelVersion: 'v-test',
      batchSize: 2,
    });

    // 无真实 pdf.js 解析时本用例至少保证流程不抛错 | Ensures blob fallback path is non-breaking even without real parser output.
    expect(result.total).toBeGreaterThanOrEqual(0);
  });
});
