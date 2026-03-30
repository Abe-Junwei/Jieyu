// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type { Dispatch, SetStateAction } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type {
  LayerDocType,
  LayerSegmentContentDocType,
  LayerSegmentDocType,
  SpeakerDocType,
  UtteranceDocType,
} from '../db';
import type { SaveState, TimelineUnit } from '../hooks/transcriptionTypes';
import type { SpeakerActionDialogState, SpeakerFilterOption } from '../hooks/speakerManagement/types';
import { LinguisticService } from '../services/LinguisticService';
import { useSpeakerActionRoutingController } from './useSpeakerActionRoutingController';

function makeLayer(id: string, constraint?: LayerDocType['constraint']): LayerDocType {
  return {
    id,
    textId: 'text-1',
    key: id,
    name: { 'zh-CN': id },
    layerType: 'transcription',
    languageId: 'zh-CN',
    modality: 'text',
    ...(constraint ? { constraint } : {}),
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z',
  } as LayerDocType;
}

function makeSegment(id: string, layerId: string, startTime: number, endTime: number, speakerId?: string): LayerSegmentDocType {
  return {
    id,
    layerId,
    mediaId: 'media-1',
    textId: 'text-1',
    startTime,
    endTime,
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z',
    ...(speakerId ? { speakerId } : {}),
  } as LayerSegmentDocType;
}

function makeUtterance(id: string, startTime: number, endTime: number, speakerId?: string): UtteranceDocType {
  return {
    id,
    mediaId: 'media-1',
    textId: 'text-1',
    startTime,
    endTime,
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z',
    ...(speakerId ? { speakerId } : {}),
  } as UtteranceDocType;
}

function makeSpeaker(id: string, name: string): SpeakerDocType {
  return {
    id,
    name,
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z',
  } as SpeakerDocType;
}

type HookInput = Parameters<typeof useSpeakerActionRoutingController>[0];

function createBaseInput(overrides: Partial<HookInput> = {}): HookInput {
  const speaker = makeSpeaker('spk-a', 'Alice');
  const layer = makeLayer('layer-seg', 'independent_boundary');
  const segment = makeSegment('seg-1', 'layer-seg', 0, 1, 'spk-a');
  const utterance = makeUtterance('utt-1', 0, 1, 'spk-a');
  const speakerFilterOptionsForActions: SpeakerFilterOption[] = [{ key: 'spk-a', name: 'Alice', count: 1 }];

  return {
    activeSpeakerManagementLayer: layer,
    segmentsByLayer: new Map([['layer-seg', [segment]]]),
    segmentContentByLayer: new Map<string, ReadonlyMap<string, LayerSegmentContentDocType>>([
      ['layer-seg', new Map()],
    ]),
    resolveExplicitSpeakerKeyForSegment: (item) => item.speakerId?.trim() ?? '',
    resolveSpeakerKeyForSegment: (item) => item.speakerId?.trim() ?? 'unknown-speaker',
    selectedBatchSegmentsForSpeakerActions: [segment],
    selectedUnitIdsForSpeakerActions: ['seg-1'],
    segmentByIdForSpeakerActions: new Map([['seg-1', segment]]),
    selectedUtteranceIdsForSpeakerActionsSet: new Set(['utt-1']),
    resolveSpeakerActionUtteranceIds: (ids) => Array.from(ids).map((id) => (id === 'seg-1' ? 'utt-1' : id)),
    selectedBatchUtterances: [utterance],
    selectedSpeakerSummary: '当前统一说话人：Alice',
    utterancesOnCurrentMedia: [utterance],
    getUtteranceSpeakerKey: (item) => item.speakerId ?? '',
    speakerFilterOptionsForActions,
    speakerOptions: [speaker],
    speakerByIdMap: new Map([['spk-a', speaker]]),
    speakerDraftName: '',
    setSpeakerDraftName: vi.fn() as unknown as Dispatch<SetStateAction<string>>,
    batchSpeakerId: '',
    setBatchSpeakerId: vi.fn() as unknown as Dispatch<SetStateAction<string>>,
    speakerSaving: false,
    setActiveSpeakerFilterKey: vi.fn() as unknown as Dispatch<SetStateAction<string>>,
    speakerDialogStateBase: null as SpeakerActionDialogState | null,
    closeSpeakerDialogBase: vi.fn(),
    updateSpeakerDialogDraftNameBase: vi.fn(),
    updateSpeakerDialogTargetKeyBase: vi.fn(),
    confirmSpeakerDialogBase: vi.fn(async () => undefined),
    handleSelectSpeakerUtterances: vi.fn(),
    handleClearSpeakerAssignments: vi.fn(),
    handleExportSpeakerSegments: vi.fn(),
    handleAssignSpeakerToUtterances: vi.fn(async () => undefined),
    handleAssignSpeakerToSelected: vi.fn(async () => undefined),
    handleCreateSpeakerAndAssign: vi.fn(async () => undefined),
    refreshSpeakers: vi.fn(async () => undefined),
    refreshSpeakerReferenceStats: vi.fn(async () => undefined),
    selectedTimelineUnit: null as TimelineUnit | null,
    selectTimelineUnit: vi.fn(),
    setSelectedUtteranceIds: vi.fn() as unknown as Dispatch<SetStateAction<Set<string>>>,
    formatTime: (seconds) => seconds.toFixed(2),
    pushUndo: vi.fn(),
    undo: vi.fn(async () => undefined),
    reloadSegments: vi.fn(async () => undefined),
    refreshSegmentUndoSnapshot: vi.fn(async () => undefined),
    updateSegmentsLocally: vi.fn(),
    setSaveState: vi.fn() as unknown as (state: SaveState) => void,
    setUtterances: vi.fn() as unknown as Dispatch<SetStateAction<UtteranceDocType[]>>,
    setSpeakers: vi.fn() as unknown as Dispatch<SetStateAction<SpeakerDocType[]>>,
    openSpeakerManagementPanel: vi.fn(),
    ...overrides,
  };
}

describe('useSpeakerActionRoutingController', () => {
  it('opens segment clear dialog for independent speaker layer actions', () => {
    const { result } = renderHook(() => useSpeakerActionRoutingController(createBaseInput()));

    act(() => {
      result.current.handleClearSpeakerAssignmentsRouted('spk-a');
    });

    expect(result.current.speakerDialogStateRouted).toEqual({
      mode: 'clear',
      speakerKey: 'spk-a',
      speakerName: 'Alice',
      affectedCount: 1,
    });
  });

  it('routes speaker unit selection to segment timeline state and derives track-lock speakers', () => {
    const selectTimelineUnit = vi.fn();
    const setSelectedUtteranceIds = vi.fn() as unknown as Dispatch<SetStateAction<Set<string>>>;
    const setActiveSpeakerFilterKey = vi.fn() as unknown as Dispatch<SetStateAction<string>>;
    const { result } = renderHook(() => useSpeakerActionRoutingController(createBaseInput({
      selectTimelineUnit,
      setSelectedUtteranceIds,
      setActiveSpeakerFilterKey,
      selectedTimelineUnit: { layerId: 'layer-seg', unitId: 'seg-1', kind: 'segment' },
    })));

    act(() => {
      result.current.handleSelectSpeakerUnitsRouted('spk-a');
    });

    expect(selectTimelineUnit).toHaveBeenCalledWith({ layerId: 'layer-seg', unitId: 'seg-1', kind: 'segment' });
    expect(setSelectedUtteranceIds).toHaveBeenCalledWith(new Set(['seg-1']));
    expect(setActiveSpeakerFilterKey).toHaveBeenCalledWith('spk-a');
    expect(result.current.selectedSpeakerIdsForTrackLock).toEqual(['spk-a']);
    expect(result.current.selectedSpeakerNamesForTrackLock).toEqual(['Alice']);
  });

  it('falls back to base assign action when no segment-scoped selection exists', async () => {
    const handleAssignSpeakerToSelected = vi.fn(async () => undefined);
    const { result } = renderHook(() => useSpeakerActionRoutingController(createBaseInput({
      activeSpeakerManagementLayer: null,
      selectedBatchSegmentsForSpeakerActions: [],
      selectedUnitIdsForSpeakerActions: ['utt-1'],
      segmentByIdForSpeakerActions: new Map(),
      handleAssignSpeakerToSelected,
    })));

    await act(async () => {
      await result.current.handleAssignSpeakerToSelectedRouted();
    });

    expect(handleAssignSpeakerToSelected).toHaveBeenCalled();
  });

  it('rolls back mixed speaker assignment when segment update fails', async () => {
    const assignSpeakerToSegments = vi.spyOn(LinguisticService, 'assignSpeakerToSegments').mockRejectedValue(new Error('segment write failed'));
    const assignSpeakerToUtterances = vi.spyOn(LinguisticService, 'assignSpeakerToUtterances').mockResolvedValue(1);
    const undo = vi.fn(async () => undefined);
    const setSaveState = vi.fn() as unknown as (state: SaveState) => void;
    const { result } = renderHook(() => useSpeakerActionRoutingController(createBaseInput({
      batchSpeakerId: 'spk-a',
      selectedBatchSegmentsForSpeakerActions: [makeSegment('seg-1', 'layer-seg', 0, 1)],
      selectedUnitIdsForSpeakerActions: ['seg-1', 'utt-1'],
      segmentByIdForSpeakerActions: new Map([['seg-1', makeSegment('seg-1', 'layer-seg', 0, 1)]]),
      selectedUtteranceIdsForSpeakerActionsSet: new Set(['utt-1']),
      undo,
      setSaveState,
    })));

    await act(async () => {
      await result.current.handleAssignSpeakerToSelectedRouted();
    });

    expect(assignSpeakerToSegments).toHaveBeenCalledWith(['seg-1'], 'spk-a');
    expect(assignSpeakerToUtterances).toHaveBeenCalledWith(['utt-1'], 'spk-a');
    expect(undo).toHaveBeenCalled();
    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'error',
      message: '说话人指派失败：segment write failed',
      errorMeta: expect.objectContaining({ category: 'action', action: '说话人指派' }),
    }));

    assignSpeakerToSegments.mockRestore();
    assignSpeakerToUtterances.mockRestore();
  });

  it('keeps clear-speaker dialog open and rolls back when clear action fails', async () => {
    const assignSpeakerToSegments = vi.spyOn(LinguisticService, 'assignSpeakerToSegments').mockRejectedValue(new Error('clear failed'));
    const undo = vi.fn(async () => undefined);
    const setSaveState = vi.fn() as unknown as (state: SaveState) => void;
    const { result } = renderHook(() => useSpeakerActionRoutingController(createBaseInput({
      undo,
      setSaveState,
    })));

    act(() => {
      result.current.handleClearSpeakerAssignmentsRouted('spk-a');
    });

    await act(async () => {
      await result.current.confirmSpeakerDialogRouted();
    });

    expect(assignSpeakerToSegments).toHaveBeenCalledWith(['seg-1'], undefined);
    expect(undo).toHaveBeenCalled();
    expect(result.current.speakerDialogStateRouted).toEqual({
      mode: 'clear',
      speakerKey: 'spk-a',
      speakerName: 'Alice',
      affectedCount: 1,
    });
    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'error',
      message: '说话人操作失败：clear failed',
      errorMeta: expect.objectContaining({ category: 'action', action: '说话人操作' }),
    }));

    assignSpeakerToSegments.mockRestore();
  });

  it('clears mixed selection speakers across segments and utterances', async () => {
    const assignSpeakerToSegments = vi.spyOn(LinguisticService, 'assignSpeakerToSegments').mockResolvedValue(1);
    const assignSpeakerToUtterances = vi.spyOn(LinguisticService, 'assignSpeakerToUtterances').mockResolvedValue(1);
    const setSaveState = vi.fn() as unknown as (state: SaveState) => void;
    const { result } = renderHook(() => useSpeakerActionRoutingController(createBaseInput({
      selectedBatchSegmentsForSpeakerActions: [makeSegment('seg-1', 'layer-seg', 0, 1)],
      selectedUnitIdsForSpeakerActions: ['seg-1', 'utt-1'],
      segmentByIdForSpeakerActions: new Map([['seg-1', makeSegment('seg-1', 'layer-seg', 0, 1)]]),
      selectedUtteranceIdsForSpeakerActionsSet: new Set(['utt-1']),
      setSaveState,
    })));

    await act(async () => {
      await result.current.handleClearSpeakerOnSelectedRouted();
    });

    expect(assignSpeakerToSegments).toHaveBeenCalledWith(['seg-1'], undefined);
    expect(assignSpeakerToUtterances).toHaveBeenCalledWith(['utt-1'], undefined);
    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'done',
      message: '已更新 2 条选中项的说话人',
    }));

    assignSpeakerToSegments.mockRestore();
    assignSpeakerToUtterances.mockRestore();
  });

  it('creates a speaker and assigns mixed selection across segments and utterances', async () => {
    const createSpeaker = vi.spyOn(LinguisticService, 'createSpeaker').mockResolvedValue(makeSpeaker('spk-new', 'Bob'));
    const assignSpeakerToSegments = vi.spyOn(LinguisticService, 'assignSpeakerToSegments').mockResolvedValue(1);
    const assignSpeakerToUtterances = vi.spyOn(LinguisticService, 'assignSpeakerToUtterances').mockResolvedValue(1);
    const setSaveState = vi.fn() as unknown as (state: SaveState) => void;
    const setBatchSpeakerId = vi.fn() as unknown as Dispatch<SetStateAction<string>>;
    const setSpeakerDraftName = vi.fn() as unknown as Dispatch<SetStateAction<string>>;
    const setSpeakers = vi.fn() as unknown as Dispatch<SetStateAction<SpeakerDocType[]>>;
    const refreshSpeakers = vi.fn(async () => undefined);
    const { result } = renderHook(() => useSpeakerActionRoutingController(createBaseInput({
      speakerDraftName: 'Bob',
      selectedBatchSegmentsForSpeakerActions: [makeSegment('seg-1', 'layer-seg', 0, 1)],
      selectedUnitIdsForSpeakerActions: ['seg-1', 'utt-1'],
      segmentByIdForSpeakerActions: new Map([['seg-1', makeSegment('seg-1', 'layer-seg', 0, 1)]]),
      selectedUtteranceIdsForSpeakerActionsSet: new Set(['utt-1']),
      setSaveState,
      setBatchSpeakerId,
      setSpeakerDraftName,
      setSpeakers,
      refreshSpeakers,
      speakerOptions: [makeSpeaker('spk-a', 'Alice')],
      speakerByIdMap: new Map([['spk-a', makeSpeaker('spk-a', 'Alice')]]),
    })));

    await act(async () => {
      await result.current.handleCreateSpeakerAndAssignRouted();
    });

    expect(createSpeaker).toHaveBeenCalledWith({ name: 'Bob' });
    expect(assignSpeakerToSegments).toHaveBeenCalledWith(['seg-1'], 'spk-new');
    expect(assignSpeakerToUtterances).toHaveBeenCalledWith(['utt-1'], 'spk-new');
    expect(setSpeakerDraftName).toHaveBeenCalledWith('');
    expect(setBatchSpeakerId).toHaveBeenCalledWith('spk-new');
    expect(setSpeakers).toHaveBeenCalledWith(expect.any(Function));
    expect(refreshSpeakers).toHaveBeenCalled();
    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'done',
      message: '已创建说话人"Bob"，并应用到 2 条选中项',
    }));

    createSpeaker.mockRestore();
    assignSpeakerToSegments.mockRestore();
    assignSpeakerToUtterances.mockRestore();
  });

  it('rolls back mixed create-speaker assignment when segment write fails', async () => {
    const createSpeaker = vi.spyOn(LinguisticService, 'createSpeaker').mockResolvedValue(makeSpeaker('spk-new', 'Bob'));
    const assignSpeakerToSegments = vi.spyOn(LinguisticService, 'assignSpeakerToSegments').mockRejectedValue(new Error('segment create-assign failed'));
    const assignSpeakerToUtterances = vi.spyOn(LinguisticService, 'assignSpeakerToUtterances').mockResolvedValue(1);
    const undo = vi.fn(async () => undefined);
    const setSaveState = vi.fn() as unknown as (state: SaveState) => void;
    const setBatchSpeakerId = vi.fn() as unknown as Dispatch<SetStateAction<string>>;
    const setSpeakerDraftName = vi.fn() as unknown as Dispatch<SetStateAction<string>>;
    const setSpeakers = vi.fn() as unknown as Dispatch<SetStateAction<SpeakerDocType[]>>;
    const { result } = renderHook(() => useSpeakerActionRoutingController(createBaseInput({
      speakerDraftName: 'Bob',
      selectedBatchSegmentsForSpeakerActions: [makeSegment('seg-1', 'layer-seg', 0, 1)],
      selectedUnitIdsForSpeakerActions: ['seg-1', 'utt-1'],
      segmentByIdForSpeakerActions: new Map([['seg-1', makeSegment('seg-1', 'layer-seg', 0, 1)]]),
      selectedUtteranceIdsForSpeakerActionsSet: new Set(['utt-1']),
      undo,
      setSaveState,
      setBatchSpeakerId,
      setSpeakerDraftName,
      setSpeakers,
      speakerOptions: [makeSpeaker('spk-a', 'Alice')],
      speakerByIdMap: new Map([['spk-a', makeSpeaker('spk-a', 'Alice')]]),
    })));

    await act(async () => {
      await result.current.handleCreateSpeakerAndAssignRouted();
    });

    expect(createSpeaker).toHaveBeenCalledWith({ name: 'Bob' });
    expect(assignSpeakerToSegments).toHaveBeenCalledWith(['seg-1'], 'spk-new');
    expect(assignSpeakerToUtterances).toHaveBeenCalledWith(['utt-1'], 'spk-new');
    expect(undo).toHaveBeenCalled();
    expect(setBatchSpeakerId).not.toHaveBeenCalledWith('spk-new');
    expect(setSpeakerDraftName).not.toHaveBeenCalledWith('');
    expect(setSpeakers).not.toHaveBeenCalled();
    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'error',
      message: '创建说话人失败：segment create-assign failed',
      errorMeta: expect.objectContaining({ category: 'action', action: '创建说话人' }),
    }));

    createSpeaker.mockRestore();
    assignSpeakerToSegments.mockRestore();
    assignSpeakerToUtterances.mockRestore();
  });
});