import { useState } from 'react';
import type { DbState, SaveState } from './transcriptionTypes';

export function useTranscriptionDbState() {
  const [state, setState] = useState<DbState>({ phase: 'loading' });
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' });
  const [layerCreateMessage, setLayerCreateMessage] = useState('');

  return {
    state,
    setState,
    saveState,
    setSaveState,
    layerCreateMessage,
    setLayerCreateMessage,
  };
}
