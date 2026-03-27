import { useLatest } from './useLatest';
import { useTranscriptionDbState } from './useTranscriptionDbState';
import { useTranscriptionDocumentState } from './useTranscriptionDocumentState';
import { useTranscriptionSelectionState } from './useTranscriptionSelectionState';
import { useTranscriptionUIState } from './useTranscriptionUIState';

export function useTranscriptionState() {
  const dbState = useTranscriptionDbState();
  const docState = useTranscriptionDocumentState();
  const selectionState = useTranscriptionSelectionState();
  const uiState = useTranscriptionUIState();

  const utterancesRef = useLatest(docState.utterances);
  const anchorsRef = useLatest(docState.anchors);
  const translationsRef = useLatest(docState.translations);
  const layersRef = useLatest(docState.layers);
  const layerLinksRef = useLatest(docState.layerLinks);
  const speakersRef = useLatest(docState.speakers);
  const selectedTimelineUnitRef = useLatest(selectionState.selectedTimelineUnit);
  const selectedLayerIdRef = useLatest(selectionState.selectedLayerId);
  const selectedUtteranceUnitIdRef = useLatest(
    selectionState.selectedTimelineUnit?.kind === 'utterance'
      ? selectionState.selectedTimelineUnit.unitId
      : '',
  );
  const selectedUtteranceIdsRef = useLatest(selectionState.selectedUtteranceIds);

  return {
    ...dbState,
    ...docState,
    ...selectionState,
    ...uiState,
    utterancesRef,
    anchorsRef,
    translationsRef,
    layersRef,
    layerLinksRef,
    speakersRef,
    selectedTimelineUnitRef,
    selectedLayerIdRef,
    selectedUtteranceUnitIdRef,
    selectedUtteranceIdsRef,
  };
}
