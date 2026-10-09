/**
 * 原始快照 → JYB 转换器（rev5 8.2，T41）：原始导出不变、升到当前版本、逐项目导入、失败时原始快照
 * 不变、临时库删除。
 * Raw snapshot → JYB converter (rev5 8.2, T41): the raw export is untouched, upgraded to the current
 * version, importable per project; on failure the raw snapshot is unchanged and the temp DB removed.
 */
import 'fake-indexeddb/auto';
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db';
import { exportRawIdbSnapshot, isRawIdbSnapshot } from '../db/migration/rawRecoveryExport';
import { JIEYU_SCHEMA_VERSIONS, type JieyuSchemaVersion } from '../db/migration/schemaVersions';
import { exportDatabaseToJyb, importJybProjectsAsNew, previewJybRestore } from './JybService';
import { sha256Hex } from './projectArchiveContainer';
import { convertRawSnapshotToJyb, RawSnapshotConversionError } from './rawSnapshotConverter';

vi.mock('../collaboration/cloud/projectCollaborationHistory', () => ({
  isProjectNeverCollaborated: () => true,
}));

const NOW = '2026-10-09T01:00:00.000Z';
const AUDIO = 'RIFF-field-audio-bytes';
const IMAGE = 'png-attachment-bytes';

async function blobText(blob: unknown): Promise<string> {
  expect(blob).toBeInstanceOf(Blob);
  return strFromU8(new Uint8Array(await (blob as Blob).arrayBuffer()));
}

async function putMedia(p: string, id: string, audio: string | null): Promise<void> {
  const blob = audio === null ? null : new Blob([audio], { type: 'audio/wav' });
  await db.media_items.put({
    id,
    textId: p,
    filename: `${id}.wav`,
    duration: 2,
    ...(blob ? { details: { audioBlob: blob } } : {}),
    isOfflineCached: blob !== null,
    timelineKind: 'acoustic',
    byteLocation: blob ? 'managed' : 'none',
    availability: blob ? 'available' : 'missing',
    ...(blob ? { contentSize: blob.size, contentSha256: await sha256Hex(strToU8(audio!)) } : {}),
    createdAt: NOW,
  });
}

async function seedProject(p: string): Promise<void> {
  const doc = `${p}-doc`;
  const layer = `${p}-layer`;
  await db.texts.put({
    id: p,
    title: { default: `Project ${p}` },
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
  await db.tier_definitions.put({
    id: layer,
    textId: p,
    documentId: doc,
    key: `bridge_trc_${p}`,
    name: { default: 'Transcription' },
    tierType: 'time-aligned',
    contentType: 'transcription',
    languageId: 'user:demo',
    createdAt: NOW,
    updatedAt: NOW,
  } as never);
  await putMedia(p, `${p}-media`, AUDIO);
  await db.layer_units.put({
    id: `${p}-unit`,
    textId: p,
    mediaId: `${p}-media`,
    layerId: layer,
    unitType: 'unit',
    startTime: 0,
    endTime: 1,
    createdAt: NOW,
    updatedAt: NOW,
  } as never);
  await db.lexeme_assets.put({
    id: `${p}-asset`,
    textId: p,
    kind: 'image',
    mimeType: 'image/png',
    displayName: 'photo.png',
    byteSize: IMAGE.length,
    refCount: 1,
    blob: new Blob([IMAGE], { type: 'image/png' }),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

async function clearAll(): Promise<void> {
  await db.open();
  await Promise.all(db.tables.map((table) => table.clear()));
}

async function rawExport(): Promise<Uint8Array> {
  const result = await exportRawIdbSnapshot({ dbName: 'jieyu', reason: 'migration-blocked' });
  return result.bytes;
}

async function databaseNames(): Promise<string[]> {
  return (await indexedDB.databases()).map((info) => info.name ?? '');
}

async function conversionErrorOf(run: () => Promise<unknown>): Promise<RawSnapshotConversionError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof RawSnapshotConversionError) return error;
    throw error;
  }
  throw new Error('expected a conversion error');
}

function rewriteManifest(raw: Uint8Array, patch: Record<string, unknown>): Uint8Array {
  const files = unzipSync(raw);
  const manifest = JSON.parse(strFromU8(files['manifest.json']!)) as Record<string, unknown>;
  const out: Zippable = {};
  for (const [name, data] of Object.entries(files)) out[name] = data;
  out['manifest.json'] = strToU8(JSON.stringify({ ...manifest, ...patch }));
  return zipSync(out);
}

beforeEach(async () => {
  await clearAll();
  await seedProject('pA');
});

describe('T41: raw snapshot → JYB converter', () => {
  it('converts a raw export (with bytes) into a JYB that imports per project; raw bytes untouched', async () => {
    const raw = await rawExport();
    const before = raw.slice();
    const manifest = JSON.parse(strFromU8(unzipSync(raw)['manifest.json']!)) as {
      kind: string;
      nativeVersion: number;
      binaryFileCount: number;
    };
    expect(manifest).toMatchObject({ kind: 'raw-idb', nativeVersion: 10 });
    expect(manifest.binaryFileCount).toBeGreaterThanOrEqual(2);
    expect(isRawIdbSnapshot(raw)).toBe(true);

    const result = await convertRawSnapshotToJyb(raw);
    expect(result.source).toMatchObject({ dbName: 'jieyu', nativeVersion: 10, dexieVersion: 1 });
    expect(result.upgradedToVersion).toBe(1);
    expect(raw).toEqual(before);
    expect(isRawIdbSnapshot(result.jyb)).toBe(false);
    expect((await databaseNames()).filter((name) => name.startsWith('jieyu-raw-convert-'))).toEqual(
      [],
    );

    // 本机清空后按逐项目模式导入 | Per-project import into an emptied device
    await clearAll();
    const preview = await previewJybRestore(result.jyb);
    expect(preview.projects.map((p) => p.id)).toEqual(['pA']);
    const imported = await importJybProjectsAsNew(result.jyb, { projectIds: ['pA'] });
    const newId = imported.projects[0]!.projectId;
    expect(newId).not.toBe('pA');
    const media = await db.media_items.where('textId').equals(newId).toArray();
    expect(media).toHaveLength(1);
    expect(await blobText(media[0]!.details?.['audioBlob'])).toBe(AUDIO);
    const assets = (await db.lexeme_assets.toArray()).filter((a) => a.textId === newId);
    expect(await blobText(assets[0]!.blob)).toBe(IMAGE);
    expect(await db.layer_units.where('textId').equals(newId).count()).toBe(1);
  });

  it('runs the ledger upgraders up to the current version', async () => {
    const raw = await rawExport();
    const versions: JieyuSchemaVersion[] = [
      ...JIEYU_SCHEMA_VERSIONS,
      {
        version: 2,
        stores: {},
        tier: 'rewriting',
        upgrade: (tx) =>
          tx
            .table('texts')
            .toCollection()
            .modify((text: { title: Record<string, string> }) => {
              text.title = { default: `${text.title.default} (v2)` };
            }),
      },
    ];
    const result = await convertRawSnapshotToJyb(raw, { versions });
    expect(result.upgradedToVersion).toBe(2);
    const preview = await previewJybRestore(result.jyb);
    expect(preview.projects[0]!.title).toEqual({ default: 'Project pA (v2)' });
  });

  it('a failing upgrade leaves the raw snapshot and the main DB unchanged and removes the temp DB', async () => {
    const raw = await rawExport();
    const before = raw.slice();
    const versions: JieyuSchemaVersion[] = [
      ...JIEYU_SCHEMA_VERSIONS,
      {
        version: 2,
        stores: {},
        tier: 'rewriting',
        upgrade: () => {
          throw new Error('synthetic upgrader failure');
        },
      },
    ];
    const error = await conversionErrorOf(() =>
      convertRawSnapshotToJyb(raw, { versions, tempDbName: 'jieyu-raw-convert-fail' }),
    );
    expect(error.reason).toBe('upgrade-failed');
    expect(raw).toEqual(before);
    expect(await databaseNames()).not.toContain('jieyu-raw-convert-fail');
    expect((await db.texts.get('pA'))?.title).toEqual({ default: 'Project pA' });
  });

  it('refuses snapshots newer than the app, of another database, or not raw at all', async () => {
    const raw = await rawExport();
    const newer = rewriteManifest(raw, { nativeVersion: 990, dexieVersion: 99 });
    expect((await conversionErrorOf(() => convertRawSnapshotToJyb(newer))).reason).toBe(
      'newer-than-app',
    );
    const other = rewriteManifest(raw, { dbName: 'jieyudb_v2' });
    expect((await conversionErrorOf(() => convertRawSnapshotToJyb(other))).reason).toBe(
      'other-database',
    );
    const jyb = await exportDatabaseToJyb({ includeMedia: false });
    expect((await conversionErrorOf(() => convertRawSnapshotToJyb(jyb))).reason).toBe(
      'not-raw-snapshot',
    );
  });
});
