import { describe, expect, it } from 'vitest';

import type { AlignmentInterval } from '../../types/alignmentTask';
import {
  alignWordIntervalsLcs,
  computeBoundaryF1,
  evaluateTimestampSample,
  runTimestampEvalReport,
} from './timestampEvalUtils';

function word(text: string, startTime: number, endTime: number): AlignmentInterval {
  return { text, startTime, endTime };
}

describe('timestampEvalUtils', () => {
  it('aligns repeated words by LCS order', () => {
    const aligned = alignWordIntervalsLcs(
      [word('a', 0, 0.2), word('b', 0.2, 0.4), word('a', 0.4, 0.6)],
      [word('a', 0, 0.2), word('x', 0.2, 0.4), word('a', 0.4, 0.6)],
    );

    expect(aligned).toHaveLength(2);
    expect(aligned[0]?.referenceIndex).toBe(0);
    expect(aligned[0]?.hypothesisIndex).toBe(0);
    expect(aligned[1]?.referenceIndex).toBe(2);
    expect(aligned[1]?.hypothesisIndex).toBe(2);
  });

  it('returns zero MAE and perfect F1 for exact word boundaries', () => {
    const sample = evaluateTimestampSample({
      referenceWords: [word('hello', 0, 0.5), word('world', 0.5, 1.0)],
      hypothesisWords: [word('hello', 0, 0.5), word('world', 0.5, 1.0)],
      tag: 'en',
    });

    expect(sample.textWer).toBe(0);
    expect(sample.startMaeMs).toBe(0);
    expect(sample.endMaeMs).toBe(0);
    expect(sample.boundaryMaeMs).toBe(0);
    expect(sample.boundaryF1At25Ms).toBe(1);
    expect(sample.boundaryF1At50Ms).toBe(1);
  });

  it('distinguishes F1@25ms and F1@50ms for moderate boundary drift', () => {
    const reference = [word('hello', 0, 0.5), word('world', 0.5, 1.0)];
    const hypothesis = [word('hello', 0.04, 0.54), word('world', 0.54, 1.04)];

    expect(computeBoundaryF1(reference, hypothesis, 25)).toBe(0);
    expect(computeBoundaryF1(reference, hypothesis, 50)).toBe(1);
  });

  it('does not award boundary F1 when lexical alignment is completely wrong', () => {
    const reference = [word('hello', 0, 0.5), word('world', 0.5, 1.0)];
    const hypothesis = [word('foo', 0, 0.5), word('bar', 0.5, 1.0)];

    expect(computeBoundaryF1(reference, hypothesis, 50)).toBe(0);
  });

  it('keeps timestamp MAE on matched words while text errors surface in WER', () => {
    const sample = evaluateTimestampSample({
      referenceWords: [word('hello', 0, 0.4), word('world', 0.4, 0.8)],
      hypothesisWords: [word('hello', 0.01, 0.41)],
    });

    expect(sample.matchedWordCount).toBe(1);
    expect(sample.textWer).toBeGreaterThan(0);
    expect(sample.startMaeMs).toBeCloseTo(10);
    expect(sample.endMaeMs).toBeCloseTo(10);
    expect(sample.boundaryF1At50Ms).toBeLessThan(1);
  });

  it('aggregates sample and language coverage in batch reports', () => {
    const report = runTimestampEvalReport([
      {
        referenceWords: [word('hello', 0, 0.5)],
        hypothesisWords: [word('hello', 0.01, 0.51)],
        tag: 'en',
      },
      {
        referenceWords: [word('你好', 0, 0.5)],
        hypothesisWords: [],
        tag: 'zh',
      },
    ]);

    expect(report.sampleCount).toBe(2);
    expect(report.sampleCoverageRate).toBe(0.5);
    expect(report.languageCoverageRate).toBe(0.5);
    expect(report.perTagCoverageRate.en).toBe(1);
    expect(report.perTagCoverageRate.zh).toBe(0);
    expect(report.meanBoundaryMaeMs).toBeCloseTo(10);
  });
});