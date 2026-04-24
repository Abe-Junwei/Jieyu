import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { forwardGeocode, type GeocodeSuggestion } from '../components/languageGeocoder';
import { readMapProviderConfig } from '../components/languageMapEmbed.shared';
import { t, tf } from '../i18n';
import { buildAdministrativeDivisionDisplayLine, type WorkspaceLocale } from './languageMetadataWorkspace.shared';
import {
  buildCountryAliasTokens,
  getCountryOptions,
  normalizeCountryCodesForGeocoder,
  normalizeCountryToken,
  parseCountriesText,
  resolveCountryByToken,
  resolveCountryCodes,
  type CountryOption,
} from './languageMetadataWorkspace.country';

function countryOptionMatchesFilter(option: CountryOption, normalizedFilter: string): boolean {
  if (!normalizedFilter) {
    return true;
  }
  return (
    normalizeCountryToken(option.label).includes(normalizedFilter)
    || normalizeCountryToken(option.searchName).includes(normalizedFilter)
    || normalizeCountryToken(option.value).includes(normalizedFilter)
    || option.aliasTokens.some((token) => token.includes(normalizedFilter))
  );
}

interface LanguageMetadataAdministrativeDivisionPickerProps {
  locale: WorkspaceLocale;
  macroarea: string;
  countriesText: string;
  administrativeDivisionsText: string;
  onMacroareaChange: (value: string) => void;
  onCountriesTextChange: (value: string) => void;
  onAdministrativeDivisionsTextChange: (value: string) => void;
  onLocateSuggestion?: (suggestion: GeocodeSuggestion) => void;
}

type SearchStatus = 'idle' | 'loading' | 'empty' | 'error' | 'resolved';

type ResolvedAdministrativeLocation = {
  country: string;
  countryCode: string;
  province: string;
  city: string;
  county: string;
  township: string;
  village: string;
  sourceDisplayName: string;
};

const MACROAREA_OPTIONS: Array<{ value: string; labelKey?: Parameters<typeof t>[1] }> = [
  { value: '' },
  { value: 'Africa', labelKey: 'workspace.languageMetadata.macroareaAfrica' },
  { value: 'Eurasia', labelKey: 'workspace.languageMetadata.macroareaEurasia' },
  { value: 'Papunesia', labelKey: 'workspace.languageMetadata.macroareaPapunesia' },
  { value: 'Australia', labelKey: 'workspace.languageMetadata.macroareaAustralia' },
  { value: 'North America', labelKey: 'workspace.languageMetadata.macroareaNorthAmerica' },
  { value: 'South America', labelKey: 'workspace.languageMetadata.macroareaSouthAmerica' },
];

function appendCountryIfMissing(
  locale: WorkspaceLocale,
  countriesText: string,
  input: { countryCode?: string; countryName?: string },
): string {
  const normalizedCode = input.countryCode?.trim().toUpperCase() ?? '';
  const normalizedName = input.countryName?.trim() ?? '';
  if (normalizedCode.length !== 2 && !normalizedName) {
    return countriesText;
  }

  const existingTokens = parseCountriesText(countriesText);
  const matchedCountry = normalizedCode.length === 2
    ? resolveCountryByToken(locale, normalizedCode)
    : (normalizedName ? resolveCountryByToken(locale, normalizedName) : null);

  const aliases = new Set<string>([
    ...(normalizedName ? [normalizeCountryToken(normalizedName)] : []),
    ...(matchedCountry
      ? buildCountryAliasTokens(locale, matchedCountry)
      : (normalizedCode.length === 2 ? [normalizeCountryToken(normalizedCode)] : [])),
  ]);

  if (existingTokens.some((token) => aliases.has(normalizeCountryToken(token)))) {
    return countriesText;
  }

  return [...existingTokens, normalizedCode.length === 2 ? normalizedCode : normalizedName].join(', ');
}

function createEmptyResolvedLocation(): ResolvedAdministrativeLocation {
  return {
    country: '',
    countryCode: '',
    province: '',
    city: '',
    county: '',
    township: '',
    village: '',
    sourceDisplayName: '',
  };
}

function buildAdministrativeLocateQuery(location: ResolvedAdministrativeLocation): string {
  return [
    location.village,
    location.township,
    location.county,
    location.city,
    location.province,
    location.country,
  ]
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, items) => items.indexOf(item) === index)
    .join(', ');
}

export function LanguageMetadataAdministrativeDivisionPicker({
  locale,
  macroarea,
  countriesText,
  administrativeDivisionsText,
  onMacroareaChange,
  onCountriesTextChange,
  onAdministrativeDivisionsTextChange,
  onLocateSuggestion,
}: LanguageMetadataAdministrativeDivisionPickerProps) {
  const searchContainerRef = useRef<HTMLDivElement | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const latestSearchRequestIdRef = useRef(0);
  const latestCountriesTextRef = useRef(countriesText);
  const countriesLabelId = useId();
  const countryOptionsListId = useId();
  const [countryFilter, setCountryFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodeSuggestion[]>([]);
  const [searchStatus, setSearchStatus] = useState<SearchStatus>('idle');
  const [searchOpen, setSearchOpen] = useState(false);
  const [resolvedLocation, setResolvedLocation] = useState<ResolvedAdministrativeLocation>(createEmptyResolvedLocation);
  const [selectedSuggestion, setSelectedSuggestion] = useState<GeocodeSuggestion | null>(null);

  const countryOptions = useMemo(() => getCountryOptions(locale), [locale]);
  const selectedCountryCodes = useMemo(
    () => resolveCountryCodes(parseCountriesText(countriesText), countryOptions),
    [countriesText, countryOptions],
  );
  const selectedCountryOptions = useMemo(
    () => countryOptions.filter((option) => selectedCountryCodes.includes(option.value)),
    [countryOptions, selectedCountryCodes],
  );

  const filteredCountryOptions = useMemo(() => {
    const normalizedFilter = normalizeCountryToken(countryFilter);
    return countryOptions.filter((option) => countryOptionMatchesFilter(option, normalizedFilter));
  }, [countryFilter, countryOptions]);

  useEffect(() => {
    latestCountriesTextRef.current = countriesText;
  }, [countriesText]);

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (!searchContainerRef.current?.contains(event.target as Node)) {
        setSearchOpen(false);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  useEffect(() => {
    return () => {
      latestSearchRequestIdRef.current += 1;
      searchAbortRef.current?.abort();
      searchAbortRef.current = null;
    };
  }, []);

  const commitCountriesText = (nextCountriesText: string) => {
    if (nextCountriesText === latestCountriesTextRef.current) {
      return;
    }
    latestCountriesTextRef.current = nextCountriesText;
    onCountriesTextChange(nextCountriesText);
  };

  const handleResolvedLocationFieldChange = (
    key: Exclude<keyof ResolvedAdministrativeLocation, 'countryCode' | 'sourceDisplayName'>,
    value: string,
  ) => {
    setResolvedLocation((current) => ({
      ...current,
      [key]: value,
      ...(key === 'country' ? { countryCode: '' } : {}),
      sourceDisplayName: '',
    }));
    setSelectedSuggestion(null);
  };

  const handleAdministrativeSearch = async () => {
    const query = searchQuery.trim();

    latestSearchRequestIdRef.current += 1;
    const requestId = latestSearchRequestIdRef.current;
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;

    if (!query) {
      setSearchResults([]);
      setSearchStatus('idle');
      setSearchOpen(false);
      return;
    }

    const ac = new AbortController();
    searchAbortRef.current = ac;
    setSearchStatus('loading');
    setSearchOpen(true);

    try {
      const suggestions = await forwardGeocode({
        providerConfig: readMapProviderConfig(),
        query,
        locale,
        signal: ac.signal,
        limit: 6,
        structuredAddress: true,
        ...(selectedCountryCodes.length > 0
          ? { countryCodes: normalizeCountryCodesForGeocoder(selectedCountryCodes) }
          : {}),
      });

      if (ac.signal.aborted || latestSearchRequestIdRef.current !== requestId) {
        return;
      }

      setSearchResults(suggestions);
      setSearchStatus(suggestions.length > 0 ? 'resolved' : 'empty');
    } catch {
      if (ac.signal.aborted || latestSearchRequestIdRef.current !== requestId) {
        return;
      }

      setSearchResults([]);
      setSearchStatus('error');
    } finally {
      if (searchAbortRef.current === ac) {
        searchAbortRef.current = null;
      }
    }
  };

  const handleSearchResultSelect = (suggestion: GeocodeSuggestion) => {
    setSelectedSuggestion(suggestion);
    setResolvedLocation({
      country: suggestion.administrativeHierarchy?.country ?? '',
      countryCode: suggestion.administrativeHierarchy?.countryCode ?? '',
      province: suggestion.administrativeHierarchy?.province ?? '',
      city: suggestion.administrativeHierarchy?.city ?? '',
      county: suggestion.administrativeHierarchy?.county ?? '',
      township: suggestion.administrativeHierarchy?.township ?? '',
      village: suggestion.administrativeHierarchy?.village ?? '',
      sourceDisplayName: suggestion.displayName,
    });
    setSearchOpen(false);
    setSearchStatus('resolved');
  };

  const locateResolvedLocation = async (location: ResolvedAdministrativeLocation) => {
    const query = buildAdministrativeLocateQuery(location);
    if (!query) {
      return;
    }

    const countryCodes = normalizeCountryCodesForGeocoder(location.countryCode.trim()
      ? [location.countryCode.trim()]
      : selectedCountryCodes);

    try {
      const suggestions = await forwardGeocode({
        providerConfig: readMapProviderConfig(),
        query,
        locale,
        limit: 1,
        structuredAddress: true,
        ...(countryCodes.length > 0 ? { countryCodes } : {}),
      });

      const suggestion = suggestions[0];
      if (suggestion) {
        const inferredCountryCode = suggestion.administrativeHierarchy?.countryCode?.trim();
        const inferredCountryName = suggestion.administrativeHierarchy?.country?.trim();
        if (inferredCountryCode || inferredCountryName) {
          commitCountriesText(appendCountryIfMissing(locale, latestCountriesTextRef.current, {
            ...(inferredCountryCode !== undefined ? { countryCode: inferredCountryCode } : {}),
            ...(inferredCountryName !== undefined ? { countryName: inferredCountryName } : {}),
          }));
        }
        onLocateSuggestion?.(suggestion);
      }
    } catch {
      return;
    }
  };

  const handleAddAdministrativeDivision = () => {
    const locationToPersist = { ...resolvedLocation };
    const locateSuggestion = selectedSuggestion;
    const line = buildAdministrativeDivisionDisplayLine(locale, {
      country: locationToPersist.country,
      province: locationToPersist.province,
      city: locationToPersist.city,
      county: locationToPersist.county,
      township: locationToPersist.township,
      village: locationToPersist.village,
    }).trim();

    if (!line) {
      return;
    }

    const existingLines = administrativeDivisionsText
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);
    onAdministrativeDivisionsTextChange([...existingLines, line].join('\n'));

    if (locationToPersist.countryCode || locationToPersist.country) {
      commitCountriesText(appendCountryIfMissing(locale, latestCountriesTextRef.current, {
        countryCode: locationToPersist.countryCode,
        countryName: locationToPersist.country,
      }));
    }

    if (locateSuggestion) {
      onLocateSuggestion?.(locateSuggestion);
    } else {
      void locateResolvedLocation(locationToPersist);
    }

    setSearchQuery('');
    setSearchResults([]);
    setSearchStatus('idle');
    setSearchOpen(false);
    setResolvedLocation(createEmptyResolvedLocation());
    setSelectedSuggestion(null);
  };

  const handleClearCurrentSelection = () => {
    latestSearchRequestIdRef.current += 1;
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    setSearchQuery('');
    setSearchResults([]);
    setSearchStatus('idle');
    setSearchOpen(false);
    setResolvedLocation(createEmptyResolvedLocation());
    setSelectedSuggestion(null);
  };

  return (
    <div className="lm-admin-picker">
      <div className="lm-admin-coverage-row">
        <label className="lm-field lm-admin-coverage-field">
          <span>{t(locale, 'workspace.languageMetadata.macroareaLabel')}</span>
          <select className="input" value={macroarea} onChange={(event) => onMacroareaChange(event.target.value)}>
            {MACROAREA_OPTIONS.map((option) => (
              <option key={option.value || 'empty'} value={option.value}>
                {option.labelKey ? t(locale, option.labelKey) : ''}
              </option>
            ))}
          </select>
        </label>

        <div className="lm-field lm-admin-coverage-field">
          <span id={countriesLabelId}>{t(locale, 'workspace.languageMetadata.countriesLabel')}</span>
          <div className="lm-country-multi" role="group" aria-labelledby={countriesLabelId}>
            <input
              type="search"
              className="input lm-admin-text-input"
              value={countryFilter}
              onChange={(event) => setCountryFilter(event.target.value)}
              placeholder={t(locale, 'workspace.languageMetadata.countriesFilterPlaceholder')}
              aria-label={t(locale, 'workspace.languageMetadata.countriesFilterPlaceholder')}
              aria-controls={countryOptionsListId}
              autoComplete="off"
            />
            {selectedCountryOptions.length > 0 ? (
              <ul className="lm-country-multi__chips" aria-label={t(locale, 'workspace.languageMetadata.countriesSelectedListAria')}>
                {selectedCountryOptions.map((option) => (
                  <li key={option.value}>
                    <button
                      type="button"
                      className="lm-country-multi__chip btn btn-ghost"
                      onClick={() => {
                        const next = selectedCountryCodes.filter((code) => code !== option.value);
                        commitCountriesText(next.sort().join(', '));
                      }}
                      aria-label={tf(locale, 'workspace.languageMetadata.countriesMultiRemoveAria', { country: option.label })}
                    >
                      <span>{option.label}</span>
                      <span className="lm-country-multi__chip-x" aria-hidden="true">
                        ×
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <ul id={countryOptionsListId} className="lm-country-multi__list" aria-label={t(locale, 'workspace.languageMetadata.countriesOptionsListAria')}>
              {filteredCountryOptions.map((option) => {
                const checked = selectedCountryCodes.includes(option.value);
                return (
                  <li key={option.value}>
                    <label className="lm-country-multi__option">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          const nextSet = new Set(selectedCountryCodes);
                          if (event.target.checked) {
                            nextSet.add(option.value);
                          } else {
                            nextSet.delete(option.value);
                          }
                          commitCountriesText([...nextSet].sort().join(', '));
                        }}
                      />
                      <span className="lm-country-multi__option-label">{option.label}</span>
                      <span className="lm-country-multi__iso">{option.value}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>

      <div className="lm-field">
        <span>{t(locale, 'workspace.languageMetadata.administrativeDivisionPickerLabel')}</span>
      </div>

      <div className="lm-admin-search-shell">
        <div className="lm-admin-search-anchor" ref={searchContainerRef}>
          <label className="lm-field">
            <span>{t(locale, 'workspace.languageMetadata.administrativeDivisionSearchLabel')}</span>
            <div className="lm-geocode-bar">
              <input
                className="input lm-admin-text-input"
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onFocus={() => {
                  if (searchResults.length > 0 || searchStatus === 'empty' || searchStatus === 'error') {
                    setSearchOpen(true);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void handleAdministrativeSearch();
                  }
                }}
                placeholder={t(locale, 'workspace.languageMetadata.administrativeDivisionSearchPlaceholder')}
                aria-label={t(locale, 'workspace.languageMetadata.administrativeDivisionSearchLabel')}
              />
              <button type="button" className="btn btn-ghost lm-geocode-btn" onClick={() => void handleAdministrativeSearch()} disabled={searchStatus === 'loading'}>
                {searchStatus === 'loading'
                  ? t(locale, 'workspace.languageMetadata.geocodeSearching')
                  : t(locale, 'workspace.languageMetadata.administrativeDivisionSearchButton')}
              </button>
            </div>
          </label>

          {searchOpen && (
            <ul className="lm-geocode-results">
              {searchStatus === 'error' ? <li className="lm-geocode-empty">{t(locale, 'workspace.languageMetadata.administrativeDivisionSearchError')}</li> : null}
              {searchStatus === 'empty' ? <li className="lm-geocode-empty">{t(locale, 'workspace.languageMetadata.administrativeDivisionSearchNoResults')}</li> : null}
              {searchResults.map((suggestion) => (
                <li key={suggestion.id}>
                  <button type="button" className="lm-geocode-item" onClick={() => handleSearchResultSelect(suggestion)}>
                    <span className="lm-geocode-name">{suggestion.primaryText}</span>
                    <span className="lm-geocode-coords">{suggestion.secondaryText ?? suggestion.displayName}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {resolvedLocation.sourceDisplayName ? <p className="lm-admin-search-summary">{resolvedLocation.sourceDisplayName}</p> : null}

        <div className="lm-admin-resolved-grid">
          <div className="lm-admin-resolved-row">
            <label className="lm-field">
              <span>{t(locale, 'workspace.languageMetadata.administrativeDivisionCountryLabel')}</span>
              <input
                className="input lm-admin-text-input"
                type="text"
                value={resolvedLocation.country}
                onChange={(event) => handleResolvedLocationFieldChange('country', event.target.value)}
                placeholder={t(locale, 'workspace.languageMetadata.administrativeDivisionCountryPlaceholder')}
              />
            </label>
            <label className="lm-field">
              <span>{t(locale, 'workspace.languageMetadata.administrativeDivisionProvinceLabel')}</span>
              <input
                className="input lm-admin-text-input"
                type="text"
                value={resolvedLocation.province}
                onChange={(event) => handleResolvedLocationFieldChange('province', event.target.value)}
                placeholder={t(locale, 'workspace.languageMetadata.administrativeDivisionProvincePlaceholder')}
              />
            </label>
            <label className="lm-field">
              <span>{t(locale, 'workspace.languageMetadata.administrativeDivisionCityLabel')}</span>
              <input
                className="input lm-admin-text-input"
                type="text"
                value={resolvedLocation.city}
                onChange={(event) => handleResolvedLocationFieldChange('city', event.target.value)}
                placeholder={t(locale, 'workspace.languageMetadata.administrativeDivisionCityPlaceholder')}
              />
            </label>
          </div>
          <div className="lm-admin-resolved-row">
            <label className="lm-field">
              <span>{t(locale, 'workspace.languageMetadata.administrativeDivisionCountyLabel')}</span>
              <input
                className="input lm-admin-text-input"
                type="text"
                value={resolvedLocation.county}
                onChange={(event) => handleResolvedLocationFieldChange('county', event.target.value)}
                placeholder={t(locale, 'workspace.languageMetadata.administrativeDivisionCountyPlaceholder')}
              />
            </label>
            <label className="lm-field">
              <span>{t(locale, 'workspace.languageMetadata.administrativeDivisionTownshipLabel')}</span>
              <input
                className="input lm-admin-text-input"
                type="text"
                value={resolvedLocation.township}
                onChange={(event) => handleResolvedLocationFieldChange('township', event.target.value)}
                placeholder={t(locale, 'workspace.languageMetadata.administrativeDivisionTownshipPlaceholder')}
              />
            </label>
            <label className="lm-field">
              <span>{t(locale, 'workspace.languageMetadata.administrativeDivisionVillageLabel')}</span>
              <input
                className="input lm-admin-text-input"
                type="text"
                value={resolvedLocation.village}
                onChange={(event) => handleResolvedLocationFieldChange('village', event.target.value)}
                placeholder={t(locale, 'workspace.languageMetadata.administrativeDivisionVillagePlaceholder')}
              />
            </label>
          </div>
        </div>

        <div className="lm-admin-actions">
          <button
            type="button"
            className="btn"
            onClick={handleAddAdministrativeDivision}
            disabled={
              !resolvedLocation.country
              && !resolvedLocation.province
              && !resolvedLocation.city
              && !resolvedLocation.county
              && !resolvedLocation.township
              && !resolvedLocation.village
            }
          >
            {t(locale, 'workspace.languageMetadata.administrativeDivisionAddButton')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={handleClearCurrentSelection}>
            {t(locale, 'workspace.languageMetadata.administrativeDivisionClearSelection')}
          </button>
        </div>
      </div>

      <label className="lm-field">
        <span>{t(locale, 'workspace.languageMetadata.administrativeDivisionsLabel')}</span>
        <textarea
          className="input"
          value={administrativeDivisionsText}
          onChange={(event) => onAdministrativeDivisionsTextChange(event.target.value)}
          placeholder={t(locale, 'workspace.languageMetadata.administrativeDivisionsPlaceholder')}
          rows={4}
          aria-label={t(locale, 'workspace.languageMetadata.administrativeDivisionsLabel')}
        />
      </label>
    </div>
  );
}
