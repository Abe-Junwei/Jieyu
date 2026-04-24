import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import {
  computeWaveformViewportContainerWidth,
  DEFAULT_WAVE_CANVAS_WIDTH,
  MIN_TIER_PX_FOR_FIT,
  readTimeAxisClientWidthForFit,
  setupWaveformCanvasMeasurement,
} from '../utils/waveformViewportSizing';

export const DEFAULT_PLAYBACK_RATE_KEY = 'jieyu:default-playback-rate';

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
  const rawTierAxisForFitPx = Math.max(liveTimeAxisClientWidthPx, timeAxisForFitFromTierObserverPx);
  const tierTimeAxisForFitPx = rawTierAxisForFitPx >= MIN_TIER_PX_FOR_FIT ? rawTierAxisForFitPx : 0;

  const containerWidth = computeWaveformViewportContainerWidth({
    waveCanvasClientWidth,
    tierTimeAxisForFitPx,
    ...(input.verticalComparisonEnabled !== undefined
      ? { verticalComparisonEnabled: input.verticalComparisonEnabled }
      : {}),
  });

  useLayoutEffect(() => {
    return setupWaveformCanvasMeasurement({
      ...(input.selectedMediaUrl !== undefined ? { selectedMediaUrl: input.selectedMediaUrl } : {}),
      tierContainerRef: input.tierContainerRef,
      waveCanvasRef: input.waveCanvasRef,
      waveformAreaRef: input.waveformAreaRef,
      setWaveCanvasClientWidth,
      remeasureWaveCanvasLayoutRef,
    });
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
