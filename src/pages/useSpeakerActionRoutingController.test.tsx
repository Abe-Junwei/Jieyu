// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type { Dispatch, SetStateAction } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  LayerDocType,
  LayerUnitContentDocType,
  LayerUnitDocType,
  SpeakerDocType,
} from '../db';
import type { SaveState, TimelineUnit } from '../hooks/transcription/transcriptionTypes';
import type {
  SpeakerActionDialogState,
  SpeakerFilterOption,
} from '../hooks/speakerManagement/types';
import { isDictKey, t as translate, tf as formatMessage } from '../i18n';
import { LinguisticService } from '../services/LinguisticService';
import {
  clearActiveProjectTextId,
  publishActiveProjectTextId,
} from '../utils/transcriptionUrlDeepLink';
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
    ...(constraint != null ? { constraint } : {}),
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z',
  } as LayerDocType;
}

function makeSegment(
  id: string,
  layerId: string,
  startTime: number,
  endTime: number,
  speakerId?: string,
): LayerUnitDocType {
  return {
    id,
    layerId,
    mediaId: 'media-1',
    textId: 'text-1',
    startTime,
    endTime,
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z',
    ...(typeof speakerId === 'string' && speakerId.length > 0 ? { speakerId } : {}),
  } as LayerUnitDocType;
}

function makeUnit(
  id: string,
  startTime: number,
  endTime: number,
  speakerId?: string,
): LayerUnitDocType {
  return {
    id,
    mediaId: 'media-1',
    textId: 'text-1',
    startTime,
    endTime,
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z',
    ...(typeof speakerId === 'string' && speakerId.length > 0 ? { speakerId } : {}),
  } as LayerUnitDocType;
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
  const unit = makeUnit('utt-1', 0, 1, 'spk-a');
  const speakerFilterOptionsForActions: SpeakerFilterOption[] = [
    { key: 'spk-a', name: 'Alice', count: 1 },
  ];
  const t = overrides.t ?? ((key: string) => (isDictKey(key) ? translate('zh-CN', key) : key));
  const tf =
    overrides.tf ??
    ((key: string, params?: Record<string, string | number>) =>
      isDictKey(key) ? formatMessage('zh-CN', key, params ?? {}) : key);

  return {
    activeSpeakerManagementLayer: layer,
    segmentsByLayer: new Map([['layer-seg', [segment]]]),
    segmentContentByLayer: new Map<string, ReadonlyMap<string, LayerUnitContentDocType>>([
      ['layer-seg', new Map()],
    ]),
    resolveExplicitSpeakerKeyForSegment: (item) => item.speakerId?.trim() ?? '',
    resolveSpeakerKeyForSegment: (item) => item.speakerId?.trim() ?? 'unknown-speaker',
    selectedBatchSegmentsForSpeakerActions: [segment],
    selectedUnitIdsForSpeakerActions: ['seg-1', 'utt-1'],
    segmentByIdForSpeakerActions: new Map([['seg-1', segment]]),
    resolveSpeakerActionUnitIds: (ids) =>
      Array.from(ids).map((id) => (id === 'seg-1' ? 'utt-1' : id)),
    selectedBatchUnits: [unit],
    selectedSpeakerSummary: '当前统一说话人：Alice',
    unitsOnCurrentMedia: [unit],
    getUnitSpeakerKey: (item) => item.speakerId ?? '',
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
    handleSelectSpeakerUnits: vi.fn(),
    handleClearSpeakerAssignments: vi.fn(),
    handleExportSpeakerSegments: vi.fn(),
    handleAssignSpeakerToUnits: vi.fn(async () => undefined),
    handleAssignSpeakerToSelected: vi.fn(async () => undefined),
    handleCreateSpeakerAndAssign: vi.fn(async () => undefined),
    refreshSpeakers: vi.fn(async () => undefined),
    refreshSpeakerReferenceStats: vi.fn(async () => undefined),
    selectedTimelineUnit: null as TimelineUnit | null,
    selectTimelineUnit: vi.fn(),
    setSelectedUnitIds: vi.fn() as unknown as Dispatch<SetStateAction<Set<string>>>,
    formatTime: (seconds) => seconds.toFixed(2),
    t,
    tf,
    pushUndo: vi.fn(),
    undo: vi.fn(async () => undefined),
    reloadSegments: vi.fn(async () => undefined),
    refreshSegmentUndoSnapshot: vi.fn(async () => undefined),
    updateSegmentsLocally: vi.fn(),
    setSaveState: vi.fn() as unknown as (state: SaveState) => void,
    setUnits: vi.fn() as unknown as Dispatch<SetStateAction<LayerUnitDocType[]>>,
    setSpeakers: vi.fn() as unknown as Dispatch<SetStateAction<SpeakerDocType[]>>,
    openSpeakerManagementPanel: vi.fn(),
    ...overrides,
  };
}

describe('useSpeakerActionRoutingController', () => {
  // 新说话人归当前项目（2B-B）| New speakers belong to the active project (2B-B)
  beforeEach(() => {
    publishActiveProjectTextId('text-1');
  });
  afterEach(() => {
    clearActiveProjectTextId();
  });

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
    const setSelectedUnitIds = vi.fn() as unknown as Dispatch<SetStateAction<Set<string>>>;
    const setActiveSpeakerFilterKey = vi.fn() as unknown as Dispatch<SetStateAction<string>>;
    const { result } = renderHook(() =>
      useSpeakerActionRoutingController(
        createBaseInput({
          selectTimelineUnit,
          setSelectedUnitIds,
          setActiveSpeakerFilterKey,
          selectedTimelineUnit: { layerId: 'layer-seg', unitId: 'seg-1', kind: 'segment' },
        }),
      ),
    );

    act(() => {
      result.current.handleSelectSpeakerUnitsRouted('spk-a');
    });

    expect(selectTimelineUnit).toHaveBeenCalledWith({
      layerId: 'layer-seg',
      unitId: 'seg-1',
      kind: 'segment',
    });
    expect(setSelectedUnitIds).toHaveBeenCalledWith(new Set(['seg-1']));
    expect(setActiveSpeakerFilterKey).toHaveBeenCalledWith('spk-a');
    expect(result.current.selectedSpeakerIdsForTrackLock).toEqual(['spk-a']);
    expect(result.current.selectedSpeakerNamesForTrackLock).toEqual(['Alice']);
  });

  it('falls back to base assign action when no segment-scoped selection exists', async () => {
    const handleAssignSpeakerToSelected = vi.fn(async () => undefined);
    const { result } = renderHook(() =>
      useSpeakerActionRoutingController(
        createBaseInput({
          activeSpeakerManagementLayer: null,
          selectedBatchSegmentsForSpeakerActions: [],
          selectedUnitIdsForSpeakerActions: ['utt-1'],
          segmentByIdForSpeakerActions: new Map(),
          handleAssignSpeakerToSelected,
        }),
      ),
    );

    await act(async () => {
      await result.current.handleAssignSpeakerToSelectedRouted();
    });

    expect(handleAssignSpeakerToSelected).toHaveBeenCalled();
  });

  it('reports segment-only speaker assignment failure without undoing', async () => {
    const assignMixed = vi
      .spyOn(LinguisticService.speakers, 'assignToMixedSelection')
      .mockRejectedValue(new Error('segment write failed'));
    const assignSpeakerToUnits = vi
      .spyOn(LinguisticService.speakers, 'assignToUnits')
      .mockResolvedValue(1);
    const undo = vi.fn(async () => undefined);
    const setSaveState = vi.fn() as unknown as (state: SaveState) => void;
    const { result } = renderHook(() =>
      useSpeakerActionRoutingController(
        createBaseInput({
          batchSpeakerId: 'spk-a',
          selectedBatchSegmentsForSpeakerActions: [makeSegment('seg-1', 'layer-seg', 0, 1)],
          selectedUnitIdsForSpeakerActions: ['seg-1'],
          segmentByIdForSpeakerActions: new Map([
            ['seg-1', makeSegment('seg-1', 'layer-seg', 0, 1)],
          ]),
          selectedBatchUnits: [],
          undo,
          setSaveState,
        }),
      ),
    );

    await act(async () => {
      await result.current.handleAssignSpeakerToSelectedRouted();
    });

    expect(assignMixed).toHaveBeenCalledWith({
      textId: 'text-1',
      segmentIds: ['seg-1'],
      unitIds: [],
      speakerId: 'spk-a',
    });
    expect(assignSpeakerToUnits).not.toHaveBeenCalled();
    expect(undo).not.toHaveBeenCalled();
    expect(setSaveState).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'error',
        message: '这次说话人修改可能只完成了一部分，已重新读取。请核对后再继续。',
      }),
    );

    assignMixed.mockRestore();
    assignSpeakerToUnits.mockRestore();
  });

  it('rolls back mixed speaker assignment when segment update fails', async () => {
    const assignMixed = vi
      .spyOn(LinguisticService.speakers, 'assignToMixedSelection')
      .mockRejectedValue(new Error('segment write failed'));
    const undo = vi.fn(async () => undefined);
    const setSaveState = vi.fn() as unknown as (state: SaveState) => void;
    const { result } = renderHook(() =>
      useSpeakerActionRoutingController(
        createBaseInput({
          batchSpeakerId: 'spk-a',
          selectedBatchSegmentsForSpeakerActions: [makeSegment('seg-1', 'layer-seg', 0, 1)],
          selectedUnitIdsForSpeakerActions: ['seg-1', 'utt-1'],
          segmentByIdForSpeakerActions: new Map([
            ['seg-1', makeSegment('seg-1', 'layer-seg', 0, 1)],
          ]),
          undo,
          setSaveState,
        }),
      ),
    );

    await act(async () => {
      await result.current.handleAssignSpeakerToSelectedRouted();
    });

    expect(assignMixed).toHaveBeenCalledWith({
      textId: 'text-1',
      segmentIds: ['seg-1'],
      unitIds: ['utt-1'],
      speakerId: 'spk-a',
    });
    expect(undo).not.toHaveBeenCalled();
    expect(setSaveState).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'error',
        message: '这次说话人修改可能只完成了一部分，已重新读取。请核对后再继续。',
      }),
    );

    assignMixed.mockRestore();
  });

  it('keeps clear-speaker dialog open and rolls back when clear action fails', async () => {
    const assignMixed = vi
      .spyOn(LinguisticService.speakers, 'assignToMixedSelection')
      .mockRejectedValue(new Error('clear failed'));
    const undo = vi.fn(async () => undefined);
    const setSaveState = vi.fn() as unknown as (state: SaveState) => void;
    const { result } = renderHook(() =>
      useSpeakerActionRoutingController(
        createBaseInput({
          undo,
          setSaveState,
        }),
      ),
    );

    act(() => {
      result.current.handleClearSpeakerAssignmentsRouted('spk-a');
    });

    await act(async () => {
      await result.current.confirmSpeakerDialogRouted();
    });

    expect(assignMixed).toHaveBeenCalledWith({
      textId: 'text-1',
      segmentIds: ['seg-1'],
      unitIds: [],
    });
    expect(undo).not.toHaveBeenCalled();
    expect(result.current.speakerDialogStateRouted).toEqual({
      mode: 'clear',
      speakerKey: 'spk-a',
      speakerName: 'Alice',
      affectedCount: 1,
    });
    expect(setSaveState).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'error',
        message: '这次说话人修改可能只完成了一部分，已重新读取。请核对后再继续。',
      }),
    );

    assignMixed.mockRestore();
  });

  it('clears mixed selection speakers across segments and units', async () => {
    const assignMixed = vi
      .spyOn(LinguisticService.speakers, 'assignToMixedSelection')
      .mockResolvedValue({ segments: 1, units: 1 });
    const setSaveState = vi.fn() as unknown as (state: SaveState) => void;
    const { result } = renderHook(() =>
      useSpeakerActionRoutingController(
        createBaseInput({
          selectedBatchSegmentsForSpeakerActions: [makeSegment('seg-1', 'layer-seg', 0, 1)],
          selectedUnitIdsForSpeakerActions: ['seg-1', 'utt-1'],
          segmentByIdForSpeakerActions: new Map([
            ['seg-1', makeSegment('seg-1', 'layer-seg', 0, 1)],
          ]),
          setSaveState,
        }),
      ),
    );

    await act(async () => {
      await result.current.handleClearSpeakerOnSelectedRouted();
    });

    expect(assignMixed).toHaveBeenCalledWith({
      textId: 'text-1',
      segmentIds: ['seg-1'],
      unitIds: ['utt-1'],
    });
    expect(setSaveState).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'done',
        message: '已应用说话人到 2 项选中内容',
      }),
    );

    assignMixed.mockRestore();
  });

  it('clears speaker on segment-only selection without unit fallback writes', async () => {
    const assignMixed = vi
      .spyOn(LinguisticService.speakers, 'assignToMixedSelection')
      .mockResolvedValue({ segments: 1, units: 0 });
    const assignSpeakerToUnits = vi
      .spyOn(LinguisticService.speakers, 'assignToUnits')
      .mockResolvedValue(1);
    const { result } = renderHook(() =>
      useSpeakerActionRoutingController(
        createBaseInput({
          selectedBatchSegmentsForSpeakerActions: [makeSegment('seg-1', 'layer-seg', 0, 1)],
          selectedUnitIdsForSpeakerActions: ['seg-1'],
          segmentByIdForSpeakerActions: new Map([
            ['seg-1', makeSegment('seg-1', 'layer-seg', 0, 1)],
          ]),
        }),
      ),
    );

    await act(async () => {
      await result.current.handleClearSpeakerOnSelectedRouted();
    });

    expect(assignMixed).toHaveBeenCalledWith({
      textId: 'text-1',
      segmentIds: ['seg-1'],
      unitIds: [],
    });
    expect(assignSpeakerToUnits).not.toHaveBeenCalled();

    assignMixed.mockRestore();
    assignSpeakerToUnits.mockRestore();
  });

  it('creates a speaker and assigns mixed selection across segments and units', async () => {
    const assignMixed = vi
      .spyOn(LinguisticService.speakers, 'createAndAssignToMixedSelection')
      .mockResolvedValue({
        speaker: makeSpeaker('spk-new', 'Bob'),
        segments: 1,
        units: 1,
        created: true,
      });
    const setSaveState = vi.fn() as unknown as (state: SaveState) => void;
    const setBatchSpeakerId = vi.fn() as unknown as Dispatch<SetStateAction<string>>;
    const setSpeakerDraftName = vi.fn() as unknown as Dispatch<SetStateAction<string>>;
    const setSpeakers = vi.fn() as unknown as Dispatch<SetStateAction<SpeakerDocType[]>>;
    const refreshSpeakers = vi.fn(async () => undefined);
    const { result } = renderHook(() =>
      useSpeakerActionRoutingController(
        createBaseInput({
          speakerDraftName: 'Bob',
          selectedBatchSegmentsForSpeakerActions: [makeSegment('seg-1', 'layer-seg', 0, 1)],
          selectedUnitIdsForSpeakerActions: ['seg-1', 'utt-1'],
          segmentByIdForSpeakerActions: new Map([
            ['seg-1', makeSegment('seg-1', 'layer-seg', 0, 1)],
          ]),
          setSaveState,
          setBatchSpeakerId,
          setSpeakerDraftName,
          setSpeakers,
          refreshSpeakers,
          speakerOptions: [makeSpeaker('spk-a', 'Alice')],
          speakerByIdMap: new Map([['spk-a', makeSpeaker('spk-a', 'Alice')]]),
        }),
      ),
    );

    await act(async () => {
      await result.current.handleCreateSpeakerAndAssignRouted();
    });

    expect(assignMixed).toHaveBeenCalledWith({
      segmentIds: ['seg-1'],
      unitIds: ['utt-1'],
      name: 'Bob',
      textId: 'text-1',
    });
    expect(setSpeakerDraftName).toHaveBeenCalledWith('');
    expect(setBatchSpeakerId).toHaveBeenCalledWith('spk-new');
    expect(setSpeakers).toHaveBeenCalledWith(expect.any(Function));
    expect(refreshSpeakers).toHaveBeenCalled();
    expect(setSaveState).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'done',
        message: '已新建说话人"Bob"，并应用到 2 项选中内容',
      }),
    );

    assignMixed.mockRestore();
  });

  it('rolls back mixed create-speaker assignment when segment write fails', async () => {
    const assignMixed = vi
      .spyOn(LinguisticService.speakers, 'createAndAssignToMixedSelection')
      .mockRejectedValue(new Error('segment create-assign failed'));
    const undo = vi.fn(async () => undefined);
    const setSaveState = vi.fn() as unknown as (state: SaveState) => void;
    const setBatchSpeakerId = vi.fn() as unknown as Dispatch<SetStateAction<string>>;
    const setSpeakerDraftName = vi.fn() as unknown as Dispatch<SetStateAction<string>>;
    const setSpeakers = vi.fn() as unknown as Dispatch<SetStateAction<SpeakerDocType[]>>;
    const { result } = renderHook(() =>
      useSpeakerActionRoutingController(
        createBaseInput({
          speakerDraftName: 'Bob',
          selectedBatchSegmentsForSpeakerActions: [makeSegment('seg-1', 'layer-seg', 0, 1)],
          selectedUnitIdsForSpeakerActions: ['seg-1', 'utt-1'],
          segmentByIdForSpeakerActions: new Map([
            ['seg-1', makeSegment('seg-1', 'layer-seg', 0, 1)],
          ]),
          undo,
          setSaveState,
          setBatchSpeakerId,
          setSpeakerDraftName,
          setSpeakers,
          speakerOptions: [makeSpeaker('spk-a', 'Alice')],
          speakerByIdMap: new Map([['spk-a', makeSpeaker('spk-a', 'Alice')]]),
        }),
      ),
    );

    await act(async () => {
      await result.current.handleCreateSpeakerAndAssignRouted();
    });

    expect(assignMixed).toHaveBeenCalledWith({
      segmentIds: ['seg-1'],
      unitIds: ['utt-1'],
      name: 'Bob',
      textId: 'text-1',
    });
    expect(undo).not.toHaveBeenCalled();
    expect(setBatchSpeakerId).not.toHaveBeenCalledWith('spk-new');
    expect(setSpeakerDraftName).not.toHaveBeenCalledWith('');
    expect(setSpeakers).not.toHaveBeenCalled();
    expect(setSaveState).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'error',
        message: '这次说话人修改可能只完成了一部分，已重新读取。请核对后再继续。',
      }),
    );

    assignMixed.mockRestore();
  });

  it('refreshes segment undo snapshot before mixed speaker assignment', async () => {
    const refreshSegmentUndoSnapshot = vi.fn(async () => undefined);
    const pushUndo = vi.fn();
    vi.spyOn(LinguisticService.speakers, 'assignToMixedSelection').mockResolvedValue({
      segments: 1,
      units: 1,
    });
    const { result } = renderHook(() =>
      useSpeakerActionRoutingController(
        createBaseInput({
          batchSpeakerId: 'spk-a',
          refreshSegmentUndoSnapshot,
          pushUndo,
        }),
      ),
    );

    await act(async () => {
      await result.current.handleAssignSpeakerToSelectedRouted();
    });

    expect(refreshSegmentUndoSnapshot).toHaveBeenCalled();
    const refreshOrder = refreshSegmentUndoSnapshot.mock.invocationCallOrder[0]!;
    const pushOrder = pushUndo.mock.invocationCallOrder[0]!;
    expect(refreshOrder).toBeLessThan(pushOrder);

    vi.restoreAllMocks();
  });

  it('reports a failed atomic mixed assignment without undoing other data', async () => {
    const assignMixed = vi
      .spyOn(LinguisticService.speakers, 'assignToMixedSelection')
      .mockRejectedValue(new Error('unit write failed'));
    const undo = vi.fn(async () => undefined);
    const setSaveState = vi.fn() as unknown as (state: SaveState) => void;
    const { result } = renderHook(() =>
      useSpeakerActionRoutingController(
        createBaseInput({
          batchSpeakerId: 'spk-a',
          selectedBatchSegmentsForSpeakerActions: [makeSegment('seg-1', 'layer-seg', 0, 1)],
          selectedUnitIdsForSpeakerActions: ['seg-1', 'utt-1'],
          segmentByIdForSpeakerActions: new Map([
            ['seg-1', makeSegment('seg-1', 'layer-seg', 0, 1)],
          ]),
          undo,
          setSaveState,
        }),
      ),
    );

    await act(async () => {
      await result.current.handleAssignSpeakerToSelectedRouted();
    });

    expect(assignMixed).toHaveBeenCalledWith({
      textId: 'text-1',
      segmentIds: ['seg-1'],
      unitIds: ['utt-1'],
      speakerId: 'spk-a',
    });
    expect(undo).not.toHaveBeenCalled();
    expect(setSaveState).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'error',
        message: '这次说话人修改可能只完成了一部分，已重新读取。请核对后再继续。',
      }),
    );

    assignMixed.mockRestore();
  });

  it('reports error when mixed selection unit targets resolve to zero rows', async () => {
    const assignMixed = vi
      .spyOn(LinguisticService.speakers, 'assignToMixedSelection')
      .mockResolvedValue({ segments: 1, units: 0 });
    const undo = vi.fn(async () => undefined);
    const setSaveState = vi.fn() as unknown as (state: SaveState) => void;
    const { result } = renderHook(() =>
      useSpeakerActionRoutingController(
        createBaseInput({
          batchSpeakerId: 'spk-a',
          selectedBatchSegmentsForSpeakerActions: [makeSegment('seg-1', 'layer-seg', 0, 1)],
          selectedUnitIdsForSpeakerActions: ['seg-1', 'utt-1'],
          segmentByIdForSpeakerActions: new Map([
            ['seg-1', makeSegment('seg-1', 'layer-seg', 0, 1)],
          ]),
          undo,
          setSaveState,
        }),
      ),
    );

    await act(async () => {
      await result.current.handleAssignSpeakerToSelectedRouted();
    });

    expect(undo).not.toHaveBeenCalled();
    expect(setSaveState).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'error',
        message: '这次说话人修改可能只完成了一部分，已重新读取。请核对后再继续。',
      }),
    );

    assignMixed.mockRestore();
  });
});
