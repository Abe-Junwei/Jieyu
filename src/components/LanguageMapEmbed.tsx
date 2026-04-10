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
import { buildMapStyle, type MapProviderConfig } from './languageMapEmbed.shared';
import type { GeocodeSuggestion } from './languageGeocoder';

// ─── HTML 转义（防止 XSS）| HTML escape (prevent XSS) ───
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildPopupHtml(label: string, latitude: number, longitude: number): string {
  return `<div style="font-size:0.82rem;line-height:1.4">${escapeHtml(label)}<br><span style="color:#888;font-size:0.75rem">${latitude.toFixed(4)}, ${longitude.toFixed(4)}</span></div>`;
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
  /** 拖拽 marker 完成回调 | Callback after marker drag ends */
  onCoordinateDragEnd?: (lat: number, lng: number) => void;
  /** 搜索结果，用于地图高亮 | Search results highlighted on the map */
  searchResults?: GeocodeSuggestion[];
  /** 当前激活结果 ID | Currently active result id */
  activeResultId?: string | null;
  /** 地图聚焦请求版本号 | Map focus request revision */
  focusRequestId?: number;
  /** 点击地图上的搜索结果 marker | Click a search result marker on the map */
  onSearchResultMarkerClick?: (suggestion: GeocodeSuggestion) => void;
};

export function LanguageMapEmbed({
  latitude,
  longitude,
  locale,
  providerConfig,
  className,
  languageLabel,
  onCoordinateClick,
  onCoordinateDragEnd,
  searchResults,
  activeResultId,
  focusRequestId,
  onSearchResultMarkerClick,
}: LanguageMapEmbedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markerRef = useRef<MLMarker | null>(null);
  const searchMarkerRefs = useRef<MLMarker[]>([]);
  const maplibreglRef = useRef<typeof import('maplibre-gl') | null>(null);
  const onCoordinateClickRef = useRef(onCoordinateClick);
  onCoordinateClickRef.current = onCoordinateClick;
  const onCoordinateDragEndRef = useRef(onCoordinateDragEnd);
  onCoordinateDragEndRef.current = onCoordinateDragEnd;
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

      const currentLatitude = latitudeRef.current;
      const currentLongitude = longitudeRef.current;
      const style: string | StyleSpecification = buildMapStyle(providerConfig, locale);

      const map = new maplibregl.Map({
        container,
        style,
        center: [currentLongitude, currentLatitude],
        zoom: 5,
        attributionControl: false,
      });

      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

      // 标记 + 气泡 | Marker + popup
      const marker = new maplibregl.Marker({ color: '#4f46e5', draggable: Boolean(onCoordinateDragEndRef.current) })
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

      marker.on('dragend', () => {
        if (!onCoordinateDragEndRef.current) {
          return;
        }
        const lngLat = marker.getLngLat();
        onCoordinateDragEndRef.current(Number(lngLat.lat.toFixed(6)), Number(lngLat.lng.toFixed(6)));
      });

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
      searchMarkerRefs.current.forEach((marker) => marker.remove());
      searchMarkerRefs.current = [];
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

  useEffect(() => {
    markerRef.current?.setDraggable(Boolean(onCoordinateDragEnd));
  }, [onCoordinateDragEnd]);

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
    const map = mapRef.current;
    const maplibregl = maplibreglRef.current;
    if (!map || !maplibregl) {
      return;
    }

    searchMarkerRefs.current.forEach((marker) => marker.remove());
    searchMarkerRefs.current = (searchResults ?? []).map((suggestion) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = `lm-search-marker${activeResultId === suggestion.id ? ' lm-search-marker-active' : ''}`;
      element.title = suggestion.displayName;
      element.addEventListener('click', () => onSearchResultMarkerClick?.(suggestion));
      return new maplibregl.Marker({ element })
        .setLngLat([suggestion.lng, suggestion.lat])
        .addTo(map);
    });

    return () => {
      searchMarkerRefs.current.forEach((marker) => marker.remove());
      searchMarkerRefs.current = [];
    };
  }, [searchResults, activeResultId, onSearchResultMarkerClick]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusRequestId) {
      return;
    }
    map.flyTo({ center: [longitude, latitude], zoom: Math.max(map.getZoom(), 7), essential: true });
  }, [focusRequestId, latitude, longitude]);

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
    <div ref={wrapperRef} className={`${className ?? ''} lm-map-wrapper`}>
      <div ref={containerRef} className="lm-map-inner" />
      <button
        type="button"
        className="lm-map-fullscreen-btn"
        onClick={handleFullscreen}
        title={locale.startsWith('zh') ? '全屏' : 'Fullscreen'}
      >
        ⛶
      </button>
    </div>
  );
}
