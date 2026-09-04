import { describe, expect, it } from 'vitest';
import {
  reduceAnnotationKeyboard,
  type AnnotationKeyboardState,
} from './annotationKeyboardMachine';

const IDS = ['u1', 'u2', 'u3'];
const ROW: AnnotationKeyboardState = { mode: 'rowFocused', focusedUnitId: 'u2' };
const INPUT: AnnotationKeyboardState = { mode: 'inputFocused', focusedUnitId: 'u2' };

describe('reduceAnnotationKeyboard', () => {
  it('toggles play from row focus and inserts space while input-focused', () => {
    expect(
      reduceAnnotationKeyboard(
        ROW,
        { type: 'keydown', key: ' ', ctrlKey: false, shiftKey: false, hasSuggestion: false },
        IDS,
      ).action,
    ).toBe('playToggle');
    expect(
      reduceAnnotationKeyboard(
        INPUT,
        { type: 'keydown', key: ' ', ctrlKey: false, shiftKey: false, hasSuggestion: false },
        IDS,
      ).action,
    ).toBe('insertSpace');
  });

  it('moves to the next row on Tab when there is no suggestion', () => {
    const next = reduceAnnotationKeyboard(
      INPUT,
      { type: 'keydown', key: 'Tab', ctrlKey: false, shiftKey: false, hasSuggestion: false },
      IDS,
    );
    expect(next.action).toBe('moveNext');
    expect(next.state.focusedUnitId).toBe('u3');
  });

  it('accepts a suggestion on Tab instead of moving', () => {
    const next = reduceAnnotationKeyboard(
      INPUT,
      { type: 'keydown', key: 'Tab', ctrlKey: false, shiftKey: false, hasSuggestion: true },
      IDS,
    );
    expect(next.action).toBe('acceptSuggestion');
    expect(next.state.focusedUnitId).toBe('u2');
  });

  it('commits in place on Enter and does not skip after Ctrl+Enter without a save', () => {
    expect(
      reduceAnnotationKeyboard(
        INPUT,
        { type: 'keydown', key: 'Enter', ctrlKey: false, shiftKey: false, hasSuggestion: false },
        IDS,
      ),
    ).toEqual({ state: INPUT, action: 'commitStay' });
    expect(
      reduceAnnotationKeyboard(
        INPUT,
        { type: 'keydown', key: 'Enter', ctrlKey: true, shiftKey: false, hasSuggestion: false },
        IDS,
      ),
    ).toEqual({ state: INPUT, action: 'commitNext' });
  });

  it('enters input mode from a focused row on Enter', () => {
    const next = reduceAnnotationKeyboard(
      ROW,
      { type: 'keydown', key: 'Enter', ctrlKey: false, shiftKey: false, hasSuggestion: false },
      IDS,
    );
    expect(next.state.mode).toBe('inputFocused');
    expect(next.action).toBe('none');
  });
});
