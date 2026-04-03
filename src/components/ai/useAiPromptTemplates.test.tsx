// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAiPromptTemplates } from './useAiPromptTemplates';
import { LocaleProvider, type Locale } from '../../i18n';

function withLocale(locale: Locale) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <LocaleProvider locale={locale}>{children}</LocaleProvider>;
  };
}

describe('useAiPromptTemplates', () => {
  it('exposes built-in RAG quick templates for qa/review/terminology/balanced', () => {
    const { result } = renderHook(() => useAiPromptTemplates({
      promptVars: {},
      onInjectRenderedPrompt: vi.fn(),
    }), { wrapper: withLocale('zh-CN') });

    const titles = result.current.quickPromptTemplates.map((item) => item.title);
    expect(titles).toContain('RAG 问答模板');
    expect(titles).toContain('RAG 审校模板');
    expect(titles).toContain('RAG 术语查证模板');
    expect(titles).toContain('RAG 平衡模板');

    const contents = result.current.quickPromptTemplates.map((item) => item.content).join('\n');
    expect(contents).toContain('[RAG_SCENARIO:qa]');
    expect(contents).toContain('[RAG_SCENARIO:review]');
    expect(contents).toContain('[RAG_SCENARIO:terminology]');
    expect(contents).toContain('[RAG_SCENARIO:balanced]');
  });

  it('reorders quick templates using adaptive input profile', () => {
    const { result } = renderHook(() => useAiPromptTemplates({
      promptVars: {},
      onInjectRenderedPrompt: vi.fn(),
      adaptiveInputProfile: {
        dominantIntent: 'translation',
        preferredResponseStyle: 'detailed',
        topKeywords: ['术语', '翻译'],
        recentPrompts: ['请检查术语翻译是否一致'],
        lastPromptExcerpt: '请检查术语翻译是否一致',
        updatedAt: '2026-04-03T00:00:00.000Z',
      },
    }), { wrapper: withLocale('zh-CN') });

    expect(result.current.quickPromptTemplates[0]?.title).toBe('RAG 术语查证模板');
  });

  it('returns english built-in quick templates under en-US locale', () => {
    const { result } = renderHook(() => useAiPromptTemplates({
      promptVars: {},
      onInjectRenderedPrompt: vi.fn(),
    }), { wrapper: withLocale('en-US') });

    const titles = result.current.quickPromptTemplates.map((item) => item.title);
    expect(titles).toContain('RAG QA Template');
    expect(titles).toContain('RAG Review Template');
    expect(titles).toContain('RAG Terminology Template');
    expect(titles).toContain('RAG Balanced Template');
  });
});
