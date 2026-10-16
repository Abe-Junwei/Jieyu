// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { db } from '../db';
import { isDictKey, t as translate, tf as formatMessage } from '../i18n';
import { LinguisticService } from '../services/LinguisticService';
import { readProjectSpeakerIds } from '../services/speakerProjectMembership';
import {
  clearActiveProjectTextId,
  publishActiveProjectTextId,
} from '../utils/transcriptionUrlDeepLink';
import { useSpeakerActionSegmentMutationCluster } from './useSpeakerActionSegmentMutationCluster';

const projectId = 'speaker-segment-project';
const segmentId = 'speaker-segment-row';

beforeEach(async () => {
  await db.open();
  await Promise.all([db.speakers.clear(), db.layer_units.clear(), db.texts.clear()]);
  const now = new Date().toISOString();
  await db.texts.put({
    id: projectId,
    title: { default: 'Speaker segment project' },
    createdAt: now,
    updatedAt: now,
  });
  await db.layer_units.put({
    id: segmentId,
    textId: projectId,
    layerId: 'speaker-segment-layer',
    unitType: 'segment',
    startTime: 0,
    endTime: 1,
    createdAt: now,
    updatedAt: now,
  });
  publishActiveProjectTextId(projectId);
});

afterEach(() => {
  vi.restoreAllMocks();
  clearActiveProjectTextId();
});

function renderActions(
  speakerOptions: Parameters<
    typeof useSpeakerActionSegmentMutationCluster
  >[0]['speakerOptions'] = [],
) {
  const setSaveState = vi.fn();
  const actions = renderHook(() =>
    useSpeakerActionSegmentMutationCluster({
      speakerSavingRouted: false,
      speakerOptions,
      pushUndo: vi.fn(),
      undo: vi.fn(async () => undefined),
      reloadSegments: vi.fn(async () => undefined),
      refreshSegmentUndoSnapshot: vi.fn(async () => undefined),
      refreshSpeakerReferenceStats: vi.fn(async () => undefined),
      refreshSpeakers: vi.fn(async () => undefined),
      updateSegmentsLocally: vi.fn(),
      setBatchSpeakerId: vi.fn(),
      setSpeakerDraftName: vi.fn(),
      setSaveState,
      t: (key) => (isDictKey(key) ? translate('zh-CN', key) : key),
      tf: (key, params) => (isDictKey(key) ? formatMessage('zh-CN', key, params ?? {}) : key),
    }),
  );
  return { ...actions, setSaveState };
}

it('does not leave a new speaker or roster entry when segment assignment fails', async () => {
  vi.spyOn(db.layer_units, 'bulkPut').mockRejectedValueOnce(new Error('assignment failed'));
  const { result, setSaveState } = renderActions();

  await act(async () => {
    await result.current.createSpeakerAndAssignToSegments('New speaker', [segmentId]);
  });

  expect(await db.speakers.where('textId').equals(projectId).toArray()).toEqual([]);
  expect(readProjectSpeakerIds((await db.texts.get(projectId))?.metadata) ?? []).toEqual([]);
  expect((await db.layer_units.get(segmentId))?.speakerId).toBeUndefined();
  expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' }));
});

it('creates a speaker, updates the project roster, and assigns the segment together', async () => {
  const { result, setSaveState } = renderActions();

  await act(async () => {
    await result.current.createSpeakerAndAssignToSegments('New speaker', [segmentId]);
  });

  const speakers = await db.speakers.where('textId').equals(projectId).toArray();
  expect(speakers).toHaveLength(1);
  expect((await db.layer_units.get(segmentId))?.speakerId).toBe(speakers[0]?.id);
  expect(readProjectSpeakerIds((await db.texts.get(projectId))?.metadata)).toContain(
    speakers[0]?.id,
  );
  expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({ kind: 'done' }));
});

it('reuses an existing speaker while assigning a segment', async () => {
  const speaker = await LinguisticService.speakers.create({ name: 'Existing', textId: projectId });
  const { result, setSaveState } = renderActions([speaker]);

  await act(async () => {
    await result.current.createSpeakerAndAssignToSegments('Existing', [segmentId]);
  });

  expect(await db.speakers.where('textId').equals(projectId).count()).toBe(1);
  expect((await db.layer_units.get(segmentId))?.speakerId).toBe(speaker.id);
  expect(readProjectSpeakerIds((await db.texts.get(projectId))?.metadata)).toContain(speaker.id);
  expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({ kind: 'done' }));
});

it('assigns and clears a segment speaker through the same storage operation', async () => {
  const speaker = await LinguisticService.speakers.create({ name: 'Existing', textId: projectId });
  const { result } = renderActions([speaker]);

  await act(async () => {
    await result.current.handleAssignSpeakerToSegments([segmentId], speaker.id);
  });
  expect((await db.layer_units.get(segmentId))?.speakerId).toBe(speaker.id);

  await act(async () => {
    await result.current.handleAssignSpeakerToSegments([segmentId], undefined);
  });
  expect((await db.layer_units.get(segmentId))?.speakerId).toBeUndefined();
  expect(await db.speakers.where('textId').equals(projectId).count()).toBe(1);
});
