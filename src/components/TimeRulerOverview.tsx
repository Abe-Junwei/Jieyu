import { useRef } from 'react';
import { t, useLocale } from '../i18n';
import '../styles/pages/timeline/time-ruler.css';

export function TimeRulerOverview(props: {
  /** 整条概览代表的秒数。时间尺上可以长于媒体。 */
  trackSec: number;
  /** 点击换算用的秒数，并夹在这一段里。 */
  seekSec: number;
  viewStart: number;
  viewEnd: number;
  seekTo: (time: number) => void;
}) {
  const locale = useLocale();
  const dragging = useRef(false);
  const { trackSec, seekSec, viewStart, viewEnd, seekTo } = props;
  if (trackSec <= 0) return null;

  const seekFromOverview = (clientX: number, element: HTMLDivElement) => {
    const rect = element.getBoundingClientRect();
    const ratio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    seekTo(Math.max(0, Math.min(seekSec, ratio * seekSec)));
  };
  const start = Math.max(0, viewStart);
  const end = Math.min(trackSec, Math.max(start, viewEnd));
  const coversAll = end - start >= trackSec * 0.98;
  const left = `${(start / trackSec) * 100}%`;
  const width = `${Math.max(0.8, ((end - start) / trackSec) * 100)}%`;

  return (
    <div
      className="time-ruler-overview"
      title={t(locale, 'transcription.wave.overviewTooltip')}
      onClick={(event) => {
        event.stopPropagation();
        seekFromOverview(event.clientX, event.currentTarget);
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        dragging.current = true;
        seekFromOverview(event.clientX, event.currentTarget);
      }}
      onPointerMove={(event) => {
        if (dragging.current) seekFromOverview(event.clientX, event.currentTarget);
      }}
      onPointerUp={(event) => {
        dragging.current = false;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onPointerCancel={(event) => {
        dragging.current = false;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
    >
      <div className="time-ruler-overview-track" />
      {coversAll ? null : (
        <div className="time-ruler-overview-viewport" style={{ left, width }} aria-hidden="true" />
      )}
    </div>
  );
}
