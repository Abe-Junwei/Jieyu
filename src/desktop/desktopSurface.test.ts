import { afterEach, describe, expect, it } from 'vitest';
import { resolveDesktopSurface, sessionExpiredMessage } from './desktopSurface';
import type { DesktopReadHost } from './projectReadHost';

const host = {
  projectReadEnabled: true,
  chooseDesktopFolder: () => Promise.resolve({ cancelled: true as const }),
  desktopCall: () => Promise.resolve([]),
  desktopMediaUrl: () => Promise.resolve({ url: 'media' }),
} satisfies DesktopReadHost;

afterEach(() => {
  delete (globalThis as { jieyuDesktop?: unknown }).jieyuDesktop;
});

describe('resolveDesktopSurface', () => {
  it('uses the desktop page when the host is ready', () => {
    expect(resolveDesktopSurface(host)).toBe('desktop');
  });

  it('stays unavailable in Electron when the bridge or the flag is off', () => {
    (globalThis as { jieyuDesktop?: { projectReadEnabled: boolean } }).jieyuDesktop = {
      projectReadEnabled: false,
    };
    expect(resolveDesktopSurface(null)).toBe('unavailable');
  });

  it('keeps the old page for the browser dev shell', () => {
    expect(resolveDesktopSurface(null)).toBe('legacy');
  });

  it('recognises an expired project session', () => {
    expect(sessionExpiredMessage(new Error('project session expired'))).toBe(true);
    expect(sessionExpiredMessage(new Error('manuscript is missing'))).toBe(false);
  });
});
