import { memo } from 'react';
import type { AnalysisBottomTab } from '../AiAnalysisPanel.types';
import type { AiAnalysisPanelAcousticTabModel } from '../useAiAnalysisPanelAcousticModel';
import { PanelSection } from '../ui/PanelSection';
import { PanelChip } from '../ui';
import { t, tf } from '../../i18n';

export const AiAnalysisPanelAcousticToneSection = memo(function AiAnalysisPanelAcousticToneSection({
  activeTab,
  model,
}: {
  activeTab: AnalysisBottomTab;
  model: AiAnalysisPanelAcousticTabModel;
}) {
  const { locale, acousticDetail, toneF0Path, toneIntensityPath } = model;

  return (
    <>
      {activeTab === 'acoustic' && acousticDetail ? (
        <PanelSection
          className="transcription-analysis-acoustic-section transcription-analysis-acoustic-tone-section"
          title={t(locale, 'ai.acoustic.toneTitle')}
          description={t(locale, 'ai.acoustic.toneDescription')}
          meta={
            <PanelChip>
              {tf(locale, 'ai.acoustic.exportSampleCount', {
                count: acousticDetail.sampleCount,
              })}
            </PanelChip>
          }
        >
          {acousticDetail.toneBins.length > 0 ? (
            <div className="transcription-analysis-acoustic-tone-card">
              <div className="transcription-analysis-acoustic-tone-legend">
                <span className="transcription-analysis-acoustic-tone-legend-item transcription-analysis-acoustic-tone-legend-item-f0">
                  {t(locale, 'ai.acoustic.toneLegendF0')}
                </span>
                <span className="transcription-analysis-acoustic-tone-legend-item transcription-analysis-acoustic-tone-legend-item-intensity">
                  {t(locale, 'ai.acoustic.toneLegendIntensity')}
                </span>
              </div>
              <div
                className="transcription-analysis-acoustic-tone-chart"
                role="img"
                aria-label={t(locale, 'ai.acoustic.toneTitle')}
              >
                <svg viewBox="0 0 120 42" preserveAspectRatio="none" aria-hidden="true">
                  <path
                    className="transcription-analysis-acoustic-tone-grid"
                    d="M2 8 H118 M2 21 H118 M2 34 H118"
                  />
                  {toneIntensityPath ? (
                    <path
                      className="transcription-analysis-acoustic-tone-line transcription-analysis-acoustic-tone-line-intensity"
                      d={toneIntensityPath}
                    />
                  ) : null}
                  {toneF0Path ? (
                    <path
                      className="transcription-analysis-acoustic-tone-line transcription-analysis-acoustic-tone-line-f0"
                      d={toneF0Path}
                    />
                  ) : null}
                </svg>
              </div>
              <div className="transcription-analysis-acoustic-tone-footer">
                <span>{acousticDetail.selectionStartSec.toFixed(2)}s</span>
                <span>{acousticDetail.selectionEndSec.toFixed(2)}s</span>
              </div>
            </div>
          ) : (
            <div className="transcription-analysis-acoustic-empty">
              {t(locale, 'ai.acoustic.toneEmpty')}
            </div>
          )}
        </PanelSection>
      ) : null}
    </>
  );
});
