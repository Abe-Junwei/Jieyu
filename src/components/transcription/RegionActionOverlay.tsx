/**
 * RegionActionOverlay | 语段操作悬浮层
 *
 * 在选中语段上方叠加速度滑块、循环按钮和播放/停止按钮
 * Overlays speed slider, loop toggle, and play/stop button above the selected region
 */

import type { FC } from 'react';
import { Play, Repeat, Square } from 'lucide-react';
import { detectLocale, t, tf } from '../../i18n';

export interface RegionActionOverlayProps {
  // 语段几何坐标（秒） | Region geometry (seconds)
  utteranceStartTime: number;
  utteranceEndTime: number;

  // 缩放与滚动 | Zoom and scroll
  zoomPxPerSec: number;
  scrollLeft: number;
  waveAreaWidth: number;

  // 播放状态 | Playback state
  isPlaying: boolean;
  segmentPlaybackRate: number;
  segmentLoopPlayback: boolean;

  // 回调（父组件负责 player 交互） | Callbacks (parent owns player interaction)
  onPlaybackRateChange: (rate: number) => void;
  onToggleLoop: () => void;
  onTogglePlay: () => void;
}

export const RegionActionOverlay: FC<RegionActionOverlayProps> = ({
  utteranceStartTime,
  utteranceEndTime,
  zoomPxPerSec,
  scrollLeft,
  waveAreaWidth,
  isPlaying,
  segmentPlaybackRate,
  segmentLoopPlayback,
  onPlaybackRateChange,
  onToggleLoop,
  onTogglePlay,
}) => {
  const leftPx = utteranceStartTime * zoomPxPerSec - scrollLeft;
  const widthPx = (utteranceEndTime - utteranceStartTime) * zoomPxPerSec;

  // 区域滚出视野时不渲染 | Don't render when region is out of view
  if (leftPx + widthPx < 0 || leftPx > waveAreaWidth) return null;

  const showSpeedSlider = widthPx >= 160;
  const showLoopBtn = widthPx >= 72;
  const locale = detectLocale();

  return (
    <div
      className="region-action-overlay"
      style={{ left: Math.max(0, leftPx) }}
    >
      {showSpeedSlider && (
        <div className="segment-speed-control" onPointerDown={(e) => e.stopPropagation()}>
          <input
            type="range"
            className="segment-speed-slider"
            min={0.25}
            max={2}
            step={0.05}
            value={segmentPlaybackRate}
            onChange={(e) => onPlaybackRateChange(Number(e.target.value))}
            title={tf(locale, 'transcription.wave.segmentSpeed', { rate: segmentPlaybackRate.toFixed(2) })}
          />
          <span
            className={`segment-speed-label${segmentPlaybackRate !== 1 ? ' segment-speed-label-reset' : ''}`}
            title={segmentPlaybackRate !== 1 ? t(locale, 'transcription.wave.segmentSpeedReset') : t(locale, 'transcription.wave.segmentSpeedNormal')}
            onClick={() => onPlaybackRateChange(1)}
          >{segmentPlaybackRate === 1 ? '1x' : `${segmentPlaybackRate.toFixed(segmentPlaybackRate % 0.25 === 0 ? 1 : 2)}x`}</span>
        </div>
      )}
      {showLoopBtn && (
        <button
          className={`region-action-btn ${segmentLoopPlayback ? 'region-action-btn-active' : ''}`}
          title={segmentLoopPlayback ? t(locale, 'transcription.wave.loopOn') : t(locale, 'transcription.wave.loopOff')}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onToggleLoop(); }}
        >
          <Repeat size={13} />
        </button>
      )}
      <button
        className="region-action-btn"
        title={isPlaying ? t(locale, 'transcription.wave.stop') : t(locale, 'transcription.wave.play')}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onTogglePlay(); }}
      >
        {isPlaying ? <Square size={13} /> : <Play size={13} />}
      </button>
    </div>
  );
};
