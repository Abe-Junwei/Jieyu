import { normalizeAiChatSettings, type AiChatSettings } from '../providers/providerCatalog';
import { browserAiChatKeyVault, type KeyVaultBackend } from './keyVault';
import { createLogger } from '../../observability/logger';

let activeAiChatKeyVault: KeyVaultBackend<AiChatSettings> = browserAiChatKeyVault;
const log = createLogger('aiChatSettingsStorage');

/** index.html 的 CSP 脚本额外放行这个源（BF3-1）| The index.html CSP script also allows this origin (BF3-1) */
export const CSP_AI_ORIGIN_STORAGE_KEY = 'jieyu.csp.aiOrigin';

function httpOriginOf(baseUrl: string): string | null {
  try {
    const url = new URL(baseUrl);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

export async function persistAiChatSettings(
  settings: AiChatSettings,
  options?: { isStale?: () => boolean },
): Promise<void> {
  await activeAiChatKeyVault.persist(settings, options);
  if (typeof window === 'undefined' || options?.isStale?.()) return;
  const origin = httpOriginOf(settings.baseUrl);
  if (origin) window.localStorage.setItem(CSP_AI_ORIGIN_STORAGE_KEY, origin);
  else window.localStorage.removeItem(CSP_AI_ORIGIN_STORAGE_KEY);
}

export async function loadAiChatSettingsFromStorage(): Promise<AiChatSettings> {
  try {
    const loaded = await activeAiChatKeyVault.load();
    return loaded ?? normalizeAiChatSettings();
  } catch (err) {
    log.error('failed to load settings from storage, using defaults', { err });
    return normalizeAiChatSettings();
  }
}
