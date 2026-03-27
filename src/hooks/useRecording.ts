import { useCallback, useEffect, useRef, useState } from 'react';
import type { UtteranceDocType, LayerDocType } from '../db';
import type { SaveState } from './useTranscriptionData';

interface UseRecordingOptions {
  saveVoiceTranslation: (blob: Blob, utterance: UtteranceDocType, layer: LayerDocType) => Promise<void>;
  setSaveState: (state: SaveState) => void;
  selectUtterance: (id: string) => void;
  manualSelectTsRef: React.MutableRefObject<number>;
}

export function useRecording({
  saveVoiceTranslation,
  setSaveState,
  selectUtterance,
  manualSelectTsRef,
}: UseRecordingOptions) {
  const [recording, setRecording] = useState(false);
  const [recordingUtteranceId, setRecordingUtteranceId] = useState<string | null>(null);
  const [recordingLayerId, setRecordingLayerId] = useState<string | null>(null);
  const [recordingError, setRecordingError] = useState('');

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecordingForUtterance = useCallback(
    async (
      utterance: UtteranceDocType,
      layer: LayerDocType,
    ) => {
      const layerSupportsAudio =
        layer.modality === 'audio' || layer.modality === 'mixed' || Boolean(layer.acceptsAudio);
      if (!layerSupportsAudio) {
        setRecordingError('当前层不是口译层，无法录音。');
        return;
      }

      try {
        setRecordingError('');
        setSaveState({ kind: 'idle' });
        manualSelectTsRef.current = Date.now();
        selectUtterance(utterance.id);
        setRecordingUtteranceId(utterance.id);
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
            await saveVoiceTranslation(blob, utterance, layer);
          } catch (error) {
            setSaveState({
              kind: 'error',
              message: error instanceof Error ? error.message : '保存翻译录音失败',
            });
          } finally {
            streamRef.current?.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
            chunksRef.current = [];
            setRecording(false);
            setRecordingUtteranceId(null);
            setRecordingLayerId(null);
          }
        };

        recorder.start();
        setRecording(true);
      } catch (error) {
        setRecording(false);
        setRecordingUtteranceId(null);
        setRecordingLayerId(null);
        setRecordingError(error instanceof Error ? error.message : '无法启动录音，请检查麦克风权限');
      }
    },
    [saveVoiceTranslation, setSaveState, selectUtterance, manualSelectTsRef],
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
    recordingUtteranceId,
    recordingLayerId,
    recordingError,
    startRecordingForUtterance,
    stopRecording,
  };
}
