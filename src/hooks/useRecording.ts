import { useCallback, useEffect, useRef, useState } from 'react';
import type { LayerUnitDocType, LayerDocType } from '../db';
import type { SaveState } from './useTranscriptionData';

interface UseRecordingOptions {
  saveVoiceTranslation: (blob: Blob, unit: LayerUnitDocType, layer: LayerDocType) => Promise<void>;
  setSaveState: (state: SaveState) => void;
  selectUnit: (id: string) => void;
  manualSelectTsRef: React.MutableRefObject<number>;
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
        setRecordingError('\u5f53\u524d\u5c42\u4e0d\u652f\u6301\u5f55\u97f3\uff08\u9700\u97f3\u9891/\u6df7\u5408\u6a21\u6001\u6216 acceptsAudio\uff09\u3002');
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

        const recorder = new MediaRecorder(stream);
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
        setRecordingError(error instanceof Error ? error.message : '\u65e0\u6cd5\u542f\u52a8\u5f55\u97f3\uff0c\u8bf7\u68c0\u67e5\u9ea6\u514b\u98ce\u6743\u9650');
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
