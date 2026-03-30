import { useCallback } from 'react';
import type { TimelineUnitKind } from '../hooks/transcriptionTypes';
import { fireAndForget } from '../utils/fireAndForget';

interface UseTranscriptionOverlayActionRoutingControllerInput {
  deleteSelectedUtterancesRouted: (ids: Set<string>, layerIdOverride?: string) => Promise<void>;
  deleteUtteranceRouted: (id: string, layerIdOverride?: string) => Promise<void>;
  mergeWithPreviousRouted: (id: string, layerIdOverride?: string) => Promise<void>;
  mergeWithNextRouted: (id: string, layerIdOverride?: string) => Promise<void>;
  splitRouted: (id: string, splitTime: number, layerIdOverride?: string) => Promise<void>;
  runDeleteSelection: (primaryId: string, ids: Set<string>) => void;
  runMergeSelection: (ids: Set<string>) => void;
  runDeleteOne: (id: string) => void;
  runMergePrev: (id: string) => void;
  runMergeNext: (id: string) => void;
  runSplitAtTime: (id: string, splitTime: number) => void;
}

interface UseTranscriptionOverlayActionRoutingControllerResult {
  runOverlayDeleteSelection: (primaryId: string, ids: Set<string>, unitKind: TimelineUnitKind, layerId: string) => void;
  runOverlayMergeSelection: (ids: Set<string>, unitKind: TimelineUnitKind, layerId: string) => void;
  runOverlayDeleteOne: (id: string, unitKind: TimelineUnitKind, layerId: string) => void;
  runOverlayMergePrev: (id: string, unitKind: TimelineUnitKind, layerId: string) => void;
  runOverlayMergeNext: (id: string, unitKind: TimelineUnitKind, layerId: string) => void;
  runOverlaySplitAtTime: (id: string, splitTime: number, unitKind: TimelineUnitKind, layerId: string) => void;
}

export function useTranscriptionOverlayActionRoutingController(
  input: UseTranscriptionOverlayActionRoutingControllerInput,
): UseTranscriptionOverlayActionRoutingControllerResult {
  const {
    deleteSelectedUtterancesRouted,
    deleteUtteranceRouted,
    mergeWithPreviousRouted,
    mergeWithNextRouted,
    splitRouted,
    runDeleteSelection,
    runMergeSelection,
    runDeleteOne,
    runMergePrev,
    runMergeNext,
    runSplitAtTime,
  } = input;

  const runOverlayDeleteSelection = useCallback((primaryId: string, ids: Set<string>, unitKind: TimelineUnitKind, layerId: string) => {
    if (unitKind === 'segment') {
      fireAndForget(deleteSelectedUtterancesRouted(ids, layerId));
      return;
    }
    runDeleteSelection(primaryId, ids);
  }, [deleteSelectedUtterancesRouted, runDeleteSelection]);

  const runOverlayMergeSelection = useCallback((ids: Set<string>, unitKind: TimelineUnitKind, _layerId: string) => {
    if (unitKind === 'segment') {
      return;
    }
    runMergeSelection(ids);
  }, [runMergeSelection]);

  const runOverlayDeleteOne = useCallback((id: string, unitKind: TimelineUnitKind, layerId: string) => {
    if (unitKind === 'segment') {
      fireAndForget(deleteUtteranceRouted(id, layerId));
      return;
    }
    runDeleteOne(id);
  }, [deleteUtteranceRouted, runDeleteOne]);

  const runOverlayMergePrev = useCallback((id: string, unitKind: TimelineUnitKind, layerId: string) => {
    if (unitKind === 'segment') {
      fireAndForget(mergeWithPreviousRouted(id, layerId));
      return;
    }
    runMergePrev(id);
  }, [mergeWithPreviousRouted, runMergePrev]);

  const runOverlayMergeNext = useCallback((id: string, unitKind: TimelineUnitKind, layerId: string) => {
    if (unitKind === 'segment') {
      fireAndForget(mergeWithNextRouted(id, layerId));
      return;
    }
    runMergeNext(id);
  }, [mergeWithNextRouted, runMergeNext]);

  const runOverlaySplitAtTime = useCallback((id: string, splitTime: number, unitKind: TimelineUnitKind, layerId: string) => {
    if (unitKind === 'segment') {
      fireAndForget(splitRouted(id, splitTime, layerId));
      return;
    }
    runSplitAtTime(id, splitTime);
  }, [runSplitAtTime, splitRouted]);

  return {
    runOverlayDeleteSelection,
    runOverlayMergeSelection,
    runOverlayDeleteOne,
    runOverlayMergePrev,
    runOverlayMergeNext,
    runOverlaySplitAtTime,
  };
}