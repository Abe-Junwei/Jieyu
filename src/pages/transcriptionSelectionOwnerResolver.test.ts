import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../observability/metrics', () => ({
  createMetricTags: vi.fn((module: string, tags: Record<string, string | number | boolean>) => ({
    module,
    ...tags,
  })),
  recordMetric: vi.fn(),
}));

import { recordMetric } from '../observability/metrics';
import { resolveFallbackOwnerUnit, resolveSegmentOwnerUnit } from './transcriptionSelectionOwnerResolver';

type UnitLike = {
  id: string;
  startTime: number;
  endTime: number;
  mediaId?: string;
};

describe('transcriptionSelectionOwnerResolver', () => {
  beforeEach(() => {
    vi.mocked(recordMetric).mockClear();
  });

  it('records parent_fallback_ambiguous_total only when multiple overlapping candidates exist', () => {
    const units: UnitLike[] = [
      { id: 'utt-a', startTime: 10, endTime: 12, mediaId: 'media-1' },
      { id: 'utt-b', startTime: 10.5, endTime: 11.5, mediaId: 'media-1' },
    ];
    resolveFallbackOwnerUnit({ startTime: 10.8, endTime: 11.2, mediaId: 'media-1' }, units);
    const ambiguousCalls = vi.mocked(recordMetric).mock.calls.filter((call) => call[0]?.id === 'parent_fallback_ambiguous_total');
    expect(ambiguousCalls.length).toBe(1);

    vi.mocked(recordMetric).mockClear();
    resolveFallbackOwnerUnit({ startTime: 50, endTime: 52, mediaId: 'media-1' }, units);
    const ambiguousAfterNone = vi.mocked(recordMetric).mock.calls.filter((call) => call[0]?.id === 'parent_fallback_ambiguous_total');
    expect(ambiguousAfterNone.length).toBe(0);
    expect(vi.mocked(recordMetric).mock.calls.some((call) => call[0]?.id === 'parent_fallback_attempt_total')).toBe(true);

    vi.mocked(recordMetric).mockClear();
    resolveFallbackOwnerUnit({ startTime: 10, endTime: 12, mediaId: 'media-1' }, [
      { id: 'utt-only', startTime: 9, endTime: 13, mediaId: 'media-1' },
    ]);
    const ambiguousSingle = vi.mocked(recordMetric).mock.calls.filter((call) => call[0]?.id === 'parent_fallback_ambiguous_total');
    expect(ambiguousSingle.length).toBe(0);
  });

  it('prioritizes explicit owner id when present', () => {
    const units: UnitLike[] = [
      { id: 'utt-1', startTime: 0, endTime: 1, mediaId: 'media-1' },
      { id: 'utt-2', startTime: 1, endTime: 2, mediaId: 'media-1' },
    ];
    const segment = {
      unitId: 'utt-2',
      startTime: 0.2,
      endTime: 0.8,
      mediaId: 'media-1',
    };

    expect(resolveSegmentOwnerUnit(segment, units)?.id).toBe('utt-2');
  });

  it('chooses narrower containing unit when no explicit owner exists', () => {
    const units: UnitLike[] = [
      { id: 'utt-wide', startTime: 8, endTime: 14, mediaId: 'media-1' },
      { id: 'utt-narrow', startTime: 9, endTime: 13, mediaId: 'media-1' },
    ];

    expect(resolveFallbackOwnerUnit({ startTime: 10, endTime: 12, mediaId: 'media-1' }, units)?.id).toBe('utt-narrow');
  });

  it('uses overlap tie-break by center distance when no containing unit exists', () => {
    const units: UnitLike[] = [
      { id: 'utt-far', startTime: 9, endTime: 10.8, mediaId: 'media-1' },
      { id: 'utt-close', startTime: 11, endTime: 11.8, mediaId: 'media-1' },
    ];

    expect(resolveFallbackOwnerUnit({ startTime: 10, endTime: 12, mediaId: 'media-1' }, units)?.id).toBe('utt-close');
  });

  it('returns undefined when no candidate overlaps', () => {
    const units: UnitLike[] = [
      { id: 'utt-1', startTime: 20, endTime: 22, mediaId: 'media-1' },
    ];

    expect(resolveSegmentOwnerUnit({ startTime: 10, endTime: 12, mediaId: 'media-1' }, units)).toBeUndefined();
  });
});
