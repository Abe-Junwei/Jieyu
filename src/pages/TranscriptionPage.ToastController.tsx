/**
 * TranscriptionPage - ToastController Component
 * 桥接 TranscriptionPage 状态到 ToastProvider
 */

import { useEffect } from 'react';
import { useToast } from '../contexts/ToastContext';
import type { SaveState } from '../hooks/transcriptionTypes';

interface ToastControllerProps {
  /** Subset of useVoiceAgent return value needed for toast routing */
  voiceAgent: {
    agentState: string;
    mode: string;
    listening: boolean;
    isRecording: boolean;
  };
  saveState: SaveState;
  recording: boolean;
  recordingUtteranceId: string | null;
  recordingError: string | null;
  /** i18n function for recording toast message */
  tf: (key: string, opts?: Record<string, unknown>) => string;
}

export function ToastController({
  voiceAgent,
  saveState,
  recording,
  recordingUtteranceId,
  recordingError,
  tf,
}: ToastControllerProps) {
  const { showToast, showSaveState, showVoiceState } = useToast();

  // SaveState changes → toast
  useEffect(() => {
    showSaveState(saveState);
  }, [saveState, showSaveState]);

  // Recording error → error toast
  useEffect(() => {
    if (recordingError) {
      showToast(recordingError, 'error', 0);
    }
  }, [recordingError, showToast]);

  // Recording active → persistent recording toast
  useEffect(() => {
    if (recording) {
      showToast(
        tf('transcription.toast.recording', {
          id: recordingUtteranceId ?? tf('transcription.toast.recordingUnknownRow'),
        }),
        'recording',
        0,
      );
    }
  }, [recording, recordingUtteranceId, showToast, tf]);

  // Voice agent state → toast
  useEffect(() => {
    if (voiceAgent.listening || voiceAgent.agentState !== 'idle') {
      showVoiceState(
        voiceAgent.agentState as Parameters<typeof showVoiceState>[0],
        voiceAgent.listening,
      );
    } else {
      showVoiceState(null);
    }
  }, [voiceAgent.agentState, voiceAgent.listening, showVoiceState]);

  // TaskRunner stale task recovery → alert toast
  useEffect(() => {
    const handler = (e: Event) => {
      const count = (e as CustomEvent<{ count: number }>).detail?.count ?? 0;
      if (count > 0) {
        showToast(tf('transcription.toast.taskRecovered', { count }), 'info');
      }
    };
    window.addEventListener('taskrunner:stale-recovered', handler);
    return () => window.removeEventListener('taskrunner:stale-recovered', handler);
  }, [showToast]);

  // This component renders nothing — it only manages side-effects via the toast context.
  return null;
}
