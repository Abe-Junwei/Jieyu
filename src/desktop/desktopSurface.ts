import type { DesktopReadHost } from './projectReadHost';

export type DesktopSurface = 'desktop' | 'unavailable' | 'legacy';

/** `jieyuDesktop` is present in Electron even when the bridge is unavailable. */
export function electronDesktopPresent(): boolean {
  return 'jieyuDesktop' in globalThis;
}

/** Chromium E2E still builds the old web pages. `vite dev` does not. */
export function legacyWebSurfaceEnabled(): boolean {
  return import.meta.env.VITE_LEGACY_WEB_SURFACE === 'true';
}

/**
 * A null host only means the desktop bridge is not usable.
 * The browser then shows the desktop shell, not the old web pages.
 * Pass `legacyWeb` only from tests; the app reads `VITE_LEGACY_WEB_SURFACE`.
 */
export function resolveDesktopSurface(
  host: DesktopReadHost | null,
  legacyWeb = legacyWebSurfaceEnabled(),
): DesktopSurface {
  if (host !== null) return 'desktop';
  if (electronDesktopPresent()) return 'unavailable';
  if (legacyWeb) return 'legacy';
  return 'unavailable';
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
