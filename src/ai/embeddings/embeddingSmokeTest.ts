/**
 * Embedding 端到端冒烟测试（浏览器运行时）
 * End-to-end smoke test for the embedding pipeline (browser runtime).
 *
 * 验证完整链路：WorkerEmbeddingRuntime → embedding.worker.ts → @huggingface/transformers v4 → ONNX → 向量
 * Validates full chain: WorkerEmbeddingRuntime → embedding.worker.ts → @huggingface/transformers v4 → ONNX → vectors
 *
 * 用法 / Usage:
 *   在浏览器控制台运行：import('/src/ai/embeddings/embeddingSmokeTest.ts').then(m => m.runEmbeddingSmokeTest())
 *   或从 UI 组件调用。
 */

import { WorkerEmbeddingRuntime, type EmbeddingRuntimeProgress } from './EmbeddingRuntime';
import { DEFAULT_LOCAL_EMBEDDING_MODEL_ID } from './localEmbeddingModelConfig';

export interface SmokeTestResult {
  ok: boolean;
  /** 实际使用了降级 FNV-hash（而非真正的 ONNX 模型）| True if FNV-hash fallback was used instead of real ONNX model */
  usingFallback: boolean;
  modelId: string;
  dimension: number;
  preloadMs: number;
  embedMs: number;
  cosineSim: number;
  error?: string;
  stages: string[];
}

function cosineSimilarity(a: number[], b: number[]): number {
  const size = Math.min(a.length, b.length);
  if (size === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < size; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA <= 0 || normB <= 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function runEmbeddingSmokeTest(
  modelId = DEFAULT_LOCAL_EMBEDDING_MODEL_ID,
): Promise<SmokeTestResult> {
  const stages: string[] = [];
  let usingFallback = false;

  const runtime = new WorkerEmbeddingRuntime();

  const onProgress = (p: EmbeddingRuntimeProgress) => {
    stages.push(`${p.stage}${p.message ? `:${p.message}` : ''}`);
    if (p.usingFallback) usingFallback = true;
  };

  try {
    // 1. Preload（模型下载 + ONNX 初始化）| Preload (model download + ONNX init)
    const preloadStart = performance.now();
    await runtime.preload({ modelId, onProgress });
    const preloadMs = performance.now() - preloadStart;

    // 2. Embed 两条语义相似文本 + 一条不同文本 | Embed 2 similar + 1 different text
    const texts = [
      'The cat sat on the mat.',
      'A kitten was sitting on a rug.',
      '量子力学的基本原理是什么？',
    ];
    const embedStart = performance.now();
    const vectors = await runtime.embed(texts, { modelId, onProgress });
    const embedMs = performance.now() - embedStart;

    if (vectors.length !== 3) {
      return { ok: false, usingFallback, modelId, dimension: 0, preloadMs, embedMs, cosineSim: 0, error: `Expected 3 vectors, got ${vectors.length}`, stages };
    }

    const dim = vectors[0]!.length;
    const simSimilar = cosineSimilarity(vectors[0]!, vectors[1]!);
    const simDiff = cosineSimilarity(vectors[0]!, vectors[2]!);

    // 语义相似的文本余弦相似度应高于不相似的 | Similar texts should have higher cosine score
    const semanticOk = !usingFallback ? simSimilar > simDiff : true;

    return {
      ok: semanticOk,
      usingFallback,
      modelId,
      dimension: dim,
      preloadMs: Math.round(preloadMs),
      embedMs: Math.round(embedMs),
      cosineSim: Math.round(simSimilar * 1000) / 1000,
      ...(!semanticOk ? { error: `Semantic check failed: sim(similar)=${simSimilar.toFixed(3)} <= sim(diff)=${simDiff.toFixed(3)}` } : {}),
      stages,
    };
  } catch (err) {
    return {
      ok: false,
      usingFallback,
      modelId,
      dimension: 0,
      preloadMs: 0,
      embedMs: 0,
      cosineSim: 0,
      error: err instanceof Error ? err.message : String(err),
      stages,
    };
  } finally {
    runtime.terminate();
  }
}
