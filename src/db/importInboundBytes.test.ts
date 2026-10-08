/**
 * rev5 第 1 批 T7–T9：入站行不带字节时，只能保留本机字节或整体中止（N2）。
 * rev5 Batch 1 T7–T9: inbound rows without bytes either keep local bytes or abort (N2).
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ImportConflictStrategy } from './types';
import { db } from './engine';
import { exportDatabaseAsJson, exportRecoveryDatabaseAsJson, importDatabaseFromJson } from './io';
import { InboundByteConflictError } from './ioInboundBytePreservation';
import {
  exportProjectScopedDatabaseAsJson,
  importProjectScopedDatabaseFromJson,
} from './projectScopedSnapshot';

const NOW = '2026-10-08T12:00:00.000Z';
const TEXT_ID = 'text-bytes';
const MEDIA_ID = 'media-bytes';
const ASSET_ID = 'asset-bytes';
const AUDIO = 'RIFF-audio-bytes-0123456789';
const IMAGE = 'png-bytes-abcdef';

type Snapshot = Awaited<ReturnType<typeof exportDatabaseAsJson>>;

async function seedProjectWithBytes(): Promise<void> {
  await db.texts.put({ id: TEXT_ID, title: { default: 'Bytes' }, createdAt: NOW, updatedAt: NOW });
  await db.media_items.put({
    id: MEDIA_ID,
    textId: TEXT_ID,
    filename: 'field.wav',
    duration: 3,
    details: { audioBlob: new Blob([AUDIO], { type: 'audio/wav' }) },
    isOfflineCached: true,
    timelineKind: 'acoustic',
    byteLocation: 'managed',
    availability: 'available',
    contentSize: AUDIO.length,
    createdAt: NOW,
  });
  await db.layer_units.put({
    id: 'unit-bytes',
    textId: TEXT_ID,
    mediaId: MEDIA_ID,
    startTime: 0,
    endTime: 1,
    createdAt: NOW,
    updatedAt: NOW,
  });
  const image = new Blob([IMAGE], { type: 'image/png' });
  await db.lexeme_assets.put({
    id: ASSET_ID,
    kind: 'image',
    mimeType: 'image/png',
    displayName: 'dog.png',
    byteSize: image.size,
    refCount: 1,
    blob: image,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

async function readBytes() {
  const media = await db.media_items.get(MEDIA_ID);
  const asset = await db.lexeme_assets.get(ASSET_ID);
  const details = (media?.details ?? {}) as Record<string, unknown>;
  const audio = details['audioBlob'];
  return {
    media,
    details,
    audioText: audio instanceof Blob ? await audio.text() : undefined,
    audioType: audio instanceof Blob ? audio.type : undefined,
    audioSize: audio instanceof Blob ? audio.size : undefined,
    asset,
    assetText: asset?.blob instanceof Blob ? await asset.blob.text() : undefined,
  };
}

/** 字节与元数据一致：有字节就没有省略标记，大小/类型与字节相符。 */
async function expectLocalBytesKeptAndConsistent(): Promise<void> {
  const state = await readBytes();
  expect(state.audioText).toBe(AUDIO);
  expect(state.audioType).toBe('audio/wav');
  expect(state.details['audioExportOmitted']).toBeUndefined();
  expect(state.details['audioExportOmittedByteSize']).toBeUndefined();
  expect(state.details['audioExportOmittedMimeType']).toBeUndefined();
  expect(state.media?.timelineKind).toBe('acoustic');
  expect(state.media?.byteLocation).toBe('managed');
  expect(state.media?.availability).toBe('available');
  expect(state.media?.contentSize).toBe(state.audioSize);
  expect(state.assetText).toBe(IMAGE);
  expect(state.asset?.byteSize).toBe(state.asset?.blob?.size);
  expect(state.asset?.blobExportOmitted).toBeUndefined();
}

async function dumpTables() {
  const strip = (rows: Array<Record<string, unknown>>) =>
    rows.map((row) =>
      JSON.stringify(row, (_k, v) => (v instanceof Blob ? `blob:${v.size}:${v.type}` : v)),
    );
  return {
    texts: strip((await db.texts.toArray()) as never),
    media: strip((await db.media_items.toArray()) as never),
    units: strip((await db.layer_units.toArray()) as never),
    assets: strip((await db.lexeme_assets.toArray()) as never),
  };
}

function mediaRow(snapshot: Snapshot): Record<string, unknown> {
  const row = (snapshot.collections['media_items'] as Array<Record<string, unknown>>).find(
    (r) => r['id'] === MEDIA_ID,
  );
  if (!row) throw new Error('media row missing from snapshot');
  return row;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('inbound bytes: preserve or abort (N2)', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all(db.tables.map((table) => table.clear()));
    await seedProjectWithBytes();
  });

  it('export marks omitted bytes with their size and type', async () => {
    const snapshot = await exportDatabaseAsJson();
    const details = mediaRow(snapshot)['details'] as Record<string, unknown>;
    expect(details['audioBlob']).toBeUndefined();
    expect(details['audioExportOmitted']).toBe(true);
    expect(details['audioExportOmittedByteSize']).toBe(new Blob([AUDIO]).size);
    expect(details['audioExportOmittedMimeType']).toBe('audio/wav');
    const asset = (snapshot.collections['lexeme_assets'] as Array<Record<string, unknown>>)[0]!;
    expect(asset['blob']).toBeUndefined();
    expect(asset['blobExportOmitted']).toBe(true);
  });

  // T8 矩阵：三种策略 × media 与 lexeme_assets
  for (const strategy of ['upsert', 'replace-all', 'skip-existing'] as ImportConflictStrategy[]) {
    it(`T8 ${strategy}: rows without bytes keep local media and attachment bytes`, async () => {
      const snapshot = clone(await exportDatabaseAsJson());
      (snapshot.collections['texts'] as Array<Record<string, unknown>>)[0]!['title'] = {
        default: 'Bytes (imported)',
      };

      await importDatabaseFromJson(snapshot, { strategy });

      await expectLocalBytesKeptAndConsistent();
      const text = await db.texts.get(TEXT_ID);
      expect(text?.title).toEqual(
        strategy === 'skip-existing' ? { default: 'Bytes' } : { default: 'Bytes (imported)' },
      );
    });
  }

  for (const strategy of ['upsert', 'replace-all'] as ImportConflictStrategy[]) {
    it(`T8 ${strategy}: local bytes that differ from the omitted ones abort the whole import`, async () => {
      const snapshot = clone(await exportDatabaseAsJson());
      (snapshot.collections['texts'] as Array<Record<string, unknown>>)[0]!['title'] = {
        default: 'should not land',
      };
      // 导出之后本机换了一段不同长度的音频（同一 id）| Local audio replaced after export
      const media = await db.media_items.get(MEDIA_ID);
      const newerBlob = new Blob(['newer-audio'], { type: 'audio/wav' });
      const { contentSha256: _staleSha, ...mediaWithoutSha } = media!;
      await db.media_items.put({
        ...mediaWithoutSha,
        contentSize: newerBlob.size,
        details: { ...media!.details, audioBlob: newerBlob },
      });
      const before = await dumpTables();

      await expect(importDatabaseFromJson(snapshot, { strategy })).rejects.toBeInstanceOf(
        InboundByteConflictError,
      );
      expect(await dumpTables()).toEqual(before);
    });

    it(`T8 ${strategy}: attachment size mismatch aborts and leaves the database unchanged`, async () => {
      const snapshot = clone(await exportDatabaseAsJson());
      (snapshot.collections['lexeme_assets'] as Array<Record<string, unknown>>)[0]!['byteSize'] =
        999;
      const before = await dumpTables();

      const error = await importDatabaseFromJson(snapshot, { strategy }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(InboundByteConflictError);
      expect((error as InboundByteConflictError).conflicts).toEqual([
        { collection: 'lexeme_assets', id: ASSET_ID, reason: 'size-mismatch' },
      ]);
      expect(await dumpTables()).toEqual(before);
    });
  }

  it('T8: an inbound row of another project with the same id aborts', async () => {
    const snapshot = clone(await exportDatabaseAsJson());
    mediaRow(snapshot)['textId'] = 'text-other';
    (snapshot.collections['texts'] as Array<Record<string, unknown>>).push({
      id: 'text-other',
      title: { default: 'Other' },
      createdAt: NOW,
      updatedAt: NOW,
    });
    const before = await dumpTables();

    const error = await importDatabaseFromJson(snapshot, { strategy: 'upsert' }).catch(
      (e: unknown) => e,
    );
    expect((error as InboundByteConflictError).conflicts).toEqual([
      { collection: 'media_items', id: MEDIA_ID, reason: 'project-mismatch' },
    ]);
    expect(await dumpTables()).toEqual(before);
  });

  it('T8: an explicit placeholder arriving over local bytes aborts instead of dropping them', async () => {
    const snapshot = clone(await exportDatabaseAsJson());
    mediaRow(snapshot)['details'] = {};
    mediaRow(snapshot)['timelineKind'] = 'placeholder';
    mediaRow(snapshot)['byteLocation'] = 'none';
    mediaRow(snapshot)['availability'] = 'missing';
    delete mediaRow(snapshot)['contentSize'];
    mediaRow(snapshot)['filename'] = 'document-placeholder.track';
    const before = await dumpTables();

    await expect(importDatabaseFromJson(snapshot, { strategy: 'upsert' })).rejects.toBeInstanceOf(
      InboundByteConflictError,
    );
    expect(await dumpTables()).toEqual(before);
  });

  it('T8: a row without bytes and without an omission marker still keeps local bytes', async () => {
    const snapshot = clone(await exportDatabaseAsJson());
    mediaRow(snapshot)['details'] = {};
    const asset = (snapshot.collections['lexeme_assets'] as Array<Record<string, unknown>>)[0]!;
    delete asset['blobExportOmitted'];

    await importDatabaseFromJson(snapshot, { strategy: 'upsert' });

    await expectLocalBytesKeptAndConsistent();
  });

  it('T8: an omitted row with no local counterpart is written as missing with its marker kept', async () => {
    const snapshot = clone(await exportDatabaseAsJson());
    await Promise.all(db.tables.map((table) => table.clear()));

    await importDatabaseFromJson(snapshot, { strategy: 'upsert' });

    const state = await readBytes();
    expect(state.audioText).toBeUndefined();
    expect(state.details['audioExportOmitted']).toBe(true);
    // 本机没有：写成 none + missing（rev5 §4.2-7）| No local copy: none + missing
    expect(state.media?.timelineKind).toBe('acoustic');
    expect(state.media?.byteLocation).toBe('none');
    expect(state.media?.availability).toBe('missing');
    expect(state.assetText).toBeUndefined();
    expect(state.asset?.blobExportOmitted).toBe(true);
  });

  it('T8: bytes explicitly included in the snapshot replace local bytes', async () => {
    const snapshot = clone(await exportDatabaseAsJson());
    // 2A 删除了 `audioDataUrl` 回灌；“带字节”的行以内存 Blob 表示（第 3 批的新格式会打包媒体）
    // 2A removed `audioDataUrl` rehydration; included bytes are an in-memory Blob (batch 3 packages media)
    mediaRow(snapshot)['details'] = {
      audioBlob: new Blob(['included-audio'], { type: 'audio/wav' }),
    };

    await importDatabaseFromJson(snapshot, { strategy: 'upsert' });

    const state = await readBytes();
    expect(state.audioText).toBe('included-audio');
    expect(state.media?.byteLocation).toBe('managed');
    expect(state.media?.contentSize).toBe('included-audio'.length);
  });

  it('T7: applying a recovery snapshot keeps local audio', async () => {
    const recovery = await exportRecoveryDatabaseAsJson();

    // 与 useTranscriptionRecoveryActions 相同的调用 | Same call as the recovery action
    await importDatabaseFromJson(recovery, { strategy: 'upsert' });

    const state = await readBytes();
    expect(state.audioText).toBe(AUDIO);
    expect(state.details['audioExportOmitted']).toBeUndefined();
  });

  it('T9: collaboration restore (prune then write) keeps local audio and restores units', async () => {
    const snapshot = await exportProjectScopedDatabaseAsJson(TEXT_ID);
    await db.layer_units.put({
      id: 'unit-local-stale',
      textId: TEXT_ID,
      mediaId: MEDIA_ID,
      startTime: 2,
      endTime: 3,
      createdAt: NOW,
      updatedAt: NOW,
    });

    await importProjectScopedDatabaseFromJson(snapshot, TEXT_ID);

    const state = await readBytes();
    expect(state.audioText).toBe(AUDIO);
    expect(state.details['audioExportOmitted']).toBeUndefined();
    expect(await db.layer_units.get('unit-bytes')).toBeDefined();
    expect(await db.layer_units.get('unit-local-stale')).toBeUndefined();
  });

  it('T9: a failing collaboration restore rolls back the prune as well', async () => {
    const snapshot = clone(await exportProjectScopedDatabaseAsJson(TEXT_ID));
    const row = (snapshot.collections['media_items'] as Array<Record<string, unknown>>)[0]!;
    (row['details'] as Record<string, unknown>)['audioExportOmittedByteSize'] = 1;
    const before = await dumpTables();

    await expect(importProjectScopedDatabaseFromJson(snapshot, TEXT_ID)).rejects.toBeInstanceOf(
      InboundByteConflictError,
    );
    expect(await dumpTables()).toEqual(before);
  });
});
