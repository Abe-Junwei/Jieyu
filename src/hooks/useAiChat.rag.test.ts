import { describe, expect, it } from 'vitest';
import { resolveRagFusionScenarioInput } from './useAiChat.rag';

describe('useAiChat.rag scenario resolver', () => {
  it('defaults to qa scenario for regular user text', () => {
    const result = resolveRagFusionScenarioInput('请解释这句话的含义');

    expect(result.scenario).toBe('qa');
    expect(result.queryText).toBe('请解释这句话的含义');
  });

  it('resolves review scenario from template heading', () => {
    const result = resolveRagFusionScenarioInput('【审校模板】请帮我检查这段转写的一致性');

    expect(result.scenario).toBe('review');
    expect(result.queryText).toBe('请帮我检查这段转写的一致性');
  });

  it('resolves terminology scenario from explicit token', () => {
    const result = resolveRagFusionScenarioInput('[RAG_SCENARIO:terminology] 这个术语在语料中如何使用？');

    expect(result.scenario).toBe('terminology');
    expect(result.queryText).toBe('这个术语在语料中如何使用？');
  });
});