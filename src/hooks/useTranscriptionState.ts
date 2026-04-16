import { useLatest } from './useLatest';
import { useTranscriptionDbState } from './useTranscriptionDbState';
import { useTranscriptionDocumentState } from './useTranscriptionDocumentState';
import { useTranscriptionSelectionState } from './useTranscriptionSelectionState';
import { useTranscriptionUIState } from './useTranscriptionUIState';
import { isUnitTimelineUnit } from './transcriptionTypes';

export function useTranscriptionState() {
  const dbState = useTranscriptionDbState();
  const docState = useTranscriptionDocumentState();
  const selectionState = useTranscriptionSelectionState();
  const uiState = useTranscriptionUIState();

  const unitsRef = useLatest(docState.units);
  const anchorsRef = useLatest(docState.anchors);
  const translationsRef = useLatest(docState.translations);
  const layersRef = useLatest(docState.layers);
  const layerLinksRef = useLatest(docState.layerLinks);
  const speakersRef = useLatest(docState.speakers);
  const selectedTimelineUnitRef = useLatest(selectionState.selectedTimelineUnit);
  const selectedLayerIdRef = useLatest(selectionState.selectedLayerId);
  const selectedUnitIdRef = useLatest(
    isUnitTimelineUnit(selectionState.selectedTimelineUnit)
      ? selectionState.selectedTimelineUnit.unitId
      : '',
  );
  const selectedUnitIdsRef = useLatest(selectionState.selectedUnitIds);

  return {
    ...dbState,
    ...docState,
    ...selectionState,
    ...uiState,
    unitsRef,
    anchorsRef,
    translationsRef,
    layersRef,
    layerLinksRef,
    speakersRef,
    selectedTimelineUnitRef,
    selectedLayerIdRef,
    selectedUnitIdRef,
    selectedUnitIdsRef,
  };
}
