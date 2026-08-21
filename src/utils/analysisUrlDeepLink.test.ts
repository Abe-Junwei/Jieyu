import { describe, expect, it } from 'vitest';
import {
  buildAnalysisDeepLinkHref,
  readAnalysisDeepLinkParams,
  resolveAnalysisWorkspaceScope,
} from './analysisUrlDeepLink';

describe('analysisUrlDeepLink', () => {
  it('builds a similar-units deep link without empty params', () => {
    expect(
      buildAnalysisDeepLinkHref({
        tab: 'embedding',
        textId: 'tid-1',
        mediaId: 'mid-1',
        unitId: 'uid-9',
        intent: 'similar',
      }),
    ).toBe('/analysis?tab=embedding&textId=tid-1&mediaId=mid-1&unitId=uid-9&intent=similar');
  });

  it('clamps acoustic tab to embedding and reads intent', () => {
    const parsed = readAnalysisDeepLinkParams(
      new URLSearchParams('tab=acoustic&textId=t1&intent=similar'),
    );
    expect(parsed.tab).toBe('embedding');
    expect(parsed.autoFindSimilar).toBe(true);
    expect(parsed.textId).toBe('t1');
  });

  it('uses the return hint only when the URL has no textId', () => {
    expect(
      resolveAnalysisWorkspaceScope({
        urlTextId: '',
        urlMediaId: '',
        hint: { textId: 'hint-text', mediaId: 'hint-media' },
      }),
    ).toEqual({ textId: 'hint-text', mediaId: 'hint-media' });

    expect(
      resolveAnalysisWorkspaceScope({
        urlTextId: 'url-text',
        urlMediaId: '',
        hint: { textId: 'hint-text', mediaId: 'hint-media' },
      }),
    ).toEqual({ textId: 'url-text', mediaId: '' });
  });
});
