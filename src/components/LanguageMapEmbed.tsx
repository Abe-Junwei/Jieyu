/**
 * 语言地理位置地图嵌入组件（多提供商）
 * Language geography map embed component (multi-provider)
 *
 * 支持 OSM（免费）、天地图（免费申请 token）、MapTiler（API Key）。
 * Supports OSM (free), Tianditu (free token), MapTiler (API key).
 */
import { useEffect, useRef, useCallback } from 'react';
import type { Map as MLMap, Marker as MLMarker, Popup as MLPopup, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// ─── HTML 转义（防止 XSS）| HTML escape (prevent XSS) ───
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildPopupHtml(label: string, latitude: number, longitude: number): string {
  return `<div style="font-size:0.82rem;line-height:1.4">${escapeHtml(label)}<br><span style="color:#888;font-size:0.75rem">${latitude.toFixed(4)}, ${longitude.toFixed(4)}</span></div>`;
}

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
  } catch { /* ignore */ }
  return { kind: 'osm', apiKey: '', styleId: 'standard', apiKeysByProvider: {} };
}

export function writeMapProviderConfig(config: MapProviderConfig): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); } catch { /* ignore */ }
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
  // 底图图层：vec=矢量, img=影像, ter=地形 | Base layer: vec=vector, img=satellite, ter=terrain
  const baseLayer = (styleId === 'img' || styleId === 'ter') ? styleId : 'vec';
  const baseTiles = Array.from({ length: 8 }, (_, i) =>
    `https://t${i}.tianditu.gov.cn/${baseLayer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${baseLayer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${token}`,
  );
  // 注记图层：vec→cva/eva, img→cia/eia, ter→cta/eta | Annotation layer mapping
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

type LanguageMapEmbedProps = {
  latitude: number;
  longitude: number;
  locale: string;
  providerConfig: MapProviderConfig;
  className?: string;
  /** 语言标签，用于标记气泡 | Language label for marker popup */
  languageLabel?: string;
  /** 点击地图回调，返回经纬度 | Callback on map click, returns lat/lng */
  onCoordinateClick?: (lat: number, lng: number) => void;
};

export function LanguageMapEmbed({ latitude, longitude, locale, providerConfig, className, languageLabel, onCoordinateClick }: LanguageMapEmbedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markerRef = useRef<MLMarker | null>(null);
  const maplibreglRef = useRef<typeof import('maplibre-gl') | null>(null);
  const onCoordinateClickRef = useRef(onCoordinateClick);
  onCoordinateClickRef.current = onCoordinateClick;
  const latitudeRef = useRef(latitude);
  latitudeRef.current = latitude;
  const longitudeRef = useRef(longitude);
  longitudeRef.current = longitude;
  const languageLabelRef = useRef(languageLabel);
  languageLabelRef.current = languageLabel;
  const popupRef = useRef<MLPopup | null>(null);

  // 全屏切换 | Fullscreen toggle
  const handleFullscreen = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    if (document.fullscreenElement === el) {
      void document.exitFullscreen();
    } else {
      void el.requestFullscreen();
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;

    void (async () => {
      const maplibregl = await import('maplibre-gl');
      if (cancelled) return;
      maplibreglRef.current = maplibregl;

      const lang = locale.startsWith('zh') ? 'zh' : 'en';
      const currentLatitude = latitudeRef.current;
      const currentLongitude = longitudeRef.current;
      let style: string | StyleSpecification;

      switch (providerConfig.kind) {
        case 'maptiler': {
          const sid = providerConfig.styleId || 'streets-v2';
          style = `https://api.maptiler.com/maps/${sid}/style.json?key=${providerConfig.apiKey}&language=${lang}`;
          break;
        }
        case 'tianditu':
          style = buildTiandituStyle(providerConfig.apiKey, lang, providerConfig.styleId || 'vec');
          break;
        default:
          style = buildOsmStyle();
      }

      const map = new maplibregl.Map({
        container,
        style,
        center: [currentLongitude, currentLatitude],
        zoom: 5,
        attributionControl: false,
      });

      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

      // 标记 + 气泡 | Marker + popup
      const marker = new maplibregl.Marker({ color: '#4f46e5' })
        .setLngLat([currentLongitude, currentLatitude]);

      const label = languageLabelRef.current;
      if (label) {
        const popup = new maplibregl.Popup({ offset: 25, closeButton: false, maxWidth: '220px' })
          .setHTML(buildPopupHtml(label, currentLatitude, currentLongitude));
        marker.setPopup(popup);
        popupRef.current = popup;
      } else {
        popupRef.current = null;
      }

      marker.addTo(map);

      // 点击地图设置坐标 | Click map to set coordinates
      map.on('click', (e) => {
        const cb = onCoordinateClickRef.current;
        if (cb) {
          const { lat, lng } = e.lngLat;
          cb(Number(lat.toFixed(6)), Number(lng.toFixed(6)));
        }
      });

      // 点击地图时显示十字光标 | Crosshair cursor when click-to-set enabled
      if (onCoordinateClickRef.current) {
        map.getCanvas().style.cursor = 'crosshair';
      }

      mapRef.current = map;
      markerRef.current = marker;
    })();

    return () => {
      cancelled = true;
      markerRef.current?.remove();
      markerRef.current = null;
      popupRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      maplibreglRef.current = null;
    };
  }, [locale, providerConfig.kind, providerConfig.apiKey, providerConfig.styleId]);

  // 坐标变化时仅同步 marker/center，不重建地图 | Sync marker/center on coordinate change without rebuilding map
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    marker.setLngLat([longitude, latitude]);
    map.setCenter([longitude, latitude]);
  }, [latitude, longitude]);

  // 标签变化时创建/更新/移除气泡，不重建地图 | Create/update/remove popup on label change without rebuilding map
  useEffect(() => {
    const marker = markerRef.current;
    const maplibregl = maplibreglRef.current;
    if (!marker || !maplibregl) return;

    if (!languageLabel) {
      marker.setPopup(null);
      popupRef.current = null;
      return;
    }

    if (!popupRef.current) {
      const popup = new maplibregl.Popup({ offset: 25, closeButton: false, maxWidth: '220px' })
        .setHTML(buildPopupHtml(languageLabel, latitude, longitude));
      marker.setPopup(popup);
      popupRef.current = popup;
      return;
    }

    popupRef.current.setHTML(buildPopupHtml(languageLabel, latitude, longitude));
  }, [languageLabel, latitude, longitude]);

  // 点击模式变化时同步光标样式 | Sync cursor style when click mode changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = onCoordinateClick ? 'crosshair' : '';
  }, [onCoordinateClick]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) {
      return;
    }

    const resizeMap = () => {
      mapRef.current?.resize();
    };

    const handleWindowResize = () => {
      resizeMap();
    };

    const handleFullscreenChange = () => {
      resizeMap();
    };

    window.addEventListener('resize', handleWindowResize);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          resizeMap();
        });

    resizeObserver?.observe(wrapper);

    return () => {
      window.removeEventListener('resize', handleWindowResize);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      resizeObserver?.disconnect();
    };
  }, []);

  return (
    <div ref={wrapperRef} className={`${className ?? ''} language-metadata-workspace-map-wrapper`}>
      <div ref={containerRef} className="language-metadata-workspace-map-inner" />
      <button
        type="button"
        className="language-metadata-workspace-map-fullscreen-btn"
        onClick={handleFullscreen}
        title={locale.startsWith('zh') ? '全屏' : 'Fullscreen'}
      >
        ⛶
      </button>
    </div>
  );
}
