import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { JieyuIcon } from './ui/JieyuIcon';
import { JIEYU_ICON_WAVE, JIEYU_ICON_WAVE_MD } from '../utils/jieyuIcon';
import type { MediaItemDocType } from '../db/types';
import { t, tf, useLocale } from '../i18n';
import { formatElapsed } from '../pages/oralTake';
import { watchOralAudio } from '../pages/oralPlayback';
import { createLogger } from '../observability/logger';
import { readAudioBlobFromDetails } from '../utils/translationRecordingMediaBlob';

export interface TimelineTranslationAudioControlsProps {
  mediaItem?: MediaItemDocType;
  /** Bytes already published for this card. The control does not revoke this URL. */
  audioSrc?: string | null;
  isRecording?: boolean;
  isArming?: boolean;
  isSaving?: boolean;
  isFailed?: boolean;
  elapsed?: number;
  onRetrySave?: () => void;
  onDiscardSave?: () => void;
  disabled?: boolean;
  compact?: boolean;
  onStartRecording?: () => void;
  onStopRecording?: () => void;
  /** 0..1 live input level while recording. */
  level?: number;
  takePaused?: boolean;
  onDeleteRecording?: () => void;
  /** 混合翻译层：将当前录音转写为文本（由父级按 `layer.modality === 'mixed'` 决定是否传入） */
  onTranscribeRecording?: () => void | Promise<void>;
}

const log = createLogger('TimelineTranslationAudioControls');

function resolveMediaAudioBlob(mediaItem?: MediaItemDocType): Blob | null {
  return readAudioBlobFromDetails(mediaItem?.details);
}

export const TimelineTranslationAudioControls = memo(function TimelineTranslationAudioControls({
  mediaItem,
  audioSrc: givenSrc = null,
  isRecording = false,
  isArming = false,
  isSaving = false,
  isFailed = false,
  elapsed = 0,
  onRetrySave,
  onDiscardSave,
  disabled = false,
  compact = false,
  onStartRecording,
  onStopRecording,
  level = 0,
  takePaused = false,
  onDeleteRecording,
  onTranscribeRecording,
}: TimelineTranslationAudioControlsProps) {
  const locale = useLocale();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [clipSeconds, setClipSeconds] = useState<number | null>(null);
  const ownedSrc = useMemo(() => {
    if (givenSrc) return null;
    if (!mediaItem?.id) {
      return null;
    }
    const trimmedUrl = typeof mediaItem.url === 'string' ? mediaItem.url.trim() : '';
    if (trimmedUrl.length > 0) {
      return trimmedUrl;
    }
    const blob = resolveMediaAudioBlob(mediaItem);
    return blob ? URL.createObjectURL(blob) : null;
  }, [mediaItem, givenSrc]);
  const audioSrc = givenSrc ?? ownedSrc;

  useEffect(
    () => () => {
      if (ownedSrc?.startsWith('blob:')) {
        URL.revokeObjectURL(ownedSrc);
      }
    },
    [ownedSrc],
  );

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

  useEffect(
    () => () => {
      audioRef.current?.pause();
    },
    [],
  );

  useEffect(() => watchOralAudio(audioRef.current), [audioSrc]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioSrc) {
      setClipSeconds(null);
      return;
    }
    const read = () => {
      setClipSeconds(Number.isFinite(audio.duration) ? audio.duration : null);
    };
    read();
    audio.addEventListener('loadedmetadata', read);
    audio.addEventListener('durationchange', read);
    return () => {
      audio.removeEventListener('loadedmetadata', read);
      audio.removeEventListener('durationchange', read);
    };
  }, [audioSrc]);

  useEffect(() => {
    if (isRecording || isArming) audioRef.current?.pause();
  }, [isRecording, isArming]);

  const elapsedRef = useRef(elapsed);
  elapsedRef.current = elapsed;
  const phase = isFailed
    ? 'failed'
    : isSaving
      ? 'saving'
      : isArming
        ? 'arming'
        : isRecording
          ? takePaused
            ? 'paused'
            : 'recording'
          : 'idle';
  useEffect(() => {
    if (phase === 'idle') return;
    const label =
      phase === 'failed'
        ? t(locale, 'transcription.timeline.audio.status.saveFailed')
        : phase === 'saving'
          ? t(locale, 'transcription.timeline.audio.status.saving')
          : phase === 'arming'
            ? t(locale, 'transcription.timeline.audio.starting')
            : phase === 'paused'
              ? t(locale, 'transcription.timeline.audio.status.paused')
              : t(locale, 'transcription.timeline.audio.status.recording');
    const time =
      phase === 'recording' || phase === 'paused'
        ? tf(locale, 'transcription.timeline.audio.elapsed', {
            time: formatElapsed(elapsedRef.current),
          })
        : '';
    setAnnouncement(time === '' ? label : `${label} ${time}`);
  }, [phase, locale]);

  const hasAudio = Boolean(audioSrc);
  const showSaved = hasAudio && !isRecording && !isArming && !isSaving && !isFailed;

  const handleRecordClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (disabled || isSaving || isFailed) return;
    if (isArming || isRecording) {
      onStopRecording?.();
      return;
    }
    void onStartRecording?.();
  };

  const handlePlaybackClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (disabled || isRecording || isArming || isSaving || isFailed || !hasAudio) return;
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      return;
    }

    try {
      const result = audio.play();
      if (result !== undefined && typeof result.then === 'function') {
        await result;
      }
      setIsPlaying(true);
    } catch (e) {
      log.warn('translation audio play failed', { err: e });
      setIsPlaying(false);
    }
  };

  const handleDeleteClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (disabled || isRecording || !hasAudio) return;
    void onDeleteRecording?.();
  };

  const handleTranscribeClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (disabled || isRecording || transcribing || !hasAudio || !onTranscribeRecording) return;
    setTranscribing(true);
    try {
      await Promise.resolve(onTranscribeRecording());
    } catch (e) {
      log.warn('translation audio transcribe failed', { err: e });
    } finally {
      setTranscribing(false);
    }
  };

  return (
    <div
      className={[
        'timeline-translation-audio-controls',
        compact ? 'timeline-translation-audio-controls-compact' : '',
        isRecording ? 'timeline-translation-audio-controls-recording' : '',
        transcribing ? 'timeline-translation-audio-controls-transcribing' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        if (disabled || (event.target instanceof Element && event.target.closest('button'))) return;
        if (isRecording || isArming) onStopRecording?.();
        else if (!hasAudio) onStartRecording?.();
      }}
    >
      <audio ref={audioRef} src={audioSrc ?? undefined} preload="metadata" />
      <button
        type="button"
        className={[
          'timeline-translation-audio-btn',
          'timeline-translation-audio-btn-record',
          isRecording ? 'timeline-translation-audio-btn-recording' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label={
          isArming
            ? t(locale, 'transcription.timeline.audio.starting')
            : isRecording
              ? t(locale, 'transcription.timeline.audio.stopRecording')
              : t(locale, 'transcription.timeline.audio.startRecording')
        }
        title={
          isArming
            ? t(locale, 'transcription.timeline.audio.starting')
            : isRecording
              ? t(locale, 'transcription.timeline.audio.stopRecording')
              : t(locale, 'transcription.timeline.audio.startRecording')
        }
        disabled={disabled}
        onClick={handleRecordClick}
      >
        {isRecording ? (
          <span className="timeline-translation-audio-stop-glyph" aria-hidden="true" />
        ) : (
          <JieyuIcon name="Mic" className={JIEYU_ICON_WAVE} />
        )}
      </button>
      {isArming ? (
        <span className="timeline-translation-audio-status">
          {t(locale, 'transcription.timeline.audio.starting')}
        </span>
      ) : null}
      {isRecording || isSaving || isFailed ? (
        <span className="timeline-translation-audio-status">
          {isFailed
            ? t(locale, 'transcription.timeline.audio.status.saveFailed')
            : isSaving
              ? t(locale, 'transcription.timeline.audio.status.saving')
              : takePaused
                ? t(locale, 'transcription.timeline.audio.status.paused')
                : t(locale, 'transcription.timeline.audio.status.recording')}
          {isRecording ? ` ${formatElapsed(elapsed)}` : ''}
        </span>
      ) : null}
      <span className="timeline-translation-audio-live" role="status" aria-live="polite">
        {announcement}
      </span>
      {isFailed ? (
        <>
          <button
            type="button"
            className="timeline-translation-audio-btn"
            aria-label={t(locale, 'transcription.timeline.audio.retrySave')}
            onClick={(event) => {
              event.stopPropagation();
              onRetrySave?.();
            }}
          >
            {t(locale, 'transcription.timeline.audio.retrySave')}
          </button>
          <button
            type="button"
            className="timeline-translation-audio-btn timeline-translation-audio-btn-delete"
            aria-label={t(locale, 'transcription.timeline.audio.discardTake')}
            onClick={(event) => {
              event.stopPropagation();
              onDiscardSave?.();
            }}
          >
            {t(locale, 'transcription.timeline.audio.discardTake')}
          </button>
        </>
      ) : null}
      {isRecording ? (
        <span
          className="timeline-translation-audio-level"
          role="img"
          aria-label={t(locale, 'transcription.timeline.audio.level')}
        >
          {[0.12, 0.28, 0.5, 0.75].map((step) => (
            <i
              key={step}
              style={{ height: level >= step ? `${Math.round(4 + step * 12)}px` : '2px' }}
            />
          ))}
        </span>
      ) : null}
      {showSaved && clipSeconds !== null ? (
        <span className="timeline-translation-audio-status">{formatElapsed(clipSeconds)}</span>
      ) : null}
      {showSaved ? (
        <button
          type="button"
          className="timeline-translation-audio-btn"
          aria-label={
            isPlaying
              ? t(locale, 'transcription.timeline.audio.pauseRecording')
              : t(locale, 'transcription.timeline.audio.playRecording')
          }
          title={
            isPlaying
              ? t(locale, 'transcription.timeline.audio.pauseRecording')
              : t(locale, 'transcription.timeline.audio.playRecording')
          }
          disabled={disabled || isRecording || isArming || isSaving || isFailed}
          onClick={(event) => {
            void handlePlaybackClick(event);
          }}
        >
          {isPlaying ? (
            <JieyuIcon name="Pause" className={JIEYU_ICON_WAVE_MD} />
          ) : (
            <JieyuIcon name="Play" className={JIEYU_ICON_WAVE_MD} />
          )}
        </button>
      ) : null}
      {showSaved && onTranscribeRecording ? (
        <button
          type="button"
          className={[
            'timeline-translation-audio-btn',
            'timeline-translation-audio-btn-transcribe',
            transcribing ? 'timeline-translation-audio-btn-transcribing' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-label={
            transcribing
              ? t(locale, 'transcription.timeline.audio.transcribing')
              : t(locale, 'transcription.timeline.audio.transcribeRecording')
          }
          title={
            transcribing
              ? t(locale, 'transcription.timeline.audio.transcribing')
              : t(locale, 'transcription.timeline.audio.transcribeRecording')
          }
          disabled={disabled || isRecording || transcribing}
          onClick={(event) => {
            void handleTranscribeClick(event);
          }}
        >
          <JieyuIcon
            name={transcribing ? 'Loader2' : 'Subtitles'}
            className={[
              JIEYU_ICON_WAVE_MD,
              transcribing ? 'timeline-translation-audio-transcribe-spin' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          />
        </button>
      ) : null}
      {showSaved && onDeleteRecording ? (
        <button
          type="button"
          className="timeline-translation-audio-btn timeline-translation-audio-btn-delete"
          aria-label={t(locale, 'transcription.timeline.audio.deleteRecording')}
          title={t(locale, 'transcription.timeline.audio.deleteRecording')}
          disabled={disabled || isRecording}
          onClick={handleDeleteClick}
        >
          <JieyuIcon name="Trash" className={JIEYU_ICON_WAVE_MD} />
        </button>
      ) : null}
      {!compact ? (
        <span className="timeline-translation-audio-status">
          {transcribing
            ? t(locale, 'transcription.timeline.audio.transcribing')
            : isRecording
              ? t(locale, 'transcription.timeline.audio.status.recording')
              : hasAudio
                ? t(locale, 'transcription.timeline.audio.status.recorded')
                : t(locale, 'transcription.timeline.audio.status.empty')}
        </span>
      ) : null}
    </div>
  );
});
