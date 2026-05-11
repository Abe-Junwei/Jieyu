import type { Locale } from '../i18n';

import { useUnitOps } from '../hooks/transcription/useUnitOps';
import { useReadyWorkspaceSegmentMutationCreationCluster } from './useReadyWorkspaceSegmentMutationCreationCluster';

type MutationCreationReturn = ReturnType<typeof useReadyWorkspaceSegmentMutationCreationCluster>;

export interface UseReadyWorkspaceUnitOpsAndOverlayClusterParams {
  units: Parameters<typeof useUnitOps>[0]['units'];
  translationTextByLayer: Parameters<typeof useUnitOps>[0]['translationTextByLayer'];
  mergeSelectedUnits: Parameters<typeof useUnitOps>[0]['mergeSelectedUnits'];
  selectAllBefore: Parameters<typeof useUnitOps>[0]['selectAllBefore'];
  selectAllAfter: Parameters<typeof useUnitOps>[0]['selectAllAfter'];
  locale: Locale;
  setSaveState: (next: import('../hooks/transcription/transcriptionTypes').SaveState) => void;
  mutationCreation: Pick<
    MutationCreationReturn,
    | 'deleteUnitRouted'
    | 'deleteSelectedUnitsRouted'
    | 'mergeWithPreviousRouted'
    | 'mergeWithNextRouted'
    | 'mergeSelectedSegmentsRouted'
    | 'splitRoutedVoidResult'
  >;
}
