/**
 * Transcription-page voice wiring (summaries + send-to-AI bridge).
 * Extracted from useVoiceInteraction for Phase C1 — keeps the hook thinner and tests the wiring in isolation.
 */

import type { LayerDocType, LayerLinkDocType } from '../db';
import type { VoiceInteractionMessages } from '../i18n/voiceInteractionMessages';
import { resolveHostAwareTranslationLayerIdFromSnapshot } from '../utils/translationLayerTargetResolver';

export interface TranscriptionVoiceSelectionSnapshot {
  activeUnitId: string | null;
  selectedUnit: {
    id: string;
    layerId?: string;
    startTime: number;
    endTime: number;
  } | null;
  selectedRowMeta: { rowNumber: number; start: number; end: number } | null;
  selectedLayerId: string | null;
  selectedUnitKind: 'unit' | 'segment' | null;
  selectedTimeRangeLabel?: string;
}

export function computeTranscriptionVoiceTargetSummary(input: {
  isNonDictationMode: boolean;
  selection: TranscriptionVoiceSelectionSnapshot;
  layers: LayerDocType[];
  translationLayers: LayerDocType[];
  layerLinks?: LayerLinkDocType[];
  defaultTranscriptionLayerId?: string;
  formatSidePaneLayerLabel: (layer: LayerDocType) => string;
  messages: VoiceInteractionMessages;
}): string {
  const {
    isNonDictationMode,
    selection,
    layers,
    translationLayers,
    layerLinks,
    defaultTranscriptionLayerId,
    formatSidePaneLayerLabel,
    messages,
  } = input;

  const hasSelection = Boolean(selection.selectedRowMeta || selection.selectedUnit);
  const rowLabel = selection.selectedUnitKind === 'segment'
    ? messages.currentIndependentSegment
    : selection.selectedRowMeta
      ? messages.currentSentenceWithIndex(selection.selectedRowMeta.rowNumber)
      : (selection.selectedUnit ? messages.currentUnit : messages.noUnitSelected);

  if (isNonDictationMode) {
    if (hasSelection) {
      return `${rowLabel} / ${messages.analysisNoteSuffix}`;
    }
    return messages.currentPageAction;
  }

  const normalizedSelected = selection.selectedLayerId?.trim();
  const selectedLayer = normalizedSelected
    ? layers.find((layer) => layer.id === normalizedSelected)
    : undefined;
  const defaultLayer = defaultTranscriptionLayerId?.trim()
    ? layers.find((layer) => layer.id === defaultTranscriptionLayerId.trim())
    : undefined;
  const fallbackTranslationLayerId = resolveHostAwareTranslationLayerIdFromSnapshot({
    selectedLayerId: selection.selectedLayerId,
    selectedUnitLayerId: selection.selectedUnit?.layerId,
    defaultTranscriptionLayerId,
    translationLayers,
    transcriptionLayers: layers.filter((layer) => layer.layerType === 'transcription'),
    ...(layerLinks !== undefined ? { layerLinks } : {}),
  });
  const fallbackTranslationLayer = fallbackTranslationLayerId
    ? layers.find((layer) => layer.id === fallbackTranslationLayerId)
    : undefined;
  const targetLayer = selectedLayer ?? defaultLayer ?? fallbackTranslationLayer;
  const layerLabel = targetLayer ? formatSidePaneLayerLabel(targetLayer) : messages.noLayerSelected;
  return messages.targetSummary(layerLabel, rowLabel);
}

export function computeTranscriptionVoiceSelectionSummary(input: {
  selection: TranscriptionVoiceSelectionSnapshot;
  formatTime: (seconds: number) => string;
  unknownSegmentLabel: string;
}): string {
  const { selection, formatTime, unknownSegmentLabel } = input;
  if (selection.selectedTimeRangeLabel) {
    return selection.selectedTimeRangeLabel;
  }
  if (selection.selectedRowMeta) {
    return `${formatTime(selection.selectedRowMeta.start)} - ${formatTime(selection.selectedRowMeta.end)}`;
  }
  if (selection.selectedUnit) {
    return `${formatTime(selection.selectedUnit.startTime)} - ${formatTime(selection.selectedUnit.endTime)}`;
  }
  return unknownSegmentLabel;
}

export type VoiceAnalysisWritebackResult = { ok: boolean; message?: string } | void;

export function createTranscriptionVoiceSendToAiChat(input: {
  getActiveUnitId: () => string | null;
  onVoiceAnalysisResult: (
    unitId: string | null,
    analysisText: string,
  ) => Promise<VoiceAnalysisWritebackResult> | VoiceAnalysisWritebackResult;
  aiChatSend: (text: string) => Promise<unknown>;
  messages: Pick<VoiceInteractionMessages, 'analysisWritebackDone' | 'analysisWritebackFailed' | 'sendToAiFailed'>;
  runVoiceTask: (
    task: () => Promise<void>,
    fallbackMessage: string,
    onError?: (message: string) => void,
  ) => void;
  getVoiceAgentApi: () => {
    setAnalysisFillCallback?: (
      unitId: string | null,
      cb: ((text: string) => void) | null,
    ) => void;
    setExternalError?: (message: string | null) => void;
  } | null;
  setAnalysisWritebackFeedback: (value: { kind: 'done' | 'error'; message: string } | null) => void;
}): (text: string) => void {
  const {
    getActiveUnitId,
    onVoiceAnalysisResult,
    aiChatSend,
    messages,
    runVoiceTask,
    getVoiceAgentApi,
    setAnalysisWritebackFeedback,
  } = input;

  return (text: string) => {
    runVoiceTask(async () => {
      const unitId = getActiveUnitId();
      getVoiceAgentApi()?.setAnalysisFillCallback?.(unitId, (analysisText) => {
        runVoiceTask(async () => {
          const result = await onVoiceAnalysisResult(unitId, analysisText);
          if (!result) {
            getVoiceAgentApi()?.setExternalError?.(null);
            setAnalysisWritebackFeedback({ kind: 'done', message: messages.analysisWritebackDone });
            return;
          }
          const ok = result.ok !== false;
          const normalizedMessage = result.message?.trim() || (ok ? messages.analysisWritebackDone : messages.analysisWritebackFailed);
          setAnalysisWritebackFeedback({ kind: ok ? 'done' : 'error', message: normalizedMessage });
          getVoiceAgentApi()?.setExternalError?.(ok ? null : normalizedMessage);
        }, messages.analysisWritebackFailed, (message) => {
          setAnalysisWritebackFeedback({ kind: 'error', message });
        });
      });
      await aiChatSend(text);
    }, messages.sendToAiFailed, (message) => {
      getVoiceAgentApi()?.setAnalysisFillCallback?.(null, null);
      setAnalysisWritebackFeedback({ kind: 'error', message });
    });
  };
}
