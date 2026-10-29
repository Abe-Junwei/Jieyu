/** Reject a zip before inflate. Data-descriptor entries are refused. */
const MAX_ENTRIES = 4096;
const MAX_UNCOMPRESSED = 64 * 1024 * 1024;
const LOCAL = 0x04034b50;

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
}
