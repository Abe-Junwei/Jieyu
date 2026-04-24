// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import type { AnchorDocType, LayerLinkDocType, LayerDocType, LayerUnitDocType, MediaItemDocType, SpeakerDocType, LayerUnitContentDocType } from '../db';
import { db, getDb } from '../db';
import { putTestUnitAsLayerUnit } from '../db/putTestUnitAsLayerUnit';
import { LayerTierUnifiedService } from '../services/LayerTierUnifiedService';
import type { DbState, TimelineUnit } from './transcriptionTypes';
import { useTranscriptionSnapshotLoader } from './useTranscriptionSnapshotLoader';

async function clearDatabase(): Promise<void> {
  await Promise.all([
    db.anchors.clear(),
    db.tier_definitions.clear(),
    db.media_items.clear(),
    db.speakers.clear(),
    db.layer_links.clear(),
    db.unit_tokens.clear(),
    db.unit_morphemes.clear(),
    db.layer_units.clear(),
    db.layer_unit_contents.clear(),
    db.unit_relations.clear(),
  ]);
  const rx = await getDb();
  const layerDocs = await rx.collections.layers.find().exec();
  await Promise.all(layerDocs.map((d) => rx.collections.layers.remove(d.id)));
  const rxLinks = await rx.collections.layer_links.find().exec();
  await Promise.all(rxLinks.map((d) => rx.collections.layer_links.remove(d.id)));
}

describe('useTranscriptionSnapshotLoader', () => {
  beforeEach(async () => {
    await db.open();
    await clearDatabase();
  });

  afterEach(async () => {
    cleanup();
    await clearDatabase();
  });

  it('hydrates selectedTimelineUnit with non-empty layerId', async () => {
    const now = new Date().toISOString();

    await LayerTierUnifiedService.createLayer({
      id: 'trc-1',
      textId: 'text-1',
      key: 'trc_1',
      name: { zho: '转写1' },
      layerType: 'transcription',
      languageId: 'zho',
      modality: 'text',
      acceptsAudio: false,
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    } as LayerDocType);

    await LayerTierUnifiedService.createLayer({
      id: 'trl-1',
      textId: 'text-1',
      key: 'trl_1',
      name: { zho: '翻译1' },
      layerType: 'translation',
      languageId: 'eng',
      modality: 'text',
      acceptsAudio: false,
      createdAt: now,
      updatedAt: now,
    } as LayerDocType);

    await putTestUnitAsLayerUnit(db, {
      id: 'utt-1',
      textId: 'text-1',
      mediaId: 'media-1',
      startTime: 0,
      endTime: 1,
      transcription: { default: 'hello' },
      createdAt: now,
      updatedAt: now,
    } as LayerUnitDocType, 'trc-1');

    await db.media_items.put({
      id: 'media-1',
      textId: 'text-1',
      filename: 'placeholder',
      isOfflineCached: false,
      createdAt: now,
      updatedAt: now,
    } as MediaItemDocType);

    const dbNameRef = { current: undefined as string | undefined };

    let selectedLayerId = '';
    const selectedTimelineUnitCalls: Array<TimelineUnit | null> = [];

    const setAnchors = vi.fn<(next: React.SetStateAction<AnchorDocType[]>) => void>();
    const setLayerLinks = vi.fn<(next: React.SetStateAction<LayerLinkDocType[]>) => void>();
    const setLayers = vi.fn<(next: React.SetStateAction<LayerDocType[]>) => void>();
    const setMediaItems = vi.fn<(next: React.SetStateAction<MediaItemDocType[]>) => void>();
    const setSpeakers = vi.fn<(next: React.SetStateAction<SpeakerDocType[]>) => void>();
    const setSelectedUnitIds = vi.fn<(next: React.SetStateAction<Set<string>>) => void>();
    const setState = vi.fn<(next: React.SetStateAction<DbState>) => void>();
    const setTranslations = vi.fn<(next: React.SetStateAction<LayerUnitContentDocType[]>) => void>();
    const setUnitDrafts = vi.fn<(next: React.SetStateAction<Record<string, string>>) => void>();
    const setUnits = vi.fn<(next: React.SetStateAction<LayerUnitDocType[]>) => void>();
    const setSelectedMediaId = vi.fn<(next: React.SetStateAction<string>) => void>();

    const setSelectedLayerId = vi.fn((next: React.SetStateAction<string>) => {
      selectedLayerId = typeof next === 'function' ? next(selectedLayerId) : next;
    });

    const setSelectedTimelineUnit = vi.fn((next: React.SetStateAction<TimelineUnit | null>) => {
      const prev = selectedTimelineUnitCalls.length > 0 ? selectedTimelineUnitCalls[selectedTimelineUnitCalls.length - 1]! : null;
      selectedTimelineUnitCalls.push(typeof next === 'function' ? next(prev) : next);
    });

    const { result } = renderHook(() => useTranscriptionSnapshotLoader({
      dbNameRef,
      setAnchors,
      setLayerLinks,
      setLayers,
      setMediaItems,
      setSpeakers,
      setSelectedLayerId,
      setSelectedUnitIds,
      setSelectedTimelineUnit,
      setSelectedMediaId,
      setState,
      setTranslations,
      setUnitDrafts,
      setUnits,
    }));

    await act(async () => {
      await result.current.loadSnapshot();
    });

    expect(setSelectedMediaId).toHaveBeenCalled();
    const mediaIdSetter = setSelectedMediaId.mock.calls[setSelectedMediaId.mock.calls.length - 1]![0];
    const resolvedMediaId = typeof mediaIdSetter === 'function' ? mediaIdSetter('') : mediaIdSetter;
    expect(resolvedMediaId).toBe('media-1');

    const selectedTimelineUnit = selectedTimelineUnitCalls[selectedTimelineUnitCalls.length - 1];
    expect(selectedLayerId).toBeTruthy();
    expect(selectedTimelineUnit?.kind).toBe('unit');
    expect(selectedTimelineUnit?.layerId).toBeTruthy();
    expect(selectedTimelineUnit?.layerId).toBe(selectedLayerId);
  });

  it('sets ready unifiedUnitCount using merged unit + segment semantics while unitCount remains unit rows', async () => {
    const now = new Date().toISOString();

    await LayerTierUnifiedService.createLayer({
      id: 'trc-1',
      textId: 'text-1',
      key: 'trc_1',
      name: { zho: '转写1' },
      layerType: 'transcription',
      languageId: 'zho',
      modality: 'text',
      acceptsAudio: false,
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    } as LayerDocType);

    await LayerTierUnifiedService.createLayer({
      id: 'trl-1',
      textId: 'text-1',
      key: 'trl_1',
      name: { zho: '翻译1' },
      layerType: 'translation',
      languageId: 'eng',
      modality: 'text',
      acceptsAudio: false,
      createdAt: now,
      updatedAt: now,
    } as LayerDocType);

    await putTestUnitAsLayerUnit(db, {
      id: 'utt-1',
      textId: 'text-1',
      mediaId: 'media-1',
      startTime: 0,
      endTime: 1,
      transcription: { default: 'hello' },
      createdAt: now,
      updatedAt: now,
    } as LayerUnitDocType, 'trc-1');

    await db.layer_units.put({
      id: 'seg-shadow',
      textId: 'text-1',
      mediaId: 'media-1',
      layerId: 'trl-1',
      unitType: 'segment',
      parentUnitId: 'utt-1',
      startTime: 0,
      endTime: 1,
      createdAt: now,
      updatedAt: now,
    } as LayerUnitDocType);

    await db.layer_units.put({
      id: 'seg-extra',
      textId: 'text-1',
      mediaId: 'media-1',
      layerId: 'trl-1',
      unitType: 'segment',
      startTime: 1,
      endTime: 2,
      createdAt: now,
      updatedAt: now,
    } as LayerUnitDocType);

    const dbNameRef = { current: undefined as string | undefined };
    const setAnchors = vi.fn<(next: React.SetStateAction<AnchorDocType[]>) => void>();
    const setLayerLinks = vi.fn<(next: React.SetStateAction<LayerLinkDocType[]>) => void>();
    const setLayers = vi.fn<(next: React.SetStateAction<LayerDocType[]>) => void>();
    const setMediaItems = vi.fn<(next: React.SetStateAction<MediaItemDocType[]>) => void>();
    const setSpeakers = vi.fn<(next: React.SetStateAction<SpeakerDocType[]>) => void>();
    const setSelectedUnitIds = vi.fn<(next: React.SetStateAction<Set<string>>) => void>();
    const setState = vi.fn<(next: React.SetStateAction<DbState>) => void>();
    const setTranslations = vi.fn<(next: React.SetStateAction<LayerUnitContentDocType[]>) => void>();
    const setUnitDrafts = vi.fn<(next: React.SetStateAction<Record<string, string>>) => void>();
    const setUnits = vi.fn<(next: React.SetStateAction<LayerUnitDocType[]>) => void>();
    const setSelectedLayerId = vi.fn<(next: React.SetStateAction<string>) => void>();
    const setSelectedTimelineUnit = vi.fn<(next: React.SetStateAction<TimelineUnit | null>) => void>();
    const setSelectedMediaId = vi.fn<(next: React.SetStateAction<string>) => void>();

    const { result } = renderHook(() => useTranscriptionSnapshotLoader({
      dbNameRef,
      setAnchors,
      setLayerLinks,
      setLayers,
      setMediaItems,
      setSpeakers,
      setSelectedLayerId,
      setSelectedUnitIds,
      setSelectedTimelineUnit,
      setSelectedMediaId,
      setState,
      setTranslations,
      setUnitDrafts,
      setUnits,
    }));

    await act(async () => {
      await result.current.loadSnapshot();
    });

    const readyPayload = setState.mock.calls
      .map((c) => c[0])
      .find((arg): arg is Extract<DbState, { phase: 'ready' }> =>
        typeof arg === 'object' && arg !== null && 'phase' in arg && (arg as DbState).phase === 'ready');
    expect(readyPayload?.unitCount).toBe(1);
    expect(readyPayload?.unifiedUnitCount).toBe(2);
  });

  it('loadSnapshot rejects symbolic_association transcription without parent or host link', async () => {
    const now = new Date().toISOString();

    await LayerTierUnifiedService.createLayer({
      id: 'trc-root',
      textId: 'text-bad',
      key: 'trc_root',
      name: { zho: '根' },
      layerType: 'transcription',
      languageId: 'zho',
      modality: 'text',
      acceptsAudio: false,
      isDefault: true,
      constraint: 'independent_boundary',
      createdAt: now,
      updatedAt: now,
    } as LayerDocType);

    await LayerTierUnifiedService.createLayer({
      id: 'trc-orphan',
      textId: 'text-bad',
      key: 'trc_orphan',
      name: { zho: '孤儿依赖' },
      layerType: 'transcription',
      languageId: 'cmn',
      modality: 'text',
      acceptsAudio: false,
      constraint: 'symbolic_association',
      createdAt: now,
      updatedAt: now,
    } as LayerDocType);

    await putTestUnitAsLayerUnit(db, {
      id: 'utt-bad',
      textId: 'text-bad',
      mediaId: 'media-bad',
      startTime: 0,
      endTime: 1,
      transcription: { default: 'x' },
      createdAt: now,
      updatedAt: now,
    } as LayerUnitDocType, 'trc-root');

    await db.media_items.put({
      id: 'media-bad',
      textId: 'text-bad',
      filename: 'placeholder',
      isOfflineCached: false,
      createdAt: now,
      updatedAt: now,
    } as MediaItemDocType);

    const dbNameRef = { current: undefined as string | undefined };
    const { result } = renderHook(() => useTranscriptionSnapshotLoader({
      dbNameRef,
      setAnchors: vi.fn(),
      setLayerLinks: vi.fn(),
      setLayers: vi.fn(),
      setMediaItems: vi.fn(),
      setSpeakers: vi.fn(),
      setSelectedLayerId: vi.fn(),
      setSelectedUnitIds: vi.fn(),
      setSelectedTimelineUnit: vi.fn(),
      setSelectedMediaId: vi.fn(),
      setState: vi.fn(),
      setTranslations: vi.fn(),
      setUnitDrafts: vi.fn(),
      setUnits: vi.fn(),
    }));

    await expect(
      act(async () => {
        await result.current.loadSnapshot();
      }),
    ).rejects.toThrow(/transcription-dependency-invariant/);
  });
});
