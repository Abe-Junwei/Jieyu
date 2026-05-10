import type { AcousticDiagnosticKey } from '../pages/TranscriptionPage.aiPromptContext';
import type { AcousticPanelTrend } from '../utils/acousticPanelDetail';
import type { AcousticHotspotKind } from '../utils/acousticOverlayTypes';
import type { ExternalAcousticProviderHealthCheckResult } from '../services/acoustic/acousticProviderContract';
import { t, type Locale } from '../i18n';

export function buildAiAnalysisAcousticLabelMaps(locale: Locale): {
  hotspotKindLabel: Record<AcousticHotspotKind, string>;
  hotspotExplanation: Record<AcousticHotspotKind, string>;
  diagnosticLabel: Record<AcousticDiagnosticKey, string>;
  trendLabel: Record<AcousticPanelTrend, string>;
  providerHealthLabelMap: Record<ExternalAcousticProviderHealthCheckResult['state'], string>;
} {
  return {
    hotspotKindLabel: {
      pitch_peak: t(locale, 'ai.stats.acousticHotspot.pitchPeak'),
      pitch_break: t(locale, 'ai.stats.acousticHotspot.pitchBreak'),
      intensity_peak: t(locale, 'ai.stats.acousticHotspot.intensityPeak'),
      unstable_span: t(locale, 'ai.stats.acousticHotspot.unstableSpan'),
    },
    hotspotExplanation: {
      pitch_peak: t(locale, 'ai.acoustic.hotspotExplain.pitchPeak'),
      pitch_break: t(locale, 'ai.acoustic.hotspotExplain.pitchBreak'),
      intensity_peak: t(locale, 'ai.acoustic.hotspotExplain.intensityPeak'),
      unstable_span: t(locale, 'ai.acoustic.hotspotExplain.unstableSpan'),
    },
    diagnosticLabel: {
      low_reliability: t(locale, 'ai.acoustic.diagnostic.lowReliability'),
      low_voicing: t(locale, 'ai.acoustic.diagnostic.lowVoicing'),
      wide_pitch_range: t(locale, 'ai.acoustic.diagnostic.widePitchRange'),
      high_energy_contrast: t(locale, 'ai.acoustic.diagnostic.highEnergyContrast'),
      unstable_focus: t(locale, 'ai.acoustic.diagnostic.unstableFocus'),
    },
    trendLabel: {
      rising: t(locale, 'ai.acoustic.trend.rising'),
      falling: t(locale, 'ai.acoustic.trend.falling'),
      flat: t(locale, 'ai.acoustic.trend.flat'),
      mixed: t(locale, 'ai.acoustic.trend.mixed'),
    },
    providerHealthLabelMap: {
      available: t(locale, 'ai.acoustic.providerHealthAvailable'),
      disabled: t(locale, 'ai.acoustic.providerHealthDisabled'),
      unconfigured: t(locale, 'ai.acoustic.providerHealthUnconfigured'),
      aborted: t(locale, 'ai.acoustic.providerHealthAborted'),
      unauthorized: t(locale, 'ai.acoustic.providerHealthUnauthorized'),
      forbidden: t(locale, 'ai.acoustic.providerHealthForbidden'),
      timeout: t(locale, 'ai.acoustic.providerHealthTimeout'),
      'network-error': t(locale, 'ai.acoustic.providerHealthNetworkError'),
      'http-error': t(locale, 'ai.acoustic.providerHealthHttpError'),
      'unknown-error': t(locale, 'ai.acoustic.providerHealthUnknownError'),
    },
  };
}
