import { useRef, useState } from 'react';

export type TranscriptionTrackDisplayMode = 'single' | 'multi-auto' | 'multi-locked' | 'multi-speaker-fixed';
export type SpeakerFocusMode = 'all' | 'focus-soft' | 'focus-hard';

export function useTranscriptionUIState() {
  const [layerToDeleteId, setLayerToDeleteId] = useState('');
  const [showLayerManager, setShowLayerManager] = useState(false);
  const [transcriptionTrackMode, setTranscriptionTrackMode] = useState<TranscriptionTrackDisplayMode>('single');
  const autoSaveTimersRef = useRef<Record<string, number>>({});
  const focusedTranslationDraftKeyRef = useRef<string | null>(null);

  return {
    layerToDeleteId,
    setLayerToDeleteId,
    showLayerManager,
    setShowLayerManager,
    transcriptionTrackMode,
    setTranscriptionTrackMode,
    autoSaveTimersRef,
    focusedTranslationDraftKeyRef,
  };
}
