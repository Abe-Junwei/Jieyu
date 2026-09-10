// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import {
  CORPUS_VIEW_STATE_KEY,
  readCorpusViewState,
  resetCorpusViewStateForTests,
  writeCorpusViewState,
} from './corpusViewState';

afterEach(() => {
  resetCorpusViewStateForTests();
});

describe('corpusViewState', () => {
  it('round-trips filter text and list scroll without touching corpusBasket', () => {
    writeCorpusViewState({ filterText: 'tone', listScrollTop: 40.6 });
    expect(readCorpusViewState()).toEqual({ filterText: 'tone', listScrollTop: 41 });
    expect(sessionStorage.getItem('corpusBasket')).toBeNull();
    expect(sessionStorage.getItem(CORPUS_VIEW_STATE_KEY)).not.toContain('corpusBasket');
  });

  it('omits empty filter and zero scroll from the stored payload', () => {
    writeCorpusViewState({ filterText: '  ', listScrollTop: 0 });
    expect(readCorpusViewState()).toEqual({});
    expect(sessionStorage.getItem(CORPUS_VIEW_STATE_KEY)).toBe('{}');
  });
});
