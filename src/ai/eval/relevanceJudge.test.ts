import { describe, expect, it } from 'vitest';
import { judgeRelevance } from './relevanceJudge';

describe('judgeRelevance', () => {
  it('scores high for a well-aligned, complete, concise answer', () => {
    const result = judgeRelevance({
      question: 'What are the phonemes of this language?',
      answer: 'The language has 24 phonemes: 5 vowels (a, e, i, o, u) and 19 consonants including p, t, k, m, n, ng.',
    });
    expect(result.overallScore).toBeGreaterThanOrEqual(4);
    expect(result.dimensions.topicAlignment.score).toBeGreaterThanOrEqual(4);
    expect(result.dimensions.completeness.score).toBeGreaterThanOrEqual(4);
    expect(result.dimensions.conciseness.score).toBeGreaterThanOrEqual(3);
  });

  it('scores low for an empty answer', () => {
    const result = judgeRelevance({
      question: 'What are the phonemes?',
      answer: '',
    });
    expect(result.overallScore).toBe(1);
    expect(result.dimensions.topicAlignment.score).toBe(1);
    expect(result.dimensions.completeness.score).toBe(1);
    expect(result.dimensions.conciseness.score).toBe(1);
  });

  it('scores low for a completely off-topic answer', () => {
    const result = judgeRelevance({
      question: 'What are the phonemes of this language?',
      answer: 'The weather today is sunny and warm. I went for a walk in the park.',
    });
    expect(result.overallScore).toBeLessThanOrEqual(4);
    expect(result.dimensions.topicAlignment.score).toBeLessThanOrEqual(2);
  });

  it('scores low for an overly redundant answer', () => {
    const result = judgeRelevance({
      question: 'What are the phonemes?',
      answer: 'The phonemes are a e i o u. The phonemes are a e i o u. The phonemes are a e i o u. The phonemes are a e i o u.',
    });
    expect(result.dimensions.conciseness.score).toBeLessThanOrEqual(3);
  });

  it('scores moderate for a short but relevant answer', () => {
    const result = judgeRelevance({
      question: 'Explain the morphological alignment of this language in detail.',
      answer: 'The morphological alignment is ergative-absolutive.',
    });
    expect(result.dimensions.completeness.score).toBeLessThanOrEqual(4);
    expect(result.dimensions.topicAlignment.score).toBeGreaterThanOrEqual(3);
  });

  it('returns structured reasoning', () => {
    const result = judgeRelevance({
      question: 'What are the phonemes?',
      answer: 'a e i o u.',
    });
    expect(result.reasoning).toContain('topicAlignment=');
    expect(result.reasoning).toContain('completeness=');
    expect(result.reasoning).toContain('conciseness=');
  });

  it('handles Chinese questions and answers', () => {
    const result = judgeRelevance({
      question: '这种语言的音系有哪些特点？',
      answer: '这种语言有五个元音和十九个辅音，声调系统包含四个声调。',
    });
    expect(result.overallScore).toBeGreaterThanOrEqual(4);
    expect(result.dimensions.topicAlignment.score).toBeGreaterThanOrEqual(4);
  });

  it('penalizes answers with excessive filler words', () => {
    const result = judgeRelevance({
      question: 'What are the phonemes?',
      answer: 'Basically, basically, basically, the phonemes are a e i o u. In fact, in fact, in fact, there are five vowels.',
    });
    expect(result.dimensions.conciseness.score).toBeLessThanOrEqual(3);
  });

  it('overallScore is rounded average of three dimensions', () => {
    const result = judgeRelevance({
      question: 'What are the phonemes?',
      answer: 'The phonemes are a e i o u and p t k m n.',
    });
    const expected = Math.round(
      (result.dimensions.topicAlignment.score +
        result.dimensions.completeness.score +
        result.dimensions.conciseness.score) / 3,
    );
    expect(result.overallScore).toBe(expected);
  });
});
