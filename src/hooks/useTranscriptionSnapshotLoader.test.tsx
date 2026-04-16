// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import type {
  AnchorDocType,
  LayerLinkDocType,
  LayerDocType,
  LayerUnitDocType,
  MediaItemDocType,
  SpeakerDocType,
  UtteranceDocType,
  UtteranceTextDocType,
} from '../db';
import { db } from '../db';
import { putTestUtteranceAsLayerUnit } from '../db/putTestUtteranceAsLayerUnit';
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
    db.utterance_tokens.clear(),
    db.utterance_morphemes.clear(),
    db.layer_units.clear(),
    db.layer_unit_contents.clear(),
    db.unit_relations.clear(),
  ]);
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

    await putTestUtteranceAsLayerUnit(db, {
      id: 'utt-1',
      textId: 'text-1',
      mediaId: 'media-1',
      startTime: 0,
      endTime: 1,
      transcription: { default: 'hello' },
      createdAt: now,
      updatedAt: now,
    } as UtteranceDocType, 'trc-1');

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
    const setTranslations = vi.fn<(next: React.SetStateAction<UtteranceTextDocType[]>) => void>();
    const setUtteranceDrafts = vi.fn<(next: React.SetStateAction<Record<string, string>>) => void>();
    const setUtterances = vi.fn<(next: React.SetStateAction<UtteranceDocType[]>) => void>();

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
      setState,
      setTranslations,
      setUtteranceDrafts,
      setUtterances,
    }));

    await act(async () => {
      await result.current.loadSnapshot();
    });

    const selectedTimelineUnit = selectedTimelineUnitCalls[selectedTimelineUnitCalls.length - 1];
    expect(selectedLayerId).toBeTruthy();
    expect(selectedTimelineUnit?.kind).toBe('utterance');
    expect(selectedTimelineUnit?.layerId).toBeTruthy();
    expect(selectedTimelineUnit?.layerId).toBe(selectedLayerId);
  });

  it('sets ready unifiedUnitCount using merged utterance + segment semantics while unitCount remains utterance rows', async () => {
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

    await putTestUtteranceAsLayerUnit(db, {
      id: 'utt-1',
      textId: 'text-1',
      mediaId: 'media-1',
      startTime: 0,
      endTime: 1,
      transcription: { default: 'hello' },
      createdAt: now,
      updatedAt: now,
    } as UtteranceDocType, 'trc-1');

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
    const setTranslations = vi.fn<(next: React.SetStateAction<UtteranceTextDocType[]>) => void>();
    const setUtteranceDrafts = vi.fn<(next: React.SetStateAction<Record<string, string>>) => void>();
    const setUtterances = vi.fn<(next: React.SetStateAction<UtteranceDocType[]>) => void>();
    const setSelectedLayerId = vi.fn<(next: React.SetStateAction<string>) => void>();
    const setSelectedTimelineUnit = vi.fn<(next: React.SetStateAction<TimelineUnit | null>) => void>();

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
      setState,
      setTranslations,
      setUtteranceDrafts,
      setUtterances,
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
});
