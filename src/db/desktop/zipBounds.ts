/** Reject a zip before inflate. Data-descriptor entries are refused. */
const MAX_ENTRIES = 4096;
const MAX_UNCOMPRESSED = 64 * 1024 * 1024;
const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const EOCD = 0x06054b50;

export function assertZipBounded(bytes: Uint8Array): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  let entries = 0;
  let total = 0;
  while (offset + 30 <= bytes.byteLength) {
    if (view.getUint32(offset, true) !== LOCAL) break;
    const flags = view.getUint16(offset + 6, true);
    const compressed = view.getUint32(offset + 18, true);
    const uncompressed = view.getUint32(offset + 22, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    if ((flags & 0x08) !== 0 || compressed === 0xffffffff || uncompressed === 0xffffffff) {
      throw new Error('desktop package is unreadable');
    }
    entries += 1;
    total += uncompressed;
    if (entries > MAX_ENTRIES || total > MAX_UNCOMPRESSED) {
      throw new Error('desktop package is unreadable');
    }
    offset += 30 + nameLength + extraLength + compressed;
    if (offset > bytes.byteLength) throw new Error('desktop package is unreadable');
  }
  // Local uncompressed size can be zeroed while the central directory keeps the real size.
  assertCentralBounded(view, bytes.byteLength);
}

function assertCentralBounded(view: DataView, length: number): void {
  let eocd = -1;
  const start = Math.max(0, length - 22 - 65535);
  for (let index = length - 22; index >= start; index -= 1) {
    if (view.getUint32(index, true) === EOCD) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) throw new Error('desktop package is unreadable');
  const count = view.getUint16(eocd + 10, true);
  const size = view.getUint32(eocd + 12, true);
  const offset = view.getUint32(eocd + 16, true);
  if (count > MAX_ENTRIES || offset > length || size > length - offset) {
    throw new Error('desktop package is unreadable');
  }
  let cursor = offset;
  let total = 0;
  for (let seen = 0; seen < count; seen += 1) {
    if (cursor + 46 > length || view.getUint32(cursor, true) !== CENTRAL) {
      throw new Error('desktop package is unreadable');
    }
    const uncompressed = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    if (uncompressed === 0xffffffff) throw new Error('desktop package is unreadable');
    total += uncompressed;
    if (total > MAX_UNCOMPRESSED) throw new Error('desktop package is unreadable');
    cursor += 46 + nameLength + extraLength + commentLength;
    if (cursor > length) throw new Error('desktop package is unreadable');
  }
}
