import { normalizeAiChatSettings, type AiChatSettings } from '../providers/providerCatalog';
import { browserAiChatKeyVault, type KeyVaultBackend } from './keyVault';
import { createLogger } from '../../observability/logger';

let activeAiChatKeyVault: KeyVaultBackend<AiChatSettings> = browserAiChatKeyVault;
const log = createLogger('aiChatSettingsStorage');

export function configureAiChatSettingsKeyVault(vault: KeyVaultBackend<AiChatSettings>): void {
  activeAiChatKeyVault = vault;
}

export async function persistAiChatSettings(settings: AiChatSettings, options?: { isStale?: () => boolean }): Promise<void> {
  await activeAiChatKeyVault.persist(settings, options);
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
