import type { MapProviderConfig } from './languageMapEmbed.shared';

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
}

export interface ForwardGeocodeOptions {
  providerConfig: MapProviderConfig;
  query: string;
  locale: string;
  signal?: AbortSignal;
  limit?: number;
  bias?: GeocodeQueryBias;
  countryCodes?: string[];
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

const CACHE_TTL_MS = 30_000;
const geocodeCache = new Map<string, { expiresAt: number; results: GeocodeSuggestion[] }>();

function readLocaleLanguage(locale: string): string {
  return locale.startsWith('zh') ? 'zh' : 'en';
}

function readProvider(providerConfig: MapProviderConfig): GeocoderProviderKind {
  if (providerConfig.kind === 'maptiler' && providerConfig.apiKey.trim()) {
    return 'maptiler';
  }
  return 'nominatim';
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

async function forwardGeocodeWithNominatim(options: ForwardGeocodeOptions): Promise<GeocodeSuggestion[]> {
  const params = new URLSearchParams({
    q: options.query.trim(),
    format: 'jsonv2',
    limit: String(options.limit ?? 5),
    dedupe: '1',
    'accept-language': readLocaleLanguage(options.locale),
  });
  const viewbox = buildBiasViewbox(options.bias);
  if (viewbox) {
    params.set('viewbox', viewbox);
  }
  if (options.countryCodes?.length) {
    params.set('countrycodes', options.countryCodes.join(','));
  }
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (!res.ok) {
    return [];
  }
  const data = (await res.json()) as Array<{
    place_id: number;
    display_name: string;
    name?: string;
    lat: string;
    lon: string;
    importance?: number;
    boundingbox?: string[];
  }>;
  return data.map((item) => {
    const bbox = parseBoundingBox(item.boundingbox);
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
    };
  });
}

async function forwardGeocodeWithMaptiler(options: ForwardGeocodeOptions): Promise<GeocodeSuggestion[]> {
  const params = new URLSearchParams({
    key: options.providerConfig.apiKey,
    language: readLocaleLanguage(options.locale),
    limit: String(options.limit ?? 5),
  });
  if (options.bias) {
    params.set('proximity', `${options.bias.longitude},${options.bias.latitude}`);
  }
  if (options.countryCodes?.length) {
    params.set('country', options.countryCodes.join(','));
  }
  const res = await fetch(`https://api.maptiler.com/geocoding/${encodeURIComponent(options.query.trim())}.json?${params}`, {
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (!res.ok) {
    return [];
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
  const provider = readProvider(options.providerConfig);
  const cacheKey = JSON.stringify({
    provider,
    query: options.query.trim().toLowerCase(),
    locale: options.locale,
    countryCodes: options.countryCodes ?? [],
    bias: options.bias ?? null,
    limit: options.limit ?? 5,
  });
  const cached = readCachedResults(cacheKey);
  if (cached) {
    return cached;
  }
  const results = provider === 'maptiler'
    ? await forwardGeocodeWithMaptiler(options)
    : await forwardGeocodeWithNominatim(options);
  geocodeCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, results });
  return results;
}

async function reverseGeocodeWithNominatim(options: ReverseGeocodeOptions): Promise<ReverseGeocodeResult | null> {
  const params = new URLSearchParams({
    lat: String(options.latitude),
    lon: String(options.longitude),
    format: 'jsonv2',
    'accept-language': readLocaleLanguage(options.locale),
  });
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, {
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
    key: options.providerConfig.apiKey,
    language: readLocaleLanguage(options.locale),
  });
  const res = await fetch(`https://api.maptiler.com/geocoding/${options.longitude},${options.latitude}.json?${params}`, {
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (!res.ok) {
    return null;
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
  return provider === 'maptiler'
    ? reverseGeocodeWithMaptiler(options)
    : reverseGeocodeWithNominatim(options);
}