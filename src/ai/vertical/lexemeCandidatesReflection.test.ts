// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { runLexemeCandidatesReflection, buildLexemeCandidatesReflectionRetryPrompt } from './lexemeCandidatesReflection';

function makePacket(overrides: Partial<Parameters<typeof runLexemeCandidatesReflection>[1][number]> = {}) {
  return {
    schemaVersion: 0 as const,
    id: 'ep-001',
    sourceType: 'segment' as const,
    sourceId: 'seg-001',
    quote: 'sample quote',
    confidence: 0.8,
    ...overrides,
  };
}

describe('runLexemeCandidatesReflection', () => {
  it('passes all checks when content and evidence are consistent', () => {
    const result = runLexemeCandidatesReflection('Candidate [1]: lexeme "hello", pos: interj.', [makePacket()]);
    expect(result.reflectionFlagged).toBe(false);
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });

  it('flags when citation markers exceed evidence packets', () => {
    const result = runLexemeCandidatesReflection('A [1] B [2] C [3].', [makePacket()]);
    expect(result.reflectionFlagged).toBe(true);
    const check = result.checks.find((c) => c.name === 'citation_count_match');
    expect(check?.passed).toBe(false);
  });

  it('flags missing candidate structure', () => {
    const longText = 'This is just a plain sentence describing nothing at all. ' +
      'It goes on and on without any useful word entries or structured vocabulary output. ' +
      'The content is intentionally verbose to exceed the short-content threshold.';
    const result = runLexemeCandidatesReflection(longText, [makePacket()]);
    expect(result.reflectionFlagged).toBe(true);
    const check = result.checks.find((c) => c.name === 'candidates_structure_present');
    expect(check?.passed).toBe(false);
  });

  it('passes candidate structure check for short content', () => {
    const result = runLexemeCandidatesReflection('Short.', [makePacket()]);
    const check = result.checks.find((c) => c.name === 'candidates_structure_present');
    expect(check?.passed).toBe(true);
  });

  it('flags low confidence evidence', () => {
    const result = runLexemeCandidatesReflection('Candidate [1]: lexeme "test".', [makePacket({ confidence: 0.3 })]);
    expect(result.reflectionFlagged).toBe(true);
    const check = result.checks.find((c) => c.name === 'confidence_not_abnormally_low');
    expect(check?.passed).toBe(false);
  });

  it('flags confidence out of bounds', () => {
    const result = runLexemeCandidatesReflection('Candidate [1]: lexeme "test".', [makePacket({ confidence: -0.1 })]);
    expect(result.reflectionFlagged).toBe(true);
    const check = result.checks.find((c) => c.name === 'confidence_in_bounds');
    expect(check?.passed).toBe(false);
  });

  it('flags empty quote', () => {
    const result = runLexemeCandidatesReflection('Candidate [1]: lexeme "test".', [makePacket({ quote: '' })]);
    expect(result.reflectionFlagged).toBe(true);
    const check = result.checks.find((c) => c.name === 'quote_nonempty');
    expect(check?.passed).toBe(false);
  });

  it('passes quote check when no evidence', () => {
    const result = runLexemeCandidatesReflection('Candidate [1]: lexeme "test".', []);
    const check = result.checks.find((c) => c.name === 'quote_nonempty');
    expect(check?.passed).toBe(true);
  });

  it('retry prompt covers all failure modes', () => {
    const result = runLexemeCandidatesReflection('A [1] B [2].', [
      makePacket({ confidence: 1.5, quote: '' }),
    ]);
    const prompt = buildLexemeCandidatesReflectionRetryPrompt(result);
    expect(prompt).toContain('Confidence values must be within');
    expect(prompt).toContain('non-empty quote');
  });
});

describe('buildLexemeCandidatesReflectionRetryPrompt', () => {
  it('returns empty string when no failures', () => {
    const result = runLexemeCandidatesReflection('Candidate [1]: lexeme "hello".', [makePacket()]);
    expect(buildLexemeCandidatesReflectionRetryPrompt(result)).toBe('');
  });

  it('returns guidance for failed checks', () => {
    const result = runLexemeCandidatesReflection('A [1] B [2].', [makePacket()]);
    const prompt = buildLexemeCandidatesReflectionRetryPrompt(result);
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain('correct');
  });
});
