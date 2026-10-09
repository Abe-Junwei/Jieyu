/**
 * 基于 Blob 的 ZIP 读写（rev5 第 4b 批：大包流式处理）。
 * Blob-based ZIP writing and reading (rev5 batch 4b: streaming large packages).
 *
 * 写：字节条目直接引用原来的 Blob（不复制、不进 JS 内存），只有 CRC 要分块读一遍；JSON 等小条目
 * 用 fflate 压缩。读：只读末尾的中央目录，条目按需读取；不压缩的条目可以直接切出 Blob。
 * fflate 的流式 `Zip` 会让每个字节都经过 JS 数据块，这里用不上，所以手写这一小段格式代码。
 * 不写也不读 ZIP64：单个包不超过 4 GiB。
 *
 * Write: byte entries reference the original Blob (no copy, never in JS memory); only the CRC reads
 * it once in chunks. Small entries (JSON) are deflated with fflate. Read: only the central directory
 * at the end is read; entries are read on demand, and stored entries can be sliced as Blobs.
 * fflate's streaming `Zip` passes every byte through JS chunks, hence this small format code.
 * No ZIP64 either way: a package stays under 4 GiB.
 */
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';

/** ZIP32 的大小 / 偏移上限 | ZIP32 size / offset limit */
export const ZIP32_MAX_BYTES = 0xffffffff;

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const END_SIG = 0x06054b50;
const UTF8_FLAG = 0x0800;
/** 1980-01-01，条目时间不重要 | 1980-01-01; entry times do not matter */
const DOS_DATE = 0x21;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(crc: number, chunk: Uint8Array): number {
  let c = ~crc;
  for (let i = 0; i < chunk.length; i += 1) c = CRC_TABLE[(c ^ chunk[i]!) & 0xff]! ^ (c >>> 8);
  return ~c >>> 0;
}

/** 分块读（8 MiB 一块），整个 Blob 不进内存 | Read in 8 MiB chunks, never the whole Blob */
const CHUNK_BYTES = 8 * 1024 * 1024;

async function blobCrc32(blob: Blob): Promise<number> {
  let crc = 0;
  for (let offset = 0; offset < blob.size; offset += CHUNK_BYTES) {
    crc = crc32(crc, await blobBytes(blob.slice(offset, offset + CHUNK_BYTES)));
  }
  return crc;
}

export async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * 字节 → Blob。视图先复制成独立的缓冲区：有的 Blob 实现（jsdom）会忽略视图的偏移。
 * Bytes → Blob. Views are copied into their own buffer first: some Blob implementations (jsdom)
 * ignore a view's offset.
 */
export function bytesBlob(bytes: Uint8Array, type = ''): Blob {
  const exact =
    bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes : bytes.slice();
  return new Blob([exact as Uint8Array<ArrayBuffer>], { type });
}

export interface ZipBlobEntry {
  name: string;
  /** Blob 条目原样存储（不压缩）| Blob entries are stored as-is (no compression) */
  data: Uint8Array | Blob;
  /** 只对 Uint8Array：用 deflate 压缩 | Uint8Array only: deflate it */
  deflate?: boolean;
}

/**
 * 把条目打成一个 ZIP Blob。超过 ZIP32 上限时抛错。
 * Build a ZIP Blob from the entries. Throws past the ZIP32 limit.
 */
export async function zipToBlob(entries: readonly ZipBlobEntry[]): Promise<Blob> {
  if (entries.length > 0xffff) throw new Error('ZIP: too many entries');
  const parts: BlobPart[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = strToU8(entry.name);
    let body: Uint8Array | Blob = entry.data;
    let crc: number;
    let size: number;
    let method = 0;
    // 用 Blob 判断：Uint8Array 可能来自别的 realm（jsdom）| Test for Blob: Uint8Arrays may be cross-realm
    if (entry.data instanceof Blob) {
      crc = await blobCrc32(entry.data);
      size = entry.data.size;
    } else {
      crc = crc32(0, entry.data);
      size = entry.data.byteLength;
      if (entry.deflate === true) {
        body = deflateSync(entry.data);
        method = 8;
      }
    }
    const stored = body instanceof Blob ? body.size : body.byteLength;
    if (size > ZIP32_MAX_BYTES || stored > ZIP32_MAX_BYTES || offset > ZIP32_MAX_BYTES) {
      throw new Error('ZIP: the package exceeds 4 GiB');
    }
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, LOCAL_SIG, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, UTF8_FLAG, true);
    lv.setUint16(8, method, true);
    lv.setUint16(12, DOS_DATE, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, stored, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);

    const head = new Uint8Array(46 + name.length);
    const cv = new DataView(head.buffer);
    cv.setUint32(0, CENTRAL_SIG, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, UTF8_FLAG, true);
    cv.setUint16(10, method, true);
    cv.setUint16(14, DOS_DATE, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, stored, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    head.set(name, 46);
    central.push(head);

    parts.push(local as Uint8Array<ArrayBuffer>, body instanceof Blob ? body : bytesBlob(body));
    offset += local.length + stored;
  }
  const centralSize = central.reduce((sum, item) => sum + item.length, 0);
  if (offset + centralSize > ZIP32_MAX_BYTES) throw new Error('ZIP: the package exceeds 4 GiB');
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, END_SIG, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  return new Blob([...parts, ...(central as Uint8Array<ArrayBuffer>[]), end], {
    type: 'application/zip',
  });
}

export interface ZipBlobEntryInfo {
  name: string;
  /** 0 = 不压缩，8 = deflate | 0 = stored, 8 = deflate */
  method: number;
  compressedSize: number;
  /** 中央目录声明的原始大小 | Original size declared by the central directory */
  size: number;
  headerOffset: number;
}

export interface ZipBlobReader {
  /** 中央目录里的条目（按出现顺序，可能有重名）| Central-directory entries, in order (names may repeat) */
  entries: ZipBlobEntryInfo[];
  /** 读出并解压一个条目；大小与声明不符就抛错 | Read and inflate one entry; throws on a size mismatch */
  read(entry: ZipBlobEntryInfo): Promise<Uint8Array>;
  /** 不压缩的条目直接切片（不读字节）| Stored entries are sliced without reading bytes */
  blob(entry: ZipBlobEntryInfo): Promise<Blob>;
}

/**
 * 只读中央目录打开一个 ZIP Blob；不是 ZIP、ZIP64 或加密条目时抛错。
 * Open a ZIP Blob by its central directory; throws for non-ZIP, ZIP64 or encrypted entries.
 */
export async function openZipBlob(source: Blob): Promise<ZipBlobReader> {
  const tailStart = Math.max(0, source.size - (22 + 0xffff));
  const tail = await blobBytes(source.slice(tailStart));
  let end = -1;
  for (let i = tail.length - 22; i >= 0; i -= 1) {
    if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('ZIP: end of central directory not found');
  const tv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  const count = tv.getUint16(end + 10, true);
  const centralSize = tv.getUint32(end + 12, true);
  const centralOffset = tv.getUint32(end + 16, true);
  if (count === 0xffff || centralOffset === ZIP32_MAX_BYTES)
    throw new Error('ZIP64 is not supported');
  if (centralOffset + centralSize > source.size)
    throw new Error('ZIP: central directory out of range');
  const central = await blobBytes(source.slice(centralOffset, centralOffset + centralSize));
  const cv = new DataView(central.buffer, central.byteOffset, central.byteLength);
  const entries: ZipBlobEntryInfo[] = [];
  let p = 0;
  for (let i = 0; i < count; i += 1) {
    if (p + 46 > central.length || cv.getUint32(p, true) !== CENTRAL_SIG) {
      throw new Error('ZIP: bad central directory');
    }
    const flags = cv.getUint16(p + 8, true);
    const nameLength = cv.getUint16(p + 28, true);
    const entry: ZipBlobEntryInfo = {
      name: strFromU8(central.subarray(p + 46, p + 46 + nameLength), (flags & UTF8_FLAG) === 0),
      method: cv.getUint16(p + 10, true),
      compressedSize: cv.getUint32(p + 20, true),
      size: cv.getUint32(p + 24, true),
      headerOffset: cv.getUint32(p + 42, true),
    };
    if ((flags & 1) !== 0) throw new Error(`ZIP: entry "${entry.name}" is encrypted`);
    if (
      entry.size === ZIP32_MAX_BYTES ||
      entry.compressedSize === ZIP32_MAX_BYTES ||
      entry.headerOffset === ZIP32_MAX_BYTES
    ) {
      throw new Error('ZIP64 is not supported');
    }
    entries.push(entry);
    p += 46 + nameLength + cv.getUint16(p + 30, true) + cv.getUint16(p + 32, true);
  }

  const dataRange = async (entry: ZipBlobEntryInfo): Promise<[number, number]> => {
    const header = await blobBytes(source.slice(entry.headerOffset, entry.headerOffset + 30));
    const hv = new DataView(header.buffer, header.byteOffset, header.byteLength);
    if (header.length < 30 || hv.getUint32(0, true) !== LOCAL_SIG) {
      throw new Error(`ZIP: bad local header for "${entry.name}"`);
    }
    const start = entry.headerOffset + 30 + hv.getUint16(26, true) + hv.getUint16(28, true);
    const stop = start + entry.compressedSize;
    if (stop > source.size) throw new Error(`ZIP: entry "${entry.name}" out of range`);
    return [start, stop];
  };
  const read = async (entry: ZipBlobEntryInfo): Promise<Uint8Array> => {
    const raw = await blobBytes(source.slice(...(await dataRange(entry))));
    let out: Uint8Array;
    if (entry.method === 0) out = raw;
    else if (entry.method === 8) {
      // 多给一个字节：超出声明大小就能发现，同时不会无限膨胀 | one spare byte detects overflow, bounded
      out = inflateSync(raw, { out: new Uint8Array(entry.size + 1) });
    } else throw new Error(`ZIP: entry "${entry.name}" uses unsupported method ${entry.method}`);
    if (out.length !== entry.size) throw new Error(`ZIP: size mismatch for "${entry.name}"`);
    return out;
  };
  return {
    entries,
    read,
    async blob(entry) {
      if (entry.method !== 0) return bytesBlob(await read(entry));
      if (entry.compressedSize !== entry.size)
        throw new Error(`ZIP: size mismatch for "${entry.name}"`);
      return source.slice(...(await dataRange(entry)));
    },
  };
}
