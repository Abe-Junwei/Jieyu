import { memo } from 'react';
import type { AnalysisBottomTab } from '../AiAnalysisPanel.types';
import type { AiAnalysisPanelAcousticTabModel } from '../useAiAnalysisPanelAcousticModel';
import { PanelSection } from '../ui/PanelSection';
import { t } from '../../i18n';

export const AiAnalysisPanelAcousticNavigationSection = memo(
  function AiAnalysisPanelAcousticNavigationSection({
    activeTab,
    model,
  }: {
    activeTab: AnalysisBottomTab;
    model: AiAnalysisPanelAcousticTabModel;
  }) {
    const { locale, acousticSummary, topHotspot, onSelectHotspot, onJumpToAcousticHotspot } = model;

    return (
      <>
        {activeTab === 'acoustic' && acousticSummary ? (
          <PanelSection
            className="transcription-analysis-acoustic-section transcription-analysis-acoustic-navigation-section"
            title={t(locale, 'ai.acoustic.navigationTitle')}
            description={t(locale, 'ai.acoustic.navigationDescription')}
          >
            <div className="transcription-analysis-acoustic-navigation-list">
              <button
                type="button"
                className="transcription-analysis-acoustic-nav-btn"
                onClick={() => {
                  onSelectHotspot?.(null);
                  onJumpToAcousticHotspot?.(acousticSummary.selectionStartSec);
                }}
                disabled={!onJumpToAcousticHotspot}
              >
                {t(locale, 'ai.acoustic.jumpSelectionStart')}
              </button>
              <button
                type="button"
                className="transcription-analysis-acoustic-nav-btn"
                onClick={() => {
                  onSelectHotspot?.(null);
                  onJumpToAcousticHotspot?.(acousticSummary.selectionEndSec);
                }}
                disabled={!onJumpToAcousticHotspot}
              >
                {t(locale, 'ai.acoustic.jumpSelectionEnd')}
              </button>
              <button
                type="button"
                className="transcription-analysis-acoustic-nav-btn"
                onClick={() => {
                  if (!topHotspot) return;
                  onSelectHotspot?.(topHotspot.timeSec);
                  onJumpToAcousticHotspot?.(topHotspot.timeSec);
                }}
                disabled={!onJumpToAcousticHotspot || !topHotspot}
              >
                {t(locale, 'ai.acoustic.jumpTopHotspot')}
              </button>
            </div>
          </PanelSection>
        ) : null}
      </>
    );
  },
);
