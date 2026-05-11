import { t } from '../i18n';
import { reportValidationError } from '../utils/validationErrorReporter';

import { useUnitOps } from '../hooks/transcription/useUnitOps';
import { useTranscriptionOverlayActionRoutingController } from './useTranscriptionOverlayActionRoutingController';

import type { UseReadyWorkspaceUnitOpsAndOverlayClusterParams } from './useReadyWorkspaceUnitOpsAndOverlayCluster.types';

export type { UseReadyWorkspaceUnitOpsAndOverlayClusterParams };

export function useReadyWorkspaceUnitOpsAndOverlayCluster(
  params: UseReadyWorkspaceUnitOpsAndOverlayClusterParams,
) {
  const {
    units,
    translationTextByLayer,
    mergeSelectedUnits,
    selectAllBefore,
    selectAllAfter,
    locale,
    setSaveState,
    mutationCreation: {
      deleteUnitRouted,
      deleteSelectedUnitsRouted,
      mergeWithPreviousRouted,
      mergeWithNextRouted,
      mergeSelectedSegmentsRouted,
      splitRoutedVoidResult,
    },
  } = params;

  const {
    runDeleteSelection,
    runDeleteOne,
    runMergeSelection,
    runMergePrev,
    runMergeNext,
    runSplitAtTime,
    runSelectBefore,
    runSelectAfter,
    deleteConfirmState,
    muteDeleteConfirmInSession,
    setMuteDeleteConfirmInSession,
    closeDeleteConfirmDialog,
    confirmDeleteFromDialog,
  } = useUnitOps({
    units,
    translationTextByLayer,
    deleteUnit: deleteUnitRouted,
    deleteSelectedUnits: deleteSelectedUnitsRouted,
    mergeSelectedUnits,
    mergeWithPrevious: mergeWithPreviousRouted,
    mergeWithNext: mergeWithNextRouted,
    onMergeTargetMissing: () => {
      reportValidationError({
        message: t(locale, 'transcription.error.validation.mergeTargetSelectionRequired'),
        i18nKey: 'transcription.error.validation.mergeTargetSelectionRequired',
        setErrorState: ({ message, meta }) =>
          setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
    },
    splitUnit: splitRoutedVoidResult,
    selectAllBefore,
    selectAllAfter,
  });

  const {
    runOverlayDeleteSelection,
    runOverlayMergeSelection,
    runOverlayDeleteOne,
    runOverlayMergePrev,
    runOverlayMergeNext,
    runOverlaySplitAtTime,
  } = useTranscriptionOverlayActionRoutingController({
    deleteSelectedUnitsRouted,
    deleteUnitRouted,
    mergeSelectedSegmentsRouted,
    mergeWithPreviousRouted,
    mergeWithNextRouted,
    splitRouted: splitRoutedVoidResult,
    runDeleteSelection,
    runMergeSelection,
    runDeleteOne,
    runMergePrev,
    runMergeNext,
    runSplitAtTime,
  });

  return {
    runDeleteSelection,
    runDeleteOne,
    runMergeSelection,
    runMergePrev,
    runMergeNext,
    runSplitAtTime,
    runSelectBefore,
    runSelectAfter,
    deleteConfirmState,
    muteDeleteConfirmInSession,
    setMuteDeleteConfirmInSession,
    closeDeleteConfirmDialog,
    confirmDeleteFromDialog,
    runOverlayDeleteSelection,
    runOverlayMergeSelection,
    runOverlayDeleteOne,
    runOverlayMergePrev,
    runOverlayMergeNext,
    runOverlaySplitAtTime,
  };
}
