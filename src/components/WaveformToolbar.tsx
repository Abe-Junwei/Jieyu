import { Children, memo, useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { MaterialSymbol } from './ui/MaterialSymbol';
import { t, tf, useLocale } from '../i18n';
import { JIEYU_MATERIAL_WAVE, JIEYU_MATERIAL_WAVE_MD, JIEYU_MATERIAL_WAVE_PLAY, JIEYU_MATERIAL_WAVE_TRIGGER } from '../utils/jieyuMaterialIcon';
import type { AcousticOverlayMode } from '../utils/acousticOverlayTypes';
import { WAVEFORM_DISPLAY_MODE_OPTIONS, type WaveformDisplayMode } from '../utils/waveformDisplayMode';
import { WAVEFORM_VISUAL_STYLE_OPTIONS, type WaveformVisualStyle } from '../utils/waveformVisualStyle';
import { recordTranscriptionKeyboardAction } from '../utils/transcriptionKeyboardActionTelemetry';

interface WaveformToolbarProps {
  filename: string;
  isReady: boolean;
  isPlaying: boolean;
  playbackRate: number;
  onPlaybackRateChange: (rate: number) => void;
  waveformDisplayMode: WaveformDisplayMode;
  onWaveformDisplayModeChange: (mode: WaveformDisplayMode) => void;
  waveformVisualStyle: WaveformVisualStyle;
  onWaveformVisualStyleChange: (style: WaveformVisualStyle) => void;
  acousticOverlayMode: AcousticOverlayMode;
  onAcousticOverlayModeChange: (mode: AcousticOverlayMode) => void;
  volume: number;
  onVolumeChange: (vol: number) => void;
  loop: boolean;
  onLoopChange: (loop: boolean) => void;
  onTogglePlayback: () => void;
  onSeek: (delta: number) => void;
  canDeleteAudio?: boolean;
  onDeleteCurrentAudio?: () => void;
  onAutoSegment?: () => void;
  autoSegmentBusy?: boolean;
  autoSegmentRunTitle?: string;
  autoSegmentRunningTitle?: string;
  /** 主控件行尾部（轨道/聚焦、Observer 等）| Trailing cluster on the main toolbar row */
  leftToolbarExtras?: ReactNode;
  children?: ReactNode;
}

export const WaveformToolbar = memo(function WaveformToolbar({
  filename,
  isReady,
  isPlaying,
  playbackRate,
  onPlaybackRateChange,
  waveformDisplayMode,
  onWaveformDisplayModeChange,
  waveformVisualStyle,
  onWaveformVisualStyleChange,
  acousticOverlayMode,
  onAcousticOverlayModeChange,
  volume,
  onVolumeChange,
  loop,
  onLoopChange,
  onTogglePlayback,
  onSeek,
  canDeleteAudio,
  onDeleteCurrentAudio,
  onAutoSegment,
  autoSegmentBusy,
  autoSegmentRunTitle,
  autoSegmentRunningTitle,
  leftToolbarExtras,
  children,
}: WaveformToolbarProps) {
  const locale = useLocale();
  const hasRightControls = Children.toArray(children).length > 0;
  const [viewOptionsOpen, setViewOptionsOpen] = useState(false);
  const viewOptionsAnchorRef = useRef<HTMLDivElement | null>(null);
  const viewOptionsPanelId = useId();
  const viewOptionsDialogTitleId = useId();
  const viewOptionsCanvasLabelId = useId();
  const viewOptionsOverlayLabelId = useId();
  const viewOptionsStyleLabelId = useId();

  const acousticF0On = acousticOverlayMode === 'f0' || acousticOverlayMode === 'both';
  const acousticIntensityOn = acousticOverlayMode === 'intensity' || acousticOverlayMode === 'both';

  const setAcousticFromToggles = useCallback(
    (nextF0: boolean, nextIntensity: boolean) => {
      if (nextF0 && nextIntensity) onAcousticOverlayModeChange('both');
      else if (nextF0) onAcousticOverlayModeChange('f0');
      else if (nextIntensity) onAcousticOverlayModeChange('intensity');
      else onAcousticOverlayModeChange('none');
    },
    [onAcousticOverlayModeChange],
  );

  const closeViewOptions = useCallback(() => setViewOptionsOpen(false), []);

  useEffect(() => {
    if (!viewOptionsOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeViewOptions();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [viewOptionsOpen, closeViewOptions]);

  useEffect(() => {
    if (!viewOptionsOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const root = viewOptionsAnchorRef.current;
      if (!root || root.contains(event.target as Node)) return;
      closeViewOptions();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [viewOptionsOpen, closeViewOptions]);

  return (
    <div className={`transcription-wave-toolbar transcription-wave-toolbar-shell${hasRightControls ? ' transcription-wave-toolbar-shell-has-right-controls' : ''}`}>
      <div className="transcription-wave-toolbar-left">
        <div className="transcription-wave-toolbar-meta">
          <div className="transcription-file-brand">
            <strong>{filename}</strong>
          </div>
        </div>
        <button className="icon-btn" onClick={() => onSeek(-10)} title={t(locale, 'transcription.wave.toolbar.rewind10')} aria-label={t(locale, 'transcription.wave.toolbar.rewind10')}>
          <MaterialSymbol name="replay_10" aria-hidden className={JIEYU_MATERIAL_WAVE} />
        </button>
        <button
          className="transcription-wave-toolbar-play-btn"
          onClick={onTogglePlayback}
          disabled={!isReady}
          aria-label={isPlaying ? t(locale, 'transcription.wave.toolbar.pause') : t(locale, 'transcription.wave.toolbar.play')}
          title={isPlaying ? t(locale, 'transcription.wave.toolbar.pause') : t(locale, 'transcription.wave.toolbar.play')}
        >
          {isPlaying ? <MaterialSymbol name="pause" aria-hidden className={JIEYU_MATERIAL_WAVE_PLAY} /> : <MaterialSymbol name="play_arrow" aria-hidden className={JIEYU_MATERIAL_WAVE_PLAY} />}
        </button>
        <button className="icon-btn" onClick={() => onSeek(10)} title={t(locale, 'transcription.wave.toolbar.forward10')} aria-label={t(locale, 'transcription.wave.toolbar.forward10')}>
          <MaterialSymbol name="forward_10" aria-hidden className={JIEYU_MATERIAL_WAVE} />
        </button>
        <select
          className="speed-select"
          value={String(playbackRate)}
          onChange={(event) => onPlaybackRateChange(Number(event.target.value))}
          aria-label={tf(locale, 'transcription.wave.segmentSpeed', { rate: playbackRate })}
        >
          <option value="0.5">0.5x</option>
          <option value="0.75">0.75x</option>
          <option value="1">1.0x</option>
          <option value="1.25">1.25x</option>
          <option value="1.5">1.5x</option>
          <option value="2">2.0x</option>
        </select>
        <button
          className={`icon-btn ${loop ? 'icon-btn-active' : ''}`}
          onClick={() => onLoopChange(!loop)}
          title={loop ? t(locale, 'transcription.wave.toolbar.globalLoopOff') : t(locale, 'transcription.wave.toolbar.globalLoopOn')}
          aria-label={loop ? t(locale, 'transcription.wave.toolbar.globalLoopOff') : t(locale, 'transcription.wave.toolbar.globalLoopOn')}
        >
          <MaterialSymbol name="repeat" aria-hidden className={JIEYU_MATERIAL_WAVE_MD} />
        </button>
        <div className="waveform-view-options-anchor" ref={viewOptionsAnchorRef}>
          <button
            type="button"
            className="icon-btn waveform-view-options-trigger"
            aria-expanded={viewOptionsOpen}
            aria-controls={viewOptionsPanelId}
            aria-haspopup="dialog"
            aria-label={t(locale, 'transcription.wave.toolbar.viewOptions.triggerAria')}
            title={t(locale, 'transcription.wave.toolbar.viewOptions.triggerAria')}
            onClick={() => {
              recordTranscriptionKeyboardAction('toolbarViewOptionsToggle');
              setViewOptionsOpen((open) => !open);
            }}
          >
            <MaterialSymbol name="tune" aria-hidden className={JIEYU_MATERIAL_WAVE_TRIGGER} />
          </button>
          <div
            id={viewOptionsPanelId}
            role="dialog"
            aria-modal="false"
            aria-labelledby={viewOptionsDialogTitleId}
            className="waveform-view-options-panel"
            hidden={!viewOptionsOpen}
          >
            <h2 id={viewOptionsDialogTitleId} className="waveform-view-options-dialog-title">
              {t(locale, 'transcription.wave.toolbar.viewOptions.dialogTitle')}
            </h2>
            <div className="waveform-view-options-section">
              <div className="waveform-view-options-section-row">
                <div id={viewOptionsCanvasLabelId} className="waveform-view-options-section-label">
                  {t(locale, 'transcription.wave.toolbar.viewOptions.sectionCanvas')}
                </div>
                <div className="waveform-view-options-section-controls">
                  <div
                    className="transcription-ai-mode-switch waveform-view-options-ai-switch waveform-view-options-ai-switch--canvas"
                    role="radiogroup"
                    aria-labelledby={viewOptionsCanvasLabelId}
                  >
                    {WAVEFORM_DISPLAY_MODE_OPTIONS.map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        className={`transcription-ai-mode-btn${waveformDisplayMode === mode ? ' is-active' : ''}`}
                        role="radio"
                        aria-checked={waveformDisplayMode === mode}
                        onClick={() => onWaveformDisplayModeChange(mode)}
                      >
                        {t(locale, `transcription.wave.toolbar.displayMode.${mode}` as const)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="waveform-view-options-section">
              <div className="waveform-view-options-section-row">
                <div id={viewOptionsStyleLabelId} className="waveform-view-options-section-label">
                  {t(locale, 'transcription.wave.toolbar.visualStyle')}
                </div>
                <div className="waveform-view-options-section-controls">
                  <div
                    className="transcription-ai-mode-switch waveform-view-options-ai-switch waveform-view-options-ai-switch--styles"
                    role="radiogroup"
                    aria-labelledby={viewOptionsStyleLabelId}
                    aria-disabled={waveformDisplayMode === 'spectrogram'}
                  >
                    {WAVEFORM_VISUAL_STYLE_OPTIONS.map((style) => (
                      <button
                        key={style}
                        type="button"
                        className={`transcription-ai-mode-btn${waveformVisualStyle === style ? ' is-active' : ''}`}
                        role="radio"
                        aria-checked={waveformVisualStyle === style}
                        disabled={waveformDisplayMode === 'spectrogram'}
                        onClick={() => onWaveformVisualStyleChange(style)}
                      >
                        {t(locale, `transcription.wave.toolbar.visualStyle.${style}` as const)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {waveformDisplayMode === 'spectrogram' ? (
                <p className="waveform-view-options-hint" role="note">
                  {t(locale, 'transcription.wave.toolbar.viewOptions.waveformDrawHint')}
                </p>
              ) : null}
            </div>
            <div className="waveform-view-options-section">
              <div className="waveform-view-options-section-row">
                <div id={viewOptionsOverlayLabelId} className="waveform-view-options-section-label">
                  {t(locale, 'transcription.wave.toolbar.acousticOverlay')}
                </div>
                <div className="waveform-view-options-section-controls">
                  <div className="waveform-view-options-acoustic-actions" role="group" aria-labelledby={viewOptionsOverlayLabelId}>
                    <button
                      type="button"
                      className={`transcription-ai-mode-btn waveform-view-options-acoustic-toggle${acousticF0On ? ' is-active' : ''}`}
                      aria-pressed={acousticF0On}
                      title={t(locale, 'transcription.wave.toolbar.acousticOverlay.toggleF0Title')}
                      onClick={() => setAcousticFromToggles(!acousticF0On, acousticIntensityOn)}
                    >
                      {t(locale, 'transcription.wave.acoustic.f0')}
                    </button>
                    <button
                      type="button"
                      className={`transcription-ai-mode-btn waveform-view-options-acoustic-toggle${acousticIntensityOn ? ' is-active' : ''}`}
                      aria-pressed={acousticIntensityOn}
                      title={t(locale, 'transcription.wave.toolbar.acousticOverlay.toggleIntensityTitle')}
                      onClick={() => setAcousticFromToggles(acousticF0On, !acousticIntensityOn)}
                    >
                      {t(locale, 'transcription.wave.acoustic.intensity')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <label className="player-control volume-control compact-volume transcription-wave-toolbar-volume">
          <MaterialSymbol name="volume_up" aria-hidden className={JIEYU_MATERIAL_WAVE_MD} />
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(event) => onVolumeChange(Number(event.target.value))}
            aria-label={tf(locale, 'transcription.voiceWidget.signal.volume', { percent: Math.round(volume * 100) })}
          />
        </label>
        {(onAutoSegment || onDeleteCurrentAudio) && (
          <>
            <span className="transcription-toolbar-sep transcription-wave-toolbar-vad-sep" aria-hidden="true" />
            {onAutoSegment && (
              <button
                className="icon-btn transcription-wave-toolbar-vad-btn"
                onClick={onAutoSegment}
                disabled={autoSegmentBusy}
                title={autoSegmentBusy ? autoSegmentRunningTitle : autoSegmentRunTitle}
                aria-label={autoSegmentBusy ? autoSegmentRunningTitle : autoSegmentRunTitle}
              >
                <MaterialSymbol name="content_cut" aria-hidden className={JIEYU_MATERIAL_WAVE_MD} />
              </button>
            )}
            {onDeleteCurrentAudio && (
              <button
                className="icon-btn icon-btn-danger transcription-wave-toolbar-delete-audio-btn"
                onClick={onDeleteCurrentAudio}
                disabled={!canDeleteAudio}
                title={t(locale, 'transcription.toolbar.deleteCurrentAudio')}
                aria-label={t(locale, 'transcription.toolbar.deleteCurrentAudio')}
              >
                <MaterialSymbol name="delete" aria-hidden className={JIEYU_MATERIAL_WAVE_MD} />
              </button>
            )}
          </>
        )}
        {leftToolbarExtras}
      </div>
      {hasRightControls ? (
        <div className="transcription-wave-toolbar-right transcription-wave-toolbar-right-portaled">
          {children}
        </div>
      ) : null}
    </div>
  );
});
