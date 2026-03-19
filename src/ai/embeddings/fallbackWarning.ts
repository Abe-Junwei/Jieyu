import type { EmbeddingRuntimeProgress } from './EmbeddingRuntime';

const FALLBACK_PREFIX = 'fallback:';

export function readFallbackReason(progress: EmbeddingRuntimeProgress | undefined): string | null {
  // Check explicit flag first (new path), then fall back to message prefix parsing (legacy)
  if (progress?.usingFallback) {
    const message = progress?.message ?? '';
    const prefixIdx = message.indexOf(FALLBACK_PREFIX);
    const reason = prefixIdx >= 0
      ? message.slice(prefixIdx + FALLBACK_PREFIX.length).trim()
      : null;
    return reason ?? 'model unavailable';
  }
  const message = progress?.message;
  if (!message?.startsWith(FALLBACK_PREFIX)) return null;
  const reason = message.slice(FALLBACK_PREFIX.length).trim();
  return reason.length > 0 ? reason : null;
}

export function buildEmbeddingFallbackWarning(locale: string, reason: string | null): string {
  if (locale === 'zh-CN') {
    return `当前使用降级 embedding（${reason || '模型不可用'}）。检索质量可能下降。`;
  }
  return `Running fallback embedding (${reason || 'model unavailable'}). Retrieval quality may degrade.`;
}
