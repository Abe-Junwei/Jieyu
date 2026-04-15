// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import type { SpeakerDocType, UtteranceDocType } from '../db';
import { isDictKey, t as translate, tf as formatMessage } from '../i18n';
import { useSpeakerActions, type UseSpeakerActionsOptions } from './useSpeakerActions';
import { EMPTY_SPEAKER_REFERENCE_STATS } from './speakerManagement/types';

vi.mock('../services/LinguisticService', () => ({
  LinguisticService: {
    getSpeakers: vi.fn(async () => []),
    createSpeaker: vi.fn(),
    renameSpeaker: vi.fn(),
    mergeSpeakers: vi.fn(),
    deleteSpeaker: vi.fn(),
    assignSpeakerToUtterances: vi.fn(),
    getSpeakerReferenceStats: vi.fn(async () => ({ perSpeaker: {}, unassigned: { transcriptionUnitCount: 0, segmentCount: 0, totalCount: 0 } })),
  },
}));

import { LinguisticService } from '../services/LinguisticService';

afterEach(() => {
  vi.clearAllMocks();
});

function makeUtterance(overrides: Partial<UtteranceDocType> = {}): UtteranceDocType {
  const base: Record<string, unknown> = {
    id: 'utt-1',
    textId: 'text-1',
    mediaId: 'media-1',
    startTime: 0,
    endTime: 1,
    createdAt: '2026-03-23T00:00:00.000Z',
    updatedAt: '2026-03-23T00:00:00.000Z',
    annotationStatus: 'raw',
  };
  return { ...base, ...overrides } as UtteranceDocType;
}

function makeSpeaker(overrides: Partial<SpeakerDocType> = {}): SpeakerDocType {
  return {
    id: 'speaker-1',
    name: '说话人甲',
    createdAt: '2026-03-23T00:00:00.000Z',
    updatedAt: '2026-03-23T00:00:00.000Z',
    ...overrides,
  };
}

type HookHarnessResult = ReturnType<typeof useSpeakerActions> & {
  utterancesState: UtteranceDocType[];
  speakersState: SpeakerDocType[];
};

function makeOptions(
  overrides: Partial<UseSpeakerActionsOptions> = {},
): UseSpeakerActionsOptions {
  const utterances = overrides.utterances ?? [makeUtterance()];
  const t = overrides.t ?? ((key: string) => (isDictKey(key) ? translate('zh-CN', key) : key));
  const tf = overrides.tf ?? (
    (key: string, params?: Record<string, string | number>) => (
      isDictKey(key)
        ? formatMessage('zh-CN', key, params ?? {})
        : key
    )
  );
  return {
    utterances,
    setUtterances: overrides.setUtterances ?? (vi.fn() as unknown as UseSpeakerActionsOptions['setUtterances']),
    speakers: overrides.speakers ?? [makeSpeaker()],
    setSpeakers: overrides.setSpeakers ?? (vi.fn() as unknown as UseSpeakerActionsOptions['setSpeakers']),
    utterancesOnCurrentMedia: overrides.utterancesOnCurrentMedia ?? utterances,
    activeUnitId: overrides.activeUnitId ?? utterances[0]?.id ?? null,
    selectedUnitIds: overrides.selectedUnitIds ?? new Set<string>(),
    selectedBatchUtterances: overrides.selectedBatchUtterances ?? [],
    isReady: overrides.isReady ?? false,
    setUnitSelection: overrides.setUnitSelection ?? vi.fn(),
    data: overrides.data ?? {
      pushUndo: vi.fn(),
      undo: vi.fn(async () => {}),
    },
    setSaveState: overrides.setSaveState ?? vi.fn(),
    getUtteranceTextForLayer: overrides.getUtteranceTextForLayer ?? (() => '示例文本'),
    formatTime: overrides.formatTime ?? ((seconds: number) => `${seconds.toFixed(1)}s`),
    t,
    tf,
  };
}

function renderSpeakerActions(options: Partial<UseSpeakerActionsOptions> = {}) {
  const resolved = makeOptions(options);
  return renderHook((): HookHarnessResult => {
    const [utterancesState, setUtterances] = useState(resolved.utterances);
    const [speakersState, setSpeakers] = useState(resolved.speakers);
    const hook = useSpeakerActions({
      ...resolved,
      utterances: utterancesState,
      setUtterances,
      speakers: speakersState,
      setSpeakers,
      utterancesOnCurrentMedia: options.utterancesOnCurrentMedia ?? utterancesState,
    });
    return {
      ...hook,
      utterancesState,
      speakersState,
    };
  });
}

describe('useSpeakerActions dialog flows', () => {
  beforeEach(() => {
    vi.mocked(LinguisticService.getSpeakers).mockResolvedValue([]);
    vi.mocked(LinguisticService.getSpeakerReferenceStats).mockResolvedValue({
      perSpeaker: {},
      unassigned: EMPTY_SPEAKER_REFERENCE_STATS,
    });
  });

  it('renames a speaker through dialog flow and updates local state', async () => {
    const setSaveState = vi.fn();
    const pushUndo = vi.fn();
    const renamedSpeaker = makeSpeaker({ id: 'speaker-1', name: '新名字', updatedAt: '2026-03-24T00:00:00.000Z' });
    vi.mocked(LinguisticService.renameSpeaker).mockResolvedValue(renamedSpeaker);

    const { result } = renderSpeakerActions({
      utterances: [makeUtterance({ id: 'utt-1', speakerId: 'speaker-1', speaker: '旧名字' })],
      speakers: [makeSpeaker({ id: 'speaker-1', name: '旧名字' })],
      setSaveState,
      data: {
        pushUndo,
        undo: vi.fn(async () => {}),
      },
    });

    act(() => {
      result.current.handleRenameSpeaker('speaker-1');
    });

    expect(result.current.speakerDialogState).toEqual(expect.objectContaining({ mode: 'rename', draftName: '旧名字' }));

    act(() => {
      result.current.updateSpeakerDialogDraftName('新名字');
    });

    await act(async () => {
      await result.current.confirmSpeakerDialog();
    });

    expect(pushUndo).toHaveBeenCalledWith('重命名说话人');
    expect(LinguisticService.renameSpeaker).toHaveBeenCalledWith('speaker-1', '新名字');
    expect(result.current.speakersState[0]?.name).toBe('新名字');
    expect(result.current.utterancesState[0]?.speaker).toBe('新名字');
    expect(result.current.speakerDialogState).toBeNull();
    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({ kind: 'done' }));
  });

  it('opens rename dialog for speaker entities even when current filter list is empty', () => {
    const { result } = renderSpeakerActions({
      speakers: [makeSpeaker({ id: 'speaker-1', name: '旧名字' })],
      speakerFilterOptionsOverride: [],
    });

    act(() => {
      result.current.handleRenameSpeaker('speaker-1');
    });

    expect(result.current.speakerDialogState).toEqual(expect.objectContaining({
      mode: 'rename',
      speakerKey: 'speaker-1',
      draftName: '旧名字',
    }));
  });

  it('merges a speaker through dialog flow and migrates utterances locally', async () => {
    const setSaveState = vi.fn();
    vi.mocked(LinguisticService.mergeSpeakers).mockResolvedValue(1);

    const { result } = renderSpeakerActions({
      utterances: [
        makeUtterance({ id: 'utt-1', speakerId: 'speaker-1', speaker: '来源说话人' }),
        makeUtterance({ id: 'utt-2', speakerId: 'speaker-2', speaker: '目标说话人', startTime: 2, endTime: 3 }),
      ],
      speakers: [
        makeSpeaker({ id: 'speaker-1', name: '来源说话人' }),
        makeSpeaker({ id: 'speaker-2', name: '目标说话人' }),
      ],
      setSaveState,
      data: {
        pushUndo: vi.fn(),
        undo: vi.fn(async () => {}),
      },
    });

    act(() => {
      result.current.handleMergeSpeaker('speaker-1');
    });

    expect(result.current.speakerDialogState).toEqual(expect.objectContaining({ mode: 'merge', sourceSpeakerKey: 'speaker-1' }));

    act(() => {
      result.current.updateSpeakerDialogTargetKey('speaker-2');
    });

    await act(async () => {
      await result.current.confirmSpeakerDialog();
    });

    expect(LinguisticService.mergeSpeakers).toHaveBeenCalledWith('speaker-1', 'speaker-2');
    expect(result.current.speakersState.map((speaker) => speaker.id)).toEqual(['speaker-2']);
    expect(result.current.utterancesState[0]?.speakerId).toBe('speaker-2');
    expect(result.current.utterancesState[0]?.speaker).toBe('目标说话人');
    expect(result.current.activeSpeakerFilterKey).toBe('speaker-2');
    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({ kind: 'done' }));
  });

  it('clears speaker assignments through dialog flow and drops local speaker fields', async () => {
    const setSaveState = vi.fn();
    vi.mocked(LinguisticService.assignSpeakerToUtterances).mockResolvedValue(1);

    const { result } = renderSpeakerActions({
      utterances: [makeUtterance({ id: 'utt-1', speakerId: 'speaker-1', speaker: '说话人甲' })],
      speakers: [makeSpeaker({ id: 'speaker-1', name: '说话人甲' })],
      setSaveState,
      data: {
        pushUndo: vi.fn(),
        undo: vi.fn(async () => {}),
      },
    });

    act(() => {
      result.current.setActiveSpeakerFilterKey('speaker-1');
      result.current.handleClearSpeakerAssignments('speaker-1');
    });

    expect(result.current.speakerDialogState).toEqual(expect.objectContaining({ mode: 'clear', speakerKey: 'speaker-1' }));

    await act(async () => {
      await result.current.confirmSpeakerDialog();
    });

    expect(LinguisticService.assignSpeakerToUtterances).toHaveBeenCalledWith(['utt-1'], undefined);
    expect(result.current.utterancesState[0]?.speakerId).toBeUndefined();
    expect(result.current.utterancesState[0]?.speaker).toBeUndefined();
    expect(result.current.activeSpeakerFilterKey).toBe('all');
    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({ kind: 'done' }));
  });

  it('deletes speaker through dialog flow with clear strategy', async () => {
    const setSaveState = vi.fn();
    const pushUndo = vi.fn();
    vi.mocked(LinguisticService.deleteSpeaker).mockResolvedValue(1);

    const { result } = renderSpeakerActions({
      utterances: [makeUtterance({ id: 'utt-1', speakerId: 'speaker-1', speaker: '说话人甲' })],
      speakers: [makeSpeaker({ id: 'speaker-1', name: '说话人甲' })],
      setSaveState,
      data: {
        pushUndo,
        undo: vi.fn(async () => {}),
      },
    });

    act(() => {
      result.current.setActiveSpeakerFilterKey('speaker-1');
      result.current.handleDeleteSpeaker('speaker-1');
    });

    expect(result.current.speakerDialogState).toEqual(expect.objectContaining({ mode: 'delete', sourceSpeakerKey: 'speaker-1' }));

    await act(async () => {
      await result.current.confirmSpeakerDialog();
    });

    expect(pushUndo).toHaveBeenCalledWith('删除说话人实体');
    expect(LinguisticService.deleteSpeaker).toHaveBeenCalledWith('speaker-1', { strategy: 'clear' });
    expect(result.current.speakersState).toHaveLength(0);
    expect(result.current.utterancesState[0]?.speakerId).toBeUndefined();
    expect(result.current.activeSpeakerFilterKey).toBe('all');
    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({ kind: 'done' }));
  });

  it('deletes speaker through dialog flow with migrate strategy', async () => {
    const setSaveState = vi.fn();
    vi.mocked(LinguisticService.deleteSpeaker).mockResolvedValue(1);

    const { result } = renderSpeakerActions({
      utterances: [
        makeUtterance({ id: 'utt-1', speakerId: 'speaker-1', speaker: '来源说话人' }),
        makeUtterance({ id: 'utt-2', speakerId: 'speaker-2', speaker: '目标说话人', startTime: 2, endTime: 3 }),
      ],
      speakers: [
        makeSpeaker({ id: 'speaker-1', name: '来源说话人' }),
        makeSpeaker({ id: 'speaker-2', name: '目标说话人' }),
      ],
      setSaveState,
      data: {
        pushUndo: vi.fn(),
        undo: vi.fn(async () => {}),
      },
    });

    act(() => {
      result.current.handleDeleteSpeaker('speaker-1');
    });

    expect(result.current.speakerDialogState).toEqual(expect.objectContaining({ mode: 'delete', sourceSpeakerKey: 'speaker-1' }));

    act(() => {
      result.current.updateSpeakerDialogTargetKey('speaker-2');
    });

    await act(async () => {
      await result.current.confirmSpeakerDialog();
    });

    expect(LinguisticService.deleteSpeaker).toHaveBeenCalledWith('speaker-1', {
      strategy: 'merge',
      targetSpeakerId: 'speaker-2',
    });
    expect(result.current.speakersState.map((speaker) => speaker.id)).toEqual(['speaker-2']);
    expect(result.current.utterancesState[0]?.speakerId).toBe('speaker-2');
    expect(result.current.utterancesState[0]?.speaker).toBe('目标说话人');
    expect(result.current.activeSpeakerFilterKey).toBe('speaker-2');
    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({ kind: 'done' }));
  });

  it('opens delete dialog for orphan speaker entities not present in current filter list', () => {
    const { result } = renderSpeakerActions({
      speakers: [
        makeSpeaker({ id: 'speaker-1', name: '来源说话人' }),
        makeSpeaker({ id: 'speaker-2', name: '目标说话人' }),
      ],
      speakerFilterOptionsOverride: [],
    });

    act(() => {
      result.current.handleDeleteSpeaker('speaker-1');
    });

    expect(result.current.speakerDialogState).toEqual(expect.objectContaining({
      mode: 'delete',
      sourceSpeakerKey: 'speaker-1',
      replacementSpeakerKey: 'speaker-2',
      affectedCount: 0,
    }));
  });

  it('reuses existing speaker entity when create-only hits a duplicate name', async () => {
    const setSaveState = vi.fn();

    const { result } = renderSpeakerActions({
      speakers: [makeSpeaker({ id: 'speaker-1', name: 'Alice' })],
      setSaveState,
    });

    act(() => {
      result.current.setSpeakerDraftName(' alice ');
    });

    await act(async () => {
      await result.current.handleCreateSpeakerOnly();
    });

    expect(LinguisticService.createSpeaker).not.toHaveBeenCalled();
    expect(result.current.batchSpeakerId).toBe('speaker-1');
    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'done',
      message: '已复用现有说话人"Alice"',
    }));
  });

  it('reuses existing speaker entity when create-and-assign hits a duplicate name', async () => {
    const setSaveState = vi.fn();
    vi.mocked(LinguisticService.assignSpeakerToUtterances).mockResolvedValue(1);

    const { result } = renderSpeakerActions({
      utterances: [makeUtterance({ id: 'utt-1' })],
      speakers: [makeSpeaker({ id: 'speaker-1', name: 'Alice' })],
      selectedUnitIds: new Set(['utt-1']),
      setSaveState,
      data: {
        pushUndo: vi.fn(),
        undo: vi.fn(async () => {}),
      },
    });

    act(() => {
      result.current.setSpeakerDraftName('Alice');
    });

    await act(async () => {
      await result.current.handleCreateSpeakerAndAssign();
    });

    expect(LinguisticService.createSpeaker).not.toHaveBeenCalled();
    expect(LinguisticService.assignSpeakerToUtterances).toHaveBeenCalledWith(['utt-1'], 'speaker-1');
    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'done',
      message: '已复用现有说话人"Alice"，并应用到 1 条句段',
    }));
  });

  it('cleans unused speaker entities from local state', async () => {
    const setSaveState = vi.fn();
    const pushUndo = vi.fn();
    vi.mocked(LinguisticService.getSpeakers).mockResolvedValueOnce([
      makeSpeaker({ id: 'speaker-1', name: 'Orphan' }),
      makeSpeaker({ id: 'speaker-2', name: 'Used' }),
    ]);
    vi.mocked(LinguisticService.getSpeakerReferenceStats).mockResolvedValueOnce({
      perSpeaker: {
        'speaker-2': { transcriptionUnitCount: 1, segmentCount: 0, totalCount: 1 },
      },
      unassigned: EMPTY_SPEAKER_REFERENCE_STATS,
    });
    vi.mocked(LinguisticService.deleteSpeaker).mockResolvedValue(0);

    const { result } = renderSpeakerActions({
      speakers: [
        makeSpeaker({ id: 'speaker-1', name: 'Orphan' }),
        makeSpeaker({ id: 'speaker-2', name: 'Used' }),
      ],
      isReady: true,
      setSaveState,
      data: {
        pushUndo,
        undo: vi.fn(async () => {}),
      },
    });

    await waitFor(() => {
      expect(result.current.speakerReferenceStatsReady).toBe(true);
    });

    await act(async () => {
      await result.current.handleDeleteUnusedSpeakers();
    });

    expect(pushUndo).toHaveBeenCalledWith('清理未引用说话人实体');
    expect(LinguisticService.deleteSpeaker).toHaveBeenCalledWith('speaker-1');
    expect(result.current.speakersState.map((speaker) => speaker.id)).toEqual(['speaker-2']);
    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'done',
      message: '已清理 1 个未引用说话人实体',
    }));
  });

  it('maps conflict-like assign error to conflict-aware message', async () => {
    const setSaveState = vi.fn();
    const conflictError = new Error('row changed externally');
    vi.mocked(LinguisticService.assignSpeakerToUtterances).mockRejectedValue(conflictError);

    const { result } = renderSpeakerActions({
      utterances: [makeUtterance({ id: 'utt-1' })],
      speakers: [makeSpeaker({ id: 'speaker-1', name: '说话人甲' })],
      selectedUnitIds: new Set(['utt-1']),
      setSaveState,
      data: {
        pushUndo: vi.fn(),
        undo: vi.fn(async () => {}),
      },
    });

    await act(async () => {
      await result.current.handleAssignSpeakerToSelected();
    });

    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'error',
      message: '说话人指派失败：检测到数据已被其他操作更新，请刷新后重试',
      errorMeta: expect.objectContaining({ category: 'conflict', action: '说话人指派' }),
    }));
  });
});
