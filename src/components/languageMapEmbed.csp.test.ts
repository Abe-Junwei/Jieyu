/**
 * index.html 的 CSP 必须放行 LanguageMapEmbed 实际请求的地图源（connect-src 与 img-src）。
 * The index.html CSP must allow every map origin LanguageMapEmbed requests (connect-src and img-src).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { StyleSpecification } from 'maplibre-gl';
import { describe, expect, it } from 'vitest';

import { buildMapStyle, type MapProviderConfig } from './languageMapEmbed.shared';

function cspSources(directive: string): string[] {
  const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
  const policy = /http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1] ?? '';
  const entry = policy
    .split(';')
    .map((part) => part.trim().split(/\s+/))
    .find(([name]) => name === directive);
  return entry?.slice(1) ?? [];
}

function styleOrigins(style: string | StyleSpecification): string[] {
  if (typeof style === 'string') return [new URL(style).origin];
  return Object.values(style.sources).flatMap((source) =>
    'tiles' in source && source.tiles ? source.tiles.map((url) => new URL(url).origin) : [],
  );
}

function config(kind: MapProviderConfig['kind'], styleId: string): MapProviderConfig {
  return { kind, apiKey: 'k', styleId, apiKeysByProvider: {} };
}

describe('index.html CSP allows the map providers', () => {
  const origins = new Set([
    ...styleOrigins(buildMapStyle(config('osm', 'standard'), 'zh-CN')),
    ...['vec', 'img', 'ter'].flatMap((id) =>
      styleOrigins(buildMapStyle(config('tianditu', id), 'en')),
    ),
    // MapTiler 的样式、矢量瓦片、glyph、sprite 都在 api.maptiler.com | MapTiler style, tiles, glyphs, sprites
    ...styleOrigins(buildMapStyle(config('maptiler', 'streets-v2'), 'en')),
  ]);

  it.each(['connect-src', 'img-src'])('%s lists every map origin and no wildcard', (directive) => {
    const sources = cspSources(directive);
    expect(origins.size).toBe(10); // OSM + MapTiler + 天地图 t0–t7
    for (const origin of origins) expect(sources).toContain(origin);
    expect(
      sources.filter((s) => s.includes('*') && /tianditu|maptiler|openstreetmap/.test(s)),
    ).toEqual([]);
  });
});
