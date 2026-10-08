/**
 * rev5 第 1 批（N2）：JYT 不带字节，但必须保留省略标记；用 JYT 导回时本机字节不丢。
 * rev5 Batch 1 (N2): JYT carries no bytes but keeps omission markers; importing it back keeps local bytes.
 */
import 'fake-indexeddb/auto';
import { strFromU8, unzipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { exportToJieyuArchive, importFromJieyuArchive } from './JymService';

const NOW = '2026-10-08T12:00:00.000Z';

describe('JYT byte omission markers', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all(db.tables.map((table) => table.clear()));
    await db.texts.put({
      id: 'text-jyt',
      title: { default: 'JYT' },
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.media_items.put({
      id: 'media-jyt',
      textId: 'text-jyt',
      filename: 'field.wav',
      duration: 2,
      details: {
        audioBlob: new Blob(['jyt-audio'], { type: 'audio/wav' }),
        timelineKind: 'acoustic',
      },
      isOfflineCached: true,
      timelineKind: 'acoustic',
      byteLocation: 'managed',
      availability: 'available',
      createdAt: NOW,
    });
  });

  it('keeps audioExportOmitted in the JYT payload and carries no bytes', async () => {
    const archive = await exportToJieyuArchive('jyt');
    const files = unzipSync(archive);
    const snapshot = JSON.parse(strFromU8(files['data/snapshot.json']!)) as {
      collections: { media_items: Array<{ details: Record<string, unknown> }> };
    };
    const details = snapshot.collections.media_items[0]!.details;
    expect(details['audioExportOmitted']).toBe(true);
    expect(details['audioBlob']).toBeUndefined();
    expect(details['audioDataUrl']).toBeUndefined();
  });

  it('importing the JYT back (upsert and replace-all) keeps local audio bytes', async () => {
    const archive = await exportToJieyuArchive('jyt');
    for (const strategy of ['upsert', 'replace-all'] as const) {
      await importFromJieyuArchive(archive, { strategy });
      const media = await db.media_items.get('media-jyt');
      const blob = (media?.details as Record<string, unknown>)['audioBlob'];
      expect(blob).toBeInstanceOf(Blob);
      expect(await (blob as Blob).text()).toBe('jyt-audio');
    }
  });
});
