import type { MapProviderConfig } from './languageMapEmbed.shared';
import { buildMapProxyUrl, readMapProxyBaseUrl } from './mapProxyConfig';

export type GeocoderProviderKind = 'nominatim' | 'maptiler';

export interface GeocoderCapabilities {
  supportsForwardGeocode: boolean;
  supportsReverseGeocode: boolean;
  supportsBias: boolean;
  supportsCountryFilter: boolean;
  supportsStructuredQuery: boolean;
}

export interface GeocodeQueryBias {
  latitude: number;
  longitude: number;
  radiusKm?: number;
}

export interface GeocodeAdministrativeHierarchy {
  country?: string;
  countryCode?: string;
  province?: string;
  city?: string;
  county?: string;
  township?: string;
  village?: string;
}

export interface GeocodeSuggestion {
  id: string;
  displayName: string;
  primaryText: string;
  secondaryText?: string;
  lat: number;
  lng: number;
  provider: GeocoderProviderKind;
  confidence?: number;
  bbox?: [number, number, number, number];
  matchedLanguageTag?: string;
  administrativeHierarchy?: GeocodeAdministrativeHierarchy;
}

export interface ForwardGeocodeOptions {
  providerConfig: MapProviderConfig;
  query: string;
  locale: string;
  signal?: AbortSignal;
  limit?: number;
  bias?: GeocodeQueryBias;
  countryCodes?: string[];
  structuredAddress?: boolean;
}

export interface ReverseGeocodeOptions {
  providerConfig: MapProviderConfig;
  latitude: number;
  longitude: number;
  locale: string;
  signal?: AbortSignal;
}

export interface ReverseGeocodeResult {
  label: string;
  provider: GeocoderProviderKind;
  latitude: number;
  longitude: number;
}

type ForwardGeocodeInternalOptions = ForwardGeocodeOptions & {
  bypassProxy?: boolean;
};

type ReverseGeocodeInternalOptions = ReverseGeocodeOptions & {
  bypassProxy?: boolean;
};

const CACHE_TTL_MS = 30_000;
const CACHE_MAX_ENTRIES = 64;
const geocodeCache = new Map<string, { expiresAt: number; results: GeocodeSuggestion[] }>();

export function resetGeocoderCacheForTests(): void {
  geocodeCache.clear();
}

function readMapProxyFallbackEnabled(): boolean {
  return import.meta.env.VITE_MAP_PROXY_FALLBACK_ON_ERROR !== 'false';
}

function readLocaleLanguage(locale: string): string {
  return locale.startsWith('zh') ? 'zh' : 'en';
}

function readProvider(providerConfig: MapProviderConfig): GeocoderProviderKind {
  if (providerConfig.kind === 'maptiler' && (providerConfig.apiKey.trim() || readMapProxyBaseUrl())) {
    return 'maptiler';
  }
  return 'nominatim';
}

function normalizeNameCandidate(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase();
}

function cleanAdministrativeName(value?: string): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function pickAdministrativeName(
  address: Record<string, string | undefined>,
  keys: string[],
  exclude?: string,
): string | undefined {
  const normalizedExclude = normalizeNameCandidate(exclude ?? '');
  for (const key of keys) {
    const candidate = cleanAdministrativeName(address[key]);
    if (!candidate) {
      continue;
    }
    if (normalizedExclude && normalizeNameCandidate(candidate) === normalizedExclude) {
      continue;
    }
    return candidate;
  }
  return undefined;
}

function detectMatchedLanguageTag(query: string, namedetails?: Record<string, string>): string | undefined {
  const normalizedQuery = normalizeNameCandidate(query);
  if (!normalizedQuery || !namedetails) {
    return undefined;
  }
  for (const [key, value] of Object.entries(namedetails)) {
    if (!value || normalizeNameCandidate(value) !== normalizedQuery) {
      continue;
    }
    if (key.startsWith('name:')) {
      return key.slice('name:'.length);
    }
  }
  return undefined;
}

function buildAdministrativeHierarchyFromNominatimAddress(
  address?: Record<string, string | undefined>,
): GeocodeAdministrativeHierarchy | undefined {
  if (!address) {
    return undefined;
  }

  const country = cleanAdministrativeName(address.country);
  const province = pickAdministrativeName(address, ['state', 'province', 'region']);
  const city = pickAdministrativeName(address, ['city', 'town', 'municipality', 'state_district', 'county']);
  let county = pickAdministrativeName(address, ['county', 'district', 'city_district', 'borough', 'suburb'], city);
  const township = pickAdministrativeName(address, ['town', 'township', 'suburb', 'quarter', 'neighbourhood'], county ?? city);
  const village = pickAdministrativeName(address, ['village', 'hamlet', 'isolated_dwelling', 'allotments'], township ?? county ?? city);

  if (!county) {
    county = pickAdministrativeName(address, ['state_district'], city);
  }

  const hierarchy: GeocodeAdministrativeHierarchy = {
    ...(country ? { country } : {}),
    ...(address.country_code ? { countryCode: address.country_code.toUpperCase() } : {}),
    ...(province ? { province } : {}),
    ...(city ? { city } : {}),
    ...(county ? { county } : {}),
    ...(township ? { township } : {}),
    ...(village ? { village } : {}),
  };

  return Object.keys(hierarchy).length > 0 ? hierarchy : undefined;
}

export function readGeocoderCapabilities(providerConfig: MapProviderConfig): GeocoderCapabilities {
  const provider = readProvider(providerConfig);
  if (provider === 'maptiler') {
    return {
      supportsForwardGeocode: true,
      supportsReverseGeocode: true,
      supportsBias: true,
      supportsCountryFilter: true,
      supportsStructuredQuery: false,
    };
  }
  return {
    supportsForwardGeocode: true,
    supportsReverseGeocode: true,
    supportsBias: true,
    supportsCountryFilter: true,
    supportsStructuredQuery: true,
  };
}

function buildBiasViewbox(bias?: GeocodeQueryBias): string | undefined {
  if (!bias) {
    return undefined;
  }
  const radiusKm = bias.radiusKm ?? 4;
  const latDelta = radiusKm / 111;
  const lonDivisor = Math.max(Math.cos((bias.latitude * Math.PI) / 180), 0.1);
  const lonDelta = radiusKm / (111 * lonDivisor);
  return [bias.longitude - lonDelta, bias.latitude - latDelta, bias.longitude + lonDelta, bias.latitude + latDelta].join(',');
}

function parseBoundingBox(value?: string[]): [number, number, number, number] | undefined {
  if (!value || value.length !== 4) {
    return undefined;
  }
  const south = Number(value[0]);
  const north = Number(value[1]);
  const west = Number(value[2]);
  const east = Number(value[3]);
  if ([south, north, west, east].some((item) => Number.isNaN(item))) {
    return undefined;
  }
  return [west, south, east, north];
}

function readCachedResults(cacheKey: string): GeocodeSuggestion[] | undefined {
  const cached = geocodeCache.get(cacheKey);
  if (!cached) {
    return undefined;
  }
  if (cached.expiresAt < Date.now()) {
    geocodeCache.delete(cacheKey);
    return undefined;
  }
  return cached.results;
}

function formatNominatimServiceError(data: unknown): string {
  if (!data || typeof data !== 'object') {
    return 'unknown';
  }
  const rec = data as Record<string, unknown>;
  if (typeof rec.error === 'string') {
    return rec.error;
  }
  if (rec.error && typeof rec.error === 'object') {
    return JSON.stringify(rec.error);
  }
  return JSON.stringify(data);
}

async function forwardGeocodeWithNominatim(options: ForwardGeocodeInternalOptions): Promise<GeocodeSuggestion[]> {
  const execute = async (bypassProxy: boolean): Promise<GeocodeSuggestion[]> => {
    const params = new URLSearchParams({
      q: options.query.trim(),
      format: 'jsonv2',
      limit: String(options.limit ?? 5),
      dedupe: '1',
      'accept-language': readLocaleLanguage(options.locale),
    });
    if (options.structuredAddress) {
      params.set('addressdetails', '1');
      params.set('namedetails', '1');
    }
    const viewbox = buildBiasViewbox(options.bias);
    if (viewbox) {
      params.set('viewbox', viewbox);
    }
    if (options.countryCodes?.length) {
      params.set('countrycodes', options.countryCodes.join(','));
    }
    const endpoint = bypassProxy
      ? `https://nominatim.openstreetmap.org/search?${params}`
      : buildMapProxyUrl('/nominatim/search', params)
      ?? `https://nominatim.openstreetmap.org/search?${params}`;
    const res = await fetch(endpoint, {
      ...(options.signal ? { signal: options.signal } : {}),
    });
    if (!res.ok) {
      throw new Error(`nominatim-forward-${res.status}`);
    }
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      throw new Error('nominatim-forward-json-parse');
    }
    if (Array.isArray(data)) {
      const rows = data as Array<{
        place_id: number;
        display_name: string;
        name?: string;
        lat: string;
        lon: string;
        importance?: number;
        boundingbox?: string[];
        address?: Record<string, string | undefined>;
        namedetails?: Record<string, string>;
      }>;
      return rows.map((item) => {
        const bbox = parseBoundingBox(item.boundingbox);
        const administrativeHierarchy = buildAdministrativeHierarchyFromNominatimAddress(item.address);
        const matchedLanguageTag = item.namedetails
          ? detectMatchedLanguageTag(options.query, item.namedetails)
          : undefined;
        return {
          id: `nominatim:${item.place_id}`,
          displayName: item.display_name,
          primaryText: item.name || item.display_name.split(',')[0] || item.display_name,
          secondaryText: item.display_name,
          lat: Number(item.lat),
          lng: Number(item.lon),
          provider: 'nominatim' as const,
          ...(item.importance !== undefined ? { confidence: item.importance } : {}),
          ...(bbox ? { bbox } : {}),
          ...(administrativeHierarchy ? { administrativeHierarchy } : {}),
          ...(matchedLanguageTag ? { matchedLanguageTag } : {}),
        };
      });
    }
    if (data && typeof data === 'object' && 'error' in data) {
      throw new Error(`nominatim:${formatNominatimServiceError(data)}`);
    }
    throw new Error('nominatim-forward-unexpected-json');
  };

  try {
    return await execute(Boolean(options.bypassProxy));
  } catch (error) {
    if (
      !options.bypassProxy
      && Boolean(readMapProxyBaseUrl())
      && readMapProxyFallbackEnabled()
      && !options.signal?.aborted
    ) {
      return await execute(true);
    }
    throw error;
  }
}

async function forwardGeocodeWithMaptiler(options: ForwardGeocodeOptions): Promise<GeocodeSuggestion[]> {
  const params = new URLSearchParams({
    language: readLocaleLanguage(options.locale),
    limit: String(options.limit ?? 5),
  });
  if (options.bias) {
    params.set('proximity', `${options.bias.longitude},${options.bias.latitude}`);
  }
  if (options.countryCodes?.length) {
    params.set('country', options.countryCodes.join(','));
  }
  const proxyEndpoint = buildMapProxyUrl(`/maptiler/geocoding/${encodeURIComponent(options.query.trim())}.json`, params);
  const endpoint = proxyEndpoint
    ?? (() => {
      const directParams = new URLSearchParams(params);
      directParams.set('key', options.providerConfig.apiKey);
      return `https://api.maptiler.com/geocoding/${encodeURIComponent(options.query.trim())}.json?${directParams}`;
    })();

  const res = await fetch(endpoint, {
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (!res.ok) {
    throw new Error(`maptiler-forward-${res.status}`);
  }
  const data = (await res.json()) as {
    features?: Array<{
      id?: string;
      text?: string;
      place_name: string;
      center?: [number, number];
      bbox?: [number, number, number, number];
      relevance?: number;
    }>;
  };
  return (data.features ?? [])
    .filter((feature) => Array.isArray(feature.center) && feature.center.length === 2)
    .map((feature) => ({
      id: feature.id ?? `maptiler:${feature.place_name}`,
      displayName: feature.place_name,
      primaryText: feature.text ?? feature.place_name,
      secondaryText: feature.place_name,
      lat: feature.center![1],
      lng: feature.center![0],
      provider: 'maptiler' as const,
      ...(feature.relevance !== undefined ? { confidence: feature.relevance } : {}),
      ...(feature.bbox ? { bbox: feature.bbox } : {}),
    }));
}

export async function forwardGeocode(options: ForwardGeocodeOptions): Promise<GeocodeSuggestion[]> {
  const provider = options.structuredAddress ? 'nominatim' : readProvider(options.providerConfig);
  const cacheKey = JSON.stringify({
    provider,
    query: options.query.trim().toLowerCase(),
    locale: options.locale,
    countryCodes: options.countryCodes ?? [],
    bias: options.bias ?? null,
    limit: options.limit ?? 5,
    structuredAddress: options.structuredAddress ?? false,
  });
  const cached = readCachedResults(cacheKey);
  if (cached) {
    return cached;
  }
  const results = provider === 'maptiler'
    ? await (async () => {
      try {
        return await forwardGeocodeWithMaptiler(options);
      } catch (error) {
        if (
          options.providerConfig.kind === 'maptiler'
          && Boolean(readMapProxyBaseUrl())
          && readMapProxyFallbackEnabled()
          && !options.signal?.aborted
        ) {
          return forwardGeocodeWithNominatim({ ...options, bypassProxy: true });
        }
        throw error;
      }
    })()
    : await forwardGeocodeWithNominatim(options);
  if (geocodeCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = geocodeCache.keys().next().value;
    if (oldest !== undefined) {
      geocodeCache.delete(oldest);
    }
  }
  geocodeCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, results });
  return results;
}

async function reverseGeocodeWithNominatim(options: ReverseGeocodeInternalOptions): Promise<ReverseGeocodeResult | null> {
  const params = new URLSearchParams({
    lat: String(options.latitude),
    lon: String(options.longitude),
    format: 'jsonv2',
    'accept-language': readLocaleLanguage(options.locale),
  });
  const endpoint = options.bypassProxy
    ? `https://nominatim.openstreetmap.org/reverse?${params}`
    : buildMapProxyUrl('/nominatim/reverse', params)
    ?? `https://nominatim.openstreetmap.org/reverse?${params}`;
  const res = await fetch(endpoint, {
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (!res.ok) {
    return null;
  }
  const data = (await res.json()) as { display_name?: string };
  if (!data.display_name) {
    return null;
  }
  return {
    label: data.display_name,
    provider: 'nominatim',
    latitude: options.latitude,
    longitude: options.longitude,
  };
}

async function reverseGeocodeWithMaptiler(options: ReverseGeocodeOptions): Promise<ReverseGeocodeResult | null> {
  const params = new URLSearchParams({
    language: readLocaleLanguage(options.locale),
  });
  const proxyEndpoint = buildMapProxyUrl(`/maptiler/geocoding/${options.longitude},${options.latitude}.json`, params);
  const endpoint = proxyEndpoint
    ?? (() => {
      const directParams = new URLSearchParams(params);
      directParams.set('key', options.providerConfig.apiKey);
      return `https://api.maptiler.com/geocoding/${options.longitude},${options.latitude}.json?${directParams}`;
    })();
  const res = await fetch(endpoint, {
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (!res.ok) {
    throw new Error(`maptiler-reverse-${res.status}`);
  }
  const data = (await res.json()) as { features?: Array<{ place_name: string }> };
  const first = data.features?.[0];
  if (!first?.place_name) {
    return null;
  }
  return {
    label: first.place_name,
    provider: 'maptiler',
    latitude: options.latitude,
    longitude: options.longitude,
  };
}

export async function reverseGeocode(options: ReverseGeocodeOptions): Promise<ReverseGeocodeResult | null> {
  const provider = readProvider(options.providerConfig);
  if (provider !== 'maptiler') {
    return reverseGeocodeWithNominatim(options);
  }

  try {
    return await reverseGeocodeWithMaptiler(options);
  } catch (error) {
    if (
      options.providerConfig.kind === 'maptiler'
      && Boolean(readMapProxyBaseUrl())
      && readMapProxyFallbackEnabled()
      && !options.signal?.aborted
    ) {
      return reverseGeocodeWithNominatim({ ...options, bypassProxy: true });
    }
    throw error;
  }
}
