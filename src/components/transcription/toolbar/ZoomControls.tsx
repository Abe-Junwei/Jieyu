/**
 * ZoomControls | 缩放控制组件
 *
 * 包装波形缩放按钮、ZC 快捷对齐、AS 自动滚动、缩放滑块和百分比显示
 * Wraps zoom buttons, ZC snap toggle, AS auto-scroll, zoom slider, and percentage display
 */

import { type FC, useCallback } from 'react';
import { Maximize2, Focus } from 'lucide-react';
import { detectLocale, t, tf } from '../../../i18n';

export interface ZoomControlsProps {
  // 状态 | State
  zoomPercent: number;
  snapEnabled: boolean;
  autoScrollEnabled: boolean;
  hoverExpandEnabled: boolean;
  selectedUtteranceId: string | null;
  utterancesOnCurrentMedia: Array<{ id: string; startTime: number; endTime: number }>;
  fitPxPerSec: number;
  maxZoomPercent: number;

  // 回调 | Callbacks
  onZoomToPercent: (percent: number, mode: 'fit-all' | 'fit-selection' | 'custom') => void;
  onZoomToUtterance: (startTime: number, endTime: number) => void;
  onSnapEnabledChange: (enabled: boolean) => void;
  onAutoScrollEnabledChange: (enabled: boolean) => void;
  onHoverExpandEnabledChange: (enabled: boolean) => void;
}

const ZoomControls: FC<ZoomControlsProps> = ({
  zoomPercent,
  snapEnabled,
  autoScrollEnabled,
  hoverExpandEnabled,
  selectedUtteranceId,
  utterancesOnCurrentMedia,
  fitPxPerSec,
  maxZoomPercent,
  onZoomToPercent,
  onZoomToUtterance,
  onSnapEnabledChange,
  onAutoScrollEnabledChange,
  onHoverExpandEnabledChange,
}) => {
  const locale = detectLocale();

  const handleFitAll = useCallback(() => {
    onZoomToPercent(100, 'fit-all');
  }, [onZoomToPercent]);

  const handleFitSelection = useCallback(() => {
    const sel = utterancesOnCurrentMedia.find((u) => u.id === selectedUtteranceId);
    if (sel) {
      onZoomToUtterance(sel.startTime, sel.endTime);
    }
  }, [selectedUtteranceId, utterancesOnCurrentMedia, onZoomToUtterance]);

  const handleOneToOne = useCallback(() => {
    onZoomToPercent(Math.round((100 / fitPxPerSec) * 100), 'custom');
  }, [fitPxPerSec, onZoomToPercent]);

  const handleSnapToggle = useCallback(() => {
    onSnapEnabledChange(!snapEnabled);
  }, [snapEnabled, onSnapEnabledChange]);

  const handleAutoScrollToggle = useCallback(() => {
    onAutoScrollEnabledChange(!autoScrollEnabled);
  }, [autoScrollEnabled, onAutoScrollEnabledChange]);

  const handleHoverExpandToggle = useCallback(() => {
    onHoverExpandEnabledChange(!hoverExpandEnabled);
  }, [hoverExpandEnabled, onHoverExpandEnabledChange]);

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const pos = Number(e.target.value);
    const pct = 100 * Math.pow(maxZoomPercent / 100, pos / 1000);
    onZoomToPercent(pct, 'custom');
  }, [maxZoomPercent, onZoomToPercent]);

  return (
    <>
      <button
        className="icon-btn"
        onClick={handleFitAll}
        title={t(locale, 'transcription.zoom.fitAll')}
      >
        <Maximize2 size={14} />
      </button>
      <button
        className="icon-btn"
        onClick={handleFitSelection}
        title={t(locale, 'transcription.zoom.fitSelection')}
        disabled={!selectedUtteranceId}
      >
        <Focus size={14} />
      </button>
      <button
        className="icon-btn"
        onClick={handleOneToOne}
        title="1:1 (100px/s)"
      >
        <span className="icon-btn-label">1:1</span>
      </button>
      <div className="toolbar-sep" />
      <button
        className={`icon-btn${snapEnabled ? ' icon-btn-active' : ''}`}
        onClick={handleSnapToggle}
        title={snapEnabled ? t(locale, 'transcription.zoom.snapOn') : t(locale, 'transcription.zoom.snapOff')}
      >
        <span className="icon-btn-label">ZC</span>
      </button>
      <div className="toolbar-sep" />
      <button
        type="button"
        className={`icon-btn${autoScrollEnabled ? ' icon-btn-active' : ''}`}
        onClick={handleAutoScrollToggle}
        title={autoScrollEnabled ? '关闭播放跟随滚动' : '开启播放跟随滚动'}
        aria-label={autoScrollEnabled ? '关闭播放跟随滚动' : '开启播放跟随滚动'}
      >
        <span className="icon-btn-label">AS</span>
      </button>
      <div className="toolbar-sep" />
      <button
        type="button"
        className={`icon-btn${hoverExpandEnabled ? ' icon-btn-active' : ''}`}
        onClick={handleHoverExpandToggle}
        title={hoverExpandEnabled ? '关闭悬停展开' : '开启悬停展开'}
        aria-label={hoverExpandEnabled ? '关闭悬停展开' : '开启悬停展开'}
      >
        <span className="icon-btn-label">悬</span>
      </button>
      <div className="toolbar-sep" />
      <input
        type="range"
        className="waveform-zoom-slider"
        min={0}
        max={1000}
        step={1}
        value={Math.round(Math.log(zoomPercent / 100) / Math.log(maxZoomPercent / 100) * 1000)}
        onChange={handleSliderChange}
        title={tf(locale, 'transcription.zoom.scale', { percent: zoomPercent })}
        aria-label={`缩放 ${Math.round(zoomPercent)}%`}
      />
      <span className="waveform-zoom-value">{zoomPercent}%</span>
    </>
  );
};

export default ZoomControls;
