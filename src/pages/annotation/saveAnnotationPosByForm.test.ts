import { describe, expect, it } from 'vitest';
import type { AnnotationIgtRow } from './annotationIgtRows';
import {
  collectPosByFormWrites,
  posLabelInGraph,
  saveAnnotationPosByForm,
} from './saveAnnotationPosByForm';

function row(id: string, tokens: AnnotationIgtRow['tokens']): AnnotationIgtRow {
  return {
    id,
    timeLabel: '0',
    startTime: 0,
    endTime: 1,
    mediaId: 'media-1',
    surface: tokens.map((token) => token.form).join(' '),
    tokens,
    translation: '',
    transcriptionHref: '/transcription',
  };
}

describe('collectPosByFormWrites', () => {
  const rows = [
    row('unit-1', [
      { id: 'tok-a', form: 'sheep', gloss: '', pos: '', glossLang: 'default' },
      { id: 'tok-b', form: 'sheep', gloss: 'animal', pos: '', glossLang: 'default' },
      { id: 'tok-d', form: 'walk', gloss: 'go', pos: '', glossLang: 'default' },
    ]),
    row('unit-2', [{ id: 'tok-c', form: 'sheep', gloss: '', pos: 'NOUN', glossLang: 'default' }]),
  ];

  it('updates the same form in these rows and skips a dirty draft and an unchanged tag', () => {
    const writes = collectPosByFormWrites({
      rows,
      sourceTokenId: 'tok-a',
      pos: 'NOUN',
      drafts: {
        'tok-b': { pos: '', gloss: 'going' },
      },
    });
    expect(writes.map((write) => write.tokenId)).toEqual(['tok-a']);
    expect(posLabelInGraph('sheep', 'NOUN')).toBe('NOUN');
  });

  it('writes the chosen tag and reads it back', async () => {
    const stored = new Map<string, { id: string; pos?: string; gloss?: { default: string } }>();
    stored.set('tok-a', { id: 'tok-a', gloss: { default: '' } });
    const count = await saveAnnotationPosByForm(
      [{ unitId: 'unit-1', tokenId: 'tok-a', glossLang: 'default', pos: 'NOUN' }],
      {
        updateTokenPos: async (tokenId, pos) => {
          const current = stored.get(tokenId);
          if (current === undefined) return;
          stored.set(tokenId, { ...current, ...(pos ? { pos } : {}) });
        },
        listTokensByUnitIds: async () => [...stored.values()] as never,
      },
    );
    expect(count).toBe(1);
    expect(stored.get('tok-a')?.pos).toBe('NOUN');
  });
});
