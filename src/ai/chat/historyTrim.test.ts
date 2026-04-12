import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../providers/LLMProvider';
import {
  buildConversationSummaryFromHistory,
  countHistoryUserTurns,
  estimateSummaryCoverageSimilarity,
  splitHistoryByRecentRounds,
  trimHistoryByChars,
} from './historyTrim';

function makeHistory(): ChatMessage[] {
  return [
    { role: 'user', content: '请先检查第一个句段并给建议' },
    { role: 'assistant', content: '已检查，建议先补时间对齐。' },
    { role: 'user', content: '再看第二个句段的翻译一致性' },
    { role: 'assistant', content: '发现术语不一致，建议统一。' },
    { role: 'user', content: '第三个句段请给出简短结论' },
    { role: 'assistant', content: '第三个句段主要问题是漏译。' },
  ];
}

describe('historyTrim P2 summary flow', () => {
  it('counts turns and splits recent rounds correctly', () => {
    const history = makeHistory();
    expect(countHistoryUserTurns(history)).toBe(3);

    const { olderMessages, recentMessages } = splitHistoryByRecentRounds(history, 2);
    expect(olderMessages).toHaveLength(2);
    expect(recentMessages).toHaveLength(4);
    expect(recentMessages[0]?.content).toContain('再看第二个句段');
  });

  it('builds compact conversation summary from older history', () => {
    const { olderMessages } = splitHistoryByRecentRounds(makeHistory(), 2);
    const summary = buildConversationSummaryFromHistory(olderMessages, 180);

    expect(summary).toContain('U:');
    expect(summary).toContain('A:');
    expect(summary.length).toBeLessThanOrEqual(180);
  });

  it('injects summary message before trimmed history', () => {
    const history = makeHistory();
    const summary = '用户持续关注句段质量、翻译一致性与漏译问题。';
    const trimmed = trimHistoryByChars(history, 220, 2, summary);

    expect(trimmed[0]?.role).toBe('assistant');
    expect(trimmed[0]?.content).toContain('Conversation summary:');
    expect(trimmed[0]?.content).toContain('翻译一致性');
    expect(trimmed.some((message) => message.content.includes('第三个句段'))).toBe(true);
  });

  it('keeps pinned turns outside summary compression', () => {
    const history = [
      { role: 'user', content: '这条是早期背景信息' },
      { role: 'assistant', content: '收到背景信息。' },
      { role: 'user', content: '这条是必须保留的关键指令', messageId: 'u-pin', pinned: true },
      { role: 'assistant', content: '关键指令已确认', messageId: 'a-pin', pinned: true },
      { role: 'user', content: '最后一轮问题' },
      { role: 'assistant', content: '最后一轮回复' },
    ] as ChatMessage[];

    const { olderMessages } = splitHistoryByRecentRounds(history, 1);
    const summary = buildConversationSummaryFromHistory(olderMessages, 160);
    expect(summary).not.toContain('必须保留');

    const trimmed = trimHistoryByChars(history, 160, 1, '已有摘要');
    expect(trimmed.some((message) => message.content.includes('关键指令'))).toBe(true);
  });

  it('estimates summary similarity score for omission checks', () => {
    const { olderMessages } = splitHistoryByRecentRounds(makeHistory(), 2);
    const highScore = estimateSummaryCoverageSimilarity(olderMessages, '检查第一个句段并建议补时间对齐，同时关注翻译一致性。');
    const lowScore = estimateSummaryCoverageSimilarity(olderMessages, '天气不错，继续加油。');

    expect(highScore).toBeGreaterThan(lowScore);
    expect(highScore).toBeGreaterThan(0.2);
  });
});
