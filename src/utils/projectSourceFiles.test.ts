import { describe, expect, it } from 'vitest';
import { linkManuscriptsToAudio, sourceFileFromRecord } from './projectSourceFiles';

describe('projectSourceFiles', () => {
  it('keeps an explicitly linked manuscript beside its audio', () => {
    const views = linkManuscriptsToAudio(
      [
        {
          id: 'media-1',
          name: '田野录音',
          filename: 'field.wav',
          durationSec: 75,
          audioFormat: 'WAV',
          sentenceCount: 12,
        },
      ],
      [
        {
          id: 'src-uuid-1',
          name: 'story.eaf',
          format: 'eaf',
          mediaId: 'media-1',
          linkedMediaFilename: 'field.wav',
        },
      ],
    );
    expect(views.map((row) => row.name)).toEqual(['田野录音', 'story.eaf']);
    expect(views[1]?.linkedAudioId).toBe('media-1');
    expect(views[0]).toMatchObject({ audioFormat: 'WAV', sentenceCount: 12 });
  });

  it('a filename named in the source is only a suggestion (rev5 4.2-4)', () => {
    const views = linkManuscriptsToAudio(
      [{ id: 'media-1', name: '田野录音', filename: 'field.wav' }],
      [{ id: 'src-uuid-1', name: 'story.eaf', format: 'eaf', linkedMediaFilename: 'field.wav' }],
    );
    const doc = views.find((row) => row.kind === 'manuscript');
    expect(doc?.linkedAudioId).toBeUndefined();
    expect(doc?.suggestedAudioId).toBe('media-1');
  });

  it('maps a source record to the file-list view by display name', () => {
    expect(
      sourceFileFromRecord({ id: 'u1', displayName: '改名.eaf', format: 'eaf', mediaId: 'm1' }),
    ).toEqual({ id: 'u1', name: '改名.eaf', format: 'eaf', mediaId: 'm1' });
  });
});
