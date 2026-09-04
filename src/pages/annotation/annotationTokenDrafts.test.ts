import { describe, expect, it } from 'vitest';
import {
  collectDirtyAnnotationTokenWrites,
  displayedAnnotationTokenFields,
  dropDraftsForTokenIds,
  resolveAnnotationGlossWriteLang,
  type AnnotationIgtToken,
} from './annotationTokenDrafts';

const TOKEN: AnnotationIgtToken = {
  id: 'tok-1',
  form: 'hello',
  gloss: 'INTJ',
  pos: 'X',
  glossLang: 'default',
};

describe('annotationTokenDrafts', () => {
  it('prefers default gloss lang and otherwise the first non-empty key', () => {
    expect(resolveAnnotationGlossWriteLang(undefined)).toBe('default');
    expect(resolveAnnotationGlossWriteLang({ default: '', eng: 'hi' })).toBe('default');
    expect(resolveAnnotationGlossWriteLang({ eng: 'hi', cmn: '你好' })).toBe('eng');
  });

  it('collects only dirty POS/gloss fields', () => {
    expect(collectDirtyAnnotationTokenWrites([TOKEN], {})).toEqual([]);
    expect(
      collectDirtyAnnotationTokenWrites([TOKEN], {
        'tok-1': { pos: 'X', gloss: 'INTJ' },
      }),
    ).toEqual([]);
    expect(
      collectDirtyAnnotationTokenWrites([TOKEN], {
        'tok-1': { pos: 'N', gloss: 'INTJ' },
      }),
    ).toEqual([{ tokenId: 'tok-1', glossLang: 'default', pos: 'N' }]);
    expect(
      collectDirtyAnnotationTokenWrites([TOKEN], {
        'tok-1': { pos: 'X', gloss: '  ' },
      }),
    ).toEqual([{ tokenId: 'tok-1', glossLang: 'default', gloss: null }]);
  });

  it('overlays drafts for display and drops cleared ids', () => {
    expect(displayedAnnotationTokenFields(TOKEN, { 'tok-1': { pos: 'N', gloss: 'n' } })).toEqual({
      pos: 'N',
      gloss: 'n',
    });
    expect(
      dropDraftsForTokenIds({ 'tok-1': { pos: 'N', gloss: 'n' }, keep: { pos: 'A', gloss: 'a' } }, [
        'tok-1',
      ]),
    ).toEqual({ keep: { pos: 'A', gloss: 'a' } });
  });
});
