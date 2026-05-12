import type { Dispatch, SetStateAction } from 'react';
import type { LayerDocType, LayerUnitDocType } from '../types/jieyuDbDocTypes';
import type { TranscriptionTrackDisplayMode } from '../hooks/transcription/useTranscriptionUIState';
import type { TimelineUnitView } from '../hooks/transcription/timelineUnitView';
import type { SpeakerLayerLayoutResult } from '../utils/speakerLayerLayout';

type SegmentSpeakerAssignmentLike = {
  speakerKey: string;
};

type LockConflictToastState = {
  count: number;
  speakers: string[];
  nonce: number;
};

export interface UseTrackDisplayControllerInput {
  unitsOnCurrentMedia: LayerUnitDocType[];
  timelineUnitsOnCurrentMedia?: ReadonlyArray<TimelineUnitView>;
  timelineRenderUnits: LayerUnitDocType[];
  activeLayerIdForEdits: string;
  defaultTranscriptionLayerId?: string;
  layers: LayerDocType[];
  segmentsByLayer: ReadonlyMap<string, LayerUnitDocType[]>;
  segmentSpeakerAssignmentsOnCurrentMedia: SegmentSpeakerAssignmentLike[];
  transcriptionTrackMode: TranscriptionTrackDisplayMode;
  setTranscriptionTrackMode: Dispatch<SetStateAction<TranscriptionTrackDisplayMode>>;
  laneLockMap: Record<string, number>;
  setLaneLockMap: Dispatch<SetStateAction<Record<string, number>>>;
  selectedSpeakerIdsForTrackLock: string[];
  speakerNameById: Record<string, string>;
  setLockConflictToast: Dispatch<SetStateAction<LockConflictToastState | null>>;
  getUnitSpeakerKey: (unit: LayerUnitDocType) => string;
}

export interface UseTrackDisplayControllerResult {
  speakerSortKeyById: Record<string, number>;
  effectiveLaneLockMap: Record<string, number>;
  speakerLayerLayout: SpeakerLayerLayoutResult;
  setTrackDisplayMode: (mode: TranscriptionTrackDisplayMode) => void;
  handleToggleTrackDisplayMode: () => void;
  handleLockSelectedSpeakersToLane: (laneIndex: number) => void;
  handleUnlockSelectedSpeakers: () => void;
  handleResetTrackAutoLayout: () => void;
}
