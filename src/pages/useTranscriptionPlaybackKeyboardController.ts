import { useCallback, useRef } from 'react';
import { useKeybindingActions } from '../hooks/useKeybindingActions';

export function useTranscriptionPlaybackKeyboardController(
  input: Parameters<typeof useKeybindingActions>[0],
) {
  const toggleVoiceRef = useRef<(() => void) | undefined>(undefined);
  const {
    handlePlayPauseAction: _handlePlayPauseAction,
    handleGlobalPlayPauseAction,
    handleWaveformKeyDown,
    navigateUnitFromInput,
    executeAction,
  } = useKeybindingActions({
    ...input,
    toggleVoice: useCallback(() => toggleVoiceRef.current?.(), []),
  });

  return {
    handleGlobalPlayPauseAction,
    handleWaveformKeyDown,
    navigateUnitFromInput,
    executeAction,
    toggleVoiceRef,
  };
}
