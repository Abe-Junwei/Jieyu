/**
 * 嵌入模型默认化决策 | Embedding default-model decision rule
 *
 * 这里收敛 Arctic-Embed-XS 与 E5-Small 的默认模型切换规则，
 * 让测试、文档与运行时决策使用同一套门槛。
 * Centralizes the promotion rule between Arctic-Embed-XS and E5-Small so
 * tests, docs, and runtime decisions share the same thresholds.
 */

import {
  ARCTIC_LOCAL_EMBEDDING_MODEL_ID,
  DEFAULT_LOCAL_EMBEDDING_MODEL_ID,
} from '../embeddings/localEmbeddingModelConfig';

export const ARCTIC_RECALL_RATIO_THRESHOLD = 0.95;
export const ARCTIC_LOAD_TIME_RATIO_THRESHOLD = 0.5;

export interface EmbeddingModelDecisionInput {
  baselineRecall5: number;
  baselineLoadMs: number;
  candidateRecall5: number;
  candidateLoadMs: number;
}

export interface EmbeddingModelDecisionResult {
  selectedModelId: string;
  qualityPass: boolean;
  latencyPass: boolean;
  recallRatio: number;
  loadRatio: number;
}

export function decideDefaultLocalEmbeddingModel(
  input: EmbeddingModelDecisionInput,
): EmbeddingModelDecisionResult {
  const recallRatio = input.baselineRecall5 > 0
    ? input.candidateRecall5 / input.baselineRecall5
    : 0;
  const loadRatio = input.baselineLoadMs > 0
    ? input.candidateLoadMs / input.baselineLoadMs
    : Number.POSITIVE_INFINITY;
  const qualityPass = recallRatio >= ARCTIC_RECALL_RATIO_THRESHOLD;
  const latencyPass = loadRatio <= ARCTIC_LOAD_TIME_RATIO_THRESHOLD;

  return {
    selectedModelId: qualityPass && latencyPass
      ? ARCTIC_LOCAL_EMBEDDING_MODEL_ID
      : DEFAULT_LOCAL_EMBEDDING_MODEL_ID,
    qualityPass,
    latencyPass,
    recallRatio,
    loadRatio,
  };
}
