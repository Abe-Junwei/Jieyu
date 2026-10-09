/**
 * Blob ZIP 读写：与 fflate 互通、分块 CRC、零拷贝切片、损坏与 ZIP64 拒绝（4b 流式处理）。
 * Blob ZIP: fflate interop, chunked CRC, zero-copy slices, corrupt / ZIP64 rejection (4b streaming).
 */
import { crc32 as zlibCrc32 } from 'node:zlib';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { blobBytes, openZipBlob, zipToBlob } from './zipBlob';

function pattern(size: number, seed: number): Uint8Array {
  const out = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) out[i] = (i * 31 + seed) & 0xff;
  return out;
}

describe('zipBlob', () => {
  it('writes ZIPs fflate reads, with UTF-8 names, deflate and stored Blob entries', async () => {
    const audio = pattern(300_000, 7);
    const zip = await zipToBlob([
      { name: 'mimetype', data: strToU8('application/x-test') },
      { name: 'data/项目.json', data: strToU8('{"a":"é"}'.repeat(100)), deflate: true },
      { name: 'media/a.bin', data: new Blob([audio as Uint8Array<ArrayBuffer>]) },
    ]);
    const files = unzipSync(await blobBytes(zip));
    expect(strFromU8(files['mimetype']!)).toBe('application/x-test');
    expect(strFromU8(files['data/项目.json']!)).toBe('{"a":"é"}'.repeat(100));
    expect(files['media/a.bin']).toEqual(audio);
  });

  it('reads ZIPs fflate writes and slices stored entries without reading them', async () => {
    const audio = pattern(200_000, 3);
    const archive = zipSync({
      'media/x.bin': [audio, { level: 0 }],
      'data/é.json': strToU8('{"x":1}'.repeat(50)),
    });
    const source = new Blob([archive as Uint8Array<ArrayBuffer>]);
    const zip = await openZipBlob(source);
    const byName = new Map(zip.entries.map((entry) => [entry.name, entry]));
    expect(strFromU8(await zip.read(byName.get('data/é.json')!))).toBe('{"x":1}'.repeat(50));
    const slice = await zip.blob(byName.get('media/x.bin')!);
    expect(slice.size).toBe(audio.length);
    expect(await blobBytes(slice)).toEqual(audio);
  });

  it('computes the CRC of large Blobs in chunks (matches zlib)', async () => {
    const big = pattern(20 * 1024 * 1024 + 123, 11);
    const zip = await zipToBlob([
      { name: 'big.bin', data: new Blob([big as Uint8Array<ArrayBuffer>]) },
    ]);
    const header = new DataView(await await zip.slice(0, 30).arrayBuffer());
    expect(header.getUint32(14, true)).toBe(zlibCrc32(big));
    expect(zip.size).toBe(30 + 'big.bin'.length + big.length + 46 + 'big.bin'.length + 22);
  });

  it('rejects non-ZIPs, ZIP64 markers and entries larger than declared', async () => {
    await expect(openZipBlob(new Blob(['not a zip']))).rejects.toThrow(/end of central directory/);

    const zip = await blobBytes(
      await zipToBlob([{ name: 'a.json', data: strToU8('x'.repeat(1000)), deflate: true }]),
    );
    const eocd = zip.length - 22;
    const centralOffset = new DataView(zip.buffer).getUint32(eocd + 16, true);
    const zip64 = zip.slice();
    new DataView(zip64.buffer).setUint32(centralOffset + 24, 0xffffffff, true);
    await expect(openZipBlob(new Blob([zip64]))).rejects.toThrow(/ZIP64/);

    const lying = zip.slice();
    new DataView(lying.buffer).setUint32(centralOffset + 24, 10, true);
    const reader = await openZipBlob(new Blob([lying]));
    await expect(reader.read(reader.entries[0]!)).rejects.toThrow(/size mismatch/);
  });
});
