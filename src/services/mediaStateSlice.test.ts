/**
 * rev5 切片 2B-C：媒体状态字段（T6、T19、T20）。
 * rev5 slice 2B-C: media state fields (T6, T19, T20).
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import type { MediaItemDocType } from '../db';
import { exportDatabaseAsJson, importDatabaseFromJson } from '../db/io';
import { JieyuWriteValidationError } from '../db/writeValidationMiddleware';
import { computeBlobSha256 } from '../utils/blobSha256';
import { LinguisticService } from './LinguisticService';
import { MediaContentMismatchError } from './linguisticServiceMediaImport';
import { rememberImportedSourceFile, listProjectSourceFiles } from './projectFileOps';

const TEXT_ID = 'text_2bc';
const LAYER_ID = 'layer_trc_2bc';
const MEDIA_ID = 'media_2bc';
const NOW = '2026-10-08T12:00:00.000Z';
const AUDIO = 'RIFF-2bc-original-bytes';

function managedRow(overrides: Partial<MediaItemDocType> = {}): MediaItemDocType {
  const blob = new Blob([AUDIO], { type: 'audio/wav' });
  return {
    id: MEDIA_ID,
    textId: TEXT_ID,
    filename: 'elicitation-01.wav',
    duration: 12,
    details: { audioBlob: blob },
    isOfflineCached: true,
    createdAt: NOW,
    timelineKind: 'acoustic',
    byteLocation: 'managed',
    availability: 'available',
    contentSize: blob.size,
    ...overrides,
  };
}

async function seedProject(): Promise<void> {
  await db.texts.put({
    id: TEXT_ID,
    title: { default: '2B-C' },
    metadata: { timelineMode: 'media', logicalDurationSec: 12, timebaseLabel: 'logical-second' },
    createdAt: NOW,
    updatedAt: NOW,
  });
  await LinguisticService.layers.saveTranslation({
    id: LAYER_ID,
    textId: TEXT_ID,
    key: 'trc_2bc',
    name: { default: 'TRC' },
    layerType: 'transcription',
    languageId: 'und',
    modality: 'text',
    isDefault: true,
    sortOrder: 0,
    createdAt: NOW,
    updatedAt: NOW,
  });
  const blob = new Blob([AUDIO], { type: 'audio/wav' });
  const sha = await computeBlobSha256(blob);
  await db.media_items.put(managedRow({ details: { audioBlob: blob }, contentSha256: sha! }));
  await db.layer_units.put({
    id: 'seg_2bc_a',
    textId: TEXT_ID,
    mediaId: MEDIA_ID,
    layerId: LAYER_ID,
    unitType: 'segment',
    startTime: 1.25,
    endTime: 3.5,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  await seedProject();
});

describe('T6: media rows missing a state field are rejected on every write path', () => {
  const fields = ['timelineKind', 'byteLocation', 'availability'] as const;

  it.each(fields)('put / bulkPut without %s are rejected', async (field) => {
    const row = managedRow({ id: `media_missing_${field}` }) as unknown as Record<string, unknown>;
    delete row[field];
    await expect(db.media_items.put(row as unknown as MediaItemDocType)).rejects.toBeInstanceOf(
      JieyuWriteValidationError,
    );
    await expect(db.media_items.bulkPut([row as unknown as MediaItemDocType])).rejects.toThrow();
    expect(await db.media_items.get(`media_missing_${field}`)).toBeUndefined();
  });

  it.each(fields)('update / modify clearing %s are rejected and roll back', async (field) => {
    await expect(
      db.media_items.update(MEDIA_ID, { [field]: undefined } as Partial<MediaItemDocType>),
    ).rejects.toBeInstanceOf(JieyuWriteValidationError);
    await expect(
      db.media_items
        .where('id')
        .equals(MEDIA_ID)
        .modify((row) => {
          delete (row as unknown as Record<string, unknown>)[field];
        }),
    ).rejects.toThrow();
    const stored = await db.media_items.get(MEDIA_ID);
    expect(stored?.[field]).toBeDefined();
  });

  it('contradictory state is rejected (managed without bytes, placeholder with bytes)', async () => {
    await expect(
      db.media_items.put(managedRow({ id: 'media_bad_managed', details: {} })),
    ).rejects.toBeInstanceOf(JieyuWriteValidationError);
    await expect(
      db.media_items.put(
        managedRow({
          id: 'media_bad_placeholder',
          timelineKind: 'placeholder',
        }),
      ),
    ).rejects.toBeInstanceOf(JieyuWriteValidationError);
    await expect(
      db.media_items.put(
        managedRow({ id: 'media_bad_none', byteLocation: 'none', availability: 'available' }),
      ),
    ).rejects.toBeInstanceOf(JieyuWriteValidationError);
  });

  it.each(fields)('import of a row without %s is rejected and writes nothing', async (field) => {
    const snapshot = JSON.parse(JSON.stringify(await exportDatabaseAsJson())) as Awaited<
      ReturnType<typeof exportDatabaseAsJson>
    >;
    const rows = snapshot.collections['media_items'] as Array<Record<string, unknown>>;
    rows.push({ ...rows[0]!, id: 'media_import_missing' });
    delete rows[rows.length - 1]![field];
    await expect(importDatabaseFromJson(snapshot, { strategy: 'upsert' })).rejects.toThrow();
    expect(await db.media_items.get('media_import_missing')).toBeUndefined();
  });
});

describe('T19: deleting recording bytes keeps the row, its name and every relation', () => {
  it('becomes acoustic + none + missing; text, times and source links survive a reload', async () => {
    await rememberImportedSourceFile({
      textId: TEXT_ID,
      name: 'elicitation-01.eaf',
      format: 'eaf',
      mediaId: MEDIA_ID,
      linkedMediaFilename: 'elicitation-01.wav',
    });
    const before = await db.media_items.get(MEDIA_ID);

    await LinguisticService.cleanup.deleteAudio(MEDIA_ID);

    // “重载”：只从数据库重新读取 | "Reload": read everything back from the database
    const media = await db.media_items.get(MEDIA_ID);
    expect(media).toEqual(
      expect.objectContaining({
        id: MEDIA_ID,
        filename: 'elicitation-01.wav',
        timelineKind: 'acoustic',
        byteLocation: 'none',
        availability: 'missing',
        contentSize: before?.contentSize,
        contentSha256: before?.contentSha256,
        duration: 12,
      }),
    );
    expect((media?.details as Record<string, unknown>)['audioBlob']).toBeUndefined();
    await expect(db.layer_units.get('seg_2bc_a')).resolves.toEqual(
      expect.objectContaining({ mediaId: MEDIA_ID, startTime: 1.25, endTime: 3.5 }),
    );
    const sources = await listProjectSourceFiles(TEXT_ID);
    expect(sources).toEqual([expect.objectContaining({ mediaId: MEDIA_ID })]);
    const listed = await LinguisticService.media.listByTextId(TEXT_ID);
    expect(listed.map((row) => row.id)).toEqual([MEDIA_ID]);
  });
});

describe('T20: relinking a missing recording', () => {
  beforeEach(async () => {
    await LinguisticService.cleanup.deleteAudio(MEDIA_ID);
  });

  it('keeps the id, the name and unit times when the bytes match', async () => {
    const blob = new Blob([AUDIO], { type: 'audio/wav' });
    await expect(
      LinguisticService.media.relink({ mediaId: MEDIA_ID, audioBlob: blob }),
    ).resolves.toEqual({ mediaId: MEDIA_ID });
    const media = await db.media_items.get(MEDIA_ID);
    expect(media).toEqual(
      expect.objectContaining({
        id: MEDIA_ID,
        filename: 'elicitation-01.wav',
        timelineKind: 'acoustic',
        byteLocation: 'managed',
        availability: 'available',
        contentSize: blob.size,
      }),
    );
    await expect(db.layer_units.get('seg_2bc_a')).resolves.toEqual(
      expect.objectContaining({ mediaId: MEDIA_ID, startTime: 1.25, endTime: 3.5 }),
    );
  });

  it('asks first when the new bytes do not match contentSha256; nothing is written', async () => {
    const other = new Blob(['different-bytes'], { type: 'audio/wav' });
    const before = await db.media_items.get(MEDIA_ID);
    const error = await LinguisticService.media
      .relink({ mediaId: MEDIA_ID, audioBlob: other })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MediaContentMismatchError);
    expect((error as MediaContentMismatchError).expectedSha256).toBe(before?.contentSha256);
    await expect(db.media_items.get(MEDIA_ID)).resolves.toEqual(before);

    await LinguisticService.media.relink({
      mediaId: MEDIA_ID,
      audioBlob: other,
      acknowledgeContentMismatch: true,
    });
    const after = await db.media_items.get(MEDIA_ID);
    expect(after?.id).toBe(MEDIA_ID);
    expect(after?.availability).toBe('available');
    expect(after?.contentSha256).toBe(await computeBlobSha256(other));
    await expect(db.layer_units.get('seg_2bc_a')).resolves.toEqual(
      expect.objectContaining({ startTime: 1.25, endTime: 3.5 }),
    );
  });

  it('the import-audio "replace" path on a missing recording is a relink with the same checks', async () => {
    const other = new Blob(['different-bytes'], { type: 'audio/wav' });
    await expect(
      LinguisticService.media.importAudio({
        textId: TEXT_ID,
        audioBlob: other,
        filename: 'renamed.wav',
        duration: 12,
        importMode: 'replace',
        replaceMediaId: MEDIA_ID,
      }),
    ).rejects.toBeInstanceOf(MediaContentMismatchError);
    const same = new Blob([AUDIO], { type: 'audio/wav' });
    await LinguisticService.media.importAudio({
      textId: TEXT_ID,
      audioBlob: same,
      filename: 'renamed.wav',
      duration: 12,
      importMode: 'replace',
      replaceMediaId: MEDIA_ID,
    });
    await expect(db.media_items.get(MEDIA_ID)).resolves.toEqual(
      expect.objectContaining({ filename: 'elicitation-01.wav', availability: 'available' }),
    );
  });
});
