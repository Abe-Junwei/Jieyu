// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LocaleProvider } from '../../i18n';
import type { LexemeDocType } from '../../types/jieyuDbDocTypes';
import { LexiconEntryOverview } from './LexiconEntryOverview';

const lexeme: LexemeDocType = {
  id: 'lex-dog',
  lemma: { default: 'dog' },
  language: 'eng',
  citationForm: 'dog',
  pronunciation: 'dɔg',
  etymology: { form: 'perro', gloss: 'dog', sourceLanguage: 'Spanish' },
  literalMeaning: 'domestic animal',
  bibliography: 'Smith 1990',
  restrictions: 'internal',
  lexemeType: 'stem',
  senses: [{ id: 'sense-1', gloss: { default: 'canine' } }],
  createdAt: '2026-09-25T00:00:00.000Z',
  updatedAt: '2026-09-25T01:00:00.000Z',
};

afterEach(() => {
  cleanup();
});

describe('LexiconEntryOverview', () => {
  it('shows stored entry fields and joins etymology parts', () => {
    render(
      <LocaleProvider locale="en-US">
        <LexiconEntryOverview lexeme={lexeme} />
      </LocaleProvider>,
    );
    expect(screen.getByTestId('lexicon-workspace-pronunciation').textContent).toBe('dɔg');
    expect(screen.getByTestId('lexicon-workspace-etymology').textContent).toBe(
      'perro · dog · Spanish',
    );
    expect(screen.getByTestId('lexicon-workspace-literal-meaning').textContent).toBe(
      'domestic animal',
    );
    expect(screen.getByTestId('lexicon-workspace-bibliography').textContent).toBe('Smith 1990');
    expect(screen.getByTestId('lexicon-workspace-restrictions').textContent).toBe('internal');
    expect(screen.getByTestId('lexicon-workspace-lexeme-type').textContent).toBe('stem');
    expect(screen.getByText('eng')).toBeTruthy();
    expect(screen.getByText('2026-09-25T01:00:00.000Z')).toBeTruthy();
  });

  it('uses the empty label when optional fields are missing', () => {
    const {
      pronunciation: _pronunciation,
      etymology: _etymology,
      literalMeaning: _literalMeaning,
      bibliography: _bibliography,
      restrictions: _restrictions,
      lexemeType: _lexemeType,
      ...bare
    } = lexeme;
    render(
      <LocaleProvider locale="en-US">
        <LexiconEntryOverview lexeme={bare} />
      </LocaleProvider>,
    );
    expect(screen.getByTestId('lexicon-workspace-pronunciation').textContent).toBe('Not set');
    expect(screen.getByTestId('lexicon-workspace-etymology').textContent).toBe('Not set');
    expect(screen.getByTestId('lexicon-workspace-restrictions').textContent).toBe('Not set');
  });
});
