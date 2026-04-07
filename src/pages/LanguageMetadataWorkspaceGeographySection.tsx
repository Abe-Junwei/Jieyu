import { lazy, Suspense } from 'react';
import { t } from '../i18n';
import { MAP_PROVIDERS, type MapProviderKind } from '../components/languageMapEmbed.shared';
import type { LanguageMetadataDraft, LanguageMetadataDraftChangeHandler, WorkspaceLocale } from './languageMetadataWorkspace.shared';
import type { MapControllerState } from './languageMetadataWorkspace.mapController';

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
  const hasCoordinates = draft.latitude.trim() && draft.longitude.trim() && !Number.isNaN(Number(draft.latitude)) && !Number.isNaN(Number(draft.longitude));

  return (
    <section className="language-metadata-workspace-subsection">
      <div className="language-metadata-workspace-subsection-header">
        <h3 className="language-metadata-workspace-subsection-title">{t(locale, 'workspace.languageMetadata.sectionGeography')}</h3>
        <p className="language-metadata-workspace-subsection-description">{t(locale, 'workspace.languageMetadata.sectionGeographyDescription')}</p>
      </div>
      <div className="language-metadata-workspace-geo-row">
        <label className="language-metadata-workspace-geo-field">
          <span>{t(locale, 'workspace.languageMetadata.latitudeLabel')}</span>
          <input className="input" type="text" inputMode="decimal" value={draft.latitude} onChange={(event) => onDraftChange('latitude', event.target.value)} placeholder="-90 ~ 90" />
        </label>
        <label className="language-metadata-workspace-geo-field">
          <span>{t(locale, 'workspace.languageMetadata.longitudeLabel')}</span>
          <input className="input" type="text" inputMode="decimal" value={draft.longitude} onChange={(event) => onDraftChange('longitude', event.target.value)} placeholder="-180 ~ 180" />
        </label>
        <div className="language-metadata-workspace-geocode-wrapper language-metadata-workspace-geo-field" ref={map.geocodeContainerRef}>
          <span>{t(locale, 'workspace.languageMetadata.geocodePlaceholder').replace(/[…\.]+$/, '')}</span>
          <div className="language-metadata-workspace-geocode-bar">
            <input
              className="input"
              type="text"
              value={map.geocodeQuery}
              onChange={(event) => map.setGeocodeQuery(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') map.handleGeocodeSearch(); }}
              placeholder={t(locale, 'workspace.languageMetadata.geocodePlaceholder')}
            />
            <button type="button" className="btn btn-ghost language-metadata-workspace-geocode-btn" onClick={map.handleGeocodeSearch} disabled={map.geocodeLoading}>
              {map.geocodeLoading ? t(locale, 'workspace.languageMetadata.geocodeSearching') : '🔍'}
            </button>
          </div>
          {map.geocodeOpen && (
            <ul className="language-metadata-workspace-geocode-results">
              {map.geocodeResults.length === 0 ? (
                <li className="language-metadata-workspace-geocode-empty">{t(locale, 'workspace.languageMetadata.geocodeNoResults')}</li>
              ) : map.geocodeResults.map((suggestion, index) => (
                <li key={index}>
                  <button
                    type="button"
                    className={`language-metadata-workspace-geocode-item${map.activeGeocodeResultId === suggestion.id ? ' language-metadata-workspace-geocode-item-active' : ''}`}
                    onMouseEnter={() => map.handleHoverGeocodeResult(suggestion.id)}
                    onFocus={() => map.handleHoverGeocodeResult(suggestion.id)}
                    onClick={() => map.handleGeocodeSelect(suggestion)}
                  >
                    <span className="language-metadata-workspace-geocode-name">{suggestion.displayName}</span>
                    <span className="language-metadata-workspace-geocode-coords">{suggestion.lat.toFixed(4)}, {suggestion.lng.toFixed(4)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {map.selectedPlaceLabel ? <p className="language-metadata-workspace-state">{t(locale, 'workspace.languageMetadata.geocodeResolvedLabel')}{map.selectedPlaceLabel}</p> : null}
          {map.geocodeStatusMessage === 'loading' ? <p className="language-metadata-workspace-state">{t(locale, 'workspace.languageMetadata.geocodeReverseLoading')}</p> : null}
          {map.geocodeStatusMessage === 'error' ? <p className="language-metadata-workspace-state language-metadata-workspace-state-error">{t(locale, 'workspace.languageMetadata.geocodeError')}</p> : null}
        </div>
        <div className="language-metadata-workspace-geo-field">
          <span className="language-metadata-workspace-geo-label">{t(locale, 'workspace.languageMetadata.mapProviderLabel')}</span>
          <div className="language-metadata-workspace-map-provider-bar">
            <select
              className="language-metadata-workspace-map-provider-select"
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
                className="language-metadata-workspace-map-provider-select"
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
                className="btn btn-ghost language-metadata-workspace-map-config-btn"
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
        <div className="language-metadata-workspace-map-config-panel">
          <label className="language-metadata-workspace-field">
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
          <div className="language-metadata-workspace-map-config-actions">
            <button type="button" className="btn" onClick={map.handleSaveMapKey}>{t(locale, 'workspace.languageMetadata.mapApiKeySave')}</button>
            {map.mapProviderConfig.apiKey && (
              <button type="button" className="btn btn-ghost btn-danger" onClick={map.handleClearMapKey}>{t(locale, 'workspace.languageMetadata.mapApiKeyClear')}</button>
            )}
          </div>
        </div>
      )}

      {hasCoordinates ? (
        map.mapProviderNeedsKey ? (
          <div className="language-metadata-workspace-state">
            <p>{t(locale, 'workspace.languageMetadata.mapProviderMissingKey')}</p>
            {!map.showMapConfig && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => map.setShowMapConfig(true)}
              >
                {t(locale, 'workspace.languageMetadata.mapConfigToggle')}
              </button>
            )}
          </div>
        ) : (
          <Suspense fallback={<div className="language-metadata-workspace-map-placeholder" />}>
            <LanguageMapEmbed
              latitude={Number(draft.latitude)}
              longitude={Number(draft.longitude)}
              locale={locale}
              providerConfig={map.mapProviderConfig}
              className="language-metadata-workspace-map-container"
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
        <p className="language-metadata-workspace-state">{t(locale, 'workspace.languageMetadata.mapNoCoordinates')}</p>
      )}
    </section>
  );
}