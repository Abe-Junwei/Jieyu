import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../db';
import { LinguisticService } from '../../services/LinguisticService';
import * as workspaceEvents from '../../utils/workspaceEvents';
import {
  listAnnotationUnitNotes,
  saveAnnotationUnitNote,
  saveAnnotationUnitSelfCertainty,
  saveAnnotationUnitTurn,
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

  it('updates the latest note when multiple notes already exist for a unit', async () => {
    await LinguisticService.notes.save({
      id: 'note-old',
      targetType: 'unit',
      targetId: 'unit-note-2',
      content: { default: 'older note' },
      category: 'comment',
      createdAt: now,
      updatedAt: '2026-09-11T07:00:00.000Z',
    });
    await LinguisticService.notes.save({
      id: 'note-new',
      targetType: 'unit',
      targetId: 'unit-note-2',
      content: { default: 'newer note' },
      category: 'fieldwork',
      createdAt: now,
      updatedAt: '2026-09-11T09:00:00.000Z',
    });

    const saved = await saveAnnotationUnitNote({
      unitId: 'unit-note-2',
      content: 'translation note',
      category: 'topic',
    });
    expect(saved.id).not.toBe('note-new');
    expect(saved.content).toBe('translation note');

    const requery = await LinguisticService.notes.listByTarget('unit', 'unit-note-2');
    expect(requery).toHaveLength(3);
    expect(requery.find((note) => note.id === 'note-old')?.content.default).toBe('older note');
    expect(requery.find((note) => note.id === 'note-new')?.content.default).toBe('newer note');
    expect(requery.find((note) => note.category === 'topic')?.content.default).toBe(
      'translation note',
    );
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

  it('writes turn fields then readback matches each field, and clearing removes them', async () => {
    await LinguisticService.layers.saveTranslation({
      id: 'lane-turn-1',
      textId: 'text-turn-1',
      key: 'lane-turn-1',
      name: { default: 'lane' },
      languageId: 'und',
      modality: 'text',
      createdAt: now,
      updatedAt: now,
      layerType: 'transcription',
    });
    await LinguisticService.units.saveBatch([
      {
        id: 'unit-turn-1',
        textId: 'text-turn-1',
        mediaId: 'media-turn-1',
        unitType: 'unit',
        startTime: 0,
        endTime: 1,
        transcription: { default: 'turn text' },
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const readback = await saveAnnotationUnitTurn({
      textId: 'text-turn-1',
      unitId: 'unit-turn-1',
      addressee: 'child',
      ungrammatical: true,
      actualForm: 'goed',
      targetForm: 'went',
    });
    expect(readback.addressee).toBe('child');
    expect(readback.ungrammatical).toBe(true);
    expect(readback.actualForm).toBe('goed');
    expect(readback.targetForm).toBe('went');
    expect(readback.transcription?.default).toBe('turn text');

    const requery = await LinguisticService.units.listByTextId('text-turn-1');
    const stored = requery.find((row) => row.id === 'unit-turn-1');
    expect(stored?.addressee).toBe('child');
    expect(stored?.ungrammatical).toBe(true);
    expect(stored?.actualForm).toBe('goed');
    expect(stored?.targetForm).toBe('went');

    const cleared = await saveAnnotationUnitTurn({
      textId: 'text-turn-1',
      unitId: 'unit-turn-1',
      addressee: '',
      ungrammatical: false,
      actualForm: '',
      targetForm: '',
    });
    expect(cleared.addressee).toBeUndefined();
    expect(cleared.ungrammatical).toBe(false);
    expect(cleared.actualForm).toBeUndefined();
    expect(cleared.targetForm).toBeUndefined();

    const requeryAfterClear = await LinguisticService.units.listByTextId('text-turn-1');
    const storedAfterClear = requeryAfterClear.find((row) => row.id === 'unit-turn-1');
    expect(storedAfterClear?.addressee).toBeUndefined();
    expect(storedAfterClear?.ungrammatical).toBe(false);
    expect(storedAfterClear?.actualForm).toBeUndefined();
    expect(storedAfterClear?.targetForm).toBeUndefined();
  });

  it('keeps a translation topic note distinct from a transcription comment', async () => {
    await saveAnnotationUnitNote({
      unitId: 'unit-topic-1',
      content: 'transcription',
      category: 'comment',
    });
    await saveAnnotationUnitNote({
      unitId: 'unit-topic-1',
      content: 'translation',
      category: 'topic',
    });
    const loaded = await listAnnotationUnitNotes('unit-topic-1');
    expect(loaded.find((note) => note.category === 'comment')?.content).toBe('transcription');
    expect(loaded.find((note) => note.category === 'topic')?.content).toBe('translation');

    await saveAnnotationUnitNote({
      unitId: 'unit-topic-1',
      content: 'translation edited',
      category: 'topic',
    });
    const requery = await listAnnotationUnitNotes('unit-topic-1');
    expect(requery.find((note) => note.category === 'comment')?.content).toBe('transcription');
    expect(requery.find((note) => note.category === 'topic')?.content).toBe('translation edited');
  });

  it('notifies an open annotation page after a transcription note is saved', async () => {
    const notify = vi.spyOn(workspaceEvents, 'dispatchWorkspaceUnitUpdated');
    await saveAnnotationUnitNote({
      unitId: 'unit-live-1',
      content: 'heard on the tape',
      category: 'comment',
    });
    expect(notify).toHaveBeenCalledWith({ unitId: 'unit-live-1' });
    const notes = await listAnnotationUnitNotes('unit-live-1');
    expect(notes.find((note) => note.category === 'topic')).toBeUndefined();
    expect(notes.find((note) => note.category === 'comment')?.content).toBe('heard on the tape');
    notify.mockRestore();
  });
});
