import { memo } from 'react';
import type { AnalysisBottomTab } from '../AiAnalysisPanel.types';
import type { AiAnalysisPanelAcousticTabModel } from '../useAiAnalysisPanelAcousticModel';
import { PanelSection } from '../ui/PanelSection';
import { PanelChip } from '../ui';
import { t, tf } from '../../i18n';
import { formatDb, formatHz, formatRatio } from '../ai/aiAnalysisPanelAcousticUtils';

export const AiAnalysisPanelAcousticHotspotsSection = memo(
  function AiAnalysisPanelAcousticHotspotsSection({
    activeTab,
    model,
  }: {
    activeTab: AnalysisBottomTab;
    model: AiAnalysisPanelAcousticTabModel;
  }) {
    const {
      locale,
      acousticSummary,
      acousticHotspotCount,
      selectedHotspotTimeSec,
      onSelectHotspot,
      onJumpToAcousticHotspot,
      hotspotKindLabel,
      hotspotExplanation,
    } = model;

    return (
      <>
        {activeTab === 'acoustic' && acousticSummary ? (
          <PanelSection
            className="transcription-analysis-acoustic-section transcription-analysis-acoustic-hotspots-section"
            title={t(locale, 'ai.stats.acousticHotspots')}
            description={t(locale, 'ai.acoustic.hotspotsDescription')}
            meta={<PanelChip>{acousticHotspotCount}</PanelChip>}
          >
            {acousticSummary.hotspots && acousticSummary.hotspots.length > 0 ? (
              <div className="transcription-analysis-acoustic-hotspots-list">
                {acousticSummary.hotspots.map((hotspot) => {
                  const hotspotRange =
                    typeof hotspot.startSec === 'number' && typeof hotspot.endSec === 'number'
                      ? `${hotspot.startSec.toFixed(2)}-${hotspot.endSec.toFixed(2)}s`
                      : `${hotspot.timeSec.toFixed(2)}s`;
                  const hotspotF0 = formatHz(hotspot.f0Hz);
                  const hotspotIntensity = formatDb(hotspot.intensityDb);
                  const hotspotReliability = formatRatio(hotspot.reliability);
                  const isSelectedHotspot =
                    selectedHotspotTimeSec != null &&
                    Math.abs(selectedHotspotTimeSec - hotspot.timeSec) <= 0.01;

                  return (
                    <button
                      key={`${hotspot.kind}-${hotspot.timeSec}`}
                      type="button"
                      className={`transcription-analysis-acoustic-hotspot transcription-analysis-acoustic-hotspot-detailed${isSelectedHotspot ? ' is-selected' : ''}`}
                      onClick={() => {
                        onSelectHotspot?.(hotspot.timeSec);
                        onJumpToAcousticHotspot?.(hotspot.timeSec);
                      }}
                      title={tf(locale, 'ai.stats.acousticHotspotJump', {
                        kind: hotspotKindLabel[hotspot.kind],
                        timeSec: hotspot.timeSec.toFixed(2),
                      })}
                      aria-pressed={isSelectedHotspot}
                      disabled={!onJumpToAcousticHotspot}
                    >
                      <div className="transcription-analysis-acoustic-hotspot-head">
                        <span className="transcription-analysis-acoustic-hotspot-kind">
                          {hotspotKindLabel[hotspot.kind]}
                        </span>
                        <span className="transcription-analysis-acoustic-hotspot-time">
                          {hotspot.timeSec.toFixed(2)}s
                        </span>
                      </div>
                      <p className="transcription-analysis-acoustic-hotspot-description">
                        {hotspotExplanation[hotspot.kind]}
                      </p>
                      <div className="transcription-analysis-acoustic-hotspot-meta">
                        <PanelChip>
                          {tf(locale, 'ai.acoustic.hotspotScore', {
                            score: Math.round(hotspot.score * 100),
                          })}
                        </PanelChip>
                        <PanelChip>
                          {tf(locale, 'ai.acoustic.hotspotWindow', { window: hotspotRange })}
                        </PanelChip>
                        {hotspotF0 ? (
                          <PanelChip>
                            {tf(locale, 'ai.acoustic.hotspotF0', { value: hotspotF0 })}
                          </PanelChip>
                        ) : null}
                        {hotspotIntensity ? (
                          <PanelChip>
                            {tf(locale, 'ai.acoustic.hotspotIntensity', {
                              value: hotspotIntensity,
                            })}
                          </PanelChip>
                        ) : null}
                        {hotspotReliability ? (
                          <PanelChip>
                            {tf(locale, 'ai.acoustic.hotspotReliability', {
                              value: hotspotReliability,
                            })}
                          </PanelChip>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="transcription-analysis-acoustic-empty">
                {t(locale, 'ai.acoustic.topHotspotNone')}
              </div>
            )}
          </PanelSection>
        ) : null}
      </>
    );
  },
);
