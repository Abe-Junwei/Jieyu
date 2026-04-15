import { describe, expect, it } from 'vitest';
import { resolveNextUtteranceIdForDictation } from './voiceDictationFlow';

describe('voiceDictationFlow', () => {
  it('returns next utterance id when current id exists', () => {
    const result = resolveNextUtteranceIdForDictation({
      utteranceIdsOnCurrentMedia: ['utt-1', 'utt-2', 'utt-3'],
      activeUnitId: 'utt-1',
    });

    expect(result).toBe('utt-2');
  });

  it('returns null when current id is the last utterance', () => {
    const result = resolveNextUtteranceIdForDictation({
      utteranceIdsOnCurrentMedia: ['utt-1', 'utt-2'],
      activeUnitId: 'utt-2',
    });

    expect(result).toBeNull();
  });

  it('returns null when current id is missing from current media list', () => {
    const result = resolveNextUtteranceIdForDictation({
      utteranceIdsOnCurrentMedia: ['utt-1', 'utt-2'],
      activeUnitId: 'utt-x',
    });

    expect(result).toBeNull();
  });

  it('returns null when active utterance id is blank', () => {
    const result = resolveNextUtteranceIdForDictation({
      utteranceIdsOnCurrentMedia: ['utt-1', 'utt-2'],
      activeUnitId: '   ',
    });

    expect(result).toBeNull();
  });
});