import { describe, expect, it } from 'vitest';
import {
  deriveAdaptiveProfileFromMessages,
  mergeAdaptiveProfiles,
  updateAdaptiveInputProfile,
  updateSessionMemoryWithPrompt,
} from './adaptiveInputProfile';

describe('adaptiveInputProfile', () => {
  it('extracts dominant intent, style, and keywords from recent prompts', () => {
    const profile = updateAdaptiveInputProfile(undefined, '请先分析这条译文的风险，再分步骤告诉我怎么改');
    const next = updateAdaptiveInputProfile(profile, '继续复核翻译，并详细说明漏译和误译');

    expect(next.dominantIntent).toBe('translation');
    expect(next.preferredResponseStyle).toBe('analysis');
    expect(next.topKeywords?.join('|')).toMatch(/译文|翻译/);
    expect(next.lastPromptExcerpt).toContain('继续复核翻译');
  });

  it('updates session memory with adaptive input profile', () => {
    const memory = updateSessionMemoryWithPrompt({}, '请总结当前句段的 gloss 风险并给出下一步');

    expect(memory.adaptiveInputProfile?.dominantIntent).toBe('gloss');
    expect(memory.adaptiveInputProfile?.recentPrompts?.length).toBe(1);
    expect(memory.preferences?.adaptiveInputProfile?.dominantIntent).toBe('gloss');
  });

  it('derives profile from user messages and merges with persisted profile', () => {
    const fromMessages = deriveAdaptiveProfileFromMessages([
      { id: 'a', role: 'assistant', content: 'ok' },
      { id: 'u2', role: 'user', content: '请比较这两条译文差异' },
      { id: 'u1', role: 'user', content: '帮我比较相近句段的翻译' },
    ]);
    const merged = mergeAdaptiveProfiles(fromMessages, {
      recentPrompts: ['请详细解释一下这个词法问题'],
      dominantIntent: 'explain',
      preferredResponseStyle: 'detailed',
      topKeywords: ['词法'],
      lastPromptExcerpt: '请详细解释一下这个词法问题',
    });

    expect(fromMessages.dominantIntent).toBe('compare');
    expect(merged?.recentPrompts?.length).toBeGreaterThan(1);
    expect(merged?.topKeywords?.length).toBeGreaterThan(0);
  });
});
