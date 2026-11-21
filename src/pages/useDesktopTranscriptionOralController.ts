import { useEffect, useRef, useState } from 'react';
import { useToast } from '../contexts/ToastContext';
import { clipBytesToWav } from './oralClipWav';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { t, useLocale, type DictKey } from '../i18n';

function clipKey(layerId: string, unitId: string): string {
  return `${layerId}\n${unitId}`;
}

function recorderMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return undefined;
  }
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
  if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
  if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
  return undefined;
}

function micKey(error: unknown): DictKey {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'transcription.timeline.audio.error.micPermissionDenied';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'transcription.timeline.audio.error.micNotFound';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return 'transcription.timeline.audio.error.micBusy';
  }
  return 'transcription.timeline.audio.error.startFailed';
}

function oralFailure(error: unknown): DictKey {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('oral draft exists')) return 'app.desktopTranscription.oralDraftExists';
  if (message.includes('local whisper is not granted')) {
    return 'app.desktopTranscription.oralWhisperMissing';
  }
  if (message.includes('oral transcription is empty')) {
    return 'app.desktopTranscription.oralTranscribeEmpty';
  }
  return 'app.desktopTranscription.oralTranscribeFailed';
}

/** Record, play, delete, and send one short clip to local Whisper. The text stays a draft. */
export function useDesktopTranscriptionOralController(input: {
  sessionId: string | null;
  desktopCall: DesktopReadHost['desktopCall'] | undefined;
  audioLayerIds: readonly string[];
  refresh: () => Promise<unknown>;
}) {
  const locale = useLocale();
  const toast = useToast();
  const [clips, setClips] = useState<Record<string, string>>({});
  const [recordingKey, setRecordingKey] = useState<string | null>(null);
  const [stamp, setStamp] = useState(0);
  const bag = useRef({
    latest: input,
    recorder: null as MediaRecorder | null,
    arming: false,
    live: true,
    ticket: 0,
  });
  bag.current.latest = input;
  const audioKey = input.audioLayerIds.join('\n');
  const canCall = input.desktopCall !== undefined;

  useEffect(() => {
    const mine = ++bag.current.ticket;
    const current = bag.current.latest;
    let dropped = false;
    const created: string[] = [];
    void (async () => {
      if (current.sessionId === null || current.desktopCall === undefined) return;
      const next: Record<string, string> = {};
      for (const layerId of current.audioLayerIds) {
        const rows = await current.desktopCall(current.sessionId, 'recordings.list', { layerId });
        if (!Array.isArray(rows)) continue;
        for (const row of rows) {
          if (typeof row !== 'object' || row === null) continue;
          const unitId = (row as { unitId?: unknown }).unitId;
          if (typeof unitId !== 'string') continue;
          const read = (await current.desktopCall(current.sessionId, 'recordings.read', {
            unitId,
            layerId,
          })) as { mimeType?: unknown; bytes?: unknown };
          if (!(read.bytes instanceof Uint8Array) || typeof read.mimeType !== 'string') continue;
          const url = URL.createObjectURL(
            new Blob([new Uint8Array(read.bytes)], { type: read.mimeType }),
          );
          created.push(url);
          next[clipKey(layerId, unitId)] = url;
        }
      }
      if (dropped || bag.current.ticket !== mine) {
        for (const url of created) URL.revokeObjectURL(url);
        return;
      }
      setClips(next);
    })();
    return () => {
      dropped = true;
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, [input.sessionId, audioKey, stamp, canCall]);

  useEffect(
    () => () => {
      bag.current.live = false;
      const recorder = bag.current.recorder;
      bag.current.recorder = null;
      if (recorder && recorder.state !== 'inactive') recorder.stop();
    },
    [],
  );

  const fail = () =>
    toast.showToast(t(locale, 'app.desktopTranscription.layerActionFailed'), 'error');

  return {
    busy: recordingKey !== null,
    src: (layerId: string, unitId: string) => clips[clipKey(layerId, unitId)] ?? null,
    isRecording: (layerId: string, unitId: string) => recordingKey === clipKey(layerId, unitId),
    start: async (layerId: string, unitId: string) => {
      if (bag.current.recorder || bag.current.arming) return;
      const mime = recorderMime();
      const current = bag.current.latest;
      if (mime === undefined || current.sessionId === null || current.desktopCall === undefined) {
        toast.showToast(t(locale, 'transcription.timeline.audio.error.startFailed'), 'error');
        return;
      }
      bag.current.arming = true;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!bag.current.live) {
          stream.getTracks().forEach((track) => track.stop());
          bag.current.arming = false;
          return;
        }
        const recorder = new MediaRecorder(stream, { mimeType: mime });
        const chunks: Blob[] = [];
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data);
        };
        recorder.onstop = () => {
          stream.getTracks().forEach((track) => track.stop());
          bag.current.recorder = null;
          bag.current.arming = false;
          setRecordingKey(null);
          if (!bag.current.live) return;
          const blob = new Blob(chunks, { type: recorder.mimeType || mime });
          void blob.arrayBuffer().then(async (buffer) => {
            const call = bag.current.latest;
            if (call.sessionId === null || call.desktopCall === undefined) return;
            try {
              const wav = await clipBytesToWav(new Uint8Array(buffer));
              await call.desktopCall(call.sessionId, 'recordings.attach', {
                unitId,
                layerId,
                mimeType: 'audio/wav',
                bytes: wav,
                operationId: crypto.randomUUID(),
              });
              await call.refresh();
              setStamp((value) => value + 1);
            } catch {
              fail();
            }
          });
        };
        bag.current.recorder = recorder;
        recorder.start();
        setRecordingKey(clipKey(layerId, unitId));
      } catch (error) {
        bag.current.arming = false;
        toast.showToast(t(locale, micKey(error)), 'error');
      }
    },
    stop: () => {
      const recorder = bag.current.recorder;
      if (recorder && recorder.state !== 'inactive') recorder.stop();
    },
    transcribe: async (layerId: string, unitId: string) => {
      const current = bag.current.latest;
      if (current.sessionId === null || current.desktopCall === undefined) return;
      if (bag.current.recorder || bag.current.arming) return;
      const seen = current.sessionId;
      try {
        const call = bag.current.latest;
        if (!bag.current.live || call.sessionId !== seen || call.desktopCall === undefined) return;
        await call.desktopCall(seen, 'recordings.transcribe', { unitId, layerId });
        if (bag.current.latest.sessionId !== seen) return;
        await bag.current.latest.refresh();
        toast.showToast(t(locale, 'app.desktopTranscription.oralDraftReady'), 'info');
      } catch (error) {
        if (!bag.current.live || bag.current.latest.sessionId !== seen) return;
        toast.showToast(t(locale, oralFailure(error)), 'error');
      }
    },
    remove: async (layerId: string, unitId: string) => {
      if (bag.current.recorder) return;
      const current = bag.current.latest;
      if (current.sessionId === null || current.desktopCall === undefined) return;
      try {
        await current.desktopCall(current.sessionId, 'recordings.detach', { unitId, layerId });
        await current.refresh();
        setStamp((value) => value + 1);
      } catch {
        fail();
      }
    },
  };
}
