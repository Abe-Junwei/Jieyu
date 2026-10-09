/**
 * IndexedDB 值的规范化编码（快照校验与原始恢复导出共用）。
 * Canonical encoding of IndexedDB values (shared by snapshot verification and the raw recovery export).
 *
 * 结构化克隆能存而 JSON 不能表达的类型用带 `$` 标签的对象表示：undefined、非有限数、Date、
 * 二进制（ArrayBuffer / TypedArray / DataView）、Blob / File、Map、Set。对象键按字典序排列，
 * 同一值总得到同一字符串。
 * Structured-clone-only types become `$`-tagged objects; object keys are sorted, so equal values
 * always produce the same string.
 */

export type BinaryEncoder = (
  bytes: Uint8Array,
  meta: { kind: 'blob' | 'bytes'; type?: string; name?: string; ctor?: string },
) => unknown;

const BASE64_CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer());
  // 旧环境回退 | fallback for environments without Blob#arrayBuffer
  return new Uint8Array(await new Response(blob).arrayBuffer());
}

/** 内联 base64 的二进制编码器 | Inline base64 binary encoder */
export const inlineBinaryEncoder: BinaryEncoder = (bytes, meta) =>
  meta.kind === 'blob'
    ? {
        $blob: bytesToBase64(bytes),
        type: meta.type ?? '',
        ...(meta.name !== undefined ? { name: meta.name } : {}),
      }
    : { $bytes: bytesToBase64(bytes), ctor: meta.ctor ?? 'Uint8Array' };

/** 把值转成可 JSON 化的标签树 | Convert a value into a JSON-safe tagged tree */
export async function toTaggedTree(
  value: unknown,
  encodeBinary: BinaryEncoder = inlineBinaryEncoder,
): Promise<unknown> {
  if (value === null) return null;
  if (value === undefined) return { $undef: 1 };
  if (typeof value === 'number') return Number.isFinite(value) ? value : { $num: String(value) };
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return { $bigint: value.toString() };
  if (value instanceof Date)
    return { $date: Number.isNaN(value.getTime()) ? 'Invalid' : value.toISOString() };
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    const name = typeof File !== 'undefined' && value instanceof File ? value.name : undefined;
    return encodeBinary(await blobBytes(value), {
      kind: 'blob',
      type: value.type,
      ...(name !== undefined ? { name } : {}),
    });
  }
  if (value instanceof ArrayBuffer)
    return encodeBinary(new Uint8Array(value), { kind: 'bytes', ctor: 'ArrayBuffer' });
  if (ArrayBuffer.isView(value)) {
    const view = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return encodeBinary(new Uint8Array(view), { kind: 'bytes', ctor: value.constructor.name });
  }
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const item of value) out.push(await toTaggedTree(item, encodeBinary));
    return out;
  }
  if (value instanceof Map) {
    const entries: unknown[] = [];
    for (const [k, v] of value)
      entries.push([await toTaggedTree(k, encodeBinary), await toTaggedTree(v, encodeBinary)]);
    return { $map: entries };
  }
  if (value instanceof Set) {
    const items: unknown[] = [];
    for (const item of value) items.push(await toTaggedTree(item, encodeBinary));
    return { $set: items };
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    const keys = Object.keys(value as Record<string, unknown>).sort();
    for (const key of keys) {
      out[key] = await toTaggedTree((value as Record<string, unknown>)[key], encodeBinary);
    }
    // 用户对象自己带 `$` 开头的键时整体转义，避免与标签混淆 | escape objects whose own keys look like tags
    return keys.some((key) => key.startsWith('$')) ? { $obj: out } : out;
  }
  return { $unsupported: typeof value };
}

/** 规范化 JSON 字符串 | Canonical JSON string */
export async function toCanonicalJson(value: unknown): Promise<string> {
  return JSON.stringify(await toTaggedTree(value));
}

/** 规范化编码的 sha256（十六进制）| sha256 (hex) of the canonical encoding */
export async function canonicalSha256(value: unknown): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle === undefined) throw new Error('WebCrypto subtle digest is unavailable');
  const digest = await subtle.digest(
    'SHA-256',
    new TextEncoder().encode(await toCanonicalJson(value)),
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export type BinaryDecoder = (tag: Record<string, unknown>) => unknown;

const TYPED_ARRAY_CTORS: Record<string, (buffer: ArrayBuffer) => unknown> = {
  ArrayBuffer: (buffer) => buffer,
  Uint8Array: (b) => new Uint8Array(b),
  Int8Array: (b) => new Int8Array(b),
  Uint8ClampedArray: (b) => new Uint8ClampedArray(b),
  Uint16Array: (b) => new Uint16Array(b),
  Int16Array: (b) => new Int16Array(b),
  Uint32Array: (b) => new Uint32Array(b),
  Int32Array: (b) => new Int32Array(b),
  Float32Array: (b) => new Float32Array(b),
  Float64Array: (b) => new Float64Array(b),
  DataView: (b) => new DataView(b),
};

/** 由字节和元数据还原二进制值 | Rebuild a binary value from bytes + meta */
export function rebuildBinary(bytes: Uint8Array, tag: Record<string, unknown>): unknown {
  if ('$blob' in tag || tag.kind === 'blob') {
    const type = typeof tag.type === 'string' ? tag.type : '';
    const part = bytes as unknown as BlobPart;
    if (typeof tag.name === 'string' && typeof File !== 'undefined')
      return new File([part], tag.name, { type });
    return new Blob([part], { type });
  }
  const ctor = typeof tag.ctor === 'string' ? tag.ctor : 'Uint8Array';
  const copy = bytes.slice().buffer;
  return (TYPED_ARRAY_CTORS[ctor] ?? TYPED_ARRAY_CTORS.Uint8Array!)(copy);
}

const inlineBinaryDecoder: BinaryDecoder = (tag) => {
  const base64 = typeof tag.$blob === 'string' ? tag.$blob : String(tag.$bytes ?? '');
  return rebuildBinary(base64ToBytes(base64), tag);
};

/** 标签树 → 原值 | Tagged tree → value */
export function fromTaggedTree(
  tree: unknown,
  decodeBinary: BinaryDecoder = inlineBinaryDecoder,
): unknown {
  if (tree === null || typeof tree !== 'object') return tree;
  if (Array.isArray(tree)) return tree.map((item) => fromTaggedTree(item, decodeBinary));
  const tag = tree as Record<string, unknown>;
  if ('$obj' in tag && tag.$obj !== null && typeof tag.$obj === 'object') {
    const escaped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(tag.$obj as Record<string, unknown>)) {
      escaped[key] = fromTaggedTree(value, decodeBinary);
    }
    return escaped;
  }
  if ('$undef' in tag) return undefined;
  if ('$num' in tag) return Number(tag.$num);
  if ('$bigint' in tag) return BigInt(String(tag.$bigint));
  if ('$date' in tag) return new Date(tag.$date === 'Invalid' ? Number.NaN : String(tag.$date));
  if ('$blob' in tag || '$bytes' in tag || '$file' in tag) return decodeBinary(tag);
  if ('$map' in tag && Array.isArray(tag.$map)) {
    return new Map(
      (tag.$map as unknown[][]).map(
        ([k, v]) => [fromTaggedTree(k, decodeBinary), fromTaggedTree(v, decodeBinary)] as const,
      ),
    );
  }
  if ('$set' in tag && Array.isArray(tag.$set))
    return new Set((tag.$set as unknown[]).map((item) => fromTaggedTree(item, decodeBinary)));
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(tag)) out[key] = fromTaggedTree(value, decodeBinary);
  return out;
}
