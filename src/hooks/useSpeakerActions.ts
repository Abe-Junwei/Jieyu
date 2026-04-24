/**
 * useSpeakerActions | 说话人管理 Hook
 *
 * 收口说话人相关状态、派生数据与操作回调，
 * 统一使用实体 speakerId 驱动。
 *
 * Consolidates speaker-related state, derived data, and action callbacks,
 * using materialized speakerId as the single source of truth.
 */

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { LayerUnitDocType, SpeakerDocType } from '../db';
import type { SaveState } from './transcriptionTypes';
import { LinguisticService } from '../services/LinguisticService';
import { fireAndForget } from '../utils/fireAndForget';
import { EMPTY_SPEAKER_REFERENCE_STATS, type SpeakerActionDialogState, type SpeakerFilterOption, type SpeakerReferenceStats, type SpeakerScope, type SpeakerVisual } from './speakerManagement/types';
import { applySpeakerAssignmentToUnits, getUnitSpeakerKey, renameSpeakerInUnits, sortSpeakersByName, upsertSpeaker } from './speakerManagement/speakerUtils';
import { buildSpeakerActionErrorOptions, buildSpeakerDisplayLabels, buildUnitSpeakerSummaryLabels, formatSpeakerAssignmentResult, formatSpeakerCleanupResult, formatSpeakerClearResult, formatSpeakerCreateAndAssignResult, formatSpeakerCreateOnlyResult, formatSpeakerDeleteAndClearResult, formatSpeakerDeleteAndMigrateResult, formatSpeakerExportContent, formatSpeakerExportDone, formatSpeakerMergeResult, formatSpeakerRenameResult, getSpeakerExportFallbackName, getSpeakerUndoLabel, type SpeakerFormat, type SpeakerTranslate } from './speakerManagement/speakerI18n';
import { useSpeakerDerivedState } from './speakerManagement/useSpeakerDerivedState';
import { reportActionError } from '../utils/actionErrorReporter';
import { reportValidationError } from '../utils/validationErrorReporter';

export { getUnitSpeakerKey };
export type { SpeakerFilterOption } from './speakerManagement/types';

type SpeakerStateSetter = Dispatch<SetStateAction<SpeakerDocType[]>>;
type UnitStateSetter = Dispatch<SetStateAction<LayerUnitDocType[]>>;

function normalizeSpeakerLookupName(value: string): string {
  return value.trim().toLocaleLowerCase('zh-Hans-CN');
}

export interface UseSpeakerActionsOptions {
  units: LayerUnitDocType[];
  setUnits: UnitStateSetter;
  speakers: SpeakerDocType[];
  setSpeakers: SpeakerStateSetter;
  unitsOnCurrentMedia: LayerUnitDocType[];
  activeUnitId: string | null;
  selectedUnitIds: Set<string>;
  selectedBatchUnits: LayerUnitDocType[];
  isReady: boolean;
  setUnitSelection: (primaryId: string, ids: string[]) => void;
  data: {
    pushUndo: (label: string) => void;
    undo: () => Promise<void>;
  };
  setSaveState: (state: SaveState) => void;
  getUnitTextForLayer: (unit: LayerUnitDocType) => string | null | undefined;
  formatTime: (seconds: number) => string;
  t: SpeakerTranslate;
  tf: SpeakerFormat;
  syncBatchSpeakerId?: boolean;
  speakerScopeOverride?: Partial<SpeakerScope>;
  speakerFilterOptionsOverride?: SpeakerFilterOption[];
  /** When set, `getSpeakerReferenceStats` counts only this media; otherwise whole project. */
  speakerReferenceStatsMediaId?: string | null;
}

export interface UseSpeakerActionsReturn {
  speakerOptions: SpeakerDocType[];
  speakerDraftName: string;
  setSpeakerDraftName: React.Dispatch<React.SetStateAction<string>>;
  batchSpeakerId: string;
  setBatchSpeakerId: React.Dispatch<React.SetStateAction<string>>;
  speakerSaving: boolean;
  activeSpeakerFilterKey: string;
  setActiveSpeakerFilterKey: React.Dispatch<React.SetStateAction<string>>;
  speakerDialogState: SpeakerActionDialogState | null;
  speakerVisualByUnitId: Record<string, SpeakerVisual>;
  speakerFilterOptions: SpeakerFilterOption[];
  speakerReferenceStats: Record<string, SpeakerReferenceStats>;
  speakerReferenceUnassignedStats: SpeakerReferenceStats;
  /** True when stats are scoped to `speakerReferenceStatsMediaId` (non-empty). */
  speakerReferenceStatsMediaScoped: boolean;
  speakerReferenceStatsReady: boolean;
  selectedSpeakerSummary: string;
  refreshSpeakers: () => Promise<void>;
  refreshSpeakerReferenceStats: () => Promise<void>;
  handleSelectSpeakerUnits: (speakerKey: string) => void;
  handleClearSpeakerAssignments: (speakerKey: string) => void;
  handleExportSpeakerSegments: (speakerKey: string) => void;
  handleRenameSpeaker: (speakerKey: string) => void;
  handleMergeSpeaker: (sourceSpeakerKey: string) => void;
  handleDeleteSpeaker: (sourceSpeakerKey: string) => void;
  handleDeleteUnusedSpeakers: () => Promise<void>;
  handleAssignSpeakerToUnits: (unitIds: Iterable<string>, speakerId?: string) => Promise<void>;
  handleCreateSpeakerAndAssignToUnits: (name: string, unitIds: Iterable<string>) => Promise<void>;
  handleAssignSpeakerToSelected: () => Promise<void>;
  handleCreateSpeakerAndAssign: () => Promise<void>;
  handleCreateSpeakerOnly: () => Promise<void>;
  closeSpeakerDialog: () => void;
  updateSpeakerDialogDraftName: (value: string) => void;
  updateSpeakerDialogTargetKey: (speakerKey: string) => void;
  confirmSpeakerDialog: () => Promise<void>;
}

export function useSpeakerActions({
  units,
  setUnits,
  speakers,
  setSpeakers,
  unitsOnCurrentMedia,
  activeUnitId,
  selectedUnitIds,
  selectedBatchUnits,
  isReady,
  setUnitSelection,
  data,
  setSaveState,
  getUnitTextForLayer,
  formatTime,
  t,
  tf,
  syncBatchSpeakerId = true,
  speakerScopeOverride,
  speakerFilterOptionsOverride,
  speakerReferenceStatsMediaId = null,
}: UseSpeakerActionsOptions): UseSpeakerActionsReturn {
  const [speakerDraftName, setSpeakerDraftName] = useState('');
  const [batchSpeakerId, setBatchSpeakerId] = useState('');
  const [speakerSaving, setSpeakerSaving] = useState(false);
  const [activeSpeakerFilterKey, setActiveSpeakerFilterKey] = useState('all');
  const [speakerDialogState, setSpeakerDialogState] = useState<SpeakerActionDialogState | null>(null);
  const [speakerReferenceStats, setSpeakerReferenceStats] = useState<Record<string, SpeakerReferenceStats>>({});
  const [speakerReferenceUnassignedStats, setSpeakerReferenceUnassignedStats] = useState<SpeakerReferenceStats>(
    EMPTY_SPEAKER_REFERENCE_STATS,
  );
  const [speakerReferenceStatsReady, setSpeakerReferenceStatsReady] = useState(false);

  const speakerReferenceStatsMediaScoped = Boolean(speakerReferenceStatsMediaId?.trim());

  const speakerOptions = speakers;
  const speakerDisplayLabels = useMemo(() => buildSpeakerDisplayLabels(t), [t]);
  const unitSpeakerSummaryLabels = useMemo(
    () => buildUnitSpeakerSummaryLabels(t, tf),
    [t, tf],
  );
  const speakerById = useMemo(
    () => new Map(speakerOptions.map((speaker) => [speaker.id, speaker] as const)),
    [speakerOptions],
  );

  const {
    speakerVisualByUnitId: derivedSpeakerVisualByUnitId,
    speakerFilterOptions: derivedSpeakerFilterOptions,
    selectedSpeakerSummary: derivedSelectedSpeakerSummary,
  } = useSpeakerDerivedState(
    unitsOnCurrentMedia,
    selectedBatchUnits,
    speakerOptions,
    {
      displayLabels: speakerDisplayLabels,
      summaryLabels: unitSpeakerSummaryLabels,
    },
  );

  const speakerVisualByUnitId = speakerScopeOverride?.speakerVisualByUnitId ?? derivedSpeakerVisualByUnitId;
  const speakerFilterOptions = speakerScopeOverride?.speakerFilterOptions ?? speakerFilterOptionsOverride ?? derivedSpeakerFilterOptions;
  const selectedSpeakerSummary = speakerScopeOverride?.selectedSpeakerSummary ?? derivedSelectedSpeakerSummary;
  const unusedSpeakerIds = useMemo(() => speakerOptions
    .filter((speaker) => speakerReferenceStatsReady && (speakerReferenceStats[speaker.id]?.totalCount ?? 0) === 0)
    .map((speaker) => speaker.id), [speakerOptions, speakerReferenceStats, speakerReferenceStatsReady]);

  const refreshSpeakers = useCallback(async () => {
    const nextSpeakers = await LinguisticService.getSpeakers();
    setSpeakers(nextSpeakers);
  }, [setSpeakers]);

  const refreshSpeakerReferenceStats = useCallback(async () => {
    const mediaKey = speakerReferenceStatsMediaId?.trim() ?? '';
    const bundle = await LinguisticService.getSpeakerReferenceStats(
      mediaKey.length > 0 ? { mediaId: mediaKey } : {},
    );
    setSpeakerReferenceStats(bundle.perSpeaker);
    setSpeakerReferenceUnassignedStats(bundle.unassigned);
    setSpeakerReferenceStatsReady(true);
  }, [speakerReferenceStatsMediaId]);

  const findExistingSpeakerByName = useCallback((rawName: string) => {
    const normalizedName = normalizeSpeakerLookupName(rawName);
    if (!normalizedName) return undefined;
    return speakerOptions.find((speaker) => normalizeSpeakerLookupName(speaker.name) === normalizedName);
  }, [speakerOptions]);

  const getUnitIdsForSpeakerKey = useCallback((speakerKey: string) => (
    unitsOnCurrentMedia
      .filter((unit) => getUnitSpeakerKey(unit) === speakerKey)
      .map((unit) => unit.id)
  ), [unitsOnCurrentMedia]);

  const applySpeakerLocally = useCallback((unitIds: Iterable<string>, speaker?: Pick<SpeakerDocType, 'id' | 'name'>) => {
    setUnits((prev) => applySpeakerAssignmentToUnits(prev, unitIds, speaker));
  }, [setUnits]);

  useEffect(() => {
    if (!isReady) return;
    fireAndForget(refreshSpeakers());
    fireAndForget(refreshSpeakerReferenceStats());
  }, [isReady, refreshSpeakerReferenceStats, refreshSpeakers, speakerReferenceStatsMediaId]);

  useEffect(() => {
    if (activeSpeakerFilterKey === 'all') return;
    if (speakerFilterOptions.some((option) => option.key === activeSpeakerFilterKey)) return;
    setActiveSpeakerFilterKey('all');
  }, [activeSpeakerFilterKey, speakerFilterOptions]);

  useEffect(() => {
    if (!syncBatchSpeakerId) return;
    if (selectedBatchUnits.length === 0) {
      setBatchSpeakerId('');
      return;
    }
    const firstSpeakerId = selectedBatchUnits[0]?.speakerId;
    if (!firstSpeakerId) {
      setBatchSpeakerId('');
      return;
    }
    const allSame = selectedBatchUnits.every((unit) => unit.speakerId === firstSpeakerId);
    setBatchSpeakerId(allSame ? firstSpeakerId : '');
  }, [selectedBatchUnits, syncBatchSpeakerId]);

  const handleSelectSpeakerUnits = useCallback((speakerKey: string) => {
    const ids = getUnitIdsForSpeakerKey(speakerKey);
    if (ids.length === 0) {
      setUnitSelection('', []);
      return;
    }
    const primary = ids.includes(activeUnitId ?? '') ? (activeUnitId ?? ids[0]!) : ids[0]!;
    setUnitSelection(primary, ids);
    setActiveSpeakerFilterKey(speakerKey);
  }, [activeUnitId, getUnitIdsForSpeakerKey, setUnitSelection]);

  const handleClearSpeakerAssignments = useCallback((speakerKey: string) => {
    const target = speakerFilterOptions.find((option) => option.key === speakerKey);
    const ids = getUnitIdsForSpeakerKey(speakerKey);
    if (ids.length === 0) {
      reportValidationError({
        message: t('transcription.error.validation.clearSpeakerNoTarget'),
        i18nKey: 'transcription.error.validation.clearSpeakerNoTarget',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }
    setSpeakerDialogState({
      mode: 'clear',
      speakerKey,
      speakerName: target?.name ?? speakerDisplayLabels.unnamedSpeaker,
      affectedCount: ids.length,
    });
  }, [getUnitIdsForSpeakerKey, setSaveState, speakerDisplayLabels.unnamedSpeaker, speakerFilterOptions, t]);

  const handleExportSpeakerSegments = useCallback((speakerKey: string) => {
    const target = speakerFilterOptions.find((item) => item.key === speakerKey);
    const speakerName = target?.name ?? getSpeakerExportFallbackName(t);
    const rows = unitsOnCurrentMedia
      .filter((unit) => getUnitSpeakerKey(unit) === speakerKey)
      .sort((left, right) => left.startTime - right.startTime)
      .map((unit, index) => {
        const text = getUnitTextForLayer(unit) || '';
        return `${index + 1}. [${formatTime(unit.startTime)} - ${formatTime(unit.endTime)}] ${text}`;
      });

    if (rows.length === 0) {
      reportValidationError({
        message: t('transcription.error.validation.exportSpeakerNoSegments'),
        i18nKey: 'transcription.error.validation.exportSpeakerNoSegments',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    if (typeof window === 'undefined') {
      reportValidationError({
        message: t('transcription.error.validation.exportSpeakerUnsupportedEnv'),
        i18nKey: 'transcription.error.validation.exportSpeakerUnsupportedEnv',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    const content = formatSpeakerExportContent('units', speakerName, rows, t, tf);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `speaker-${speakerName.replace(/\s+/g, '-')}-${Date.now()}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setSaveState({ kind: 'done', message: formatSpeakerExportDone('units', rows.length, t, tf) });
  }, [formatTime, getUnitTextForLayer, setSaveState, speakerFilterOptions, t, tf, unitsOnCurrentMedia]);

  const handleRenameSpeaker = useCallback((speakerKey: string) => {
      const normalizedKey = speakerKey.trim();
      const current = normalizedKey ? speakerById.get(normalizedKey) : undefined;
    if (!current) {
      reportValidationError({
        message: t('transcription.error.validation.renameSpeakerNotFound'),
        i18nKey: 'transcription.error.validation.renameSpeakerNotFound',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }
    setSpeakerDialogState({
      mode: 'rename',
      speakerKey: normalizedKey,
      speakerName: current.name,
      draftName: current.name,
    });
  }, [setSaveState, speakerById, t]);

  const handleMergeSpeaker = useCallback((sourceSpeakerKey: string) => {
    const normalizedKey = sourceSpeakerKey.trim();
    const source = normalizedKey ? speakerById.get(normalizedKey) : undefined;
    if (!source) {
      reportValidationError({
        message: t('transcription.error.validation.renameSpeakerNotFound'),
        i18nKey: 'transcription.error.validation.renameSpeakerNotFound',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }
    const candidates = speakerOptions
      .filter((speaker) => speaker.id !== normalizedKey)
      .map((speaker) => ({ key: speaker.id, name: speaker.name }));
    if (candidates.length === 0) {
      reportValidationError({
        message: t('transcription.error.validation.mergeSpeakerNoTarget'),
        i18nKey: 'transcription.error.validation.mergeSpeakerNoTarget',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }
    setSpeakerDialogState({
      mode: 'merge',
      sourceSpeakerKey: normalizedKey,
      sourceSpeakerName: source.name,
      targetSpeakerKey: candidates[0]!.key,
      candidates,
    });
  }, [setSaveState, speakerById, speakerOptions, t]);

  const handleDeleteSpeaker = useCallback((sourceSpeakerKey: string) => {
    const normalizedKey = sourceSpeakerKey.trim();
    const source = normalizedKey ? speakerById.get(normalizedKey) : undefined;
    if (!source) {
      reportValidationError({
        message: t('transcription.error.validation.deleteSpeakerEntityNotFound'),
        i18nKey: 'transcription.error.validation.deleteSpeakerEntityNotFound',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    const candidates = speakerOptions
      .filter((speaker) => speaker.id !== normalizedKey)
      .map((speaker) => ({ key: speaker.id, name: speaker.name }));

    setSpeakerDialogState({
      mode: 'delete',
      sourceSpeakerKey: normalizedKey,
      sourceSpeakerName: source.name,
      replacementSpeakerKey: candidates[0]?.key ?? '',
      candidates,
      affectedCount: speakerReferenceStats[normalizedKey]?.totalCount ?? 0,
    });
  }, [setSaveState, speakerById, speakerOptions, speakerReferenceStats, t]);

  const handleAssignSpeakerToSelected = useCallback(async () => {
    if (selectedUnitIds.size === 0 && !activeUnitId) return;
    if (speakerSaving) return;
    setSpeakerSaving(true);
    try {
      data.pushUndo(getSpeakerUndoLabel('assign', t));
      const speaker = batchSpeakerId ? speakerById.get(batchSpeakerId) : undefined;
      const targetIds = selectedUnitIds.size > 0
        ? Array.from(selectedUnitIds) 
        : (activeUnitId ? [activeUnitId] : []);
      
      const updated = await LinguisticService.assignSpeakerToUnits(
        targetIds,
        batchSpeakerId || undefined,
      );
      applySpeakerLocally(targetIds, speaker);
      setBatchSpeakerId(batchSpeakerId || '');
      await refreshSpeakerReferenceStats();
      setSaveState({
        kind: 'done',
        message: formatSpeakerAssignmentResult('units', updated, t, tf),
      });
    } catch (error) {
      reportActionError({
        error,
        ...buildSpeakerActionErrorOptions('assign', error, t, tf),
        conflictI18nKey: 'transcription.error.conflict.assignSpeaker',
        fallbackI18nKey: 'transcription.error.action.assignSpeakerFailed',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
    } finally {
      setSpeakerSaving(false);
    }
  }, [activeUnitId, applySpeakerLocally, batchSpeakerId, data, refreshSpeakerReferenceStats, selectedUnitIds, setBatchSpeakerId, setSaveState, speakerById, speakerSaving, t, tf]);

  const handleAssignSpeakerToUnits = useCallback(async (unitIds: Iterable<string>, speakerId?: string) => {
    const targetIds = Array.from(new Set(unitIds)).filter((id) => id.trim().length > 0);
    if (targetIds.length === 0 || speakerSaving) return;

    setSpeakerSaving(true);
    try {
      data.pushUndo(getSpeakerUndoLabel('assign', t));
      const speaker = speakerId ? speakerById.get(speakerId) : undefined;
      const updated = await LinguisticService.assignSpeakerToUnits(targetIds, speakerId);
      applySpeakerLocally(targetIds, speaker);
      if (speakerId) {
        setBatchSpeakerId(speakerId);
      }
      await refreshSpeakerReferenceStats();
      setSaveState({
        kind: 'done',
        message: formatSpeakerAssignmentResult('units', updated, t, tf),
      });
    } catch (error) {
      reportActionError({
        error,
        ...buildSpeakerActionErrorOptions('assign', error, t, tf),
        conflictI18nKey: 'transcription.error.conflict.assignSpeaker',
        fallbackI18nKey: 'transcription.error.action.assignSpeakerFailed',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
    } finally {
      setSpeakerSaving(false);
    }
  }, [applySpeakerLocally, data, refreshSpeakerReferenceStats, setSaveState, speakerById, speakerSaving, setBatchSpeakerId, t, tf]);

  const handleCreateSpeakerAndAssign = useCallback(async () => {
    const name = speakerDraftName.trim();
    if (!name || speakerSaving) return;
    if (selectedUnitIds.size === 0 && !activeUnitId) return;

    setSpeakerSaving(true);
    let undoPushed = false;
    try {
      const existing = findExistingSpeakerByName(name);
      data.pushUndo(getSpeakerUndoLabel(existing ? 'reuseAndAssign' : 'createAndAssign', t));
      undoPushed = true;
      const targetIds = selectedUnitIds.size > 0
        ? Array.from(selectedUnitIds) 
        : (activeUnitId ? [activeUnitId] : []);

      const targetSpeaker = existing ?? await LinguisticService.createSpeaker({ name });
      const updated = await LinguisticService.assignSpeakerToUnits(targetIds, targetSpeaker.id);
      if (!existing) {
        setSpeakers((prev) => upsertSpeaker(prev, targetSpeaker));
      }
      applySpeakerLocally(targetIds, targetSpeaker);
      setSpeakerDraftName('');
      setBatchSpeakerId(targetSpeaker.id);
      await refreshSpeakerReferenceStats();
      setSaveState({
        kind: 'done',
        message: formatSpeakerCreateAndAssignResult('units', targetSpeaker.name, updated, Boolean(existing), t, tf),
      });
    } catch (error) {
      if (undoPushed) await data.undo();
      reportActionError({
        error,
        ...buildSpeakerActionErrorOptions('create', error, t, tf),
        conflictI18nKey: 'transcription.error.conflict.createSpeaker',
        fallbackI18nKey: 'transcription.error.action.createSpeakerFailed',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
    } finally {
      setSpeakerSaving(false);
    }
  }, [activeUnitId, applySpeakerLocally, data, findExistingSpeakerByName, refreshSpeakerReferenceStats, selectedUnitIds, setSaveState, setSpeakers, speakerDraftName, speakerSaving, t, tf]);

  const handleCreateSpeakerAndAssignToUnits = useCallback(async (name: string, unitIds: Iterable<string>) => {
    const targetIds = Array.from(new Set(unitIds)).filter((id) => id.trim().length > 0);
    const trimmedName = name.trim();
    if (!trimmedName || targetIds.length === 0 || speakerSaving) return;

    setSpeakerSaving(true);
    let undoPushed = false;
    try {
      const existing = findExistingSpeakerByName(trimmedName);
      data.pushUndo(getSpeakerUndoLabel(existing ? 'reuseAndAssign' : 'createAndAssign', t));
      undoPushed = true;
      const targetSpeaker = existing ?? await LinguisticService.createSpeaker({ name: trimmedName });
      const updated = await LinguisticService.assignSpeakerToUnits(targetIds, targetSpeaker.id);
      if (!existing) {
        setSpeakers((prev) => upsertSpeaker(prev, targetSpeaker));
      }
      applySpeakerLocally(targetIds, targetSpeaker);
      setBatchSpeakerId(targetSpeaker.id);
      await refreshSpeakerReferenceStats();
      setSaveState({
        kind: 'done',
        message: formatSpeakerCreateAndAssignResult('units', targetSpeaker.name, updated, Boolean(existing), t, tf),
      });
    } catch (error) {
      if (undoPushed) await data.undo();
      reportActionError({
        error,
        ...buildSpeakerActionErrorOptions('create', error, t, tf),
        conflictI18nKey: 'transcription.error.conflict.createSpeaker',
        fallbackI18nKey: 'transcription.error.action.createSpeakerFailed',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
    } finally {
      setSpeakerSaving(false);
    }
  }, [applySpeakerLocally, data, findExistingSpeakerByName, refreshSpeakerReferenceStats, setBatchSpeakerId, setSaveState, setSpeakers, speakerSaving, t, tf]);

  const handleCreateSpeakerOnly = useCallback(async () => {
    const name = speakerDraftName.trim();
    if (!name || speakerSaving) return;
    setSpeakerSaving(true);
    try {
      const existing = findExistingSpeakerByName(name);
      if (existing) {
        setSpeakerDraftName('');
        setBatchSpeakerId(existing.id);
        setSaveState({ kind: 'done', message: formatSpeakerCreateOnlyResult(existing.name, true, tf) });
        return;
      }
      const created = await LinguisticService.createSpeaker({ name });
      setSpeakers((prev) => upsertSpeaker(prev, created));
      setSpeakerDraftName('');
      await refreshSpeakerReferenceStats();
      setSaveState({ kind: 'done', message: formatSpeakerCreateOnlyResult(created.name, false, tf) });
    } catch (error) {
      reportActionError({
        error,
        ...buildSpeakerActionErrorOptions('create', error, t, tf),
        conflictI18nKey: 'transcription.error.conflict.createSpeaker',
        fallbackI18nKey: 'transcription.error.action.createSpeakerFailed',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
    } finally {
      setSpeakerSaving(false);
    }
  }, [findExistingSpeakerByName, refreshSpeakerReferenceStats, setBatchSpeakerId, setSaveState, setSpeakerDraftName, setSpeakers, speakerDraftName, speakerSaving, t, tf]);

  const handleDeleteUnusedSpeakers = useCallback(async () => {
    if (unusedSpeakerIds.length === 0 || speakerSaving) return;

    setSpeakerSaving(true);
    let undoPushed = false;
    try {
      data.pushUndo(getSpeakerUndoLabel('cleanupUnused', t));
      undoPushed = true;
      await Promise.all(unusedSpeakerIds.map((speakerId) => LinguisticService.deleteSpeaker(speakerId)));
      setSpeakers((prev) => sortSpeakersByName(prev.filter((speaker) => !unusedSpeakerIds.includes(speaker.id))));
      if (unusedSpeakerIds.includes(activeSpeakerFilterKey)) {
        setActiveSpeakerFilterKey('all');
      }
      await refreshSpeakerReferenceStats();
      setSaveState({ kind: 'done', message: formatSpeakerCleanupResult(unusedSpeakerIds.length, tf) });
    } catch (error) {
      if (undoPushed) await data.undo();
      reportActionError({
        error,
        ...buildSpeakerActionErrorOptions('cleanupUnused', error, t, tf),
        conflictI18nKey: 'transcription.error.conflict.cleanupUnusedSpeaker',
        fallbackI18nKey: 'transcription.error.action.cleanupUnusedSpeakerFailed',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
    } finally {
      setSpeakerSaving(false);
    }
  }, [activeSpeakerFilterKey, data, refreshSpeakerReferenceStats, setSaveState, setSpeakers, speakerSaving, t, tf, unusedSpeakerIds]);

  const closeSpeakerDialog = useCallback(() => {
    if (speakerSaving) return;
    setSpeakerDialogState(null);
  }, [speakerSaving]);

  const updateSpeakerDialogDraftName = useCallback((value: string) => {
    setSpeakerDialogState((prev) => (
      prev?.mode === 'rename'
        ? { ...prev, draftName: value }
        : prev
    ));
  }, []);

  const updateSpeakerDialogTargetKey = useCallback((speakerKey: string) => {
    setSpeakerDialogState((prev) => (
      prev?.mode === 'merge'
        ? { ...prev, targetSpeakerKey: speakerKey }
        : prev?.mode === 'delete'
          ? { ...prev, replacementSpeakerKey: speakerKey }
          : prev
    ));
  }, []);

  const confirmSpeakerDialog = useCallback(async () => {
    if (!speakerDialogState || speakerSaving) return;
    setSpeakerSaving(true);
    let undoPushed = false;
    try {
      if (speakerDialogState.mode === 'clear') {
        const unitIds = getUnitIdsForSpeakerKey(speakerDialogState.speakerKey);
        if (unitIds.length === 0) {
          reportValidationError({
            message: t('transcription.error.validation.clearSpeakerNoTarget'),
            i18nKey: 'transcription.error.validation.clearSpeakerNoTarget',
            setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
          });
          setSpeakerDialogState(null);
          return;
        }
        data.pushUndo(getSpeakerUndoLabel('clearTag', t));
        undoPushed = true;
        const cleared = await LinguisticService.assignSpeakerToUnits(unitIds, undefined);
        applySpeakerLocally(unitIds, undefined);
        await refreshSpeakerReferenceStats();
        setActiveSpeakerFilterKey('all');
        setSaveState({ kind: 'done', message: formatSpeakerClearResult('units', cleared, t, tf) });
      }

      if (speakerDialogState.mode === 'rename') {
        const nextName = speakerDialogState.draftName.trim();
        if (!nextName) {
          reportValidationError({
            message: t('transcription.error.validation.renameSpeakerEmptyName'),
            i18nKey: 'transcription.error.validation.renameSpeakerEmptyName',
            setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
          });
          return;
        }
        data.pushUndo(getSpeakerUndoLabel('rename', t));
        undoPushed = true;
        const updated = await LinguisticService.renameSpeaker(speakerDialogState.speakerKey, nextName);
        setSpeakers((prev) => upsertSpeaker(prev, updated));
        setUnits((prev) => renameSpeakerInUnits(prev, updated.id, updated.name));
        setSaveState({ kind: 'done', message: formatSpeakerRenameResult(updated.name, tf) });
      }

      if (speakerDialogState.mode === 'merge') {
        const targetSpeaker = speakerById.get(speakerDialogState.targetSpeakerKey);
        if (!targetSpeaker) {
          reportValidationError({
            message: t('transcription.error.validation.mergeSpeakerTargetMissing'),
            i18nKey: 'transcription.error.validation.mergeSpeakerTargetMissing',
            setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
          });
          return;
        }
        data.pushUndo(getSpeakerUndoLabel('merge', t));
        undoPushed = true;
        const moved = await LinguisticService.mergeSpeakers(
          speakerDialogState.sourceSpeakerKey,
          speakerDialogState.targetSpeakerKey,
        );
        setSpeakers((prev) => sortSpeakersByName(prev.filter((speaker) => speaker.id !== speakerDialogState.sourceSpeakerKey)));
        setUnits((prev) => prev.map((unit) => (
          unit.speakerId === speakerDialogState.sourceSpeakerKey
            ? { ...unit, speakerId: targetSpeaker.id, speaker: targetSpeaker.name }
            : unit
        )));
        await refreshSpeakerReferenceStats();
        setActiveSpeakerFilterKey(targetSpeaker.id);
        setSaveState({ kind: 'done', message: formatSpeakerMergeResult(moved, targetSpeaker.name, tf) });
      }

      if (speakerDialogState.mode === 'delete') {
        const replacementSpeakerKey = speakerDialogState.replacementSpeakerKey.trim();
        if (replacementSpeakerKey.length > 0) {
          const replacementSpeaker = speakerById.get(replacementSpeakerKey);
          if (!replacementSpeaker) {
            reportValidationError({
              message: t('transcription.error.validation.deleteSpeakerEntityTargetMissing'),
              i18nKey: 'transcription.error.validation.deleteSpeakerEntityTargetMissing',
              setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
            });
            return;
          }

          data.pushUndo(getSpeakerUndoLabel('deleteAndMigrate', t));
          undoPushed = true;
          const moved = await LinguisticService.deleteSpeaker(speakerDialogState.sourceSpeakerKey, {
            strategy: 'merge',
            targetSpeakerId: replacementSpeaker.id,
          });
          setSpeakers((prev) => sortSpeakersByName(prev.filter((speaker) => speaker.id !== speakerDialogState.sourceSpeakerKey)));
          setUnits((prev) => prev.map((unit) => (
            unit.speakerId === speakerDialogState.sourceSpeakerKey
              ? { ...unit, speakerId: replacementSpeaker.id, speaker: replacementSpeaker.name }
              : unit
          )));
          await refreshSpeakerReferenceStats();
          setActiveSpeakerFilterKey(replacementSpeaker.id);
          setSaveState({ kind: 'done', message: formatSpeakerDeleteAndMigrateResult(moved, replacementSpeaker.name, tf) });
        } else {
          data.pushUndo(getSpeakerUndoLabel('deleteEntity', t));
          undoPushed = true;
          const cleared = await LinguisticService.deleteSpeaker(speakerDialogState.sourceSpeakerKey, {
            strategy: 'clear',
          });
          setSpeakers((prev) => sortSpeakersByName(prev.filter((speaker) => speaker.id !== speakerDialogState.sourceSpeakerKey)));
          setUnits((prev) => prev.map((unit) => {
            if (unit.speakerId !== speakerDialogState.sourceSpeakerKey) return unit;
            const { speaker: _speaker, speakerId: _speakerId, ...rest } = unit;
            return rest;
          }));
          await refreshSpeakerReferenceStats();
          if (activeSpeakerFilterKey === speakerDialogState.sourceSpeakerKey) {
            setActiveSpeakerFilterKey('all');
          }
          setSaveState({ kind: 'done', message: formatSpeakerDeleteAndClearResult(cleared, tf) });
        }
      }

      setSpeakerDialogState(null);
    } catch (error) {
      if (undoPushed) await data.undo();
      reportActionError({
        error,
        ...buildSpeakerActionErrorOptions('dialogOperation', error, t, tf),
        conflictI18nKey: 'transcription.error.conflict.speakerDialogOperation',
        fallbackI18nKey: 'transcription.error.action.speakerDialogOperationFailed',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
    } finally {
      setSpeakerSaving(false);
    }
  }, [activeSpeakerFilterKey, applySpeakerLocally, data, getUnitIdsForSpeakerKey, refreshSpeakerReferenceStats, setSaveState, setSpeakers, setUnits, speakerById, speakerDialogState, speakerSaving, t, tf]);

  return useMemo((): UseSpeakerActionsReturn => ({
    speakerOptions,
    speakerDraftName,
    setSpeakerDraftName,
    batchSpeakerId,
    setBatchSpeakerId,
    speakerSaving,
    activeSpeakerFilterKey,
    setActiveSpeakerFilterKey,
    speakerDialogState,
    speakerVisualByUnitId,
    speakerFilterOptions,
    speakerReferenceStats,
    speakerReferenceUnassignedStats,
    speakerReferenceStatsMediaScoped,
    speakerReferenceStatsReady,
    selectedSpeakerSummary,
    refreshSpeakers,
    refreshSpeakerReferenceStats,
    handleSelectSpeakerUnits,
    handleClearSpeakerAssignments,
    handleExportSpeakerSegments,
    handleRenameSpeaker,
    handleMergeSpeaker,
    handleDeleteSpeaker,
    handleDeleteUnusedSpeakers,
    handleAssignSpeakerToUnits,
    handleCreateSpeakerAndAssignToUnits,
    handleAssignSpeakerToSelected,
    handleCreateSpeakerAndAssign,
    handleCreateSpeakerOnly,
    closeSpeakerDialog,
    updateSpeakerDialogDraftName,
    updateSpeakerDialogTargetKey,
    confirmSpeakerDialog,
  }), [
    activeSpeakerFilterKey,
    batchSpeakerId,
    closeSpeakerDialog,
    confirmSpeakerDialog,
    handleAssignSpeakerToSelected,
    handleAssignSpeakerToUnits,
    handleClearSpeakerAssignments,
    handleCreateSpeakerAndAssign,
    handleCreateSpeakerAndAssignToUnits,
    handleCreateSpeakerOnly,
    handleDeleteSpeaker,
    handleDeleteUnusedSpeakers,
    handleExportSpeakerSegments,
    handleMergeSpeaker,
    handleRenameSpeaker,
    handleSelectSpeakerUnits,
    refreshSpeakerReferenceStats,
    refreshSpeakers,
    selectedSpeakerSummary,
    setActiveSpeakerFilterKey,
    setBatchSpeakerId,
    setSpeakerDraftName,
    speakerDialogState,
    speakerFilterOptions,
    speakerOptions,
    speakerReferenceStats,
    speakerReferenceStatsMediaScoped,
    speakerReferenceStatsReady,
    speakerReferenceUnassignedStats,
    speakerSaving,
    speakerVisualByUnitId,
    updateSpeakerDialogDraftName,
    updateSpeakerDialogTargetKey,
  ]);
}
