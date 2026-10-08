// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DMLEX_HOMOGRAPH } from '../../db/dmlexTypes';
import { LocaleProvider } from '../../i18n';
import type { LexemeEntryDoc } from '../../types/jieyuDbDocTypes';
import { LexiconEntryOverview } from './LexiconEntryOverview';

const lexeme: LexemeEntryDoc = {
  id: 'lex-dog',
  textId: 'text-1',
  entry: {
    id: 'lex-dog',
    headword: 'dog',
    partsOfSpeech: ['noun'],
    pronunciations: [{ transcriptions: [{ text: 'dɔg' }] }],
    inflectedForms: [{ text: 'dogs' }],
    etymologies: [{ etymons: [{ etymonUnits: [{ text: 'perro', langCode: 'es' }] }] }],
    senses: [{ id: 'sense-1', headwordTranslations: [{ text: 'canine', langCode: 'en' }] }],
  },
  jieyu: { notes: [{ owner: 'entry', ref: 'lex-dog', text: 'field note' }] },
  createdAt: '2026-09-25T00:00:00.000Z',
  updatedAt: '2026-09-25T01:00:00.000Z',
};

afterEach(() => {
  cleanup();
});

describe('LexiconEntryOverview', () => {
  it('shows pronunciation, etymon, note, and the linked homograph', () => {
    render(
      <LocaleProvider locale="en-US">
        <LexiconEntryOverview
          lexeme={lexeme}
          relations={[
            { type: DMLEX_HOMOGRAPH, members: [{ ref: 'lex-dog' }, { ref: 'lex-hound' }] },
          ]}
        />
      </LocaleProvider>,
    );
    expect(screen.getByTestId('lexicon-workspace-pronunciation').textContent).toBe('dɔg');
    expect(screen.getByTestId('lexicon-workspace-etymology').textContent).toBe('perro · es');
    expect(screen.getByTestId('lexicon-workspace-note').textContent).toBe('field note');
    expect(screen.getByTestId('lexicon-workspace-homograph').textContent).toBe('lex-hound');
    expect(screen.getByTestId('lexicon-workspace-inflected-forms').textContent).toBe('dogs');
  });
});
