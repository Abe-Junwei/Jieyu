export const WAVEFORM_VISUAL_STYLE_OPTIONS = ['balanced', 'dense', 'contrast'] as const;

export type WaveformVisualStyle = (typeof WAVEFORM_VISUAL_STYLE_OPTIONS)[number];

export interface WaveformVisualStylePreset {
  waveColor: string;
  progressColor: string;
  cursorColor: string;
  barWidth: number;
  barGap: number;
  barRadius: number;
}

export function isWaveformVisualStyle(value: string): value is WaveformVisualStyle {
  return WAVEFORM_VISUAL_STYLE_OPTIONS.includes(value as WaveformVisualStyle);
}

export function getWaveformVisualStylePreset(style: WaveformVisualStyle | undefined): WaveformVisualStylePreset {
  switch (style) {
    case 'dense':
      return {
        waveColor: 'color-mix(in srgb, var(--text-secondary) 82%, transparent)',
        progressColor: 'color-mix(in srgb, var(--state-info-border) 72%, var(--state-info-solid))',
        cursorColor: 'var(--state-danger-solid)',
        barWidth: 1,
        barGap: 1,
        barRadius: 0,
      };
    case 'contrast':
      return {
        waveColor: 'color-mix(in srgb, var(--text-primary) 32%, var(--border-soft))',
        progressColor: 'var(--state-warning-solid)',
        cursorColor: 'var(--state-danger-solid)',
        barWidth: 3,
        barGap: 1,
        barRadius: 2,
      };
    case 'balanced':
    default:
      return {
        waveColor: 'color-mix(in srgb, var(--text-secondary) 70%, transparent)',
        progressColor: 'var(--state-info-solid)',
        cursorColor: 'var(--state-danger-solid)',
        barWidth: 2,
        barGap: 1,
        barRadius: 1,
      };
  }
}