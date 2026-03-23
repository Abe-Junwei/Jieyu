/**
 * WaveformLeftStatusStrip | 波形左侧状态条
 *
 * 显示缩放比例、吸附开关、倍速、当前时间、选段时长和增益滑块
 * Displays zoom%, snap toggle, playback rate, current time, segment duration, and gain slider
 */

import type { FC } from 'react';
import { detectLocale, t } from '../../i18n';
import type { VideoLayoutMode } from './TranscriptionTimelineSections';

export interface WaveformLeftStatusStripProps {
  // 缩放与交互状态 | Zoom and interaction state
  zoomPercent: number;
  snapEnabled: boolean;
  onSnapToggle: () => void;

  // 播放状态 | Playback state
  playbackRate: number;
  currentTime: number;

  // 选段信息 | Selection info
  /** null 表示无选中语段 | null when no utterance is selected */
  selectedUtteranceDuration: number | null;

  // 增益 | Amplitude gain
  amplitudeScale: number;
  onAmplitudeChange: (scale: number) => void;
  onAmplitudeReset: () => void;

  // 视频布局 | Video layout
  selectedMediaIsVideo: boolean;
  videoLayoutMode: VideoLayoutMode;
  onVideoLayoutModeChange: (mode: VideoLayoutMode) => void;

  formatTime: (seconds: number) => string;
}

export const WaveformLeftStatusStrip: FC<WaveformLeftStatusStripProps> = ({
  zoomPercent,
  snapEnabled,
  onSnapToggle,
  playbackRate,
  currentTime,
  selectedUtteranceDuration,
  amplitudeScale,
  onAmplitudeChange,
  onAmplitudeReset,
  selectedMediaIsVideo,
  videoLayoutMode,
  onVideoLayoutModeChange,
  formatTime,
}) => {
  const locale = detectLocale();
  return (
    <div className="waveform-left-status-strip">
      <div className="waveform-left-status-item">
        <span className="waveform-left-status-label">缩放</span>
        <span className="waveform-left-status-value">{Math.round(zoomPercent)}%</span>
      </div>
      <div className="waveform-left-status-item">
        <span className="waveform-left-status-label">吸附</span>
        <button
          type="button"
          className={`waveform-left-status-toggle ${snapEnabled ? 'waveform-left-status-toggle-on' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onSnapToggle();
          }}
          title={snapEnabled ? t(locale, 'transcription.zoom.snapOn') : t(locale, 'transcription.zoom.snapOff')}
          aria-label={snapEnabled ? '关闭吸附' : '开启吸附'}
        >
          {snapEnabled ? '开' : '关'}
        </button>
      </div>
      <div className="waveform-left-status-item">
        <span className="waveform-left-status-label">倍速</span>
        <span className="waveform-left-status-value">{playbackRate.toFixed(2)}x</span>
      </div>
      <div className="waveform-left-status-item">
        <span className="waveform-left-status-label">当前</span>
        <span className="waveform-left-status-value">{formatTime(currentTime)}</span>
      </div>
      <div className="waveform-left-status-item">
        <span className="waveform-left-status-label">选段</span>
        <span className="waveform-left-status-value">
          {selectedUtteranceDuration !== null
            ? formatTime(Math.max(0, selectedUtteranceDuration))
            : '--:--'}
        </span>
      </div>
      <div className="waveform-left-status-item waveform-left-status-item-gain">
        <span className="waveform-left-status-label">增益</span>
        <input
          type="range"
          className="waveform-gain-slider"
          min={0.25}
          max={4}
          step={0.05}
          value={amplitudeScale}
          onChange={(e) => onAmplitudeChange(Number(e.target.value))}
          title={`波形增益 ${amplitudeScale.toFixed(1)}x`}
          aria-label={`波形增益 ${amplitudeScale.toFixed(1)}x`}
        />
        <button
          type="button"
          className="waveform-left-status-value waveform-gain-reset"
          onClick={(ev) => { ev.stopPropagation(); onAmplitudeReset(); }}
          title="重置增益为 1x"
        >{amplitudeScale.toFixed(1)}x</button>
      </div>
      {selectedMediaIsVideo && (
        <div className="waveform-left-status-item waveform-left-status-item-layout">
          <span className="waveform-left-status-label">布局</span>
          <div className="waveform-layout-toggle" role="group" aria-label="视频布局模式">
            <button
              type="button"
              className={`waveform-layout-toggle-btn ${videoLayoutMode === 'top' ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onVideoLayoutModeChange('top');
              }}
              title="上视频下波形"
            >
              上
            </button>
            <button
              type="button"
              className={`waveform-layout-toggle-btn ${videoLayoutMode === 'right' ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onVideoLayoutModeChange('right');
              }}
              title="右侧视频面板"
            >
              右
            </button>
            <button
              type="button"
              className={`waveform-layout-toggle-btn ${videoLayoutMode === 'left' ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onVideoLayoutModeChange('left');
              }}
              title="左侧视频面板"
            >
              左
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
