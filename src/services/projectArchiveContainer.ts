/**
 * 解语归档容器的公共部分：zip 上限、JSON 上限、口令加密。JYM 与 JYT 共用（rev5 7.4-1、7.4-8）。
 * Shared container layer of Jieyu archives: zip limits, JSON limits and password encryption, used by
 * both JYM and JYT (rev5 7.4-1, 7.4-8).
 */
import { strToU8, unzipSync } from 'fflate';

/** Web Crypto typings expect `ArrayBuffer`-backed views; copy into a dedicated `ArrayBuffer`. */
function webCryptoBufferSource(bytes: Uint8Array): BufferSource {
  const buffer = new ArrayBuffer(bytes.byteLength);
  const out = new Uint8Array(buffer);
  out.set(bytes);
  return out;
}

export interface JieyuArchiveEncryptionMetadata {
  mode: 'aes-256-gcm';
  kdf: 'PBKDF2-SHA-256';
  iterations: number;
  saltBase64: string;
  ivBase64: string;
  passwordHint?: string;
}

export interface JieyuArchiveEncryptionOptions {
  password: string;
  passwordHint?: string;
}

export interface JieyuArchiveImportPolicy {
  maxArchiveBytes: number;
  maxEntryCount: number;
  maxEntryBytes: number;
  maxExpandedBytes: number;
  maxJsonDepth: number;
  maxJsonNodes: number;
}

const DEFAULT_IMPORT_POLICY: JieyuArchiveImportPolicy = {
  maxArchiveBytes: 80 * 1024 * 1024,
  maxEntryCount: 256,
  maxEntryBytes: 32 * 1024 * 1024,
  maxExpandedBytes: 96 * 1024 * 1024,
  maxJsonDepth: 64,
  maxJsonNodes: 500_000,
};

const ARCHIVE_ENCRYPTION_ITERATIONS = 250_000;

export function toText(u8: Uint8Array): string {
  return new TextDecoder().decode(u8);
}

export function toJsonBytes(value: unknown): Uint8Array {
  return strToU8(JSON.stringify(value, null, 2));
}

export function normalizeImportPolicy(
  policy?: Partial<JieyuArchiveImportPolicy>,
): JieyuArchiveImportPolicy {
  if (!policy) return DEFAULT_IMPORT_POLICY;
  return {
    ...DEFAULT_IMPORT_POLICY,
    ...policy,
  };
}

function getWebCrypto(): Crypto {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle) {
    throw new Error('Archive encryption requires Web Crypto support in the current runtime');
  }
  return cryptoApi;
}

function encodeBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }

  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(value, 'base64'));
  }

  const binary = atob(value);
  const output = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    output[i] = binary.charCodeAt(i);
  }
  return output;
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  getWebCrypto().getRandomValues(bytes);
  return bytes;
}

async function deriveArchiveKey(
  password: string,
  salt: Uint8Array,
  usage: KeyUsage,
): Promise<CryptoKey> {
  const cryptoApi = getWebCrypto();
  const baseKey = await cryptoApi.subtle.importKey(
    'raw',
    webCryptoBufferSource(new TextEncoder().encode(password)),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return cryptoApi.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: webCryptoBufferSource(salt),
      iterations: ARCHIVE_ENCRYPTION_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    [usage],
  );
}

export async function encryptArchiveSnapshot(
  payloadBytes: Uint8Array,
  options: JieyuArchiveEncryptionOptions,
): Promise<{ encryptedBytes: Uint8Array; metadata: JieyuArchiveEncryptionMetadata }> {
  const password = options.password.trim();
  if (!password) {
    throw new Error('Archive encryption password must not be empty');
  }

  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveArchiveKey(password, salt, 'encrypt');
  const encrypted = await getWebCrypto().subtle.encrypt(
    { name: 'AES-GCM', iv: webCryptoBufferSource(iv) },
    key,
    webCryptoBufferSource(payloadBytes),
  );

  return {
    encryptedBytes: new Uint8Array(encrypted),
    metadata: {
      mode: 'aes-256-gcm',
      kdf: 'PBKDF2-SHA-256',
      iterations: ARCHIVE_ENCRYPTION_ITERATIONS,
      saltBase64: encodeBase64(salt),
      ivBase64: encodeBase64(iv),
      ...(options.passwordHint?.trim() ? { passwordHint: options.passwordHint.trim() } : {}),
    },
  };
}

export async function decryptArchiveSnapshot(
  payloadBytes: Uint8Array,
  encryption: JieyuArchiveEncryptionMetadata,
  password: string | undefined,
): Promise<Uint8Array> {
  const normalizedPassword = password?.trim();
  if (!normalizedPassword) {
    throw new Error('Encrypted Jieyu archive password required');
  }

  try {
    const salt = decodeBase64(encryption.saltBase64);
    const iv = decodeBase64(encryption.ivBase64);
    const key = await deriveArchiveKey(normalizedPassword, salt, 'decrypt');
    const decrypted = await getWebCrypto().subtle.decrypt(
      { name: 'AES-GCM', iv: webCryptoBufferSource(iv) },
      key,
      webCryptoBufferSource(payloadBytes),
    );
    return new Uint8Array(decrypted);
  } catch {
    throw new Error('Failed to decrypt Jieyu archive. Check the password and try again.');
  }
}

function validateJsonStructure(
  value: unknown,
  policy: JieyuArchiveImportPolicy,
  label: string,
): void {
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 1 }];
  let objectNodes = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const { value: node, depth } = current;

    if (depth > policy.maxJsonDepth) {
      throw new Error(
        `Invalid Jieyu archive: ${label} JSON depth exceeds limit (${policy.maxJsonDepth})`,
      );
    }
    if (node === null || typeof node !== 'object') continue;

    objectNodes += 1;
    if (objectNodes > policy.maxJsonNodes) {
      throw new Error(
        `Invalid Jieyu archive: ${label} JSON node count exceeds limit (${policy.maxJsonNodes})`,
      );
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        stack.push({ value: item, depth: depth + 1 });
      }
      continue;
    }

    for (const key of Object.keys(node)) {
      const record = node as Record<string, unknown>;
      stack.push({ value: record[key], depth: depth + 1 });
    }
  }
}

export function parseJsonWithGuard<T>(
  raw: Uint8Array,
  policy: JieyuArchiveImportPolicy,
  label: string,
): T {
  try {
    const parsed = JSON.parse(toText(raw)) as T;
    validateJsonStructure(parsed, policy, label);
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Invalid Jieyu archive:')) {
      throw error;
    }
    throw new Error(`Invalid Jieyu archive: failed to parse ${label} JSON`);
  }
}

export function unzipWithGuard(
  archiveBytes: Uint8Array,
  policy: JieyuArchiveImportPolicy,
  /** 每个条目名都报一次（重复条目在解压结果里会被覆盖，只能在这里发现）| Called per entry name (duplicates are only visible here) */
  onEntry?: (name: string) => void,
): Record<string, Uint8Array> {
  if (archiveBytes.byteLength > policy.maxArchiveBytes) {
    throw new Error(
      `Invalid Jieyu archive: archive size exceeds limit (${policy.maxArchiveBytes} bytes)`,
    );
  }

  let entryCount = 0;
  let plannedExpandedBytes = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(archiveBytes, {
      filter(file) {
        entryCount += 1;
        onEntry?.(file.name);
        if (entryCount > policy.maxEntryCount) {
          throw new Error(
            `Invalid Jieyu archive: entry count exceeds limit (${policy.maxEntryCount})`,
          );
        }

        if (!Number.isFinite(file.originalSize) || file.originalSize < 0) {
          throw new Error(
            `Invalid Jieyu archive: entry "${file.name}" has invalid original size metadata`,
          );
        }

        if (file.originalSize > policy.maxEntryBytes) {
          throw new Error(
            `Invalid Jieyu archive: entry "${file.name}" exceeds size limit (${policy.maxEntryBytes} bytes)`,
          );
        }

        plannedExpandedBytes += file.originalSize;
        if (plannedExpandedBytes > policy.maxExpandedBytes) {
          throw new Error(
            `Invalid Jieyu archive: total expanded size exceeds limit (${policy.maxExpandedBytes} bytes)`,
          );
        }

        return true;
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Invalid Jieyu archive:')) {
      throw error;
    }
    throw new Error('Invalid Jieyu archive: failed to unzip archive payload');
  }

  const names = Object.keys(files);
  if (names.length > policy.maxEntryCount || entryCount > policy.maxEntryCount) {
    throw new Error(`Invalid Jieyu archive: entry count exceeds limit (${policy.maxEntryCount})`);
  }

  let actualExpandedBytes = 0;
  for (const name of names) {
    const bytes = files[name];
    if (!bytes) continue;

    if (bytes.byteLength > policy.maxEntryBytes) {
      throw new Error(
        `Invalid Jieyu archive: entry "${name}" exceeds size limit (${policy.maxEntryBytes} bytes)`,
      );
    }

    actualExpandedBytes += bytes.byteLength;
    if (actualExpandedBytes > policy.maxExpandedBytes) {
      throw new Error(
        `Invalid Jieyu archive: total expanded size exceeds limit (${policy.maxExpandedBytes} bytes)`,
      );
    }
  }

  return files;
}

/** 字节的 sha256（小写十六进制）| sha256 of bytes (lowercase hex) */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await getWebCrypto().subtle.digest('SHA-256', webCryptoBufferSource(bytes));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** 只读出 mimetype 条目（用来分派 JYM / JYT）| Read only the mimetype entry (to dispatch JYM / JYT) */
export function readArchiveMimetype(
  archiveBytes: Uint8Array,
  policy: JieyuArchiveImportPolicy,
): string | null {
  if (archiveBytes.byteLength > policy.maxArchiveBytes) return null;
  try {
    const files = unzipSync(archiveBytes, {
      filter: (file) => file.name === 'mimetype' && file.originalSize <= 256,
    });
    const raw = files['mimetype'];
    return raw ? toText(raw).trim() : null;
  } catch {
    return null;
  }
}
