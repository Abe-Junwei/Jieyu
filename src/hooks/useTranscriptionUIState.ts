import { useRef, useState } from 'react';

export function useTranscriptionUIState() {
  const [layerToDeleteId, setLayerToDeleteId] = useState('');
  const [showLayerManager, setShowLayerManager] = useState(false);
  const autoSaveTimersRef = useRef<Record<string, number>>({});
  const focusedTranslationDraftKeyRef = useRef<string | null>(null);

  return {
    layerToDeleteId,
    setLayerToDeleteId,
    showLayerManager,
    setShowLayerManager,
    autoSaveTimersRef,
    focusedTranslationDraftKeyRef,
  };
}
