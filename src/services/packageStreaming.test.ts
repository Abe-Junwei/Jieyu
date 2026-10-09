/**
 * 大包流式处理（rev5 第 4b 批）：用合成的大数据集验证 JYM / JYB / 原始快照按 Blob 处理——整包从不
 * 整份读进内存、sha256 照常核对、上限已经放开到 512 MiB 以上。
 * Large-package streaming (rev5 batch 4b): a synthetic large dataset shows that JYM / JYB / raw
 * snapshots are handled as Blobs — the whole package is never read at once, sha256 is still verified
 * and the limits are raised above 512 MiB.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db';
import {
  exportRawIdbSnapshot,
  isRawIdbSnapshot,
  parseRawIdbSnapshot,
} from '../db/migration/rawRecoveryExport';
import {
  exportDatabaseToJybBlob,
  importJybProjectsAsNew,
  isJybPackage,
  JYB_PACKAGE_POLICY,
} from './JybService';
import { restoreJymAsNewProject } from './JymService';
import { sha256Hex, unzipWithGuard } from './projectArchiveContainer';
import {
  detectProjectPackageKind,
  exportProjectPackage,
  JYM_PACKAGE_POLICY,
} from './projectPackageService';
import { blobBytes, openZipBlob, zipToBlob } from './zipBlob';

vi.mock('../collaboration/cloud/projectCollaborationHistory', () => ({
  isProjectNeverCollaborated: () => true,
  listCollaboratedIds: () => [],
}));

const NOW = '2026-10-09T01:00:00.000Z';
const MiB = 1024 * 1024;
/** 4 条 12 MiB 的录音：48 MiB，CI 里几秒内跑完 | Four 12 MiB recordings: 48 MiB, seconds in CI */
const MEDIA_COUNT = 4;
const MEDIA_BYTES = 12 * MiB;

function recording(seed: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(MEDIA_BYTES);
  const words = new Uint32Array(out.buffer);
  for (let i = 0; i < words.length; i += 1) words[i] = Math.imul(i + 1, 2654435761) ^ seed;
  return out;
}

async function seedLargeProject(p: string): Promise<Map<string, string>> {
  const doc = `${p}-doc`;
  await db.texts.put({
    id: p,
    title: { default: `Large ${p}` },
    defaultDocumentId: doc,
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.annotation_documents.put({
    id: doc,
    textId: p,
    isDefault: true,
    createdAt: NOW,
    updatedAt: NOW,
  });
  const shas = new Map<string, string>();
  for (let i = 0; i < MEDIA_COUNT; i += 1) {
    const bytes = recording(i + 1);
    const sha = await sha256Hex(bytes);
    const id = `${p}-media-${i}`;
    shas.set(`${id}.wav`, sha);
    await db.media_items.put({
      id,
      textId: p,
      filename: `${id}.wav`,
      duration: 60,
      details: { audioBlob: new Blob([bytes], { type: 'audio/wav' }) },
      isOfflineCached: true,
      timelineKind: 'acoustic',
      byteLocation: 'managed',
      availability: 'available',
      contentSize: bytes.byteLength,
      contentSha256: sha,
      createdAt: NOW,
    });
  }
  return shas;
}

/** 记录每次 Blob#arrayBuffer 读了多少 | Record how much each Blob#arrayBuffer call reads */
function trackBlobReads(): { largest: () => number } {
  const original = Blob.prototype.arrayBuffer;
  const sizes: number[] = [];
  vi.spyOn(Blob.prototype, 'arrayBuffer').mockImplementation(function (this: Blob) {
    sizes.push(this.size);
    return original.call(this);
  });
  return { largest: () => Math.max(0, ...sizes) };
}

async function restoredShas(projectId: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const row of await db.media_items.where('textId').equals(projectId).toArray()) {
    const blob = row.details?.['audioBlob'] as Blob;
    expect(row.contentSha256).toBe(await sha256Hex(await blobBytes(blob)));
    out.set(row.filename ?? '', String(row.contentSha256));
  }
  return out;
}

describe('large packages are streamed as Blobs (4b)', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all(db.tables.map((table) => table.clear()));
  });
  afterEach(() => vi.restoreAllMocks());

  it('JYM: export and restore never read the whole package; sha256 still verified', async () => {
    const shas = await seedLargeProject('pBig');
    const reads = trackBlobReads();
    const archive = await exportProjectPackage('jym', 'pBig');
    expect(archive).toBeInstanceOf(Blob);
    expect(archive.size).toBeGreaterThan(MEDIA_COUNT * MEDIA_BYTES);
    const restored = await restoreJymAsNewProject(archive);
    // 最大的一次读取是一条录音（算哈希），不是整个包 | The largest read is one recording, not the package
    expect(reads.largest()).toBe(MEDIA_BYTES);
    vi.restoreAllMocks();
    expect(await restoredShas(restored.projectId)).toEqual(shas);
  });

  it('JYM: a flipped byte inside a recording is rejected by sha256', async () => {
    await seedLargeProject('pBig');
    const archive = await exportProjectPackage('jym', 'pBig');
    const zip = await openZipBlob(archive);
    const media = zip.entries.find((entry) => entry.name.startsWith('media/'))!;
    const bytes = await blobBytes(archive);
    const at = media.headerOffset + 30 + media.name.length + 1000;
    bytes[at] = bytes[at]! ^ 0xff;
    await expect(restoreJymAsNewProject(bytes)).rejects.toThrow(/sha256 mismatch/);
  });

  it('JYB: whole-library export is a Blob and imports back with the same bytes', async () => {
    const shas = await seedLargeProject('pBig');
    const reads = trackBlobReads();
    const archive = await exportDatabaseToJybBlob({ includeMedia: true });
    const result = await importJybProjectsAsNew(archive);
    expect(reads.largest()).toBeLessThanOrEqual(MEDIA_BYTES);
    vi.restoreAllMocks();
    const projectId = result.projects[0]!.projectId;
    expect(await restoredShas(projectId)).toEqual(shas);
  });

  it('raw snapshot: Blob values are referenced on export and sliced on parse', async () => {
    await seedLargeProject('pBig');
    db.close();
    const reads = trackBlobReads();
    const result = await exportRawIdbSnapshot({ dbName: 'jieyu' });
    expect(result.blob.size).toBeGreaterThan(MEDIA_COUNT * MEDIA_BYTES);
    const parsed = await parseRawIdbSnapshot(result.blob, JYB_PACKAGE_POLICY);
    expect(reads.largest()).toBeLessThanOrEqual(MEDIA_BYTES);
    vi.restoreAllMocks();
    const media = parsed.stores.find((store) => store.schema.name === 'media_items')!;
    expect(media.values).toHaveLength(MEDIA_COUNT);
    const first = media.values[0] as { details: { audioBlob: Blob }; contentSha256: string };
    expect(await sha256Hex(await blobBytes(first.details.audioBlob))).toBe(first.contentSha256);
  });

  it('limits are raised above the old 512 MiB (entry 1 GiB, package < 4 GiB)', async () => {
    expect(JYM_PACKAGE_POLICY.maxEntryBytes).toBe(1024 * MiB);
    expect(JYM_PACKAGE_POLICY.maxArchiveBytes).toBeGreaterThan(512 * MiB);
    expect(JYM_PACKAGE_POLICY.maxArchiveBytes).toBeLessThan(4096 * MiB);
    // 中央目录声明两条 600 MiB 的条目：旧上限会拒绝，现在通过检查（不读条目本身）
    // The central directory declares two 600 MiB entries: rejected before, accepted now (unread)
    const zip = await blobBytes(
      await zipToBlob([
        { name: 'a.bin', data: new Uint8Array(1) },
        { name: 'b.bin', data: new Uint8Array(1) },
      ]),
    );
    const view = new DataView(zip.buffer);
    let p = view.getUint32(zip.length - 22 + 16, true);
    for (let i = 0; i < 2; i += 1) {
      view.setUint32(p + 20, 600 * MiB, true);
      view.setUint32(p + 24, 600 * MiB, true);
      p += 46 + 5;
    }
    const files = await unzipWithGuard(zip, JYM_PACKAGE_POLICY);
    expect(files.size('a.bin')).toBe(600 * MiB);
    await expect(files.read('a.bin')).rejects.toThrow(/failed to unzip/);
    await expect(
      unzipWithGuard(zip, { ...JYM_PACKAGE_POLICY, maxExpandedBytes: 512 * MiB }),
    ).rejects.toThrow(/total expanded size exceeds limit/);
  });

  it('REV5-N7: telling package kinds apart reads only the directory and mimetype', async () => {
    await seedLargeProject('pBig');
    const jym = await exportProjectPackage('jym', 'pBig');
    const jyb = await exportDatabaseToJybBlob({ includeMedia: true });
    const reads = trackBlobReads();
    expect(await isRawIdbSnapshot(jyb)).toBe(false);
    expect(await isJybPackage(jyb)).toBe(true);
    expect(await isJybPackage(jym)).toBe(false);
    expect(await detectProjectPackageKind(jym)).toBe('jym');
    expect(reads.largest()).toBeLessThan(128 * 1024);
  });

  it('REV5-N6: a raw snapshot whose header declares a huge entry is refused before reading', async () => {
    const zip = await blobBytes(
      await zipToBlob([
        { name: 'manifest.json', data: new TextEncoder().encode('{"kind":"raw-idb"}') },
        { name: 'stores/000.ndjson', data: new Uint8Array(1) },
      ]),
    );
    const view = new DataView(zip.buffer);
    const central = view.getUint32(zip.length - 22 + 16, true);
    const second = central + 46 + 'manifest.json'.length;
    view.setUint32(second + 20, 2048 * MiB, true);
    view.setUint32(second + 24, 2048 * MiB, true);
    const reads = trackBlobReads();
    await expect(parseRawIdbSnapshot(zip, JYB_PACKAGE_POLICY)).rejects.toThrow(
      /exceeds size limit/,
    );
    expect(reads.largest()).toBeLessThan(128 * 1024);
    vi.restoreAllMocks();
    // manifest 自己声明很大时，识别直接返回 false | A huge declared manifest is simply "not raw"
    view.setUint32(central + 24, 512 * MiB, true);
    expect(await isRawIdbSnapshot(zip)).toBe(false);
  });
});
