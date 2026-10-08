/**
 * rev5 第 1 批 T11：导入音频只替换选定的那一条占位时间轴，不合并其他占位轴或录音（N4）。
 * rev5 Batch 1 T11: importing audio replaces only the selected placeholder timeline (N4).
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import type { MediaItemDocType } from '../db';
import { LinguisticService } from './LinguisticService';
import { AudioImportPlaceholderSelectionRequiredError } from './linguisticServiceMediaImport';

const TEXT_ID = 'text_t11';
const LAYER_ID = 'layer_trc_t11';
const NOW = '2026-10-08T12:00:00.000Z';

function placeholderRow(id: string): MediaItemDocType {
  return {
    id,
    textId: TEXT_ID,
    filename: 'document-placeholder.track',
    duration: 30,
    details: { placeholder: true, timelineMode: 'document', timelineKind: 'placeholder' },
    isOfflineCached: true,
    createdAt: NOW,
  };
}

function missingAcousticRow(id: string): MediaItemDocType {
  return {
    id,
    textId: TEXT_ID,
    filename: `${id}.wav`,
    duration: 12,
    details: { timelineKind: 'acoustic' },
    isOfflineCached: true,
    createdAt: NOW,
  };
}

async function seedUnit(id: string, mediaId: string, startTime: number, endTime: number) {
  await db.layer_units.put({
    id,
    textId: TEXT_ID,
    mediaId,
    layerId: LAYER_ID,
    unitType: 'segment',
    startTime,
    endTime,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

async function snapshotRows() {
  const media = await db.media_items.where('textId').equals(TEXT_ID).sortBy('id');
  const units = await db.layer_units.where('textId').equals(TEXT_ID).sortBy('id');
  return {
    media: media.map((row) => ({
      id: row.id,
      filename: row.filename,
      details: { ...(row.details ?? {}), audioBlob: undefined },
      hasBlob: (row.details as Record<string, unknown> | undefined)?.['audioBlob'] instanceof Blob,
    })),
    units: units.map((row) => ({
      id: row.id,
      mediaId: row.mediaId,
      start: row.startTime,
      end: row.endTime,
    })),
  };
}

describe('importAudio placeholder scope (T11 / N4)', () => {
  beforeEach(async () => {
    await Promise.all([
      db.texts.clear(),
      db.media_items.clear(),
      db.layer_units.clear(),
      db.layer_unit_contents.clear(),
      db.tier_definitions.clear(),
      db.anchors.clear(),
    ]);
    await db.texts.put({
      id: TEXT_ID,
      title: { default: 'T11' },
      metadata: {
        timelineMode: 'document',
        logicalDurationSec: 30,
        timebaseLabel: 'logical-second',
      },
      createdAt: NOW,
      updatedAt: NOW,
    });
    await LinguisticService.layers.saveTranslation({
      id: LAYER_ID,
      textId: TEXT_ID,
      key: 'trc_t11',
      name: { default: 'TRC' },
      layerType: 'transcription',
      languageId: 'und',
      modality: 'text',
      isDefault: true,
      sortOrder: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.media_items.bulkPut([
      placeholderRow('media_ph_a'),
      placeholderRow('media_ph_b'),
      missingAcousticRow('media_missing'),
    ]);
    await seedUnit('seg_a', 'media_ph_a', 1, 2);
    await seedUnit('seg_b', 'media_ph_b', 3, 4);
    await seedUnit('seg_missing', 'media_missing', 5, 6);
  });

  it('replaces only the explicitly selected placeholder; other placeholders and the missing recording stay intact', async () => {
    const before = await snapshotRows();
    const blob = new Blob(['audio-t11'], { type: 'audio/wav' });

    const result = await LinguisticService.media.importAudio({
      textId: TEXT_ID,
      audioBlob: blob,
      filename: 'chosen.wav',
      duration: 20,
      importMode: 'replace',
      replaceMediaId: 'media_ph_b',
    });

    expect(result.mediaId).toBe('media_ph_b');
    const after = await snapshotRows();
    const promoted = await db.media_items.get('media_ph_b');
    expect(promoted?.filename).toBe('chosen.wav');
    expect((promoted?.details as Record<string, unknown>)['timelineKind']).toBe('acoustic');
    expect((promoted?.details as Record<string, unknown>)['audioBlob']).toBeInstanceOf(Blob);

    // 其他行与句段逐项不变 | Every other row and unit is unchanged
    expect(after.media.filter((row) => row.id !== 'media_ph_b')).toEqual(
      before.media.filter((row) => row.id !== 'media_ph_b'),
    );
    expect(after.units).toEqual(before.units);
  });

  it('refuses to guess when several placeholders exist and none is selected; nothing changes', async () => {
    // 去掉缺音声学行，让项目里只有两条占位 | Only placeholders remain
    await db.media_items.delete('media_missing');
    await db.layer_units.delete('seg_missing');
    const before = await snapshotRows();

    await expect(
      LinguisticService.media.importAudio({
        textId: TEXT_ID,
        audioBlob: new Blob(['x'], { type: 'audio/wav' }),
        filename: 'ambiguous.wav',
        duration: 20,
      }),
    ).rejects.toBeInstanceOf(AudioImportPlaceholderSelectionRequiredError);

    expect(await snapshotRows()).toEqual(before);
  });

  it('add mode with several placeholders creates a new track and merges nothing', async () => {
    await db.media_items.delete('media_missing');
    await db.layer_units.delete('seg_missing');
    const before = await snapshotRows();

    const result = await LinguisticService.media.importAudio({
      textId: TEXT_ID,
      audioBlob: new Blob(['x'], { type: 'audio/wav' }),
      filename: 'added.wav',
      duration: 20,
      importMode: 'add',
    });

    expect(['media_ph_a', 'media_ph_b']).not.toContain(result.mediaId);
    const after = await snapshotRows();
    expect(after.media.filter((row) => row.id !== result.mediaId)).toEqual(before.media);
    expect(after.units).toEqual(before.units);
  });

  it('a missing acoustic recording is not a placeholder: default import adds a new track and leaves it alone', async () => {
    await db.media_items.bulkDelete(['media_ph_a', 'media_ph_b']);
    await db.layer_units.bulkDelete(['seg_a', 'seg_b']);
    const before = await snapshotRows();

    const result = await LinguisticService.media.importAudio({
      textId: TEXT_ID,
      audioBlob: new Blob(['x'], { type: 'audio/wav' }),
      filename: 'other.wav',
      duration: 20,
    });

    expect(result.mediaId).not.toBe('media_missing');
    const after = await snapshotRows();
    expect(after.media.filter((row) => row.id !== result.mediaId)).toEqual(before.media);
    expect(after.units).toEqual(before.units);
  });

  it('a single placeholder is still promoted in default mode', async () => {
    await db.media_items.bulkDelete(['media_ph_b', 'media_missing']);
    await db.layer_units.bulkDelete(['seg_b', 'seg_missing']);

    const result = await LinguisticService.media.importAudio({
      textId: TEXT_ID,
      audioBlob: new Blob(['x'], { type: 'audio/wav' }),
      filename: 'only.wav',
      duration: 20,
    });

    expect(result.mediaId).toBe('media_ph_a');
    await expect(db.layer_units.get('seg_a')).resolves.toEqual(
      expect.objectContaining({ mediaId: 'media_ph_a', startTime: 1, endTime: 2 }),
    );
  });
});
