import { describe, expect, it } from 'vitest';
import {
  transcriptionLaneRowDraftAutoSaveKey,
  timelinePairedReadingSourceDraftAutoSaveKey,
  timelinePairedReadingTargetMergedDraftAutoSaveKey,
  timelinePairedReadingTargetSegmentDraftAutoSaveKey,
  timelineSegmentDraftAutoSaveKey,
  timelineTranslationHostDraftAutoSaveKey,
  timelineTranslationTextRowAutoSaveKey,
  timelineUnitLayerDraftAutoSaveKey,
} from './timelineDraftAutoSaveKeys';

describe('timelineDraftAutoSaveKeys', () => {
  it('builds stable segment / unit / translation-row keys', () => {
    expect(timelineSegmentDraftAutoSaveKey('L1', 'U1')).toBe('seg-L1-U1');
    expect(timelineUnitLayerDraftAutoSaveKey('L1', 'U1')).toBe('utt-L1-U1');
    expect(timelineTranslationTextRowAutoSaveKey('L1', 'U1')).toBe('tr-L1-U1');
  });

  it('builds paired-reading vertical keys', () => {
    expect(timelinePairedReadingSourceDraftAutoSaveKey('S1', 'U1')).toBe('pr-src-S1-U1');
    expect(timelinePairedReadingTargetSegmentDraftAutoSaveKey('T1', 'G1', 'I1')).toBe('pr-seg-T1-G1-I1');
    expect(timelinePairedReadingTargetMergedDraftAutoSaveKey('T1', 'G1')).toBe('pr-T1-G1');
  });

  it('routes lane row keys by unit kind', () => {
    expect(transcriptionLaneRowDraftAutoSaveKey('segment', 'L', 'U')).toBe('seg-L-U');
    expect(transcriptionLaneRowDraftAutoSaveKey('unit', 'L', 'U')).toBe('utt-L-U');
  });

  it('routes translation-host draft keys by usesOwnSegments', () => {
    expect(timelineTranslationHostDraftAutoSaveKey(true, 'L1', 'U1')).toBe('seg-L1-U1');
    expect(timelineTranslationHostDraftAutoSaveKey(false, 'L1', 'U1')).toBe('tr-L1-U1');
  });
});
