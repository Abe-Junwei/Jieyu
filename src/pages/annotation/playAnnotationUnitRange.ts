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

export type AnnotationPlaybackMediaCandidate = {
  id?: string;
  url?: string;
  details?: unknown;
};

export function annotationPlaybackSourceKey(textId: string, mediaItemId: string): string {
  return `${textId}:${mediaItemId}`;
}

export function annotationMediaHasPlayableSrc(item: AnnotationPlaybackMediaCandidate): boolean {
  const trimmedUrl = typeof item.url === 'string' ? item.url.trim() : '';
  if (trimmedUrl.length > 0) return true;
  return readAudioBlobFromDetails(item.details) != null;
}

export function pickAnnotationPlaybackMedia<T extends AnnotationPlaybackMediaCandidate>(
  items: readonly T[],
  preferredMediaId: string,
): T | undefined {
  const trimmed = preferredMediaId.trim();
  if (trimmed.length > 0) {
    const exact = items.find((item) => item.id === trimmed);
    if (exact) return exact;
  }
  return items.find((item) => annotationMediaHasPlayableSrc(item)) ?? items[0];
}

export function resolveAnnotationMediaSrc(
  item: AnnotationPlaybackMediaCandidate,
): { src: string; objectUrl: string | null } | null {
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
