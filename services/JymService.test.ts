import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { getDb } from '../db';
import { exportToJieyuArchive, importFromJieyuArchive } from './JymService';

async function resetDb(): Promise<void> {
  const db = await getDb();
  const collections = await Promise.all(
    Object.values(db.collections).map(async (c) => {
      const docs = await c.find().exec();
      return { c, ids: docs.map((d) => d.primary) };
    }),
  );
  for (const { c, ids } of collections) {
    for (const id of ids) await c.remove(id);
  }
}

describe('JymService', () => {
  it('exports and imports .jyt archive', async () => {
    await resetDb();
    const db = await getDb();
    const now = new Date().toISOString();

    await db.collections.texts.insert({
      id: 'text1',
      title: { eng: 'Demo' },
      createdAt: now,
      updatedAt: now,
    });
    await db.collections.utterances.insert({
      id: 'utt1',
      textId: 'text1',
      startTime: 0,
      endTime: 1,
      transcription: { default: 'hello' },
      isVerified: false,
      createdAt: now,
      updatedAt: now,
    });

    const archive = await exportToJieyuArchive('jyt');
    const imported = await importFromJieyuArchive(archive, { strategy: 'replace-all' });

    expect(imported.kind).toBe('jyt');
    expect(imported.importResult.collections.texts?.written).toBeGreaterThanOrEqual(1);
    expect(imported.importResult.collections.utterances?.written).toBeGreaterThanOrEqual(1);
  });

  it('exports and imports .jym archive', async () => {
    await resetDb();
    const db = await getDb();
    const now = new Date().toISOString();

    await db.collections.texts.insert({
      id: 'text2',
      title: { eng: 'Demo 2' },
      createdAt: now,
      updatedAt: now,
    });
    await db.collections.media_items.insert({
      id: 'm1',
      textId: 'text2',
      filename: 'demo.wav',
      isOfflineCached: false,
      createdAt: now,
    });

    const archive = await exportToJieyuArchive('jym');
    const imported = await importFromJieyuArchive(archive, { strategy: 'replace-all' });

    expect(imported.kind).toBe('jym');
    expect(imported.importResult.collections.media_items?.written).toBeGreaterThanOrEqual(1);
  });

  it('.jyt golden round-trip preserves texts and utterances with data fidelity', async () => {
    await resetDb();
    const db = await getDb();
    const now = new Date().toISOString();

    await db.collections.texts.insert({
      id: 'golden-text-1',
      title: { eng: 'Golden Story' },
      createdAt: now,
      updatedAt: now,
    });
    await db.collections.utterances.insert({
      id: 'golden-utt-1',
      textId: 'golden-text-1',
      startTime: 0,
      endTime: 2.5,
      transcription: { default: 'tɕʰa mo ɣa ra' },
      isVerified: false,
      createdAt: now,
      updatedAt: now,
    });
    await db.collections.utterances.insert({
      id: 'golden-utt-2',
      textId: 'golden-text-1',
      startTime: 2.5,
      endTime: 5,
      transcription: { default: 'ŋa joŋs pa yin' },
      isVerified: false,
      createdAt: now,
      updatedAt: now,
    });

    const archive = await exportToJieyuArchive('jyt');
    expect(archive.byteLength).toBeGreaterThan(0);

    await resetDb();
    const imported = await importFromJieyuArchive(archive, { strategy: 'replace-all' });

    expect(imported.kind).toBe('jyt');
    expect(imported.manifest.formatVersion).toBe(1);
    expect(imported.manifest.kind).toBe('jyt');
    expect(imported.importResult.collections.texts?.written).toBeGreaterThanOrEqual(1);
    expect(imported.importResult.collections.utterances?.written).toBeGreaterThanOrEqual(2);

    // Verify data fidelity after round-trip
    const texts = await db.collections.texts.find().exec();
    expect(texts.some((t) => t.id === 'golden-text-1')).toBe(true);
    const utts = await db.collections.utterances.find().exec();
    const goldUtts = utts.filter((u) => u.textId === 'golden-text-1').sort((a, b) => a.startTime - b.startTime);
    expect(goldUtts).toHaveLength(2);
    expect(goldUtts[0]!.transcription!.default).toBe('tɕʰa mo ɣa ra');
    expect(goldUtts[0]!.startTime).toBe(0);
    expect(goldUtts[0]!.endTime).toBe(2.5);
    expect(goldUtts[1]!.transcription!.default).toBe('ŋa joŋs pa yin');
    expect(goldUtts[1]!.startTime).toBe(2.5);
    expect(goldUtts[1]!.endTime).toBe(5);
  });

  it('.jym golden round-trip preserves media items with data fidelity', async () => {
    await resetDb();
    const db = await getDb();
    const now = new Date().toISOString();

    await db.collections.texts.insert({
      id: 'golden-text-2',
      title: { eng: 'Media Story' },
      createdAt: now,
      updatedAt: now,
    });
    await db.collections.media_items.insert({
      id: 'golden-media-1',
      textId: 'golden-text-2',
      filename: 'recording.wav',
      isOfflineCached: false,
      createdAt: now,
    });

    const archive = await exportToJieyuArchive('jym');
    await resetDb();
    const imported = await importFromJieyuArchive(archive, { strategy: 'replace-all' });

    expect(imported.kind).toBe('jym');
    expect(imported.manifest.kind).toBe('jym');
    expect(imported.importResult.collections.media_items?.written).toBeGreaterThanOrEqual(1);

    const media = await db.collections.media_items.find().exec();
    const golden = media.find((m) => m.id === 'golden-media-1');
    expect(golden).toBeDefined();
    expect(golden!.filename).toBe('recording.wav');
    expect(golden!.textId).toBe('golden-text-2');
  });
});
