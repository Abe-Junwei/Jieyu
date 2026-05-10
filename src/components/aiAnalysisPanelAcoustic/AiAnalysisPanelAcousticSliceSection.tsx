import { memo } from 'react';
import type { AnalysisBottomTab } from '../AiAnalysisPanel.types';
import type { AiAnalysisPanelAcousticTabModel } from '../useAiAnalysisPanelAcousticModel';
import { PanelSection } from '../ui/PanelSection';
import { t } from '../../i18n';
import { formatDb, formatHz } from '../ai/aiAnalysisPanelAcousticUtils';

export const AiAnalysisPanelAcousticSliceSection = memo(
  function AiAnalysisPanelAcousticSliceSection({
    activeTab,
    model,
  }: {
    activeTab: AnalysisBottomTab;
    model: AiAnalysisPanelAcousticTabModel;
  }) {
    const { locale, acousticDetail, acousticSlice, trendLabel } = model;

    return (
      <>
        {activeTab === 'acoustic' && acousticDetail ? (
          <PanelSection
            className="transcription-analysis-acoustic-section transcription-analysis-acoustic-slice-section"
            title={t(locale, 'ai.acoustic.sliceTitle')}
            description={t(locale, 'ai.acoustic.sliceDescription')}
          >
            {acousticSlice ? (
              <div className="transcription-analysis-acoustic-panel">
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">
                    {t(locale, 'ai.acoustic.sliceWindow')}
                  </span>
                  <span className="transcription-analysis-stats-value">
                    {acousticSlice.startSec.toFixed(2)}-{acousticSlice.endSec.toFixed(2)}s
                  </span>
                </div>
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">
                    {t(locale, 'ai.acoustic.sliceSampleCount')}
                  </span>
                  <span className="transcription-analysis-stats-value">
                    {acousticSlice.sampleCount}
                  </span>
                </div>
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">
                    {t(locale, 'ai.acoustic.sliceVoicedCount')}
                  </span>
                  <span className="transcription-analysis-stats-value">
                    {acousticSlice.voicedSampleCount}
                  </span>
                </div>
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">
                    {t(locale, 'ai.acoustic.slicePitchRange')}
                  </span>
                  <span className="transcription-analysis-stats-value">
                    {formatHz(acousticSlice.pitchMinHz) && formatHz(acousticSlice.pitchMaxHz)
                      ? `${formatHz(acousticSlice.pitchMinHz)} / ${formatHz(acousticSlice.pitchMaxHz)}`
                      : t(locale, 'ai.stats.acousticUnavailable')}
                  </span>
                </div>
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">
                    {t(locale, 'ai.acoustic.sliceIntensityRange')}
                  </span>
                  <span className="transcription-analysis-stats-value">
                    {formatDb(acousticSlice.intensityMinDb) &&
                    formatDb(acousticSlice.intensityMaxDb)
                      ? `${formatDb(acousticSlice.intensityMinDb)} / ${formatDb(acousticSlice.intensityMaxDb)}`
                      : t(locale, 'ai.stats.acousticUnavailable')}
                  </span>
                </div>
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">
                    {t(locale, 'ai.acoustic.sliceReliability')}
                  </span>
                  <span className="transcription-analysis-stats-value">
                    {acousticSlice.reliabilityMean != null
                      ? acousticSlice.reliabilityMean.toFixed(2)
                      : t(locale, 'ai.stats.acousticUnavailable')}
                  </span>
                </div>
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">
                    {t(locale, 'ai.acoustic.slicePitchTrend')}
                  </span>
                  <span className="transcription-analysis-stats-value">
                    {trendLabel[acousticSlice.pitchTrend]}
                  </span>
                </div>
                <div className="transcription-analysis-stats-row">
                  <span className="transcription-analysis-stats-label">
                    {t(locale, 'ai.acoustic.sliceIntensityTrend')}
                  </span>
                  <span className="transcription-analysis-stats-value">
                    {trendLabel[acousticSlice.intensityTrend]}
                  </span>
                </div>
              </div>
            ) : (
              <div className="transcription-analysis-acoustic-empty">
                {t(locale, 'ai.acoustic.inspectorHint')}
              </div>
            )}
          </PanelSection>
        ) : null}
      </>
    );
  },
);
