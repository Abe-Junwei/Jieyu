import { memo } from 'react';
import type { AnalysisBottomTab } from '../AiAnalysisPanel.types';
import type { AiAnalysisPanelAcousticTabModel } from '../useAiAnalysisPanelAcousticModel';
import { PanelSection } from '../ui/PanelSection';
import { t } from '../../i18n';
import { formatDb, formatDelta, formatHz } from '../ai/aiAnalysisPanelAcousticUtils';

export const AiAnalysisPanelAcousticInspectorSection = memo(
  function AiAnalysisPanelAcousticInspectorSection({
    activeTab,
    model,
  }: {
    activeTab: AnalysisBottomTab;
    model: AiAnalysisPanelAcousticTabModel;
  }) {
    const {
      locale,
      acousticInspector,
      pinnedInspector,
      acousticDescriptorFrame,
      pinnedDescriptorFrame,
      onJumpToAcousticHotspot,
      onPinInspector,
      onClearPinnedInspector,
      onSelectHotspot,
      hotspotKindLabel,
    } = model;

    return (
      <>
        {activeTab === 'acoustic' && (
          <PanelSection
            className="transcription-analysis-acoustic-section transcription-analysis-acoustic-inspector-section"
            title={t(locale, 'ai.acoustic.inspectorTitle')}
            description={t(locale, 'ai.acoustic.inspectorDescription')}
          >
            {acousticInspector || pinnedInspector ? (
              <div className="transcription-analysis-acoustic-panel">
                {/* ── Live inspector readout ── */}
                {acousticInspector ? (
                  <>
                    <div className="transcription-analysis-stats-row">
                      <span className="transcription-analysis-stats-label">
                        {t(locale, 'ai.acoustic.inspectorSource')}
                      </span>
                      <span className="transcription-analysis-stats-value">
                        {acousticInspector.source === 'spectrogram'
                          ? t(locale, 'ai.acoustic.inspectorSource.spectrogram')
                          : t(locale, 'ai.acoustic.inspectorSource.waveform')}
                      </span>
                    </div>
                    <div className="transcription-analysis-stats-row">
                      <span className="transcription-analysis-stats-label">
                        {t(locale, 'ai.acoustic.inspectorTime')}
                      </span>
                      <span className="transcription-analysis-stats-value">
                        {acousticInspector.timeSec.toFixed(2)}s
                      </span>
                    </div>
                    <div className="transcription-analysis-stats-row">
                      <span className="transcription-analysis-stats-label">
                        {t(locale, 'ai.acoustic.inspectorFrequency')}
                      </span>
                      <span className="transcription-analysis-stats-value">
                        {typeof acousticInspector.frequencyHz === 'number'
                          ? `${Math.round(acousticInspector.frequencyHz)} Hz`
                          : t(locale, 'ai.stats.acousticUnavailable')}
                      </span>
                    </div>
                    <div className="transcription-analysis-stats-row">
                      <span className="transcription-analysis-stats-label">
                        {t(locale, 'ai.stats.acousticF0')}
                      </span>
                      <span className="transcription-analysis-stats-value">
                        {formatHz(acousticInspector.f0Hz) ??
                          t(locale, 'ai.stats.acousticUnavailable')}
                      </span>
                    </div>
                    <div className="transcription-analysis-stats-row">
                      <span className="transcription-analysis-stats-label">
                        {t(locale, 'ai.stats.acousticIntensityPeak')}
                      </span>
                      <span className="transcription-analysis-stats-value">
                        {formatDb(acousticInspector.intensityDb) ??
                          t(locale, 'ai.stats.acousticUnavailable')}
                      </span>
                    </div>
                  </>
                ) : null}
                {/* ── Pin/Unpin controls ── */}
                <div className="transcription-analysis-acoustic-inspector-actions">
                  {onPinInspector && acousticInspector ? (
                    <button
                      type="button"
                      className="transcription-analysis-acoustic-nav-btn"
                      onClick={onPinInspector}
                    >
                      {pinnedInspector
                        ? t(locale, 'ai.acoustic.inspectorUpdatePin')
                        : t(locale, 'ai.acoustic.inspectorPin')}
                    </button>
                  ) : null}
                  {onClearPinnedInspector && pinnedInspector ? (
                    <button
                      type="button"
                      className="transcription-analysis-acoustic-nav-btn"
                      onClick={onClearPinnedInspector}
                    >
                      {t(locale, 'ai.acoustic.inspectorUnpin')}
                    </button>
                  ) : null}
                </div>
                {/* ── Pinned (frozen) inspector readout ── */}
                {pinnedInspector ? (
                  <div className="transcription-analysis-acoustic-pinned-readout">
                    <div className="transcription-analysis-stats-row transcription-analysis-stats-row-accent">
                      <span className="transcription-analysis-stats-label transcription-analysis-stats-label-accent">
                        {t(locale, 'ai.acoustic.pinnedLabel')}
                      </span>
                      <span className="transcription-analysis-stats-value">
                        {pinnedInspector.timeSec.toFixed(2)}s
                      </span>
                    </div>
                    <div className="transcription-analysis-stats-row">
                      <span className="transcription-analysis-stats-label">
                        {t(locale, 'ai.stats.acousticF0')}
                      </span>
                      <span className="transcription-analysis-stats-value">
                        {formatHz(pinnedInspector.f0Hz) ??
                          t(locale, 'ai.stats.acousticUnavailable')}
                      </span>
                    </div>
                    <div className="transcription-analysis-stats-row">
                      <span className="transcription-analysis-stats-label">
                        {t(locale, 'ai.stats.acousticIntensityPeak')}
                      </span>
                      <span className="transcription-analysis-stats-value">
                        {formatDb(pinnedInspector.intensityDb) ??
                          t(locale, 'ai.stats.acousticUnavailable')}
                      </span>
                    </div>
                    {/* ── Dual-point comparison (live vs pinned) ── */}
                    {acousticInspector ? (
                      <div className="transcription-analysis-acoustic-comparison">
                        <div className="transcription-analysis-stats-row">
                          <span className="transcription-analysis-stats-label">
                            {t(locale, 'ai.acoustic.comparisonDeltaTime')}
                          </span>
                          <span className="transcription-analysis-stats-value">
                            {(acousticInspector.timeSec - pinnedInspector.timeSec).toFixed(3)}s
                          </span>
                        </div>
                        <div className="transcription-analysis-stats-row">
                          <span className="transcription-analysis-stats-label">
                            {t(locale, 'ai.acoustic.comparisonDeltaF0')}
                          </span>
                          <span className="transcription-analysis-stats-value">
                            {typeof acousticInspector.f0Hz === 'number' &&
                            typeof pinnedInspector.f0Hz === 'number'
                              ? `${(acousticInspector.f0Hz - pinnedInspector.f0Hz).toFixed(1)} Hz`
                              : t(locale, 'ai.stats.acousticUnavailable')}
                          </span>
                        </div>
                        <div className="transcription-analysis-stats-row">
                          <span className="transcription-analysis-stats-label">
                            {t(locale, 'ai.acoustic.comparisonDeltaIntensity')}
                          </span>
                          <span className="transcription-analysis-stats-value">
                            {typeof acousticInspector.intensityDb === 'number' &&
                            typeof pinnedInspector.intensityDb === 'number'
                              ? `${(acousticInspector.intensityDb - pinnedInspector.intensityDb).toFixed(1)} dB`
                              : t(locale, 'ai.stats.acousticUnavailable')}
                          </span>
                        </div>
                        <div className="transcription-analysis-stats-row">
                          <span className="transcription-analysis-stats-label">
                            {t(locale, 'ai.acoustic.comparisonDeltaSpectralCentroid')}
                          </span>
                          <span className="transcription-analysis-stats-value">
                            {formatDelta(
                              acousticDescriptorFrame?.spectralCentroidHz,
                              pinnedDescriptorFrame?.spectralCentroidHz,
                              'Hz',
                              0,
                            ) ?? t(locale, 'ai.stats.acousticUnavailable')}
                          </span>
                        </div>
                        <div className="transcription-analysis-stats-row">
                          <span className="transcription-analysis-stats-label">
                            {t(locale, 'ai.acoustic.comparisonDeltaSpectralRolloff')}
                          </span>
                          <span className="transcription-analysis-stats-value">
                            {formatDelta(
                              acousticDescriptorFrame?.spectralRolloffHz,
                              pinnedDescriptorFrame?.spectralRolloffHz,
                              'Hz',
                              0,
                            ) ?? t(locale, 'ai.stats.acousticUnavailable')}
                          </span>
                        </div>
                        <div className="transcription-analysis-stats-row">
                          <span className="transcription-analysis-stats-label">
                            {t(locale, 'ai.acoustic.comparisonDeltaFormantF1')}
                          </span>
                          <span className="transcription-analysis-stats-value">
                            {formatDelta(
                              acousticDescriptorFrame?.formantF1Hz,
                              pinnedDescriptorFrame?.formantF1Hz,
                              'Hz',
                              0,
                            ) ?? t(locale, 'ai.stats.acousticUnavailable')}
                          </span>
                        </div>
                        <div className="transcription-analysis-stats-row">
                          <span className="transcription-analysis-stats-label">
                            {t(locale, 'ai.acoustic.comparisonDeltaFormantF2')}
                          </span>
                          <span className="transcription-analysis-stats-value">
                            {formatDelta(
                              acousticDescriptorFrame?.formantF2Hz,
                              pinnedDescriptorFrame?.formantF2Hz,
                              'Hz',
                              0,
                            ) ?? t(locale, 'ai.stats.acousticUnavailable')}
                          </span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {/* ── Hotspot match info ── */}
                {acousticInspector ? (
                  <>
                    <div className="transcription-analysis-stats-row">
                      <span className="transcription-analysis-stats-label">
                        {t(locale, 'ai.acoustic.inspectorSelectionState')}
                      </span>
                      <span className="transcription-analysis-stats-value">
                        {acousticInspector.inSelection === false
                          ? t(locale, 'ai.acoustic.inspectorSelectionState.outside')
                          : t(locale, 'ai.acoustic.inspectorSelectionState.inside')}
                      </span>
                    </div>
                    <div className="transcription-analysis-stats-row">
                      <span className="transcription-analysis-stats-label">
                        {t(locale, 'ai.acoustic.inspectorNearestHotspot')}
                      </span>
                      <span className="transcription-analysis-stats-value">
                        {acousticInspector.matchedHotspotKind
                          ? `${hotspotKindLabel[acousticInspector.matchedHotspotKind]} · ${(acousticInspector.matchedHotspotTimeSec ?? acousticInspector.timeSec).toFixed(2)}s`
                          : t(locale, 'ai.acoustic.topHotspotNone')}
                      </span>
                    </div>
                    {acousticInspector.matchedHotspotTimeSec != null && onJumpToAcousticHotspot ? (
                      <div className="transcription-analysis-acoustic-inspector-actions">
                        <button
                          type="button"
                          className="transcription-analysis-acoustic-nav-btn"
                          onClick={() => {
                            onSelectHotspot?.(acousticInspector.matchedHotspotTimeSec as number);
                            onJumpToAcousticHotspot(
                              acousticInspector.matchedHotspotTimeSec as number,
                            );
                          }}
                        >
                          {t(locale, 'ai.acoustic.inspectorJumpHotspot')}
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : (
              <div className="transcription-analysis-acoustic-empty">
                {t(locale, 'ai.acoustic.inspectorHint')}
              </div>
            )}
          </PanelSection>
        )}
      </>
    );
  },
);
