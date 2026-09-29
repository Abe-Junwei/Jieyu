import { describe, expect, it } from 'vitest';
import {
  collectDirtyAnnotationMorphemeWrites,
  displayedAnnotationMorphemeFields,
  dropCommittedMorphemeDrafts,
  planMorphemeFormsFromToken,
  type AnnotationIgtMorpheme,
} from './annotationMorphemeDrafts';
import { annotationGlossHasLeipzigIssue } from './annotationLeipzigGloss';
import { planTokenSplit } from './splitMergeAnnotationTokens';
import { entryDoc } from '../../utils/dmlexEntry';
import { resolveLexemeForLinkQuery } from './saveAnnotationLexemeLink';

const MORPH: AnnotationIgtMorpheme = {
  id: 'mor-1',
  tokenId: 'tok-1',
  form: 'hello',
  gloss: 'INTJ',
  glossLang: 'default',
  morphemeIndex: 0,
};

describe('annotation morpheme helpers', () => {
  it('plans morpheme forms from hyphen or clitic markers', () => {
    expect(planMorphemeFormsFromToken('hello')).toEqual([]);
    expect(planMorphemeFormsFromToken('hello-world')).toEqual(['hello', 'world']);
    expect(planMorphemeFormsFromToken('the=cat')).toEqual(['the', 'cat']);
  });

  it('collects dirty morpheme drafts only', () => {
    expect(collectDirtyAnnotationMorphemeWrites([MORPH], {})).toEqual([]);
    expect(
      displayedAnnotationMorphemeFields(MORPH, {
        'mor-1': { form: 'hell', gloss: 'root', spans: '' },
      }),
    ).toEqual({ form: 'hell', gloss: 'root', spans: '' });
    expect(
      collectDirtyAnnotationMorphemeWrites([MORPH], {
        'mor-1': { form: 'hell', gloss: 'INTJ', spans: '' },
      }),
    ).toEqual([{ ...MORPH, form: 'hell' }]);
  });

  it('drops only the morpheme draft that still matches the save snapshot', () => {
    const committed = { 'mor-1': { form: 'hell', gloss: 'INTJ', spans: '' } };
    expect(dropCommittedMorphemeDrafts({ 'mor-1': committed['mor-1']! }, committed)).toEqual({});
    expect(
      dropCommittedMorphemeDrafts(
        { 'mor-1': { form: 'hello!', gloss: 'INTJ', spans: '0-2' }, 'mor-2': committed['mor-1']! },
        committed,
      ),
    ).toEqual({
      'mor-1': { form: 'hello!', gloss: 'INTJ', spans: '0-2' },
      'mor-2': { form: 'hell', gloss: 'INTJ', spans: '' },
    });
  });

  it('splits tokens at | then whitespace', () => {
    expect(planTokenSplit('hello')).toBeNull();
    expect(planTokenSplit('hello world')).toEqual({ left: 'hello', right: 'world' });
    expect(planTokenSplit('hel|lo')).toEqual({ left: 'hel', right: 'lo' });
  });

  it('flags unknown Leipzig abbreviations and allows lexical lowercase', () => {
    expect(annotationGlossHasLeipzigIssue('dog')).toBe(false);
    expect(annotationGlossHasLeipzigIssue('3.SG')).toBe(false);
    expect(annotationGlossHasLeipzigIssue('ZZZ')).toBe(true);
  });

  it('resolves a unique lexeme hit by lemma or id', () => {
    const hits = [entryDoc({ id: 'lex-1', headword: 'hello', createdAt: '', updatedAt: '' })];
    expect(resolveLexemeForLinkQuery('hello', hits)?.id).toBe('lex-1');
    expect(resolveLexemeForLinkQuery('lex-1', hits)?.id).toBe('lex-1');
    expect(resolveLexemeForLinkQuery('nope', hits)).toBeUndefined();
  });
});
