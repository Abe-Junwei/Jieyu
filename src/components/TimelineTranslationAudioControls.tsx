import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconTipButton } from './ui/IconTip';
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
  onPauseRecording?: () => void;
  onResumeRecording?: () => void;
  /** 0..1 live input level while recording. */
  level?: number;
  takePaused?: boolean;
  onDeleteRecording?: () => void;
  /** 混合翻译层：将当前录音转写为文本（由父级按 `layer.modality === 'mixed'` 决定是否传入） */
  onTranscribeRecording?: () => void | Promise<void>;
  /** A saved clip hides the microphone. Recording and arming still show the stop button. */
  showRecord?: boolean;
  /** Desktop oral row: play, record, playlist, transcribe, delete. Status sits beside `leading`. */
  clipRow?: boolean;
  /** 1-based index of the clip currently shown. Hidden when there is only one. */
  clipCount?: number;
  clipNumber?: number;
  /** Five clips already: keep「再录一条」visible and disabled. */
  recordCapped?: boolean;
  clips?: readonly { id: string | null }[];
  onPickClip?: (id: string) => void;
  /** Whole seconds, once metadata has loaded. */
  wholeSeconds?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
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
  onPauseRecording,
  onResumeRecording,
  level = 0,
  takePaused = false,
  onDeleteRecording,
  onTranscribeRecording,
  showRecord = true,
  clipRow = false,
  clipCount = 0,
  clipNumber = 0,
  recordCapped = false,
  clips = [],
  onPickClip,
  wholeSeconds = false,
  leading = null,
  trailing = null,
}: TimelineTranslationAudioControlsProps) {
  const locale = useLocale();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const moreRef = useRef<HTMLButtonElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSeconds, setPlaySeconds] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [clipSeconds, setClipSeconds] = useState<number | null>(null);
  const [menuAt, setMenuAt] = useState<{ top: number; left: number } | null>(null);
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

    const syncPlaying = () => setIsPlaying(!audio.paused && !audio.ended);
    syncPlaying();
    const handleTime = () => setPlaySeconds(audio.currentTime || 0);

    audio.addEventListener('pause', syncPlaying);
    audio.addEventListener('play', syncPlaying);
    audio.addEventListener('ended', syncPlaying);
    audio.addEventListener('timeupdate', handleTime);
    return () => {
      audio.removeEventListener('pause', syncPlaying);
      audio.removeEventListener('play', syncPlaying);
      audio.removeEventListener('ended', syncPlaying);
      audio.removeEventListener('timeupdate', handleTime);
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
    if (menuAt === null) return;
    const menu = document.getElementById('oral-clip-more-menu');
    menu?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuAt(null);
      moreRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuAt]);

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
  const recordLabel =
    isRecording || (clipRow && isArming)
      ? t(locale, 'transcription.timeline.audio.stopRecording')
      : isArming
        ? t(locale, 'transcription.timeline.audio.starting')
        : clipRow && hasAudio
          ? t(locale, 'transcription.timeline.audio.recordAnother')
          : t(locale, 'transcription.timeline.audio.startRecording');
  const capReason = t(locale, 'app.desktopTranscription.clipCap');
  const recordHeld = recordCapped && !isRecording && !isArming;

  const handleRecordClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (disabled || isSaving || isFailed) return;
    if (isArming || isRecording) {
      onStopRecording?.();
      return;
    }
    if (recordHeld) return;
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
      setIsPlaying(!audio.paused && !audio.ended);
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

  const recordButton = showRecord ? (
    <IconTipButton
      className={[
        'timeline-translation-audio-btn',
        'timeline-translation-audio-btn-record',
        isRecording ? 'timeline-translation-audio-btn-recording' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      label={recordHeld ? capReason : recordLabel}
      disabled={disabled || recordHeld}
      onClick={handleRecordClick}
    >
      {isRecording || (clipRow && isArming) ? (
        <span className="timeline-translation-audio-stop-glyph" aria-hidden="true" />
      ) : (
        <JieyuIcon name="Mic" className={JIEYU_ICON_WAVE} />
      )}
    </IconTipButton>
  ) : null;
  const pauseButton =
    isRecording && onPauseRecording && onResumeRecording ? (
      <IconTipButton
        className="timeline-translation-audio-btn"
        label={t(
          locale,
          takePaused
            ? 'transcription.timeline.audio.resumeRecording'
            : 'transcription.timeline.audio.pauseTake',
        )}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          if (takePaused) onResumeRecording?.();
          else onPauseRecording?.();
        }}
      >
        <JieyuIcon name={takePaused ? 'Play' : 'Pause'} className={JIEYU_ICON_WAVE_MD} />
      </IconTipButton>
    ) : null;
  const armingStatus = isArming ? (
    <span className="timeline-translation-audio-status">
      {t(locale, 'transcription.timeline.audio.starting')}
    </span>
  ) : null;
  const phaseStatus =
    isRecording || isSaving || isFailed ? (
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
    ) : null;
  const liveStatus = (
    <span className="timeline-translation-audio-live" role="status" aria-live="polite">
      {announcement}
    </span>
  );
  const failedActions = isFailed ? (
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
  ) : null;
  const levelMeter = isRecording ? (
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
  ) : null;
  const duration =
    showSaved && clipSeconds !== null && !clipRow ? (
      <span className="timeline-translation-audio-status">
        {wholeSeconds
          ? tf(locale, 'app.desktopTranscription.mergeSeconds', {
              seconds: String(Math.round(clipSeconds)),
            })
          : formatElapsed(clipSeconds)}
      </span>
    ) : null;
  const playLabel = isPlaying
    ? t(locale, 'transcription.timeline.audio.pauseRecording')
    : t(locale, 'transcription.timeline.audio.playRecording');
  const playButton = showSaved ? (
    <IconTipButton
      className="timeline-translation-audio-btn"
      label={playLabel}
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
    </IconTipButton>
  ) : null;
  const transcribeLabel = transcribing
    ? t(locale, 'transcription.timeline.audio.transcribing')
    : t(locale, 'transcription.timeline.audio.transcribeRecording');
  const transcribeButton =
    showSaved && onTranscribeRecording ? (
      <IconTipButton
        className={[
          'timeline-translation-audio-btn',
          'timeline-translation-audio-btn-transcribe',
          transcribing ? 'timeline-translation-audio-btn-transcribing' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        label={transcribeLabel}
        disabled={disabled || isRecording || transcribing}
        onClick={(event) => {
          void handleTranscribeClick(event);
        }}
      >
        <JieyuIcon
          name={transcribing ? 'LoaderCircle' : 'Captions'}
          className={[
            JIEYU_ICON_WAVE_MD,
            transcribing ? 'timeline-translation-audio-transcribe-spin' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        />
      </IconTipButton>
    ) : null;
  const deleteButton =
    showSaved && onDeleteRecording ? (
      <IconTipButton
        className="timeline-translation-audio-btn timeline-translation-audio-btn-delete"
        label={t(locale, 'transcription.timeline.audio.deleteRecording')}
        disabled={disabled || isRecording}
        onClick={handleDeleteClick}
      >
        <JieyuIcon name="Trash" className={JIEYU_ICON_WAVE_MD} />
      </IconTipButton>
    ) : null;
  const recordedLabel = !compact ? (
    <span className="timeline-translation-audio-status">
      {transcribing
        ? t(locale, 'transcription.timeline.audio.transcribing')
        : isRecording
          ? t(locale, 'transcription.timeline.audio.status.recording')
          : hasAudio
            ? t(locale, 'transcription.timeline.audio.status.recorded')
            : t(locale, 'transcription.timeline.audio.status.empty')}
    </span>
  ) : null;
  const indexed = clipRow && showSaved && clipCount >= 2 && clipNumber >= 1;
  const unknownTime = t(locale, 'app.desktopTranscription.clipTimeUnknown');
  const totalText =
    clipRow && (isRecording || isArming)
      ? formatElapsed(elapsed)
      : clipRow && showSaved
        ? clipSeconds === null
          ? unknownTime
          : wholeSeconds
            ? tf(locale, 'app.desktopTranscription.mergeSeconds', {
                seconds: String(Math.round(clipSeconds)),
              })
            : formatElapsed(clipSeconds)
        : null;
  const progressText =
    showSaved && isPlaying && clipSeconds !== null && totalText !== null
      ? `${formatElapsed(playSeconds)} / ${formatElapsed(clipSeconds)}`
      : null;
  const timeNode =
    totalText === null ? null : (
      <span className="timeline-translation-audio-status oral-clip-time">
        {isPlaying && clipSeconds !== null && !wholeSeconds
          ? formatElapsed(playSeconds)
          : totalText}
      </span>
    );
  const closeMenu = () => {
    setMenuAt(null);
    moreRef.current?.focus();
  };
  const moreButton =
    clipRow && showSaved ? (
      <IconTipButton
        ref={moreRef}
        className="timeline-translation-audio-btn oral-clip-more"
        label={t(locale, 'app.desktopTranscription.clipMore')}
        aria-expanded={menuAt !== null}
        aria-haspopup="menu"
        onClick={(event) => {
          event.stopPropagation();
          const rect = moreRef.current?.getBoundingClientRect();
          setMenuAt(menuAt === null && rect ? { top: rect.bottom + 4, left: rect.left } : null);
        }}
      >
        <JieyuIcon name="MoreVertical" className={JIEYU_ICON_WAVE_MD} />
      </IconTipButton>
    ) : null;
  const moreMenu =
    menuAt === null
      ? null
      : createPortal(
          <>
            <button
              type="button"
              className="desktop-tx-menu-backdrop"
              aria-label={t(locale, 'app.desktopTranscription.cancel')}
              onClick={closeMenu}
            />
            <div
              id="oral-clip-more-menu"
              className="desktop-tx-menu desktop-tx-menu-fixed"
              style={{ top: menuAt.top, left: menuAt.left }}
              role="menu"
            >
              {progressText !== null || totalText !== null ? (
                <p className="desktop-tx-playlist__title">{progressText ?? totalText}</p>
              ) : null}
              {clips.map((clip, item) =>
                clip.id === null || clips.length < 2 ? null : (
                  <button
                    key={clip.id}
                    type="button"
                    role="menuitem"
                    className={item + 1 === clipNumber ? 'is-on' : undefined}
                    onClick={() => {
                      if (clip.id === null) return;
                      onPickClip?.(clip.id);
                      closeMenu();
                    }}
                  >
                    {tf(locale, 'app.desktopTranscription.clipIndex', { index: String(item + 1) })}
                  </button>
                ),
              )}
              {showRecord && !isRecording && !isArming ? (
                <button
                  type="button"
                  role="menuitem"
                  disabled={recordHeld}
                  onClick={(event) => {
                    handleRecordClick(event);
                    if (!recordHeld) closeMenu();
                  }}
                >
                  {recordLabel}
                </button>
              ) : null}
              {recordHeld ? <p className="desktop-tx-playlist__title">{capReason}</p> : null}
              {transcribeButton === null ? null : (
                <button
                  type="button"
                  role="menuitem"
                  disabled={disabled || transcribing}
                  onClick={(event) => {
                    void handleTranscribeClick(event);
                    closeMenu();
                  }}
                >
                  {transcribeLabel}
                </button>
              )}
              {deleteButton === null ? null : <div className="desktop-tx-menu__rule" />}
              {deleteButton === null ? null : (
                <button
                  type="button"
                  role="menuitem"
                  className="is-danger"
                  onClick={(event) => {
                    handleDeleteClick(event);
                    closeMenu();
                  }}
                >
                  {t(locale, 'transcription.timeline.audio.deleteRecording')}
                </button>
              )}
            </div>
          </>,
          document.body,
        );
  const row = clipRow ? (
    <>
      <div className="oral-clip-bar">
        {indexed || leading || armingStatus || isSaving || timeNode ? (
          <span className="oral-clip-copy">
            {indexed ? (
              <>
                <span className="timeline-translation-audio-status oral-clip-index oral-clip-index-long">
                  {tf(locale, 'app.desktopTranscription.clipIndex', { index: String(clipNumber) })}
                  {' ·'}
                </span>
                <span className="timeline-translation-audio-status oral-clip-index oral-clip-index-short">
                  {tf(locale, 'app.desktopTranscription.clipShort', {
                    index: String(clipNumber),
                    count: String(clipCount),
                  })}
                  {' ·'}
                </span>
              </>
            ) : (
              leading
            )}
            {armingStatus}
            {isSaving ? phaseStatus : null}
            {timeNode}
          </span>
        ) : null}
        <span className="oral-clip-actions">
          {playButton}
          {recordButton ? (
            <span className={showSaved ? 'oral-clip-record' : undefined}>{recordButton}</span>
          ) : null}
          {pauseButton}
          {levelMeter}
          {trailing ? <span className="oral-clip-list">{trailing}</span> : null}
          {transcribeButton ? (
            <span className="oral-clip-transcribe">{transcribeButton}</span>
          ) : null}
          {deleteButton ? <span className="oral-clip-delete">{deleteButton}</span> : null}
          {failedActions ? <span className="oral-clip-failed">{failedActions}</span> : null}
          {moreButton}
        </span>
      </div>
      <button
        type="button"
        className="oral-clip-mark"
        aria-label={totalText ?? t(locale, 'transcription.timeline.audio.startRecording')}
        onClick={(event) => event.stopPropagation()}
      />
      {moreMenu}
      {liveStatus}
      {recordedLabel}
    </>
  ) : (
    <>
      {recordButton}
      {pauseButton}
      {armingStatus}
      {phaseStatus}
      {liveStatus}
      {failedActions}
      {levelMeter}
      {leading}
      {duration}
      {playButton}
      {transcribeButton}
      {deleteButton}
      {trailing}
      {recordedLabel}
    </>
  );

  return (
    <div
      className={[
        'timeline-translation-audio-controls',
        compact ? 'timeline-translation-audio-controls-compact' : '',
        clipRow ? 'timeline-translation-audio-controls-clip' : '',
        isRecording ? 'timeline-translation-audio-controls-recording' : '',
        isArming ? 'timeline-translation-audio-controls-arming' : '',
        isFailed ? 'timeline-translation-audio-controls-failed' : '',
        transcribing ? 'timeline-translation-audio-controls-transcribing' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        if (disabled || (event.target instanceof Element && event.target.closest('button'))) return;
        if (isRecording || isArming) onStopRecording?.();
        else if (!hasAudio && showRecord) onStartRecording?.();
      }}
    >
      <audio ref={audioRef} src={audioSrc ?? undefined} preload="metadata" />
      {row}
    </div>
  );
});
