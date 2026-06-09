import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { LayerUnitDocType, SpeakerDocType } from '../types/jieyuDbDocTypes';
import type { SaveState } from '../hooks/transcription/transcriptionTypes';
import {
  applySpeakerAssignmentToUnits,
  upsertSpeaker,
} from '../hooks/speakerManagement/speakerUtils';
import {
  buildSpeakerActionErrorOptions,
  formatSpeakerAssignmentResult,
  formatSpeakerCreateAndAssignResult,
  getSpeakerUndoLabel,
  type SpeakerFormat,
  type SpeakerTranslate,
} from '../hooks/speakerManagement/speakerI18n';
import { LinguisticService } from '../app/languageAssetPageAccess';
import { reportActionError } from '../utils/actionErrorReporter';
import {
  assertSpeakerAssignmentUpdatedCounts,
  pushSpeakerUndoWithFreshSegmentSnapshot,
} from './speakerActionRoutingHandlers.helpers';

type SegmentUpdater = (segment: LayerUnitDocType) => LayerUnitDocType;

export interface UseSpeakerActionSegmentMutationClusterInput {
  speakerSavingRouted: boolean;
  selectedBatchSegmentsForSpeakerActions: LayerUnitDocType[];
  selectedStandaloneUnitIdsForSpeakerActions: string[];
  speakerOptions: SpeakerDocType[];
  speakerByIdMap: ReadonlyMap<string, SpeakerDocType>;
  recordMixedSpeakerSelectionApply: (action: 'assign' | 'clear' | 'create') => void;
  pushUndo: (label: string) => void;
  undo: () => Promise<void>;
  reloadSegments: () => Promise<void>;
  refreshSegmentUndoSnapshot: () => Promise<void>;
  refreshSpeakerReferenceStats: () => Promise<void>;
  refreshSpeakers: () => Promise<void>;
  updateSegmentsLocally: (segmentIds: Iterable<string>, updater: SegmentUpdater) => void;
  setBatchSpeakerId: Dispatch<SetStateAction<string>>;
  setSpeakerDraftName: Dispatch<SetStateAction<string>>;
  setSaveState: (state: SaveState) => void;
  setUnits: Dispatch<SetStateAction<LayerUnitDocType[]>>;
  setSpeakers: Dispatch<SetStateAction<SpeakerDocType[]>>;
  t: SpeakerTranslate;
  tf: SpeakerFormat;
}

export function useSpeakerActionSegmentMutationCluster({
  speakerSavingRouted,
  selectedBatchSegmentsForSpeakerActions,
  selectedStandaloneUnitIdsForSpeakerActions,
  speakerOptions,
  speakerByIdMap,
  recordMixedSpeakerSelectionApply,
  pushUndo,
  undo,
  reloadSegments,
  refreshSegmentUndoSnapshot,
  refreshSpeakerReferenceStats,
  refreshSpeakers,
  updateSegmentsLocally,
  setBatchSpeakerId,
  setSpeakerDraftName,
  setSaveState,
  setUnits,
  setSpeakers,
  t,
  tf,
}: UseSpeakerActionSegmentMutationClusterInput) {
  const findExistingSpeakerEntityByName = useCallback(
    (rawName: string) => {
      const normalizedName = rawName.trim().toLocaleLowerCase('zh-Hans-CN');
      if (!normalizedName) return undefined;
      return speakerOptions.find(
        (speaker) => speaker.name.trim().toLocaleLowerCase('zh-Hans-CN') === normalizedName,
      );
    },
    [speakerOptions],
  );

  const handleAssignSpeakerToSegments = useCallback(
    async (segmentIds: Iterable<string>, speakerId?: string) => {
      const targetIds = Array.from(
        new Set(
          Array.from(segmentIds)
            .map((id) => id.trim())
            .filter((id) => id.length > 0),
        ),
      );
      if (targetIds.length === 0 || speakerSavingRouted) return;

      try {
        await pushSpeakerUndoWithFreshSegmentSnapshot({
          label: getSpeakerUndoLabel('assign', t),
          pushUndo,
          refreshSegmentUndoSnapshot,
        });
        const updated = await LinguisticService.speakers.assignToSegments(targetIds, speakerId);
        if (targetIds.length > 0 && updated === 0) {
          throw new Error('未找到可更新的句段');
        }
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
          setErrorState: ({ message, meta }) =>
            setSaveState({ kind: 'error', message, ...(meta ? { errorMeta: meta } : {}) }),
        });
      }
    },
    [
      pushUndo,
      refreshSegmentUndoSnapshot,
      refreshSpeakerReferenceStats,
      reloadSegments,
      setBatchSpeakerId,
      setSaveState,
      speakerSavingRouted,
      t,
      tf,
      updateSegmentsLocally,
    ],
  );

  const createSpeakerAndAssignToSegments = useCallback(
    async (name: string, segmentIds: Iterable<string>) => {
      const trimmedName = name.trim();
      const targetIds = Array.from(
        new Set(
          Array.from(segmentIds)
            .map((id) => id.trim())
            .filter((id) => id.length > 0),
        ),
      );
      if (!trimmedName || targetIds.length === 0 || speakerSavingRouted) return;

      let undoPushed = false;
      try {
        const existing = findExistingSpeakerEntityByName(trimmedName);
        await pushSpeakerUndoWithFreshSegmentSnapshot({
          label: getSpeakerUndoLabel(existing ? 'reuseAndAssign' : 'createAndAssign', t),
          pushUndo,
          refreshSegmentUndoSnapshot,
        });
        undoPushed = true;
        const targetSpeaker =
          existing ?? (await LinguisticService.speakers.create({ name: trimmedName }));
        const updated = await LinguisticService.speakers.assignToSegments(
          targetIds,
          targetSpeaker.id,
        );
        if (targetIds.length > 0 && updated === 0) {
          throw new Error('未找到可更新的句段');
        }
        const now = new Date().toISOString();
        updateSegmentsLocally(targetIds, (segment) => ({
          ...segment,
          speakerId: targetSpeaker.id,
          updatedAt: now,
        }));
        setSpeakerDraftName('');
        setBatchSpeakerId(targetSpeaker.id);
        await Promise.all([refreshSpeakers(), refreshSpeakerReferenceStats(), reloadSegments()]);
        await refreshSegmentUndoSnapshot();
        setSaveState({
          kind: 'done',
          message: formatSpeakerCreateAndAssignResult(
            'segments',
            targetSpeaker.name,
            updated,
            Boolean(existing),
            t,
            tf,
          ),
        });
      } catch (error) {
        if (undoPushed) await undo();
        reportActionError({
          error,
          ...buildSpeakerActionErrorOptions('create', error, t, tf),
          conflictI18nKey: 'transcription.error.conflict.createSpeaker',
          fallbackI18nKey: 'transcription.error.action.createSpeakerFailed',
          setErrorState: ({ message, meta }) =>
            setSaveState({ kind: 'error', message, ...(meta ? { errorMeta: meta } : {}) }),
        });
      }
    },
    [
      findExistingSpeakerEntityByName,
      pushUndo,
      refreshSegmentUndoSnapshot,
      refreshSpeakerReferenceStats,
      refreshSpeakers,
      reloadSegments,
      setBatchSpeakerId,
      setSaveState,
      setSpeakerDraftName,
      speakerSavingRouted,
      t,
      tf,
      undo,
      updateSegmentsLocally,
    ],
  );

  const applySpeakerToMixedSelection = useCallback(
    async (speakerId?: string) => {
      const targetSegmentIds = selectedBatchSegmentsForSpeakerActions.map((segment) => segment.id);
      const targetUnitIds = selectedStandaloneUnitIdsForSpeakerActions;
      if ((targetSegmentIds.length === 0 && targetUnitIds.length === 0) || speakerSavingRouted)
        return;

      const normalizedSpeakerId = speakerId?.trim();
      recordMixedSpeakerSelectionApply(normalizedSpeakerId ? 'assign' : 'clear');
      const speaker = normalizedSpeakerId ? speakerByIdMap.get(normalizedSpeakerId) : undefined;
      let undoPushed = false;
      try {
        await pushSpeakerUndoWithFreshSegmentSnapshot({
          label: getSpeakerUndoLabel('assign', t),
          pushUndo,
          refreshSegmentUndoSnapshot,
        });
        undoPushed = true;
        const [updatedSegments, updatedUnits] = await Promise.all([
          targetSegmentIds.length > 0
            ? LinguisticService.speakers.assignToSegments(targetSegmentIds, normalizedSpeakerId)
            : Promise.resolve(0),
          targetUnitIds.length > 0
            ? LinguisticService.speakers.assignToUnits(targetUnitIds, normalizedSpeakerId)
            : Promise.resolve(0),
        ]);
        assertSpeakerAssignmentUpdatedCounts({
          targetSegmentCount: targetSegmentIds.length,
          targetUnitCount: targetUnitIds.length,
          updatedSegments,
          updatedUnits,
        });
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
          setErrorState: ({ message, meta }) =>
            setSaveState({ kind: 'error', message, ...(meta ? { errorMeta: meta } : {}) }),
        });
      }
    },
    [
      pushUndo,
      recordMixedSpeakerSelectionApply,
      refreshSegmentUndoSnapshot,
      refreshSpeakerReferenceStats,
      reloadSegments,
      selectedBatchSegmentsForSpeakerActions,
      selectedStandaloneUnitIdsForSpeakerActions,
      setBatchSpeakerId,
      setSaveState,
      setUnits,
      speakerByIdMap,
      speakerSavingRouted,
      t,
      tf,
      undo,
      updateSegmentsLocally,
    ],
  );

  const createSpeakerAndAssignToMixedSelection = useCallback(
    async (name: string) => {
      const trimmedName = name.trim();
      const targetSegmentIds = selectedBatchSegmentsForSpeakerActions.map((segment) => segment.id);
      const targetUnitIds = selectedStandaloneUnitIdsForSpeakerActions;
      if (
        !trimmedName ||
        (targetSegmentIds.length === 0 && targetUnitIds.length === 0) ||
        speakerSavingRouted
      )
        return;

      let undoPushed = false;
      try {
        recordMixedSpeakerSelectionApply('create');
        const existing = findExistingSpeakerEntityByName(trimmedName);
        await pushSpeakerUndoWithFreshSegmentSnapshot({
          label: getSpeakerUndoLabel(existing ? 'reuseAndAssign' : 'createAndAssign', t),
          pushUndo,
          refreshSegmentUndoSnapshot,
        });
        undoPushed = true;
        const targetSpeaker =
          existing ?? (await LinguisticService.speakers.create({ name: trimmedName }));
        const [updatedSegments, updatedUnits] = await Promise.all([
          targetSegmentIds.length > 0
            ? LinguisticService.speakers.assignToSegments(targetSegmentIds, targetSpeaker.id)
            : Promise.resolve(0),
          targetUnitIds.length > 0
            ? LinguisticService.speakers.assignToUnits(targetUnitIds, targetSpeaker.id)
            : Promise.resolve(0),
        ]);
        assertSpeakerAssignmentUpdatedCounts({
          targetSegmentCount: targetSegmentIds.length,
          targetUnitCount: targetUnitIds.length,
          updatedSegments,
          updatedUnits,
        });
        const now = new Date().toISOString();
        if (targetSegmentIds.length > 0) {
          updateSegmentsLocally(targetSegmentIds, (segment) => ({
            ...segment,
            speakerId: targetSpeaker.id,
            updatedAt: now,
          }));
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
          message: formatSpeakerCreateAndAssignResult(
            'selection',
            targetSpeaker.name,
            updatedSegments + updatedUnits,
            Boolean(existing),
            t,
            tf,
          ),
        });
      } catch (error) {
        if (undoPushed) await undo();
        reportActionError({
          error,
          ...buildSpeakerActionErrorOptions('create', error, t, tf),
          conflictI18nKey: 'transcription.error.conflict.createSpeaker',
          fallbackI18nKey: 'transcription.error.action.createSpeakerFailed',
          setErrorState: ({ message, meta }) =>
            setSaveState({ kind: 'error', message, ...(meta ? { errorMeta: meta } : {}) }),
        });
      }
    },
    [
      findExistingSpeakerEntityByName,
      pushUndo,
      recordMixedSpeakerSelectionApply,
      refreshSegmentUndoSnapshot,
      refreshSpeakerReferenceStats,
      refreshSpeakers,
      reloadSegments,
      selectedBatchSegmentsForSpeakerActions,
      selectedStandaloneUnitIdsForSpeakerActions,
      setBatchSpeakerId,
      setSaveState,
      setSpeakerDraftName,
      setSpeakers,
      setUnits,
      speakerSavingRouted,
      t,
      tf,
      undo,
      updateSegmentsLocally,
    ],
  );

  return {
    handleAssignSpeakerToSegments,
    createSpeakerAndAssignToSegments,
    applySpeakerToMixedSelection,
    createSpeakerAndAssignToMixedSelection,
  };
}
