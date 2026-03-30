import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type {
  LayerDocType,
  LayerSegmentContentDocType,
  LayerSegmentDocType,
  SpeakerDocType,
  UtteranceDocType,
} from '../db';
import type { SaveState, TimelineUnit } from '../hooks/transcriptionTypes';
import type { SpeakerActionDialogState, SpeakerFilterOption } from '../hooks/speakerManagement/types';
import {
  applySpeakerAssignmentToUtterances,
  getSpeakerDisplayNameByKey,
  upsertSpeaker,
} from '../hooks/speakerManagement/speakerUtils';
import { LinguisticService } from '../services/LinguisticService';
import { fireAndForget } from '../utils/fireAndForget';
import { reportActionError } from '../utils/actionErrorReporter';
import { reportValidationError } from '../utils/validationErrorReporter';
import { resolveTranscriptionUnitTarget } from './transcriptionUnitTargetResolver';

type SegmentUpdater = (segment: LayerSegmentDocType) => LayerSegmentDocType;

interface UseSpeakerActionRoutingControllerInput {
  activeSpeakerManagementLayer: LayerDocType | null;
  segmentsByLayer: ReadonlyMap<string, LayerSegmentDocType[]>;
  segmentContentByLayer: ReadonlyMap<string, ReadonlyMap<string, LayerSegmentContentDocType>>;
  resolveExplicitSpeakerKeyForSegment: (segment: LayerSegmentDocType) => string;
  resolveSpeakerKeyForSegment: (segment: LayerSegmentDocType) => string;
  selectedBatchSegmentsForSpeakerActions: LayerSegmentDocType[];
  selectedUnitIdsForSpeakerActions: string[];
  segmentByIdForSpeakerActions: ReadonlyMap<string, LayerSegmentDocType>;
  selectedUtteranceIdsForSpeakerActionsSet: Set<string>;
  resolveSpeakerActionUtteranceIds: (ids: Iterable<string>) => string[];
  selectedBatchUtterances: UtteranceDocType[];
  selectedSpeakerSummary: string;
  utterancesOnCurrentMedia: UtteranceDocType[];
  getUtteranceSpeakerKey: (utterance: UtteranceDocType) => string;
  speakerFilterOptionsForActions: SpeakerFilterOption[];
  speakerOptions: SpeakerDocType[];
  speakerByIdMap: ReadonlyMap<string, SpeakerDocType>;
  speakerDraftName: string;
  setSpeakerDraftName: Dispatch<SetStateAction<string>>;
  batchSpeakerId: string;
  setBatchSpeakerId: Dispatch<SetStateAction<string>>;
  speakerSaving: boolean;
  setActiveSpeakerFilterKey: Dispatch<SetStateAction<string>>;
  speakerDialogStateBase: SpeakerActionDialogState | null;
  closeSpeakerDialogBase: () => void;
  updateSpeakerDialogDraftNameBase: (value: string) => void;
  updateSpeakerDialogTargetKeyBase: (speakerKey: string) => void;
  confirmSpeakerDialogBase: () => Promise<void>;
  handleSelectSpeakerUtterances: (speakerKey: string) => void;
  handleClearSpeakerAssignments: (speakerKey: string) => void;
  handleExportSpeakerSegments: (speakerKey: string) => void;
  handleAssignSpeakerToUtterances: (utteranceIds: Iterable<string>, speakerId?: string) => Promise<void>;
  handleAssignSpeakerToSelected: () => Promise<void>;
  handleCreateSpeakerAndAssign: () => Promise<void>;
  refreshSpeakers: () => Promise<void>;
  refreshSpeakerReferenceStats: () => Promise<void>;
  selectedTimelineUnit: TimelineUnit | null;
  selectTimelineUnit: (unit: TimelineUnit | null) => void;
  setSelectedUtteranceIds: Dispatch<SetStateAction<Set<string>>>;
  formatTime: (seconds: number) => string;
  pushUndo: (label: string) => void;
  undo: () => Promise<void>;
  reloadSegments: () => Promise<void>;
  refreshSegmentUndoSnapshot: () => Promise<void>;
  updateSegmentsLocally: (segmentIds: Iterable<string>, updater: SegmentUpdater) => void;
  setSaveState: (state: SaveState) => void;
  setUtterances: Dispatch<SetStateAction<UtteranceDocType[]>>;
  setSpeakers: Dispatch<SetStateAction<SpeakerDocType[]>>;
  openSpeakerManagementPanel: (draftName?: string) => void;
}

interface UseSpeakerActionRoutingControllerResult {
  speakerSavingRouted: boolean;
  selectedSpeakerSummaryForActions: string;
  speakerDialogStateRouted: SpeakerActionDialogState | null;
  closeSpeakerDialogRouted: () => void;
  updateSpeakerDialogDraftNameRouted: (value: string) => void;
  updateSpeakerDialogTargetKeyRouted: (speakerKey: string) => void;
  confirmSpeakerDialogRouted: () => Promise<void>;
  handleAssignSpeakerToSegments: (segmentIds: Iterable<string>, speakerId?: string) => Promise<void>;
  handleSelectSpeakerUnitsRouted: (speakerKey: string) => void;
  handleClearSpeakerAssignmentsRouted: (speakerKey: string) => void;
  handleExportSpeakerSegmentsRouted: (speakerKey: string) => void;
  handleAssignSpeakerToSelectedRouted: () => Promise<void>;
  handleClearSpeakerOnSelectedRouted: () => Promise<void>;
  handleCreateSpeakerAndAssignRouted: () => Promise<void>;
  speakerQuickActions: {
    selectedCount: number;
    speakerOptions: Array<{ id: string; name: string }>;
    onAssignToSelection: (speakerId: string) => void;
    onClearSelection: () => void;
    onOpenCreateAndAssignPanel: () => void;
  };
  selectedSpeakerIdsForTrackLock: string[];
  selectedSpeakerNamesForTrackLock: string[];
}

export function useSpeakerActionRoutingController({
  activeSpeakerManagementLayer,
  segmentsByLayer,
  segmentContentByLayer,
  resolveExplicitSpeakerKeyForSegment,
  resolveSpeakerKeyForSegment,
  selectedBatchSegmentsForSpeakerActions,
  selectedUnitIdsForSpeakerActions,
  segmentByIdForSpeakerActions,
  selectedUtteranceIdsForSpeakerActionsSet,
  resolveSpeakerActionUtteranceIds,
  selectedBatchUtterances,
  selectedSpeakerSummary,
  utterancesOnCurrentMedia,
  getUtteranceSpeakerKey,
  speakerFilterOptionsForActions,
  speakerOptions,
  speakerByIdMap,
  speakerDraftName,
  setSpeakerDraftName,
  batchSpeakerId,
  setBatchSpeakerId,
  speakerSaving,
  setActiveSpeakerFilterKey,
  speakerDialogStateBase,
  closeSpeakerDialogBase,
  updateSpeakerDialogDraftNameBase,
  updateSpeakerDialogTargetKeyBase,
  confirmSpeakerDialogBase,
  handleSelectSpeakerUtterances,
  handleClearSpeakerAssignments,
  handleExportSpeakerSegments,
  handleAssignSpeakerToUtterances,
  handleAssignSpeakerToSelected,
  handleCreateSpeakerAndAssign,
  refreshSpeakers,
  refreshSpeakerReferenceStats,
  selectedTimelineUnit,
  selectTimelineUnit,
  setSelectedUtteranceIds,
  formatTime,
  pushUndo,
  undo,
  reloadSegments,
  refreshSegmentUndoSnapshot,
  updateSegmentsLocally,
  setSaveState,
  setUtterances,
  setSpeakers,
  openSpeakerManagementPanel,
}: UseSpeakerActionRoutingControllerInput): UseSpeakerActionRoutingControllerResult {
  const selectedUtteranceIdsForSpeakerActions = useMemo(
    () => Array.from(selectedUtteranceIdsForSpeakerActionsSet),
    [selectedUtteranceIdsForSpeakerActionsSet],
  );

  const selectedStandaloneUtteranceIdsForSpeakerActions = useMemo(
    () => resolveSpeakerActionUtteranceIds(
      selectedUnitIdsForSpeakerActions.filter((id) => !segmentByIdForSpeakerActions.has(id)),
    ),
    [resolveSpeakerActionUtteranceIds, segmentByIdForSpeakerActions, selectedUnitIdsForSpeakerActions],
  );

  const findExistingSpeakerEntityByName = useCallback((rawName: string) => {
    const normalizedName = rawName.trim().toLocaleLowerCase('zh-Hans-CN');
    if (!normalizedName) return undefined;
    return speakerOptions.find((speaker) => speaker.name.trim().toLocaleLowerCase('zh-Hans-CN') === normalizedName);
  }, [speakerOptions]);

  const speakerByIdMapForDisplay = useMemo(
    () => new Map(speakerByIdMap),
    [speakerByIdMap],
  );

  const selectedSpeakerActionCount = selectedBatchSegmentsForSpeakerActions.length + selectedStandaloneUtteranceIdsForSpeakerActions.length;

  const selectedSpeakerSummaryForActions = useMemo(() => {
    if (selectedBatchSegmentsForSpeakerActions.length === 0 && selectedStandaloneUtteranceIdsForSpeakerActions.length === 0) {
      return selectedSpeakerSummary;
    }
    const totalSelectedCount = selectedBatchSegmentsForSpeakerActions.length + selectedStandaloneUtteranceIdsForSpeakerActions.length;
    const assignedKeys = [
      ...selectedBatchSegmentsForSpeakerActions
        .map(resolveSpeakerKeyForSegment)
        .filter((key) => key !== 'unknown-speaker'),
      ...selectedStandaloneUtteranceIdsForSpeakerActions
        .map((utteranceId) => utterancesOnCurrentMedia.find((utterance) => utterance.id === utteranceId))
        .filter((utterance): utterance is UtteranceDocType => Boolean(utterance))
        .map((utterance) => getUtteranceSpeakerKey(utterance))
        .filter((key) => key.length > 0),
    ];
    if (assignedKeys.length === 0) return '已选项均未标注说话人';
    const uniqueKeys = new Set(assignedKeys);
    if (assignedKeys.length < totalSelectedCount) {
      if (uniqueKeys.size === 1) {
        const firstKey = assignedKeys[0]!;
        return `当前包含未标注项；已标注说话人：${getSpeakerDisplayNameByKey(firstKey, speakerByIdMapForDisplay)}`;
      }
      return `当前包含 ${uniqueKeys.size} 位说话人和未标注项`;
    }
    if (uniqueKeys.size === 1) {
      const firstKey = assignedKeys[0]!;
      return `当前统一说话人：${getSpeakerDisplayNameByKey(firstKey, speakerByIdMapForDisplay)}`;
    }
    return `当前包含 ${uniqueKeys.size} 位说话人`;
  }, [getUtteranceSpeakerKey, resolveSpeakerKeyForSegment, selectedBatchSegmentsForSpeakerActions, selectedSpeakerSummary, selectedStandaloneUtteranceIdsForSpeakerActions, speakerByIdMapForDisplay, utterancesOnCurrentMedia]);

  const [segmentSpeakerDialogState, setSegmentSpeakerDialogState] = useState<SpeakerActionDialogState | null>(null);
  const [segmentSpeakerDialogBusy, setSegmentSpeakerDialogBusy] = useState(false);
  const speakerSavingRouted = speakerSaving || segmentSpeakerDialogBusy;

  const getSegmentIdsForSpeakerKey = useCallback((speakerKey: string) => {
    if (!activeSpeakerManagementLayer) return [];
    return (segmentsByLayer.get(activeSpeakerManagementLayer.id) ?? [])
      .filter((segment) => resolveExplicitSpeakerKeyForSegment(segment) === speakerKey)
      .map((segment) => segment.id);
  }, [activeSpeakerManagementLayer, resolveExplicitSpeakerKeyForSegment, segmentsByLayer]);

  const speakerFilterOptionByKeyForActions = useMemo(
    () => new Map(speakerFilterOptionsForActions.map((option) => [option.key, option] as const)),
    [speakerFilterOptionsForActions],
  );

  useEffect(() => {
    if (selectedBatchSegmentsForSpeakerActions.length > 0) {
      const explicitKeys = selectedBatchSegmentsForSpeakerActions
        .map((segment) => segment.speakerId?.trim() ?? '')
        .filter((key) => key.length > 0);
      if (explicitKeys.length !== selectedBatchSegmentsForSpeakerActions.length) {
        setBatchSpeakerId('');
        return;
      }
      const [firstKey] = explicitKeys;
      if (!firstKey) {
        setBatchSpeakerId('');
        return;
      }
      const allSame = explicitKeys.every((key) => key === firstKey);
      setBatchSpeakerId(allSame ? firstKey : '');
      return;
    }

    if (selectedBatchUtterances.length === 0) {
      setBatchSpeakerId('');
      return;
    }
    const firstSpeakerId = selectedBatchUtterances[0]?.speakerId?.trim() ?? '';
    if (!firstSpeakerId) {
      setBatchSpeakerId('');
      return;
    }
    const allSame = selectedBatchUtterances.every((utterance) => (utterance.speakerId?.trim() ?? '') === firstSpeakerId);
    setBatchSpeakerId(allSame ? firstSpeakerId : '');
  }, [selectedBatchSegmentsForSpeakerActions, selectedBatchUtterances, setBatchSpeakerId]);

  const handleAssignSpeakerToSegments = useCallback(async (segmentIds: Iterable<string>, speakerId?: string) => {
    const targetIds = Array.from(new Set(Array.from(segmentIds).map((id) => id.trim()).filter((id) => id.length > 0)));
    if (targetIds.length === 0 || speakerSavingRouted) return;

    try {
      pushUndo('批量指派说话人');
      const updated = await LinguisticService.assignSpeakerToSegments(targetIds, speakerId);
      const now = new Date().toISOString();
      updateSegmentsLocally(targetIds, (segment) => {
        if (speakerId) {
          return { ...segment, speakerId, updatedAt: now };
        }
        const cleared = { ...segment, updatedAt: now };
        delete cleared.speakerId;
        return cleared;
      });
      setBatchSpeakerId(speakerId ?? '');
      await reloadSegments();
      await refreshSegmentUndoSnapshot();
      await refreshSpeakerReferenceStats();
      setSaveState({
        kind: 'done',
        message: updated > 0 ? `已更新 ${updated} 条语段的说话人` : '未找到可更新语段',
      });
    } catch (error) {
      reportActionError({
        actionLabel: '说话人指派',
        error,
        i18nKey: 'transcription.error.action.assignSpeakerFailed',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, ...(meta ? { errorMeta: meta } : {}) }),
      });
    }
  }, [pushUndo, refreshSegmentUndoSnapshot, refreshSpeakerReferenceStats, reloadSegments, setBatchSpeakerId, setSaveState, speakerSavingRouted, updateSegmentsLocally]);

  const createSpeakerAndAssignToSegments = useCallback(async (name: string, segmentIds: Iterable<string>) => {
    const trimmedName = name.trim();
    const targetIds = Array.from(new Set(Array.from(segmentIds).map((id) => id.trim()).filter((id) => id.length > 0)));
    if (!trimmedName || targetIds.length === 0 || speakerSavingRouted) return;

    let undoPushed = false;
    try {
      const existing = findExistingSpeakerEntityByName(trimmedName);
      pushUndo(existing ? '复用说话人并分配' : '新建并分配说话人');
      undoPushed = true;
      const targetSpeaker = existing ?? await LinguisticService.createSpeaker({ name: trimmedName });
      await LinguisticService.assignSpeakerToSegments(targetIds, targetSpeaker.id);
      const now = new Date().toISOString();
      updateSegmentsLocally(targetIds, (segment) => ({ ...segment, speakerId: targetSpeaker.id, updatedAt: now }));
      setSpeakerDraftName('');
      setBatchSpeakerId(targetSpeaker.id);
      await Promise.all([refreshSpeakers(), refreshSpeakerReferenceStats(), reloadSegments()]);
      await refreshSegmentUndoSnapshot();
      setSaveState({
        kind: 'done',
        message: existing
          ? `已复用现有说话人"${targetSpeaker.name}"，并应用到 ${targetIds.length} 条语段`
          : `已创建说话人"${targetSpeaker.name}"，并应用到 ${targetIds.length} 条语段`,
      });
    } catch (error) {
      if (undoPushed) await undo();
      reportActionError({
        actionLabel: '创建说话人',
        error,
        i18nKey: 'transcription.error.action.createSpeakerFailed',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, ...(meta ? { errorMeta: meta } : {}) }),
      });
    }
  }, [findExistingSpeakerEntityByName, pushUndo, refreshSegmentUndoSnapshot, refreshSpeakerReferenceStats, refreshSpeakers, reloadSegments, setBatchSpeakerId, setSaveState, setSpeakerDraftName, speakerSavingRouted, undo, updateSegmentsLocally]);

  const applySpeakerToMixedSelection = useCallback(async (speakerId?: string) => {
    const targetSegmentIds = selectedBatchSegmentsForSpeakerActions.map((segment) => segment.id);
    const targetUtteranceIds = selectedStandaloneUtteranceIdsForSpeakerActions;
    if ((targetSegmentIds.length === 0 && targetUtteranceIds.length === 0) || speakerSavingRouted) return;

    const normalizedSpeakerId = speakerId?.trim();
    const speaker = normalizedSpeakerId ? speakerByIdMap.get(normalizedSpeakerId) : undefined;
    let undoPushed = false;
    try {
      pushUndo('批量指派说话人');
      undoPushed = true;
      const [updatedSegments, updatedUtterances] = await Promise.all([
        targetSegmentIds.length > 0
          ? LinguisticService.assignSpeakerToSegments(targetSegmentIds, normalizedSpeakerId)
          : Promise.resolve(0),
        targetUtteranceIds.length > 0
          ? LinguisticService.assignSpeakerToUtterances(targetUtteranceIds, normalizedSpeakerId)
          : Promise.resolve(0),
      ]);
      const now = new Date().toISOString();
      if (targetSegmentIds.length > 0) {
        updateSegmentsLocally(targetSegmentIds, (segment) => {
          if (normalizedSpeakerId) {
            return { ...segment, speakerId: normalizedSpeakerId, updatedAt: now };
          }
          const cleared = { ...segment, updatedAt: now };
          delete cleared.speakerId;
          return cleared;
        });
      }
      if (targetUtteranceIds.length > 0) {
        setUtterances((prev) => applySpeakerAssignmentToUtterances(prev, targetUtteranceIds, speaker));
      }
      setBatchSpeakerId(normalizedSpeakerId ?? '');
      await reloadSegments();
      await refreshSegmentUndoSnapshot();
      await refreshSpeakerReferenceStats();
      const totalUpdated = updatedSegments + updatedUtterances;
      setSaveState({
        kind: 'done',
        message: totalUpdated > 0 ? `已更新 ${totalUpdated} 条选中项的说话人` : '未找到可更新项',
      });
    } catch (error) {
      if (undoPushed) await undo();
      reportActionError({
        actionLabel: '说话人指派',
        error,
        i18nKey: 'transcription.error.action.assignSpeakerFailed',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, ...(meta ? { errorMeta: meta } : {}) }),
      });
    }
  }, [pushUndo, refreshSegmentUndoSnapshot, refreshSpeakerReferenceStats, reloadSegments, selectedBatchSegmentsForSpeakerActions, selectedStandaloneUtteranceIdsForSpeakerActions, setBatchSpeakerId, setSaveState, setUtterances, speakerByIdMap, speakerSavingRouted, undo, updateSegmentsLocally]);

  const createSpeakerAndAssignToMixedSelection = useCallback(async (name: string) => {
    const trimmedName = name.trim();
    const targetSegmentIds = selectedBatchSegmentsForSpeakerActions.map((segment) => segment.id);
    const targetUtteranceIds = selectedStandaloneUtteranceIdsForSpeakerActions;
    if (!trimmedName || (targetSegmentIds.length === 0 && targetUtteranceIds.length === 0) || speakerSavingRouted) return;

    let undoPushed = false;
    try {
      const existing = findExistingSpeakerEntityByName(trimmedName);
      pushUndo(existing ? '复用说话人并分配' : '新建并分配说话人');
      undoPushed = true;
      const targetSpeaker = existing ?? await LinguisticService.createSpeaker({ name: trimmedName });
      const [updatedSegments, updatedUtterances] = await Promise.all([
        targetSegmentIds.length > 0
          ? LinguisticService.assignSpeakerToSegments(targetSegmentIds, targetSpeaker.id)
          : Promise.resolve(0),
        targetUtteranceIds.length > 0
          ? LinguisticService.assignSpeakerToUtterances(targetUtteranceIds, targetSpeaker.id)
          : Promise.resolve(0),
      ]);
      const now = new Date().toISOString();
      if (targetSegmentIds.length > 0) {
        updateSegmentsLocally(targetSegmentIds, (segment) => ({ ...segment, speakerId: targetSpeaker.id, updatedAt: now }));
      }
      if (targetUtteranceIds.length > 0) {
        setUtterances((prev) => applySpeakerAssignmentToUtterances(prev, targetUtteranceIds, targetSpeaker));
      }
      if (!existing) {
        setSpeakers((prev) => upsertSpeaker(prev, targetSpeaker));
      }
      setSpeakerDraftName('');
      setBatchSpeakerId(targetSpeaker.id);
      await Promise.all([refreshSpeakers(), refreshSpeakerReferenceStats(), reloadSegments()]);
      await refreshSegmentUndoSnapshot();
      setSaveState({
        kind: 'done',
        message: existing
          ? `已复用现有说话人"${targetSpeaker.name}"，并应用到 ${updatedSegments + updatedUtterances} 条选中项`
          : `已创建说话人"${targetSpeaker.name}"，并应用到 ${updatedSegments + updatedUtterances} 条选中项`,
      });
    } catch (error) {
      if (undoPushed) await undo();
      reportActionError({
        actionLabel: '创建说话人',
        error,
        i18nKey: 'transcription.error.action.createSpeakerFailed',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, ...(meta ? { errorMeta: meta } : {}) }),
      });
    }
  }, [findExistingSpeakerEntityByName, pushUndo, refreshSegmentUndoSnapshot, refreshSpeakerReferenceStats, refreshSpeakers, reloadSegments, selectedBatchSegmentsForSpeakerActions, selectedStandaloneUtteranceIdsForSpeakerActions, setBatchSpeakerId, setSaveState, setSpeakerDraftName, setSpeakers, setUtterances, speakerSavingRouted, undo, updateSegmentsLocally]);

  const handleSelectSpeakerUnitsRouted = useCallback((speakerKey: string) => {
    if (!activeSpeakerManagementLayer) {
      handleSelectSpeakerUtterances(speakerKey);
      return;
    }

    const ids = getSegmentIdsForSpeakerKey(speakerKey);
    if (ids.length === 0) {
      selectTimelineUnit(null);
      setSelectedUtteranceIds(new Set());
      return;
    }

    const primary = selectedTimelineUnit?.kind === 'segment' && ids.includes(selectedTimelineUnit.unitId)
      ? selectedTimelineUnit.unitId
      : ids[0]!;
    selectTimelineUnit(resolveTranscriptionUnitTarget({
      layerId: activeSpeakerManagementLayer.id,
      unitId: primary,
      preferredKind: 'segment',
    }));
    setSelectedUtteranceIds(new Set(ids));
    setActiveSpeakerFilterKey(speakerKey);
  }, [activeSpeakerManagementLayer, getSegmentIdsForSpeakerKey, handleSelectSpeakerUtterances, selectTimelineUnit, selectedTimelineUnit, setActiveSpeakerFilterKey, setSelectedUtteranceIds]);

  const handleClearSpeakerAssignmentsRouted = useCallback((speakerKey: string) => {
    if (!activeSpeakerManagementLayer) {
      handleClearSpeakerAssignments(speakerKey);
      return;
    }

    const target = speakerFilterOptionByKeyForActions.get(speakerKey);
    const ids = getSegmentIdsForSpeakerKey(speakerKey);
    if (ids.length === 0) {
      reportValidationError({
        message: '未找到可清空的语段',
        i18nKey: 'transcription.error.validation.clearSpeakerNoTarget',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, ...(meta ? { errorMeta: meta } : {}) }),
      });
      return;
    }

    setSegmentSpeakerDialogState({
      mode: 'clear',
      speakerKey,
      speakerName: target?.name ?? '未命名说话人',
      affectedCount: ids.length,
    });
  }, [activeSpeakerManagementLayer, getSegmentIdsForSpeakerKey, handleClearSpeakerAssignments, setSaveState, speakerFilterOptionByKeyForActions]);

  const handleExportSpeakerSegmentsRouted = useCallback((speakerKey: string) => {
    if (!activeSpeakerManagementLayer) {
      handleExportSpeakerSegments(speakerKey);
      return;
    }

    const target = speakerFilterOptionByKeyForActions.get(speakerKey);
    const speakerName = target?.name ?? 'speaker';
    const rows = (segmentsByLayer.get(activeSpeakerManagementLayer.id) ?? [])
      .filter((segment) => resolveExplicitSpeakerKeyForSegment(segment) === speakerKey)
      .sort((left, right) => left.startTime - right.startTime)
      .map((segment, index) => {
        const text = segmentContentByLayer.get(activeSpeakerManagementLayer.id)?.get(segment.id)?.text ?? '';
        return `${index + 1}. [${formatTime(segment.startTime)} - ${formatTime(segment.endTime)}] ${text}`;
      });

    if (rows.length === 0) {
      reportValidationError({
        message: '该说话人暂无可导出的语段',
        i18nKey: 'transcription.error.validation.exportSpeakerNoSegments',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, ...(meta ? { errorMeta: meta } : {}) }),
      });
      return;
    }

    if (typeof window === 'undefined') {
      reportValidationError({
        message: '当前环境不支持导出',
        i18nKey: 'transcription.error.validation.exportSpeakerUnsupportedEnv',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, ...(meta ? { errorMeta: meta } : {}) }),
      });
      return;
    }

    const content = [`说话人: ${speakerName}`, `语段数量: ${rows.length}`, '', ...rows].join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `speaker-${speakerName.replace(/\s+/g, '-')}-${Date.now()}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setSaveState({ kind: 'done', message: `已导出 ${rows.length} 条语段` });
  }, [activeSpeakerManagementLayer, formatTime, handleExportSpeakerSegments, resolveExplicitSpeakerKeyForSegment, segmentContentByLayer, segmentsByLayer, setSaveState, speakerFilterOptionByKeyForActions]);

  const speakerDialogStateRouted = segmentSpeakerDialogState ?? speakerDialogStateBase;

  const closeSpeakerDialogRouted = useCallback(() => {
    if (segmentSpeakerDialogState) {
      if (segmentSpeakerDialogBusy) return;
      setSegmentSpeakerDialogState(null);
      return;
    }
    closeSpeakerDialogBase();
  }, [closeSpeakerDialogBase, segmentSpeakerDialogBusy, segmentSpeakerDialogState]);

  const updateSpeakerDialogDraftNameRouted = useCallback((value: string) => {
    if (segmentSpeakerDialogState) return;
    updateSpeakerDialogDraftNameBase(value);
  }, [segmentSpeakerDialogState, updateSpeakerDialogDraftNameBase]);

  const updateSpeakerDialogTargetKeyRouted = useCallback((speakerKey: string) => {
    if (segmentSpeakerDialogState) return;
    updateSpeakerDialogTargetKeyBase(speakerKey);
  }, [segmentSpeakerDialogState, updateSpeakerDialogTargetKeyBase]);

  const confirmSpeakerDialogRouted = useCallback(async () => {
    if (segmentSpeakerDialogState?.mode === 'clear') {
      const ids = getSegmentIdsForSpeakerKey(segmentSpeakerDialogState.speakerKey);
      if (ids.length === 0) {
        reportValidationError({
          message: '未找到可清空的语段',
          i18nKey: 'transcription.error.validation.clearSpeakerNoTarget',
          setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, ...(meta ? { errorMeta: meta } : {}) }),
        });
        setSegmentSpeakerDialogState(null);
        return;
      }

      setSegmentSpeakerDialogBusy(true);
      let undoPushed = false;
      try {
        pushUndo('删除说话人标签');
        undoPushed = true;
        const cleared = await LinguisticService.assignSpeakerToSegments(ids, undefined);
        const now = new Date().toISOString();
        updateSegmentsLocally(ids, (segment) => {
          const next = { ...segment, updatedAt: now };
          delete next.speakerId;
          return next;
        });
        await reloadSegments();
        await refreshSegmentUndoSnapshot();
        await refreshSpeakerReferenceStats();
        setActiveSpeakerFilterKey('all');
        setSaveState({ kind: 'done', message: `已清空 ${cleared} 条语段的说话人标签` });
        setSegmentSpeakerDialogState(null);
      } catch (error) {
        if (undoPushed) await undo();
        reportActionError({
          actionLabel: '说话人操作',
          error,
          i18nKey: 'transcription.error.action.speakerDialogOperationFailed',
          setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, ...(meta ? { errorMeta: meta } : {}) }),
        });
      } finally {
        setSegmentSpeakerDialogBusy(false);
      }
      return;
    }

    await confirmSpeakerDialogBase();
    await reloadSegments();
    await refreshSegmentUndoSnapshot();
    await refreshSpeakerReferenceStats();
  }, [confirmSpeakerDialogBase, getSegmentIdsForSpeakerKey, pushUndo, refreshSegmentUndoSnapshot, refreshSpeakerReferenceStats, reloadSegments, segmentSpeakerDialogState, setActiveSpeakerFilterKey, setSaveState, undo, updateSegmentsLocally]);

  const handleAssignSpeakerToSelectedRouted = useCallback(async () => {
    if (selectedBatchSegmentsForSpeakerActions.length > 0 && selectedStandaloneUtteranceIdsForSpeakerActions.length > 0) {
      await applySpeakerToMixedSelection(batchSpeakerId || undefined);
      return;
    }
    if (selectedBatchSegmentsForSpeakerActions.length > 0) {
      await handleAssignSpeakerToSegments(selectedBatchSegmentsForSpeakerActions.map((segment) => segment.id), batchSpeakerId || undefined);
      return;
    }
    await handleAssignSpeakerToSelected();
  }, [applySpeakerToMixedSelection, batchSpeakerId, handleAssignSpeakerToSelected, handleAssignSpeakerToSegments, selectedBatchSegmentsForSpeakerActions, selectedStandaloneUtteranceIdsForSpeakerActions]);

  const handleClearSpeakerOnSelectedRouted = useCallback(async () => {
    if (selectedBatchSegmentsForSpeakerActions.length > 0 && selectedStandaloneUtteranceIdsForSpeakerActions.length > 0) {
      await applySpeakerToMixedSelection(undefined);
      return;
    }
    if (selectedBatchSegmentsForSpeakerActions.length > 0) {
      await handleAssignSpeakerToSegments(selectedBatchSegmentsForSpeakerActions.map((segment) => segment.id), undefined);
      return;
    }
    await handleAssignSpeakerToUtterances(selectedUtteranceIdsForSpeakerActions, undefined);
  }, [applySpeakerToMixedSelection, handleAssignSpeakerToSegments, handleAssignSpeakerToUtterances, selectedBatchSegmentsForSpeakerActions, selectedStandaloneUtteranceIdsForSpeakerActions, selectedUtteranceIdsForSpeakerActions]);

  const handleCreateSpeakerAndAssignRouted = useCallback(async () => {
    if (selectedBatchSegmentsForSpeakerActions.length > 0 && selectedStandaloneUtteranceIdsForSpeakerActions.length > 0) {
      await createSpeakerAndAssignToMixedSelection(speakerDraftName);
      return;
    }
    if (selectedBatchSegmentsForSpeakerActions.length === 0) {
      await handleCreateSpeakerAndAssign();
      return;
    }
    await createSpeakerAndAssignToSegments(speakerDraftName, selectedBatchSegmentsForSpeakerActions.map((segment) => segment.id));
  }, [createSpeakerAndAssignToMixedSelection, createSpeakerAndAssignToSegments, handleCreateSpeakerAndAssign, selectedBatchSegmentsForSpeakerActions, selectedStandaloneUtteranceIdsForSpeakerActions, speakerDraftName]);

  const assignSpeakerFromCurrentSelection = useCallback((speakerId?: string) => {
    if (selectedBatchSegmentsForSpeakerActions.length > 0 && selectedStandaloneUtteranceIdsForSpeakerActions.length > 0) {
      fireAndForget(applySpeakerToMixedSelection(speakerId));
      return true;
    }
    if (selectedBatchSegmentsForSpeakerActions.length > 0) {
      fireAndForget(handleAssignSpeakerToSegments(selectedBatchSegmentsForSpeakerActions.map((segment) => segment.id), speakerId));
      return true;
    }
    if (selectedUtteranceIdsForSpeakerActions.length > 0) {
      fireAndForget(handleAssignSpeakerToUtterances(selectedUtteranceIdsForSpeakerActions, speakerId));
      return true;
    }
    return false;
  }, [applySpeakerToMixedSelection, handleAssignSpeakerToSegments, handleAssignSpeakerToUtterances, selectedBatchSegmentsForSpeakerActions, selectedStandaloneUtteranceIdsForSpeakerActions, selectedUtteranceIdsForSpeakerActions]);

  const speakerQuickActions = useMemo(() => ({
    selectedCount: selectedSpeakerActionCount,
    speakerOptions: speakerOptions.map((speaker) => ({ id: speaker.id, name: speaker.name })),
    onAssignToSelection: (speakerId: string) => {
      assignSpeakerFromCurrentSelection(speakerId);
    },
    onClearSelection: () => {
      assignSpeakerFromCurrentSelection(undefined);
    },
    onOpenCreateAndAssignPanel: () => {
      if (selectedSpeakerActionCount === 0) return;
      openSpeakerManagementPanel();
    },
  }), [assignSpeakerFromCurrentSelection, openSpeakerManagementPanel, selectedSpeakerActionCount, speakerOptions]);

  const selectedSpeakerIdsForTrackLock = useMemo(() => {
    if (selectedBatchSegmentsForSpeakerActions.length > 0) {
      const unique = new Set<string>();
      for (const segment of selectedBatchSegmentsForSpeakerActions) {
        const speakerKey = resolveSpeakerKeyForSegment(segment);
        if (speakerKey === 'unknown-speaker') continue;
        unique.add(speakerKey);
      }
      return Array.from(unique);
    }
    const utteranceMap = new Map(utterancesOnCurrentMedia.map((utterance) => [utterance.id, utterance] as const));
    const unique = new Set<string>();
    for (const utteranceId of selectedUtteranceIdsForSpeakerActions) {
      const utterance = utteranceMap.get(utteranceId);
      if (!utterance) continue;
      const speakerKey = getUtteranceSpeakerKey(utterance);
      if (!speakerKey) continue;
      unique.add(speakerKey);
    }
    return Array.from(unique);
  }, [getUtteranceSpeakerKey, resolveSpeakerKeyForSegment, selectedBatchSegmentsForSpeakerActions, selectedUtteranceIdsForSpeakerActions, utterancesOnCurrentMedia]);

  const selectedSpeakerNamesForTrackLock = useMemo(
    () => selectedSpeakerIdsForTrackLock.map((id) => getSpeakerDisplayNameByKey(id, speakerByIdMapForDisplay)),
    [selectedSpeakerIdsForTrackLock, speakerByIdMapForDisplay],
  );

  return {
    speakerSavingRouted,
    selectedSpeakerSummaryForActions,
    speakerDialogStateRouted,
    closeSpeakerDialogRouted,
    updateSpeakerDialogDraftNameRouted,
    updateSpeakerDialogTargetKeyRouted,
    confirmSpeakerDialogRouted,
    handleAssignSpeakerToSegments,
    handleSelectSpeakerUnitsRouted,
    handleClearSpeakerAssignmentsRouted,
    handleExportSpeakerSegmentsRouted,
    handleAssignSpeakerToSelectedRouted,
    handleClearSpeakerOnSelectedRouted,
    handleCreateSpeakerAndAssignRouted,
    speakerQuickActions,
    selectedSpeakerIdsForTrackLock,
    selectedSpeakerNamesForTrackLock,
  };
}