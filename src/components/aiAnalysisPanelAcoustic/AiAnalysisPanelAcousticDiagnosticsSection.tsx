import { memo } from 'react';
import type { AnalysisBottomTab } from '../AiAnalysisPanel.types';
import type { AiAnalysisPanelAcousticTabModel } from '../useAiAnalysisPanelAcousticModel';
import { PanelSection } from '../ui/PanelSection';
import { PanelChip } from '../ui';
import { t } from '../../i18n';

export const AiAnalysisPanelAcousticDiagnosticsSection = memo(
  function AiAnalysisPanelAcousticDiagnosticsSection({
    activeTab,
    model,
  }: {
    activeTab: AnalysisBottomTab;
    model: AiAnalysisPanelAcousticTabModel;
  }) {
    const { locale, acousticSummary, diagnosticLabel } = model;

    return (
      <>
        {activeTab === 'acoustic' && acousticSummary ? (
          <PanelSection
            className="transcription-analysis-acoustic-section transcription-analysis-acoustic-diagnostics-section"
            title={t(locale, 'ai.acoustic.diagnosticsTitle')}
            description={t(locale, 'ai.acoustic.diagnosticsDescription')}
          >
            {acousticSummary.diagnostics && acousticSummary.diagnostics.length > 0 ? (
              <div className="transcription-analysis-acoustic-diagnostics-list">
                {acousticSummary.diagnostics.map((diagnostic) => (
                  <div key={diagnostic} className="transcription-analysis-acoustic-diagnostic-item">
                    <PanelChip variant="warning">{diagnosticLabel[diagnostic]}</PanelChip>
                  </div>
                ))}
              </div>
            ) : (
              <div className="transcription-analysis-acoustic-empty">
                {t(locale, 'ai.acoustic.diagnosticsEmpty')}
              </div>
            )}
          </PanelSection>
        ) : null}
      </>
    );
  },
);
