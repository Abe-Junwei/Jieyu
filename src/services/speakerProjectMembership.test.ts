import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { LinguisticService } from './LinguisticService';
import { CatalogOwnershipMismatchError, CatalogProjectRequiredError } from './projectCatalogScope';

const NOW = '2026-09-30T00:00:00.000Z';

async function seedText(textId: string): Promise<void> {
  await db.texts.put({
    id: textId,
    title: { default: textId },
    createdAt: NOW,
    updatedAt: NOW,
  });
}

describe('project speaker roster', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all(db.tables.map((table) => table.clear()));
  });

  it('keeps each project its own speaker, even when the name matches', async () => {
    await seedText('text-a');
    await seedText('text-b');

    const ada = await LinguisticService.speakers.create({ name: 'Ada', textId: 'text-a' });
    await LinguisticService.speakers.create({ name: 'Bo', textId: 'text-b' });

    expect(
      (await LinguisticService.speakers.listForProject('text-a')).map((row) => row.name),
    ).toEqual(['Ada']);
    expect(
      (await LinguisticService.speakers.listForProject('text-b')).map((row) => row.name),
    ).toEqual(['Bo']);

    const shared = await LinguisticService.speakers.create({ name: 'Ada', textId: 'text-b' });
    expect(shared.id).not.toBe(ada.id);
    expect(
      (await LinguisticService.speakers.listForProject('text-b')).map((row) => row.name).sort(),
    ).toEqual(['Ada', 'Bo']);
    expect(await LinguisticService.speakers.list()).toHaveLength(3);
  });

  it('requires a project for every new speaker and never claims rows on read', async () => {
    await seedText('text-a');
    await expect(
      LinguisticService.speakers.create({ name: 'Ada', textId: '' }),
    ).rejects.toBeInstanceOf(CatalogProjectRequiredError);
    expect(await db.speakers.count()).toBe(0);
    expect(await LinguisticService.speakers.listForProject('text-a')).toEqual([]);
    expect(await LinguisticService.speakers.listForProject('')).toEqual([]);
    expect(await db.speakers.count()).toBe(0);
  });

  it('refuses to assign a speaker to units of another project', async () => {
    await seedText('text-a');
    await seedText('text-b');
    const ada = await LinguisticService.speakers.create({ name: 'Ada', textId: 'text-a' });
    await db.layer_units.put({
      id: 'unit-b',
      textId: 'text-b',
      unitType: 'unit',
      layerId: 'layer-b',
      mediaId: 'media-b',
      startTime: 0,
      endTime: 1,
      createdAt: NOW,
      updatedAt: NOW,
    });

    await expect(
      LinguisticService.speakers.assignToUnits(['unit-b'], ada.id),
    ).rejects.toBeInstanceOf(CatalogOwnershipMismatchError);
    expect((await db.layer_units.get('unit-b'))?.speakerId).toBeUndefined();
    expect(
      (await LinguisticService.speakers.listForProject('text-a')).map((row) => row.id),
    ).toEqual([ada.id]);
    expect(await LinguisticService.speakers.listForProject('text-b')).toEqual([]);
  });
});
