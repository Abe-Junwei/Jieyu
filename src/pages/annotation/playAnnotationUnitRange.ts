import { readAudioBlobFromDetails } from '../../utils/translationRecordingMediaBlob';

export type AnnotationPlaybackRange = {
  unitId: string;
  startSec: number;
  endSec: number;
  mediaId: string;
};

export type AnnotationPlaybackOutcome = 'played' | 'paused' | 'skipped';

export type AnnotationAudioControls = {
  paused: boolean;
  currentTime: number;
  src: string;
  play: () => Promise<void> | void;
  pause: () => void;
};

export function resolveAnnotationPlaybackRange(row: {
  id: string;
  startTime?: number;
  endTime?: number;
  mediaId?: string;
}): AnnotationPlaybackRange | null {
  if (typeof row.startTime !== 'number' || typeof row.endTime !== 'number') return null;
  if (!(row.endTime > row.startTime)) return null;
  return {
    unitId: row.id,
    startSec: row.startTime,
    endSec: row.endTime,
    mediaId: (row.mediaId ?? '').trim(),
  };
}

export function shouldStopAnnotationPlayback(currentTime: number, endSec: number): boolean {
  return currentTime >= endSec - 0.02;
}

export function resolveAnnotationMediaSrc(item: {
  id?: string;
  url?: string;
  details?: unknown;
}): { src: string; objectUrl: string | null } | null {
  const trimmedUrl = typeof item.url === 'string' ? item.url.trim() : '';
  if (trimmedUrl.length > 0) return { src: trimmedUrl, objectUrl: null };
  const blob = readAudioBlobFromDetails(item.details);
  if (!blob || typeof URL.createObjectURL !== 'function') return null;
  const objectUrl = URL.createObjectURL(blob);
  return { src: objectUrl, objectUrl };
}

export async function toggleAnnotationRangePlayback(input: {
  audio: AnnotationAudioControls;
  range: AnnotationPlaybackRange;
  playingUnitId: string | null;
}): Promise<AnnotationPlaybackOutcome> {
  const { audio, range, playingUnitId } = input;
  if (audio.src.length === 0) return 'skipped';
  if (playingUnitId === range.unitId && !audio.paused) {
    audio.pause();
    return 'paused';
  }
  audio.currentTime = range.startSec;
  await audio.play();
  return 'played';
}
