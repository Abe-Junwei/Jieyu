import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db';
import { LinguisticService } from './LinguisticService';
import { CatalogOwnershipMismatchError, CatalogProjectRequiredError } from './projectCatalogScope';
import { readProjectSpeakerIds } from './speakerProjectMembership';

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
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it('refuses a delete-merge onto a speaker from another project', async () => {
    await seedText('text-a');
    await seedText('text-b');
    const ada = await LinguisticService.speakers.create({ name: 'Ada', textId: 'text-a' });
    const bo = await LinguisticService.speakers.create({ name: 'Bo', textId: 'text-b' });
    await db.layer_units.put({
      id: 'unit-a',
      textId: 'text-a',
      unitType: 'unit',
      speakerId: ada.id,
      layerId: 'layer-a',
      mediaId: 'media-a',
      startTime: 0,
      endTime: 1,
      createdAt: NOW,
      updatedAt: NOW,
    });

    await expect(
      LinguisticService.speakers.delete(ada.id, { strategy: 'merge', targetSpeakerId: bo.id }),
    ).rejects.toBeInstanceOf(CatalogOwnershipMismatchError);
    expect((await db.layer_units.get('unit-a'))?.speakerId).toBe(ada.id);
    expect(await db.speakers.get(ada.id)).toBeDefined();
  });

  it('puts the delete-merge target back on the project roster', async () => {
    await seedText('text-a');
    const ada = await LinguisticService.speakers.create({ name: 'Ada', textId: 'text-a' });
    const bo = await LinguisticService.speakers.create({ name: 'Bo', textId: 'text-a' });
    await db.layer_units.put({
      id: 'unit-a',
      textId: 'text-a',
      unitType: 'unit',
      speakerId: ada.id,
      layerId: 'layer-a',
      mediaId: 'media-a',
      startTime: 0,
      endTime: 1,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await LinguisticService.layers.saveTranslation({
      id: 'layer-a',
      textId: 'text-a',
      key: 'trc_text-a',
      name: { default: 'TRC' },
      layerType: 'transcription',
      languageId: 'und',
      modality: 'text',
      isDefault: true,
      sortOrder: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const text = await db.texts.get('text-a');
    const withoutBo = (readProjectSpeakerIds(text?.metadata) ?? []).filter((id) => id !== bo.id);
    await db.texts.update('text-a', {
      metadata: { ...(text?.metadata ?? {}), projectSpeakerIds: withoutBo },
    });

    await LinguisticService.speakers.delete(ada.id, { strategy: 'merge', targetSpeakerId: bo.id });

    expect((await db.layer_units.get('unit-a'))?.speakerId).toBe(bo.id);
    expect(await db.speakers.get(ada.id)).toBeUndefined();
    expect(readProjectSpeakerIds((await db.texts.get('text-a'))?.metadata)).toContain(bo.id);
  });

  it('rolls back the whole delete-merge when the roster write fails', async () => {
    await seedText('text-a');
    await LinguisticService.layers.saveTranslation({
      id: 'layer-a',
      textId: 'text-a',
      key: 'trc_text-a',
      name: { default: 'TRC' },
      layerType: 'transcription',
      languageId: 'und',
      modality: 'text',
      isDefault: true,
      sortOrder: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const ada = await LinguisticService.speakers.create({ name: 'Ada', textId: 'text-a' });
    const bo = await LinguisticService.speakers.create({ name: 'Bo', textId: 'text-a' });
    await db.layer_units.put({
      id: 'unit-a',
      textId: 'text-a',
      unitType: 'unit',
      speakerId: ada.id,
      layerId: 'layer-a',
      mediaId: 'media-a',
      startTime: 0,
      endTime: 1,
      createdAt: NOW,
      updatedAt: NOW,
    });
    vi.spyOn(db.texts, 'put').mockRejectedValue(new Error('roster write failed'));

    await expect(
      LinguisticService.speakers.delete(ada.id, { strategy: 'merge', targetSpeakerId: bo.id }),
    ).rejects.toThrow('roster write failed');
    vi.restoreAllMocks();

    expect((await db.layer_units.get('unit-a'))?.speakerId).toBe(ada.id);
    expect(await db.speakers.get(ada.id)).toBeDefined();
  });
});
