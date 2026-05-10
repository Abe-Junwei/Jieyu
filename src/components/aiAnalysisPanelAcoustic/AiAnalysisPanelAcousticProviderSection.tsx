import { memo } from 'react';
import type { AnalysisBottomTab } from '../AiAnalysisPanel.types';
import type { AiAnalysisPanelAcousticTabModel } from '../useAiAnalysisPanelAcousticModel';
import { PanelSection } from '../ui/PanelSection';
import { PanelChip } from '../ui';
import { t } from '../../i18n';
import { acousticProviderDefinitions } from '../../services/acoustic/acousticProviderContract';
import { PROVIDER_PREFERENCE_AUTO } from '../ai/aiAnalysisPanelAcousticUtils';

export const AiAnalysisPanelAcousticProviderSection = memo(
  function AiAnalysisPanelAcousticProviderSection({
    activeTab,
    model,
  }: {
    activeTab: AnalysisBottomTab;
    model: AiAnalysisPanelAcousticTabModel;
  }) {
    const {
      locale,
      acousticProviderPreference,
      acousticProviderState,
      onChangeAcousticProvider,
      providerRuntimeConfig,
      providerHealthChecking,
      providerHealthResult,
      providerSaveMessage,
      providerHealthLabel,
      providerHealthMeta,
      providerConfigured,
      handleProviderRoutingStrategyChange,
      handleProviderExternalEnabledChange,
      handleProviderEndpointChange,
      handleProviderApiKeyChange,
      handleProviderTimeoutChange,
      handleReloadProviderConfig,
      handleSaveProviderConfig,
      handleCheckProviderHealth,
    } = model;

    return (
      <>
        {/* ── Wave E: Provider extension section ── */}
        {activeTab === 'acoustic' ? (
          <PanelSection
            className="transcription-analysis-acoustic-section transcription-analysis-acoustic-provider-section"
            title={t(locale, 'ai.acoustic.providerTitle')}
            description={t(locale, 'ai.acoustic.providerDescription')}
          >
            <div className="transcription-analysis-acoustic-panel">
              <div className="transcription-analysis-stats-row">
                <span className="transcription-analysis-stats-label">
                  {t(locale, 'ai.acoustic.providerDefault')}
                </span>
                <span className="transcription-analysis-stats-value">
                  <PanelChip>
                    {acousticProviderState?.effectiveProviderId ?? 'local-yin-spectral'}
                  </PanelChip>
                </span>
              </div>
              <div className="transcription-analysis-stats-row">
                <span className="transcription-analysis-stats-label">
                  {t(locale, 'ai.acoustic.providerEnhanced')}
                </span>
                <span className="transcription-analysis-stats-value">
                  {onChangeAcousticProvider ? (
                    <select
                      className="transcription-analysis-acoustic-preset-select"
                      value={acousticProviderPreference ?? PROVIDER_PREFERENCE_AUTO}
                      onChange={(event) =>
                        onChangeAcousticProvider(
                          event.target.value === PROVIDER_PREFERENCE_AUTO
                            ? null
                            : event.target.value,
                        )
                      }
                    >
                      <option value={PROVIDER_PREFERENCE_AUTO}>
                        {t(locale, 'ai.acoustic.providerAuto')}
                      </option>
                      {acousticProviderDefinitions.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    t(locale, 'ai.acoustic.providerNoneConfigured')
                  )}
                </span>
              </div>
              <div className="transcription-analysis-stats-row">
                <span className="transcription-analysis-stats-label">
                  {t(locale, 'ai.acoustic.providerRoutingStrategy')}
                </span>
                <span className="transcription-analysis-stats-value">
                  <select
                    className="transcription-analysis-acoustic-preset-select"
                    value={providerRuntimeConfig.routingStrategy}
                    onChange={handleProviderRoutingStrategyChange}
                  >
                    <option value="local-first">
                      {t(locale, 'ai.acoustic.providerRoutingLocalFirst')}
                    </option>
                    <option value="prefer-external">
                      {t(locale, 'ai.acoustic.providerRoutingPreferExternal')}
                    </option>
                  </select>
                </span>
              </div>
              <form
                className="transcription-analysis-acoustic-param-grid transcription-analysis-acoustic-provider-grid"
                onSubmit={(event) => event.preventDefault()}
              >
                <label className="transcription-analysis-acoustic-provider-toggle">
                  <input
                    type="checkbox"
                    checked={providerRuntimeConfig.externalProvider.enabled}
                    onChange={handleProviderExternalEnabledChange}
                  />
                  <span>{t(locale, 'ai.acoustic.providerExternalEnabled')}</span>
                </label>
                <label className="transcription-analysis-acoustic-param-field">
                  <span>{t(locale, 'ai.acoustic.providerTimeoutMs')}</span>
                  <input
                    className="transcription-analysis-acoustic-param-input"
                    type="number"
                    min={500}
                    max={120000}
                    step={100}
                    value={providerRuntimeConfig.externalProvider.timeoutMs}
                    onChange={handleProviderTimeoutChange}
                  />
                </label>
                <label className="transcription-analysis-acoustic-param-field transcription-analysis-acoustic-provider-field-wide">
                  <span>{t(locale, 'ai.acoustic.providerEndpoint')}</span>
                  <input
                    className="transcription-analysis-acoustic-param-input"
                    type="url"
                    placeholder="https://example.com/acoustic/analyze"
                    value={providerRuntimeConfig.externalProvider.endpoint ?? ''}
                    onChange={handleProviderEndpointChange}
                  />
                </label>
                <label className="transcription-analysis-acoustic-param-field transcription-analysis-acoustic-provider-field-wide">
                  <span>{t(locale, 'ai.acoustic.providerApiKey')}</span>
                  <input
                    className="transcription-analysis-acoustic-param-input"
                    type="password"
                    value={providerRuntimeConfig.externalProvider.apiKey ?? ''}
                    onChange={handleProviderApiKeyChange}
                  />
                </label>
              </form>
              <div className="transcription-analysis-acoustic-inspector-actions">
                <button
                  type="button"
                  className="transcription-analysis-acoustic-nav-btn"
                  onClick={handleSaveProviderConfig}
                >
                  {t(locale, 'ai.acoustic.providerSave')}
                </button>
                <button
                  type="button"
                  className="transcription-analysis-acoustic-nav-btn"
                  onClick={handleReloadProviderConfig}
                >
                  {t(locale, 'ai.acoustic.providerReload')}
                </button>
                <button
                  type="button"
                  className="transcription-analysis-acoustic-nav-btn"
                  onClick={() => {
                    void handleCheckProviderHealth();
                  }}
                  disabled={providerHealthChecking}
                >
                  {t(locale, 'ai.acoustic.providerCheckHealth')}
                </button>
              </div>
              <div className="transcription-analysis-stats-row">
                <span className="transcription-analysis-stats-label">
                  {t(locale, 'ai.acoustic.providerStatus')}
                </span>
                <span className="transcription-analysis-stats-value">
                  {providerConfigured
                    ? t(locale, 'ai.acoustic.providerStatusAvailable')
                    : t(locale, 'ai.acoustic.providerStatusUnavailable')}
                </span>
              </div>
              <div className="transcription-analysis-stats-row">
                <span className="transcription-analysis-stats-label">
                  {t(locale, 'ai.acoustic.providerHealthLabel')}
                </span>
                <span className="transcription-analysis-stats-value">{providerHealthLabel}</span>
              </div>
              {providerHealthMeta ? (
                <p className="transcription-analysis-acoustic-export-note">{providerHealthMeta}</p>
              ) : null}
              {acousticProviderState?.fellBackToLocal ? (
                <p className="transcription-analysis-acoustic-export-note">
                  {acousticProviderState.fallbackReason ?? t(locale, 'ai.acoustic.providerNote')}
                </p>
              ) : null}
              {providerHealthResult?.state === 'unauthorized' ||
              providerHealthResult?.state === 'forbidden' ? (
                <p className="transcription-analysis-acoustic-export-note">
                  {t(locale, 'ai.acoustic.providerAuthHint')}
                </p>
              ) : null}
              {providerSaveMessage ? (
                <p className="transcription-analysis-acoustic-export-note">{providerSaveMessage}</p>
              ) : null}
              <p className="transcription-analysis-acoustic-export-note">
                {t(locale, 'ai.acoustic.providerNote')}
              </p>
            </div>
          </PanelSection>
        ) : null}
      </>
    );
  },
);
