import type { AcousticAnalysisConfig } from './acousticOverlayTypes';

export type AcousticAnalysisPresetKey = 'default' | 'speech_male' | 'speech_female' | 'tonal' | 'wide_range' | 'custom';

export interface AcousticAnalysisPreset {
  key: AcousticAnalysisPresetKey;
  label: string;
  description: string;
  config: Partial<AcousticAnalysisConfig>;
}

export const ACOUSTIC_ANALYSIS_PRESETS: AcousticAnalysisPreset[] = [
  {
    key: 'default',
    label: 'Default',
    description: 'General-purpose speech analysis (75–400 Hz)',
    config: {},
  },
  {
    key: 'speech_male',
    label: 'Male Speech',
    description: 'Typical adult male range (60–300 Hz)',
    config: {
      pitchFloorHz: 60,
      pitchCeilingHz: 300,
      yinThreshold: 0.15,
    },
  },
  {
    key: 'speech_female',
    label: 'Female Speech',
    description: 'Typical adult female range (100–500 Hz)',
    config: {
      pitchFloorHz: 100,
      pitchCeilingHz: 500,
      yinThreshold: 0.12,
    },
  },
  {
    key: 'tonal',
    label: 'Tonal Language',
    description: 'Tonal speech analysis with finer frame step (75–500 Hz, 5ms step)',
    config: {
      pitchFloorHz: 75,
      pitchCeilingHz: 500,
      frameStepSec: 0.005,
      yinThreshold: 0.12,
    },
  },
  {
    key: 'wide_range',
    label: 'Wide Range',
    description: 'Singing / child speech (50–800 Hz)',
    config: {
      pitchFloorHz: 50,
      pitchCeilingHz: 800,
      yinThreshold: 0.2,
    },
  },
];
