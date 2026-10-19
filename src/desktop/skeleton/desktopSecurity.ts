/** Linux `basic_text` encrypts with a hardcoded password, so real runs must not store keys with it. */
export function secretStoreRefusal(
  encryptionAvailable: boolean,
  linuxBackend: string | null,
  smoke: boolean,
): 'unavailable' | 'basic_text' | null {
  if (!encryptionAvailable) return 'unavailable';
  if (!smoke && linuxBackend === 'basic_text') return 'basic_text';
  return null;
}

/** Only same-document file loads or same-origin http(s) loads may replace the app page. */
export function isAppNavigation(target: string, current: string): boolean {
  let next: URL;
  let now: URL;
  try {
    next = new URL(target);
    now = new URL(current);
  } catch {
    return false;
  }
  if (next.protocol !== now.protocol) return false;
  if (next.protocol === 'file:') return next.pathname === now.pathname;
  if (next.protocol !== 'http:' && next.protocol !== 'https:') return false;
  return next.origin === now.origin;
}
