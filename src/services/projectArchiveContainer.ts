/**
 * 解语归档容器的公共部分：zip 上限、JSON 上限、口令加密。JYM 与 JYT 共用（rev5 7.4-1、7.4-8）。
 * Shared container layer of Jieyu archives: zip limits, JSON limits and password encryption, used by
 * both JYM and JYT (rev5 7.4-1, 7.4-8).
 */
import { strToU8 } from 'fflate';
import { bytesBlob, openZipBlob, type ZipBlobEntryInfo, type ZipBlobReader } from './zipBlob';

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

/**
 * 一次派生密钥、可加密多个条目的加密器（JYM 的字节文件也加密）。数据文件用 metadata 里的 IV；
 * 每个字节文件用新的随机 IV，写在密文前 12 字节。
 * Encryptor that derives the key once and encrypts several entries (JYM byte files are encrypted
 * too). The data file uses the IV in the metadata; each byte file gets a fresh random IV stored as
 * the first 12 bytes of its ciphertext.
 */
export interface ArchiveEncryptor {
  metadata: JieyuArchiveEncryptionMetadata;
  encryptData(bytes: Uint8Array): Promise<Uint8Array>;
  encryptFile(bytes: Uint8Array): Promise<Uint8Array>;
}

export interface ArchiveDecryptor {
  decryptData(bytes: Uint8Array): Promise<Uint8Array>;
  decryptFile(bytes: Uint8Array): Promise<Uint8Array>;
}

const FILE_IV_BYTES = 12;

export async function createArchiveEncryptor(
  options: JieyuArchiveEncryptionOptions,
): Promise<ArchiveEncryptor> {
  const password = options.password.trim();
  if (!password) {
    throw new Error('Archive encryption password must not be empty');
  }
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveArchiveKey(password, salt, 'encrypt');
  const subtle = getWebCrypto().subtle;
  return {
    metadata: {
      mode: 'aes-256-gcm',
      kdf: 'PBKDF2-SHA-256',
      iterations: ARCHIVE_ENCRYPTION_ITERATIONS,
      saltBase64: encodeBase64(salt),
      ivBase64: encodeBase64(iv),
      ...(options.passwordHint?.trim() ? { passwordHint: options.passwordHint.trim() } : {}),
    },
    async encryptData(bytes) {
      const out = await subtle.encrypt(
        { name: 'AES-GCM', iv: webCryptoBufferSource(iv) },
        key,
        webCryptoBufferSource(bytes),
      );
      return new Uint8Array(out);
    },
    async encryptFile(bytes) {
      const fileIv = randomBytes(FILE_IV_BYTES);
      const out = new Uint8Array(
        await subtle.encrypt(
          { name: 'AES-GCM', iv: webCryptoBufferSource(fileIv) },
          key,
          webCryptoBufferSource(bytes),
        ),
      );
      const combined = new Uint8Array(FILE_IV_BYTES + out.byteLength);
      combined.set(fileIv, 0);
      combined.set(out, FILE_IV_BYTES);
      return combined;
    },
  };
}

export async function createArchiveDecryptor(
  encryption: JieyuArchiveEncryptionMetadata,
  password: string | undefined,
): Promise<ArchiveDecryptor> {
  const normalizedPassword = password?.trim();
  if (!normalizedPassword) {
    throw new Error('Encrypted Jieyu archive password required');
  }
  const failed = () =>
    new Error('Failed to decrypt Jieyu archive. Check the password and try again.');
  let key: CryptoKey;
  let iv: Uint8Array;
  try {
    iv = decodeBase64(encryption.ivBase64);
    key = await deriveArchiveKey(
      normalizedPassword,
      decodeBase64(encryption.saltBase64),
      'decrypt',
    );
  } catch {
    throw failed();
  }
  const subtle = getWebCrypto().subtle;
  const decrypt = async (ivBytes: Uint8Array, payload: Uint8Array) => {
    try {
      return new Uint8Array(
        await subtle.decrypt(
          { name: 'AES-GCM', iv: webCryptoBufferSource(ivBytes) },
          key,
          webCryptoBufferSource(payload),
        ),
      );
    } catch {
      throw failed();
    }
  };
  return {
    decryptData: (bytes) => decrypt(iv, bytes),
    decryptFile: (bytes) => {
      if (bytes.byteLength < FILE_IV_BYTES) return Promise.reject(failed());
      return decrypt(bytes.subarray(0, FILE_IV_BYTES), bytes.subarray(FILE_IV_BYTES));
    },
  };
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

/** 包的来源：文件（Blob / File）或内存字节 | Package source: a file (Blob / File) or bytes in memory */
export type ArchiveSource = Uint8Array | Blob;

export function archiveSourceBlob(source: ArchiveSource): Blob {
  return source instanceof Blob ? source : bytesBlob(source);
}

/**
 * 已过上限检查的包：条目按需读取，整个包不进内存（4b 流式处理）。
 * A package that passed the limit checks; entries are read on demand, never the whole package.
 */
export interface GuardedArchive {
  /** 去重后的条目名 | Entry names, deduplicated */
  names: readonly string[];
  has(name: string): boolean;
  /** 声明的原始大小 | Declared original size */
  size(name: string): number | undefined;
  read(name: string): Promise<Uint8Array | undefined>;
  /** 不压缩的条目是零拷贝切片 | Stored entries are zero-copy slices */
  blob(name: string): Promise<Blob | undefined>;
}

const UNZIP_FAILED = 'Invalid Jieyu archive: failed to unzip archive payload';

async function guardZipRead<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch {
    throw new Error(UNZIP_FAILED);
  }
}

export async function unzipWithGuard(
  source: ArchiveSource,
  policy: JieyuArchiveImportPolicy,
  /** 每个条目名都报一次（重复条目只能在这里发现）| Called per entry name (duplicates are only visible here) */
  onEntry?: (name: string) => void,
): Promise<GuardedArchive> {
  const blob = archiveSourceBlob(source);
  if (blob.size > policy.maxArchiveBytes) {
    throw new Error(
      `Invalid Jieyu archive: archive size exceeds limit (${policy.maxArchiveBytes} bytes)`,
    );
  }
  const zip: ZipBlobReader = await guardZipRead(() => openZipBlob(blob));
  const byName = new Map<string, ZipBlobEntryInfo>();
  let expandedBytes = 0;
  for (const [index, entry] of zip.entries.entries()) {
    onEntry?.(entry.name);
    if (index + 1 > policy.maxEntryCount) {
      throw new Error(`Invalid Jieyu archive: entry count exceeds limit (${policy.maxEntryCount})`);
    }
    if (entry.size > policy.maxEntryBytes) {
      throw new Error(
        `Invalid Jieyu archive: entry "${entry.name}" exceeds size limit (${policy.maxEntryBytes} bytes)`,
      );
    }
    expandedBytes += entry.size;
    if (expandedBytes > policy.maxExpandedBytes) {
      throw new Error(
        `Invalid Jieyu archive: total expanded size exceeds limit (${policy.maxExpandedBytes} bytes)`,
      );
    }
    // 重名时后一个生效（与此前的解压结果一致）| Later duplicates win (as before)
    byName.set(entry.name, entry);
  }
  return {
    names: [...byName.keys()],
    has: (name) => byName.has(name),
    size: (name) => byName.get(name)?.size,
    async read(name) {
      const entry = byName.get(name);
      return entry ? guardZipRead(() => zip.read(entry)) : undefined;
    },
    async blob(name) {
      const entry = byName.get(name);
      return entry ? guardZipRead(() => zip.blob(entry)) : undefined;
    },
  };
}

/** 字节的 sha256（小写十六进制）| sha256 of bytes (lowercase hex) */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await getWebCrypto().subtle.digest('SHA-256', webCryptoBufferSource(bytes));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** 只读出 mimetype 条目（用来分派 JYM / JYT）| Read only the mimetype entry (to dispatch JYM / JYT) */
export async function readArchiveMimetype(
  source: ArchiveSource,
  policy: JieyuArchiveImportPolicy,
): Promise<string | null> {
  const blob = archiveSourceBlob(source);
  if (blob.size > policy.maxArchiveBytes) return null;
  try {
    const zip = await openZipBlob(blob);
    const entry = zip.entries.find((item) => item.name === 'mimetype' && item.size <= 256);
    return entry ? toText(await zip.read(entry)).trim() : null;
  } catch {
    return null;
  }
}
