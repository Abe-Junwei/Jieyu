import { describe, expect, it } from 'vitest';
import { buildEmbeddingFallbackWarning, readFallbackReason } from './fallbackWarning';

describe('embedding fallback warning helpers', () => {
  it('extracts fallback reason from runtime progress message', () => {
    const reason = readFallbackReason({ stage: 'ready', message: 'fallback:model unavailable' });
    expect(reason).toBe('model unavailable');
  });

  it('returns null when progress message is not fallback', () => {
    expect(readFallbackReason({ stage: 'loading', message: 'loading model' })).toBeNull();
    expect(readFallbackReason({ stage: 'ready', message: 'model ready' })).toBeNull();
  });

  it('formats localized fallback warning', () => {
    expect(buildEmbeddingFallbackWarning('zh-CN', '模型加载失败')).toContain('降级 embedding');
    expect(buildEmbeddingFallbackWarning('en-US', 'model unavailable')).toContain('fallback embedding');
  });
});
