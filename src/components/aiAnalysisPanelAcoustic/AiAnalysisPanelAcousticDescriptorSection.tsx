import { memo } from 'react';
import type { AnalysisBottomTab } from '../AiAnalysisPanel.types';
import type { AiAnalysisPanelAcousticTabModel } from '../useAiAnalysisPanelAcousticModel';
import { PanelSection } from '../ui/PanelSection';
import { t } from '../../i18n';
import {
  formatCoefficients,
  formatDb,
  formatHz,
  formatScalar,
  formatZeroCrossing,
} from '../ai/aiAnalysisPanelAcousticUtils';

export const AiAnalysisPanelAcousticDescriptorSection = memo(
  function AiAnalysisPanelAcousticDescriptorSection({
    activeTab,
    model,
  }: {
    activeTab: AnalysisBottomTab;
    model: AiAnalysisPanelAcousticTabModel;
  }) {
    const { locale, acousticSummary, acousticDetail, acousticDescriptorFrame } = model;

    return (
      <>
        {activeTab === 'acoustic' && acousticDetail ? (
          <PanelSection
            className="transcription-analysis-acoustic-section transcription-analysis-acoustic-descriptor-section"
            title={t(locale, 'ai.acoustic.descriptorTitle')}
            description={t(locale, 'ai.acoustic.descriptorDescription')}
          >
            <div className="transcription-analysis-acoustic-panel">
              <div className="transcription-analysis-stats-row">
                <span className="transcription-analysis-stats-label">
                  {t(locale, 'ai.acoustic.descriptorCentroidMean')}
                </span>
                <span className="transcription-analysis-stats-value">
                  {formatHz(acousticSummary?.spectralCentroidMeanHz) ??
                    t(locale, 'ai.stats.acousticUnavailable')}
                </span>
              </div>
              <div className="transcription-analysis-stats-row">
                <span className="transcription-analysis-stats-label">
                  {t(locale, 'ai.acoustic.descriptorRolloffMean')}
                </span>
                <span className="transcription-analysis-stats-value">
                  {formatHz(acousticSummary?.spectralRolloffMeanHz) ??
                    t(locale, 'ai.stats.acousticUnavailable')}
                </span>
              </div>
              <div className="transcription-analysis-stats-row">
                <span className="transcription-analysis-stats-label">
                  {t(locale, 'ai.acoustic.descriptorZeroCrossingMean')}
                </span>
                <span className="transcription-analysis-stats-value">
                  {formatZeroCrossing(acousticSummary?.zeroCrossingRateMean) ??
                    t(locale, 'ai.stats.acousticUnavailable')}
                </span>
              </div>
              <div className="transcription-analysis-stats-row">
                <span className="transcription-analysis-stats-label">
                  {t(locale, 'ai.acoustic.descriptorFlatnessMean')}
                </span>
                <span className="transcription-analysis-stats-value">
                  {formatScalar(acousticSummary?.spectralFlatnessMean) ??
                    t(locale, 'ai.stats.acousticUnavailable')}
                </span>
              </div>
              <div className="transcription-analysis-stats-row">
                <span className="transcription-analysis-stats-label">
                  {t(locale, 'ai.acoustic.descriptorLoudnessMean')}
                </span>
                <span className="transcription-analysis-stats-value">
                  {formatDb(acousticSummary?.loudnessMeanDb) ??
                    t(locale, 'ai.stats.acousticUnavailable')}
                </span>
              </div>
              <div className="transcription-analysis-stats-row">
                <span className="transcription-analysis-stats-label">
                  {t(locale, 'ai.acoustic.descriptorMfccMean')}
                </span>
                <span className="transcription-analysis-stats-value">
                  {formatCoefficients(acousticSummary?.mfccMeanCoefficients) ??
                    t(locale, 'ai.stats.acousticUnavailable')}
                </span>
              </div>
              <div className="transcription-analysis-stats-row">
                <span className="transcription-analysis-stats-label">
                  {t(locale, 'ai.acoustic.descriptorCentroidCurrent')}
                </span>
                <span className="transcription-analysis-stats-value">
                  {formatHz(acousticDescriptorFrame?.spectralCentroidHz) ??
                    t(locale, 'ai.stats.acousticUnavailable')}
                </span>
              </div>
              <div className="transcription-analysis-stats-row">
                <span className="transcription-analysis-stats-label">
                  {t(locale, 'ai.acoustic.descriptorRolloffCurrent')}
                </span>
                <span className="transcription-analysis-stats-value">
                  {formatHz(acousticDescriptorFrame?.spectralRolloffHz) ??
                    t(locale, 'ai.stats.acousticUnavailable')}
                </span>
              </div>
              <div className="transcription-analysis-stats-row">
                <span className="transcription-analysis-stats-label">
                  {t(locale, 'ai.acoustic.descriptorZeroCrossingCurrent')}
                </span>
                <span className="transcription-analysis-stats-value">
                  {formatZeroCrossing(acousticDescriptorFrame?.zeroCrossingRate) ??
                    t(locale, 'ai.stats.acousticUnavailable')}
                </span>
              </div>
              <div className="transcription-analysis-stats-row">
                <span className="transcription-analysis-stats-label">
                  {t(locale, 'ai.acoustic.descriptorFlatnessCurrent')}
                </span>
                <span className="transcription-analysis-stats-value">
                  {formatScalar(acousticDescriptorFrame?.spectralFlatness) ??
                    t(locale, 'ai.stats.acousticUnavailable')}
                </span>
              </div>
              <div className="transcription-analysis-stats-row">
                <span className="transcription-analysis-stats-label">
                  {t(locale, 'ai.acoustic.descriptorLoudnessCurrent')}
                </span>
                <span className="transcription-analysis-stats-value">
                  {formatDb(acousticDescriptorFrame?.loudnessDb) ??
                    t(locale, 'ai.stats.acousticUnavailable')}
                </span>
              </div>
              <div className="transcription-analysis-stats-row">
                <span className="transcription-analysis-stats-label">
                  {t(locale, 'ai.acoustic.descriptorMfccCurrent')}
                </span>
                <span className="transcription-analysis-stats-value">
                  {formatCoefficients(acousticDescriptorFrame?.mfccCoefficients) ??
                    t(locale, 'ai.stats.acousticUnavailable')}
                </span>
              </div>
            </div>
          </PanelSection>
        ) : null}
      </>
    );
  },
);
