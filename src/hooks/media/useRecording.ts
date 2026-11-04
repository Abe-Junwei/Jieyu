import { useCallback, useEffect, useRef, useState } from 'react';
import type { LayerUnitDocType, LayerDocType } from '../../db/types';
import type { DictKey } from '../../i18n';
import type { SaveState } from '../useTranscriptionData';

/** Maps getUserMedia / recorder failures to i18n keys consumed by ToastController. */
export function recordingStartFailureDictKey(error: unknown): DictKey {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') {
      return 'transcription.timeline.audio.error.micPermissionDenied';
    }
    if (error.name === 'NotFoundError') {
      return 'transcription.timeline.audio.error.micNotFound';
    }
    if (error.name === 'NotReadableError') {
      return 'transcription.timeline.audio.error.micBusy';
    }
  }
  return 'transcription.timeline.audio.error.startFailed';
}

interface UseRecordingOptions {
  saveVoiceTranslation: (blob: Blob, unit: LayerUnitDocType, layer: LayerDocType) => Promise<void>;
  setSaveState: (state: SaveState) => void;
  selectUnit: (id: string) => void;
  manualSelectTsRef: React.MutableRefObject<number>;
}

/** 与 `VoiceInputService.recording` 对齐：优先 webm/opus，其次常见跨浏览器 mime。 */
function pickVoiceTranslationRecorderOptions(): MediaRecorderOptions | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return undefined;
  }
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
    return { mimeType: 'audio/webm;codecs=opus' };
  }
  if (MediaRecorder.isTypeSupported('audio/webm')) {
    return { mimeType: 'audio/webm' };
  }
  if (MediaRecorder.isTypeSupported('audio/mp4')) {
    return { mimeType: 'audio/mp4' };
  }
  return undefined;
}

export function useRecording({
  saveVoiceTranslation,
  setSaveState,
  selectUnit,
  manualSelectTsRef,
}: UseRecordingOptions) {
  const [recording, setRecording] = useState(false);
  const [recordingUnitId, setRecordingUnitId] = useState<string | null>(null);
  const [recordingLayerId, setRecordingLayerId] = useState<string | null>(null);
  const [recordingError, setRecordingError] = useState('');

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  /** Monotonic session id: bumped to invalidate a pending/active capture (#496/#497). */
  const sessionIdRef = useRef(0);
  /** Sync latch occupied before await getUserMedia so concurrent starts are refused (#496). */
  const sessionBusyRef = useRef(false);

  const clearSessionState = useCallback(() => {
    sessionBusyRef.current = false;
    recorderRef.current = null;
    streamRef.current = null;
    setRecording(false);
    setRecordingUnitId(null);
    setRecordingLayerId(null);
  }, []);

  const startRecordingForUnit = useCallback(
    async (unit: LayerUnitDocType, layer: LayerDocType) => {
      const layerSupportsAudio =
        layer.modality === 'audio' || layer.modality === 'mixed' || Boolean(layer.acceptsAudio);
      if (!layerSupportsAudio) {
        setRecordingError('transcription.timeline.audio.error.layerUnsupported');
        return;
      }

      // Refuse re-entry while a start (or active recording) already owns the session (#496).
      if (sessionBusyRef.current) return;
      sessionBusyRef.current = true;
      const sessionId = ++sessionIdRef.current;

      try {
        setRecordingError('');
        setSaveState({ kind: 'idle' });
        manualSelectTsRef.current = Date.now();
        selectUnit(unit.id);
        // Occupy UI immediately so other segment buttons disable during permission wait.
        setRecordingUnitId(unit.id);
        setRecordingLayerId(layer.id);
        setRecording(true);

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (sessionId !== sessionIdRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;

        const recorderOptions = pickVoiceTranslationRecorderOptions();
        const recorder = recorderOptions
          ? new MediaRecorder(stream, recorderOptions)
          : new MediaRecorder(stream);
        recorderRef.current = recorder;
        // Session-local chunks: never share a buffer across overlapping starts (#496).
        const chunks: Blob[] = [];

        recorder.ondataavailable = (event) => {
          if (sessionId !== sessionIdRef.current) return;
          if (event.data.size > 0) {
            chunks.push(event.data);
          }
        };

        recorder.onstop = async () => {
          if (sessionId !== sessionIdRef.current) {
            stream.getTracks().forEach((track) => track.stop());
            if (streamRef.current === stream) streamRef.current = null;
            if (recorderRef.current === recorder) recorderRef.current = null;
            return;
          }
          try {
            setSaveState({ kind: 'saving' });
            const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
            await saveVoiceTranslation(blob, unit, layer);
          } catch (error) {
            setSaveState({
              kind: 'error',
              message:
                error instanceof Error
                  ? error.message
                  : '\u4fdd\u5b58\u7ffb\u8bd1\u5f55\u97f3\u5931\u8d25',
            });
          } finally {
            if (sessionId === sessionIdRef.current) {
              stream.getTracks().forEach((track) => track.stop());
              if (streamRef.current === stream) streamRef.current = null;
              if (recorderRef.current === recorder) recorderRef.current = null;
              clearSessionState();
            }
          }
        };

        if (sessionId !== sessionIdRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          if (streamRef.current === stream) streamRef.current = null;
          return;
        }

        recorder.start();
      } catch (error) {
        if (sessionId !== sessionIdRef.current) return;
        streamRef.current?.getTracks().forEach((track) => track.stop());
        clearSessionState();
        setRecordingError(recordingStartFailureDictKey(error));
      }
    },
    [saveVoiceTranslation, setSaveState, selectUnit, manualSelectTsRef, clearSessionState],
  );

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state === 'recording') {
      recorder.stop();
      return;
    }
    // Permission still pending: invalidate the session so a late stream is dropped (#507).
    if (sessionBusyRef.current && !recorder) {
      sessionIdRef.current += 1;
      clearSessionState();
    }
  }, [clearSessionState]);

  // Cleanup on unmount: invalidate any pending getUserMedia session and release capture (#497).
  useEffect(() => {
    return () => {
      sessionIdRef.current += 1;
      sessionBusyRef.current = false;
      const recorder = recorderRef.current;
      if (recorder) {
        recorder.onstop = null;
        if (recorder.state === 'recording') {
          try {
            recorder.stop();
          } catch {
            /* already stopped */
          }
        }
        recorderRef.current = null;
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  return {
    recording,
    recordingUnitId,
    recordingLayerId,
    recordingError,
    startRecordingForUnit,
    stopRecording,
  };
}
