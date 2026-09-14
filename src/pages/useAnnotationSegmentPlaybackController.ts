import { useCallback, useEffect, useRef, useState } from 'react';
import { LinguisticService } from '../app/languageAssetPageAccess';
import type { MediaItemDocType } from '../types/jieyuDbDocTypes';
import type { AnnotationIgtRow } from './annotation/annotationIgtRows';
import {
  annotationPlaybackSourceKey,
  pickAnnotationPlaybackMedia,
  resolveAnnotationMediaSrc,
  resolveAnnotationPlaybackRange,
  shouldStopAnnotationPlayback,
  toggleAnnotationRangePlayback,
  type AnnotationPlaybackOutcome,
} from './annotation/playAnnotationUnitRange';

export type AnnotationPlaybackController = {
  playingUnitId: string | null;
  lastOutcome: AnnotationPlaybackOutcome | 'idle';
  onPlayToggle: (unitId: string, rows: readonly AnnotationIgtRow[]) => Promise<void>;
};

export function useAnnotationSegmentPlaybackController(
  textId: string,
): AnnotationPlaybackController {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const loadedKeyRef = useRef('');
  const rangeEndRef = useRef<number | null>(null);
  const [playingUnitId, setPlayingUnitId] = useState<string | null>(null);
  const [lastOutcome, setLastOutcome] = useState<AnnotationPlaybackOutcome | 'idle'>('idle');

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    const onTimeUpdate = () => {
      const endSec = rangeEndRef.current;
      if (endSec == null) return;
      if (shouldStopAnnotationPlayback(audio.currentTime, endSec)) {
        audio.pause();
        rangeEndRef.current = null;
        setPlayingUnitId(null);
      }
    };
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', () => {
      rangeEndRef.current = null;
      setPlayingUnitId(null);
    });
    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', onTimeUpdate);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      audioRef.current = null;
    };
  }, []);

  const ensureSource = useCallback(
    async (preferredMediaId: string) => {
      const audio = audioRef.current;
      if (!audio || textId.length === 0) return false;
      const hintedMediaId = preferredMediaId.trim();
      const loadedKey = loadedKeyRef.current;
      if (audio.src.length > 0 && loadedKey.startsWith(`${textId}:`)) {
        const loadedMediaId = loadedKey.slice(textId.length + 1);
        if (hintedMediaId.length === 0 || hintedMediaId === loadedMediaId) return true;
      }
      const items: MediaItemDocType[] = await LinguisticService.media.listByTextId(textId);
      const preferred = pickAnnotationPlaybackMedia(items, hintedMediaId);
      if (!preferred?.id) return false;
      const cacheKey = annotationPlaybackSourceKey(textId, preferred.id);
      if (loadedKeyRef.current === cacheKey && audio.src.length > 0) return true;
      const resolved = resolveAnnotationMediaSrc(preferred);
      if (!resolved) return false;
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = resolved.objectUrl;
      audio.src = resolved.src;
      loadedKeyRef.current = cacheKey;
      return true;
    },
    [textId],
  );

  const onPlayToggle = useCallback(
    async (unitId: string, rows: readonly AnnotationIgtRow[]) => {
      const row = rows.find((item) => item.id === unitId);
      const range = row ? resolveAnnotationPlaybackRange(row) : null;
      const audio = audioRef.current;
      if (!row || !range || !audio) {
        setLastOutcome('skipped');
        return;
      }
      const ready = await ensureSource(range.mediaId);
      if (!ready) {
        setLastOutcome('skipped');
        return;
      }
      const outcome = await toggleAnnotationRangePlayback({
        audio,
        range,
        playingUnitId,
      });
      if (outcome === 'played') {
        rangeEndRef.current = range.endSec;
        setPlayingUnitId(unitId);
      } else {
        rangeEndRef.current = null;
        setPlayingUnitId(null);
      }
      setLastOutcome(outcome);
    },
    [ensureSource, playingUnitId],
  );

  return { playingUnitId, lastOutcome, onPlayToggle };
}
