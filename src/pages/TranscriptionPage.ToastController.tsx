/**
 * TranscriptionPage - ToastController Component
 * 桥接 TranscriptionPage 状态到 ToastProvider
 */

import { useEffect, useRef } from 'react';
import { useToast } from '../contexts/ToastContext';
import type { SaveState } from '../hooks/transcriptionTypes';
import { isDictKey } from '../i18n';
import {
  useFireAndForgetErrorToast,
  useToastControllerWindowEvents,
} from '../components/transcription/useToastControllerWindowEffects';

type VoiceToastMode = 'command' | 'dictation' | 'analysis';

function resolveVoiceToastMode(mode: string): VoiceToastMode | null {
  if (mode === 'command' || mode === 'dictation' || mode === 'analysis') {
    return mode;
  }
  return null;
}

function buildLockConflictMessage(
  tf: (key: string, opts?: Record<string, unknown>) => string,
  lockConflictToast: { count: number; speakers: string[] },
): string {
  if (lockConflictToast.speakers.length > 0) {
    return tf('transcription.toast.lockConflictWithSpeakers', {
      count: lockConflictToast.count,
      speakers: lockConflictToast.speakers.join('、'),
    });
  }
  return tf('transcription.toast.lockConflict', {
    count: lockConflictToast.count,
  });
}

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
  recordingUnitId: string | null;
  recordingError: string | null;
  overlapCycleToast?: { index: number; total: number; nonce: number } | null;
  lockConflictToast?: { count: number; speakers: string[]; nonce: number } | null;
  mode?: 'all' | 'core-only' | 'voice-only';
  /** i18n function for recording toast message */
  tf: (key: string, opts?: Record<string, unknown>) => string;
}

export function ToastController({
  voiceAgent,
  saveState,
  recording,
  recordingUnitId,
  recordingError,
  overlapCycleToast,
  lockConflictToast,
  mode = 'all',
  tf,
}: ToastControllerProps) {
  const { showToast, showSaveState, showVoiceState } = useToast();
  const shouldSyncCore = mode !== 'voice-only';
  const shouldSyncVoice = mode !== 'core-only';
  /** Same `recordingError` must only enqueue one toast — `tf`/`showToast` identities often change each parent render. */
  const recordingErrorToastShownForRef = useRef<string | null>(null);

  // SaveState changes → toast
  useEffect(() => {
    if (!shouldSyncCore) return;
    showSaveState(saveState);
  }, [saveState, shouldSyncCore, showSaveState]);

  // Recording error → error toast (auto-dismiss like other errors; do not pass 0)
  useEffect(() => {
    if (!shouldSyncCore) return;
    if (!recordingError) {
      recordingErrorToastShownForRef.current = null;
      return;
    }
    if (recordingErrorToastShownForRef.current === recordingError) {
      return;
    }
    recordingErrorToastShownForRef.current = recordingError;
    const message = isDictKey(recordingError) ? tf(recordingError) : recordingError;
    showToast(message, 'error');
  }, [recordingError, shouldSyncCore, showToast, tf]);

  // Voice agent error (including wake-word startup failures) → error toast
  useEffect(() => {
    if (!shouldSyncVoice) return;
    if (voiceAgent.error) {
      showToast(voiceAgent.error, 'error', 0);
    }
  }, [shouldSyncVoice, showToast, voiceAgent.error]);

  // Recording active → persistent recording toast
  useEffect(() => {
    if (!shouldSyncCore) return;
    if (recording) {
      showToast(
        tf('transcription.toast.recording', {
          id: recordingUnitId ?? tf('transcription.toast.recordingUnknownRow'),
        }),
        'recording',
        0,
      );
    }
  }, [recording, recordingUnitId, shouldSyncCore, showToast, tf]);

  useEffect(() => {
    if (!shouldSyncCore) return;
    if (!overlapCycleToast) return;
    showToast(tf('transcription.toast.overlapCandidates', {
      index: overlapCycleToast.index,
      total: overlapCycleToast.total,
    }), 'info', 2000);
  }, [overlapCycleToast, shouldSyncCore, showToast, tf]);

  useEffect(() => {
    if (!shouldSyncCore) return;
    if (!lockConflictToast) return;
    showToast(buildLockConflictMessage(tf, lockConflictToast), 'info', 2000);
  }, [lockConflictToast, shouldSyncCore, showToast, tf]);

  // Voice agent state → toast
  useEffect(() => {
    if (!shouldSyncVoice) return;
    const toastMode = resolveVoiceToastMode(voiceAgent.mode);

    if (toastMode && (voiceAgent.listening || voiceAgent.isRecording || voiceAgent.agentState !== 'idle')) {
      showVoiceState(
        toastMode,
        voiceAgent.agentState === 'listening' || voiceAgent.isRecording,
      );
    } else {
      showVoiceState(null);
    }
  }, [shouldSyncVoice, voiceAgent.agentState, voiceAgent.isRecording, voiceAgent.listening, voiceAgent.mode, showVoiceState]);

  useToastControllerWindowEvents({
    enabled: shouldSyncCore,
    showToast,
    tf,
  });

  useFireAndForgetErrorToast({
    enabled: shouldSyncCore,
    showToast,
    tf,
  });

  // This component renders nothing — it only manages side-effects via the toast context.
  return null;
}
