import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import { LinguisticService } from '../../services/LinguisticService';
import {
  listAnnotationUnitNotes,
  saveAnnotationUnitNote,
  saveAnnotationUnitSelfCertainty,
} from './saveAnnotationUnitMeta';

describe('saveAnnotationUnitMeta', () => {
  const now = '2026-09-11T08:00:00.000Z';

  beforeEach(async () => {
    await Promise.all([
      db.user_notes.clear(),
      db.layer_units.clear(),
      db.layer_unit_contents.clear(),
      db.tier_definitions.clear(),
    ]);
  });

  it('writes a unit note then readback matches content and category', async () => {
    const saved = await saveAnnotationUnitNote({
      unitId: 'unit-note-1',
      content: 'field reminder',
      category: 'fieldwork',
    });
    expect(saved.content).toBe('field reminder');
    expect(saved.category).toBe('fieldwork');

    const requery = await listAnnotationUnitNotes('unit-note-1');
    expect(requery).toHaveLength(1);
    expect(requery[0]?.id).toBe(saved.id);
    expect(requery[0]?.content).toBe('field reminder');
    expect(requery[0]?.category).toBe('fieldwork');

    const updated = await saveAnnotationUnitNote({
      unitId: 'unit-note-1',
      noteId: saved.id,
      content: 'revised note',
      category: 'todo',
    });
    expect(updated.id).toBe(saved.id);
    const after = await LinguisticService.notes.listByTarget('unit', 'unit-note-1');
    expect(after).toHaveLength(1);
    expect(after[0]?.content.default).toBe('revised note');
    expect(after[0]?.category).toBe('todo');
  });

  it('patches only selfCertainty then readback matches', async () => {
    await LinguisticService.layers.saveTranslation({
      id: 'lane-cert-1',
      textId: 'text-cert-1',
      key: 'lane-cert-1',
      name: { default: 'lane' },
      languageId: 'und',
      modality: 'text',
      createdAt: now,
      updatedAt: now,
      layerType: 'transcription',
    });
    await LinguisticService.units.saveBatch([
      {
        id: 'unit-cert-1',
        textId: 'text-cert-1',
        mediaId: 'media-cert-1',
        unitType: 'unit',
        startTime: 0,
        endTime: 1,
        transcription: { default: 'keep me' },
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const readback = await saveAnnotationUnitSelfCertainty({
      textId: 'text-cert-1',
      unitId: 'unit-cert-1',
      selfCertainty: 'uncertain',
    });
    expect(readback.selfCertainty).toBe('uncertain');
    expect(readback.transcription?.default).toBe('keep me');
    expect(readback.startTime).toBe(0);
    expect(readback.endTime).toBe(1);

    const requery = await LinguisticService.units.listByTextId('text-cert-1');
    expect(requery.find((row) => row.id === 'unit-cert-1')?.selfCertainty).toBe('uncertain');
  });
});
