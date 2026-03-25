/**
 * useSpeakerActions | 说话人管理 Hook
 *
 * 收口说话人相关状态、派生数据与操作回调，
 * 并将旧的自由文本 speaker 标签逐步规范为 speakerId 驱动。
 *
 * Consolidates speaker-related state, derived data, and action callbacks,
 * while progressively normalizing legacy freetext speaker labels into
 * speakerId-backed entities.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { UtteranceDocType, SpeakerDocType } from '../db';
import type { SaveState } from './transcriptionTypes';
import { LinguisticService } from '../services/LinguisticService';
import { fireAndForget } from '../utils/fireAndForget';
import type { SpeakerActionDialogState, SpeakerFilterOption, SpeakerVisual } from './speakerManagement/types';
import {
  applySpeakerAssignmentToUtterances,
  getUtteranceSpeakerKey,
  normalizeSpeakerName,
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

export interface UseSpeakerActionsOptions {
  utterances: UtteranceDocType[];
  setUtterances: UtteranceStateSetter;
  speakers: SpeakerDocType[];
  setSpeakers: SpeakerStateSetter;
  utterancesOnCurrentMedia: UtteranceDocType[];
  selectedUtteranceId: string | null;
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
  selectedSpeakerSummary: string;
  refreshSpeakers: () => Promise<void>;
  handleSelectSpeakerUtterances: (speakerKey: string) => void;
  handleClearSpeakerAssignments: (speakerKey: string) => void;
  handleExportSpeakerSegments: (speakerKey: string) => void;
  handleRenameSpeaker: (speakerKey: string) => void;
  handleMergeSpeaker: (sourceSpeakerKey: string) => void;
  handleDeleteSpeaker: (sourceSpeakerKey: string) => void;
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
  selectedUtteranceId,
  selectedUtteranceIds,
  selectedBatchUtterances,
  isReady,
  setUtteranceSelection,
  data,
  setSaveState,
  getUtteranceTextForLayer,
  formatTime,
}: UseSpeakerActionsOptions): UseSpeakerActionsReturn {
  const [speakerDraftName, setSpeakerDraftName] = useState('');
  const [batchSpeakerId, setBatchSpeakerId] = useState('');
  const [speakerSaving, setSpeakerSaving] = useState(false);
  const [activeSpeakerFilterKey, setActiveSpeakerFilterKey] = useState('all');
  const [speakerDialogState, setSpeakerDialogState] = useState<SpeakerActionDialogState | null>(null);
  const legacyNormalizationRef = useRef(false);

  const speakerOptions = speakers;
  const speakerById = useMemo(
    () => new Map(speakerOptions.map((speaker) => [speaker.id, speaker] as const)),
    [speakerOptions],
  );

  const {
    speakerVisualByUtteranceId,
    speakerFilterOptions,
    selectedSpeakerSummary,
  } = useSpeakerDerivedState(utterancesOnCurrentMedia, selectedBatchUtterances, speakerOptions);

  const refreshSpeakers = useCallback(async () => {
    const nextSpeakers = await LinguisticService.getSpeakers();
    setSpeakers(nextSpeakers);
  }, [setSpeakers]);

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
  }, [isReady, refreshSpeakers]);

  useEffect(() => {
    if (activeSpeakerFilterKey === 'all') return;
    if (speakerFilterOptions.some((option) => option.key === activeSpeakerFilterKey)) return;
    setActiveSpeakerFilterKey('all');
  }, [activeSpeakerFilterKey, speakerFilterOptions]);

  useEffect(() => {
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
  }, [selectedBatchUtterances]);

  useEffect(() => {
    if (!isReady || legacyNormalizationRef.current) return;
    const legacyGroups = new Map<string, string[]>();
    for (const utterance of utterances) {
      if (utterance.speakerId) continue;
      const speakerName = normalizeSpeakerName(utterance.speaker);
      if (!speakerName) continue;
      const ids = legacyGroups.get(speakerName) ?? [];
      ids.push(utterance.id);
      legacyGroups.set(speakerName, ids);
    }
    if (legacyGroups.size === 0) return;

    fireAndForget((async () => {
      legacyNormalizationRef.current = true;
      try {
        let nextSpeakers = [...speakerOptions];
        const speakerByNormalizedName = new Map(
          nextSpeakers.map((speaker) => [normalizeSpeakerName(speaker.name).toLocaleLowerCase('zh-Hans-CN'), speaker] as const),
        );
        const assignments: Array<{ utteranceIds: string[]; speaker: SpeakerDocType }> = [];
        let normalizedCount = 0;

        for (const [speakerName, utteranceIds] of legacyGroups) {
          const normalizedName = speakerName.toLocaleLowerCase('zh-Hans-CN');
          let speaker = speakerByNormalizedName.get(normalizedName);
          if (!speaker) {
            speaker = await LinguisticService.createSpeaker({ name: speakerName });
            nextSpeakers = upsertSpeaker(nextSpeakers, speaker);
            speakerByNormalizedName.set(normalizedName, speaker);
          }
          await LinguisticService.assignSpeakerToUtterances(utteranceIds, speaker.id);
          assignments.push({ utteranceIds, speaker });
          normalizedCount += utteranceIds.length;
        }

        setSpeakers(sortSpeakersByName(nextSpeakers));
        setUtterances((prev) => assignments.reduce(
          (current, assignment) => applySpeakerAssignmentToUtterances(current, assignment.utteranceIds, assignment.speaker),
          prev,
        ));
        setSaveState({ kind: 'done', message: `已规范化 ${normalizedCount} 条历史说话人标签` });
      } catch (error) {
        reportActionError({
          actionLabel: '规范化历史说话人',
          error,
          i18nKey: 'transcription.error.action.normalizeLegacySpeakerFailed',
          setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
        });
      } finally {
        legacyNormalizationRef.current = false;
      }
    })());
  }, [isReady, setSaveState, setSpeakers, setUtterances, speakerOptions, utterances]);

  const handleSelectSpeakerUtterances = useCallback((speakerKey: string) => {
    const ids = getUtteranceIdsForSpeakerKey(speakerKey);
    if (ids.length === 0) {
      setUtteranceSelection('', []);
      return;
    }
    const primary = ids.includes(selectedUtteranceId ?? '') ? (selectedUtteranceId ?? ids[0]!) : ids[0]!;
    setUtteranceSelection(primary, ids);
    setActiveSpeakerFilterKey(speakerKey);
  }, [getUtteranceIdsForSpeakerKey, selectedUtteranceId, setUtteranceSelection]);

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
    if (speakerKey.startsWith('name:')) {
      reportValidationError({
        message: '该说话人尚未实体化，暂不支持重命名',
        i18nKey: 'transcription.error.validation.renameSpeakerVirtualEntity',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }
    const current = speakerFilterOptions.find((item) => item.key === speakerKey);
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
      speakerKey,
      speakerName: current.name,
      draftName: current.name,
    });
  }, [setSaveState, speakerFilterOptions]);

  const handleMergeSpeaker = useCallback((sourceSpeakerKey: string) => {
    if (sourceSpeakerKey.startsWith('name:')) {
      reportValidationError({
        message: '该说话人尚未实体化，暂不支持合并',
        i18nKey: 'transcription.error.validation.mergeSpeakerVirtualEntity',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }
    const candidates = speakerFilterOptions
      .filter((item) => item.isEntity && item.key !== sourceSpeakerKey)
      .map((item) => ({ key: item.key, name: item.name }));
    if (candidates.length === 0) {
      reportValidationError({
        message: '没有可合并的目标说话人',
        i18nKey: 'transcription.error.validation.mergeSpeakerNoTarget',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }
    const source = speakerFilterOptions.find((item) => item.key === sourceSpeakerKey);
    setSpeakerDialogState({
      mode: 'merge',
      sourceSpeakerKey,
      sourceSpeakerName: source?.name ?? '来源说话人',
      targetSpeakerKey: candidates[0]!.key,
      candidates,
    });
  }, [setSaveState, speakerFilterOptions]);

  const handleDeleteSpeaker = useCallback((sourceSpeakerKey: string) => {
    if (sourceSpeakerKey.startsWith('name:')) {
      reportValidationError({
        message: '该说话人尚未实体化，暂不支持删除',
        i18nKey: 'transcription.error.validation.deleteSpeakerEntityVirtual',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    const source = speakerFilterOptions.find((item) => item.key === sourceSpeakerKey);
    if (!source) {
      reportValidationError({
        message: '未找到说话人',
        i18nKey: 'transcription.error.validation.deleteSpeakerEntityNotFound',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    const candidates = speakerFilterOptions
      .filter((item) => item.isEntity && item.key !== sourceSpeakerKey)
      .map((item) => ({ key: item.key, name: item.name }));

    const utteranceIds = getUtteranceIdsForSpeakerKey(sourceSpeakerKey);
    setSpeakerDialogState({
      mode: 'delete',
      sourceSpeakerKey,
      sourceSpeakerName: source.name,
      replacementSpeakerKey: candidates[0]?.key ?? '',
      candidates,
      affectedCount: utteranceIds.length,
    });
  }, [getUtteranceIdsForSpeakerKey, setSaveState, speakerFilterOptions]);

  const handleAssignSpeakerToSelected = useCallback(async () => {
    if (selectedUtteranceIds.size === 0 || speakerSaving) return;
    setSpeakerSaving(true);
    try {
      data.pushUndo('批量指派说话人');
      const speaker = batchSpeakerId ? speakerById.get(batchSpeakerId) : undefined;
      const updated = await LinguisticService.assignSpeakerToUtterances(
        selectedUtteranceIds,
        batchSpeakerId || undefined,
      );
      applySpeakerLocally(selectedUtteranceIds, speaker);
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
  }, [applySpeakerLocally, batchSpeakerId, data, selectedUtteranceIds, setSaveState, speakerById, speakerSaving]);

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
  }, [applySpeakerLocally, data, setSaveState, speakerById, speakerSaving, setBatchSpeakerId]);

  const handleCreateSpeakerAndAssign = useCallback(async () => {
    const name = speakerDraftName.trim();
    if (!name || selectedUtteranceIds.size === 0 || speakerSaving) return;
    setSpeakerSaving(true);
    let undoPushed = false;
    try {
      data.pushUndo('新建并分配说话人');
      undoPushed = true;
      const created = await LinguisticService.createSpeaker({ name });
      const updated = await LinguisticService.assignSpeakerToUtterances(selectedUtteranceIds, created.id);
      setSpeakers((prev) => upsertSpeaker(prev, created));
      applySpeakerLocally(selectedUtteranceIds, created);
      setSpeakerDraftName('');
      setBatchSpeakerId(created.id);
      setSaveState({ kind: 'done', message: `已创建说话人"${created.name}"，并应用到 ${updated} 条句段` });
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
  }, [applySpeakerLocally, data, selectedUtteranceIds, setSaveState, setSpeakers, speakerDraftName, speakerSaving]);

  const handleCreateSpeakerAndAssignToUtterances = useCallback(async (name: string, utteranceIds: Iterable<string>) => {
    const targetIds = Array.from(new Set(utteranceIds)).filter((id) => id.trim().length > 0);
    const trimmedName = name.trim();
    if (!trimmedName || targetIds.length === 0 || speakerSaving) return;

    setSpeakerSaving(true);
    let undoPushed = false;
    try {
      data.pushUndo('新建并分配说话人');
      undoPushed = true;
      const created = await LinguisticService.createSpeaker({ name: trimmedName });
      const updated = await LinguisticService.assignSpeakerToUtterances(targetIds, created.id);
      setSpeakers((prev) => upsertSpeaker(prev, created));
      applySpeakerLocally(targetIds, created);
      setBatchSpeakerId(created.id);
      setSaveState({ kind: 'done', message: `已创建说话人"${created.name}"，并应用到 ${updated} 条句段` });
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
  }, [applySpeakerLocally, data, setBatchSpeakerId, setSaveState, setSpeakers, speakerSaving]);

  const handleCreateSpeakerOnly = useCallback(async () => {
    const name = speakerDraftName.trim();
    if (!name || speakerSaving) return;
    setSpeakerSaving(true);
    try {
      const created = await LinguisticService.createSpeaker({ name });
      setSpeakers((prev) => upsertSpeaker(prev, created));
      setSpeakerDraftName('');
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
  }, [setSaveState, setSpeakerDraftName, setSpeakers, speakerDraftName, speakerSaving]);

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
  }, [activeSpeakerFilterKey, applySpeakerLocally, data, getUtteranceIdsForSpeakerKey, setSaveState, setSpeakers, setUtterances, speakerById, speakerDialogState, speakerSaving]);

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
    selectedSpeakerSummary,
    refreshSpeakers,
    handleSelectSpeakerUtterances,
    handleClearSpeakerAssignments,
    handleExportSpeakerSegments,
    handleRenameSpeaker,
    handleMergeSpeaker,
    handleDeleteSpeaker,
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
