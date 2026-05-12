/**
 * settingsHelpers — Settings modal helper functions
 * Extracted from SettingsModal.tsx
 */

import type {
  MapProviderKind,
  MapProviderPreference,
  WorkspaceZoomMode,
  WaveformDisplayPreference,
} from './settingsConstants';
import {
  DEFAULT_PLAYBACK_RATE_KEY,
  PLAYBACK_RATES,
  WORKSPACE_DEFAULT_ZOOM_MODE_KEY,
  MAP_PROVIDER_STORAGE_KEY,
} from './settingsConstants';
import { readStoredWaveformDisplayModePreference } from '../../utils/waveformRuntimePreferenceSync';
import type { EmbeddingProviderConfig } from '../../pages/TranscriptionPage.helpers';

function normalizeEventKey(key: string): string {
  const k = key.toLowerCase();
  if (k === ' ' || k === 'spacebar') return 'space';
  if (k === 'esc') return 'escape';
  return k;
}

export function keyEventToCombo(e: KeyboardEvent): string | null {
  const key = normalizeEventKey(e.key);
  // 忽略单独修饰键 | Ignore standalone modifier keys
  if (['control', 'shift', 'alt', 'meta'].includes(key)) return null;
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push('mod');
  if (e.shiftKey) parts.push('shift');
  if (e.altKey) parts.push('alt');
  parts.push(key);
  return parts.join('+');
}

export function readDefaultPlaybackRate(): number {
  try {
    const stored = localStorage.getItem(DEFAULT_PLAYBACK_RATE_KEY);
    if (!stored) return 1;
    const n = Number(stored);
    if (Number.isNaN(n)) return 1;
    return (PLAYBACK_RATES as readonly number[]).includes(n) ? n : 1;
  } catch {
    return 1;
  }
}

export function readStoredBoolean(key: string, fallback: boolean): boolean {
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return fallback;
    if (stored === '1' || stored === 'true') return true;
    if (stored === '0' || stored === 'false') return false;
    return fallback;
  } catch {
    return fallback;
  }
}

export function readStoredWorkspaceZoomMode(): WorkspaceZoomMode {
  try {
    const stored = localStorage.getItem(WORKSPACE_DEFAULT_ZOOM_MODE_KEY);
    if (stored === 'fit-all' || stored === 'fit-selection' || stored === 'custom') {
      return stored;
    }
    return 'fit-all';
  } catch {
    return 'fit-all';
  }
}

export function readStoredWaveformDisplayMode(): WaveformDisplayPreference {
  try {
    return readStoredWaveformDisplayModePreference();
  } catch {
    return 'waveform';
  }
}

export function getMapStyleOptions(kind: MapProviderKind): Array<{ value: string; label: string }> {
  if (kind === 'tianditu') {
    return [
      { value: 'vec', label: 'Vector' },
      { value: 'img', label: 'Satellite' },
      { value: 'ter', label: 'Terrain' },
    ];
  }
  if (kind === 'maptiler') {
    return [
      { value: 'streets-v2', label: 'Streets' },
      { value: 'satellite', label: 'Satellite' },
      { value: 'outdoor-v2', label: 'Outdoor' },
      { value: 'topo-v2', label: 'Topo' },
      { value: 'basic-v2', label: 'Basic' },
    ];
  }
  return [{ value: 'standard', label: 'Standard' }];
}

export function getDefaultMapStyleId(kind: MapProviderKind): string {
  return getMapStyleOptions(kind)[0]?.value ?? 'standard';
}

export function readStoredMapProviderPreference(): MapProviderPreference {
  try {
    const raw = localStorage.getItem(MAP_PROVIDER_STORAGE_KEY);
    if (!raw) {
      return { kind: 'osm', styleId: 'standard' };
    }
    const parsed = JSON.parse(raw) as Partial<MapProviderPreference>;
    const kind = parsed.kind === 'tianditu' || parsed.kind === 'maptiler' ? parsed.kind : 'osm';
    const styleOptions = getMapStyleOptions(kind);
    const styleId =
      typeof parsed.styleId === 'string' && styleOptions.some((opt) => opt.value === parsed.styleId)
        ? parsed.styleId
        : getDefaultMapStyleId(kind);
    return { kind, styleId };
  } catch {
    return { kind: 'osm', styleId: 'standard' };
  }
}

export function persistMapProviderPreference(preference: MapProviderPreference): void {
  try {
    localStorage.setItem(MAP_PROVIDER_STORAGE_KEY, JSON.stringify(preference));
  } catch {
    // ignore
  }
}

export function normalizeEmbeddingProviderConfig(
  config: EmbeddingProviderConfig,
): EmbeddingProviderConfig {
  const baseUrl = config.baseUrl?.trim();
  const apiKey = config.apiKey?.trim();
  const model = config.model?.trim();
  return {
    kind: config.kind,
    ...(baseUrl ? { baseUrl } : {}),
    ...(apiKey ? { apiKey } : {}),
    ...(model ? { model } : {}),
  };
}

export function estimateLocalStorageUsage(): string {
  try {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      total += key.length + (localStorage.getItem(key)?.length ?? 0);
    }
    // UTF-16 每字符 2 字节 | UTF-16: 2 bytes per char
    const kb = (total * 2) / 1024;
    return kb < 1024 ? `${kb.toFixed(1)} KB` : `${(kb / 1024).toFixed(2)} MB`;
  } catch {
    return '—';
  }
}
