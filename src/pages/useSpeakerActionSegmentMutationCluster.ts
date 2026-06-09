import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { LayerUnitDocType, SpeakerDocType } from '../types/jieyuDbDocTypes';
import type { SaveState } from '../hooks/transcription/transcriptionTypes';
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
  findSpeakerOptionByNormalizedName,
  pushSpeakerUndoWithFreshSegmentSnapshot,
} from './speakerActionRoutingHandlers.helpers';

type SegmentUpdater = (segment: LayerUnitDocType) => LayerUnitDocType;

export interface UseSpeakerActionSegmentMutationClusterInput {
  speakerSavingRouted: boolean;
  speakerOptions: SpeakerDocType[];
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
  t: SpeakerTranslate;
  tf: SpeakerFormat;
}

export function useSpeakerActionSegmentMutationCluster({
  speakerSavingRouted,
  speakerOptions,
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
  t,
  tf,
}: UseSpeakerActionSegmentMutationClusterInput) {
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
        assertSpeakerAssignmentUpdatedCounts({
          targetSegmentCount: targetIds.length,
          targetUnitCount: 0,
          updatedSegments: updated,
          updatedUnits: 0,
        });
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
        const existing = findSpeakerOptionByNormalizedName(speakerOptions, trimmedName);
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
        assertSpeakerAssignmentUpdatedCounts({
          targetSegmentCount: targetIds.length,
          targetUnitCount: 0,
          updatedSegments: updated,
          updatedUnits: 0,
        });
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
      pushUndo,
      refreshSegmentUndoSnapshot,
      refreshSpeakerReferenceStats,
      refreshSpeakers,
      reloadSegments,
      setBatchSpeakerId,
      setSaveState,
      setSpeakerDraftName,
      speakerOptions,
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
  };
}
