// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { runSegmentQaReflection, buildReflectionRetryPrompt } from './segmentQaReflection';

function makePacket(overrides: Partial<Parameters<typeof runSegmentQaReflection>[1][number]> = {}) {
  return {
    schemaVersion: 0 as const,
    id: 'ep-001',
    sourceType: 'segment' as const,
    sourceId: 'seg-001',
    quote: 'hello world',
    confidence: 0.8,
    ...overrides,
  };
}

describe('segmentQaReflection', () => {
  it('passes all checks when content and evidence are consistent', () => {
    const result = runSegmentQaReflection('This is correct [1].', [makePacket()]);
    expect(result.reflectionFlagged).toBe(false);
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });

  it('flags when citation markers exceed evidence packets', () => {
    const result = runSegmentQaReflection('A [1] B [2] C [3].', [makePacket()]);
    expect(result.reflectionFlagged).toBe(true);
    const check = result.checks.find((c) => c.name === 'citation_count_match');
    expect(check?.passed).toBe(false);
  });

  it('passes when citation markers are within evidence packet count', () => {
    const result = runSegmentQaReflection('A [1].', [makePacket(), makePacket({ id: 'ep-002', sourceId: 'seg-002' })]);
    expect(result.reflectionFlagged).toBe(false);
  });

  it('passes when no citations and no evidence (degraded case)', () => {
    const result = runSegmentQaReflection('No evidence available.', []);
    expect(result.reflectionFlagged).toBe(false);
  });

  it('flags when sourceId is empty', () => {
    const result = runSegmentQaReflection('Text [1].', [makePacket({ sourceId: '' })]);
    expect(result.reflectionFlagged).toBe(true);
    const check = result.checks.find((c) => c.name === 'source_id_nonempty');
    expect(check?.passed).toBe(false);
  });

  it('flags when confidence is out of bounds', () => {
    const result = runSegmentQaReflection('Text [1].', [makePacket({ confidence: 1.2 })]);
    expect(result.reflectionFlagged).toBe(true);
    const check = result.checks.find((c) => c.name === 'confidence_in_bounds');
    expect(check?.passed).toBe(false);
  });

  it('flags when confidence is abnormally low', () => {
    const result = runSegmentQaReflection('Text [1].', [makePacket({ confidence: 0.3 })]);
    expect(result.reflectionFlagged).toBe(true);
    const check = result.checks.find((c) => c.name === 'confidence_not_abnormally_low');
    expect(check?.passed).toBe(false);
  });

  it('passes low-confidence check when no evidence exists', () => {
    const result = runSegmentQaReflection('No evidence.', []);
    const check = result.checks.find((c) => c.name === 'confidence_not_abnormally_low');
    expect(check?.passed).toBe(true);
  });

  it('flags when quote is empty', () => {
    const result = runSegmentQaReflection('Text [1].', [makePacket({ quote: '' })]);
    expect(result.reflectionFlagged).toBe(true);
    const check = result.checks.find((c) => c.name === 'quote_nonempty');
    expect(check?.passed).toBe(false);
  });

  it('passes quote check when no evidence exists', () => {
    const result = runSegmentQaReflection('No evidence.', []);
    const check = result.checks.find((c) => c.name === 'quote_nonempty');
    expect(check?.passed).toBe(true);
  });

  it('produces a summary string', () => {
    const passed = runSegmentQaReflection('OK [1].', [makePacket()]);
    expect(passed.summary).toContain('all reflection checks passed');

    const failed = runSegmentQaReflection('Bad [1] [2].', [makePacket()]);
    expect(failed.summary).toContain('reflection flagged');
  });

  it('flags citation index out of range when evidence exists', () => {
    const result = runSegmentQaReflection('See [9] for details.', [
      makePacket({ id: 'a' }),
      makePacket({ id: 'b', sourceId: 'seg-002' }),
    ]);
    expect(result.reflectionFlagged).toBe(true);
    const check = result.checks.find((c) => c.name === 'citation_index_within_evidence');
    expect(check?.passed).toBe(false);
  });
});

describe('buildReflectionRetryPrompt', () => {
  it('returns empty string when reflection passes', () => {
    const result = runSegmentQaReflection('OK [1].', [makePacket()]);
    expect(buildReflectionRetryPrompt(result)).toBe('');
  });

  it('includes citation_count_match guidance', () => {
    const result = runSegmentQaReflection('A [1] B [2] C [3].', [makePacket()]);
    const prompt = buildReflectionRetryPrompt(result);
    expect(prompt).toContain('citation marker');
    expect(prompt).toContain('evidence packet');
  });

  it('includes source_id_nonempty guidance', () => {
    const result = runSegmentQaReflection('Text [1].', [makePacket({ sourceId: '' })]);
    const prompt = buildReflectionRetryPrompt(result);
    expect(prompt).toContain('non-empty sourceId');
  });

  it('includes confidence_in_bounds guidance', () => {
    const result = runSegmentQaReflection('Text [1].', [makePacket({ confidence: 1.2 })]);
    const prompt = buildReflectionRetryPrompt(result);
    expect(prompt).toContain('[0, 1]');
  });

  it('includes confidence_not_abnormally_low guidance', () => {
    const result = runSegmentQaReflection('Text [1].', [makePacket({ confidence: 0.3 })]);
    const prompt = buildReflectionRetryPrompt(result);
    expect(prompt).toContain('below 0.5');
  });

  it('includes quote_nonempty guidance', () => {
    const result = runSegmentQaReflection('Text [1].', [makePacket({ quote: '' })]);
    const prompt = buildReflectionRetryPrompt(result);
    expect(prompt).toContain('non-empty quote');
  });

  it('includes citation_index_within_evidence guidance', () => {
    const result = runSegmentQaReflection('See [9].', [makePacket(), makePacket({ id: 'ep-002', sourceId: 'seg-002' })]);
    const prompt = buildReflectionRetryPrompt(result);
    expect(prompt).toContain('indices from 1');
  });

  it('covers multiple failures', () => {
    const result = runSegmentQaReflection('A [1] B [2].', [makePacket({ sourceId: '', quote: '' })]);
    const prompt = buildReflectionRetryPrompt(result);
    expect(prompt).toContain('sourceId');
    expect(prompt).toContain('quote');
    expect(prompt).toContain('citation marker');
  });
});
