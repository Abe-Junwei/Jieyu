import { useState } from 'react';
import type { DbState, SaveState, SnapGuide } from './transcriptionTypes';

export function useTranscriptionDbState() {
  const [state, setState] = useState<DbState>({ phase: 'loading' });
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' });
  const [layerCreateMessage, setLayerCreateMessage] = useState('');
  const [snapGuide, setSnapGuide] = useState<SnapGuide>({ visible: false });

  return {
    state,
    setState,
    saveState,
    setSaveState,
    layerCreateMessage,
    setLayerCreateMessage,
    snapGuide,
    setSnapGuide,
  };
}
