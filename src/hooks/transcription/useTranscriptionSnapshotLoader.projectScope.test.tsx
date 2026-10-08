// @vitest-environment jsdom
/**
 * R-LOADER-SCOPE（代码审查 JY-02 / JY-15 的移植）：loadSnapshot 必须带项目 textId，
 * 工作台状态里只能有该项目的行。
 * R-LOADER-SCOPE (ported from code review JY-02 / JY-15): loadSnapshot takes the project textId and
 * workspace state only ever holds that project's rows.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type {
  AnchorDocType,
  LayerDocType,
  LayerLinkDocType,
  LayerUnitContentDocType,
  LayerUnitDocType,
  MediaItemDocType,
} from '../../db';
import { db } from '../../db';
import { putTestUnitAsLayerUnit } from '../../db/putTestUnitAsLayerUnit';
import { LayerTierUnifiedService } from '../../services/LayerTierUnifiedService';
import type { DbState } from './transcriptionTypes';
import { useTranscriptionSnapshotLoader } from './useTranscriptionSnapshotLoader';

const NOW = '2026-10-09T00:00:00.000Z';

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
  await db.anchors.put({
    id: `anchor-${textId}`,
    mediaId: `media-${textId}`,
    time: 0.5,
    createdAt: NOW,
  });
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
  const captured = {
    units: [] as LayerUnitDocType[],
    layers: [] as LayerDocType[],
    media: [] as MediaItemDocType[],
    anchors: [] as AnchorDocType[],
    links: [] as LayerLinkDocType[],
    translations: [] as LayerUnitContentDocType[],
    state: undefined as DbState | undefined,
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
      setAnchors: vi.fn(apply<AnchorDocType[]>('anchors')),
      setLayerLinks: vi.fn(apply<LayerLinkDocType[]>('links')),
      setLayers: vi.fn(apply<LayerDocType[]>('layers')),
      setMediaItems: vi.fn(apply<MediaItemDocType[]>('media')),
      setSpeakers: vi.fn(),
      setSelectedLayerId: vi.fn(),
      setState: vi.fn(apply<DbState>('state')),
      setTranslations: vi.fn(apply<LayerUnitContentDocType[]>('translations')),
      setUnitDrafts: vi.fn(),
      setUnits: vi.fn(apply<LayerUnitDocType[]>('units')),
    }),
  );
  return { result, captured };
}

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map((table) => table.clear()));
});

describe('R-LOADER-SCOPE: loadSnapshot(textId) only loads that project', () => {
  it('keeps every piece of workspace state inside project B', async () => {
    await seedProject('proj-A', 'a-unit');
    await seedProject('proj-B', 'b-unit');
    const { result, captured } = renderLoader();

    await act(async () => {
      await result.current.loadSnapshot('proj-B');
    });

    expect([...new Set(captured.layers.map((row) => row.textId))]).toEqual(['proj-B']);
    expect(captured.units.map((row) => row.id)).toEqual(['b-unit']);
    expect(captured.media.map((row) => row.id)).toEqual(['media-proj-B']);
    expect(captured.anchors.map((row) => row.id)).toEqual(['anchor-proj-B']);
    expect(captured.state).toMatchObject({ phase: 'ready', unitCount: 1 });

    // 再次载入（导入 / 恢复 / 协同水合后的刷新）仍停在 B | Reloading stays on B
    await act(async () => {
      await result.current.loadSnapshot('proj-B');
    });
    expect([...new Set(captured.units.map((row) => row.textId))]).toEqual(['proj-B']);

    await act(async () => {
      await result.current.loadLinguisticAnnotations('proj-B');
    });
    expect(captured.units[0]?.words?.map((word) => word.id)).toEqual(['tok-proj-B']);
  });

  it('clears the workspace when there is no current project', async () => {
    await seedProject('proj-A', 'a-unit');
    const { result, captured } = renderLoader();

    await act(async () => {
      await result.current.loadSnapshot('proj-A');
    });
    expect(captured.units).toHaveLength(1);

    await act(async () => {
      await result.current.loadSnapshot('');
    });
    expect(captured.units).toEqual([]);
    expect(captured.layers).toEqual([]);
    expect(captured.media).toEqual([]);
    expect(captured.state).toMatchObject({ phase: 'ready', unitCount: 0 });
  });
});
