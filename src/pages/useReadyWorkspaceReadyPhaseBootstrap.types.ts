import type { MutableRefObject } from 'react';

import type { DbState } from '../hooks/transcription/transcriptionTypes';
import type { Locale } from '../i18n';

import { useTranscriptionSegmentMutationController } from './useTranscriptionSegmentMutationController';
import { useTranscriptionSegmentCreationController } from './useTranscriptionSegmentCreationController';
import { useUnitOps } from '../hooks/transcription/useUnitOps';

type SegmentMutationControllerInput = Parameters<
  typeof useTranscriptionSegmentMutationController
>[0];
type SegmentCreationControllerInput = Parameters<
  typeof useTranscriptionSegmentCreationController
>[0];
type SegmentRangeClampInput = Parameters<
  typeof import('./useReadyWorkspaceSegmentRangeClamp').useReadyWorkspaceSegmentRangeClamp
>[0];
type InteractionHelpersInput = Parameters<
  typeof import('./useReadyWorkspaceInteractionHelpers').useReadyWorkspaceInteractionHelpers
>[0];

export type UseReadyWorkspaceReadyPhaseBootstrapParams = Pick<
  SegmentMutationControllerInput,
  | 'activeLayerIdForEdits'
  | 'resolveSegmentRoutingForLayer'
  | 'pushUndo'
  | 'reloadSegments'
  | 'refreshSegmentUndoSnapshot'
  | 'selectTimelineUnit'
  | 'setSaveState'
  | 'splitUnit'
  | 'mergeSelectedUnits'
  | 'mergeWithPrevious'
  | 'mergeWithNext'
  | 'deleteUnit'
  | 'deleteSelectedUnits'
> &
  Pick<
    SegmentCreationControllerInput,
    | 'ensureTimelineMediaRowResolved'
    | 'createAdjacentUnit'
    | 'createUnitFromSelection'
    | 'reloadSegmentContents'
  > &
  Pick<InteractionHelpersInput, 'unitsOnCurrentMedia'> & {
    statePhase: DbState['phase'];
    timelineTotalCount: number;
    timelineCurrentMediaUnits: SegmentMutationControllerInput['unitsOnCurrentMedia'];
    setState: Parameters<
      typeof import('./useReadyWorkspaceUnifiedUnitCountSync').useReadyWorkspaceUnifiedUnitCountSync
    >[0]['setState'];
    segmentScopeMediaItem: SegmentRangeClampInput['segmentScopeMediaItem'];
    selectedTimelineMedia: SegmentRangeClampInput['selectedTimelineMedia'];
    documentSpanSecFromBridgeRef: MutableRefObject<number>;
    selectedTimelineMediaForCreation: SegmentCreationControllerInput['selectedTimelineMedia'];
    selectAllBefore: Parameters<typeof useUnitOps>[0]['selectAllBefore'];
    selectAllAfter: Parameters<typeof useUnitOps>[0]['selectAllAfter'];
    units: Parameters<typeof useUnitOps>[0]['units'];
    translationTextByLayer: Parameters<typeof useUnitOps>[0]['translationTextByLayer'];
    locale: Locale;
  };
