/**
 * Region detection utility.
 * Detects whether the user is in mainland China or overseas
 * based on browser locale hints + lightweight network reachability probe.
 */

export type Region = 'cn' | 'global';

const REGION_STORAGE_KEY = 'jieyu.voice.region';

function isMainlandLikeLocale(lang: string): boolean {
  const normalized = lang.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === 'zh-cn' || normalized === 'zh') return true;
  // 新马中文用户通常不应默认归为大陆 | zh-SG/zh-MY should not be mapped to CN by default
  if (normalized === 'zh-sg' || normalized === 'zh-my') return false;
  return false;
}

/**
 * Detect user region without requiring IP geolocation API.
 * Uses a 3-second timeout to avoid blocking startup.
 *
 * Strategy:
 * 1. If user previously selected manually, use that.
 * 2. Check navigator.language — 'zh' strongly suggests CN.
 * 3. Probe Google/generate_204 — if unreachable from Chrome, user is likely in CN.
 */
export async function detectRegion(): Promise<Region> {
  // 1. Use cached preference
  const cached = typeof localStorage !== 'undefined'
    ? localStorage.getItem(REGION_STORAGE_KEY)
    : null;
  if (cached === 'cn' || cached === 'global') return cached;

  // 2. Google reachability probe (most accurate for CN detection)
  // Google is blocked in mainland China, so this is a reliable proxy.
  // Always probe first — locale alone cannot distinguish HK/TW/Macau from CN.
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch('https://www.google.com/generate_204', {
        signal: controller.signal,
        mode: 'no-cors',
      });
      // If we reach Google, user is outside mainland China
      return res.ok || res.status === 0 ? 'global' : 'cn';
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    // Network error or timeout — fall back to locale heuristic
    // Only 'zh-CN' strongly suggests mainland; zh-HK / zh-TW are global
    console.error('[Jieyu] regionDetection: region check failed, falling back to locale heuristic', err);
    const lang = typeof navigator !== 'undefined' ? navigator.language : '';
    return isMainlandLikeLocale(lang) ? 'cn' : 'global';
  }
}

/** Persist the user's manual region selection. */
export function saveRegionPreference(region: Region): void {
  localStorage.setItem(REGION_STORAGE_KEY, region);
}

/** Clear cached region (forces re-detection). */
export function clearRegionPreference(): void {
  localStorage.removeItem(REGION_STORAGE_KEY);
}
