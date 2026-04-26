import { lazy, Suspense } from 'react';
import { t } from '../i18n';
import { MAP_PROVIDERS, type MapProviderKind } from '../components/languageMapEmbed.shared';
import type { LanguageMetadataDraft, LanguageMetadataDraftChangeHandler, WorkspaceLocale } from './languageMetadataWorkspace.shared';
import type { MapControllerState } from './languageMetadataWorkspace.mapController';
import { LanguageMetadataAdministrativeDivisionPicker } from './LanguageMetadataAdministrativeDivisionPicker';

const LanguageMapEmbed = lazy(() => import('../components/LanguageMapEmbed').then((m) => ({ default: m.LanguageMapEmbed })));

type LanguageMetadataWorkspaceGeographySectionProps = {
  locale: WorkspaceLocale;
  draft: LanguageMetadataDraft;
  onDraftChange: LanguageMetadataDraftChangeHandler;
  map: MapControllerState;
};

export function LanguageMetadataWorkspaceGeographySection({
  locale,
  draft,
  onDraftChange,
  map,
}: LanguageMetadataWorkspaceGeographySectionProps) {
  const latitudeText = draft.latitude.trim();
  const longitudeText = draft.longitude.trim();
  const parsedLatitude = Number(latitudeText);
  const parsedLongitude = Number(longitudeText);
  const hasCoordinates = latitudeText.length > 0 && longitudeText.length > 0 && !Number.isNaN(parsedLatitude) && !Number.isNaN(parsedLongitude);

  return (
    <details className="ws-subsection lm-subsection" open>
      <summary className="lm-subsection-header">
        <h3 className="panel-title-primary">{t(locale, 'workspace.languageMetadata.sectionGeography')}</h3>
        <p className="lm-subsection-description">{t(locale, 'workspace.languageMetadata.sectionGeographyDescription')}</p>
      </summary>

      <div className="panel-section__copy">
        <span className="panel-title-secondary">{t(locale, 'workspace.languageMetadata.subgroupGeographyCoverageTitle')}</span>
        <p className="panel-subsection__description">{t(locale, 'workspace.languageMetadata.subgroupGeographyCoverageDescription')}</p>
      </div>

      <div className="lm-geography-coverage-layout">
          <div className="lm-geography-panel">
            <LanguageMetadataAdministrativeDivisionPicker
              locale={locale}
              macroarea={draft.macroarea}
              countriesText={draft.countriesText}
              administrativeDivisionsText={draft.administrativeDivisionsText}
              onMacroareaChange={(value) => onDraftChange('macroarea', value)}
              onCountriesTextChange={(value) => onDraftChange('countriesText', value)}
              onAdministrativeDivisionsTextChange={(value) => onDraftChange('administrativeDivisionsText', value)}
              onLocateSuggestion={map.handleGeocodeSelect}
            />
            <div className="lm-geography-official-override">
              <label className="lm-geography-official-override-field">
                <span className="lm-geo-label">{t(locale, 'workspace.languageMetadata.countriesOfficialLabel')}</span>
                <textarea
                  className="input lm-geography-official-textarea"
                  rows={2}
                  value={draft.countriesOfficialText}
                  onChange={(event) => onDraftChange('countriesOfficialText', event.target.value)}
                  placeholder={t(locale, 'workspace.languageMetadata.countriesOfficialPlaceholder')}
                  aria-label={t(locale, 'workspace.languageMetadata.countriesOfficialLabel')}
                />
              </label>
              <p className="panel-subsection__description">{t(locale, 'workspace.languageMetadata.countriesOfficialDescription')}</p>
            </div>
            {(draft.baselineOfficialCountriesUi || draft.baselineOfficialCountriesEndonym) ? (
              <div className="lm-geography-baseline-official">
                <h4 className="panel-title-secondary lm-geography-baseline-official-title">
                  {t(locale, 'workspace.languageMetadata.baselineOfficialCountriesTitle')}
                </h4>
                <p className="panel-subsection__description">{t(locale, 'workspace.languageMetadata.baselineOfficialCountriesDescription')}</p>
                {draft.baselineOfficialCountriesUi ? (
                  <div className="lm-geo-row lm-geography-baseline-row">
                    <span className="lm-geo-label">{t(locale, 'workspace.languageMetadata.baselineOfficialUiLabel')}</span>
                    <span className="lm-state lm-geography-baseline-value">{draft.baselineOfficialCountriesUi}</span>
                  </div>
                ) : null}
                {draft.baselineOfficialCountriesEndonym ? (
                  <div className="lm-geo-row lm-geography-baseline-row">
                    <span className="lm-geo-label">{t(locale, 'workspace.languageMetadata.baselineOfficialEndonymLabel')}</span>
                    <span className="lm-state lm-geography-baseline-value">{draft.baselineOfficialCountriesEndonym}</span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

      <div className="panel-section__copy">
        <span className="panel-title-secondary">{t(locale, 'workspace.languageMetadata.subgroupGeographyCoordinatesTitle')}</span>
        <p className="panel-subsection__description">{t(locale, 'workspace.languageMetadata.subgroupGeographyCoordinatesDescription')}</p>
      </div>

      <div className="lm-geography-coordinates-layout">
          <div className="lm-geography-panel">
            <div className="lm-geography-panel-header">
              <span className="panel-title-eyebrow lm-geography-panel-title">{t(locale, 'workspace.languageMetadata.geographyCoordinatesEditorTitle')}</span>
              <p className="lm-geography-panel-description">{t(locale, 'workspace.languageMetadata.geographyCoordinatesEditorDescription')}</p>
            </div>

            <div className="lm-geo-row">
              <label className="lm-geo-field">
                <span>{t(locale, 'workspace.languageMetadata.latitudeLabel')}</span>
                <input className="input" type="text" inputMode="decimal" value={draft.latitude} onChange={(event) => onDraftChange('latitude', event.target.value)} placeholder="-90 ~ 90" />
              </label>
              <label className="lm-geo-field">
                <span>{t(locale, 'workspace.languageMetadata.longitudeLabel')}</span>
                <input className="input" type="text" inputMode="decimal" value={draft.longitude} onChange={(event) => onDraftChange('longitude', event.target.value)} placeholder="-180 ~ 180" />
              </label>
              <div className="lm-geocode-wrapper lm-geo-field" ref={map.geocodeContainerRef}>
                <span>{t(locale, 'workspace.languageMetadata.geocodePlaceholder').replace(/[…\.]+$/, '')}</span>
                <div className="lm-geocode-bar">
                  <input
                    className="input"
                    type="text"
                    value={map.geocodeQuery}
                    onChange={(event) => map.setGeocodeQuery(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter') map.handleGeocodeSearch(); }}
                    placeholder={t(locale, 'workspace.languageMetadata.geocodePlaceholder')}
                  />
                  <button type="button" className="btn btn-ghost lm-geocode-btn" onClick={map.handleGeocodeSearch} disabled={map.geocodeLoading}>
                    {map.geocodeLoading ? t(locale, 'workspace.languageMetadata.geocodeSearching') : '🔍'}
                  </button>
                </div>
                {map.geocodeOpen && (
                  <ul className="lm-geocode-results">
                    {map.geocodeResults.length === 0 ? (
                      <li className="lm-geocode-empty">{t(locale, 'workspace.languageMetadata.geocodeNoResults')}</li>
                    ) : map.geocodeResults.map((suggestion) => (
                      <li key={suggestion.id}>
                        <button
                          type="button"
                          className={`lm-geocode-item${map.activeGeocodeResultId === suggestion.id ? ' lm-geocode-item-active' : ''}`}
                          onMouseEnter={() => map.handleHoverGeocodeResult(suggestion.id)}
                          onFocus={() => map.handleHoverGeocodeResult(suggestion.id)}
                          onClick={() => map.handleGeocodeSelect(suggestion)}
                        >
                          <span className="lm-geocode-name">{suggestion.displayName}</span>
                          <span className="lm-geocode-coords">{suggestion.lat.toFixed(4)}, {suggestion.lng.toFixed(4)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {map.selectedPlaceLabel ? <p className="lm-state">{t(locale, 'workspace.languageMetadata.geocodeResolvedLabel')}{map.selectedPlaceLabel}</p> : null}
                {map.geocodeStatusMessage === 'loading' ? <p className="lm-state">{t(locale, 'workspace.languageMetadata.geocodeReverseLoading')}</p> : null}
                {map.geocodeStatusMessage === 'error' ? <p className="lm-state lm-state-error">{t(locale, 'workspace.languageMetadata.geocodeError')}</p> : null}
              </div>
            </div>

            <div className="lm-map-controls">
              <div className="lm-geo-field lm-map-provider-field">
                <span className="lm-geo-label">{t(locale, 'workspace.languageMetadata.mapProviderLabel')}</span>
                <div className="lm-map-provider-bar">
                  <select
                    className="lm-map-provider-select"
                    value={map.mapProviderConfig.kind}
                    onChange={(event) => map.handleMapProviderChange(event.currentTarget.value as MapProviderKind)}
                  >
                    {MAP_PROVIDERS.map((provider) => (
                      <option key={provider.kind} value={provider.kind}>
                        {locale === 'zh-CN' ? provider.label : provider.labelEn}
                        {!provider.requiresKey ? t(locale, 'workspace.languageMetadata.mapProviderFree') : ''}
                      </option>
                    ))}
                  </select>
                  {map.availableStyles.length > 1 && (
                    <select
                      className="lm-map-provider-select"
                      value={map.mapProviderConfig.styleId}
                      onChange={(event) => map.handleMapStyleChange(event.currentTarget.value)}
                    >
                      {map.availableStyles.map((style) => (
                        <option key={style.id} value={style.id}>{locale === 'zh-CN' ? style.label : style.labelEn}</option>
                      ))}
                    </select>
                  )}
                  {map.mapProviderRequiresManualKey && (
                    <button
                      type="button"
                      className="btn btn-ghost lm-map-config-btn"
                      aria-label={t(locale, 'workspace.languageMetadata.mapConfigToggle')}
                      title={t(locale, 'workspace.languageMetadata.mapConfigToggle')}
                      onClick={() => map.setShowMapConfig((visible) => !visible)}
                    >
                      ⚙
                    </button>
                  )}
                </div>
              </div>
            </div>

            {map.showMapConfig && map.mapProviderRequiresManualKey && (
              <div className="lm-map-config-panel">
                <label className="lm-field">
                  <span>{map.activeProviderDef.keyLabel}</span>
                  <input
                    className="input"
                    type="password"
                    autoComplete="off"
                    value={map.mapKeyInput}
                    onChange={(event) => map.setMapKeyInput(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter') map.handleSaveMapKey(); }}
                    placeholder={map.activeProviderDef.keyPlaceholderI18nKey ? t(locale, map.activeProviderDef.keyPlaceholderI18nKey as Parameters<typeof t>[1]) : ''}
                  />
                </label>
                <div className="lm-map-config-actions">
                  <button type="button" className="btn" onClick={map.handleSaveMapKey}>{t(locale, 'workspace.languageMetadata.mapApiKeySave')}</button>
                  {map.mapProviderConfig.apiKey && (
                    <button type="button" className="btn btn-ghost btn-danger" onClick={map.handleClearMapKey}>{t(locale, 'workspace.languageMetadata.mapApiKeyClear')}</button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="lm-geography-panel lm-geography-panel-preview">
            <div className="lm-geography-panel-header">
              <span className="panel-title-eyebrow lm-geography-panel-title">{t(locale, 'workspace.languageMetadata.geographyCoordinatesPreviewTitle')}</span>
              <p className="lm-geography-panel-description">{t(locale, 'workspace.languageMetadata.geographyCoordinatesPreviewDescription')}</p>
            </div>

            <div className="lm-geography-map-shell">
              {hasCoordinates ? (
                map.mapProviderNeedsKey ? (
                  <div className="lm-geography-map-empty">
                    <p className="lm-state">{t(locale, 'workspace.languageMetadata.mapProviderMissingKey')}</p>
                    {!map.showMapConfig && (
                      <button type="button" className="btn btn-ghost" onClick={() => map.setShowMapConfig(true)}>
                        {t(locale, 'workspace.languageMetadata.mapConfigToggle')}
                      </button>
                    )}
                  </div>
                ) : (
                  <Suspense fallback={<div className="lm-map-placeholder" />}>
                    <LanguageMapEmbed
                      latitude={parsedLatitude}
                      longitude={parsedLongitude}
                      locale={locale}
                      providerConfig={map.mapProviderConfig}
                      className="lm-map-container"
                      searchResults={map.geocodeResults}
                      activeResultId={map.activeGeocodeResultId}
                      focusRequestId={map.mapFocusRequestId}
                      {...(draft.localName.trim() || draft.englishName.trim() ? { languageLabel: draft.localName.trim() || draft.englishName.trim() } : {})}
                      onCoordinateClick={map.handleMapCoordinateClick}
                      onCoordinateDragEnd={map.handleMapCoordinateDragEnd}
                      onSearchResultMarkerClick={map.handleGeocodeSelect}
                    />
                  </Suspense>
                )
              ) : (
                <div className="lm-geography-map-empty">
                  <p className="lm-state">{t(locale, 'workspace.languageMetadata.mapNoCoordinates')}</p>
                </div>
              )}
            </div>
          </div>
        </div>
    </details>
  );
}
