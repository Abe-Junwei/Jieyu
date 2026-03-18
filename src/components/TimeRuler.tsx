import { Fragment, useRef } from 'react';
import type WaveSurfer from 'wavesurfer.js';

interface TimeRulerProps {
  duration: number;
  currentTime: number;
  rulerView: { start: number; end: number };
  zoomPxPerSec: number;
  seekTo: (time: number) => void;
  instanceRef: React.RefObject<WaveSurfer | null>;
  waveCanvasRef: React.RefObject<HTMLDivElement | null>;
  tierContainerRef: React.RefObject<HTMLDivElement | null>;
}

const NICE_STEPS = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
const SUB_DIVS = [10, 5, 4, 2, 1];

export function TimeRuler({
  duration,
  currentTime,
  rulerView,
  zoomPxPerSec,
  seekTo,
  instanceRef,
  waveCanvasRef,
  tierContainerRef,
}: TimeRulerProps) {
  const rulerDragRef = useRef<{ dragging: boolean; startX: number; startScroll: number }>({ dragging: false, startX: 0, startScroll: 0 });

  const dur = duration;
  const { start, end } = rulerView;
  const windowSec = end - start;
  if (windowSec <= 0) return null;

  const approxPxPerSec = Math.max(zoomPxPerSec, 1);
  const majorStep = NICE_STEPS.find((s) => s * approxPxPerSec >= 120) ?? 600;
  const subDiv = SUB_DIVS.find((d) => (majorStep / d) * approxPxPerSec >= 28) ?? 1;
  const minorStep = majorStep / subDiv;

  const showMs = majorStep < 1;
  const showHour = dur >= 3600;
  const fmtLabel = (t: number) => {
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const sRaw = t % 60;
    if (showMs) {
      const sStr = sRaw.toFixed(1).padStart(4, '0');
      return showHour ? `${h}:${String(m).padStart(2, '0')}:${sStr}` : `${m}:${sStr}`;
    }
    let sInt = Math.round(sRaw);
    let mAdj = m;
    let hAdj = h;
    if (sInt >= 60) { sInt = 0; mAdj += 1; }
    if (mAdj >= 60) { mAdj = 0; hAdj += 1; }
    const ss = String(sInt).padStart(2, '0');
    return showHour
      ? `${hAdj}:${String(mAdj).padStart(2, '0')}:${ss}`
      : `${mAdj}:${ss}`;
  };

  const ticks: Array<{ time: number; kind: 'major' | 'minor' }> = [];
  const t0 = Math.max(0, Math.floor(start / minorStep) * minorStep);
  for (let t = t0; t <= Math.min(end, dur) + 1e-9; t += minorStep) {
    const rounded = Math.round(t * 1e6) / 1e6;
    if (rounded > dur) break;
    const ratio = rounded / majorStep;
    const isMajor = Math.abs(ratio - Math.round(ratio)) < 1e-6;
    ticks.push({ time: rounded, kind: isMajor ? 'major' : 'minor' });
  }

  return (
    <div
      className="time-ruler"
      onClick={(e) => {
        if (rulerDragRef.current.dragging) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        seekTo(Math.max(0, Math.min(dur, start + ratio * windowSec)));
      }}
      onMouseDown={(e) => {
        const el = waveCanvasRef.current;
        if (!el) return;
        const ws = instanceRef.current;
        rulerDragRef.current = { dragging: false, startX: e.clientX, startScroll: ws ? ws.getScroll() : 0 };
        const onMove = (ev: MouseEvent) => {
          const dx = ev.clientX - rulerDragRef.current.startX;
          if (Math.abs(dx) > 3) rulerDragRef.current.dragging = true;
          if (rulerDragRef.current.dragging && ws) {
            const target = rulerDragRef.current.startScroll - dx;
            ws.setScroll(target);
            if (tierContainerRef.current) tierContainerRef.current.scrollLeft = target;
          }
        };
        const onUp = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          setTimeout(() => { rulerDragRef.current.dragging = false; }, 0);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      }}
    >
      {ticks.map((tk) => {
        const leftPct = `${((tk.time - start) / windowSec) * 100}%`;
        return (
          <Fragment key={`tk-${tk.time}`}>
            <div
              className={`time-ruler-tick ${tk.kind === 'major' ? 'time-ruler-tick-major' : ''}`}
              style={{ left: leftPct }}
            />
            {tk.kind === 'major' && (
              <div
                className="time-ruler-label"
                style={{ left: leftPct }}
              >
                {fmtLabel(tk.time)}
              </div>
            )}
          </Fragment>
        );
      })}
      <div
        className="time-ruler-cursor"
        style={{ left: `${((currentTime - start) / windowSec) * 100}%` }}
      />
    </div>
  );
}
