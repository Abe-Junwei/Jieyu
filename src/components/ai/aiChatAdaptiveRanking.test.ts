import { describe, expect, it } from 'vitest';
import { rankCandidateLabelsByAdaptiveProfile, rankPromptTemplatesByAdaptiveProfile } from './aiChatAdaptiveRanking';

describe('aiChatAdaptiveRanking', () => {
  it('prioritizes translation-oriented prompt templates for translation-heavy history', () => {
    const ranked = rankPromptTemplatesByAdaptiveProfile([
      {
        id: 'qa',
        title: 'RAG 问答模板',
        content: 'question answering',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'term',
        title: 'RAG 术语查证模板',
        content: 'translation terminology review',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ], {
      dominantIntent: 'translation',
      preferredResponseStyle: 'detailed',
      topKeywords: ['术语', '翻译'],
      recentPrompts: ['请检查术语翻译是否一致'],
      lastPromptExcerpt: '请检查术语翻译是否一致',
      updatedAt: '2026-04-03T00:00:00.000Z',
    });

    expect(ranked[0]?.id).toBe('term');
  });

  it('prioritizes clarify candidates closer to recent prompt intent', () => {
    const ranked = rankCandidateLabelsByAdaptiveProfile([
      { key: 'summary', label: '先总结当前内容' },
      { key: 'review', label: '先复核当前译文差异' },
    ], {
      dominantIntent: 'compare',
      preferredResponseStyle: 'analysis',
      topKeywords: ['译文', '差异'],
      recentPrompts: ['比较两条译文差异'],
      lastPromptExcerpt: '比较两条译文差异',
      updatedAt: '2026-04-03T00:00:00.000Z',
    });

    expect(ranked[0]?.key).toBe('review');
  });
});
