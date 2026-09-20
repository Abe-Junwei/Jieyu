/**
 * Request persistent IndexedDB quota when the browser supports StorageManager.
 * Unsupported / denied persist() is a no-op so boot never blocks.
 */
export async function requestPersistentStorage(): Promise<boolean | null> {
  if (typeof navigator === 'undefined') return null;
  const persist = navigator.storage?.persist;
  if (typeof persist !== 'function') return null;
  try {
    return await persist.call(navigator.storage);
  } catch {
    return false;
  }
}
