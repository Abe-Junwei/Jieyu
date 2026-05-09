import { useTranscriptionState } from './useTranscriptionState';
import { useTranscriptionPersistence } from './useTranscriptionPersistence';
import { useTranscriptionRecoverySnapshotScheduler } from './useTranscriptionRecovery';
import { useTranscriptionUndo } from './useTranscriptionUndo';
import { useTranscriptionAnchorActions } from './useTranscriptionAnchorActions';
import { isSegmentTimelineUnit, isUnitTimelineUnit } from './transcriptionTypes';

/**
 * State + persistence + anchors + undo stack for transcription workspace data.
 * Split from useTranscriptionData to keep the public hook composable and under guard limits.
 */
export function useTranscriptionDataFoundation() {
  const transcriptionState = useTranscriptionState();

  const {
    unitsRef,
    translationsRef,
    speakersRef,
    anchorsRef,
    setAnchors,
    setUnits,
    setTranslations,
    setLayers,
    setLayerLinks,
    setSpeakers,
    setSaveState,
    layersRef,
    layerLinksRef,
  } = transcriptionState;

  const { runWithDbMutex, syncToDb } = useTranscriptionPersistence({
    unitsRef,
    translationsRef,
    speakersRef,
  });

  const { dbNameRef, dirtyRef, recoverySave, scheduleRecoverySave } =
    useTranscriptionRecoverySnapshotScheduler({
      unitsRef,
      translationsRef,
      layersRef,
    });

  const { createAnchor, pruneOrphanAnchors, updateAnchorTime } = useTranscriptionAnchorActions({
    anchorsRef,
    unitsRef,
    setAnchors,
  });

  const {
    segmentUndoRef,
    timingUndoRef,
    timingGestureRef,
    pushUndo,
    beginTimingGesture,
    endTimingGesture,
    undo,
    undoToHistoryIndex,
    redo,
    canUndo,
    canRedo,
    undoLabel,
    undoHistory,
  } = useTranscriptionUndo({
    unitsRef,
    translationsRef,
    layersRef,
    layerLinksRef,
    speakersRef,
    dirtyRef,
    scheduleRecoverySave,
    syncToDb,
    setUnits,
    setTranslations,
    setLayers,
    setLayerLinks,
    setSpeakers,
    setSaveState,
  });

  const { selectedTimelineUnit } = transcriptionState;
  const activeUnitId = isUnitTimelineUnit(selectedTimelineUnit) ? selectedTimelineUnit.unitId : '';
  const activeSegmentUnitId = isSegmentTimelineUnit(selectedTimelineUnit)
    ? selectedTimelineUnit.unitId
    : '';

  return {
    transcriptionState,
    runWithDbMutex,
    syncToDb,
    dbNameRef,
    dirtyRef,
    recoverySave,
    scheduleRecoverySave,
    createAnchor,
    pruneOrphanAnchors,
    updateAnchorTime,
    segmentUndoRef,
    timingUndoRef,
    timingGestureRef,
    pushUndo,
    beginTimingGesture,
    endTimingGesture,
    undo,
    undoToHistoryIndex,
    redo,
    canUndo,
    canRedo,
    undoLabel,
    undoHistory,
    activeUnitId,
    activeSegmentUnitId,
  };
}
