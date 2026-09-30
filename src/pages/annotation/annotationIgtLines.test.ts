import { describe, expect, it } from 'vitest';
import {
  annotationGlossCell,
  annotationLineMoveTarget,
  annotationLinesToAdd,
  arrangeAnnotationLines,
  moveAnnotationLine,
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
    ).toEqual(['source', 'word', 'morphForm', 'gloss', 'pos', 'lemma', 'literal']);
  });
});

describe('arrangeAnnotationLines', () => {
  it('keeps source above analysis lines and translation below them', () => {
    expect(
      arrangeAnnotationLines(
        ['source', 'word', 'gloss', 'pos', 'translation'],
        ['translation', 'pos', 'source', 'gloss', 'word'],
      ),
    ).toEqual(['source', 'pos', 'gloss', 'word', 'translation']);
  });
});

describe('moveAnnotationLine', () => {
  it('reorders analysis lines and refuses to pull source below them', () => {
    const order = ['source', 'word', 'gloss', 'pos', 'translation'] as const;
    expect(moveAnnotationLine(order, 'gloss', 'word')).toEqual([
      'source',
      'gloss',
      'word',
      'pos',
      'translation',
    ]);
    expect(moveAnnotationLine(order, 'source', 'gloss')).toEqual([...order]);
    expect(moveAnnotationLine(order, 'translation', 'pos')).toEqual([...order]);
  });
});

describe('annotationLineMoveTarget', () => {
  it('moves analysis lines only within their band', () => {
    const lines = ['source', 'word', 'gloss', 'pos', 'translation'] as const;
    expect(annotationLineMoveTarget(lines, 'gloss', 'up')).toBe('word');
    expect(annotationLineMoveTarget(lines, 'gloss', 'down')).toBe('pos');
    expect(annotationLineMoveTarget(lines, 'source', 'down')).toBeNull();
    expect(annotationLineMoveTarget(lines, 'translation', 'up')).toBeNull();
    expect(annotationLineMoveTarget(lines, 'word', 'up')).toBeNull();
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
