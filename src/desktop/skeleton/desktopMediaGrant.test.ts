import { afterEach, describe, expect, it } from 'vitest';
import {
  bindDesktopMediaSession,
  grantDesktopMedia,
  resetDesktopMediaGrants,
  resolveDesktopMedia,
} from './desktopMediaGrant';

describe('desktopMediaGrant', () => {
  afterEach(() => resetDesktopMediaGrants());

  it('returns the same token for the same file so re-reads keep the media URL', () => {
    bindDesktopMediaSession('s1');
    const first = grantDesktopMedia('s1', '/p/a.wav');
    expect(grantDesktopMedia('s1', '/p/a.wav')).toBe(first);
    expect(grantDesktopMedia('s1', '/p/b.wav')).not.toBe(first);
    expect(resolveDesktopMedia(first)).toBe('/p/a.wav');
  });
});
