import { describe, expect, it } from 'vitest';
import {
  linkManuscriptsToAudio,
  readProjectSourceFiles,
  upsertProjectSourceFile,
} from './projectSourceFiles';

describe('projectSourceFiles', () => {
  it('keeps an imported manuscript beside the audio it names', () => {
    const views = linkManuscriptsToAudio(
      [{ id: 'media-1', name: '田野录音', filename: 'field.wav', durationSec: 75 }],
      [
        {
          id: 'src-eaf-story.eaf',
          name: 'story.eaf',
          format: 'eaf',
          linkedMediaFilename: 'field.wav',
        },
      ],
    );
    expect(views.map((row) => row.name)).toEqual(['田野录音', 'story.eaf']);
    expect(views[1]?.linkedAudioId).toBe('media-1');
  });

  it('reads and replaces a source file by id', () => {
    const stored = readProjectSourceFiles({
      sourceFiles: [{ id: 'src-eaf-a.eaf', name: 'a.eaf', format: 'eaf' }],
    });
    const next = upsertProjectSourceFile(stored, {
      id: 'src-eaf-a.eaf',
      name: '改名.eaf',
      format: 'eaf',
      mediaId: 'media-1',
    });
    expect(next).toEqual([
      { id: 'src-eaf-a.eaf', name: '改名.eaf', format: 'eaf', mediaId: 'media-1' },
    ]);
  });
});
