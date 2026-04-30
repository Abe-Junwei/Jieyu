/**
 * WaveformLeftStatusStrip | 波形左侧状态条
 *
 * 显示缩放比例、吸附开关、倍速、当前时间、选段时长和增益滑块
 * Displays zoom%, snap toggle, playback rate, current time, segment duration, and gain slider
 */

import { memo, useEffect, useRef, type FC, type PointerEvent as ReactPointerEvent } from 'react';
import { t, tf, useLocale } from '../../i18n';
import { recordTranscriptionKeyboardAction } from '../../utils/transcriptionKeyboardActionTelemetry';

let lastWaveformAmplitudeTelemetryMs = 0;
const WAVEFORM_AMPLITUDE_TELEMETRY_MS = 320;

function recordWaveformAmplitudeSliderTelemetryThrottled(): void {
  const now = Date.now();
  if (now - lastWaveformAmplitudeTelemetryMs < WAVEFORM_AMPLITUDE_TELEMETRY_MS) return;
  lastWaveformAmplitudeTelemetryMs = now;
  recordTranscriptionKeyboardAction('waveformAmplitudeSliderChange');
}
import {
  getTranscriptionPlaybackClockSnapshot,
  subscribeTranscriptionPlaybackClock,
} from '../../hooks/transcriptionPlaybackClock';
import type { VideoLayoutMode } from './TranscriptionTimelineSections';

const PlaybackClockTimeValue: FC<{ formatTime: (seconds: number) => string }> = memo(function PlaybackClockTimeValue({
  formatTime,
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const paint = () => {
      el.textContent = formatTime(getTranscriptionPlaybackClockSnapshot());
    };
    paint();
    return subscribeTranscriptionPlaybackClock(paint);
  }, [formatTime]);
  return <span ref={ref} className="waveform-left-status-value" aria-live="off" />;
});

export interface WaveformLeftStatusStripProps {
  // 缩放与交互状态 | Zoom and interaction state
  zoomPercent: number;
  snapEnabled: boolean;
  onSnapToggle: () => void;

  // 播放状态 | Playback state
  playbackRate: number;
  /**
   * 显式秒数：走 React 渲染（单测等）。
   * 省略时由 `transcriptionPlaybackClock` + DOM 更新当前时间，避免父级高频重渲染带动本条。
   */
  currentTime?: number;

  // 选段信息 | Selection info
  /** null 表示无选中语段 | null when no unit is selected */
  selectedUnitDuration: number | null;

  // 增益 | Amplitude gain
  amplitudeScale: number;
  onAmplitudeChange: (scale: number) => void;
  onAmplitudeReset: () => void;

  // 视频布局 | Video layout
  selectedMediaIsVideo: boolean;
  videoLayoutMode: VideoLayoutMode;
  onVideoLayoutModeChange: (mode: VideoLayoutMode) => void;

  // 车道标签宽度拖拽 | Lane label width resize
  onLaneLabelWidthResize?: (e: ReactPointerEvent<HTMLDivElement>) => void;

  formatTime: (seconds: number) => string;
}

export const WaveformLeftStatusStrip: FC<WaveformLeftStatusStripProps> = memo(function WaveformLeftStatusStrip({
  zoomPercent,
  snapEnabled,
  onSnapToggle,
  playbackRate,
  currentTime,
  selectedUnitDuration,
  amplitudeScale,
  onAmplitudeChange,
  onAmplitudeReset,
  selectedMediaIsVideo,
  videoLayoutMode,
  onVideoLayoutModeChange,
  onLaneLabelWidthResize,
  formatTime,
}) {
  const locale = useLocale();
  const useClockForCurrentTime = currentTime === undefined;
  return (
    <div className="waveform-left-status-strip">
      <div className="waveform-left-status-item">
        <span className="waveform-left-status-label">{t(locale, 'transcription.statusStrip.zoom')}</span>
        <span className="waveform-left-status-value">{Math.round(zoomPercent)}%</span>
      </div>
      <div className="waveform-left-status-item">
        <span className="waveform-left-status-label">{t(locale, 'transcription.statusStrip.snap')}</span>
        <button
          type="button"
          className={`waveform-left-status-toggle ${snapEnabled ? 'waveform-left-status-toggle-on' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            recordTranscriptionKeyboardAction('timelineZoomSnapToggle');
            onSnapToggle();
          }}
          title={snapEnabled ? t(locale, 'transcription.zoom.snapOn') : t(locale, 'transcription.zoom.snapOff')}
          aria-label={snapEnabled ? t(locale, 'transcription.statusStrip.snapDisable') : t(locale, 'transcription.statusStrip.snapEnable')}
        >
          {snapEnabled ? t(locale, 'transcription.statusStrip.snapOnShort') : t(locale, 'transcription.statusStrip.snapOffShort')}
        </button>
      </div>
      <div className="waveform-left-status-item">
        <span className="waveform-left-status-label">{t(locale, 'transcription.statusStrip.speed')}</span>
        <span className="waveform-left-status-value">{playbackRate.toFixed(2)}x</span>
      </div>
      <div className="waveform-left-status-item">
        <span className="waveform-left-status-label">{t(locale, 'transcription.statusStrip.current')}</span>
        {useClockForCurrentTime
          ? <PlaybackClockTimeValue formatTime={formatTime} />
          : <span className="waveform-left-status-value">{formatTime(currentTime)}</span>}
      </div>
      <div className="waveform-left-status-item">
        <span className="waveform-left-status-label">{t(locale, 'transcription.statusStrip.selection')}</span>
        <span className="waveform-left-status-value">
          {selectedUnitDuration !== null
            ? formatTime(Math.max(0, selectedUnitDuration))
            : '--:--'}
        </span>
      </div>
      <div className="waveform-left-status-item waveform-left-status-item-gain">
        <span className="waveform-left-status-label">{t(locale, 'transcription.statusStrip.gain')}</span>
        <input
          type="range"
          className="waveform-gain-slider"
          min={0.25}
          max={4}
          step={0.05}
          value={amplitudeScale}
          onChange={(e) => {
            recordWaveformAmplitudeSliderTelemetryThrottled();
            onAmplitudeChange(Number(e.target.value));
          }}
          title={tf(locale, 'transcription.statusStrip.gainValue', { value: amplitudeScale.toFixed(1) })}
          aria-label={tf(locale, 'transcription.statusStrip.gainValue', { value: amplitudeScale.toFixed(1) })}
        />
        <button
          type="button"
          className="waveform-left-status-value waveform-gain-reset"
          onClick={(ev) => {
            ev.stopPropagation();
            recordTranscriptionKeyboardAction('waveformAmplitudeReset');
            onAmplitudeReset();
          }}
          title={t(locale, 'transcription.statusStrip.gainReset')}
        >{amplitudeScale.toFixed(1)}x</button>
      </div>
      {selectedMediaIsVideo && (
        <div className="waveform-left-status-item waveform-left-status-item-layout">
          <span className="waveform-left-status-label">{t(locale, 'transcription.statusStrip.layout')}</span>
          <div className="waveform-layout-toggle" role="group" aria-label={t(locale, 'transcription.statusStrip.videoLayoutMode')}>
            <button
              type="button"
              className={`waveform-layout-toggle-btn ${videoLayoutMode === 'top' ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                recordTranscriptionKeyboardAction('timelineVideoLayoutModeTop');
                onVideoLayoutModeChange('top');
              }}
              title={t(locale, 'transcription.statusStrip.layoutTopTitle')}
            >
              {t(locale, 'transcription.statusStrip.layoutTopShort')}
            </button>
            <button
              type="button"
              className={`waveform-layout-toggle-btn ${videoLayoutMode === 'right' ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                recordTranscriptionKeyboardAction('timelineVideoLayoutModeRight');
                onVideoLayoutModeChange('right');
              }}
              title={t(locale, 'transcription.statusStrip.layoutRightTitle')}
            >
              {t(locale, 'transcription.statusStrip.layoutRightShort')}
            </button>
            <button
              type="button"
              className={`waveform-layout-toggle-btn ${videoLayoutMode === 'left' ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                recordTranscriptionKeyboardAction('timelineVideoLayoutModeLeft');
                onVideoLayoutModeChange('left');
              }}
              title={t(locale, 'transcription.statusStrip.layoutLeftTitle')}
            >
              {t(locale, 'transcription.statusStrip.layoutLeftShort')}
            </button>
          </div>
        </div>
      )}
      {onLaneLabelWidthResize && (
        <div
          className="lane-label-resize-handle"
          onPointerDown={(event) => {
            recordTranscriptionKeyboardAction('timelineLaneLabelResizeStart');
            onLaneLabelWidthResize?.(event);
          }}
          role="separator"
          aria-orientation="vertical"
          aria-label={t(locale, 'transcription.statusStrip.resizeLaneLabel')}
        />
      )}
    </div>
  );
});
