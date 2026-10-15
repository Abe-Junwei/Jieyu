import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { LayerUnitDocType, SpeakerDocType } from '../types/jieyuDbDocTypes';
import type { SaveState } from '../hooks/transcription/transcriptionTypes';
import {
  formatSpeakerAssignmentResult,
  formatSpeakerCreateAndAssignResult,
  getSpeakerUndoLabel,
  type SpeakerFormat,
  type SpeakerTranslate,
} from '../hooks/speakerManagement/speakerI18n';
import { LinguisticService } from '../app/languageAssetPageAccess';
import {
  settleSpeakerWrite,
  speakerWriteCopy,
} from '../hooks/speakerManagement/speakerWriteOutcome';
import { getActiveProjectTextId } from '../utils/transcriptionUrlDeepLink';
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

      await pushSpeakerUndoWithFreshSegmentSnapshot({
        label: getSpeakerUndoLabel('assign', t),
        pushUndo,
        refreshSegmentUndoSnapshot,
      });
      let updated = 0;
      await settleSpeakerWrite({
        write: async () => {
          updated = await LinguisticService.speakers.assignToSegments(targetIds, speakerId);
          assertSpeakerAssignmentUpdatedCounts({
            targetSegmentCount: targetIds.length,
            targetUnitCount: 0,
            updatedSegments: updated,
            updatedUnits: 0,
          });
          const now = new Date().toISOString();
          updateSegmentsLocally(targetIds, (segment) => {
            if (speakerId) return { ...segment, speakerId, updatedAt: now };
            const cleared = { ...segment, updatedAt: now };
            delete cleared.speakerId;
            return cleared;
          });
          setBatchSpeakerId(speakerId ?? '');
        },
        refresh: async () => {
          await reloadSegments();
          await refreshSegmentUndoSnapshot();
          await refreshSpeakerReferenceStats();
        },
        reread: async () => {
          await Promise.all([reloadSegments(), refreshSpeakers(), refreshSpeakerReferenceStats()]);
        },
        setSaveState,
        doneMessage: () => formatSpeakerAssignmentResult('segments', updated, t, tf),
        ...speakerWriteCopy(t),
      });
    },
    [
      pushUndo,
      refreshSegmentUndoSnapshot,
      refreshSpeakerReferenceStats,
      refreshSpeakers,
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

      const existing = findSpeakerOptionByNormalizedName(speakerOptions, trimmedName);
      await pushSpeakerUndoWithFreshSegmentSnapshot({
        label: getSpeakerUndoLabel(existing ? 'reuseAndAssign' : 'createAndAssign', t),
        pushUndo,
        refreshSegmentUndoSnapshot,
      });
      let updated = 0;
      let speakerName = trimmedName;
      await settleSpeakerWrite({
        write: async () => {
          const targetSpeaker =
            existing ??
            (await LinguisticService.speakers.create({
              name: trimmedName,
              textId: getActiveProjectTextId(),
            }));
          updated = await LinguisticService.speakers.assignToSegments(targetIds, targetSpeaker.id);
          assertSpeakerAssignmentUpdatedCounts({
            targetSegmentCount: targetIds.length,
            targetUnitCount: 0,
            updatedSegments: updated,
            updatedUnits: 0,
          });
          speakerName = targetSpeaker.name;
          const now = new Date().toISOString();
          updateSegmentsLocally(targetIds, (segment) => ({
            ...segment,
            speakerId: targetSpeaker.id,
            updatedAt: now,
          }));
          setSpeakerDraftName('');
          setBatchSpeakerId(targetSpeaker.id);
        },
        refresh: async () => {
          await Promise.all([refreshSpeakers(), refreshSpeakerReferenceStats(), reloadSegments()]);
          await refreshSegmentUndoSnapshot();
        },
        reread: async () => {
          await Promise.all([reloadSegments(), refreshSpeakers(), refreshSpeakerReferenceStats()]);
        },
        setSaveState,
        doneMessage: () =>
          formatSpeakerCreateAndAssignResult(
            'segments',
            speakerName,
            updated,
            Boolean(existing),
            t,
            tf,
          ),
        ...speakerWriteCopy(t),
      });
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
      updateSegmentsLocally,
    ],
  );

  return {
    handleAssignSpeakerToSegments,
    createSpeakerAndAssignToSegments,
  };
}
