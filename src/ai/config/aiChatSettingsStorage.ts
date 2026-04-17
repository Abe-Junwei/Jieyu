import { normalizeAiChatSettings, type AiChatSettings } from '../providers/providerCatalog';
import { browserAiChatKeyVault, type KeyVaultBackend } from './keyVault';

let activeAiChatKeyVault: KeyVaultBackend<AiChatSettings> = browserAiChatKeyVault;

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
    console.error('[Jieyu] aiChatSettingsStorage: failed to load settings from storage, using defaults', err);
    return normalizeAiChatSettings();
  }
}
