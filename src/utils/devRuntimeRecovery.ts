const STALE_REACT_RELOAD_KEY = 'jieyu.dev.stale-react-reloaded';
const DEV_SW_DROPPED_KEY = 'jieyu.dev.sw-dropped';

/**
 * A null React dispatcher (`reading 'useContext'` / Invalid hook call) during
 * dev usually means the page mixed two Vite prebundle generations or a leftover
 * production service worker. The message names whichever hook ran first.
 */
export function isStaleDevReactDispatcherError(error: unknown): boolean {
  if (!import.meta.env.DEV) return false;
  const message = error instanceof Error ? error.message : '';
  return message.includes('Invalid hook call') || /reading 'use[A-Za-z]+'/.test(message);
}

/** Reload once per tab so a stale module graph is replaced. A real hook bug stays visible after that. */
export function reloadOnceForStaleDevReact(
  error: unknown,
  reload: () => void = () => window.location.reload(),
): boolean {
  if (!isStaleDevReactDispatcherError(error)) return false;
  if (typeof window === 'undefined') return false;
  try {
    if (window.sessionStorage.getItem(STALE_REACT_RELOAD_KEY) === '1') return false;
    window.sessionStorage.setItem(STALE_REACT_RELOAD_KEY, '1');
  } catch {
    return false;
  }
  reload();
  return true;
}

/**
 * Drop a service worker left by `vite preview` / a production build on the same
 * origin. Dev does not register one; a leftover worker can serve a stale React
 * chunk next to the current dev server and break HMR.
 * Returns true only when a registration was removed and the caller should reload.
 */
export async function dropDevServiceWorkerRegistration(): Promise<boolean> {
  if (!import.meta.env.DEV) return false;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  if (typeof window === 'undefined') return false;
  try {
    if (window.sessionStorage.getItem(DEV_SW_DROPPED_KEY) === '1') return false;
  } catch {
    return false;
  }
  const registrations = await navigator.serviceWorker.getRegistrations();
  if (registrations.length === 0) return false;
  await Promise.all(registrations.map((registration) => registration.unregister()));
  if (typeof caches !== 'undefined') {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
  try {
    window.sessionStorage.setItem(DEV_SW_DROPPED_KEY, '1');
  } catch {
    return true;
  }
  return true;
}
