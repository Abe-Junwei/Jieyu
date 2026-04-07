// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapProviderConfig } from './languageMapEmbed.shared';
import { buildMapStyle } from './languageMapEmbed.shared';
import { forwardGeocode, reverseGeocode } from './languageGeocoder';

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
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
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
});
