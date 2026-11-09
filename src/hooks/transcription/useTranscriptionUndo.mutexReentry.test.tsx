// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type React from 'react';
import type {
  LayerLinkDocType,
  SpeakerDocType,
  LayerDocType,
  LayerUnitDocType,
  LayerUnitContentDocType,
} from '../../db';
import { LOCALE_PREFERENCE_STORAGE_KEY } from '../../i18n';
import { createAsyncMutex } from '../../utils/asyncMutex';
import { useTranscriptionUndo } from './useTranscriptionUndo';
import { createTranscriptionUnitBatchActions } from './useTranscriptionUnitActions.batchActions';
import { LinguisticService } from '../../services/LinguisticService';

function createStateRefHarness<T>(initial: T) {
  let value = initial;
  const ref = { current: value };
  const setState = vi.fn((next: React.SetStateAction<T>) => {
    value = typeof next === 'function' ? (next as (prev: T) => T)(value) : next;
    ref.current = value;
  });
  return {
    ref,
    setState,
    get: () => value,
    setDirect: (next: T) => {
      value = next;
      ref.current = next;
    },
  };
}

function makeUnit(id: string, startTime: number, endTime: number): LayerUnitDocType {
  const now = new Date().toISOString();
  return {
    id,
    mediaId: 'm1',
    textId: 't1',
    startTime,
    endTime,
    transcription: { default: id },
    createdAt: now,
    updatedAt: now,
  } as LayerUnitDocType;
}

describe('batch rollback under held db mutex (#515)', () => {
  beforeEach(() => {
    window.localStorage.setItem(LOCALE_PREFERENCE_STORAGE_KEY, 'zh-CN');
  });

  afterEach(() => {
    window.localStorage.removeItem(LOCALE_PREFERENCE_STORAGE_KEY);
    vi.restoreAllMocks();
  });

  it('undoAssumingDbMutexHeld finishes inside held mutex and lets the next save run', async () => {
    const mutex = createAsyncMutex();
    const runWithDbMutex = <T,>(task: () => Promise<T>) => mutex.run(task);

    const units = createStateRefHarness<LayerUnitDocType[]>([
      makeUnit('u1', 0, 1),
      makeUnit('u2', 1.2, 2),
    ]);
    const translations = createStateRefHarness<LayerUnitContentDocType[]>([]);
    const layers = createStateRefHarness<LayerDocType[]>([]);
    const layerLinks = createStateRefHarness<LayerLinkDocType[]>([]);
    const speakers = createStateRefHarness<SpeakerDocType[]>([]);
    const dirtyRef = { current: false };
    const syncToDbCore = vi.fn(async () => undefined);
    const setSaveState = vi.fn();

    const { result } = renderHook(() =>
      useTranscriptionUndo({
        unitsRef: units.ref,
        translationsRef: translations.ref,
        layersRef: layers.ref,
        layerLinksRef: layerLinks.ref,
        speakersRef: speakers.ref,
        dirtyRef,
        scheduleRecoverySave: vi.fn(),
        syncToDbCore,
        runWithDbMutex,
        setUnits: units.setState,
        setTranslations: translations.setState,
        setLayers: layers.setState,
        setLayerLinks: layerLinks.setState,
        setSpeakers: speakers.setState,
        setSaveState,
      }),
    );

    await act(async () => {
      result.current.pushUndo('offset');
    });
    units.setDirect([makeUnit('u1', 0.5, 1.5), makeUnit('u2', 1.7, 2.5)]);

    const withTimeout = <T,>(p: Promise<T>, ms: number, label: string) =>
      Promise.race([
        p,
        new Promise<T>((_, reject) => {
          setTimeout(() => reject(new Error(`${label} timed out (deadlock?)`)), ms);
        }),
      ]);

    let batchSettled = false;
    const batchOp = runWithDbMutex(async () => {
      try {
        throw new Error('db write failed');
      } catch {
        // Simulate batch catch: already holding mutex, must not call public undo.
        await result.current.undoAssumingDbMutexHeld();
      }
      batchSettled = true;
    });

    const nextSave = runWithDbMutex(async () => 'saved');

    await act(async () => {
      const outcomes = await withTimeout(Promise.all([batchOp, nextSave]), 2000, 'batch+nextSave');
      expect(outcomes[1]).toBe('saved');
    });

    expect(batchSettled).toBe(true);
    expect(syncToDbCore).toHaveBeenCalled();
    expect(units.get()[0]?.startTime).toBe(0);
  });

  it('offsetSelectedTimes failure rollback under wrapper mutex does not deadlock', async () => {
    const mutex = createAsyncMutex();
    const runWithDbMutex = <T,>(task: () => Promise<T>) => mutex.run(task);

    const units = createStateRefHarness<LayerUnitDocType[]>([
      makeUnit('u1', 0, 1),
      makeUnit('u2', 1.2, 2),
    ]);
    const translations = createStateRefHarness<LayerUnitContentDocType[]>([]);
    const layers = createStateRefHarness<LayerDocType[]>([]);
    const layerLinks = createStateRefHarness<LayerLinkDocType[]>([]);
    const speakers = createStateRefHarness<SpeakerDocType[]>([]);
    const dirtyRef = { current: false };
    const syncToDbCore = vi.fn(async () => undefined);
    const setSaveState = vi.fn();

    const { result: undoResult } = renderHook(() =>
      useTranscriptionUndo({
        unitsRef: units.ref,
        translationsRef: translations.ref,
        layersRef: layers.ref,
        layerLinksRef: layerLinks.ref,
        speakersRef: speakers.ref,
        dirtyRef,
        scheduleRecoverySave: vi.fn(),
        syncToDbCore,
        runWithDbMutex,
        setUnits: units.setState,
        setTranslations: translations.setState,
        setLayers: layers.setState,
        setLayerLinks: layerLinks.setState,
        setSpeakers: speakers.setState,
        setSaveState,
      }),
    );

    vi.spyOn(LinguisticService.units, 'saveBatch').mockRejectedValue(new Error('db write failed'));

    const batch = createTranscriptionUnitBatchActions({
      allowOverlapInTranscription: true,
      locale: 'zh-CN',
      translations: [],
      unitsOnCurrentMediaRef: units.ref,
      pushUndo: undoResult.current.pushUndo,
      rollbackUndo: undoResult.current.undoAssumingDbMutexHeld,
      createAnchor: vi.fn(),
      updateAnchorTime: vi.fn(),
      pruneOrphanAnchors: vi.fn(),
      getUnitTextForLayer: (unit) => unit.id,
      reassignTranslations: vi.fn(),
      selectUnitPrimary: vi.fn(),
      setSaveState,
      setTranslations: translations.setState,
      setUnits: units.setState,
      setUnitDrafts: vi.fn(),
    });

    const wrap =
      <A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
      (...args: A) =>
        runWithDbMutex(() => fn(...args));

    const offsetSelectedTimes = wrap(batch.offsetSelectedTimes);
    const nextSave = wrap(async () => 'saved-after-fail');

    const withTimeout = <T,>(p: Promise<T>, ms: number, label: string) =>
      Promise.race([
        p,
        new Promise<T>((_, reject) => {
          setTimeout(() => reject(new Error(`${label} timed out (deadlock?)`)), ms);
        }),
      ]);

    await act(async () => {
      const outcomes = await withTimeout(
        Promise.all([offsetSelectedTimes(new Set(['u1', 'u2']), 0.5), nextSave()]),
        2000,
        'offset+nextSave',
      );
      expect(outcomes[1]).toBe('saved-after-fail');
    });

    expect(setSaveState).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'error',
      }),
    );
  });
});
