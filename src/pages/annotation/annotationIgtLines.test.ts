import { describe, expect, it } from 'vitest';
import {
  annotationGlossCell,
  annotationLinesToAdd,
  visibleAnnotationLines,
} from './annotationIgtLines';

describe('annotationGlossCell', () => {
  it('joins morpheme glosses so a content stem and a grammatical marker share one line', () => {
    expect(annotationGlossCell('boy', ['boy', 'PL'])).toBe('boy-PL');
  });

  it('uses the token gloss when the word has not been split into morphemes', () => {
    expect(annotationGlossCell('INTJ', [])).toBe('INTJ');
  });
});

describe('visibleAnnotationLines', () => {
  it('puts the unsegmented source above the word line', () => {
    expect(
      visibleAnnotationLines({
        hasSurface: true,
        hasTokens: true,
        hasMorphForms: false,
        hasGloss: true,
        hasPos: true,
        hasLemma: false,
        hasTranslation: true,
        editing: false,
        added: [],
        hidden: [],
      }),
    ).toEqual(['source', 'word', 'gloss', 'pos', 'translation']);
  });

  it('shows morpheme forms, lexeme, and literal only after they are added or already stored', () => {
    expect(
      visibleAnnotationLines({
        hasSurface: true,
        hasTokens: true,
        hasMorphForms: true,
        hasGloss: false,
        hasPos: false,
        hasLemma: true,
        hasTranslation: false,
        editing: false,
        added: ['literal'],
        hidden: [],
      }),
    ).toEqual(['source', 'word', 'morphForm', 'lemma', 'literal']);
  });
});

describe('annotationLinesToAdd', () => {
  it('offers only the analysis lines that are not already on the sentence', () => {
    expect(annotationLinesToAdd(['source', 'word', 'gloss', 'translation'])).toEqual([
      'morphForm',
      'pos',
      'lemma',
      'literal',
    ]);
  });
});
