import type { WaveformDisplayMode } from './waveformDisplayMode';
import type { AcousticOverlayMode } from './acousticOverlayTypes';
import type { WaveformVisualStyle } from './waveformVisualStyle';
import { isAcousticOverlayMode } from './acousticOverlayTypes';
import { isWaveformDisplayMode } from './waveformDisplayMode';
import { isWaveformVisualStyle } from './waveformVisualStyle';

export const WAVEFORM_HEIGHT_STORAGE_KEY = 'jieyu:waveform-height';
export const WAVEFORM_DISPLAY_MODE_STORAGE_KEY = 'jieyu:waveform-display-mode';
export const WAVEFORM_AMPLITUDE_SCALE_STORAGE_KEY = 'jieyu:amplitude-scale';
export const WAVEFORM_VISUAL_STYLE_STORAGE_KEY = 'jieyu:waveform-visual-style';
export const ACOUSTIC_OVERLAY_MODE_STORAGE_KEY = 'jieyu:acoustic-overlay-mode';

const WAVEFORM_RUNTIME_PREFERENCE_CHANGED_EVENT = 'jieyu:waveform-runtime-preference-changed';

export function readStoredWaveformHeightPreference(): number {
  try {
    const stored = localStorage.getItem(WAVEFORM_HEIGHT_STORAGE_KEY);
    if (!stored) return 180;
    const parsed = Number(stored);
    if (Number.isNaN(parsed)) return 180;
    return Math.min(400, Math.max(80, Math.round(parsed)));
  } catch {
    return 180;
  }
}

export function readStoredWaveformDisplayModePreference(): WaveformDisplayMode {
  try {
    const stored = localStorage.getItem(WAVEFORM_DISPLAY_MODE_STORAGE_KEY);
    if (!stored || !isWaveformDisplayMode(stored)) return 'waveform';
    return stored;
  } catch {
    return 'waveform';
  }
}

export function readStoredWaveformAmplitudeScalePreference(): number {
  try {
    const stored = localStorage.getItem(WAVEFORM_AMPLITUDE_SCALE_STORAGE_KEY);
    if (!stored) return 1;
    const parsed = Number(stored);
    if (Number.isNaN(parsed)) return 1;
    return Math.min(4, Math.max(0.25, Number(parsed.toFixed(2))));
  } catch {
    return 1;
  }
}

export function readStoredWaveformVisualStylePreference(): WaveformVisualStyle {
  try {
    const stored = localStorage.getItem(WAVEFORM_VISUAL_STYLE_STORAGE_KEY);
    if (!stored) return 'balanced';
    // 旧版「praat」样式键已更名为 line（示波图式连续线画），迁移本地偏好 | Legacy style id rename
    if (stored === 'praat') {
      try {
        localStorage.setItem(WAVEFORM_VISUAL_STYLE_STORAGE_KEY, 'line');
      } catch {
        // no-op
      }
      return 'line';
    }
    if (!isWaveformVisualStyle(stored)) return 'balanced';
    return stored;
  } catch {
    return 'balanced';
  }
}

export function readStoredAcousticOverlayModePreference(): AcousticOverlayMode {
  try {
    const stored = localStorage.getItem(ACOUSTIC_OVERLAY_MODE_STORAGE_KEY);
    if (!stored || !isAcousticOverlayMode(stored)) return 'none';
    return stored;
  } catch {
    return 'none';
  }
}

export function emitWaveformRuntimePreferenceChanged(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new Event(WAVEFORM_RUNTIME_PREFERENCE_CHANGED_EVENT));
  } catch {
    // no-op
  }
}

export function subscribeWaveformRuntimePreferenceChanged(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleStorage = (event: StorageEvent) => {
    if (
      event.key === WAVEFORM_HEIGHT_STORAGE_KEY
      || event.key === WAVEFORM_DISPLAY_MODE_STORAGE_KEY
      || event.key === WAVEFORM_AMPLITUDE_SCALE_STORAGE_KEY
      || event.key === WAVEFORM_VISUAL_STYLE_STORAGE_KEY
      || event.key === ACOUSTIC_OVERLAY_MODE_STORAGE_KEY
    ) {
      listener();
    }
  };

  window.addEventListener(WAVEFORM_RUNTIME_PREFERENCE_CHANGED_EVENT, listener as EventListener);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(WAVEFORM_RUNTIME_PREFERENCE_CHANGED_EVENT, listener as EventListener);
    window.removeEventListener('storage', handleStorage);
  };
}
