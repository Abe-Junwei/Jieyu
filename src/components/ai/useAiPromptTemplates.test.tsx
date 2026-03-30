// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAiPromptTemplates } from './useAiPromptTemplates';

describe('useAiPromptTemplates', () => {
  it('exposes built-in RAG quick templates for qa/review/terminology', () => {
    const { result } = renderHook(() => useAiPromptTemplates({
      promptVars: {},
      onInjectRenderedPrompt: vi.fn(),
    }));

    const titles = result.current.quickPromptTemplates.map((item) => item.title);
    expect(titles).toContain('RAG 问答模板');
    expect(titles).toContain('RAG 审校模板');
    expect(titles).toContain('RAG 术语查证模板');

    const contents = result.current.quickPromptTemplates.map((item) => item.content).join('\n');
    expect(contents).toContain('[RAG_SCENARIO:qa]');
    expect(contents).toContain('[RAG_SCENARIO:review]');
    expect(contents).toContain('[RAG_SCENARIO:terminology]');
  });
});