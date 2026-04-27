import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { LayerDocType, LayerUnitContentDocType, LayerUnitDocType, SpeakerDocType } from '../types/jieyuDbDocTypes';
import type { SaveState, TimelineUnit } from '../hooks/transcriptionTypes';
import type { SpeakerActionDialogState, SpeakerFilterOption } from '../hooks/speakerManagement/types';
import { applySpeakerAssignmentToUnits, getSpeakerDisplayNameByKey, upsertSpeaker } from '../hooks/speakerManagement/speakerUtils';
import { buildMixedSelectionSpeakerSummary, buildSpeakerActionErrorOptions, formatSpeakerAssignmentResult, formatSpeakerClearResult, formatSpeakerCreateAndAssignResult, formatSpeakerExportContent, formatSpeakerExportDone, getSpeakerExportFallbackName, getSpeakerUndoLabel, type SpeakerFormat, type SpeakerTranslate } from '../hooks/speakerManagement/speakerI18n';
import { LinguisticService } from '../app/languageAssetPageAccess';
import { fireAndForget } from '../utils/fireAndForget';
import { reportActionError } from '../utils/actionErrorReporter';
import { reportValidationError } from '../utils/validationErrorReporter';
import { resolveTranscriptionUnitTarget } from './transcriptionUnitTargetResolver';
import { createMetricTags, recordMetric } from '../observability/metrics';

type SegmentUpdater = (segment: LayerUnitDocType) => LayerUnitDocType;

interface UseSpeakerActionRoutingControllerInput {
  activeSpeakerManagementLayer: LayerDocType | null;
  segmentsByLayer: ReadonlyMap<string, LayerUnitDocType[]>;
  segmentContentByLayer: ReadonlyMap<string, ReadonlyMap<string, LayerUnitContentDocType>>;
  resolveExplicitSpeakerKeyForSegment: (segment: LayerUnitDocType) => string;
  resolveSpeakerKeyForSegment: (segment: LayerUnitDocType) => string;
  selectedBatchSegmentsForSpeakerActions: LayerUnitDocType[];
  selectedUnitIdsForSpeakerActions: string[];
  segmentByIdForSpeakerActions: ReadonlyMap<string, LayerUnitDocType>;
  resolveSpeakerActionUnitIds: (ids: Iterable<string>) => string[];
  selectedBatchUnits: LayerUnitDocType[];
  selectedSpeakerSummary: string;
  unitsOnCurrentMedia: LayerUnitDocType[];
  getUnitSpeakerKey: (unit: LayerUnitDocType) => string;
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
  handleSelectSpeakerUnits: (speakerKey: string) => void;
  handleClearSpeakerAssignments: (speakerKey: string) => void;
  handleExportSpeakerSegments: (speakerKey: string) => void;
  handleAssignSpeakerToUnits: (unitIds: Iterable<string>, speakerId?: string) => Promise<void>;
  handleAssignSpeakerToSelected: () => Promise<void>;
  handleCreateSpeakerAndAssign: () => Promise<void>;
  refreshSpeakers: () => Promise<void>;
  refreshSpeakerReferenceStats: () => Promise<void>;
  selectedTimelineUnit: TimelineUnit | null;
  selectTimelineUnit: (unit: TimelineUnit | null) => void;
  setSelectedUnitIds: Dispatch<SetStateAction<Set<string>>>;
  formatTime: (seconds: number) => string;
  t: SpeakerTranslate;
  tf: SpeakerFormat;
  pushUndo: (label: string) => void;
  undo: () => Promise<void>;
  reloadSegments: () => Promise<void>;
  refreshSegmentUndoSnapshot: () => Promise<void>;
  updateSegmentsLocally: (segmentIds: Iterable<string>, updater: SegmentUpdater) => void;
  setSaveState: (state: SaveState) => void;
  setUnits: Dispatch<SetStateAction<LayerUnitDocType[]>>;
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
  resolveSpeakerActionUnitIds,
  selectedBatchUnits,
  selectedSpeakerSummary,
  unitsOnCurrentMedia,
  getUnitSpeakerKey,
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
  handleSelectSpeakerUnits,
  handleClearSpeakerAssignments,
  handleExportSpeakerSegments,
  handleAssignSpeakerToUnits,
  handleAssignSpeakerToSelected,
  handleCreateSpeakerAndAssign,
  refreshSpeakers,
  refreshSpeakerReferenceStats,
  selectedTimelineUnit,
  selectTimelineUnit,
  setSelectedUnitIds,
  formatTime,
  t,
  tf,
  pushUndo,
  undo,
  reloadSegments,
  refreshSegmentUndoSnapshot,
  updateSegmentsLocally,
  setSaveState,
  setUnits,
  setSpeakers,
  openSpeakerManagementPanel,
}: UseSpeakerActionRoutingControllerInput): UseSpeakerActionRoutingControllerResult {
  const selectedStandaloneUnitIdsForSpeakerActions = useMemo(
    () => resolveSpeakerActionUnitIds(
      selectedUnitIdsForSpeakerActions.filter((id) => !segmentByIdForSpeakerActions.has(id)),
    ),
    [resolveSpeakerActionUnitIds, segmentByIdForSpeakerActions, selectedUnitIdsForSpeakerActions],
  );

  function recordMixedSpeakerSelectionApply(action: 'assign' | 'clear' | 'create'): void {
    try {
      recordMetric({
        id: 'business.transcription.speaker_mixed_selection_apply_count',
        value: 1,
        tags: createMetricTags('useSpeakerActionRoutingController', {
          action,
          segmentCount: selectedBatchSegmentsForSpeakerActions.length,
          unitCount: selectedStandaloneUnitIdsForSpeakerActions.length,
        }),
      });
    } catch {
      // 忽略指标上报异常，避免影响主流程 | Ignore metric reporting errors to avoid affecting the main flow
    }
  }

  const findExistingSpeakerEntityByName = (rawName: string) => {
    const normalizedName = rawName.trim().toLocaleLowerCase('zh-Hans-CN');
    if (!normalizedName) return undefined;
    return speakerOptions.find((speaker) => speaker.name.trim().toLocaleLowerCase('zh-Hans-CN') === normalizedName);
  };

  const getSpeakerNameForDisplay = useCallback(
    (speakerKey: string) => getSpeakerDisplayNameByKey(speakerKey, speakerByIdMap),
    [speakerByIdMap],
  );

  const selectedSpeakerActionCount = selectedBatchSegmentsForSpeakerActions.length + selectedStandaloneUnitIdsForSpeakerActions.length;

  const selectedSpeakerSummaryForActions = useMemo(() => {
    if (selectedBatchSegmentsForSpeakerActions.length === 0 && selectedStandaloneUnitIdsForSpeakerActions.length === 0) {
      return selectedSpeakerSummary;
    }
    const totalSelectedCount = selectedBatchSegmentsForSpeakerActions.length + selectedStandaloneUnitIdsForSpeakerActions.length;
    const assignedKeys = [
      ...selectedBatchSegmentsForSpeakerActions
        .map(resolveSpeakerKeyForSegment)
        .filter((key) => key !== 'unknown-speaker'),
      ...selectedStandaloneUnitIdsForSpeakerActions
        .map((unitId) => unitsOnCurrentMedia.find((unit) => unit.id === unitId))
        .filter((unit): unit is LayerUnitDocType => Boolean(unit))
        .map((unit) => getUnitSpeakerKey(unit))
        .filter((key) => key.length > 0),
    ];
    return buildMixedSelectionSpeakerSummary({
      assignedKeys,
      totalSelectedCount,
      getSpeakerName: getSpeakerNameForDisplay,
      t,
      tf,
    });
  }, [getSpeakerNameForDisplay, getUnitSpeakerKey, resolveSpeakerKeyForSegment, selectedBatchSegmentsForSpeakerActions, selectedSpeakerSummary, selectedStandaloneUnitIdsForSpeakerActions, t, tf, unitsOnCurrentMedia]);

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

    if (selectedBatchUnits.length === 0) {
      setBatchSpeakerId('');
      return;
    }
    const firstSpeakerId = selectedBatchUnits[0]?.speakerId?.trim() ?? '';
    if (!firstSpeakerId) {
      setBatchSpeakerId('');
      return;
    }
    const allSame = selectedBatchUnits.every((unit) => (unit.speakerId?.trim() ?? '') === firstSpeakerId);
    setBatchSpeakerId(allSame ? firstSpeakerId : '');
  }, [selectedBatchSegmentsForSpeakerActions, selectedBatchUnits, setBatchSpeakerId]);

  const handleAssignSpeakerToSegments = useCallback(async (segmentIds: Iterable<string>, speakerId?: string) => {
    const targetIds = Array.from(new Set(Array.from(segmentIds).map((id) => id.trim()).filter((id) => id.length > 0)));
    if (targetIds.length === 0 || speakerSavingRouted) return;

    try {
      pushUndo(getSpeakerUndoLabel('assign', t));
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
        message: formatSpeakerAssignmentResult('segments', updated, t, tf),
      });
    } catch (error) {
      reportActionError({
        error,
        ...buildSpeakerActionErrorOptions('assign', error, t, tf),
        conflictI18nKey: 'transcription.error.conflict.assignSpeaker',
        fallbackI18nKey: 'transcription.error.action.assignSpeakerFailed',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, ...(meta ? { errorMeta: meta } : {}) }),
      });
    }
  }, [pushUndo, refreshSegmentUndoSnapshot, refreshSpeakerReferenceStats, reloadSegments, setBatchSpeakerId, setSaveState, speakerSavingRouted, t, tf, updateSegmentsLocally]);

  const createSpeakerAndAssignToSegments = useCallback(async (name: string, segmentIds: Iterable<string>) => {
    const trimmedName = name.trim();
    const targetIds = Array.from(new Set(Array.from(segmentIds).map((id) => id.trim()).filter((id) => id.length > 0)));
    if (!trimmedName || targetIds.length === 0 || speakerSavingRouted) return;

    let undoPushed = false;
    try {
      const existing = findExistingSpeakerEntityByName(trimmedName);
      pushUndo(getSpeakerUndoLabel(existing ? 'reuseAndAssign' : 'createAndAssign', t));
      undoPushed = true;
      const targetSpeaker = existing ?? await LinguisticService.createSpeaker({ name: trimmedName });
      const updated = await LinguisticService.assignSpeakerToSegments(targetIds, targetSpeaker.id);
      const now = new Date().toISOString();
      updateSegmentsLocally(targetIds, (segment) => ({ ...segment, speakerId: targetSpeaker.id, updatedAt: now }));
      setSpeakerDraftName('');
      setBatchSpeakerId(targetSpeaker.id);
      await Promise.all([refreshSpeakers(), refreshSpeakerReferenceStats(), reloadSegments()]);
      await refreshSegmentUndoSnapshot();
      setSaveState({
        kind: 'done',
        message: formatSpeakerCreateAndAssignResult('segments', targetSpeaker.name, updated, Boolean(existing), t, tf),
      });
    } catch (error) {
      if (undoPushed) await undo();
      reportActionError({
        error,
        ...buildSpeakerActionErrorOptions('create', error, t, tf),
        conflictI18nKey: 'transcription.error.conflict.createSpeaker',
        fallbackI18nKey: 'transcription.error.action.createSpeakerFailed',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, ...(meta ? { errorMeta: meta } : {}) }),
      });
    }
  }, [findExistingSpeakerEntityByName, pushUndo, refreshSegmentUndoSnapshot, refreshSpeakerReferenceStats, refreshSpeakers, reloadSegments, setBatchSpeakerId, setSaveState, setSpeakerDraftName, speakerSavingRouted, t, tf, undo, updateSegmentsLocally]);

  const applySpeakerToMixedSelection = useCallback(async (speakerId?: string) => {
    const targetSegmentIds = selectedBatchSegmentsForSpeakerActions.map((segment) => segment.id);
    const targetUnitIds = selectedStandaloneUnitIdsForSpeakerActions;
    if ((targetSegmentIds.length === 0 && targetUnitIds.length === 0) || speakerSavingRouted) return;

    const normalizedSpeakerId = speakerId?.trim();
    recordMixedSpeakerSelectionApply(normalizedSpeakerId ? 'assign' : 'clear');
    const speaker = normalizedSpeakerId ? speakerByIdMap.get(normalizedSpeakerId) : undefined;
    let undoPushed = false;
    try {
      pushUndo(getSpeakerUndoLabel('assign', t));
      undoPushed = true;
      const [updatedSegments, updatedUnits] = await Promise.all([
        targetSegmentIds.length > 0
          ? LinguisticService.assignSpeakerToSegments(targetSegmentIds, normalizedSpeakerId)
          : Promise.resolve(0),
        targetUnitIds.length > 0
          ? LinguisticService.assignSpeakerToUnits(targetUnitIds, normalizedSpeakerId)
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
      if (targetUnitIds.length > 0) {
        setUnits((prev) => applySpeakerAssignmentToUnits(prev, targetUnitIds, speaker));
      }
      setBatchSpeakerId(normalizedSpeakerId ?? '');
      await reloadSegments();
      await refreshSegmentUndoSnapshot();
      await refreshSpeakerReferenceStats();
      const totalUpdated = updatedSegments + updatedUnits;
      setSaveState({
        kind: 'done',
        message: formatSpeakerAssignmentResult('selection', totalUpdated, t, tf),
      });
    } catch (error) {
      if (undoPushed) await undo();
      reportActionError({
        error,
        ...buildSpeakerActionErrorOptions('assign', error, t, tf),
        conflictI18nKey: 'transcription.error.conflict.assignSpeaker',
        fallbackI18nKey: 'transcription.error.action.assignSpeakerFailed',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, ...(meta ? { errorMeta: meta } : {}) }),
      });
    }
  }, [pushUndo, refreshSegmentUndoSnapshot, refreshSpeakerReferenceStats, reloadSegments, selectedBatchSegmentsForSpeakerActions, selectedStandaloneUnitIdsForSpeakerActions, setBatchSpeakerId, setSaveState, setUnits, speakerByIdMap, speakerSavingRouted, t, tf, undo, updateSegmentsLocally]);

  const createSpeakerAndAssignToMixedSelection = useCallback(async (name: string) => {
    const trimmedName = name.trim();
    const targetSegmentIds = selectedBatchSegmentsForSpeakerActions.map((segment) => segment.id);
    const targetUnitIds = selectedStandaloneUnitIdsForSpeakerActions;
    if (!trimmedName || (targetSegmentIds.length === 0 && targetUnitIds.length === 0) || speakerSavingRouted) return;

    let undoPushed = false;
    try {
      recordMixedSpeakerSelectionApply('create');
      const existing = findExistingSpeakerEntityByName(trimmedName);
      pushUndo(getSpeakerUndoLabel(existing ? 'reuseAndAssign' : 'createAndAssign', t));
      undoPushed = true;
      const targetSpeaker = existing ?? await LinguisticService.createSpeaker({ name: trimmedName });
      const [updatedSegments, updatedUnits] = await Promise.all([
        targetSegmentIds.length > 0
          ? LinguisticService.assignSpeakerToSegments(targetSegmentIds, targetSpeaker.id)
          : Promise.resolve(0),
        targetUnitIds.length > 0
          ? LinguisticService.assignSpeakerToUnits(targetUnitIds, targetSpeaker.id)
          : Promise.resolve(0),
      ]);
      const now = new Date().toISOString();
      if (targetSegmentIds.length > 0) {
        updateSegmentsLocally(targetSegmentIds, (segment) => ({ ...segment, speakerId: targetSpeaker.id, updatedAt: now }));
      }
      if (targetUnitIds.length > 0) {
        setUnits((prev) => applySpeakerAssignmentToUnits(prev, targetUnitIds, targetSpeaker));
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
        message: formatSpeakerCreateAndAssignResult('selection', targetSpeaker.name, updatedSegments + updatedUnits, Boolean(existing), t, tf),
      });
    } catch (error) {
      if (undoPushed) await undo();
      reportActionError({
        error,
        ...buildSpeakerActionErrorOptions('create', error, t, tf),
        conflictI18nKey: 'transcription.error.conflict.createSpeaker',
        fallbackI18nKey: 'transcription.error.action.createSpeakerFailed',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, ...(meta ? { errorMeta: meta } : {}) }),
      });
    }
  }, [findExistingSpeakerEntityByName, pushUndo, refreshSegmentUndoSnapshot, refreshSpeakerReferenceStats, refreshSpeakers, reloadSegments, selectedBatchSegmentsForSpeakerActions, selectedStandaloneUnitIdsForSpeakerActions, setBatchSpeakerId, setSaveState, setSpeakerDraftName, setSpeakers, setUnits, speakerSavingRouted, t, tf, undo, updateSegmentsLocally]);

  const handleSelectSpeakerUnitsRouted = useCallback((speakerKey: string) => {
    if (!activeSpeakerManagementLayer) {
      handleSelectSpeakerUnits(speakerKey);
      return;
    }

    const ids = getSegmentIdsForSpeakerKey(speakerKey);
    if (ids.length === 0) {
      selectTimelineUnit(null);
      setSelectedUnitIds(new Set());
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
    setSelectedUnitIds(new Set(ids));
    setActiveSpeakerFilterKey(speakerKey);
  }, [activeSpeakerManagementLayer, getSegmentIdsForSpeakerKey, handleSelectSpeakerUnits, selectTimelineUnit, selectedTimelineUnit, setActiveSpeakerFilterKey, setSelectedUnitIds]);

  const handleClearSpeakerAssignmentsRouted = useCallback((speakerKey: string) => {
    if (!activeSpeakerManagementLayer) {
      handleClearSpeakerAssignments(speakerKey);
      return;
    }

    const target = speakerFilterOptionByKeyForActions.get(speakerKey);
    const ids = getSegmentIdsForSpeakerKey(speakerKey);
    if (ids.length === 0) {
      reportValidationError({
        message: t('transcription.error.validation.clearSpeakerNoTarget'),
        i18nKey: 'transcription.error.validation.clearSpeakerNoTarget',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, ...(meta ? { errorMeta: meta } : {}) }),
      });
      return;
    }

    setSegmentSpeakerDialogState({
      mode: 'clear',
      speakerKey,
      speakerName: target?.name ?? t('transcription.speaker.common.unnamed'),
      affectedCount: ids.length,
    });
  }, [activeSpeakerManagementLayer, getSegmentIdsForSpeakerKey, handleClearSpeakerAssignments, setSaveState, speakerFilterOptionByKeyForActions, t]);

  const handleExportSpeakerSegmentsRouted = useCallback((speakerKey: string) => {
    if (!activeSpeakerManagementLayer) {
      handleExportSpeakerSegments(speakerKey);
      return;
    }

    const target = speakerFilterOptionByKeyForActions.get(speakerKey);
    const speakerName = target?.name ?? getSpeakerExportFallbackName(t);
    const rows = (segmentsByLayer.get(activeSpeakerManagementLayer.id) ?? [])
      .filter((segment) => resolveExplicitSpeakerKeyForSegment(segment) === speakerKey)
      .sort((left, right) => left.startTime - right.startTime)
      .map((segment, index) => {
        const text = segmentContentByLayer.get(activeSpeakerManagementLayer.id)?.get(segment.id)?.text ?? '';
        return `${index + 1}. [${formatTime(segment.startTime)} - ${formatTime(segment.endTime)}] ${text}`;
      });

    if (rows.length === 0) {
      reportValidationError({
        message: t('transcription.error.validation.exportSpeakerNoSegments'),
        i18nKey: 'transcription.error.validation.exportSpeakerNoSegments',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, ...(meta ? { errorMeta: meta } : {}) }),
      });
      return;
    }

    if (typeof window === 'undefined') {
      reportValidationError({
        message: t('transcription.error.validation.exportSpeakerUnsupportedEnv'),
        i18nKey: 'transcription.error.validation.exportSpeakerUnsupportedEnv',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, ...(meta ? { errorMeta: meta } : {}) }),
      });
      return;
    }

    const content = formatSpeakerExportContent('segments', speakerName, rows, t, tf);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `speaker-${speakerName.replace(/\s+/g, '-')}-${Date.now()}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setSaveState({ kind: 'done', message: formatSpeakerExportDone('segments', rows.length, t, tf) });
  }, [activeSpeakerManagementLayer, formatTime, handleExportSpeakerSegments, resolveExplicitSpeakerKeyForSegment, segmentContentByLayer, segmentsByLayer, setSaveState, speakerFilterOptionByKeyForActions, t, tf]);

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
          message: t('transcription.error.validation.clearSpeakerNoTarget'),
          i18nKey: 'transcription.error.validation.clearSpeakerNoTarget',
          setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, ...(meta ? { errorMeta: meta } : {}) }),
        });
        setSegmentSpeakerDialogState(null);
        return;
      }

      setSegmentSpeakerDialogBusy(true);
      let undoPushed = false;
      try {
        pushUndo(getSpeakerUndoLabel('clearTag', t));
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
        setSaveState({ kind: 'done', message: formatSpeakerClearResult('segments', cleared, t, tf) });
        setSegmentSpeakerDialogState(null);
      } catch (error) {
        if (undoPushed) await undo();
        reportActionError({
          error,
          ...buildSpeakerActionErrorOptions('dialogOperation', error, t, tf),
          conflictI18nKey: 'transcription.error.conflict.speakerDialogOperation',
          fallbackI18nKey: 'transcription.error.action.speakerDialogOperationFailed',
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
  }, [confirmSpeakerDialogBase, getSegmentIdsForSpeakerKey, pushUndo, refreshSegmentUndoSnapshot, refreshSpeakerReferenceStats, reloadSegments, segmentSpeakerDialogState, setActiveSpeakerFilterKey, setSaveState, t, tf, undo, updateSegmentsLocally]);

  const handleAssignSpeakerToSelectedRouted = useCallback(async () => {
    if (selectedBatchSegmentsForSpeakerActions.length > 0 && selectedStandaloneUnitIdsForSpeakerActions.length > 0) {
      await applySpeakerToMixedSelection(batchSpeakerId || undefined);
      return;
    }
    if (selectedBatchSegmentsForSpeakerActions.length > 0) {
      await handleAssignSpeakerToSegments(selectedBatchSegmentsForSpeakerActions.map((segment) => segment.id), batchSpeakerId || undefined);
      return;
    }
    await handleAssignSpeakerToSelected();
  }, [applySpeakerToMixedSelection, batchSpeakerId, handleAssignSpeakerToSelected, handleAssignSpeakerToSegments, selectedBatchSegmentsForSpeakerActions, selectedStandaloneUnitIdsForSpeakerActions]);

  const handleClearSpeakerOnSelectedRouted = useCallback(async () => {
    if (selectedBatchSegmentsForSpeakerActions.length > 0 && selectedStandaloneUnitIdsForSpeakerActions.length > 0) {
      await applySpeakerToMixedSelection(undefined);
      return;
    }
    if (selectedBatchSegmentsForSpeakerActions.length > 0) {
      await handleAssignSpeakerToSegments(selectedBatchSegmentsForSpeakerActions.map((segment) => segment.id), undefined);
      return;
    }
    await handleAssignSpeakerToUnits(selectedStandaloneUnitIdsForSpeakerActions, undefined);
  }, [applySpeakerToMixedSelection, handleAssignSpeakerToSegments, handleAssignSpeakerToUnits, selectedBatchSegmentsForSpeakerActions, selectedStandaloneUnitIdsForSpeakerActions]);

  const handleCreateSpeakerAndAssignRouted = useCallback(async () => {
    if (selectedBatchSegmentsForSpeakerActions.length > 0 && selectedStandaloneUnitIdsForSpeakerActions.length > 0) {
      await createSpeakerAndAssignToMixedSelection(speakerDraftName);
      return;
    }
    if (selectedBatchSegmentsForSpeakerActions.length === 0) {
      await handleCreateSpeakerAndAssign();
      return;
    }
    await createSpeakerAndAssignToSegments(speakerDraftName, selectedBatchSegmentsForSpeakerActions.map((segment) => segment.id));
  }, [createSpeakerAndAssignToMixedSelection, createSpeakerAndAssignToSegments, handleCreateSpeakerAndAssign, selectedBatchSegmentsForSpeakerActions, selectedStandaloneUnitIdsForSpeakerActions, speakerDraftName]);

  const assignSpeakerFromCurrentSelection = useCallback((speakerId?: string) => {
    if (selectedBatchSegmentsForSpeakerActions.length > 0 && selectedStandaloneUnitIdsForSpeakerActions.length > 0) {
      fireAndForget(applySpeakerToMixedSelection(speakerId), { context: 'src/pages/useSpeakerActionRoutingController.ts:L638', policy: 'user-visible' });
      return true;
    }
    if (selectedBatchSegmentsForSpeakerActions.length > 0) {
      fireAndForget(handleAssignSpeakerToSegments(selectedBatchSegmentsForSpeakerActions.map((segment) => segment.id), speakerId), { context: 'src/pages/useSpeakerActionRoutingController.ts:L642', policy: 'user-visible' });
      return true;
    }
    if (selectedStandaloneUnitIdsForSpeakerActions.length > 0) {
      fireAndForget(handleAssignSpeakerToUnits(selectedStandaloneUnitIdsForSpeakerActions, speakerId), { context: 'src/pages/useSpeakerActionRoutingController.ts:L646', policy: 'user-visible' });
      return true;
    }
    return false;
  }, [applySpeakerToMixedSelection, handleAssignSpeakerToSegments, handleAssignSpeakerToUnits, selectedBatchSegmentsForSpeakerActions, selectedStandaloneUnitIdsForSpeakerActions]);

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
    const unitMap = new Map(unitsOnCurrentMedia.map((unit) => [unit.id, unit] as const));
    const unique = new Set<string>();
    for (const unitId of selectedStandaloneUnitIdsForSpeakerActions) {
      const unit = unitMap.get(unitId);
      if (!unit) continue;
      const speakerKey = getUnitSpeakerKey(unit);
      if (!speakerKey) continue;
      unique.add(speakerKey);
    }
    return Array.from(unique);
  }, [getUnitSpeakerKey, resolveSpeakerKeyForSegment, selectedBatchSegmentsForSpeakerActions, selectedStandaloneUnitIdsForSpeakerActions, unitsOnCurrentMedia]);

  const selectedSpeakerNamesForTrackLock = useMemo(
    () => selectedSpeakerIdsForTrackLock.map((id) => getSpeakerDisplayNameByKey(id, speakerByIdMap)),
    [selectedSpeakerIdsForTrackLock, speakerByIdMap],
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
