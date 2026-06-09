import { useCallback, useMemo } from 'react';
import type { LayerUnitDocType, SpeakerDocType } from '../types/jieyuDbDocTypes';
import { fireAndForget } from '../utils/fireAndForget';

export interface UseSpeakerActionSelectionRoutingHandlersInput {
  selectedBatchSegmentsForSpeakerActions: LayerUnitDocType[];
  selectedStandaloneUnitIdsForSpeakerActions: string[];
  speakerOptions: SpeakerDocType[];
  speakerDraftName: string;
  batchSpeakerId: string;
  selectedSpeakerActionCount: number;
  handleAssignSpeakerToUnits: (unitIds: Iterable<string>, speakerId?: string) => Promise<void>;
  handleAssignSpeakerToSelected: () => Promise<void>;
  handleCreateSpeakerAndAssign: () => Promise<void>;
  openSpeakerManagementPanel: (draftName?: string) => void;
  handleAssignSpeakerToSegments: (
    segmentIds: Iterable<string>,
    speakerId?: string,
  ) => Promise<void>;
  createSpeakerAndAssignToSegments: (name: string, segmentIds: Iterable<string>) => Promise<void>;
  applySpeakerToMixedSelection: (speakerId?: string) => Promise<void>;
  createSpeakerAndAssignToMixedSelection: (name: string) => Promise<void>;
}

export function useSpeakerActionSelectionRoutingHandlers({
  selectedBatchSegmentsForSpeakerActions,
  selectedStandaloneUnitIdsForSpeakerActions,
  speakerOptions,
  speakerDraftName,
  batchSpeakerId,
  selectedSpeakerActionCount,
  handleAssignSpeakerToUnits,
  handleAssignSpeakerToSelected,
  handleCreateSpeakerAndAssign,
  openSpeakerManagementPanel,
  handleAssignSpeakerToSegments,
  createSpeakerAndAssignToSegments,
  applySpeakerToMixedSelection,
  createSpeakerAndAssignToMixedSelection,
}: UseSpeakerActionSelectionRoutingHandlersInput) {
  const handleAssignSpeakerToSelectedRouted = useCallback(async () => {
    if (
      selectedBatchSegmentsForSpeakerActions.length > 0 &&
      selectedStandaloneUnitIdsForSpeakerActions.length > 0
    ) {
      await applySpeakerToMixedSelection(batchSpeakerId || undefined);
      return;
    }
    if (selectedBatchSegmentsForSpeakerActions.length > 0) {
      await handleAssignSpeakerToSegments(
        selectedBatchSegmentsForSpeakerActions.map((segment) => segment.id),
        batchSpeakerId || undefined,
      );
      return;
    }
    await handleAssignSpeakerToSelected();
  }, [
    applySpeakerToMixedSelection,
    batchSpeakerId,
    handleAssignSpeakerToSelected,
    handleAssignSpeakerToSegments,
    selectedBatchSegmentsForSpeakerActions,
    selectedStandaloneUnitIdsForSpeakerActions,
  ]);

  const handleClearSpeakerOnSelectedRouted = useCallback(async () => {
    if (
      selectedBatchSegmentsForSpeakerActions.length > 0 &&
      selectedStandaloneUnitIdsForSpeakerActions.length > 0
    ) {
      await applySpeakerToMixedSelection(undefined);
      return;
    }
    if (selectedBatchSegmentsForSpeakerActions.length > 0) {
      await handleAssignSpeakerToSegments(
        selectedBatchSegmentsForSpeakerActions.map((segment) => segment.id),
        undefined,
      );
      return;
    }
    await handleAssignSpeakerToUnits(selectedStandaloneUnitIdsForSpeakerActions, undefined);
  }, [
    applySpeakerToMixedSelection,
    handleAssignSpeakerToSegments,
    handleAssignSpeakerToUnits,
    selectedBatchSegmentsForSpeakerActions,
    selectedStandaloneUnitIdsForSpeakerActions,
  ]);

  const handleCreateSpeakerAndAssignRouted = useCallback(async () => {
    if (
      selectedBatchSegmentsForSpeakerActions.length > 0 &&
      selectedStandaloneUnitIdsForSpeakerActions.length > 0
    ) {
      await createSpeakerAndAssignToMixedSelection(speakerDraftName);
      return;
    }
    if (selectedBatchSegmentsForSpeakerActions.length === 0) {
      await handleCreateSpeakerAndAssign();
      return;
    }
    await createSpeakerAndAssignToSegments(
      speakerDraftName,
      selectedBatchSegmentsForSpeakerActions.map((segment) => segment.id),
    );
  }, [
    createSpeakerAndAssignToMixedSelection,
    createSpeakerAndAssignToSegments,
    handleCreateSpeakerAndAssign,
    selectedBatchSegmentsForSpeakerActions,
    selectedStandaloneUnitIdsForSpeakerActions,
    speakerDraftName,
  ]);

  const assignSpeakerFromCurrentSelection = useCallback(
    (speakerId?: string) => {
      if (
        selectedBatchSegmentsForSpeakerActions.length > 0 &&
        selectedStandaloneUnitIdsForSpeakerActions.length > 0
      ) {
        fireAndForget(applySpeakerToMixedSelection(speakerId), {
          context: 'src/pages/useSpeakerActionSelectionRoutingHandlers.ts:L121',
          policy: 'user-visible',
        });
        return true;
      }
      if (selectedBatchSegmentsForSpeakerActions.length > 0) {
        fireAndForget(
          handleAssignSpeakerToSegments(
            selectedBatchSegmentsForSpeakerActions.map((segment) => segment.id),
            speakerId,
          ),
          {
            context: 'src/pages/useSpeakerActionSelectionRoutingHandlers.ts:L134',
            policy: 'user-visible',
          },
        );
        return true;
      }
      if (selectedStandaloneUnitIdsForSpeakerActions.length > 0) {
        fireAndForget(
          handleAssignSpeakerToUnits(selectedStandaloneUnitIdsForSpeakerActions, speakerId),
          {
            context: 'src/pages/useSpeakerActionSelectionRoutingHandlers.ts:L144',
            policy: 'user-visible',
          },
        );
        return true;
      }
      return false;
    },
    [
      applySpeakerToMixedSelection,
      handleAssignSpeakerToSegments,
      handleAssignSpeakerToUnits,
      selectedBatchSegmentsForSpeakerActions,
      selectedStandaloneUnitIdsForSpeakerActions,
    ],
  );

  const speakerQuickActions = useMemo(
    () => ({
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
    }),
    [
      assignSpeakerFromCurrentSelection,
      openSpeakerManagementPanel,
      selectedSpeakerActionCount,
      speakerOptions,
    ],
  );

  return {
    handleAssignSpeakerToSelectedRouted,
    handleClearSpeakerOnSelectedRouted,
    handleCreateSpeakerAndAssignRouted,
    speakerQuickActions,
  };
}
