/**
 * ZoomControls | 缩放控制组件
 *
 * 包装波形缩放按钮、ZC 快捷对齐、AS 自动滚动、缩放滑块和百分比显示
 * Wraps zoom buttons, ZC snap toggle, AS auto-scroll, zoom slider, and percentage display
 */

import { type FC, useCallback } from 'react';
import { MaterialSymbol } from '../../ui/MaterialSymbol';
import { JIEYU_MATERIAL_INLINE } from '../../../utils/jieyuMaterialIcon';
import { t, tf, useLocale } from '../../../i18n';
import { recordTranscriptionKeyboardAction } from '../../../utils/transcriptionKeyboardActionTelemetry';

let lastZoomSliderTelemetryMs = 0;
const ZOOM_SLIDER_TELEMETRY_MS = 350;

function recordZoomSliderTelemetryThrottled(): void {
  const now = Date.now();
  if (now - lastZoomSliderTelemetryMs < ZOOM_SLIDER_TELEMETRY_MS) return;
  lastZoomSliderTelemetryMs = now;
  recordTranscriptionKeyboardAction('timelineZoomSliderChange');
}

export interface ZoomControlsProps {
  // 状态 | State
  zoomPercent: number;
  snapEnabled: boolean;
  autoScrollEnabled: boolean;
  activeUnitId: string | null;
  /** Timeline rows on current track (unit or segment), for fit-selection zoom. */
  unitsOnCurrentMedia: Array<{ id: string; startTime: number; endTime: number }>;
  fitPxPerSec: number;
  maxZoomPercent: number;

  // 回调 | Callbacks
  onZoomToPercent: (percent: number, mode: 'fit-all' | 'fit-selection' | 'custom') => void;
  onZoomToUnit: (startTime: number, endTime: number) => void;
  onSnapEnabledChange: (enabled: boolean) => void;
  onAutoScrollEnabledChange: (enabled: boolean) => void;
}

const ZoomControls: FC<ZoomControlsProps> = ({
  zoomPercent,
  snapEnabled,
  autoScrollEnabled,
  activeUnitId,
  unitsOnCurrentMedia,
  fitPxPerSec,
  maxZoomPercent,
  onZoomToPercent,
  onZoomToUnit,
  onSnapEnabledChange,
  onAutoScrollEnabledChange,
}) => {
  const locale = useLocale();

  const handleFitAll = useCallback(() => {
    onZoomToPercent(100, 'fit-all');
  }, [onZoomToPercent]);

  const handleFitSelection = useCallback(() => {
    const sel = unitsOnCurrentMedia.find((u) => u.id === activeUnitId);
    if (sel) {
      onZoomToUnit(sel.startTime, sel.endTime);
    }
  }, [activeUnitId, unitsOnCurrentMedia, onZoomToUnit]);

  const handleOneToOne = useCallback(() => {
    recordTranscriptionKeyboardAction('timelineZoomOneToOne');
    onZoomToPercent(Math.round((100 / fitPxPerSec) * 100), 'custom');
  }, [fitPxPerSec, onZoomToPercent]);

  const handleSnapToggle = useCallback(() => {
    onSnapEnabledChange(!snapEnabled);
  }, [snapEnabled, onSnapEnabledChange]);

  const handleAutoScrollToggle = useCallback(() => {
    onAutoScrollEnabledChange(!autoScrollEnabled);
  }, [autoScrollEnabled, onAutoScrollEnabledChange]);

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    recordZoomSliderTelemetryThrottled();
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
        <MaterialSymbol name="open_in_full" className={JIEYU_MATERIAL_INLINE} />
      </button>
      <button
        className="icon-btn"
        onClick={handleFitSelection}
        title={t(locale, 'transcription.zoom.fitSelection')}
        disabled={!activeUnitId}
      >
        <MaterialSymbol name="center_focus_strong" className={JIEYU_MATERIAL_INLINE} />
      </button>
      <button
        className="icon-btn"
        onClick={handleOneToOne}
        title={t(locale, 'transcription.zoom.oneToOne')}
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
        title={autoScrollEnabled ? t(locale, 'transcription.zoom.autoScrollOff') : t(locale, 'transcription.zoom.autoScrollOn')}
        aria-label={autoScrollEnabled ? t(locale, 'transcription.zoom.autoScrollOff') : t(locale, 'transcription.zoom.autoScrollOn')}
      >
        <span className="icon-btn-label">AS</span>
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
        aria-label={tf(locale, 'transcription.zoom.scaleAria', { percent: Math.round(zoomPercent) })}
      />
      <span className="waveform-zoom-value">{zoomPercent}%</span>
    </>
  );
};

export default ZoomControls;
