import { describe, expect, it } from 'vitest';
import { computeSegmentReviewIssueFlags, matchesReviewPreset } from './sidePaneSegmentListViewModel';

describe('sidePaneSegmentListViewModel review issue helpers', () => {
  it('treats speaker-pending items as content-missing matches', () => {
    const flags = computeSegmentReviewIssueFlags({
      empty: false,
      certainty: 'certain',
      noteCategories: [],
      annotationStatus: 'raw',
      speakerKeys: [],
      startTime: 1,
      endTime: 2,
    }, {
      isTranscriptionLayer: true,
      allowSpeakerPending: true,
      previousEndTime: 0,
    });

    expect(flags.speakerPending).toBe(true);
    expect(matchesReviewPreset(flags, 'content_missing')).toBe(true);
  });

  it('does not keep skipped items in the unresolved review queue', () => {
    const flags = computeSegmentReviewIssueFlags({
      empty: true,
      certainty: 'uncertain',
      noteCategories: ['todo'],
      annotationStatus: 'raw',
      speakerKeys: [],
      startTime: 1,
      endTime: 2,
      skipProcessing: true,
    } as never, {
      isTranscriptionLayer: true,
      allowSpeakerPending: true,
      previousEndTime: 0,
    });

    expect(Object.values(flags).some(Boolean)).toBe(false);
  });
});
