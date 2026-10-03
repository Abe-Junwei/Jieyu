import { describe, expect, it } from 'vitest';
import {
  collectSentences,
  progressFromSentences,
  resolveMediaDurationSec,
  sumCounts,
  translatedSentenceIds,
} from './projectOverviewStats';

describe('projectOverviewStats', () => {
  it('counts an audio sentence once when a host unit and its segment both exist', () => {
    const sentences = collectSentences([
      { segmentId: 'seg-1', hostUnitId: 'unit-1', hasText: true, annotationStatus: 'glossed' },
      { segmentId: 'unit-1', hasText: true, annotationStatus: 'draft' },
      { segmentId: 'unit-2', hasText: false },
    ]);
    const progress = progressFromSentences(
      sentences,
      translatedSentenceIds([
        { unitId: 'unit-1', status: 'translated' },
        { unitId: 'unit-1', status: 'draft' },
      ]),
    );
    expect(progress.sentenceCount).toBe(2);
    expect(progress.transcribedCount).toBe(1);
    expect(progress.translatedCount).toBe(1);
    expect(progress.annotatedCount).toBe(1);
    expect(progress.transcriptionRate).toBe(0.5);
    expect(progress.translationRate).toBe(0.5);
    expect(progress.annotationRate).toBe(1);
  });

  it('reads a translation-layer unit through its parent sentence, including non-empty draft text', () => {
    const sentences = collectSentences([
      { segmentId: 'seg-1', hostUnitId: 'utt-1', hasText: true },
      { segmentId: 'seg-2', hostUnitId: 'utt-2', hasText: true },
    ]);
    const progress = progressFromSentences(
      sentences,
      translatedSentenceIds([
        { unitId: 'trl-1', parentUnitId: 'utt-1', status: 'draft', hasText: true },
        { unitId: 'trl-2', parentUnitId: 'utt-2', status: 'draft', hasText: false },
      ]),
    );
    expect(progress.translatedCount).toBe(1);
    expect(progress.translationRate).toBe(0.5);
  });

  it('keeps second-based audio duration and scales millisecond values', () => {
    expect(resolveMediaDurationSec({ duration: 136, maxUnitEndSec: 130 })).toBe(136);
    expect(resolveMediaDurationSec({ duration: 136000, maxUnitEndSec: 136 })).toBe(136);
    expect(resolveMediaDurationSec({ duration: 0, maxUnitEndSec: 123 })).toBe(123);
  });

  it('adds media totals without counting a linked manuscript again', () => {
    const audio = progressFromSentences(
      [{ id: 'unit-1', ids: ['unit-1'], hasText: true, annotated: false }],
      new Set(['unit-1']),
    );
    const total = sumCounts([audio]);
    expect(total.sentenceCount).toBe(1);
    expect(total.translatedCount).toBe(1);
  });
});
