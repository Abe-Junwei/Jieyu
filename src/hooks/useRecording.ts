import { useCallback, useEffect, useRef, useState } from 'react';
import type { LayerUnitDocType, LayerDocType } from '../db';
import type { DictKey } from '../i18n';
import type { SaveState } from './useTranscriptionData';

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
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecordingForUnit = useCallback(
    async (
      unit: LayerUnitDocType,
      layer: LayerDocType,
    ) => {
      const layerSupportsAudio =
        layer.modality === 'audio' || layer.modality === 'mixed' || Boolean(layer.acceptsAudio);
      if (!layerSupportsAudio) {
        setRecordingError('transcription.timeline.audio.error.layerUnsupported');
        return;
      }

      try {
        setRecordingError('');
        setSaveState({ kind: 'idle' });
        manualSelectTsRef.current = Date.now();
        selectUnit(unit.id);
        setRecordingUnitId(unit.id);
        setRecordingLayerId(layer.id);

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;

        const recorderOptions = pickVoiceTranslationRecorderOptions();
        const recorder = recorderOptions
          ? new MediaRecorder(stream, recorderOptions)
          : new MediaRecorder(stream);
        recorderRef.current = recorder;
        chunksRef.current = [];

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunksRef.current.push(event.data);
          }
        };

        recorder.onstop = async () => {
          try {
            setSaveState({ kind: 'saving' });
            const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
            await saveVoiceTranslation(blob, unit, layer);
          } catch (error) {
            setSaveState({
              kind: 'error',
              message: error instanceof Error ? error.message : '\u4fdd\u5b58\u7ffb\u8bd1\u5f55\u97f3\u5931\u8d25',
            });
          } finally {
            streamRef.current?.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
            chunksRef.current = [];
            setRecording(false);
            setRecordingUnitId(null);
            setRecordingLayerId(null);
          }
        };

        recorder.start();
        setRecording(true);
      } catch (error) {
        setRecording(false);
        setRecordingUnitId(null);
        setRecordingLayerId(null);
        setRecordingError(recordingStartFailureDictKey(error));
      }
    },
    [saveVoiceTranslation, setSaveState, selectUnit, manualSelectTsRef],
  );

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;
    recorder.stop();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
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
