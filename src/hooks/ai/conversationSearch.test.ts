import { describe, expect, it } from 'vitest';
import {
  conversationTitleMatchesQuery,
  filterConversationsBySearch,
  messageBodiesMatchQuery,
} from './conversationSearch';

describe('conversationSearch', () => {
  it('matches title and recent message bodies', () => {
    expect(conversationTitleMatchesQuery('语段校对', '校对')).toBe(true);
    expect(messageBodiesMatchQuery(['总结风险点'], '风险')).toBe(true);
    const filtered = filterConversationsBySearch(
      [
        { id: 'a', title: '默认会话', updatedAt: '2026-01-01' },
        { id: 'b', title: 'Other', updatedAt: '2026-01-02' },
      ],
      '风险',
      new Map([['a', ['段落风险分析']]]),
    );
    expect(filtered.map((item) => item.id)).toEqual(['a']);
  });
});
