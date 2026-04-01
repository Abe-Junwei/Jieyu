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
    error?: string | null;
  };
  saveState: SaveState;
  recording: boolean;
  recordingUtteranceId: string | null;
  recordingError: string | null;
  overlapCycleToast?: { index: number; total: number; nonce: number } | null;
  lockConflictToast?: { count: number; speakers: string[]; nonce: number } | null;
  /** i18n function for recording toast message */
  tf: (key: string, opts?: Record<string, unknown>) => string;
}

export function ToastController({
  voiceAgent,
  saveState,
  recording,
  recordingUtteranceId,
  recordingError,
  overlapCycleToast,
  lockConflictToast,
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

  // Voice agent error (including wake-word startup failures) → error toast
  useEffect(() => {
    if (voiceAgent.error) {
      showToast(voiceAgent.error, 'error', 0);
    }
  }, [showToast, voiceAgent.error]);

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

  useEffect(() => {
    if (!overlapCycleToast) return;
    showToast(tf('transcription.toast.overlapCandidates', {
      index: overlapCycleToast.index,
      total: overlapCycleToast.total,
    }), 'info', 2000);
  }, [overlapCycleToast, showToast, tf]);

  useEffect(() => {
    if (!lockConflictToast) return;
    if (lockConflictToast.speakers.length > 0) {
      showToast(tf('transcription.toast.lockConflictWithSpeakers', {
        count: lockConflictToast.count,
        speakers: lockConflictToast.speakers.join('、'),
      }), 'info', 2000);
      return;
    }
    showToast(tf('transcription.toast.lockConflict', {
      count: lockConflictToast.count,
    }), 'info', 2000);
  }, [lockConflictToast, showToast, tf]);

  // Voice agent state → toast
  useEffect(() => {
    const toastMode = (
      voiceAgent.mode === 'command'
      || voiceAgent.mode === 'dictation'
      || voiceAgent.mode === 'analysis'
    )
      ? voiceAgent.mode
      : null;

    if (toastMode && (voiceAgent.listening || voiceAgent.isRecording || voiceAgent.agentState !== 'idle')) {
      showVoiceState(
        toastMode,
        voiceAgent.agentState === 'listening' || voiceAgent.isRecording,
      );
    } else {
      showVoiceState(null);
    }
  }, [voiceAgent.agentState, voiceAgent.isRecording, voiceAgent.listening, voiceAgent.mode, showVoiceState]);

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
  }, [showToast, tf]);

  // This component renders nothing — it only manages side-effects via the toast context.
  return null;
}
