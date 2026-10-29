import type { DesktopReadHost } from './projectReadHost';

export type DesktopSurface = 'desktop' | 'unavailable' | 'legacy';

/** `jieyuDesktop` is present in Electron even when the bridge or the flag is off. */
export function electronDesktopPresent(): boolean {
  return 'jieyuDesktop' in globalThis;
}

/**
 * A null host only means the desktop bridge is not usable.
 * It does not mean the browser should open the old database.
 */
export function resolveDesktopSurface(host: DesktopReadHost | null): DesktopSurface {
  if (host !== null) return 'desktop';
  if (electronDesktopPresent()) return 'unavailable';
  return 'legacy';
}

export function sessionExpiredMessage(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : typeof error === 'object' &&
            error !== null &&
            'message' in error &&
            typeof error.message === 'string'
          ? error.message
          : '';
  return message.includes('project session expired');
}
