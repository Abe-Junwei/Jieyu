/**
 * 语言元数据工作台 – 地图/地名搜索控制器
 * Language metadata workspace – Map & geocode search controller
 *
 * 从 LanguageMetadataWorkspaceDetailColumn 抽出，以满足 architecture-guard 行数/回调上限。
 * Extracted from LanguageMetadataWorkspaceDetailColumn to meet architecture-guard ceilings.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  readMapProviderConfig,
  writeMapProviderConfig,
  MAP_PROVIDERS,
  getMapStyles,
  getDefaultStyleId,
  type MapProviderKind,
  type MapProviderConfig,
} from '../components/languageMapEmbed.shared';
import {
  forwardGeocode,
  readGeocoderCapabilities,
  reverseGeocode,
  type GeocodeSuggestion,
} from '../components/languageGeocoder';
import { readMapProxyBaseUrl } from '../components/mapProxyConfig';
import type { WorkspaceLocale, LanguageMetadataDraft, LanguageMetadataDraftChangeHandler } from './languageMetadataWorkspace.shared';

// ─── 返回类型 | Return type ───
export type MapControllerState = ReturnType<typeof useLanguageMetadataMapController>;

export function useLanguageMetadataMapController(locale: WorkspaceLocale, draft: LanguageMetadataDraft, onDraftChange: LanguageMetadataDraftChangeHandler) {
  // ─── 地图服务商状态 | Map provider state ───
  const [mapProviderConfig, setMapProviderConfig] = useState<MapProviderConfig>(readMapProviderConfig);
  const [mapKeyInput, setMapKeyInput] = useState(() => readMapProviderConfig().apiKey);
  const [showMapConfig, setShowMapConfig] = useState(false);
  const activeProviderDef = useMemo(
    () => MAP_PROVIDERS.find((p) => p.kind === mapProviderConfig.kind) ?? MAP_PROVIDERS[0]!,
    [mapProviderConfig.kind],
  );
  const mapProxyEnabled = Boolean(readMapProxyBaseUrl());
  const mapProviderSupportsProxyKeyless = mapProxyEnabled && mapProviderConfig.kind === 'maptiler';
  const mapProviderRequiresManualKey = activeProviderDef.requiresKey && !mapProviderSupportsProxyKeyless;

  const handleMapProviderChange = (kind: MapProviderKind) => {
    const savedKeys: Partial<Record<MapProviderKind, string>> = {
      ...mapProviderConfig.apiKeysByProvider,
      ...(mapProviderConfig.apiKey ? { [mapProviderConfig.kind]: mapProviderConfig.apiKey } : {}),
    };
    const restoredKey = savedKeys[kind] ?? '';
    const next: MapProviderConfig = { kind, apiKey: restoredKey, styleId: getDefaultStyleId(kind), apiKeysByProvider: savedKeys };
    writeMapProviderConfig(next);
    setMapProviderConfig(next);
    setMapKeyInput(restoredKey);
    const selectedProviderRequiresManualKey = (MAP_PROVIDERS.find((p) => p.kind === kind)?.requiresKey ?? false)
      && !(mapProxyEnabled && kind === 'maptiler');
    setShowMapConfig(!restoredKey && selectedProviderRequiresManualKey);
  };

  const handleSaveMapKey = () => {
    const trimmed = mapKeyInput.trim();
    if (!trimmed) return;
    const savedKeys = { ...mapProviderConfig.apiKeysByProvider, [mapProviderConfig.kind]: trimmed };
    const next: MapProviderConfig = { ...mapProviderConfig, apiKey: trimmed, apiKeysByProvider: savedKeys };
    writeMapProviderConfig(next);
    setMapProviderConfig(next);
    setShowMapConfig(false);
  };

  const mapProviderNeedsKey = mapProviderRequiresManualKey && !mapProviderConfig.apiKey.trim();

  const handleClearMapKey = () => {
    const savedKeys = { ...mapProviderConfig.apiKeysByProvider };
    delete savedKeys[mapProviderConfig.kind];
    const next: MapProviderConfig = { ...mapProviderConfig, apiKey: '', apiKeysByProvider: savedKeys };
    writeMapProviderConfig(next);
    setMapProviderConfig(next);
    setMapKeyInput('');
    setShowMapConfig(mapProviderRequiresManualKey);
  };

  const handleMapStyleChange = (styleId: string) => {
    const next: MapProviderConfig = { ...mapProviderConfig, styleId };
    writeMapProviderConfig(next);
    setMapProviderConfig(next);
  };

  const availableStyles = useMemo(() => getMapStyles(mapProviderConfig.kind), [mapProviderConfig.kind]);
  const geocoderCapabilities = useMemo(() => readGeocoderCapabilities(mapProviderConfig), [mapProviderConfig]);

  // ─── 地名搜索状态 | Geocode search state ───
  const [geocodeQuery, setGeocodeQuery] = useState('');
  const [geocodeResults, setGeocodeResults] = useState<GeocodeSuggestion[]>([]);
  const [geocodeLoading, setGeocodeLoading] = useState(false);
  const [geocodeOpen, setGeocodeOpen] = useState(false);
  const [geocodeStatusMessage, setGeocodeStatusMessage] = useState<'idle' | 'loading' | 'resolved' | 'error' | 'empty'>('idle');
  const [selectedPlaceLabel, setSelectedPlaceLabel] = useState('');
  const [activeGeocodeResultId, setActiveGeocodeResultId] = useState<string | null>(null);
  const [mapFocusRequestId, setMapFocusRequestId] = useState(0);
  const geocodeAbortRef = useRef<AbortController | null>(null);
  const reverseGeocodeAbortRef = useRef<AbortController | null>(null);
  const geocodeTimerRef = useRef<number | null>(null);
  const geocodeContainerRef = useRef<HTMLDivElement>(null);
  const parsedLatitude = Number(draft.latitude);
  const parsedLongitude = Number(draft.longitude);
  const hasCurrentCoordinates = !Number.isNaN(parsedLatitude) && !Number.isNaN(parsedLongitude);
  const countryCodes = useMemo(
    () => draft.countriesText
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter((item) => /^[a-z]{2}$/.test(item)),
    [draft.countriesText],
  );

  const runReverseGeocode = (latitude: number, longitude: number) => {
    if (!geocoderCapabilities.supportsReverseGeocode) {
      return;
    }
    reverseGeocodeAbortRef.current?.abort();
    const ac = new AbortController();
    reverseGeocodeAbortRef.current = ac;
    setGeocodeStatusMessage('loading');
    void reverseGeocode({
      providerConfig: mapProviderConfig,
      latitude,
      longitude,
      locale,
      signal: ac.signal,
    }).then((result) => {
      if (ac.signal.aborted) {
        return;
      }
      if (result) {
        setSelectedPlaceLabel(result.label);
        setGeocodeStatusMessage('resolved');
      } else {
        setGeocodeStatusMessage('idle');
      }
    }).catch(() => {
      if (!ac.signal.aborted) {
        setGeocodeStatusMessage('error');
      }
    });
  };

  const handleGeocodeSearch = () => {
    const q = geocodeQuery.trim();
    if (!q) {
      if (geocodeTimerRef.current !== null) {
        window.clearTimeout(geocodeTimerRef.current);
        geocodeTimerRef.current = null;
      }
      geocodeAbortRef.current?.abort();
      geocodeAbortRef.current = null;
      setGeocodeLoading(false);
      setGeocodeResults([]);
      setGeocodeOpen(false);
      setActiveGeocodeResultId(null);
      setGeocodeStatusMessage('idle');
      return;
    }
    setGeocodeLoading(true);
    setGeocodeResults([]);
    setGeocodeOpen(false);
    setGeocodeStatusMessage('idle');
    if (geocodeTimerRef.current !== null) {
      window.clearTimeout(geocodeTimerRef.current);
    }
    geocodeTimerRef.current = window.setTimeout(() => {
      geocodeTimerRef.current = null;
      geocodeAbortRef.current?.abort();
      const ac = new AbortController();
      geocodeAbortRef.current = ac;
      void forwardGeocode({
        providerConfig: mapProviderConfig,
        query: q,
        locale,
        signal: ac.signal,
        ...(countryCodes.length > 0 ? { countryCodes } : {}),
        ...(hasCurrentCoordinates ? { bias: { latitude: parsedLatitude, longitude: parsedLongitude, radiusKm: 4 } } : {}),
      })
        .then((results) => {
          if (!ac.signal.aborted) {
            setGeocodeResults(results);
            setGeocodeOpen(true);
            setActiveGeocodeResultId(results[0]?.id ?? null);
            setGeocodeStatusMessage(results.length === 0 ? 'empty' : 'idle');
          }
        })
        .catch(() => {
          if (!ac.signal.aborted) {
            setGeocodeResults([]);
            setGeocodeOpen(false);
            setGeocodeStatusMessage('error');
          }
        })
        .finally(() => {
          if (!ac.signal.aborted) {
            setGeocodeLoading(false);
          }
        });
    }, 220);
  };

  const handleGeocodeSelect = (s: GeocodeSuggestion) => {
    onDraftChange('latitude', String(s.lat));
    onDraftChange('longitude', String(s.lng));
    setSelectedPlaceLabel(s.displayName);
    setGeocodeQuery(s.primaryText);
    setActiveGeocodeResultId(s.id);
    setGeocodeOpen(false);
    setMapFocusRequestId((value) => value + 1);
    setGeocodeStatusMessage('resolved');
  };

  const handleHoverGeocodeResult = (resultId: string | null) => {
    setActiveGeocodeResultId(resultId);
  };

  // 点击外部关闭下拉 | Close dropdown on outside click
  useEffect(() => {
    if (!geocodeOpen) return;
    const handler = (e: MouseEvent) => {
      if (geocodeContainerRef.current && !geocodeContainerRef.current.contains(e.target as Node)) {
        setGeocodeOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [geocodeOpen]);

  useEffect(() => {
    return () => {
      if (geocodeTimerRef.current !== null) {
        window.clearTimeout(geocodeTimerRef.current);
        geocodeTimerRef.current = null;
      }
      geocodeAbortRef.current?.abort();
      geocodeAbortRef.current = null;
      reverseGeocodeAbortRef.current?.abort();
      reverseGeocodeAbortRef.current = null;
    };
  }, []);

  const handleMapCoordinateClick = (lat: number, lng: number) => {
    onDraftChange('latitude', String(lat));
    onDraftChange('longitude', String(lng));
    setMapFocusRequestId((value) => value + 1);
    runReverseGeocode(lat, lng);
  };

  const handleMapCoordinateDragEnd = (lat: number, lng: number) => {
    onDraftChange('latitude', String(lat));
    onDraftChange('longitude', String(lng));
    setMapFocusRequestId((value) => value + 1);
    runReverseGeocode(lat, lng);
  };

  return {
    mapProviderConfig,
    mapKeyInput,
    setMapKeyInput,
    showMapConfig,
    setShowMapConfig,
    activeProviderDef,
    mapProviderRequiresManualKey,
    mapProviderNeedsKey,
    availableStyles,
    geocoderCapabilities,
    handleMapProviderChange,
    handleSaveMapKey,
    handleClearMapKey,
    handleMapStyleChange,
    geocodeQuery,
    setGeocodeQuery,
    geocodeResults,
    geocodeLoading,
    geocodeOpen,
    geocodeStatusMessage,
    selectedPlaceLabel,
    activeGeocodeResultId,
    mapFocusRequestId,
    geocodeContainerRef,
    handleGeocodeSearch,
    handleGeocodeSelect,
    handleHoverGeocodeResult,
    handleMapCoordinateClick,
    handleMapCoordinateDragEnd,
  } as const;
}
