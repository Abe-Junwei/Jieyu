// @vitest-environment jsdom

import 'fake-indexeddb/auto';
import { renderHook } from '@testing-library/react';
import type { MutableRefObject } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, type SpeakerDocType, type LayerUnitDocType, type LayerUnitContentDocType } from '../db';
import { mapUnitToLayerUnit } from '../db/migrations/timelineUnitMapping';
import { TranscriptionPersistenceConflictError, useTranscriptionPersistence } from './useTranscriptionPersistence';

const NOW = '2026-03-27T00:00:00.000Z';

function toRef<T>(value: T): MutableRefObject<T> {
  return { current: value };
}

describe('useTranscriptionPersistence', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all([
      db.speakers.clear(),
      db.layer_units.clear(),
      db.layer_unit_contents.clear(),
      db.unit_relations.clear(),
    ]);
  });

  it('accepts conflict guard when translation exists only in layer_unit_contents', async () => {
    const unit: LayerUnitDocType = {
      id: 'utt_sync_1',
      textId: 'text_1',
      mediaId: 'media_1',
      startTime: 0,
      endTime: 1,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const translation: LayerUnitContentDocType = {
      id: 'utr_sync_1',
      unitId: 'utt_sync_1',
      layerId: 'layer_sync',
      modality: 'text',
      text: 'layer-unit-only',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    };

    const hostLayerId = 'layer_trc';
    const { unit: hostUnit, content: hostContent } = mapUnitToLayerUnit(unit, hostLayerId);
    await db.layer_units.put(hostUnit);
    await db.layer_unit_contents.put(hostContent);
    await db.layer_units.put({
      id: 'seg_sync_1',
      textId: 'text_1',
      mediaId: 'media_1',
      layerId: 'layer_sync',
      unitType: 'segment',
      parentUnitId: 'utt_sync_1',
      rootUnitId: 'utt_sync_1',
      startTime: 0,
      endTime: 1,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.layer_unit_contents.put({
      id: 'utr_sync_1',
      textId: 'text_1',
      unitId: 'seg_sync_1',
      layerId: 'layer_sync',
      contentRole: 'primary_text',
      modality: 'text',
      text: 'layer-unit-only',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const unitsRef = toRef<LayerUnitDocType[]>([unit]);
    const translationsRef = toRef<LayerUnitContentDocType[]>([translation]);
    const speakersRef = toRef<SpeakerDocType[]>([]);
    const { result } = renderHook(() => useTranscriptionPersistence({ unitsRef, translationsRef, speakersRef }));

    await result.current.syncToDb([unit], [translation], [], { conflictGuard: true });

    expect(await db.layer_unit_contents.get('utr_sync_1')).toEqual(expect.objectContaining({
      unitId: 'segv2_layer_sync_utt_sync_1',
      text: 'layer-unit-only',
    }));
  });

  it('raises conflict when layer_unit_contents updatedAt differs from base snapshot', async () => {
    const unit: LayerUnitDocType = {
      id: 'utt_sync_conflict_1',
      textId: 'text_1',
      mediaId: 'media_1',
      startTime: 0,
      endTime: 1,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const translation: LayerUnitContentDocType = {
      id: 'utr_sync_conflict_1',
      unitId: 'utt_sync_conflict_1',
      layerId: 'layer_sync',
      modality: 'text',
      text: 'stale-base',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    };

    const hostLayerId = 'layer_trc';
    const { unit: hostUnit, content: hostContent } = mapUnitToLayerUnit(unit, hostLayerId);
    await db.layer_units.put(hostUnit);
    await db.layer_unit_contents.put(hostContent);
    await db.layer_units.put({
      id: 'seg_sync_conflict_1',
      textId: 'text_1',
      mediaId: 'media_1',
      layerId: 'layer_sync',
      unitType: 'segment',
      parentUnitId: 'utt_sync_conflict_1',
      rootUnitId: 'utt_sync_conflict_1',
      startTime: 0,
      endTime: 1,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.layer_unit_contents.put({
      id: 'utr_sync_conflict_1',
      textId: 'text_1',
      unitId: 'seg_sync_conflict_1',
      layerId: 'layer_sync',
      contentRole: 'primary_text',
      modality: 'text',
      text: 'newer-persisted',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: '2026-03-27T00:01:00.000Z',
    });

    const unitsRef = toRef<LayerUnitDocType[]>([unit]);
    const translationsRef = toRef<LayerUnitContentDocType[]>([translation]);
    const speakersRef = toRef<SpeakerDocType[]>([]);
    const { result } = renderHook(() => useTranscriptionPersistence({ unitsRef, translationsRef, speakersRef }));

    await expect(
      result.current.syncToDb([unit], [translation], [], { conflictGuard: true }),
    ).rejects.toThrow(TranscriptionPersistenceConflictError);
  });
});