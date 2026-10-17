import { describe, expect, it } from 'vitest';
import { associateAudio, manuscriptAudioIssue } from './manuscriptAudio';

describe('manuscriptAudio', () => {
  it('rejects one manuscript whose units point at two audios', () => {
    const units = [
      { id: 'u-a', mediaId: 'audio-a' },
      { id: 'u-b', mediaId: 'audio-b' },
    ];
    expect(manuscriptAudioIssue('audio-a', units)).toEqual({
      kind: 'multiple-audios',
      audioIds: ['audio-a', 'audio-b'],
    });
  });

  it('replaces the audio instead of keeping both', () => {
    const units = [
      { id: 'u-a', mediaId: 'audio-a' },
      { id: 'u-b', mediaId: 'audio-a' },
    ];
    const next = associateAudio(units, 'audio-b');
    expect(next.audioId).toBe('audio-b');
    expect(next.units.map((unit) => unit.mediaId)).toEqual(['audio-b', 'audio-b']);
    expect(manuscriptAudioIssue(next.audioId, next.units)).toBeNull();
  });

  it('allows an audio with no units yet', () => {
    expect(manuscriptAudioIssue('audio-a', [])).toBeNull();
  });

  it('allows a manuscript with no audio', () => {
    const units = [{ id: 'u-1' }, { id: 'u-2' }];
    expect(manuscriptAudioIssue(null, units)).toBeNull();
    const detached = associateAudio([{ id: 'u-1', mediaId: 'audio-a' }], null);
    expect(detached.audioId).toBeNull();
    expect(detached.units[0]?.mediaId).toBeUndefined();
    expect(manuscriptAudioIssue(detached.audioId, detached.units)).toBeNull();
  });
});
