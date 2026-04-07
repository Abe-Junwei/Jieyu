/**
 * 本地嵌入模型配置 | Local embedding model configuration
 *
 * 统一维护浏览器端本地 embedding 模型的默认值、候选模型与显示名称，
 * 避免 provider、service、UI 文案各自硬编码不同模型 ID。
 * Centralizes default model IDs, candidate models, and display names for
 * browser-local embeddings so provider, services, and UI do not drift.
 */

export const DEFAULT_LOCAL_EMBEDDING_MODEL_ID = 'Xenova/multilingual-e5-small';
export const ARCTIC_LOCAL_EMBEDDING_MODEL_ID = 'Snowflake/snowflake-arctic-embed-xs';
export const DEFAULT_LOCAL_EMBEDDING_DIMENSION = 384;

const KNOWN_LOCAL_EMBEDDING_MODEL_NAMES: Record<string, string> = {
  [DEFAULT_LOCAL_EMBEDDING_MODEL_ID]: 'Xenova E5 Small',
  [ARCTIC_LOCAL_EMBEDDING_MODEL_ID]: 'Snowflake Arctic-Embed-XS',
};

export function getLocalEmbeddingModelDisplayName(modelId: string): string {
  return KNOWN_LOCAL_EMBEDDING_MODEL_NAMES[modelId] ?? modelId;
}
