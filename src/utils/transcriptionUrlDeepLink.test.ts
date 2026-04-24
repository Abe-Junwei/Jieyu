// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  buildTranscriptionDeepLinkHref,
  buildTranscriptionWorkspaceReturnHref,
  readTranscriptionDeepLinkOptionalParams,
  readTranscriptionWorkspaceReturnHint,
  rememberTranscriptionWorkspaceReturnHint,
  stripTranscriptionDeepLinkSearchParams,
} from './transcriptionUrlDeepLink';

describe('transcriptionUrlDeepLink', () => {
  it('strips all deep-link keys', () => {
    const prev = new URLSearchParams(
      'textId=t1&mediaId=m1&layerId=l1&unitId=u1&unitKind=segment&keep=1',
    );
    const next = stripTranscriptionDeepLinkSearchParams(prev);
    expect(next.get('keep')).toBe('1');
    expect(next.get('textId')).toBeNull();
    expect(next.get('mediaId')).toBeNull();
    expect(next.get('layerId')).toBeNull();
    expect(next.get('unitId')).toBeNull();
    expect(next.get('unitKind')).toBeNull();
  });

  it('reads optional params with default unitKind', () => {
    const sp = new URLSearchParams('mediaId= m99 &unitId=u42');
    const o = readTranscriptionDeepLinkOptionalParams(sp);
    expect(o).toEqual({ mediaId: 'm99', unitId: 'u42', unitKind: 'unit' });
  });

  it('buildTranscriptionDeepLinkHref encodes textId and optional keys', () => {
    expect(buildTranscriptionDeepLinkHref({ textId: 't-1', mediaId: 'm' })).toBe(
      '/transcription?textId=t-1&mediaId=m',
    );
    expect(
      buildTranscriptionDeepLinkHref({ textId: 't', unitId: 's', unitKind: 'segment' }),
    ).toBe('/transcription?textId=t&unitId=s&unitKind=segment');
  });

  it('round-trips workspace return hint via sessionStorage', () => {
    expect(buildTranscriptionWorkspaceReturnHref()).toBe('/transcription');
    rememberTranscriptionWorkspaceReturnHint({ textId: 'tid-9', mediaId: 'mid-1' });
    expect(readTranscriptionWorkspaceReturnHint()).toEqual({ textId: 'tid-9', mediaId: 'mid-1' });
    expect(buildTranscriptionWorkspaceReturnHref()).toBe('/transcription?textId=tid-9&mediaId=mid-1');
    sessionStorage.clear();
  });
});
