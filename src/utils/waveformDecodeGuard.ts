export const WAVEFORM_DECODE_MAX_BYTES = 100 * 1024 * 1024;
export const WAVEFORM_DECODE_MAX_DURATION_SEC = 3 * 60 * 60;

const ATTEMPT_STORAGE_KEY = 'jieyu:waveform-decode-attempt';

export type WaveformDecodeBlockReason = 'too-long' | 'crashed';

export type WaveformDecodeBlock = {
  mediaId: string;
  reason: WaveformDecodeBlockReason;
};

export function isWaveformMediaTooLong(input: {
  byteSize?: number;
  durationSec?: number;
}): boolean {
  if (typeof input.byteSize === 'number' && input.byteSize > WAVEFORM_DECODE_MAX_BYTES) return true;
  if (
    typeof input.durationSec === 'number' &&
    Number.isFinite(input.durationSec) &&
    input.durationSec > WAVEFORM_DECODE_MAX_DURATION_SEC
  ) {
    return true;
  }
  return false;
}

let attemptMediaId = '';

function readWaveformDecodeAttempt(): string {
  if (attemptMediaId.length > 0) return attemptMediaId;
  try {
    attemptMediaId = localStorage.getItem(ATTEMPT_STORAGE_KEY)?.trim() ?? '';
  } catch {
    attemptMediaId = '';
  }
  return attemptMediaId;
}

export function markWaveformDecodeAttempt(mediaId: string): void {
  const id = mediaId.trim();
  if (id.length === 0) return;
  attemptMediaId = id;
  try {
    localStorage.setItem(ATTEMPT_STORAGE_KEY, id);
  } catch {
    // Private mode can reject storage. The in-memory id still skips this session.
  }
}

export function clearWaveformDecodeAttempt(mediaId: string): void {
  const id = mediaId.trim();
  if (id.length === 0) return;
  if (forcedMediaId === id) forcedMediaId = '';
  if (attemptMediaId === id) attemptMediaId = '';
  try {
    if (localStorage.getItem(ATTEMPT_STORAGE_KEY)?.trim() === id) {
      localStorage.removeItem(ATTEMPT_STORAGE_KEY);
    }
  } catch {
    // Ignore storage failures; the ready player already proved this media can load.
  }
}

export function waveformDecodeBlockReason(input: {
  mediaId: string;
  byteSize?: number;
  durationSec?: number;
  force?: boolean;
}): WaveformDecodeBlockReason | null {
  const mediaId = input.mediaId.trim();
  if (mediaId.length === 0) return null;
  if (input.force !== true && readWaveformDecodeAttempt() === mediaId) return 'crashed';
  if (input.force === true) return null;
  if (isWaveformMediaTooLong(input)) return 'too-long';
  return null;
}

let block: WaveformDecodeBlock | null = null;
let forcedMediaId = '';
let revision = 0;
const listeners = new Set<() => void>();

function emitWaveformDecodeGuard(): void {
  revision += 1;
  for (const listener of listeners) listener();
}

export function getWaveformDecodeGuardRevision(): number {
  return revision;
}

export function publishWaveformDecodeBlock(next: WaveformDecodeBlock | null): void {
  if (block?.mediaId === next?.mediaId && block?.reason === next?.reason) return;
  block = next;
  emitWaveformDecodeGuard();
}

export function getWaveformDecodeBlock(): WaveformDecodeBlock | null {
  return block;
}

export function subscribeWaveformDecodeGuard(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function requestWaveformDecodeRetry(mediaId: string): void {
  const id = mediaId.trim();
  if (id.length === 0) return;
  clearWaveformDecodeAttempt(id);
  forcedMediaId = id;
  emitWaveformDecodeGuard();
}

export function isWaveformDecodeForced(mediaId: string): boolean {
  return forcedMediaId.length > 0 && forcedMediaId === mediaId.trim();
}
