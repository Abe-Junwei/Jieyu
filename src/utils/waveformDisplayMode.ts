export const WAVEFORM_DISPLAY_MODE_OPTIONS = ['waveform', 'spectrogram', 'split'] as const;

export type WaveformDisplayMode = (typeof WAVEFORM_DISPLAY_MODE_OPTIONS)[number];

export function isWaveformDisplayMode(value: string): value is WaveformDisplayMode {
  return WAVEFORM_DISPLAY_MODE_OPTIONS.includes(value as WaveformDisplayMode);
}

export function getWaveformDisplayHeights(totalHeight: number, mode: WaveformDisplayMode): {
  waveformPrimaryHeight: number;
  spectrogramHeight: number;
} {
  if (mode !== 'split') {
    return {
      waveformPrimaryHeight: totalHeight,
      spectrogramHeight: totalHeight,
    };
  }

  const gap = 6;
  const usableHeight = Math.max(120, totalHeight - gap);
  const waveformPrimaryHeight = Math.max(56, Math.round(usableHeight * 0.44));
  const spectrogramHeight = Math.max(58, usableHeight - waveformPrimaryHeight);

  return {
    waveformPrimaryHeight,
    spectrogramHeight,
  };
}