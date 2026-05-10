import { memo } from 'react';
import type { AnalysisBottomTab } from '../AiAnalysisPanel.types';
import type { AiAnalysisPanelAcousticTabModel } from '../useAiAnalysisPanelAcousticModel';
import { PanelSection } from '../ui/PanelSection';
import { PanelChip } from '../ui';
import { t } from '../../i18n';
import { formatHz } from '../ai/aiAnalysisPanelAcousticUtils';

export const AiAnalysisPanelAcousticFormantSection = memo(
  function AiAnalysisPanelAcousticFormantSection({
    activeTab,
    model,
  }: {
    activeTab: AnalysisBottomTab;
    model: AiAnalysisPanelAcousticTabModel;
  }) {
    const {
      locale,
      acousticSummary,
      acousticDetail,
      acousticDescriptorFrame,
      acousticCalibrationStatus,
      vowelSpacePoints,
    } = model;

    return (
      <>
        {activeTab === 'acoustic' && acousticDetail ? (
          <PanelSection
            className="transcription-analysis-acoustic-section transcription-analysis-acoustic-formant-section"
            title={t(locale, 'ai.acoustic.formantTitle')}
            description={t(locale, 'ai.acoustic.formantDescription')}
            meta={
              acousticCalibrationStatus === 'calibrated' ? (
                <PanelChip>{t(locale, 'ai.acoustic.formantCalibrated')}</PanelChip>
              ) : (
                <PanelChip variant="warning">
                  {t(locale, 'ai.acoustic.formantExploratory')}
                </PanelChip>
              )
            }
          >
            <div className="transcription-analysis-acoustic-panel">
              <div className="transcription-analysis-stats-row">
                <span className="transcription-analysis-stats-label">
                  {t(locale, 'ai.acoustic.formantF1Mean')}
                </span>
                <span className="transcription-analysis-stats-value">
                  {formatHz(acousticSummary?.formantF1MeanHz) ??
                    t(locale, 'ai.stats.acousticUnavailable')}
                </span>
              </div>
              <div className="transcription-analysis-stats-row">
                <span className="transcription-analysis-stats-label">
                  {t(locale, 'ai.acoustic.formantF2Mean')}
                </span>
                <span className="transcription-analysis-stats-value">
                  {formatHz(acousticSummary?.formantF2MeanHz) ??
                    t(locale, 'ai.stats.acousticUnavailable')}
                </span>
              </div>
              <div className="transcription-analysis-stats-row">
                <span className="transcription-analysis-stats-label">
                  {t(locale, 'ai.acoustic.formantF1Current')}
                </span>
                <span className="transcription-analysis-stats-value">
                  {formatHz(acousticDescriptorFrame?.formantF1Hz) ??
                    t(locale, 'ai.stats.acousticUnavailable')}
                </span>
              </div>
              <div className="transcription-analysis-stats-row">
                <span className="transcription-analysis-stats-label">
                  {t(locale, 'ai.acoustic.formantF2Current')}
                </span>
                <span className="transcription-analysis-stats-value">
                  {formatHz(acousticDescriptorFrame?.formantF2Hz) ??
                    t(locale, 'ai.stats.acousticUnavailable')}
                </span>
              </div>
              <div className="transcription-analysis-stats-row">
                <span className="transcription-analysis-stats-label">
                  {t(locale, 'ai.acoustic.vowelSpread')}
                </span>
                <span className="transcription-analysis-stats-value">
                  {typeof acousticSummary?.vowelSpaceSpread === 'number'
                    ? `${Math.round(acousticSummary.vowelSpaceSpread)} Hz`
                    : t(locale, 'ai.stats.acousticUnavailable')}
                </span>
              </div>
              {vowelSpacePoints.length > 0 ? (
                <div className="transcription-analysis-acoustic-tone-card">
                  <div className="transcription-analysis-acoustic-tone-legend">
                    <span className="transcription-analysis-acoustic-tone-legend-item transcription-analysis-acoustic-tone-legend-item-f0">
                      {t(locale, 'ai.acoustic.vowelSpaceLegend')}
                    </span>
                  </div>
                  <div
                    className="transcription-analysis-acoustic-tone-chart"
                    role="img"
                    aria-label={t(locale, 'ai.acoustic.vowelSpaceTitle')}
                  >
                    <svg viewBox="0 0 120 52" preserveAspectRatio="none" aria-hidden="true">
                      <path
                        className="transcription-analysis-acoustic-tone-grid"
                        d="M6 6 H114 V46 H6 Z"
                      />
                      {vowelSpacePoints.map((point, index) => (
                        <circle
                          key={`vowel-${index}-${point.f1Hz.toFixed(1)}-${point.f2Hz.toFixed(1)}`}
                          cx={point.x.toFixed(2)}
                          cy={point.y.toFixed(2)}
                          r="1.6"
                          className="transcription-analysis-acoustic-tone-line-intensity"
                        />
                      ))}
                    </svg>
                  </div>
                </div>
              ) : (
                <div className="transcription-analysis-acoustic-empty">
                  {t(locale, 'ai.acoustic.vowelSpaceEmpty')}
                </div>
              )}
            </div>
          </PanelSection>
        ) : null}
      </>
    );
  },
);
