// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import type {
  AnchorDocType,
  LayerLinkDocType,
  LayerDocType,
  MediaItemDocType,
  SpeakerDocType,
  UtteranceDocType,
  UtteranceTextDocType,
} from '../db';
import { db } from '../db';
import { LayerTierUnifiedService } from '../services/LayerTierUnifiedService';
import type { DbState, TimelineUnit } from './transcriptionTypes';
import { useTranscriptionSnapshotLoader } from './useTranscriptionSnapshotLoader';

async function clearDatabase(): Promise<void> {
  await Promise.all([
    db.utterances.clear(),
    db.anchors.clear(),
    db.tier_definitions.clear(),
    db.media_items.clear(),
    db.speakers.clear(),
    db.layer_links.clear(),
    db.utterance_tokens.clear(),
    db.utterance_morphemes.clear(),
    db.layer_segments.clear(),
    db.layer_segment_contents.clear(),
    db.segment_links.clear(),
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
    await db.utterances.put({
      id: 'utt-1',
      textId: 'text-1',
      mediaId: 'media-1',
      startTime: 0,
      endTime: 1,
      transcription: { default: 'hello' },
      createdAt: now,
      updatedAt: now,
    } as UtteranceDocType);

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

    const dbNameRef = { current: undefined as string | undefined };

    let selectedLayerId = '';
    const selectedTimelineUnitCalls: Array<TimelineUnit | null> = [];

    const setAnchors = vi.fn<(next: React.SetStateAction<AnchorDocType[]>) => void>();
    const setLayerLinks = vi.fn<(next: React.SetStateAction<LayerLinkDocType[]>) => void>();
    const setLayers = vi.fn<(next: React.SetStateAction<LayerDocType[]>) => void>();
    const setMediaItems = vi.fn<(next: React.SetStateAction<MediaItemDocType[]>) => void>();
    const setSpeakers = vi.fn<(next: React.SetStateAction<SpeakerDocType[]>) => void>();
    const setSelectedUtteranceIds = vi.fn<(next: React.SetStateAction<Set<string>>) => void>();
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
      setSelectedUtteranceIds,
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
});
