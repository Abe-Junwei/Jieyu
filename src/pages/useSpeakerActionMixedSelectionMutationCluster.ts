import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { LayerUnitDocType, SpeakerDocType } from '../types/jieyuDbDocTypes';
import type { SaveState } from '../hooks/transcription/transcriptionTypes';
import {
  applySpeakerAssignmentToUnits,
  upsertSpeaker,
} from '../hooks/speakerManagement/speakerUtils';
import {
  formatSpeakerAssignmentResult,
  formatSpeakerCreateAndAssignResult,
  getSpeakerUndoLabel,
  type SpeakerFormat,
  type SpeakerTranslate,
} from '../hooks/speakerManagement/speakerI18n';
import {
  settleSpeakerWrite,
  speakerWriteCopy,
} from '../hooks/speakerManagement/speakerWriteOutcome';
import { LinguisticService } from '../app/languageAssetPageAccess';
import { getActiveProjectTextId } from '../utils/transcriptionUrlDeepLink';
import {
  assertSpeakerAssignmentUpdatedCounts,
  findSpeakerOptionByNormalizedName,
  pushSpeakerUndoWithFreshSegmentSnapshot,
} from './speakerActionRoutingHandlers.helpers';

type SegmentUpdater = (segment: LayerUnitDocType) => LayerUnitDocType;

export interface UseSpeakerActionMixedSelectionMutationClusterInput {
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

export function useSpeakerActionMixedSelectionMutationCluster({
  speakerSavingRouted,
  selectedBatchSegmentsForSpeakerActions,
  selectedStandaloneUnitIdsForSpeakerActions,
  speakerOptions,
  speakerByIdMap,
  recordMixedSpeakerSelectionApply,
  pushUndo,
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
}: UseSpeakerActionMixedSelectionMutationClusterInput) {
  const applySpeakerToMixedSelection = useCallback(
    async (speakerId?: string) => {
      const targetSegmentIds = selectedBatchSegmentsForSpeakerActions.map((segment) => segment.id);
      const targetUnitIds = selectedStandaloneUnitIdsForSpeakerActions;
      if ((targetSegmentIds.length === 0 && targetUnitIds.length === 0) || speakerSavingRouted)
        return;

      const normalizedSpeakerId = speakerId?.trim();
      recordMixedSpeakerSelectionApply(normalizedSpeakerId ? 'assign' : 'clear');
      const speaker = normalizedSpeakerId ? speakerByIdMap.get(normalizedSpeakerId) : undefined;
      await pushSpeakerUndoWithFreshSegmentSnapshot({
        label: getSpeakerUndoLabel('assign', t),
        pushUndo,
        refreshSegmentUndoSnapshot,
      });
      let updatedSegments = 0;
      let updatedUnits = 0;
      await settleSpeakerWrite({
        write: async () => {
          [updatedSegments, updatedUnits] = await Promise.all([
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
        doneMessage: () =>
          formatSpeakerAssignmentResult('selection', updatedSegments + updatedUnits, t, tf),
        ...speakerWriteCopy(t),
      });
    },
    [
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
      setUnits,
      speakerByIdMap,
      speakerSavingRouted,
      t,
      tf,
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

      recordMixedSpeakerSelectionApply('create');
      const existing = findSpeakerOptionByNormalizedName(speakerOptions, trimmedName);
      await pushSpeakerUndoWithFreshSegmentSnapshot({
        label: getSpeakerUndoLabel(existing ? 'reuseAndAssign' : 'createAndAssign', t),
        pushUndo,
        refreshSegmentUndoSnapshot,
      });
      let updatedSegments = 0;
      let updatedUnits = 0;
      let speakerName = trimmedName;
      await settleSpeakerWrite({
        write: async () => {
          const targetSpeaker =
            existing ??
            (await LinguisticService.speakers.create({
              name: trimmedName,
              textId: getActiveProjectTextId(),
            }));
          [updatedSegments, updatedUnits] = await Promise.all([
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
          speakerName = targetSpeaker.name;
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
          if (!existing) setSpeakers((prev) => upsertSpeaker(prev, targetSpeaker));
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
            'selection',
            speakerName,
            updatedSegments + updatedUnits,
            Boolean(existing),
            t,
            tf,
          ),
        ...speakerWriteCopy(t),
      });
    },
    [
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
      speakerOptions,
      speakerSavingRouted,
      t,
      tf,
      updateSegmentsLocally,
    ],
  );

  return {
    applySpeakerToMixedSelection,
    createSpeakerAndAssignToMixedSelection,
  };
}
