/**
 * P2-3：适配器不再静默整表扫描；意外错误不再被吞掉退化成扫表。
 * P2-3: the adapter no longer silently scans whole tables or swallows unexpected errors into a scan.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, getDb, type SpeakerDocType } from '.';
import { DexieNonIndexedQueryError } from './adapterDexieQueryErrors';
import { listSpeakersForProject } from '../services/linguisticServiceSpeakerOps';

const NOW = '2026-10-12T00:00:00.000Z';

function speaker(id: string, textId: string, name: string): SpeakerDocType {
  return { id, textId, name, createdAt: NOW, updatedAt: NOW } as SpeakerDocType;
}

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map((table) => table.clear()));
  await db.texts.bulkPut([
    { id: 'pA', title: { default: 'A' }, createdAt: NOW, updatedAt: NOW },
    { id: 'pB', title: { default: 'B' }, createdAt: NOW, updatedAt: NOW },
  ]);
  await db.speakers.bulkPut([speaker('s1', 'pA', 'Ann'), speaker('s2', 'pB', 'Bob')]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DexieCollectionAdapter (P2-3)', () => {
  it('throws in dev/test on a selector with no index', async () => {
    const jdb = await getDb();
    await expect(
      jdb.collections.speakers.findOne({ selector: { name: 'Ann' } }).exec(),
    ).rejects.toBeInstanceOf(DexieNonIndexedQueryError);
    await expect(jdb.collections.speakers.removeBySelector({ name: 'Ann' })).rejects.toBeInstanceOf(
      DexieNonIndexedQueryError,
    );
  });

  it('narrows by the index and refines the remaining fields', async () => {
    const jdb = await getDb();
    expect(
      (await jdb.collections.speakers.findOne({ selector: { textId: 'pB', name: 'Bob' } }).exec())
        ?.id,
    ).toBe('s2');
    expect(await jdb.collections.speakers.removeBySelector({ textId: 'pA', name: 'Bob' })).toBe(0);
    expect(await jdb.collections.speakers.removeBySelector({ textId: 'pA', name: 'Ann' })).toBe(1);
    expect((await db.speakers.toArray()).map((row) => row.id)).toEqual(['s2']);
  });

  it('propagates unexpected errors instead of falling back to a scan', async () => {
    const jdb = await getDb();
    vi.spyOn(db.speakers, 'where').mockImplementation(() => {
      throw new Error('transaction aborted');
    });
    const filter = vi.spyOn(db.speakers, 'filter');
    await expect(
      jdb.collections.speakers.findOne({ selector: { textId: 'pA' } }).exec(),
    ).rejects.toThrow('transaction aborted');
    expect(filter).not.toHaveBeenCalled();
  });

  it('lists only the given project speakers through the textId index', async () => {
    expect((await listSpeakersForProject('pA')).map((row) => row.id)).toEqual(['s1']);
    expect((await listSpeakersForProject('pB')).map((row) => row.id)).toEqual(['s2']);
  });
});

describe('TierBackedLayerCollectionAdapter (P2-3)', () => {
  it('findOne by textId returns only that project layer; non-indexed selector throws', async () => {
    const jdb = await getDb();
    for (const textId of ['pA', 'pB']) {
      await jdb.collections.layers.insert({
        id: `layer_${textId}`,
        textId,
        key: `trc_${textId}`,
        name: { default: textId },
        layerType: 'transcription',
        languageId: 'und',
        modality: 'text',
        createdAt: NOW,
        updatedAt: NOW,
      } as never);
    }
    expect((await jdb.collections.layers.findOne({ selector: { textId: 'pB' } }).exec())?.id).toBe(
      'layer_pB',
    );
    expect((await jdb.collections.layers.findByIndex('textId', 'pA')).map((doc) => doc.id)).toEqual(
      ['layer_pA'],
    );
    await expect(
      jdb.collections.layers.findOne({ selector: { languageId: 'und' } }).exec(),
    ).rejects.toBeInstanceOf(DexieNonIndexedQueryError);
  });
});
