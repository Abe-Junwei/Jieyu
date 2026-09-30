import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { LinguisticService } from './LinguisticService';

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

  it('keeps a speaker who is already assigned on a unit before the roster is written', async () => {
    await seedText('text-a');
    const ada = await LinguisticService.speakers.create({ name: 'Ada' });
    await db.layer_units.put({
      id: 'unit-a',
      textId: 'text-a',
      startTime: 0,
      endTime: 1,
      speakerId: ada.id,
      createdAt: NOW,
      updatedAt: NOW,
    });

    expect(
      (await LinguisticService.speakers.listForProject('text-a')).map((row) => row.id),
    ).toEqual([ada.id]);
    expect(
      (await LinguisticService.speakers.listForProject('text-b')).map((row) => row.id),
    ).toEqual([]);
  });
});
