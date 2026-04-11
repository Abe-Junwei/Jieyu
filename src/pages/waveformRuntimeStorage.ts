import type { AcousticOverlayMode } from '../utils/acousticOverlayTypes';
import type { WaveformDisplayMode } from '../utils/waveformDisplayMode';
import type { WaveformVisualStyle } from '../utils/waveformVisualStyle';

export interface WaveformResizeState {
  startY: number;
  startHeight: number;
  startAmplitude: number;
}

export interface UseWaveformRuntimeControllerResult {
  waveformHeight: number;
  amplitudeScale: number;
  setAmplitudeScale: React.Dispatch<React.SetStateAction<number>>;
  waveformDisplayMode: WaveformDisplayMode;
  setWaveformDisplayMode: React.Dispatch<React.SetStateAction<WaveformDisplayMode>>;
  waveformVisualStyle: WaveformVisualStyle;
  setWaveformVisualStyle: React.Dispatch<React.SetStateAction<WaveformVisualStyle>>;
  acousticOverlayMode: AcousticOverlayMode;
  setAcousticOverlayMode: React.Dispatch<React.SetStateAction<AcousticOverlayMode>>;
  isResizingWaveform: boolean;
  handleWaveformResizeStart: (event: React.PointerEvent<HTMLDivElement>) => void;
}

export function readStoredClampedNumber(key: string, min: number, max: number, fallback: number): number {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return fallback;
    const parsed = Number(stored);
    if (Number.isNaN(parsed)) return fallback;
    return Math.min(Math.max(parsed, min), max);
  } catch {
    return fallback;
  }
}
