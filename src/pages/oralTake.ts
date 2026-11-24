import type { DesktopReadHost } from '../desktop/projectReadHost';
import type { DictKey } from '../i18n';
import { clipBytesToWav } from './oralClipWav';
import { watchLevel } from './oralLevel';

export type OralCall = NonNullable<DesktopReadHost['desktopCall']>;

export type OralPinned = {
  sessionId: string;
  call: OralCall;
  unitId: string;
  layerId: string;
  key: string;
  refresh: () => Promise<unknown>;
};

export function clipKey(layerId: string, unitId: string): string {
  return `${layerId}\n${unitId}`;
}

export function recorderMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return undefined;
  }
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
  if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
  if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
  return undefined;
}

export function micKey(error: unknown): DictKey {
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

export function oralFailure(error: unknown): DictKey {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('oral draft exists')) return 'app.desktopTranscription.oralDraftExists';
  if (message.includes('speaker time overlaps'))
    return 'app.desktopTranscription.oralSpeakerOverlap';
  if (message.includes('transcription host overwrite')) {
    return 'app.desktopTranscription.oralTargetHost';
  }
  if (message.includes('transcription target is longer')) {
    return 'app.desktopTranscription.oralTargetLonger';
  }
  if (message.includes('transcription target needs a segment')) {
    return 'app.desktopTranscription.oralTargetCreate';
  }
  if (message.includes('local whisper is not granted')) {
    return 'app.desktopTranscription.oralWhisperMissing';
  }
  if (message.includes('oral transcription is empty')) {
    return 'app.desktopTranscription.oralTranscribeEmpty';
  }
  if (message.includes('oral text changed')) return 'app.desktopTranscription.oralTextChanged';
  if (message.includes('oral source changed')) return 'app.desktopTranscription.oralSourceChanged';
  return 'app.desktopTranscription.oralTranscribeFailed';
}

export function formatElapsed(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export type ParkedTake = { id: number; operationId: string; pinned: OralPinned; bytes: Uint8Array };

let parked: ParkedTake | null = null;
let nextTake = 1;
let savesInFlight = 0;
const failedWatchers = new Set<(take: ParkedTake | null) => void>();

/** One hold per in-flight save, including a save whose controller already unmounted. */
export function holdTakeSave(): () => void {
  savesInFlight += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    savesInFlight -= 1;
  };
}

export function takeSaveHeld(): boolean {
  return savesInFlight > 0;
}

export function nextTakeId(): number {
  nextTake += 1;
  return nextTake;
}

function publishFailedTake(): void {
  for (const watcher of failedWatchers) watcher(parked);
}

/** A failed take whose card already unmounted. Mounted controllers hear it immediately. */
export function parkFailedTake(take: ParkedTake): void {
  parked = take;
  publishFailedTake();
}

export function peekFailedTake(): ParkedTake | null {
  return parked;
}

export function watchFailedTake(watcher: (take: ParkedTake | null) => void): () => void {
  failedWatchers.add(watcher);
  return () => {
    failedWatchers.delete(watcher);
  };
}

/** Drop one parked take. A different id leaves the parked take in place. */
export function dropFailedTake(id?: number): void {
  if (parked === null) return;
  if (id !== undefined && parked.id !== id) return;
  parked = null;
  publishFailedTake();
}

export type OralTake = { id: string | null; url: string };

export async function loadOralClips(
  sessionId: string,
  call: OralCall,
  layerIds: readonly string[],
): Promise<{ takes: Record<string, OralTake[]>; broken: string[]; urls: string[] }> {
  const takes: Record<string, OralTake[]> = {};
  const broken: string[] = [];
  const urls: string[] = [];
  for (const layerId of layerIds) {
    let rows: unknown;
    try {
      rows = await call(sessionId, 'recordings.list', { layerId });
    } catch {
      broken.push(layerId);
      continue;
    }
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (typeof row !== 'object' || row === null) continue;
      const unitId = (row as { unitId?: unknown }).unitId;
      const audioId = (row as { id?: unknown }).id;
      if (typeof unitId !== 'string') continue;
      const id = typeof audioId === 'string' ? audioId : null;
      try {
        const read = (await call(
          sessionId,
          'recordings.read',
          id === null ? { unitId, layerId } : { unitId, layerId, audioId: id },
        )) as { mimeType?: unknown; bytes?: unknown };
        if (!(read.bytes instanceof Uint8Array) || typeof read.mimeType !== 'string') {
          broken.push(unitId);
          continue;
        }
        const url = URL.createObjectURL(
          new Blob([new Uint8Array(read.bytes)], { type: read.mimeType }),
        );
        urls.push(url);
        const key = clipKey(layerId, unitId);
        takes[key] = [...(takes[key] ?? []), { id, url }];
      } catch {
        broken.push(unitId);
      }
    }
  }
  return { takes, broken, urls };
}

export function openOralRecorder(options: {
  stream: MediaStream;
  mime: string;
  current: () => boolean;
  discard: () => boolean;
  onLevel: (value: number) => void;
  onStopping?: () => void;
  onEnded: (bytes: Uint8Array, fault: boolean) => void;
}): { recorder: MediaRecorder; stopMeter: () => void } {
  const recorder = new MediaRecorder(options.stream, { mimeType: options.mime });
  const chunks: Blob[] = [];
  let fault = false;
  let requestedStop = false;
  const nativeStop = recorder.stop.bind(recorder);
  recorder.stop = () => {
    requestedStop = true;
    if (recorder.state !== 'inactive') nativeStop();
  };
  const interrupt = () => {
    if (requestedStop || fault) return;
    fault = true;
    if (recorder.state !== 'inactive') nativeStop();
  };
  if (typeof options.stream.getAudioTracks === 'function') {
    for (const track of options.stream.getAudioTracks()) track.addEventListener('ended', interrupt);
  }
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.onerror = () => {
    fault = true;
  };
  recorder.onstop = () => {
    options.stream.getTracks().forEach((track) => track.stop());
    if (!options.current()) return;
    if (options.discard()) {
      options.onEnded(new Uint8Array(), false);
      return;
    }
    options.onStopping?.();
    void new Blob(chunks, { type: recorder.mimeType || options.mime })
      .arrayBuffer()
      .then((buffer) => {
        if (!options.current()) return;
        options.onEnded(new Uint8Array(buffer), fault);
      });
  };
  const stopMeter = watchLevel(options.stream, options.onLevel);
  recorder.start(200);
  return { recorder, stopMeter };
}

/** Attach the pinned take. A refresh failure is not a failed write. */
export async function persistTake(
  pinned: OralPinned,
  bytes: Uint8Array,
  operationId: string,
): Promise<{ status: 'saved' | 'refresh'; audioId: string | null }> {
  const wav = await clipBytesToWav(bytes);
  const stored = (await pinned.call(pinned.sessionId, 'recordings.attach', {
    unitId: pinned.unitId,
    layerId: pinned.layerId,
    mimeType: 'audio/wav',
    bytes: wav,
    operationId,
  })) as { audioId?: string };
  const audioId = typeof stored.audioId === 'string' ? stored.audioId : null;
  try {
    await pinned.refresh();
    return { status: 'saved', audioId };
  } catch {
    return { status: 'refresh', audioId };
  }
}

export function releaseClipUrls(takes: Record<string, readonly { url: string }[]>): void {
  for (const list of Object.values(takes)) {
    for (const take of list) URL.revokeObjectURL(take.url);
  }
}
