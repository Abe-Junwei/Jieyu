import type { DesktopReadHost } from './projectReadHost';

export type DesktopSurface = 'desktop' | 'unavailable' | 'legacy';

/** `jieyuDesktop` is present in Electron even when the bridge is unavailable. */
export function electronDesktopPresent(): boolean {
  return 'jieyuDesktop' in globalThis;
}

/** Baked by `vite.legacy.config.ts`. Desktop `dev` and `build` leave this unset. */
export function legacyWebSurfaceEnabled(): boolean {
  return import.meta.env.VITE_LEGACY_WEB_SURFACE === 'true';
}

/**
 * A null host means the desktop bridge is not usable, so the desktop route shows unavailable.
 * The old web pages come from the legacy build, not from this function.
 * Pass `legacyWeb` only from tests; the legacy config sets `VITE_LEGACY_WEB_SURFACE`.
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
