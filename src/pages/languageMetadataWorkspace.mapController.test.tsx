// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { forwardGeocode, reverseGeocode, readGeocoderCapabilities } from '../components/languageGeocoder';
import type { LanguageMetadataDraft } from './languageMetadataWorkspace.shared';

const { mockForwardGeocode, mockReverseGeocode, mockReadGeocoderCapabilities } = vi.hoisted(() => ({
  mockForwardGeocode: vi.fn<typeof forwardGeocode>(),
  mockReverseGeocode: vi.fn<typeof reverseGeocode>(),
  mockReadGeocoderCapabilities: vi.fn<typeof readGeocoderCapabilities>(),
}));

vi.mock('../components/languageGeocoder', () => ({
  forwardGeocode: mockForwardGeocode,
  reverseGeocode: mockReverseGeocode,
  readGeocoderCapabilities: mockReadGeocoderCapabilities,
}));

import { useLanguageMetadataMapController } from './languageMetadataWorkspace.mapController';

function createDraft(overrides: Partial<LanguageMetadataDraft> = {}): LanguageMetadataDraft {
  return {
    idInput: '',
    languageCode: '',
    canonicalTag: '',
    iso6391: '',
    iso6392B: '',
    iso6392T: '',
    iso6393: '',
    localName: '',
    englishName: '',
    nativeName: '',
    aliasesText: '',
    genus: '',
    subfamily: '',
    branch: '',
    classificationPath: '',
    macrolanguage: '',
    scope: '',
    languageType: '',
    endangermentLevel: '',
    aesStatus: '',
    endangermentSource: '',
    endangermentAssessmentYear: '',
    speakerCountL1: '',
    speakerCountL2: '',
    speakerCountSource: '',
    speakerCountYear: '',
    speakerTrend: '',
    countriesText: '',
    countriesOfficialText: '',
    baselineOfficialCountriesUi: '',
    baselineOfficialCountriesEndonym: '',
    macroarea: '',
    administrativeDivisionsText: '',
    intergenerationalTransmission: '',
    domainsText: '',
    officialStatus: '',
    egids: '',
    documentationLevel: '',
    dialectsText: '',
    writingSystemsText: '',
    literacyRate: '',
    glottocode: '',
    wikidataId: '',
    visibility: 'visible' as const,
    notesZh: '',
    notesEn: '',
    latitude: '',
    longitude: '',
    changeReason: '',
    vernacularsText: '',
    displayNameRows: [],
    displayNameHiddenRows: [],
    customFieldValues: {},
    ...overrides,
  };
}

describe('useLanguageMetadataMapController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    window.sessionStorage.clear();
    mockForwardGeocode.mockReset();
    mockReverseGeocode.mockReset();
    mockReadGeocoderCapabilities.mockReset();
    mockReadGeocoderCapabilities.mockReturnValue({
      supportsForwardGeocode: true,
      supportsReverseGeocode: true,
      supportsBias: true,
      supportsCountryFilter: true,
      supportsStructuredQuery: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('keeps config panel open after clearing a required provider key', () => {
    window.localStorage.setItem('jieyu:map-provider', JSON.stringify({
      kind: 'maptiler',
      apiKey: 'demo-key',
      styleId: 'streets-v2',
      apiKeysByProvider: { maptiler: 'demo-key' },
    }));

    const onDraftChange = vi.fn<(field: keyof LanguageMetadataDraft, value: LanguageMetadataDraft[keyof LanguageMetadataDraft]) => void>();
    const { result } = renderHook(() => useLanguageMetadataMapController('zh-CN', createDraft(), onDraftChange));

    act(() => {
      result.current.handleClearMapKey();
    });

    expect(result.current.mapProviderConfig.apiKey).toBe('');
    expect(result.current.showMapConfig).toBe(true);
    expect(result.current.mapProviderNeedsKey).toBe(true);
  });

  it('aborts pending geocode requests on blank query and on unmount', async () => {
    const seenSignals: AbortSignal[] = [];
    mockForwardGeocode.mockImplementation(async ({ signal }) => {
      if (signal) {
        seenSignals.push(signal);
      }
      return [];
    });

    const onDraftChange = vi.fn<(field: keyof LanguageMetadataDraft, value: LanguageMetadataDraft[keyof LanguageMetadataDraft]) => void>();
    const { result, unmount } = renderHook(() => useLanguageMetadataMapController('zh-CN', createDraft(), onDraftChange));

    await act(async () => {
      result.current.setGeocodeQuery('Beijing');
    });

    await act(async () => {
      result.current.handleGeocodeSearch();
      await vi.advanceTimersByTimeAsync(220);
    });

    expect(seenSignals).toHaveLength(1);
    expect(seenSignals[0]?.aborted).toBe(false);

    await act(async () => {
      result.current.setGeocodeQuery('');
    });

    await act(async () => {
      result.current.handleGeocodeSearch();
    });

    expect(seenSignals[0]?.aborted).toBe(true);

    await act(async () => {
      result.current.setGeocodeQuery('Shanghai');
    });

    await act(async () => {
      result.current.handleGeocodeSearch();
      await vi.advanceTimersByTimeAsync(220);
    });

    expect(seenSignals).toHaveLength(2);
    expect(seenSignals[1]?.aborted).toBe(false);

    unmount();

    expect(seenSignals[1]?.aborted).toBe(true);
  });

  it('clears stale geocode results after a failed follow-up search', async () => {
    mockForwardGeocode
      .mockResolvedValueOnce([{
        id: 'nominatim:beijing',
        displayName: 'Beijing',
        primaryText: 'Beijing',
        lat: 39.9,
        lng: 116.4,
        provider: 'nominatim',
      }])
      .mockRejectedValueOnce(new Error('network'));

    const onDraftChange = vi.fn<(field: keyof LanguageMetadataDraft, value: LanguageMetadataDraft[keyof LanguageMetadataDraft]) => void>();
    const { result } = renderHook(() => useLanguageMetadataMapController('zh-CN', createDraft(), onDraftChange));

    await act(async () => {
      result.current.setGeocodeQuery('Beijing');
    });

    await act(async () => {
      result.current.handleGeocodeSearch();
      await vi.advanceTimersByTimeAsync(220);
    });

    expect(result.current.geocodeResults).toEqual([{
      id: 'nominatim:beijing',
      displayName: 'Beijing',
      primaryText: 'Beijing',
      lat: 39.9,
      lng: 116.4,
      provider: 'nominatim',
    }]);
    expect(result.current.geocodeOpen).toBe(true);

    await act(async () => {
      result.current.setGeocodeQuery('Broken query');
    });

    await act(async () => {
      result.current.handleGeocodeSearch();
      await vi.advanceTimersByTimeAsync(220);
    });

    expect(result.current.geocodeResults).toEqual([]);
    expect(result.current.geocodeOpen).toBe(false);
  });

  it('reverse geocodes after clicking a coordinate on the map', async () => {
    mockReverseGeocode.mockResolvedValue({
      label: 'Chengdu, Sichuan, China',
      provider: 'nominatim',
      latitude: 30.67,
      longitude: 104.06,
    });

    const onDraftChange = vi.fn<(field: keyof LanguageMetadataDraft, value: LanguageMetadataDraft[keyof LanguageMetadataDraft]) => void>();
    const { result } = renderHook(() => useLanguageMetadataMapController('zh-CN', createDraft(), onDraftChange));

    await act(async () => {
      result.current.handleMapCoordinateClick(30.67, 104.06);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockReverseGeocode).toHaveBeenCalledTimes(1);
    expect(result.current.selectedPlaceLabel).toBe('Chengdu, Sichuan, China');
  });

  it('stores provider keys in session storage instead of local storage', () => {
    const onDraftChange = vi.fn<(field: keyof LanguageMetadataDraft, value: LanguageMetadataDraft[keyof LanguageMetadataDraft]) => void>();
    const { result } = renderHook(() => useLanguageMetadataMapController('zh-CN', createDraft(), onDraftChange));

    act(() => {
      result.current.handleMapProviderChange('maptiler');
    });

    act(() => {
      result.current.setMapKeyInput('session-only-key');
    });

    act(() => {
      result.current.handleSaveMapKey();
    });

    const persistedConfig = JSON.parse(window.localStorage.getItem('jieyu:map-provider') ?? '{}') as Record<string, unknown>;
    const persistedKeys = JSON.parse(window.sessionStorage.getItem('jieyu:map-provider-keys') ?? '{}') as Record<string, string>;

    expect(persistedConfig.kind).toBe('maptiler');
    expect(persistedConfig.styleId).toBe('streets-v2');
    expect(persistedConfig.apiKey).toBeUndefined();
    expect(persistedConfig.apiKeysByProvider).toBeUndefined();
    expect(persistedKeys.maptiler).toBe('session-only-key');
  });

  it('does not require manual key for maptiler when proxy base URL is configured', () => {
    vi.stubEnv('VITE_MAP_PROXY_BASE_URL', 'https://proxy.example.com/maps');
    window.localStorage.setItem('jieyu:map-provider', JSON.stringify({
      kind: 'maptiler',
      styleId: 'streets-v2',
    }));

    const onDraftChange = vi.fn<(field: keyof LanguageMetadataDraft, value: LanguageMetadataDraft[keyof LanguageMetadataDraft]) => void>();
    const { result } = renderHook(() => useLanguageMetadataMapController('zh-CN', createDraft(), onDraftChange));

    expect(result.current.mapProviderConfig.kind).toBe('maptiler');
    expect(result.current.mapProviderRequiresManualKey).toBe(false);
    expect(result.current.mapProviderNeedsKey).toBe(false);

    act(() => {
      result.current.handleMapProviderChange('maptiler');
    });

    expect(result.current.showMapConfig).toBe(false);
  });
});