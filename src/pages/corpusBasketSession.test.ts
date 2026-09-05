// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import {
  readCorpusBasketSession,
  resetCorpusBasketSessionForTests,
  syncCorpusBasketScope,
  toggleCorpusBasketUnit,
} from './corpusBasketSession';
import {
  CORPUS_VIEW_STATE_KEY,
  resetCorpusViewStateForTests,
  writeCorpusViewState,
} from './corpusViewState';

afterEach(() => {
  resetCorpusBasketSessionForTests();
  resetCorpusViewStateForTests();
});

describe('corpusBasketSession', () => {
  it('toggles units in the current scope', () => {
    syncCorpusBasketScope('tid-1', 'mid-1');
    expect(toggleCorpusBasketUnit('uid-1').unitIds).toEqual(['uid-1']);
    expect(toggleCorpusBasketUnit('uid-2').unitIds).toEqual(['uid-1', 'uid-2']);
    expect(toggleCorpusBasketUnit('uid-1').unitIds).toEqual(['uid-2']);
  });

  it('clears the workset when text or media changes', () => {
    syncCorpusBasketScope('tid-1', 'mid-1');
    toggleCorpusBasketUnit('uid-1');
    expect(syncCorpusBasketScope('tid-1', 'mid-2').unitIds).toEqual([]);
    toggleCorpusBasketUnit('uid-2');
    expect(syncCorpusBasketScope('tid-9', 'mid-2').unitIds).toEqual([]);
  });

  it('stays isolated from a transcription selectedUnitIds array', () => {
    const selectedUnitIds = ['u-transcription'];
    syncCorpusBasketScope('tid-1', 'mid-1');
    toggleCorpusBasketUnit('u-corpus');
    expect(selectedUnitIds).toEqual(['u-transcription']);
    expect(readCorpusBasketSession().unitIds).toEqual(['u-corpus']);
  });

  it('does not persist the workset to sessionStorage', () => {
    writeCorpusViewState({ filterText: 'tone' });
    syncCorpusBasketScope('tid-1', 'mid-1');
    toggleCorpusBasketUnit('uid-hidden');
    expect(sessionStorage.getItem('corpusBasket')).toBeNull();
    expect(sessionStorage.getItem(CORPUS_VIEW_STATE_KEY)).toBe(
      JSON.stringify({ filterText: 'tone' }),
    );
    expect(sessionStorage.getItem(CORPUS_VIEW_STATE_KEY)).not.toContain('uid-hidden');
  });
});
