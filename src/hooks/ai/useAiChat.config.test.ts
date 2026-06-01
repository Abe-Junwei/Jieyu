import { describe, expect, it } from 'vitest';
import { estimateTokensFromText } from './useAiChat.config';

describe('useAiChat.config token estimation', () => {
  it('keeps Latin text close to the historical chars-per-token estimate', () => {
    expect(estimateTokensFromText('abcdefghijklmnop')).toBe(4);
    expect(estimateTokensFromText('hello world')).toBe(3);
  });

  it('uses a conservative per-character estimate for CJK-heavy input', () => {
    expect(estimateTokensFromText('请帮我检查这个语段的标注质量')).toBe(14);
  });

  it('combines CJK characters with Latin runs without undercounting mixed prompts', () => {
    expect(estimateTokensFromText('把 layer_units export 检查一下')).toBe(10);
  });
});
