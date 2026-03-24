import { normalizeAiChatSettings, type AiChatSettings } from '../providers/providerCatalog';

const AI_CHAT_SETTINGS_STORAGE_KEY = 'jieyu.aiChat.settings';
const AI_CHAT_SETTINGS_SECURE_STORAGE_KEY = 'jieyu.aiChat.settings.secure';
const AI_CHAT_SETTINGS_SECURE_VERSION = 'v1';

interface AiChatSecureEnvelopeV1 {
  v: 'v1';
  salt: string;
  iv: string;
  cipher: string;
}

function byteArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToByteArray(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function byteArrayToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const { buffer, byteOffset, byteLength } = bytes;
  return buffer.slice(byteOffset, byteOffset + byteLength) as ArrayBuffer;
}

async function deriveAiSettingsCryptoKey(salt: Uint8Array): Promise<CryptoKey> {
  const passphrase = `${window.location.origin}|jieyu.aiChat.settings`;
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: byteArrayToArrayBuffer(salt),
      // v1: 120k iterations (OWASP 2023 minimum for SHA-256)
      // 如需提升迭代次数，记得提升 secure version 触发重加密 | Bump secure version when increasing iterations
      iterations: 120_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptAiChatSettings(rawSettings: AiChatSettings): Promise<string> {
  const payload = JSON.stringify(rawSettings);
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAiSettingsCryptoKey(salt);
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(payload),
  );

  const envelope: AiChatSecureEnvelopeV1 = {
    v: AI_CHAT_SETTINGS_SECURE_VERSION,
    salt: byteArrayToBase64(salt),
    iv: byteArrayToBase64(iv),
    cipher: byteArrayToBase64(new Uint8Array(encrypted)),
  };

  return JSON.stringify(envelope);
}

async function decryptAiChatSettings(rawSecurePayload: string): Promise<AiChatSettings | null> {
  try {
    const parsed = JSON.parse(rawSecurePayload) as Partial<AiChatSecureEnvelopeV1>;
    if (parsed.v !== AI_CHAT_SETTINGS_SECURE_VERSION || !parsed.salt || !parsed.iv || !parsed.cipher) {
      return null;
    }

    const salt = base64ToByteArray(parsed.salt);
    const iv = base64ToByteArray(parsed.iv);
    const cipher = base64ToByteArray(parsed.cipher);
    const key = await deriveAiSettingsCryptoKey(salt);
    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: byteArrayToArrayBuffer(iv) },
      key,
      byteArrayToArrayBuffer(cipher),
    );
    const text = new TextDecoder().decode(decrypted);
    return normalizeAiChatSettings(JSON.parse(text) as Partial<AiChatSettings>);
  } catch {
    return null;
  }
}

export async function persistAiChatSettings(settings: AiChatSettings): Promise<void> {
  if (typeof window === 'undefined') return;
  const canUseCrypto = !!window.crypto?.subtle;
  if (!canUseCrypto) {
    window.localStorage.setItem(AI_CHAT_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    return;
  }

  const encryptedPayload = await encryptAiChatSettings(settings);
  window.localStorage.setItem(AI_CHAT_SETTINGS_SECURE_STORAGE_KEY, encryptedPayload);
  window.localStorage.removeItem(AI_CHAT_SETTINGS_STORAGE_KEY);
}

export async function loadAiChatSettingsFromStorage(): Promise<AiChatSettings> {
  if (typeof window === 'undefined') return normalizeAiChatSettings();

  try {
    const secureRaw = window.localStorage.getItem(AI_CHAT_SETTINGS_SECURE_STORAGE_KEY);
    if (secureRaw && window.crypto?.subtle) {
      const decrypted = await decryptAiChatSettings(secureRaw);
      if (decrypted) {
        return decrypted;
      }
    }

    const legacyRaw = window.localStorage.getItem(AI_CHAT_SETTINGS_STORAGE_KEY);
    if (legacyRaw) {
      const normalized = normalizeAiChatSettings(JSON.parse(legacyRaw) as Partial<AiChatSettings>);
      try {
        await persistAiChatSettings(normalized);
      } catch {
        // Keep legacy fallback when secure write is unavailable.
      }
      return normalized;
    }
  } catch {
    // 读取失败时返回默认配置 | Fall back to defaults if storage payload is invalid
  }

  return normalizeAiChatSettings();
}
