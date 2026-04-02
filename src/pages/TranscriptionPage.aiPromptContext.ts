import type { AiPromptContext } from '../hooks/useAiChat';
import type { TranscriptionSelectionSnapshot } from './transcriptionSelectionSnapshot';

interface BuildTranscriptionAiPromptContextParams {
  selectionSnapshot: TranscriptionSelectionSnapshot;
  selectedUnitIds: string[];
  utteranceCount: number;
  translationLayerCount: number;
  aiConfidenceAvg: number | null;
  observerStage: string | null;
  topLexemes: string[];
  recommendations: string[];
  audioTimeSec?: number;
  recentEdits: string[];
}

export function buildTranscriptionAiPromptContext({
  selectionSnapshot,
  selectedUnitIds,
  utteranceCount,
  translationLayerCount,
  aiConfidenceAvg,
  observerStage,
  topLexemes,
  recommendations,
  audioTimeSec,
  recentEdits,
}: BuildTranscriptionAiPromptContextParams): AiPromptContext {
  return {
    shortTerm: {
      page: 'transcription',
      ...(selectionSnapshot.activeUtteranceUnitId ? { activeUtteranceUnitId: selectionSnapshot.activeUtteranceUnitId } : {}),
      ...(selectionSnapshot.selectedUnitKind === 'segment' && selectionSnapshot.timelineUnit
        ? { activeSegmentUnitId: selectionSnapshot.timelineUnit.unitId }
        : {}),
      ...(selectionSnapshot.selectedUnitKind ? { selectedUnitKind: selectionSnapshot.selectedUnitKind } : {}),
      ...(selectedUnitIds.length > 0 ? { selectedUnitIds } : {}),
      ...(selectionSnapshot.selectedUnitStartSec !== undefined && selectionSnapshot.selectedUnitEndSec !== undefined
        ? {
            selectedUtteranceStartSec: selectionSnapshot.selectedUnitStartSec,
            selectedUtteranceEndSec: selectionSnapshot.selectedUnitEndSec,
          }
        : {}),
      ...(selectionSnapshot.selectedLayerId ? { selectedLayerId: selectionSnapshot.selectedLayerId } : {}),
      ...(selectionSnapshot.selectedLayerType ? { selectedLayerType: selectionSnapshot.selectedLayerType } : {}),
      ...(selectionSnapshot.selectedTranslationLayerId ? { selectedTranslationLayerId: selectionSnapshot.selectedTranslationLayerId } : {}),
      ...(selectionSnapshot.selectedTranscriptionLayerId ? { selectedTranscriptionLayerId: selectionSnapshot.selectedTranscriptionLayerId } : {}),
      selectedText: selectionSnapshot.selectedText,
      ...(selectionSnapshot.selectedTimeRangeLabel ? { selectionTimeRange: selectionSnapshot.selectedTimeRangeLabel } : {}),
      ...(audioTimeSec !== undefined ? { audioTimeSec } : {}),
      recentEdits,
    },
    longTerm: {
      projectStats: {
        utteranceCount,
        translationLayerCount,
        aiConfidenceAvg,
      },
      ...(observerStage ? { observerStage } : {}),
      topLexemes,
      recommendations,
    },
  };
}