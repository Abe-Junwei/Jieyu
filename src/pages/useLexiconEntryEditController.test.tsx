// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LexemeDocType } from '../types/jieyuDbDocTypes';
import { useLexiconEntryEditController } from './useLexiconEntryEditController';

const dog: LexemeDocType = {
  id: 'lex-dog',
  lemma: { default: 'dog' },
  senses: [{ gloss: { default: 'canine' } }],
  createdAt: '2026-04-04T00:00:00.000Z',
  updatedAt: '2026-04-04T00:00:00.000Z',
};

describe('useLexiconEntryEditController', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not cancel create mode when an earlier edit save completes', async () => {
    let resolveSave: ((value: LexemeDocType) => void) | undefined;
    vi.spyOn(await import('./lexicon/saveLexiconEntry'), 'saveLexiconEntry').mockImplementation(
      () =>
        new Promise<LexemeDocType>((resolve) => {
          resolveSave = resolve;
        }),
    );

    const onSaved = vi.fn();
    const { result } = renderHook(
      ({ selectedLexeme }) => useLexiconEntryEditController({ selectedLexeme, onSaved }),
      { initialProps: { selectedLexeme: dog as LexemeDocType | null } },
    );

    act(() => {
      result.current.onFieldChange('lemma', 'hound');
      result.current.onSave();
    });

    act(() => {
      result.current.onStartCreate();
      result.current.onFieldChange('lemma', 'cat');
      result.current.onFieldChange('gloss', 'feline');
    });

    expect(result.current.creating).toBe(true);
    expect(result.current.fields.lemma).toBe('cat');

    await act(async () => {
      resolveSave?.({
        ...dog,
        lemma: { default: 'hound' },
        updatedAt: '2026-09-11T12:00:00.000Z',
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.saving).toBe(false);
    });

    expect(result.current.creating).toBe(true);
    expect(result.current.fields.lemma).toBe('cat');
    expect(result.current.fields.gloss).toBe('feline');
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('does not create duplicate lexemes when save is double-submitted in create mode', async () => {
    const saveSpy = vi.spyOn(await import('./lexicon/saveLexiconEntry'), 'saveLexiconEntry');
    let call = 0;
    saveSpy.mockImplementation(async () => {
      call += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return {
        id: `lex-new-${call}`,
        lemma: { default: 'cat' },
        senses: [{ gloss: { default: 'feline' } }],
        createdAt: '2026-09-11T12:00:00.000Z',
        updatedAt: '2026-09-11T12:00:00.000Z',
      };
    });

    const onSaved = vi.fn();
    const { result } = renderHook(() =>
      useLexiconEntryEditController({ selectedLexeme: dog, onSaved }),
    );

    act(() => {
      result.current.onStartCreate();
      result.current.onFieldChange('lemma', 'cat');
      result.current.onFieldChange('gloss', 'feline');
      result.current.onSave();
      result.current.onSave();
    });

    await waitFor(() => {
      expect(result.current.saving).toBe(false);
    });

    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('saves the latest lemma even when a stale onSave identity is invoked', async () => {
    const saveSpy = vi.spyOn(await import('./lexicon/saveLexiconEntry'), 'saveLexiconEntry');
    saveSpy.mockResolvedValue({
      ...dog,
      lemma: { default: 'hound' },
      senses: [{ gloss: { default: 'hunting dog' } }],
      updatedAt: '2026-09-22T12:00:00.000Z',
    });

    const onSaved = vi.fn();
    const { result } = renderHook(() =>
      useLexiconEntryEditController({ selectedLexeme: dog, onSaved }),
    );
    const staleSave = result.current.onSave;

    act(() => {
      result.current.onFieldChange('lemma', 'hound');
      result.current.onFieldChange('gloss', 'hunting dog');
    });

    act(() => {
      staleSave();
    });

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalled();
    });
    expect(saveSpy.mock.calls[0]?.[0]).toMatchObject({
      fields: { lemma: 'hound', gloss: 'hunting dog' },
    });
  });

  it('keeps an extra sense added immediately after the selected lexeme first lands', () => {
    const onSaved = vi.fn();
    const { result, rerender } = renderHook(
      ({ selectedLexeme }) => useLexiconEntryEditController({ selectedLexeme, onSaved }),
      { initialProps: { selectedLexeme: null as LexemeDocType | null } },
    );

    rerender({ selectedLexeme: dog });
    act(() => {
      result.current.onAddExtraSense();
    });

    expect(result.current.fields.lemma).toBe('dog');
    expect(result.current.fields.gloss).toBe('canine');
    expect(result.current.fields.extraSenses).toHaveLength(1);
  });

  it('keeps in-progress edits when the same lexeme object is replaced', () => {
    const onSaved = vi.fn();
    const { result, rerender } = renderHook(
      ({ selectedLexeme }) => useLexiconEntryEditController({ selectedLexeme, onSaved }),
      { initialProps: { selectedLexeme: dog as LexemeDocType | null } },
    );

    act(() => {
      result.current.onFieldChange('lemma', 'hound');
    });

    rerender({ selectedLexeme: { ...dog, updatedAt: '2026-09-14T00:00:00.000Z' } });

    expect(result.current.fields.lemma).toBe('hound');
  });

  it('carries nested ids on drafts and keeps them after removing a middle row', () => {
    const selected: LexemeDocType = {
      ...dog,
      senses: [
        { id: 'sense_primary', gloss: { default: 'canine' } },
        { id: 'sense_pet', gloss: { default: 'pet' }, definition: { default: 'companion' } },
        { id: 'sense_follow', gloss: { default: 'follow' } },
        { id: 'sense_food', gloss: { default: 'hot dog' } },
      ],
      forms: [
        { id: 'form_dogs', transcription: { default: 'dogs' } },
        { id: 'form_doggie', transcription: { default: 'doggie' } },
        { id: 'form_hound', transcription: { default: 'hound' } },
      ],
    };
    const onSaved = vi.fn();
    const { result } = renderHook(() =>
      useLexiconEntryEditController({ selectedLexeme: selected, onSaved }),
    );

    expect(result.current.fields.extraSenses.map((sense) => sense.id)).toEqual([
      'sense_pet',
      'sense_follow',
      'sense_food',
    ]);
    expect(result.current.fields.forms.map((form) => form.id)).toEqual([
      'form_dogs',
      'form_doggie',
      'form_hound',
    ]);

    act(() => {
      result.current.onRemoveExtraSense(1);
      result.current.onRemoveForm(1);
    });

    expect(result.current.fields.extraSenses.map((sense) => sense.id)).toEqual([
      'sense_pet',
      'sense_food',
    ]);
    expect(
      result.current.fields.forms.map((form) => ({ id: form.id, text: form.transcription })),
    ).toEqual([
      { id: 'form_dogs', text: 'dogs' },
      { id: 'form_hound', text: 'hound' },
    ]);
  });
});
