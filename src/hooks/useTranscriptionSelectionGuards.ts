import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import type { TranslationLayerDocType } from '../../db';

type Params = {
  selectedLayerId: string;
  setSelectedLayerId: (id: string) => void;
  translationLayers: TranslationLayerDocType[];
  layerToDeleteId: string;
  setLayerToDeleteId: (id: string) => void;
  deletableLayers: TranslationLayerDocType[];
  selectedUtteranceId: string;
  setSelectedUtteranceIds: (ids: Set<string>) => void;
  selectedUtteranceIdsRef: MutableRefObject<Set<string>>;
};

export function useTranscriptionSelectionGuards({
  selectedLayerId,
  setSelectedLayerId,
  translationLayers,
  layerToDeleteId,
  setLayerToDeleteId,
  deletableLayers,
  selectedUtteranceId,
  setSelectedUtteranceIds,
  selectedUtteranceIdsRef,
}: Params) {
  useEffect(() => {
    if (!selectedLayerId) return;
    const exists = translationLayers.some((item) => item.id === selectedLayerId);
    if (!exists) {
      setSelectedLayerId(translationLayers[0]?.id ?? '');
    }
  }, [selectedLayerId, setSelectedLayerId, translationLayers]);

  useEffect(() => {
    if (!layerToDeleteId) {
      setLayerToDeleteId(deletableLayers[0]?.id ?? '');
      return;
    }
    const exists = deletableLayers.some((item) => item.id === layerToDeleteId);
    if (!exists) {
      setLayerToDeleteId(deletableLayers[0]?.id ?? '');
    }
  }, [deletableLayers, layerToDeleteId, setLayerToDeleteId]);

  // Multi-select sync: when selectedUtteranceId changes via legacy code paths,
  // reset the set to contain just the primary.
  useEffect(() => {
    if (!selectedUtteranceId) {
      setSelectedUtteranceIds(new Set());
      return;
    }
    if (!selectedUtteranceIdsRef.current.has(selectedUtteranceId)) {
      setSelectedUtteranceIds(new Set([selectedUtteranceId]));
    }
  }, [selectedUtteranceId, selectedUtteranceIdsRef, setSelectedUtteranceIds]);
}