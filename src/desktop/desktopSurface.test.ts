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
  it('keeps browser regression routes available without a desktop host', () => {
    expect(resolveDesktopSurface(null)).toBe('legacy');
  });

  it('uses the desktop page when the host is ready', () => {
    expect(resolveDesktopSurface(host)).toBe('desktop');
  });

  it('stays unavailable when the desktop host is missing', () => {
    (globalThis as { jieyuDesktop?: { projectReadEnabled: boolean } }).jieyuDesktop = {
      projectReadEnabled: false,
    };
    expect(resolveDesktopSurface(null)).toBe('unavailable');
  });

  it('recognises an expired project session', () => {
    expect(sessionExpiredMessage(new Error('project session expired'))).toBe(true);
    expect(sessionExpiredMessage(new Error('manuscript is missing'))).toBe(false);
  });
});
