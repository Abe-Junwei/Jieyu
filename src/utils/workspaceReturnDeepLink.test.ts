// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  buildLexiconWorkspaceHref,
  findWorkspaceStateDualWriteViolations,
  readLexiconReturnParam,
  readOptionalListScrollTop,
} from './workspaceReturnDeepLink';

describe('workspaceReturnDeepLink', () => {
  it('reads lexiconReturn from search params and returns the lexicon workspace href', () => {
    expect(readLexiconReturnParam(new URLSearchParams('textId=t&lexiconReturn=lex-9'))).toBe(
      'lex-9',
    );
    expect(readLexiconReturnParam(new URLSearchParams('unitId=u1'))).toBe('');
    expect(buildLexiconWorkspaceHref()).toBe('/lexicon');
  });

  it('keeps only positive finite list scroll offsets', () => {
    expect(readOptionalListScrollTop(144.4)).toBe(144);
    expect(readOptionalListScrollTop('88')).toBe(88);
    expect(readOptionalListScrollTop(0)).toBeUndefined();
    expect(readOptionalListScrollTop(-3)).toBeUndefined();
    expect(readOptionalListScrollTop('nope')).toBeUndefined();
  });

  it('flags dual-write of frozen R8 keys across URL and sessionStorage', () => {
    expect(
      findWorkspaceStateDualWriteViolations({
        urlKeys: ['unitId', 'layerId', 'lexiconReturn'],
        sessionStorageKeys: ['lexiconListState', 'corpusViewState'],
      }),
    ).toEqual([]);
    expect(
      findWorkspaceStateDualWriteViolations({
        urlKeys: ['corpusBasket', 'lexiconListState'],
        sessionStorageKeys: ['corpusBasket', 'unitId'],
      }),
    ).toEqual([
      'session-only key in URL: lexiconListState',
      'router-session key in URL: corpusBasket',
      'router-session key in sessionStorage: corpusBasket',
      'URL-nav key in sessionStorage: unitId',
    ]);
  });
});
