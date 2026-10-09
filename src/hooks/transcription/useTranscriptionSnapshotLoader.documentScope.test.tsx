// @vitest-environment jsdom
/**
 * 第 5 批多文稿：工作台只装当前文稿的层、单元和文本；默认转写层与“删最后一个转写层”的单元范围
 * 也只在当前文稿里。
 * Batch 5 multi-document: the workspace only loads the current document's layers, units and texts;
 * the default transcription layer and the "delete last transcription layer" unit set stay inside it.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { LayerDocType, LayerUnitContentDocType, LayerUnitDocType } from '../../db';
import { db, getDb } from '../../db';
import { putTestUnitAsLayerUnit } from '../../db/putTestUnitAsLayerUnit';
import { LayerTierUnifiedService } from '../../services/LayerTierUnifiedService';
import {
  listUnitUnitPrimaryKeysByTextId,
  resolveDefaultTranscriptionLayerId,
} from '../../services/LayerSegmentGraphService';
import {
  createAnnotationDocument,
  ensureDefaultAnnotationDocument,
  switchAnnotationDocument,
} from '../../services/annotationDocumentService';
import { useTranscriptionSnapshotLoader } from './useTranscriptionSnapshotLoader';

const NOW = '2026-10-09T00:00:00.000Z';
const P = 'proj-docs';

async function seedLayerWithUnit(layerId: string, unitId: string): Promise<void> {
  await LayerTierUnifiedService.createLayer({
    id: layerId,
    textId: P,
    key: `trc_${layerId}`,
    name: { eng: layerId },
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
      id: unitId,
      textId: P,
      mediaId: 'media-1',
      startTime: 0,
      endTime: 1,
      transcription: { default: unitId },
      createdAt: NOW,
      updatedAt: NOW,
    } as LayerUnitDocType,
    layerId,
  );
}

function renderLoader(onScopeLoaded: (key: string) => void) {
  const captured = {
    units: [] as LayerUnitDocType[],
    layers: [] as LayerDocType[],
    translations: [] as LayerUnitContentDocType[],
  };
  const apply =
    <T,>(key: keyof typeof captured) =>
    (next: React.SetStateAction<T>) => {
      const prev = captured[key] as T;
      (captured as Record<string, unknown>)[key] =
        typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
    };
  const { result } = renderHook(() =>
    useTranscriptionSnapshotLoader({
      dbNameRef: { current: undefined },
      setAnchors: vi.fn(),
      setLayerLinks: vi.fn(),
      setLayers: vi.fn(apply<LayerDocType[]>('layers')),
      setMediaItems: vi.fn(),
      setSpeakers: vi.fn(),
      setSelectedLayerId: vi.fn(),
      setState: vi.fn(),
      setTranslations: vi.fn(apply<LayerUnitContentDocType[]>('translations')),
      setUnitDrafts: vi.fn(),
      setUnits: vi.fn(apply<LayerUnitDocType[]>('units')),
      onScopeLoaded,
    }),
  );
  return { result, captured };
}

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map((table) => table.clear()));
  localStorage.clear();
  await db.texts.put({ id: P, title: { default: P }, createdAt: NOW, updatedAt: NOW });
});

describe('Batch 5: workspace state follows the current document', () => {
  it('loads only the current document and reports a scope key per document', async () => {
    const d1 = await ensureDefaultAnnotationDocument(P);
    await seedLayerWithUnit('trc-1', 'u-1');
    const d2 = await createAnnotationDocument(P, 'two');
    await seedLayerWithUnit('trc-2', 'u-2');
    const onScopeLoaded = vi.fn();
    const { result, captured } = renderLoader(onScopeLoaded);

    await act(async () => {
      await result.current.loadSnapshot(P);
    });
    expect(captured.layers.map((row) => row.id)).toEqual(['trc-2']);
    expect(captured.units.map((row) => row.id)).toEqual(['u-2']);
    expect(captured.translations.some((row) => row.layerId === 'trc-1')).toBe(false);
    expect(onScopeLoaded).toHaveBeenLastCalledWith(`${P}\u0000${d2}`);

    await switchAnnotationDocument(P, d1);
    await act(async () => {
      await result.current.loadSnapshot(P);
    });
    expect(captured.layers.map((row) => row.id)).toEqual(['trc-1']);
    expect(captured.units.map((row) => row.id)).toEqual(['u-1']);
    expect(onScopeLoaded).toHaveBeenLastCalledWith(`${P}\u0000${d1}`);
  });

  it('the default transcription layer and the last-layer unit set stay in the current document', async () => {
    await ensureDefaultAnnotationDocument(P);
    await seedLayerWithUnit('trc-1', 'u-1');
    await createAnnotationDocument(P);
    await seedLayerWithUnit('trc-2', 'u-2');
    const dexieDb = await getDb();
    expect(await resolveDefaultTranscriptionLayerId(dexieDb, P)).toBe('trc-2');
    expect(await listUnitUnitPrimaryKeysByTextId(dexieDb, P, new Set(['trc-2']))).toEqual(['u-2']);
    expect((await listUnitUnitPrimaryKeysByTextId(dexieDb, P)).sort()).toEqual(['u-1', 'u-2']);
  });
});
