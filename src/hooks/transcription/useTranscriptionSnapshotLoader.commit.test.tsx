// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { LayerDocType, LayerUnitDocType, MediaItemDocType } from '../../db';
import { db, getDb } from '../../db';
import { putTestUnitAsLayerUnit } from '../../db/putTestUnitAsLayerUnit';
import {
  createAnnotationDocument,
  ensureDefaultAnnotationDocument,
  switchAnnotationDocument,
} from '../../services/annotationDocumentService';
import { LayerTierUnifiedService } from '../../services/LayerTierUnifiedService';
import { LinguisticService } from '../../services/LinguisticService';
import {
  clearActiveProjectTextId,
  publishActiveProjectTextId,
} from '../../utils/transcriptionUrlDeepLink';
import type { DbState } from './transcriptionTypes';
import { useTranscriptionLifecycle } from './useTranscriptionLifecycle';
import { useTranscriptionSnapshotLoader } from './useTranscriptionSnapshotLoader';
import type { WorkspaceSnapshotLoadResult } from './workspaceSnapshotLoad';

const NOW = '2026-10-15T00:00:00.000Z';

async function seedProject(textId: string, unitId: string): Promise<void> {
  await db.texts.put({ id: textId, title: { default: textId }, createdAt: NOW, updatedAt: NOW });
  await LayerTierUnifiedService.createLayer({
    id: `trc-${textId}`,
    textId,
    key: `trc_${textId}`,
    name: { eng: textId },
    layerType: 'transcription',
    languageId: 'eng',
    modality: 'text',
    isDefault: true,
    createdAt: NOW,
    updatedAt: NOW,
  } as LayerDocType);
  await db.media_items.put({
    id: `media-${textId}`,
    textId,
    filename: `${textId}.wav`,
    isOfflineCached: false,
    timelineKind: 'acoustic',
    byteLocation: 'none',
    availability: 'missing',
    createdAt: NOW,
  } as MediaItemDocType);
  await putTestUnitAsLayerUnit(
    db,
    {
      id: unitId,
      textId,
      mediaId: `media-${textId}`,
      startTime: 0,
      endTime: 1,
      transcription: { default: textId },
      createdAt: NOW,
      updatedAt: NOW,
    } as LayerUnitDocType,
    `trc-${textId}`,
  );
  await db.unit_tokens.put({
    id: `tok-${textId}`,
    textId,
    unitId,
    form: { default: textId },
    tokenIndex: 0,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function renderLoader() {
  const captured = { units: [] as LayerUnitDocType[], state: undefined as DbState | undefined };
  const setUnits = vi.fn((next: React.SetStateAction<LayerUnitDocType[]>) => {
    captured.units = typeof next === 'function' ? next(captured.units) : next;
  });
  const onScopeLoaded = vi.fn();
  const setState = vi.fn((next: React.SetStateAction<DbState>) => {
    captured.state = typeof next === 'function' ? next(captured.state as DbState) : next;
  });
  const hook = renderHook(() =>
    useTranscriptionSnapshotLoader({
      dbNameRef: { current: undefined },
      setAnchors: vi.fn(),
      setLayerLinks: vi.fn(),
      setLayers: vi.fn(),
      setMediaItems: vi.fn(),
      setSpeakers: vi.fn(),
      setSelectedLayerId: vi.fn(),
      setState,
      setTranslations: vi.fn(),
      setUnitDrafts: vi.fn(),
      setUnits,
      onScopeLoaded,
    }),
  );
  return { ...hook, captured, setUnits, onScopeLoaded, setState };
}

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map((table) => table.clear()));
  clearActiveProjectTextId();
});

afterEach(() => {
  vi.restoreAllMocks();
  clearActiveProjectTextId();
});

describe('workspace snapshot commit', () => {
  it('applies nothing when a read fails after earlier reads have finished', async () => {
    await seedProject('proj-A', 'a-unit');
    vi.spyOn(LinguisticService.speakers, 'listForProject').mockRejectedValue(
      new Error('speakers down'),
    );
    const { result, setUnits, onScopeLoaded, setState } = renderLoader();

    await expect(result.current.loadSnapshot('proj-A')).rejects.toThrow('speakers down');

    expect(setUnits).not.toHaveBeenCalled();
    expect(onScopeLoaded).not.toHaveBeenCalled();
    expect(setState).not.toHaveBeenCalled();
  });

  it('drops an older load that finishes after a newer one has committed', async () => {
    await seedProject('proj-A', 'a-unit');
    await seedProject('proj-B', 'b-unit');
    let releaseA: () => void = () => undefined;
    const gateA = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    const listForProject = LinguisticService.speakers.listForProject.bind(
      LinguisticService.speakers,
    );
    vi.spyOn(LinguisticService.speakers, 'listForProject').mockImplementation(
      async (textId: string) => {
        if (textId === 'proj-A') await gateA;
        return listForProject(textId);
      },
    );
    const { result, captured, onScopeLoaded } = renderLoader();

    let outcomeA: WorkspaceSnapshotLoadResult | undefined;
    const pendingA = result.current.loadSnapshot('proj-A').then((outcome) => {
      outcomeA = outcome;
    });
    await waitFor(() =>
      expect(LinguisticService.speakers.listForProject).toHaveBeenCalledWith('proj-A'),
    );
    let outcomeB: WorkspaceSnapshotLoadResult | undefined;
    await act(async () => {
      outcomeB = await result.current.loadSnapshot('proj-B');
    });
    releaseA();
    await act(async () => {
      await pendingA;
    });

    expect(outcomeB).toEqual({ committed: true });
    expect(outcomeA).toEqual({ committed: false, reason: 'superseded' });
    expect(captured.units.map((row) => row.id)).toEqual(['b-unit']);
    expect(onScopeLoaded.mock.lastCall?.[0]).toContain('proj-B');
    expect(captured.state).toMatchObject({ phase: 'ready' });
  });

  it('does not commit a load whose document scope changed before commit', async () => {
    const textId = 'proj-docs';
    await db.texts.put({ id: textId, title: { default: textId }, createdAt: NOW, updatedAt: NOW });
    const firstDocumentId = await ensureDefaultAnnotationDocument(textId);
    await LayerTierUnifiedService.createLayer({
      id: 'trc-1',
      textId,
      key: 'trc_1',
      name: { eng: 'one' },
      layerType: 'transcription',
      languageId: 'eng',
      modality: 'text',
      isDefault: true,
      createdAt: NOW,
      updatedAt: NOW,
    } as LayerDocType);
    await db.media_items.put({
      id: 'media-docs',
      textId,
      filename: 'docs.wav',
      isOfflineCached: false,
      timelineKind: 'acoustic',
      byteLocation: 'none',
      availability: 'missing',
      createdAt: NOW,
    } as MediaItemDocType);
    await putTestUnitAsLayerUnit(
      db,
      {
        id: 'u-1',
        textId,
        mediaId: 'media-docs',
        startTime: 0,
        endTime: 1,
        transcription: { default: 'one' },
        createdAt: NOW,
        updatedAt: NOW,
      } as LayerUnitDocType,
      'trc-1',
    );
    await createAnnotationDocument(textId, 'two');
    await LayerTierUnifiedService.createLayer({
      id: 'trc-2',
      textId,
      key: 'trc_2',
      name: { eng: 'two' },
      layerType: 'transcription',
      languageId: 'eng',
      modality: 'text',
      isDefault: true,
      createdAt: NOW,
      updatedAt: NOW,
    } as LayerDocType);
    await putTestUnitAsLayerUnit(
      db,
      {
        id: 'u-2',
        textId,
        mediaId: 'media-docs',
        startTime: 0,
        endTime: 1,
        transcription: { default: 'two' },
        createdAt: NOW,
        updatedAt: NOW,
      } as LayerUnitDocType,
      'trc-2',
    );
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(LinguisticService.speakers, 'listForProject').mockImplementation(async () => {
      await gate;
      return [];
    });
    const { result, setUnits, onScopeLoaded } = renderLoader();

    const pending = result.current.loadSnapshot(textId);
    await waitFor(() => expect(LinguisticService.speakers.listForProject).toHaveBeenCalled());
    await switchAnnotationDocument(textId, firstDocumentId);
    release();

    await expect(pending).resolves.toEqual({ committed: false, reason: 'superseded' });
    expect(setUnits).not.toHaveBeenCalled();
    expect(onScopeLoaded).not.toHaveBeenCalled();
  });

  it('does not commit after the loader unmounts', async () => {
    await seedProject('proj-A', 'a-unit');
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(LinguisticService.speakers, 'listForProject').mockImplementation(async () => {
      await gate;
      return [];
    });
    const { result, unmount, setUnits } = renderLoader();
    const pending = result.current.loadSnapshot('proj-A');
    await waitFor(() => expect(LinguisticService.speakers.listForProject).toHaveBeenCalled());
    unmount();
    release();

    await expect(pending).resolves.toEqual({ committed: false, reason: 'superseded' });
    expect(setUnits).not.toHaveBeenCalled();
  });

  it('does not let an older annotation read overwrite a newer one', async () => {
    await seedProject('proj-B', 'b-unit');
    const { result, captured } = renderLoader();
    await act(async () => {
      await result.current.loadSnapshot('proj-B');
    });

    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let held = false;
    const table = (await getDb()).dexie.unit_tokens;
    const originalWhere = table.where.bind(table);
    vi.spyOn(table, 'where').mockImplementation(((index: string) => {
      const collection = originalWhere(index as 'textId');
      if (index !== 'textId' || held) return collection;
      return {
        equals(value: string) {
          const scoped = collection.equals(value);
          return {
            toArray: () => {
              const read = scoped.toArray();
              held = true;
              return read.then(async (rows) => {
                await gate;
                return rows;
              });
            },
          };
        },
      };
    }) as typeof table.where);

    const pending = result.current.loadLinguisticAnnotations('proj-B');
    await waitFor(() => expect(held).toBe(true));
    await db.unit_tokens.update('tok-proj-B', { form: { default: 'newer' } });
    await act(async () => {
      await result.current.loadLinguisticAnnotations('proj-B');
    });
    release();
    await act(async () => {
      await pending;
    });

    expect(captured.units[0]?.words?.[0]?.form).toEqual({ default: 'newer' });
  });
});

describe('useTranscriptionLifecycle load follow-up', () => {
  it('does not start annotations or set an error when the load was superseded', async () => {
    publishActiveProjectTextId('text-1');
    const loadLinguisticAnnotations = vi.fn(async () => ({ applied: true as const }));
    const setState = vi.fn();
    renderHook(() =>
      useTranscriptionLifecycle({
        loadSnapshot: async () => ({ committed: false, reason: 'superseded' }),
        loadLinguisticAnnotations,
        setState,
        dbNameRef: { current: undefined },
        dirtyRef: { current: false },
        unitsRef: { current: [] },
        translationsRef: { current: [] },
        layersRef: { current: [] },
        autoSaveTimersRef: { current: {} },
        recoveryCancel: vi.fn(),
        saveState: { kind: 'idle' },
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(loadLinguisticAnnotations).not.toHaveBeenCalled();
    expect(setState).not.toHaveBeenCalled();
  });

  it('sets the error phase when the current load fails, without starting annotations', async () => {
    publishActiveProjectTextId('text-1');
    const loadLinguisticAnnotations = vi.fn(async () => ({ applied: true as const }));
    const setState = vi.fn();
    renderHook(() =>
      useTranscriptionLifecycle({
        loadSnapshot: async () => {
          throw new Error('read failed');
        },
        loadLinguisticAnnotations,
        setState,
        dbNameRef: { current: undefined },
        dirtyRef: { current: false },
        unitsRef: { current: [] },
        translationsRef: { current: [] },
        layersRef: { current: [] },
        autoSaveTimersRef: { current: {} },
        recoveryCancel: vi.fn(),
        saveState: { kind: 'idle' },
      }),
    );

    await waitFor(() =>
      expect(setState).toHaveBeenCalledWith({ phase: 'error', message: 'read failed' }),
    );
    expect(loadLinguisticAnnotations).not.toHaveBeenCalled();
  });
});
