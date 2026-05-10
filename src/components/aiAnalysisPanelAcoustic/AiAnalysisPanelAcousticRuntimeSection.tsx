import { memo } from 'react';
import type { AnalysisBottomTab } from '../AiAnalysisPanel.types';
import type { AiAnalysisPanelAcousticTabModel } from '../useAiAnalysisPanelAcousticModel';
import { PanelSection } from '../ui/PanelSection';
import { PanelChip } from '../ui';
import { t } from '../../i18n';
import {
  ACOUSTIC_ANALYSIS_PRESETS,
  type AcousticAnalysisPresetKey,
} from '../../utils/acousticAnalysisPresets';

export const AiAnalysisPanelAcousticRuntimeSection = memo(
  function AiAnalysisPanelAcousticRuntimeSection({
    activeTab,
    model,
    vadCacheLabel,
  }: {
    activeTab: AnalysisBottomTab;
    model: AiAnalysisPanelAcousticTabModel;
    vadCacheLabel: string;
  }) {
    const {
      locale,
      acousticDetail,
      acousticRuntimeStatus,
      acousticRuntimeLabel,
      acousticRuntimeErrorSummary,
      acousticRuntimeErrorMessage,
      onChangeAcousticConfig,
      onResetAcousticConfig,
      activePreset,
      draftAcousticConfigOverride,
      effectiveDraftAcousticConfig,
      hasPendingAcousticConfigChanges,
      handlePresetChange,
      handleNumericConfigChange,
      handleResetAcousticConfigDraft,
      handleApplyAcousticConfig,
    } = model;

    return (
      <>
        {activeTab === 'acoustic' &&
        (acousticDetail ||
          acousticRuntimeStatus?.state === 'loading' ||
          acousticRuntimeStatus?.state === 'ready' ||
          acousticRuntimeStatus?.state === 'error') ? (
          <PanelSection
            className="transcription-analysis-acoustic-section transcription-analysis-acoustic-runtime-section"
            title={t(locale, 'ai.acoustic.runtimeTitle')}
            description={t(locale, 'ai.acoustic.runtimeDescription')}
          >
            <div className="transcription-analysis-acoustic-panel">
              <div className="transcription-analysis-stats-row">
                <span className="transcription-analysis-stats-label">
                  {t(locale, 'ai.acoustic.runtimeAlgorithm')}
                </span>
                <span className="transcription-analysis-stats-value">
                  {acousticDetail?.algorithmVersion ?? t(locale, 'ai.stats.acousticUnavailable')}
                </span>
              </div>
              <div className="transcription-analysis-stats-row">
                <span className="transcription-analysis-stats-label">
                  {t(locale, 'ai.acoustic.runtimeSampleRate')}
                </span>
                <span className="transcription-analysis-stats-value">
                  {typeof acousticDetail?.sampleRate === 'number'
                    ? `${acousticDetail.sampleRate} Hz`
                    : t(locale, 'ai.stats.acousticUnavailable')}
                </span>
              </div>
              <div className="transcription-analysis-stats-row">
                <span className="transcription-analysis-stats-label">
                  {t(locale, 'ai.acoustic.runtimeWindow')}
                </span>
                <span className="transcription-analysis-stats-value">
                  {typeof acousticDetail?.analysisWindowSec === 'number' &&
                  typeof acousticDetail?.frameStepSec === 'number'
                    ? `${acousticDetail.analysisWindowSec.toFixed(3)}s / ${acousticDetail.frameStepSec.toFixed(3)}s`
                    : t(locale, 'ai.stats.acousticUnavailable')}
                </span>
              </div>
              <div className="transcription-analysis-stats-row">
                <span className="transcription-analysis-stats-label">
                  {t(locale, 'ai.acoustic.runtimeThreshold')}
                </span>
                <span className="transcription-analysis-stats-value">
                  {typeof acousticDetail?.yinThreshold === 'number' &&
                  typeof acousticDetail?.silenceRmsThreshold === 'number'
                    ? `YIN ${acousticDetail.yinThreshold.toFixed(2)} · RMS ${acousticDetail.silenceRmsThreshold.toFixed(3)}`
                    : t(locale, 'ai.stats.acousticUnavailable')}
                </span>
              </div>
              <div className="transcription-analysis-stats-row">
                <span className="transcription-analysis-stats-label">
                  {t(locale, 'ai.acoustic.runtimeProgress')}
                </span>
                <span className="transcription-analysis-stats-value">{acousticRuntimeLabel}</span>
              </div>
              {acousticRuntimeErrorSummary ? (
                <p className="transcription-analysis-acoustic-export-note">
                  {acousticRuntimeErrorSummary}
                </p>
              ) : null}
              {acousticRuntimeErrorMessage ? (
                <details className="transcription-analysis-acoustic-export-note">
                  <summary>{t(locale, 'ai.acoustic.runtimeErrorDetails')}</summary>
                  <p className="transcription-analysis-acoustic-export-note">
                    {acousticRuntimeErrorMessage}
                  </p>
                </details>
              ) : null}
              <div className="transcription-analysis-stats-row">
                <span className="transcription-analysis-stats-label">
                  {t(locale, 'ai.acoustic.runtimeVad')}
                </span>
                <span className="transcription-analysis-stats-value">{vadCacheLabel}</span>
              </div>
              {/* ── Wave B: Parameter presets ── */}
              {onChangeAcousticConfig ? (
                <div className="transcription-analysis-acoustic-param-presets">
                  <div className="transcription-analysis-stats-row">
                    <span className="transcription-analysis-stats-label">
                      {t(locale, 'ai.acoustic.paramPreset')}
                    </span>
                    <span className="transcription-analysis-stats-value">
                      <select
                        className="transcription-analysis-acoustic-preset-select"
                        value={activePreset}
                        onChange={(event) =>
                          handlePresetChange(event.target.value as AcousticAnalysisPresetKey)
                        }
                      >
                        {ACOUSTIC_ANALYSIS_PRESETS.map((preset) => (
                          <option
                            key={preset.key}
                            value={preset.key}
                            disabled={preset.key === 'custom'}
                          >
                            {preset.label}
                          </option>
                        ))}
                      </select>
                    </span>
                  </div>
                  {activePreset === 'custom' ? (
                    <div className="transcription-analysis-stats-row">
                      <span className="transcription-analysis-stats-label">
                        {t(locale, 'ai.acoustic.paramOverride')}
                      </span>
                      <span className="transcription-analysis-stats-value">
                        <PanelChip variant="warning">
                          {t(locale, 'ai.acoustic.paramCustomActive')}
                        </PanelChip>
                      </span>
                    </div>
                  ) : null}
                  <div className="transcription-analysis-acoustic-param-grid">
                    <label className="transcription-analysis-acoustic-param-field">
                      <span>{t(locale, 'ai.acoustic.paramPitchFloor')}</span>
                      <input
                        className="transcription-analysis-acoustic-param-input"
                        type="number"
                        min={30}
                        max={500}
                        step={1}
                        value={effectiveDraftAcousticConfig.pitchFloorHz}
                        onChange={handleNumericConfigChange('pitchFloorHz')}
                      />
                    </label>
                    <label className="transcription-analysis-acoustic-param-field">
                      <span>{t(locale, 'ai.acoustic.paramPitchCeiling')}</span>
                      <input
                        className="transcription-analysis-acoustic-param-input"
                        type="number"
                        min={80}
                        max={1200}
                        step={1}
                        value={effectiveDraftAcousticConfig.pitchCeilingHz}
                        onChange={handleNumericConfigChange('pitchCeilingHz')}
                      />
                    </label>
                    <label className="transcription-analysis-acoustic-param-field">
                      <span>{t(locale, 'ai.acoustic.paramWindow')}</span>
                      <input
                        className="transcription-analysis-acoustic-param-input"
                        type="number"
                        min={0.01}
                        max={0.12}
                        step={0.001}
                        value={effectiveDraftAcousticConfig.analysisWindowSec}
                        onChange={handleNumericConfigChange('analysisWindowSec')}
                      />
                    </label>
                    <label className="transcription-analysis-acoustic-param-field">
                      <span>{t(locale, 'ai.acoustic.paramFrameStep')}</span>
                      <input
                        className="transcription-analysis-acoustic-param-input"
                        type="number"
                        min={0.002}
                        max={0.04}
                        step={0.001}
                        value={effectiveDraftAcousticConfig.frameStepSec}
                        onChange={handleNumericConfigChange('frameStepSec')}
                      />
                    </label>
                    <label className="transcription-analysis-acoustic-param-field">
                      <span>{t(locale, 'ai.acoustic.paramSilenceThreshold')}</span>
                      <input
                        className="transcription-analysis-acoustic-param-input"
                        type="number"
                        min={0.001}
                        max={0.2}
                        step={0.001}
                        value={effectiveDraftAcousticConfig.silenceRmsThreshold}
                        onChange={handleNumericConfigChange('silenceRmsThreshold')}
                      />
                    </label>
                  </div>
                  {onChangeAcousticConfig || onResetAcousticConfig ? (
                    <div className="transcription-analysis-acoustic-inspector-actions">
                      <button
                        type="button"
                        className="transcription-analysis-acoustic-nav-btn"
                        onClick={handleResetAcousticConfigDraft}
                      >
                        {t(locale, 'ai.acoustic.paramResetDraft')}
                      </button>
                      <button
                        type="button"
                        className="transcription-analysis-acoustic-nav-btn"
                        onClick={handleApplyAcousticConfig}
                        disabled={
                          !hasPendingAcousticConfigChanges ||
                          (!draftAcousticConfigOverride && !onResetAcousticConfig) ||
                          (Boolean(draftAcousticConfigOverride) && !onChangeAcousticConfig)
                        }
                      >
                        {t(locale, 'ai.acoustic.paramApply')}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </PanelSection>
        ) : null}
      </>
    );
  },
);
