import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { IconTipButton, IconTipTrigger } from '../components/ui/IconTip';
import { JieyuIcon } from '../components/ui/JieyuIcon';
import { t, tf, useLocale } from '../i18n';
import { JIEYU_ICON_INLINE } from '../utils/jieyuIcon';
import type { WaveformDisplayMode } from '../utils/waveformDisplayMode';
import {
  timelineZoomPercentFromSlider,
  timelineZoomSliderPosition,
} from '../utils/timelineZoomPercent';

const DESKTOP_VIEW_MODES = [
  {
    mode: 'waveform',
    icon: 'AudioLines',
    label: 'transcription.wave.toolbar.displayMode.waveform',
  },
  {
    mode: 'spectrogram',
    icon: 'ChartNoAxesGantt',
    label: 'transcription.wave.toolbar.displayMode.spectrogram',
  },
  {
    mode: 'split',
    icon: 'SquareSplitVertical',
    label: 'transcription.wave.toolbar.displayMode.split',
  },
] as const;

const DESKTOP_RATES = [
  { value: 0.5, label: '0.5×' },
  { value: 0.75, label: '0.75×' },
  { value: 1, label: '1.0×' },
  { value: 1.25, label: '1.25×' },
  { value: 1.5, label: '1.5×' },
  { value: 2, label: '2.0×' },
] as const;

function useDismissDetails(rootRef: RefObject<HTMLDetailsElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const closeOnOutside = (event: PointerEvent) => {
      if (!root.open || !(event.target instanceof Node) || root.contains(event.target)) return;
      root.open = false;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') root.open = false;
    };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [rootRef]);
}

export function DesktopRateControl(props: {
  locale: ReturnType<typeof useLocale>;
  rate: number;
  onChange: (rate: number) => void;
}) {
  const rootRef = useRef<HTMLDetailsElement>(null);
  useDismissDetails(rootRef);
  const known = DESKTOP_RATES.find((item) => item.value === props.rate);
  const currentLabel = known?.label ?? `${props.rate}×`;
  const label = tf(props.locale, 'transcription.wave.segmentSpeed', { rate: props.rate });
  return (
    <details ref={rootRef} className="desktop-tx-rate" data-testid="desktop-rate">
      <summary className="desktop-tx-rate-trigger" aria-label={label}>
        <span>{currentLabel}</span>
        <JieyuIcon name="ChevronDown" aria-hidden className={JIEYU_ICON_INLINE} />
      </summary>
      <div className="desktop-tx-menu" role="menu" aria-label={label}>
        {DESKTOP_RATES.map((item) => {
          const selected = item.value === props.rate;
          return (
            <button
              key={item.value}
              type="button"
              role="menuitemradio"
              aria-checked={selected}
              className={selected ? 'is-on' : undefined}
              onClick={() => {
                props.onChange(item.value);
                if (rootRef.current) rootRef.current.open = false;
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </details>
  );
}

export function DesktopViewControls(props: {
  locale: ReturnType<typeof useLocale>;
  mode: WaveformDisplayMode;
  onChange: (mode: WaveformDisplayMode) => void;
}) {
  const rootRef = useRef<HTMLDetailsElement>(null);
  const index = Math.max(
    0,
    DESKTOP_VIEW_MODES.findIndex((item) => item.mode === props.mode),
  );
  const current = DESKTOP_VIEW_MODES[index] ?? DESKTOP_VIEW_MODES[0];
  const groupLabel = t(props.locale, 'transcription.wave.toolbar.displayMode');
  const currentLabel = t(props.locale, current.label);
  const [menuOpen, setMenuOpen] = useState(false);
  useDismissDetails(rootRef);
  return (
    <details
      ref={rootRef}
      className="desktop-tx-view"
      data-testid="desktop-view"
      onToggle={(event) => setMenuOpen(event.currentTarget.open)}
    >
      <IconTipTrigger label={groupLabel} suspended={menuOpen}>
        <summary className="desktop-tx-view-trigger" aria-label={`${groupLabel}：${currentLabel}`}>
          <JieyuIcon name={current.icon} aria-hidden className={JIEYU_ICON_INLINE} />
          <JieyuIcon name="ChevronDown" aria-hidden className={JIEYU_ICON_INLINE} />
        </summary>
      </IconTipTrigger>
      <div className="desktop-tx-menu" role="menu" aria-label={groupLabel}>
        {DESKTOP_VIEW_MODES.map((item) => {
          const label = t(props.locale, item.label);
          const selected = item.mode === current.mode;
          return (
            <button
              key={item.mode}
              type="button"
              role="menuitemradio"
              aria-checked={selected}
              className={selected ? 'is-on' : undefined}
              onClick={() => {
                props.onChange(item.mode);
                if (rootRef.current) rootRef.current.open = false;
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </details>
  );
}

export function DesktopZoomControls(props: {
  locale: ReturnType<typeof useLocale>;
  zoomPercent: number;
  fitPxPerSec: number;
  maxZoomPercent: number;
  canFitSelection: boolean;
  onFitAll: () => void;
  onFitSelection: () => void;
  onZoomPercent: (percent: number) => void;
}) {
  const { locale, zoomPercent, fitPxPerSec, maxZoomPercent, canFitSelection } = props;
  const percent = Math.round(zoomPercent);
  const sliderPos = timelineZoomSliderPosition(zoomPercent, fitPxPerSec, maxZoomPercent, 100);
  return (
    <div className="desktop-tx-zoom" data-testid="desktop-zoom">
      <IconTipButton
        className="desktop-tx-icon"
        label={t(locale, 'transcription.zoom.fitAll')}
        onClick={props.onFitAll}
      >
        <JieyuIcon name="Expand" aria-hidden className={JIEYU_ICON_INLINE} />
      </IconTipButton>
      <IconTipButton
        className="desktop-tx-icon"
        label={t(locale, 'transcription.zoom.fitSelection')}
        aria-disabled={!canFitSelection}
        onClick={props.onFitSelection}
      >
        <JieyuIcon name="Focus" aria-hidden className={JIEYU_ICON_INLINE} />
      </IconTipButton>
      <input
        type="range"
        className="desktop-tx-zoom-slider"
        min={0}
        max={1000}
        step={1}
        value={sliderPos}
        style={{ '--zoom-fill': `${sliderPos / 10}%` } as CSSProperties}
        title={tf(locale, 'transcription.zoom.scale', { percent })}
        aria-label={tf(locale, 'transcription.zoom.scaleAria', { percent })}
        onChange={(event) => {
          props.onZoomPercent(
            timelineZoomPercentFromSlider(
              Number(event.target.value),
              fitPxPerSec,
              maxZoomPercent,
              100,
            ),
          );
        }}
      />
      <span className="desktop-tx-zoom-pct">{percent}%</span>
    </div>
  );
}

export function formatManuscriptDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const s = total % 60;
  const m = Math.floor(total / 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
