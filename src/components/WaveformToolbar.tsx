import { Children, memo, type ReactNode } from 'react';
import { FastForward, Pause, Play, Repeat, Rewind, Trash2, Volume2, Zap } from 'lucide-react';
import { t, tf, useLocale } from '../i18n';
import { WAVEFORM_DISPLAY_MODE_OPTIONS, type WaveformDisplayMode } from '../utils/waveformDisplayMode';
import { WAVEFORM_VISUAL_STYLE_OPTIONS, type WaveformVisualStyle } from '../utils/waveformVisualStyle';

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
  children,
}: WaveformToolbarProps) {
  const locale = useLocale();
  const hasRightControls = Children.toArray(children).length > 0;

  return (
    <div className="transcription-wave-toolbar">
      <div className="transcription-wave-toolbar-left">
        <div className="transcription-wave-toolbar-meta">
          <div className="transcription-file-brand">
            <strong>{filename}</strong>
          </div>
        </div>
        <button className="icon-btn" onClick={() => onSeek(-10)} title={t(locale, 'transcription.wave.toolbar.rewind10')} aria-label={t(locale, 'transcription.wave.toolbar.rewind10')}>
          <Rewind size={16} />
        </button>
        <button
          className="play-btn"
          onClick={onTogglePlayback}
          disabled={!isReady}
          aria-label={isPlaying ? t(locale, 'transcription.wave.toolbar.pause') : t(locale, 'transcription.wave.toolbar.play')}
          title={isPlaying ? t(locale, 'transcription.wave.toolbar.pause') : t(locale, 'transcription.wave.toolbar.play')}
        >
          {isPlaying ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button className="icon-btn" onClick={() => onSeek(10)} title={t(locale, 'transcription.wave.toolbar.forward10')} aria-label={t(locale, 'transcription.wave.toolbar.forward10')}>
          <FastForward size={16} />
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
        <select
          className="speed-select transcription-wave-toolbar-mode-select"
          value={waveformDisplayMode}
          onChange={(event) => onWaveformDisplayModeChange(event.target.value as WaveformDisplayMode)}
          aria-label={t(locale, 'transcription.wave.toolbar.displayMode')}
          title={t(locale, 'transcription.wave.toolbar.displayMode')}
        >
          {WAVEFORM_DISPLAY_MODE_OPTIONS.map((mode) => (
            <option key={mode} value={mode}>
              {t(locale, `transcription.wave.toolbar.displayMode.${mode}` as const)}
            </option>
          ))}
        </select>
        <select
          className="speed-select transcription-wave-toolbar-style-select"
          value={waveformVisualStyle}
          onChange={(event) => onWaveformVisualStyleChange(event.target.value as WaveformVisualStyle)}
          aria-label={t(locale, 'transcription.wave.toolbar.visualStyle')}
          title={t(locale, 'transcription.wave.toolbar.visualStyle')}
          disabled={waveformDisplayMode === 'spectrogram'}
        >
          {WAVEFORM_VISUAL_STYLE_OPTIONS.map((style) => (
            <option key={style} value={style}>
              {t(locale, `transcription.wave.toolbar.visualStyle.${style}` as const)}
            </option>
          ))}
        </select>
        <button
          className={`icon-btn ${loop ? 'icon-btn-active' : ''}`}
          onClick={() => onLoopChange(!loop)}
          title={loop ? t(locale, 'transcription.wave.toolbar.globalLoopOff') : t(locale, 'transcription.wave.toolbar.globalLoopOn')}
          aria-label={loop ? t(locale, 'transcription.wave.toolbar.globalLoopOff') : t(locale, 'transcription.wave.toolbar.globalLoopOn')}
        >
          <Repeat size={15} />
        </button>
        <label className="player-control volume-control compact-volume transcription-wave-toolbar-volume">
          <Volume2 size={15} />
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
                <Zap size={15} />
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
                <Trash2 size={15} />
              </button>
            )}
          </>
        )}
      </div>
      {hasRightControls ? (
        <div className="transcription-wave-toolbar-right">
          {children}
        </div>
      ) : null}
    </div>
  );
});
