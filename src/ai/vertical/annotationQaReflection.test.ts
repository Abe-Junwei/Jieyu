// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { runAnnotationQaReflection, buildAnnotationQaReflectionRetryPrompt } from './annotationQaReflection';

function makePacket(overrides: Partial<Parameters<typeof runAnnotationQaReflection>[1][number]> = {}) {
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

describe('runAnnotationQaReflection', () => {
  it('passes all checks when content and evidence are consistent', () => {
    const result = runAnnotationQaReflection('Finding [1]: inconsistent annotation.', [makePacket()]);
    expect(result.reflectionFlagged).toBe(false);
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });

  it('flags when citation markers exceed evidence packets', () => {
    const result = runAnnotationQaReflection('A [1] B [2] C [3].', [makePacket()]);
    expect(result.reflectionFlagged).toBe(true);
    const check = result.checks.find((c) => c.name === 'citation_count_match');
    expect(check?.passed).toBe(false);
  });

  it('flags missing findings structure', () => {
    const longText = 'This is just a normal sentence describing nothing. ' +
      'It continues without any clear observations or points being raised. ' +
      'The content is intentionally verbose to exceed the short-content threshold.';
    const result = runAnnotationQaReflection(longText, [makePacket()]);
    expect(result.reflectionFlagged).toBe(true);
    const check = result.checks.find((c) => c.name === 'findings_structure_present');
    expect(check?.passed).toBe(false);
  });

  it('passes findings structure check for short content', () => {
    const result = runAnnotationQaReflection('Short.', [makePacket()]);
    const check = result.checks.find((c) => c.name === 'findings_structure_present');
    expect(check?.passed).toBe(true);
  });

  it('flags low confidence evidence', () => {
    const result = runAnnotationQaReflection('Finding [1]: issue.', [makePacket({ confidence: 0.3 })]);
    expect(result.reflectionFlagged).toBe(true);
    const check = result.checks.find((c) => c.name === 'confidence_not_abnormally_low');
    expect(check?.passed).toBe(false);
  });

  it('flags confidence out of bounds', () => {
    const result = runAnnotationQaReflection('Finding [1]: issue.', [makePacket({ confidence: 1.2 })]);
    expect(result.reflectionFlagged).toBe(true);
    const check = result.checks.find((c) => c.name === 'confidence_in_bounds');
    expect(check?.passed).toBe(false);
  });

  it('flags empty quote', () => {
    const result = runAnnotationQaReflection('Finding [1]: issue.', [makePacket({ quote: '' })]);
    expect(result.reflectionFlagged).toBe(true);
    const check = result.checks.find((c) => c.name === 'quote_nonempty');
    expect(check?.passed).toBe(false);
  });

  it('passes quote check when no evidence', () => {
    const result = runAnnotationQaReflection('Finding [1]: issue.', []);
    const check = result.checks.find((c) => c.name === 'quote_nonempty');
    expect(check?.passed).toBe(true);
  });

  it('retry prompt covers all failure modes', () => {
    const result = runAnnotationQaReflection('A [1] B [2].', [
      makePacket({ confidence: 1.5, quote: '' }),
    ]);
    const prompt = buildAnnotationQaReflectionRetryPrompt(result);
    expect(prompt).toContain('Confidence values must be within');
    expect(prompt).toContain('non-empty quote');
  });
});

describe('buildAnnotationQaReflectionRetryPrompt', () => {
  it('returns empty string when no failures', () => {
    const result = runAnnotationQaReflection('Finding [1]: issue.', [makePacket()]);
    expect(buildAnnotationQaReflectionRetryPrompt(result)).toBe('');
  });

  it('returns guidance for failed checks', () => {
    const result = runAnnotationQaReflection('A [1] B [2].', [makePacket()]);
    const prompt = buildAnnotationQaReflectionRetryPrompt(result);
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain('correct');
  });
});
