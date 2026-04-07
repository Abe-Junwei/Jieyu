// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapProviderConfig } from './languageMapEmbed.shared';
import { buildMapStyle } from './languageMapEmbed.shared';
import { forwardGeocode, resetGeocoderCacheForTests, reverseGeocode } from './languageGeocoder';

function createMaptilerProviderConfig(overrides: Partial<MapProviderConfig> = {}): MapProviderConfig {
  return {
    kind: 'maptiler',
    apiKey: 'top-secret-key',
    styleId: 'streets-v2',
    apiKeysByProvider: { maptiler: 'top-secret-key' },
    ...overrides,
  };
}

describe('languageGeocoder proxy security', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('VITE_MAP_PROXY_BASE_URL', 'https://proxy.example.com/maps');
    resetGeocoderCacheForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    resetGeocoderCacheForTests();
  });

  it('builds map style URL via proxy without exposing key query param', () => {
    const style = buildMapStyle(createMaptilerProviderConfig(), 'zh-CN');

    expect(typeof style).toBe('string');
    expect(style).toBe('https://proxy.example.com/maps/maptiler/maps/streets-v2/style.json?language=zh');
    expect(String(style)).not.toContain('key=');
  });

  it('forwards geocode requests through proxy without key query param', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain('https://proxy.example.com/maps/maptiler/geocoding/Chengdu.json');
      expect(url).toContain('language=zh');
      expect(url).not.toContain('key=');
      return new Response(JSON.stringify({
        features: [
          {
            id: 'proxy:chengdu',
            text: 'Chengdu',
            place_name: 'Chengdu, Sichuan, China',
            center: [104.06, 30.67],
            relevance: 0.9,
          },
        ],
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const suggestions = await forwardGeocode({
      providerConfig: createMaptilerProviderConfig(),
      query: 'Chengdu',
      locale: 'zh-CN',
      limit: 5,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(suggestions[0]).toMatchObject({
      id: 'proxy:chengdu',
      provider: 'maptiler',
      lat: 30.67,
      lng: 104.06,
    });
  });

  it('reverses geocode through proxy without key query param', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain('https://proxy.example.com/maps/maptiler/geocoding/104.06,30.67.json');
      expect(url).toContain('language=zh');
      expect(url).not.toContain('key=');
      return new Response(JSON.stringify({
        features: [{ place_name: 'Chengdu, Sichuan, China' }],
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await reverseGeocode({
      providerConfig: createMaptilerProviderConfig(),
      latitude: 30.67,
      longitude: 104.06,
      locale: 'zh-CN',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      label: 'Chengdu, Sichuan, China',
      provider: 'maptiler',
      latitude: 30.67,
      longitude: 104.06,
    });
  });

  it('returns structured administrative hierarchy for picker-oriented searches', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(
        url.startsWith('https://proxy.example.com/maps/nominatim/search?')
        || url.startsWith('https://nominatim.openstreetmap.org/search?'),
      ).toBe(true);
      expect(url).toContain('addressdetails=1');
      expect(url).toContain('namedetails=1');
      return new Response(JSON.stringify([
        {
          place_id: 101,
          display_name: '昆明市, 云南省, 中国',
          name: '昆明市',
          lat: '25.0438',
          lon: '102.7100',
          address: {
            country: '中国',
            country_code: 'cn',
            state: '云南省',
            city: '昆明市',
            county: '五华区',
          },
          namedetails: {
            'name:zh': '昆明市',
            'name:en': 'Kunming',
          },
        },
      ]), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const suggestions = await forwardGeocode({
      providerConfig: createMaptilerProviderConfig(),
      query: '昆明市',
      locale: 'zh-CN',
      structuredAddress: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(suggestions[0]).toMatchObject({
      provider: 'nominatim',
      matchedLanguageTag: 'zh',
      administrativeHierarchy: {
        country: '中国',
        countryCode: 'CN',
        province: '云南省',
        city: '昆明市',
        county: '五华区',
      },
    });
  });

  it('falls back to direct nominatim when proxied maptiler forward geocode fails', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/maptiler/geocoding/Chengdu.json')) {
        expect(url).toContain('https://proxy.example.com/maps/maptiler/geocoding/Chengdu.json');
        expect(url).not.toContain('key=');
        return new Response('gateway failure', { status: 502 });
      }

      expect(url.startsWith('https://nominatim.openstreetmap.org/search?')).toBe(true);
      expect(url).toContain('q=Chengdu');
      expect(url).not.toContain('key=');
      return new Response(JSON.stringify([
        {
          place_id: 1,
          display_name: 'Chengdu, Sichuan, China',
          name: 'Chengdu',
          lat: '30.67',
          lon: '104.06',
        },
      ]), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const suggestions = await forwardGeocode({
      providerConfig: createMaptilerProviderConfig(),
      query: 'Chengdu',
      locale: 'zh-CN',
      limit: 5,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(suggestions[0]).toMatchObject({
      provider: 'nominatim',
      lat: 30.67,
      lng: 104.06,
    });
  });

  it('falls back to direct nominatim when proxied maptiler reverse geocode fails', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/maptiler/geocoding/104.06,30.67.json')) {
        expect(url).toContain('https://proxy.example.com/maps/maptiler/geocoding/104.06,30.67.json');
        expect(url).not.toContain('key=');
        return new Response('gateway failure', { status: 503 });
      }

      expect(url.startsWith('https://nominatim.openstreetmap.org/reverse?')).toBe(true);
      expect(url).toContain('lat=30.67');
      expect(url).toContain('lon=104.06');
      expect(url).not.toContain('key=');
      return new Response(JSON.stringify({ display_name: 'Chengdu, Sichuan, China' }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await reverseGeocode({
      providerConfig: createMaptilerProviderConfig(),
      latitude: 30.67,
      longitude: 104.06,
      locale: 'zh-CN',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      provider: 'nominatim',
      label: 'Chengdu, Sichuan, China',
    });
  });

  it('respects fallback opt-out and surfaces maptiler proxy errors', async () => {
    vi.stubEnv('VITE_MAP_PROXY_FALLBACK_ON_ERROR', 'false');

    const fetchMock = vi.fn(async () => new Response('gateway failure', { status: 502 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(forwardGeocode({
      providerConfig: createMaptilerProviderConfig(),
      query: 'Chengdu',
      locale: 'zh-CN',
      limit: 5,
    })).rejects.toThrow('maptiler-forward-502');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
