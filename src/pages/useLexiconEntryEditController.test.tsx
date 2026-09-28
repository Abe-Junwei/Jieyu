// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LexemeEntryDoc } from '../types/jieyuDbDocTypes';
import { entryDoc } from '../utils/dmlexEntry';
import { useLexiconEntryEditController } from './useLexiconEntryEditController';

const now = '2026-04-04T00:00:00.000Z';
const dog = entryDoc({
  id: 'lex-dog',
  headword: 'dog',
  translation: 'canine',
  createdAt: now,
  updatedAt: now,
});

describe('useLexiconEntryEditController', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not cancel create mode when an earlier edit save completes', async () => {
    let resolveSave: ((value: LexemeEntryDoc) => void) | undefined;
    vi.spyOn(await import('./lexicon/saveLexiconEntry'), 'saveLexiconEntry').mockImplementation(
      () =>
        new Promise<LexemeEntryDoc>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const onSaved = vi.fn();
    const { result } = renderHook(
      ({ selectedLexeme }) =>
        useLexiconEntryEditController({ selectedLexeme, onSaved, onDeleted: vi.fn() }),
      { initialProps: { selectedLexeme: dog as LexemeEntryDoc | null } },
    );

    act(() => {
      result.current.onFieldChange('headword', 'hound');
      result.current.onSave();
      result.current.onStartCreate();
    });

    await act(async () => {
      resolveSave?.(
        entryDoc({
          id: 'lex-dog',
          headword: 'hound',
          translation: 'canine',
          createdAt: now,
          updatedAt: now,
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.creating).toBe(true);
      expect(result.current.fields.headword).toBe('');
    });
    expect(onSaved).toHaveBeenCalled();
  });

  it('saves the latest headword even when a stale onSave identity is invoked', async () => {
    const saveSpy = vi
      .spyOn(await import('./lexicon/saveLexiconEntry'), 'saveLexiconEntry')
      .mockResolvedValue(
        entryDoc({
          id: 'lex-dog',
          headword: 'hound',
          translation: 'hunting dog',
          createdAt: now,
          updatedAt: now,
        }),
      );
    const { result } = renderHook(() =>
      useLexiconEntryEditController({
        selectedLexeme: dog,
        onSaved: vi.fn(),
        onDeleted: vi.fn(),
      }),
    );
    const staleSave = result.current.onSave;
    act(() => {
      result.current.onFieldChange('headword', 'hound');
      result.current.onSenseChange(0, 'translation', 'hunting dog');
    });
    act(() => {
      staleSave();
    });
    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalled();
    });
    expect(saveSpy.mock.calls[0]?.[0].fields.headword).toBe('hound');
    expect(saveSpy.mock.calls[0]?.[0].fields.senses[0]?.translation).toBe('hunting dog');
  });

  it('keeps a subsense added after the selected entry lands', () => {
    const { result, rerender } = renderHook(
      ({ selectedLexeme }) =>
        useLexiconEntryEditController({
          selectedLexeme,
          onSaved: vi.fn(),
          onDeleted: vi.fn(),
        }),
      { initialProps: { selectedLexeme: null as LexemeEntryDoc | null } },
    );
    rerender({ selectedLexeme: dog });
    act(() => {
      result.current.onAddSubsense(0);
    });
    expect(result.current.fields.headword).toBe('dog');
    expect(result.current.fields.senses).toHaveLength(2);
    expect(result.current.fields.senses[1]?.parentId).toBe(result.current.fields.senses[0]?.id);
  });

  it('keeps in-progress edits when the same entry object is replaced', () => {
    const { result, rerender } = renderHook(
      ({ selectedLexeme }) =>
        useLexiconEntryEditController({
          selectedLexeme,
          onSaved: vi.fn(),
          onDeleted: vi.fn(),
        }),
      { initialProps: { selectedLexeme: dog as LexemeEntryDoc | null } },
    );
    act(() => {
      result.current.onFieldChange('headword', 'hound');
    });
    rerender({ selectedLexeme: { ...dog, updatedAt: '2026-09-14T00:00:00.000Z' } });
    expect(result.current.fields.headword).toBe('hound');
  });
});
