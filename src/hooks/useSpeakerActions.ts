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
import type { UtteranceDocType, SpeakerDocType } from '../db';
import type { SaveState } from './transcriptionTypes';
import { LinguisticService } from '../services/LinguisticService';
import { fireAndForget } from '../utils/fireAndForget';
import type {
  SpeakerActionDialogState,
  SpeakerFilterOption,
  SpeakerReferenceStats,
  SpeakerScope,
  SpeakerVisual,
} from './speakerManagement/types';
import {
  applySpeakerAssignmentToUtterances,
  getUtteranceSpeakerKey,
  renameSpeakerInUtterances,
  sortSpeakersByName,
  upsertSpeaker,
} from './speakerManagement/speakerUtils';
import { useSpeakerDerivedState } from './speakerManagement/useSpeakerDerivedState';
import { reportActionError } from '../utils/actionErrorReporter';
import { reportValidationError } from '../utils/validationErrorReporter';

export { getUtteranceSpeakerKey };
export type { SpeakerFilterOption } from './speakerManagement/types';

type SpeakerStateSetter = Dispatch<SetStateAction<SpeakerDocType[]>>;
type UtteranceStateSetter = Dispatch<SetStateAction<UtteranceDocType[]>>;

function normalizeSpeakerLookupName(value: string): string {
  return value.trim().toLocaleLowerCase('zh-Hans-CN');
}

export interface UseSpeakerActionsOptions {
  utterances: UtteranceDocType[];
  setUtterances: UtteranceStateSetter;
  speakers: SpeakerDocType[];
  setSpeakers: SpeakerStateSetter;
  utterancesOnCurrentMedia: UtteranceDocType[];
  activeUtteranceUnitId: string | null;
  selectedUtteranceIds: Set<string>;
  selectedBatchUtterances: UtteranceDocType[];
  isReady: boolean;
  setUtteranceSelection: (primaryId: string, ids: string[]) => void;
  data: {
    pushUndo: (label: string) => void;
    undo: () => Promise<void>;
  };
  setSaveState: (state: SaveState) => void;
  getUtteranceTextForLayer: (utterance: UtteranceDocType) => string | null | undefined;
  formatTime: (seconds: number) => string;
  syncBatchSpeakerId?: boolean;
  speakerScopeOverride?: Partial<SpeakerScope>;
  speakerFilterOptionsOverride?: SpeakerFilterOption[];
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
  speakerVisualByUtteranceId: Record<string, SpeakerVisual>;
  speakerFilterOptions: SpeakerFilterOption[];
  speakerReferenceStats: Record<string, SpeakerReferenceStats>;
  speakerReferenceStatsReady: boolean;
  selectedSpeakerSummary: string;
  refreshSpeakers: () => Promise<void>;
  refreshSpeakerReferenceStats: () => Promise<void>;
  handleSelectSpeakerUtterances: (speakerKey: string) => void;
  handleClearSpeakerAssignments: (speakerKey: string) => void;
  handleExportSpeakerSegments: (speakerKey: string) => void;
  handleRenameSpeaker: (speakerKey: string) => void;
  handleMergeSpeaker: (sourceSpeakerKey: string) => void;
  handleDeleteSpeaker: (sourceSpeakerKey: string) => void;
  handleDeleteUnusedSpeakers: () => Promise<void>;
  handleAssignSpeakerToUtterances: (utteranceIds: Iterable<string>, speakerId?: string) => Promise<void>;
  handleCreateSpeakerAndAssignToUtterances: (name: string, utteranceIds: Iterable<string>) => Promise<void>;
  handleAssignSpeakerToSelected: () => Promise<void>;
  handleCreateSpeakerAndAssign: () => Promise<void>;
  handleCreateSpeakerOnly: () => Promise<void>;
  closeSpeakerDialog: () => void;
  updateSpeakerDialogDraftName: (value: string) => void;
  updateSpeakerDialogTargetKey: (speakerKey: string) => void;
  confirmSpeakerDialog: () => Promise<void>;
}

export function useSpeakerActions({
  utterances,
  setUtterances,
  speakers,
  setSpeakers,
  utterancesOnCurrentMedia,
  activeUtteranceUnitId,
  selectedUtteranceIds,
  selectedBatchUtterances,
  isReady,
  setUtteranceSelection,
  data,
  setSaveState,
  getUtteranceTextForLayer,
  formatTime,
  syncBatchSpeakerId = true,
  speakerScopeOverride,
  speakerFilterOptionsOverride,
}: UseSpeakerActionsOptions): UseSpeakerActionsReturn {
  const [speakerDraftName, setSpeakerDraftName] = useState('');
  const [batchSpeakerId, setBatchSpeakerId] = useState('');
  const [speakerSaving, setSpeakerSaving] = useState(false);
  const [activeSpeakerFilterKey, setActiveSpeakerFilterKey] = useState('all');
  const [speakerDialogState, setSpeakerDialogState] = useState<SpeakerActionDialogState | null>(null);
  const [speakerReferenceStats, setSpeakerReferenceStats] = useState<Record<string, SpeakerReferenceStats>>({});
  const [speakerReferenceStatsReady, setSpeakerReferenceStatsReady] = useState(false);

  const speakerOptions = speakers;
  const speakerById = useMemo(
    () => new Map(speakerOptions.map((speaker) => [speaker.id, speaker] as const)),
    [speakerOptions],
  );

  const {
    speakerVisualByUtteranceId: derivedSpeakerVisualByUtteranceId,
    speakerFilterOptions: derivedSpeakerFilterOptions,
    selectedSpeakerSummary: derivedSelectedSpeakerSummary,
  } = useSpeakerDerivedState(utterancesOnCurrentMedia, selectedBatchUtterances, speakerOptions);

  const speakerVisualByUtteranceId = speakerScopeOverride?.speakerVisualByUtteranceId ?? derivedSpeakerVisualByUtteranceId;
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
    const nextStats = await LinguisticService.getSpeakerReferenceStats();
    setSpeakerReferenceStats(nextStats);
    setSpeakerReferenceStatsReady(true);
  }, []);

  const findExistingSpeakerByName = useCallback((rawName: string) => {
    const normalizedName = normalizeSpeakerLookupName(rawName);
    if (!normalizedName) return undefined;
    return speakerOptions.find((speaker) => normalizeSpeakerLookupName(speaker.name) === normalizedName);
  }, [speakerOptions]);

  const getUtteranceIdsForSpeakerKey = useCallback((speakerKey: string) => (
    utterancesOnCurrentMedia
      .filter((utterance) => getUtteranceSpeakerKey(utterance) === speakerKey)
      .map((utterance) => utterance.id)
  ), [utterancesOnCurrentMedia]);

  const applySpeakerLocally = useCallback((utteranceIds: Iterable<string>, speaker?: Pick<SpeakerDocType, 'id' | 'name'>) => {
    setUtterances((prev) => applySpeakerAssignmentToUtterances(prev, utteranceIds, speaker));
  }, [setUtterances]);

  useEffect(() => {
    if (!isReady) return;
    fireAndForget(refreshSpeakers());
    fireAndForget(refreshSpeakerReferenceStats());
  }, [isReady, refreshSpeakerReferenceStats, refreshSpeakers]);

  useEffect(() => {
    if (activeSpeakerFilterKey === 'all') return;
    if (speakerFilterOptions.some((option) => option.key === activeSpeakerFilterKey)) return;
    setActiveSpeakerFilterKey('all');
  }, [activeSpeakerFilterKey, speakerFilterOptions]);

  useEffect(() => {
    if (!syncBatchSpeakerId) return;
    if (selectedBatchUtterances.length === 0) {
      setBatchSpeakerId('');
      return;
    }
    const firstSpeakerId = selectedBatchUtterances[0]?.speakerId;
    if (!firstSpeakerId) {
      setBatchSpeakerId('');
      return;
    }
    const allSame = selectedBatchUtterances.every((utterance) => utterance.speakerId === firstSpeakerId);
    setBatchSpeakerId(allSame ? firstSpeakerId : '');
  }, [selectedBatchUtterances, syncBatchSpeakerId]);

  const handleSelectSpeakerUtterances = useCallback((speakerKey: string) => {
    const ids = getUtteranceIdsForSpeakerKey(speakerKey);
    if (ids.length === 0) {
      setUtteranceSelection('', []);
      return;
    }
    const primary = ids.includes(activeUtteranceUnitId ?? '') ? (activeUtteranceUnitId ?? ids[0]!) : ids[0]!;
    setUtteranceSelection(primary, ids);
    setActiveSpeakerFilterKey(speakerKey);
  }, [activeUtteranceUnitId, getUtteranceIdsForSpeakerKey, setUtteranceSelection]);

  const handleClearSpeakerAssignments = useCallback((speakerKey: string) => {
    const target = speakerFilterOptions.find((option) => option.key === speakerKey);
    const ids = getUtteranceIdsForSpeakerKey(speakerKey);
    if (ids.length === 0) {
      reportValidationError({
        message: '未找到可清空的句段',
        i18nKey: 'transcription.error.validation.clearSpeakerNoTarget',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }
    setSpeakerDialogState({
      mode: 'clear',
      speakerKey,
      speakerName: target?.name ?? '未命名说话人',
      affectedCount: ids.length,
    });
  }, [getUtteranceIdsForSpeakerKey, setSaveState, speakerFilterOptions]);

  const handleExportSpeakerSegments = useCallback((speakerKey: string) => {
    const target = speakerFilterOptions.find((item) => item.key === speakerKey);
    const speakerName = target?.name ?? 'speaker';
    const rows = utterancesOnCurrentMedia
      .filter((utterance) => getUtteranceSpeakerKey(utterance) === speakerKey)
      .sort((left, right) => left.startTime - right.startTime)
      .map((utterance, index) => {
        const text = getUtteranceTextForLayer(utterance) || '';
        return `${index + 1}. [${formatTime(utterance.startTime)} - ${formatTime(utterance.endTime)}] ${text}`;
      });

    if (rows.length === 0) {
      reportValidationError({
        message: '该说话人暂无可导出的句段',
        i18nKey: 'transcription.error.validation.exportSpeakerNoSegments',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    if (typeof window === 'undefined') {
      reportValidationError({
        message: '当前环境不支持导出',
        i18nKey: 'transcription.error.validation.exportSpeakerUnsupportedEnv',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    const content = [`说话人: ${speakerName}`, `句段数量: ${rows.length}`, '', ...rows].join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `speaker-${speakerName.replace(/\s+/g, '-')}-${Date.now()}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setSaveState({ kind: 'done', message: `已导出 ${rows.length} 条句段` });
  }, [formatTime, getUtteranceTextForLayer, setSaveState, speakerFilterOptions, utterancesOnCurrentMedia]);

  const handleRenameSpeaker = useCallback((speakerKey: string) => {
      const normalizedKey = speakerKey.trim();
      const current = normalizedKey ? speakerById.get(normalizedKey) : undefined;
    if (!current) {
      reportValidationError({
        message: '未找到说话人',
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
  }, [setSaveState, speakerById]);

  const handleMergeSpeaker = useCallback((sourceSpeakerKey: string) => {
    const normalizedKey = sourceSpeakerKey.trim();
    const source = normalizedKey ? speakerById.get(normalizedKey) : undefined;
    if (!source) {
      reportValidationError({
        message: '未找到说话人',
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
        message: '没有可合并的目标说话人',
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
  }, [setSaveState, speakerById, speakerOptions]);

  const handleDeleteSpeaker = useCallback((sourceSpeakerKey: string) => {
    const normalizedKey = sourceSpeakerKey.trim();
    const source = normalizedKey ? speakerById.get(normalizedKey) : undefined;
    if (!source) {
      reportValidationError({
        message: '未找到说话人',
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
  }, [setSaveState, speakerById, speakerOptions, speakerReferenceStats]);

  const handleAssignSpeakerToSelected = useCallback(async () => {
    if (selectedUtteranceIds.size === 0 && !activeUtteranceUnitId) return;
    if (speakerSaving) return;
    setSpeakerSaving(true);
    try {
      data.pushUndo('批量指派说话人');
      const speaker = batchSpeakerId ? speakerById.get(batchSpeakerId) : undefined;
      const targetIds = selectedUtteranceIds.size > 0
        ? Array.from(selectedUtteranceIds) 
        : (activeUtteranceUnitId ? [activeUtteranceUnitId] : []);
      
      const updated = await LinguisticService.assignSpeakerToUtterances(
        targetIds,
        batchSpeakerId || undefined,
      );
      applySpeakerLocally(targetIds, speaker);
      setBatchSpeakerId(batchSpeakerId || '');
      await refreshSpeakerReferenceStats();
      setSaveState({
        kind: 'done',
        message: updated > 0 ? `已更新 ${updated} 条句段的说话人` : '未找到可更新句段',
      });
    } catch (error) {
      reportActionError({
        actionLabel: '说话人指派',
        error,
        i18nKey: 'transcription.error.action.assignSpeakerFailed',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
    } finally {
      setSpeakerSaving(false);
    }
  }, [activeUtteranceUnitId, applySpeakerLocally, batchSpeakerId, data, refreshSpeakerReferenceStats, selectedUtteranceIds, setBatchSpeakerId, setSaveState, speakerById, speakerSaving]);

  const handleAssignSpeakerToUtterances = useCallback(async (utteranceIds: Iterable<string>, speakerId?: string) => {
    const targetIds = Array.from(new Set(utteranceIds)).filter((id) => id.trim().length > 0);
    if (targetIds.length === 0 || speakerSaving) return;

    setSpeakerSaving(true);
    try {
      data.pushUndo('批量指派说话人');
      const speaker = speakerId ? speakerById.get(speakerId) : undefined;
      const updated = await LinguisticService.assignSpeakerToUtterances(targetIds, speakerId);
      applySpeakerLocally(targetIds, speaker);
      if (speakerId) {
        setBatchSpeakerId(speakerId);
      }
      await refreshSpeakerReferenceStats();
      setSaveState({
        kind: 'done',
        message: updated > 0 ? `已更新 ${updated} 条句段的说话人` : '未找到可更新句段',
      });
    } catch (error) {
      reportActionError({
        actionLabel: '说话人指派',
        error,
        i18nKey: 'transcription.error.action.assignSpeakerFailed',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
    } finally {
      setSpeakerSaving(false);
    }
  }, [applySpeakerLocally, data, refreshSpeakerReferenceStats, setSaveState, speakerById, speakerSaving, setBatchSpeakerId]);

  const handleCreateSpeakerAndAssign = useCallback(async () => {
    const name = speakerDraftName.trim();
    if (!name || speakerSaving) return;
    if (selectedUtteranceIds.size === 0 && !activeUtteranceUnitId) return;

    setSpeakerSaving(true);
    let undoPushed = false;
    try {
      const existing = findExistingSpeakerByName(name);
      data.pushUndo(existing ? '复用说话人并分配' : '新建并分配说话人');
      undoPushed = true;
      const targetIds = selectedUtteranceIds.size > 0
        ? Array.from(selectedUtteranceIds) 
        : (activeUtteranceUnitId ? [activeUtteranceUnitId] : []);

      const targetSpeaker = existing ?? await LinguisticService.createSpeaker({ name });
      const updated = await LinguisticService.assignSpeakerToUtterances(targetIds, targetSpeaker.id);
      if (!existing) {
        setSpeakers((prev) => upsertSpeaker(prev, targetSpeaker));
      }
      applySpeakerLocally(targetIds, targetSpeaker);
      setSpeakerDraftName('');
      setBatchSpeakerId(targetSpeaker.id);
      await refreshSpeakerReferenceStats();
      setSaveState({
        kind: 'done',
        message: existing
          ? `已复用现有说话人"${targetSpeaker.name}"，并应用到 ${updated} 条句段`
          : `已创建说话人"${targetSpeaker.name}"，并应用到 ${updated} 条句段`,
      });
    } catch (error) {
      if (undoPushed) await data.undo();
      reportActionError({
        actionLabel: '创建说话人',
        error,
        i18nKey: 'transcription.error.action.createSpeakerFailed',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
    } finally {
      setSpeakerSaving(false);
    }
  }, [activeUtteranceUnitId, applySpeakerLocally, data, findExistingSpeakerByName, refreshSpeakerReferenceStats, selectedUtteranceIds, setSaveState, setSpeakers, speakerDraftName, speakerSaving]);

  const handleCreateSpeakerAndAssignToUtterances = useCallback(async (name: string, utteranceIds: Iterable<string>) => {
    const targetIds = Array.from(new Set(utteranceIds)).filter((id) => id.trim().length > 0);
    const trimmedName = name.trim();
    if (!trimmedName || targetIds.length === 0 || speakerSaving) return;

    setSpeakerSaving(true);
    let undoPushed = false;
    try {
      const existing = findExistingSpeakerByName(trimmedName);
      data.pushUndo(existing ? '复用说话人并分配' : '新建并分配说话人');
      undoPushed = true;
      const targetSpeaker = existing ?? await LinguisticService.createSpeaker({ name: trimmedName });
      const updated = await LinguisticService.assignSpeakerToUtterances(targetIds, targetSpeaker.id);
      if (!existing) {
        setSpeakers((prev) => upsertSpeaker(prev, targetSpeaker));
      }
      applySpeakerLocally(targetIds, targetSpeaker);
      setBatchSpeakerId(targetSpeaker.id);
      await refreshSpeakerReferenceStats();
      setSaveState({
        kind: 'done',
        message: existing
          ? `已复用现有说话人"${targetSpeaker.name}"，并应用到 ${updated} 条句段`
          : `已创建说话人"${targetSpeaker.name}"，并应用到 ${updated} 条句段`,
      });
    } catch (error) {
      if (undoPushed) await data.undo();
      reportActionError({
        actionLabel: '创建说话人',
        error,
        i18nKey: 'transcription.error.action.createSpeakerFailed',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
    } finally {
      setSpeakerSaving(false);
    }
  }, [applySpeakerLocally, data, findExistingSpeakerByName, refreshSpeakerReferenceStats, setBatchSpeakerId, setSaveState, setSpeakers, speakerSaving]);

  const handleCreateSpeakerOnly = useCallback(async () => {
    const name = speakerDraftName.trim();
    if (!name || speakerSaving) return;
    setSpeakerSaving(true);
    try {
      const existing = findExistingSpeakerByName(name);
      if (existing) {
        setSpeakerDraftName('');
        setBatchSpeakerId(existing.id);
        setSaveState({ kind: 'done', message: `已复用现有说话人"${existing.name}"` });
        return;
      }
      const created = await LinguisticService.createSpeaker({ name });
      setSpeakers((prev) => upsertSpeaker(prev, created));
      setSpeakerDraftName('');
      await refreshSpeakerReferenceStats();
      setSaveState({ kind: 'done', message: `已创建说话人"${created.name}"` });
    } catch (error) {
      reportActionError({
        actionLabel: '创建说话人',
        error,
        i18nKey: 'transcription.error.action.createSpeakerFailed',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
    } finally {
      setSpeakerSaving(false);
    }
  }, [findExistingSpeakerByName, refreshSpeakerReferenceStats, setBatchSpeakerId, setSaveState, setSpeakerDraftName, setSpeakers, speakerDraftName, speakerSaving]);

  const handleDeleteUnusedSpeakers = useCallback(async () => {
    if (unusedSpeakerIds.length === 0 || speakerSaving) return;

    setSpeakerSaving(true);
    let undoPushed = false;
    try {
      data.pushUndo('清理未引用说话人实体');
      undoPushed = true;
      await Promise.all(unusedSpeakerIds.map((speakerId) => LinguisticService.deleteSpeaker(speakerId)));
      setSpeakers((prev) => sortSpeakersByName(prev.filter((speaker) => !unusedSpeakerIds.includes(speaker.id))));
      if (unusedSpeakerIds.includes(activeSpeakerFilterKey)) {
        setActiveSpeakerFilterKey('all');
      }
      await refreshSpeakerReferenceStats();
      setSaveState({ kind: 'done', message: `已清理 ${unusedSpeakerIds.length} 个未引用说话人实体` });
    } catch (error) {
      if (undoPushed) await data.undo();
      reportActionError({
        actionLabel: '清理未引用说话人',
        error,
        i18nKey: 'transcription.error.action.speakerDialogOperationFailed',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
    } finally {
      setSpeakerSaving(false);
    }
  }, [activeSpeakerFilterKey, data, refreshSpeakerReferenceStats, setSaveState, setSpeakers, speakerSaving, unusedSpeakerIds]);

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
        const utteranceIds = getUtteranceIdsForSpeakerKey(speakerDialogState.speakerKey);
        if (utteranceIds.length === 0) {
          reportValidationError({
            message: '未找到可清空的句段',
            i18nKey: 'transcription.error.validation.clearSpeakerNoTarget',
            setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
          });
          setSpeakerDialogState(null);
          return;
        }
        data.pushUndo('删除说话人标签');
        undoPushed = true;
        const cleared = await LinguisticService.assignSpeakerToUtterances(utteranceIds, undefined);
        applySpeakerLocally(utteranceIds, undefined);
        await refreshSpeakerReferenceStats();
        setActiveSpeakerFilterKey('all');
        setSaveState({ kind: 'done', message: `已清空 ${cleared} 条句段的说话人标签` });
      }

      if (speakerDialogState.mode === 'rename') {
        const nextName = speakerDialogState.draftName.trim();
        if (!nextName) {
          reportValidationError({
            message: '说话人名称不能为空',
            i18nKey: 'transcription.error.validation.renameSpeakerEmptyName',
            setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
          });
          return;
        }
        data.pushUndo('重命名说话人');
        undoPushed = true;
        const updated = await LinguisticService.renameSpeaker(speakerDialogState.speakerKey, nextName);
        setSpeakers((prev) => upsertSpeaker(prev, updated));
        setUtterances((prev) => renameSpeakerInUtterances(prev, updated.id, updated.name));
        setSaveState({ kind: 'done', message: `已重命名为"${updated.name}"` });
      }

      if (speakerDialogState.mode === 'merge') {
        const targetSpeaker = speakerById.get(speakerDialogState.targetSpeakerKey);
        if (!targetSpeaker) {
          reportValidationError({
            message: '未找到目标说话人',
            i18nKey: 'transcription.error.validation.mergeSpeakerTargetMissing',
            setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
          });
          return;
        }
        data.pushUndo('合并说话人');
        undoPushed = true;
        const moved = await LinguisticService.mergeSpeakers(
          speakerDialogState.sourceSpeakerKey,
          speakerDialogState.targetSpeakerKey,
        );
        setSpeakers((prev) => sortSpeakersByName(prev.filter((speaker) => speaker.id !== speakerDialogState.sourceSpeakerKey)));
        setUtterances((prev) => prev.map((utterance) => (
          utterance.speakerId === speakerDialogState.sourceSpeakerKey
            ? { ...utterance, speakerId: targetSpeaker.id, speaker: targetSpeaker.name }
            : utterance
        )));
        await refreshSpeakerReferenceStats();
        setActiveSpeakerFilterKey(targetSpeaker.id);
        setSaveState({ kind: 'done', message: `已合并，迁移 ${moved} 条句段到"${targetSpeaker.name}"` });
      }

      if (speakerDialogState.mode === 'delete') {
        const replacementSpeakerKey = speakerDialogState.replacementSpeakerKey.trim();
        if (replacementSpeakerKey.length > 0) {
          const replacementSpeaker = speakerById.get(replacementSpeakerKey);
          if (!replacementSpeaker) {
            reportValidationError({
              message: '未找到目标说话人',
              i18nKey: 'transcription.error.validation.deleteSpeakerEntityTargetMissing',
              setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
            });
            return;
          }

          data.pushUndo('删除并迁移说话人实体');
          undoPushed = true;
          const moved = await LinguisticService.deleteSpeaker(speakerDialogState.sourceSpeakerKey, {
            strategy: 'merge',
            targetSpeakerId: replacementSpeaker.id,
          });
          setSpeakers((prev) => sortSpeakersByName(prev.filter((speaker) => speaker.id !== speakerDialogState.sourceSpeakerKey)));
          setUtterances((prev) => prev.map((utterance) => (
            utterance.speakerId === speakerDialogState.sourceSpeakerKey
              ? { ...utterance, speakerId: replacementSpeaker.id, speaker: replacementSpeaker.name }
              : utterance
          )));
          await refreshSpeakerReferenceStats();
          setActiveSpeakerFilterKey(replacementSpeaker.id);
          setSaveState({ kind: 'done', message: `已删除说话人实体，并迁移 ${moved} 条句段到"${replacementSpeaker.name}"` });
        } else {
          data.pushUndo('删除说话人实体');
          undoPushed = true;
          const cleared = await LinguisticService.deleteSpeaker(speakerDialogState.sourceSpeakerKey, {
            strategy: 'clear',
          });
          setSpeakers((prev) => sortSpeakersByName(prev.filter((speaker) => speaker.id !== speakerDialogState.sourceSpeakerKey)));
          setUtterances((prev) => prev.map((utterance) => {
            if (utterance.speakerId !== speakerDialogState.sourceSpeakerKey) return utterance;
            const { speaker: _speaker, speakerId: _speakerId, ...rest } = utterance;
            return rest;
          }));
          await refreshSpeakerReferenceStats();
          if (activeSpeakerFilterKey === speakerDialogState.sourceSpeakerKey) {
            setActiveSpeakerFilterKey('all');
          }
          setSaveState({ kind: 'done', message: `已删除说话人实体，并删除 ${cleared} 条句段的说话人标签` });
        }
      }

      setSpeakerDialogState(null);
    } catch (error) {
      if (undoPushed) await data.undo();
      reportActionError({
        actionLabel: '说话人操作',
        error,
        i18nKey: 'transcription.error.action.speakerDialogOperationFailed',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
    } finally {
      setSpeakerSaving(false);
    }
  }, [activeSpeakerFilterKey, applySpeakerLocally, data, getUtteranceIdsForSpeakerKey, refreshSpeakerReferenceStats, setSaveState, setSpeakers, setUtterances, speakerById, speakerDialogState, speakerSaving]);

  return {
    speakerOptions,
    speakerDraftName,
    setSpeakerDraftName,
    batchSpeakerId,
    setBatchSpeakerId,
    speakerSaving,
    activeSpeakerFilterKey,
    setActiveSpeakerFilterKey,
    speakerDialogState,
    speakerVisualByUtteranceId,
    speakerFilterOptions,
    speakerReferenceStats,
    speakerReferenceStatsReady,
    selectedSpeakerSummary,
    refreshSpeakers,
    refreshSpeakerReferenceStats,
    handleSelectSpeakerUtterances,
    handleClearSpeakerAssignments,
    handleExportSpeakerSegments,
    handleRenameSpeaker,
    handleMergeSpeaker,
    handleDeleteSpeaker,
    handleDeleteUnusedSpeakers,
    handleAssignSpeakerToUtterances,
    handleCreateSpeakerAndAssignToUtterances,
    handleAssignSpeakerToSelected,
    handleCreateSpeakerAndAssign,
    handleCreateSpeakerOnly,
    closeSpeakerDialog,
    updateSpeakerDialogDraftName,
    updateSpeakerDialogTargetKey,
    confirmSpeakerDialog,
  };
}
