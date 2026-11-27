import { describe, expect, it } from 'vitest';
import { noteBodyText, sharedSelfCertainty } from './desktopTranscriptionMetadata';

describe('desktopTranscriptionMetadata', () => {
  it('shares a single certainty and marks mixed values', () => {
    expect(sharedSelfCertainty([])).toEqual({ kind: 'empty' });
    expect(sharedSelfCertainty(['certain', 'certain'])).toEqual({
      kind: 'value',
      value: 'certain',
    });
    expect(sharedSelfCertainty([null, null])).toEqual({ kind: 'value', value: null });
    expect(sharedSelfCertainty(['certain', 'uncertain'])).toEqual({ kind: 'mixed' });
  });

  it('picks a readable note body', () => {
    expect(noteBodyText({ default: '  a  ' })).toBe('a');
    expect(noteBodyText({ zh: '中文' })).toBe('中文');
    expect(noteBodyText({})).toBe('');
  });
});
