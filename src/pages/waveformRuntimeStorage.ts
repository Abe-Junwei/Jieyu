import type { AcousticOverlayMode } from '../utils/acousticOverlayTypes';
import type { WaveformDisplayMode } from '../utils/waveformDisplayMode';
import type { WaveformVisualStyle } from '../utils/waveformVisualStyle';
import { isAcousticOverlayMode } from '../utils/acousticOverlayTypes';
import { isWaveformDisplayMode } from '../utils/waveformDisplayMode';
import { isWaveformVisualStyle } from '../utils/waveformVisualStyle';

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

export function readStoredWaveformVisualStyle(): WaveformVisualStyle {
  try {
    const stored = localStorage.getItem('jieyu:waveform-visual-style');
    if (!stored || !isWaveformVisualStyle(stored)) return 'balanced';
    return stored;
  } catch {
    return 'balanced';
  }
}

export function readStoredWaveformDisplayMode(): WaveformDisplayMode {
  try {
    const stored = localStorage.getItem('jieyu:waveform-display-mode');
    if (!stored || !isWaveformDisplayMode(stored)) return 'waveform';
    return stored;
  } catch {
    return 'waveform';
  }
}

export function readStoredAcousticOverlayMode(): AcousticOverlayMode {
  try {
    const stored = localStorage.getItem('jieyu:acoustic-overlay-mode');
    if (!stored || !isAcousticOverlayMode(stored)) return 'none';
    return stored;
  } catch {
    return 'none';
  }
}
