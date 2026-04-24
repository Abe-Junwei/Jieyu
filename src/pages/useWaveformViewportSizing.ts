import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

const DEFAULT_WAVE_CANVAS_WIDTH = 800;
export const DEFAULT_PLAYBACK_RATE_KEY = 'jieyu:default-playback-rate';

/** 低于此值的 tier.clientWidth 视为 flex/首帧未稳定（刷新后尤甚），勿用于 fit，否则会整屏被算成数 px/秒。 */
const MIN_TIER_PX_FOR_FIT = 200;

/** 与 `timeline-layout` 中 `.timeline-content` 的 `padding-left` 同源：层头 + 左视频位。 */
function readTimelineTimeStripGutterPx(tierScrollEl: HTMLElement | null): number {
  if (!tierScrollEl) return 0;
  const content = tierScrollEl.querySelector<HTMLElement>('.timeline-content');
  if (!content) return 0;
  const pl = getComputedStyle(content).paddingLeft;
  const n = parseFloat(pl);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 从 `.timeline-scroll` 读文轴净宽，供 render 与 `waveCanvasClientWidth` 取 max。 */
function readTimeAxisClientWidthForFit(tierScrollEl: HTMLElement | null): number {
  if (!tierScrollEl?.isConnected) return 0;
  let tierW = tierScrollEl.clientWidth;
  if (tierW < 4) {
    const br = Math.round(tierScrollEl.getBoundingClientRect().width);
    if (br > 0) tierW = br;
  }
  if (tierW < MIN_TIER_PX_FOR_FIT) return 0;
  const gutter = readTimelineTimeStripGutterPx(tierScrollEl);
  const clampGutter = Math.min(gutter, Math.max(0, tierW - MIN_TIER_PX_FOR_FIT));
  return Math.max(0, tierW - clampGutter);
}

export function readDefaultPlaybackRate(): number {
  try {
    const stored = localStorage.getItem(DEFAULT_PLAYBACK_RATE_KEY);
    if (!stored) return 1;
    const parsed = Number(stored);
    if (Number.isNaN(parsed)) return 1;
    return [0.5, 0.75, 1, 1.25, 1.5, 2].includes(parsed) ? parsed : 1;
  } catch {
    return 1;
  }
}

export interface UseWaveformViewportSizingInput {
  selectedMediaUrl?: string;
  verticalComparisonEnabled?: boolean;
  tierContainerRef: RefObject<HTMLDivElement | null>;
  waveCanvasRef: RefObject<HTMLDivElement | null>;
  waveformAreaRef: RefObject<HTMLDivElement | null>;
  documentSpanSec: number;
  timelineUnitViewEpoch: number;
  playerIsReady: boolean;
  playerDuration: number;
}

interface UseWaveformViewportSizingResult {
  containerWidth: number;
  waveCanvasClientWidth: number;
  rawTierAxisForFitPx: number;
  tierTimeAxisForFitPx: number;
}

export function useWaveformViewportSizing(
  input: UseWaveformViewportSizingInput,
): UseWaveformViewportSizingResult {
  const [waveCanvasClientWidth, setWaveCanvasClientWidth] = useState(DEFAULT_WAVE_CANVAS_WIDTH);
  const [timeAxisForFitFromTierObserverPx, setTimeAxisForFitFromTierObserverPx] = useState(0);
  const remeasureWaveCanvasLayoutRef = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    const el = input.tierContainerRef.current;
    if (!el) return undefined;
    const apply = () => {
      setTimeAxisForFitFromTierObserverPx(readTimeAxisClientWidthForFit(el));
    };
    apply();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, [input.tierContainerRef]);

  const liveTimeAxisClientWidthPx = readTimeAxisClientWidthForFit(input.tierContainerRef.current);
  const rawTierAxisForFitPx = Math.max(
    liveTimeAxisClientWidthPx,
    timeAxisForFitFromTierObserverPx,
  );
  const tierTimeAxisForFitPx = rawTierAxisForFitPx >= MIN_TIER_PX_FOR_FIT ? rawTierAxisForFitPx : 0;

  const containerWidth = (() => {
    const wWave = waveCanvasClientWidth;
    const wTier = tierTimeAxisForFitPx > 0 ? tierTimeAxisForFitPx : 0;
    if (wWave >= MIN_TIER_PX_FOR_FIT && wTier >= MIN_TIER_PX_FOR_FIT) {
      return Math.min(wWave, wTier);
    }
    if (input.verticalComparisonEnabled === true && wWave > 0 && wTier > 0) {
      return Math.min(wWave, wTier);
    }
    if (wTier > 0) {
      return Math.max(wWave, wTier);
    }
    return Math.max(wWave, DEFAULT_WAVE_CANVAS_WIDTH, MIN_TIER_PX_FOR_FIT);
  })();

  useLayoutEffect(() => {
    const hasMedia = typeof input.selectedMediaUrl === 'string' && input.selectedMediaUrl.trim() !== '';
    let roTier: ResizeObserver | null = null;
    let moTier: MutationObserver | null = null;
    let moTierCoalesceRaf: number | null = null;
    let cancelled = false;
    let rafWaitForNode: number | null = null;
    let roCanvas: ResizeObserver | null = null;
    let roWaveformArea: ResizeObserver | null = null;
    let tTierPoll: number | null = null;
    let tTierPollEnd: number | null = null;

    function tryObserveTier() {
      if (roTier) return;
      const tier = input.tierContainerRef.current;
      if (!tier) return;
      if (typeof ResizeObserver === 'undefined') return;
      roTier = new ResizeObserver(() => {
        measure();
      });
      roTier.observe(tier);
    }

    function ensureMutationObserverOnTier() {
      if (hasMedia || moTier) return;
      const tier = input.tierContainerRef.current;
      if (!tier || typeof MutationObserver === 'undefined') return;
      moTier = new MutationObserver(() => {
        if (moTierCoalesceRaf != null) return;
        moTierCoalesceRaf = requestAnimationFrame(() => {
          moTierCoalesceRaf = null;
          measure();
        });
      });
      moTier.observe(tier, { childList: true, subtree: true });
    }

    function measure() {
      const el = input.waveCanvasRef.current;
      if (!el?.isConnected) return;
      const raw = el.clientWidth;
      const tierEl = input.tierContainerRef.current;
      const tierW = tierEl?.clientWidth ?? 0;
      const gutter = readTimelineTimeStripGutterPx(tierEl);
      const clampGutterForAxis = (tw: number) => (tw >= MIN_TIER_PX_FOR_FIT
        ? Math.min(gutter, Math.max(0, tw - MIN_TIER_PX_FOR_FIT))
        : gutter);
      let w: number;
      if (hasMedia) {
        if (raw <= 0) {
          w = DEFAULT_WAVE_CANVAS_WIDTH;
        } else if (raw < MIN_TIER_PX_FOR_FIT && tierW >= MIN_TIER_PX_FOR_FIT) {
          w = tierW;
        } else if (raw < 8) {
          w = tierW >= MIN_TIER_PX_FOR_FIT ? tierW : DEFAULT_WAVE_CANVAS_WIDTH;
        } else {
          w = raw;
        }
      } else if (tierW >= MIN_TIER_PX_FOR_FIT) {
        w = Math.max(1, tierW - clampGutterForAxis(tierW));
      } else if (tierW > 0) {
        w = raw >= MIN_TIER_PX_FOR_FIT ? raw : DEFAULT_WAVE_CANVAS_WIDTH;
      } else if (raw >= MIN_TIER_PX_FOR_FIT) {
        w = raw;
      } else {
        w = DEFAULT_WAVE_CANVAS_WIDTH;
      }

      if (hasMedia && gutter > 0 && tierW > 0 && Math.abs(w - tierW) <= 1) {
        w = Math.max(1, tierW - clampGutterForAxis(tierW));
      }
      if (!hasMedia && w < MIN_TIER_PX_FOR_FIT && tierW >= MIN_TIER_PX_FOR_FIT) {
        w = raw >= MIN_TIER_PX_FOR_FIT ? raw : DEFAULT_WAVE_CANVAS_WIDTH;
      }
      setWaveCanvasClientWidth(w);
      tryObserveTier();
      ensureMutationObserverOnTier();
    }

    remeasureWaveCanvasLayoutRef.current = measure;
    const onWinResize = () => {
      measure();
    };
    const t0 = window.setTimeout(measure, 0);
    const t1 = window.setTimeout(measure, 80);
    const t2 = window.setTimeout(measure, 300);
    const t3 = window.setTimeout(measure, 600);
    const t4 = window.setTimeout(measure, 1200);
    const t5 = window.setTimeout(measure, 2500);

    const armDelayedMeasures = () => {
      requestAnimationFrame(() => {
        measure();
        requestAnimationFrame(() => {
          measure();
        });
      });
    };

    const attach = () => {
      const el = input.waveCanvasRef.current;
      if (!el || roCanvas) return;
      roCanvas = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
      roCanvas?.observe(el);
      const area = input.waveformAreaRef.current;
      if (area && typeof ResizeObserver !== 'undefined') {
        roWaveformArea = new ResizeObserver(measure);
        roWaveformArea.observe(area);
      }
      measure();
      armDelayedMeasures();
      window.addEventListener('resize', onWinResize);
      if (!hasMedia) {
        tTierPoll = window.setInterval(() => {
          tryObserveTier();
          measure();
        }, 60);
        tTierPollEnd = window.setTimeout(() => {
          if (tTierPoll) clearInterval(tTierPoll);
          tTierPoll = null;
        }, 5000);
      }
    };

    if (input.waveCanvasRef.current) {
      attach();
    } else {
      let waitFrames = 0;
      const wait = () => {
        if (cancelled) return;
        if (input.waveCanvasRef.current) {
          attach();
          return;
        }
        waitFrames += 1;
        if (waitFrames > 600) return;
        rafWaitForNode = requestAnimationFrame(wait);
      };
      rafWaitForNode = requestAnimationFrame(wait);
    }

    return () => {
      cancelled = true;
      if (moTierCoalesceRaf != null) {
        cancelAnimationFrame(moTierCoalesceRaf);
        moTierCoalesceRaf = null;
      }
      if (rafWaitForNode != null) {
        cancelAnimationFrame(rafWaitForNode);
        rafWaitForNode = null;
      }
      window.removeEventListener('resize', onWinResize);
      clearTimeout(t0);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
      if (tTierPoll) clearInterval(tTierPoll);
      if (tTierPollEnd) clearTimeout(tTierPollEnd);
      moTier?.disconnect();
      roCanvas?.disconnect();
      roWaveformArea?.disconnect();
      roTier?.disconnect();
      remeasureWaveCanvasLayoutRef.current = null;
    };
  }, [input.selectedMediaUrl, input.tierContainerRef, input.waveCanvasRef, input.waveformAreaRef]);

  useLayoutEffect(() => {
    remeasureWaveCanvasLayoutRef.current?.();
  }, [input.documentSpanSec, input.timelineUnitViewEpoch, input.playerIsReady, input.playerDuration]);

  return {
    containerWidth,
    waveCanvasClientWidth,
    rawTierAxisForFitPx,
    tierTimeAxisForFitPx,
  };
}
