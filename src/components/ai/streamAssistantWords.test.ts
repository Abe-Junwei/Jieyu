import { describe, expect, it } from 'vitest';
import {
  computeStreamTailSliceCut,
  sliceAssistantStreamText,
} from './streamAssistantWords';

describe('sliceAssistantStreamText', () => {
  it('returns empty array for empty string', () => {
    expect(sliceAssistantStreamText('', 'en-US')).toEqual([]);
  });

  it('covers full string length with segments', () => {
    const text = 'a b';
    const slices = sliceAssistantStreamText(text, 'en-US');
    const joined = slices.map((s) => s.segment).join('');
    expect(joined).toBe(text);
    const last = slices[slices.length - 1];
    expect(last?.end).toBe(text.length);
  });

  it('marks whitespace as non-word in latin fallback path', () => {
    const slices = sliceAssistantStreamText('x  y', 'en-US');
    const spaces = slices.filter((s) => s.segment.trim() === '' && s.segment.length > 0);
    expect(spaces.length).toBeGreaterThanOrEqual(1);
    expect(spaces.every((s) => !s.isWord)).toBe(true);
  });
});

describe('computeStreamTailSliceCut', () => {
  it('returns 0 when word count is within budget', () => {
    const slices = sliceAssistantStreamText('one two three', 'en-US');
    const wordCount = slices.filter((s) => s.isWord).length;
    expect(wordCount).toBeGreaterThan(0);
    expect(computeStreamTailSliceCut(slices, 10)).toBe(0);
  });

  it('drops head so tail has at most maxTailWords words', () => {
    const text = Array.from({ length: 100 }, (_, i) => `w${i}`).join(' ');
    const slices = sliceAssistantStreamText(text, 'en-US');
    const cut = computeStreamTailSliceCut(slices, 12);
    expect(cut).toBeGreaterThan(0);
    const tail = slices.slice(cut);
    const tailWords = tail.filter((s) => s.isWord).length;
    expect(tailWords).toBeLessThanOrEqual(12);
    const head = slices.slice(0, cut);
    const headWords = head.filter((s) => s.isWord).length;
    expect(headWords + tailWords).toBe(100);
  });
});
