import { describe, expect, it } from 'vitest';
import {
  analyzeSearchPattern,
  buildReplacePlan,
  findSearchMatches,
  replaceAllInItems,
} from '../src/utils/searchReplaceUtils';

const items = [
  { utteranceId: 'u1', text: 'Hello world' },
  { utteranceId: 'u2', text: 'hello WORLD hello' },
];

describe('searchReplaceUtils', () => {
  it('finds case-insensitive matches by default', () => {
    const matches = findSearchMatches(items, 'hello', {
      caseSensitive: false,
      wholeWord: false,
      regexMode: false,
    });
    expect(matches.length).toBe(3);
  });

  it('supports whole-word + case-sensitive mode', () => {
    const matches = findSearchMatches(items, 'Hello', {
      caseSensitive: true,
      wholeWord: true,
      regexMode: false,
    });
    expect(matches.length).toBe(1);
    expect(matches[0]?.utteranceId).toBe('u1');
  });

  it('supports regex mode and invalid regex fallback', () => {
    const regexMatches = findSearchMatches(items, 'h.llo', {
      caseSensitive: false,
      wholeWord: false,
      regexMode: true,
    });
    const badRegexMatches = findSearchMatches(items, '[', {
      caseSensitive: false,
      wholeWord: false,
      regexMode: true,
    });
    expect(regexMatches.length).toBeGreaterThan(0);
    expect(badRegexMatches.length).toBe(0);
  });

  it('replaces all with selected options', () => {
    const updates = replaceAllInItems(items, 'hello', 'hi', {
      caseSensitive: false,
      wholeWord: true,
      regexMode: false,
    });
    expect(updates).toHaveLength(2);
    expect(updates[0]?.newText).toContain('hi');
  });

  it('flags high-risk regex safely', () => {
    const analysis = analyzeSearchPattern('(a+)+', {
      caseSensitive: false,
      wholeWord: false,
      regexMode: true,
    });
    expect(analysis.pattern).toBeNull();
    expect(analysis.warning).toBeTruthy();
  });

  it('builds replace plan for preview', () => {
    const plan = buildReplacePlan(items, 'hello', 'hi', {
      caseSensitive: false,
      wholeWord: true,
      regexMode: false,
    });
    expect(plan.length).toBe(2);
    expect(plan[0]?.oldText).toContain('Hello');
    expect(plan[0]?.newText).toContain('hi');
  });
});
