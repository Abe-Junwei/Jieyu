import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { MaterialSymbol } from './ui/MaterialSymbol';
import { JIEYU_MATERIAL_WAVE, JIEYU_MATERIAL_WAVE_MD } from '../utils/jieyuMaterialIcon';
import type { MediaItemDocType } from '../db';
import { t, useLocale } from '../i18n';

export interface TimelineTranslationAudioControlsProps {
  mediaItem?: MediaItemDocType;
  isRecording?: boolean;
  disabled?: boolean;
  compact?: boolean;
  onStartRecording?: () => void;
  onStopRecording?: () => void;
  onDeleteRecording?: () => void;
}

function resolveMediaAudioBlob(mediaItem?: MediaItemDocType): Blob | null {
  if (!mediaItem?.details || typeof mediaItem.details !== 'object') {
    return null;
  }
  const candidate = (mediaItem.details as { audioBlob?: unknown }).audioBlob;
  return candidate instanceof Blob ? candidate : null;
}

/** Stable key so we do not recreate `blob:` URLs on every parent re-render (Safari: WebKitBlobResource error 1). */
function buildTranslationAudioMaterializationKey(mediaItem?: MediaItemDocType): string {
  if (!mediaItem?.id) {
    return '∅';
  }
  const trimmedUrl = typeof mediaItem.url === 'string' ? mediaItem.url.trim() : '';
  if (trimmedUrl.length > 0) {
    return `url:${mediaItem.id}:${trimmedUrl}`;
  }
  const blob = resolveMediaAudioBlob(mediaItem);
  if (blob) {
    return `blob:${mediaItem.id}:${blob.size}:${blob.type}`;
  }
  return `empty:${mediaItem.id}`;
}

export const TimelineTranslationAudioControls = memo(function TimelineTranslationAudioControls({
  mediaItem,
  isRecording = false,
  disabled = false,
  compact = false,
  onStartRecording,
  onStopRecording,
  onDeleteRecording,
}: TimelineTranslationAudioControlsProps) {
  const locale = useLocale();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const materializationKey = buildTranslationAudioMaterializationKey(mediaItem);
  const audioSrc = useMemo(() => {
    if (!mediaItem?.id) {
      return null;
    }
    const trimmedUrl = typeof mediaItem.url === 'string' ? mediaItem.url.trim() : '';
    if (trimmedUrl.length > 0) {
      return trimmedUrl;
    }
    const blob = resolveMediaAudioBlob(mediaItem);
    return blob ? URL.createObjectURL(blob) : null;
  }, [materializationKey]);

  useEffect(() => () => {
    if (audioSrc?.startsWith('blob:')) {
      URL.revokeObjectURL(audioSrc);
    }
  }, [audioSrc]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;

    const handlePause = () => setIsPlaying(false);
    const handlePlay = () => setIsPlaying(true);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('pause', handlePause);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('ended', handleEnded);
    return () => {
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [audioSrc]);

  useEffect(() => () => {
    audioRef.current?.pause();
  }, []);

  const hasAudio = Boolean(audioSrc);

  const handleRecordClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (disabled) return;
    if (isRecording) {
      onStopRecording?.();
      return;
    }
    void onStartRecording?.();
  };

  const handlePlaybackClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (disabled || !hasAudio) return;
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      return;
    }

    try {
      const result = audio.play();
      if (result && typeof result.then === 'function') {
        await result;
      }
      setIsPlaying(true);
    } catch (e) {
      console.warn('Translation audio play failed', e);
      setIsPlaying(false);
    }
  };

  const handleDeleteClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (disabled || isRecording || !hasAudio) return;
    void onDeleteRecording?.();
  };

  return (
    <div
      className={[
        'timeline-translation-audio-controls',
        compact ? 'timeline-translation-audio-controls-compact' : '',
        isRecording ? 'timeline-translation-audio-controls-recording' : '',
      ].filter(Boolean).join(' ')}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <audio ref={audioRef} src={audioSrc ?? undefined} preload="none" />
      <button
        type="button"
        className={[
          'timeline-translation-audio-btn',
          'timeline-translation-audio-btn-record',
          isRecording ? 'timeline-translation-audio-btn-recording' : '',
        ].filter(Boolean).join(' ')}
        aria-label={isRecording ? t(locale, 'transcription.timeline.audio.stopRecording') : t(locale, 'transcription.timeline.audio.startRecording')}
        title={isRecording ? t(locale, 'transcription.timeline.audio.stopRecording') : t(locale, 'transcription.timeline.audio.startRecording')}
        disabled={disabled}
        onClick={handleRecordClick}
      >
        {isRecording ? <span className="timeline-translation-audio-stop-glyph" aria-hidden="true" /> : <MaterialSymbol name="mic" className={JIEYU_MATERIAL_WAVE} />}
      </button>
      {hasAudio ? (
        <button
          type="button"
          className="timeline-translation-audio-btn"
          aria-label={isPlaying ? t(locale, 'transcription.timeline.audio.pauseRecording') : t(locale, 'transcription.timeline.audio.playRecording')}
          title={isPlaying ? t(locale, 'transcription.timeline.audio.pauseRecording') : t(locale, 'transcription.timeline.audio.playRecording')}
          disabled={disabled}
          onClick={(event) => {
            void handlePlaybackClick(event);
          }}
        >
          {isPlaying ? <MaterialSymbol name="pause" className={JIEYU_MATERIAL_WAVE_MD} /> : <MaterialSymbol name="play_arrow" className={JIEYU_MATERIAL_WAVE_MD} />}
        </button>
      ) : null}
      {hasAudio && onDeleteRecording ? (
        <button
          type="button"
          className="timeline-translation-audio-btn timeline-translation-audio-btn-delete"
          aria-label={t(locale, 'transcription.timeline.audio.deleteRecording')}
          title={t(locale, 'transcription.timeline.audio.deleteRecording')}
          disabled={disabled || isRecording}
          onClick={handleDeleteClick}
        >
          <MaterialSymbol name="delete" className={JIEYU_MATERIAL_WAVE_MD} />
        </button>
      ) : null}
      {!compact ? (
        <span className="timeline-translation-audio-status">
          {isRecording
            ? t(locale, 'transcription.timeline.audio.status.recording')
            : hasAudio
              ? t(locale, 'transcription.timeline.audio.status.recorded')
              : t(locale, 'transcription.timeline.audio.status.empty')}
        </span>
      ) : null}
    </div>
  );
});