import type { StyleSpecification } from 'maplibre-gl';

// ─── 地图服务商类型 | Map provider kind ───
export type MapProviderKind = 'osm' | 'tianditu' | 'maptiler';

export interface MapProviderConfig {
  kind: MapProviderKind;
  /** 天地图 token 或 MapTiler API Key | Tianditu token or MapTiler API key */
  apiKey: string;
  /** 地图风格 ID | Map style ID */
  styleId: string;
  /** 按服务商独立存储的 key 字典 | Per-provider API key dictionary */
  apiKeysByProvider: Partial<Record<MapProviderKind, string>>;
}

// ─── 地图风格选项 | Map style options ───
export interface MapStyleOption {
  id: string;
  label: string;
  labelEn: string;
}

const OSM_STYLES: MapStyleOption[] = [
  { id: 'standard', label: '标准', labelEn: 'Standard' },
];

const TIANDITU_STYLES: MapStyleOption[] = [
  { id: 'vec', label: '矢量', labelEn: 'Vector' },
  { id: 'img', label: '影像', labelEn: 'Satellite' },
  { id: 'ter', label: '地形', labelEn: 'Terrain' },
];

const MAPTILER_STYLES: MapStyleOption[] = [
  { id: 'streets-v2', label: '街道', labelEn: 'Streets' },
  { id: 'satellite', label: '卫星', labelEn: 'Satellite' },
  { id: 'outdoor-v2', label: '户外', labelEn: 'Outdoor' },
  { id: 'topo-v2', label: '地形', labelEn: 'Topo' },
  { id: 'basic-v2', label: '简洁', labelEn: 'Basic' },
];

/** 获取指定服务商的可用风格列表 | Get available style list for a provider */
export function getMapStyles(kind: MapProviderKind): MapStyleOption[] {
  switch (kind) {
    case 'tianditu': return TIANDITU_STYLES;
    case 'maptiler': return MAPTILER_STYLES;
    default: return OSM_STYLES;
  }
}

/** 获取指定服务商的默认风格 ID | Get default style ID for a provider */
export function getDefaultStyleId(kind: MapProviderKind): string {
  const styles = getMapStyles(kind);
  return styles[0]?.id ?? 'standard';
}

// ─── 服务商定义 | Provider definitions ───
export interface MapProviderDefinition {
  kind: MapProviderKind;
  label: string;
  labelEn: string;
  requiresKey: boolean;
  keyLabel: string;
  /** i18n 键名，用于 placeholder | i18n key for placeholder */
  keyPlaceholderI18nKey: string;
}

export const MAP_PROVIDERS: MapProviderDefinition[] = [
  {
    kind: 'osm',
    label: 'OpenStreetMap',
    labelEn: 'OpenStreetMap',
    requiresKey: false,
    keyLabel: '',
    keyPlaceholderI18nKey: '',
  },
  {
    kind: 'tianditu',
    label: '天地图',
    labelEn: 'Tianditu',
    requiresKey: true,
    keyLabel: 'Token',
    keyPlaceholderI18nKey: 'workspace.languageMetadata.mapTiandituKeyPlaceholder',
  },
  {
    kind: 'maptiler',
    label: 'MapTiler',
    labelEn: 'MapTiler',
    requiresKey: true,
    keyLabel: 'API Key',
    keyPlaceholderI18nKey: 'workspace.languageMetadata.mapMaptilerKeyPlaceholder',
  },
];

// ─── localStorage 持久化 | localStorage persistence ───
const STORAGE_KEY = 'jieyu:map-provider';

export function readMapProviderConfig(): MapProviderConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MapProviderConfig>;
      if (parsed.kind && MAP_PROVIDERS.some((p) => p.kind === parsed.kind)) {
        const apiKeysByProvider = (parsed.apiKeysByProvider as Partial<Record<MapProviderKind, string>>) ?? {};
        const apiKey = parsed.apiKey || apiKeysByProvider[parsed.kind] || '';
        return {
          kind: parsed.kind,
          apiKey,
          styleId: parsed.styleId || getDefaultStyleId(parsed.kind),
          apiKeysByProvider: { ...apiKeysByProvider, ...(apiKey ? { [parsed.kind]: apiKey } : {}) },
        };
      }
    }
  } catch {
    /* ignore */
  }
  return { kind: 'osm', apiKey: '', styleId: 'standard', apiKeysByProvider: {} };
}

export function writeMapProviderConfig(config: MapProviderConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* ignore */
  }
}

// ─── 地名搜索（Nominatim 地理编码）| Place name search (Nominatim geocoding) ───
export interface GeocodeSuggestion {
  displayName: string;
  lat: number;
  lng: number;
}

/**
 * 通过 Nominatim 搜索地名并返回候选列表
 * Search place names via Nominatim and return candidate list
 */
export async function geocodeSearch(query: string, locale: string, signal?: AbortSignal): Promise<GeocodeSuggestion[]> {
  if (!query.trim()) return [];
  const lang = locale.startsWith('zh') ? 'zh' : 'en';
  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
    q: query.trim(),
    format: 'json',
    limit: '5',
    'accept-language': lang,
  })}`;
  // 浏览器禁止设置 User-Agent header，已移除 | Browser forbids setting User-Agent header, removed
  const res = await fetch(url, {
    ...(signal != null && { signal }),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as Array<{ display_name: string; lat: string; lon: string }>;
  return data.map((item) => ({
    displayName: item.display_name,
    lat: Number(item.lat),
    lng: Number(item.lon),
  }));
}

// ─── 样式构建 | Style builders ───
function buildOsmStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      },
    },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
  };
}

function buildTiandituStyle(token: string, lang: string, styleId: string): StyleSpecification {
  const baseLayer = (styleId === 'img' || styleId === 'ter') ? styleId : 'vec';
  const baseTiles = Array.from({ length: 8 }, (_, i) =>
    `https://t${i}.tianditu.gov.cn/${baseLayer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${baseLayer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${token}`,
  );
  const annoBase = baseLayer === 'img' ? 'ci' : baseLayer === 'ter' ? 'ct' : 'cv';
  const annoLayer = lang === 'en' ? `e${annoBase.charAt(1)}a` : `${annoBase}a`;
  const annoTiles = Array.from({ length: 8 }, (_, i) =>
    `https://t${i}.tianditu.gov.cn/${annoLayer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${annoLayer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${token}`,
  );
  return {
    version: 8,
    sources: {
      'tianditu-base': {
        type: 'raster',
        tiles: baseTiles,
        tileSize: 256,
        attribution: '© <a href="https://www.tianditu.gov.cn">天地图</a>',
      },
      'tianditu-anno': {
        type: 'raster',
        tiles: annoTiles,
        tileSize: 256,
      },
    },
    layers: [
      { id: 'tianditu-base', type: 'raster', source: 'tianditu-base' },
      { id: 'tianditu-anno', type: 'raster', source: 'tianditu-anno' },
    ],
  };
}

export function buildMapStyle(providerConfig: MapProviderConfig, locale: string): string | StyleSpecification {
  const lang = locale.startsWith('zh') ? 'zh' : 'en';

  switch (providerConfig.kind) {
    case 'maptiler': {
      const sid = providerConfig.styleId || 'streets-v2';
      return `https://api.maptiler.com/maps/${sid}/style.json?key=${providerConfig.apiKey}&language=${lang}`;
    }
    case 'tianditu':
      return buildTiandituStyle(providerConfig.apiKey, lang, providerConfig.styleId || 'vec');
    default:
      return buildOsmStyle();
  }
}