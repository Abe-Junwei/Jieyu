/**
 * 计算 Blob 的 sha256（小写十六进制）。必须在 IndexedDB 事务之外调用（rev5 §4.2-3）。
 * Compute a Blob's sha256 (lowercase hex). Call outside IndexedDB transactions (rev5 §4.2-3).
 * 运行环境没有 WebCrypto 时返回 undefined | Returns undefined when WebCrypto is unavailable.
 */
export async function computeBlobSha256(blob: Blob): Promise<string | undefined> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle === undefined) return undefined;
  const raw = await readBlobBytes(blob);
  // 复制到本 realm 的缓冲区：jsdom 等环境下 FileReader 给的 ArrayBuffer 可能来自另一个 realm
  // Copy into a buffer of this realm: FileReader may hand back a foreign-realm ArrayBuffer (e.g. jsdom)
  const bytes = new Uint8Array(raw.byteLength);
  bytes.set(new Uint8Array(raw));
  const digest = await subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function readBlobBytes(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsArrayBuffer(blob);
  });
}
