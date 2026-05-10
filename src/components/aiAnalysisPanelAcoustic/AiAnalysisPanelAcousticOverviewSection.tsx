import { memo } from 'react';
import type { AnalysisBottomTab } from '../AiAnalysisPanel.types';
import type { AiAnalysisPanelAcousticTabModel } from '../useAiAnalysisPanelAcousticModel';
import { PanelSection } from '../ui/PanelSection';
import { t, tf } from '../../i18n';
import { formatDb, formatRatio } from '../ai/aiAnalysisPanelAcousticUtils';

export const AiAnalysisPanelAcousticOverviewSection = memo(
  function AiAnalysisPanelAcousticOverviewSection({
    activeTab,
    model,
  }: {
    activeTab: AnalysisBottomTab;
    model: AiAnalysisPanelAcousticTabModel;
  }) {
    const {
      locale,
      acousticSummary,
      acousticRuntimeStatus,
      acousticDurationSec,
      acousticVoicedRatio,
      acousticHotspotCount,
      acousticRuntimeLabel,
    } = model;

    return (
      <>
        {activeTab === 'acoustic' && (
          <PanelSection
            className="transcription-analysis-acoustic-section transcription-analysis-acoustic-overview-section"
            title={t(locale, 'ai.stats.acousticTitle')}
            description={t(locale, 'ai.acoustic.summaryDescription')}
          >
            {acousticSummary ? (
              <div className="transcription-analysis-acoustic-panel">
                <div className="transcription-analysis-acoustic-hero">
                  <div className="transcription-analysis-acoustic-hero-card">
                    <span className="transcription-analysis-acoustic-hero-label">
                      {t(locale, 'ai.acoustic.durationLabel')}
                    </span>
                    <strong className="transcription-analysis-acoustic-hero-value">
                      {acousticDurationSec != null
                        ? `${acousticDurationSec.toFixed(2)}s`
                        : t(locale, 'ai.stats.acousticUnavailable')}
                    </strong>
                  </div>
                  <div className="transcription-analysis-acoustic-hero-card">
                    <span className="transcription-analysis-acoustic-hero-label">
                      {t(locale, 'ai.acoustic.voicedRatio')}
                    </span>
                    <strong className="transcription-analysis-acoustic-hero-value">
                      {formatRatio(acousticVoicedRatio) ??
                        t(locale, 'ai.stats.acousticUnavailable')}
                    </strong>
                  </div>
                  <div className="transcription-analysis-acoustic-hero-card">
                    <span className="transcription-analysis-acoustic-hero-label">
                      {t(locale, 'ai.stats.acousticHotspots')}
                    </span>
                    <strong className="transcription-analysis-acoustic-hero-value">
                      {acousticHotspotCount}
                    </strong>
                  </div>
                </div>
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">
                    {t(locale, 'ai.stats.acousticSelection')}
                  </span>
                  <span className="transcription-analysis-stats-value">
                    {acousticSummary.selectionStartSec.toFixed(2)}-
                    {acousticSummary.selectionEndSec.toFixed(2)}s
                  </span>
                </div>
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">
                    {t(locale, 'ai.stats.acousticF0')}
                  </span>
                  <span className="transcription-analysis-stats-value">
                    {typeof acousticSummary.f0MinHz === 'number' &&
                    typeof acousticSummary.f0MeanHz === 'number' &&
                    typeof acousticSummary.f0MaxHz === 'number'
                      ? `${Math.round(acousticSummary.f0MinHz)} / ${Math.round(acousticSummary.f0MeanHz)} / ${Math.round(acousticSummary.f0MaxHz)} Hz`
                      : t(locale, 'ai.stats.acousticUnavailable')}
                  </span>
                </div>
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">
                    {t(locale, 'ai.stats.acousticIntensityPeak')}
                  </span>
                  <span className="transcription-analysis-stats-value">
                    {typeof acousticSummary.intensityPeakDb === 'number'
                      ? `${acousticSummary.intensityPeakDb.toFixed(1)} dB`
                      : t(locale, 'ai.stats.acousticUnavailable')}
                  </span>
                </div>
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">
                    {t(locale, 'ai.acoustic.intensityRange')}
                  </span>
                  <span className="transcription-analysis-stats-value">
                    {formatDb(acousticSummary.intensityMinDb) &&
                    formatDb(acousticSummary.intensityPeakDb)
                      ? `${formatDb(acousticSummary.intensityMinDb)} / ${formatDb(acousticSummary.intensityPeakDb)}`
                      : t(locale, 'ai.stats.acousticUnavailable')}
                  </span>
                </div>
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">
                    {t(locale, 'ai.stats.acousticReliability')}
                  </span>
                  <span className="transcription-analysis-stats-value">
                    {typeof acousticSummary.reliabilityMean === 'number'
                      ? `${acousticSummary.reliabilityMean.toFixed(2)} · ${tf(locale, 'ai.stats.acousticVoicedFrames', { voiced: acousticSummary.voicedFrameCount, total: acousticSummary.frameCount })}`
                      : t(locale, 'ai.stats.acousticUnavailable')}
                  </span>
                </div>
              </div>
            ) : (
              <div className="transcription-analysis-acoustic-empty">
                {acousticRuntimeStatus?.state === 'loading'
                  ? acousticRuntimeLabel
                  : t(locale, 'ai.stats.acousticUnavailableHint')}
              </div>
            )}
          </PanelSection>
        )}
      </>
    );
  },
);
