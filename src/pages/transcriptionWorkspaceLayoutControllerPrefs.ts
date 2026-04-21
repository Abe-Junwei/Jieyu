import { createLogger } from '../observability/logger';
import { WORKSPACE_VERTICAL_VIEW_STORAGE_KEY } from '../utils/workspaceLayoutPreferenceSync';

const log = createLogger('TranscriptionWorkspaceLayout');

export const WORKSPACE_DEFAULT_ZOOM_MODE_KEY = 'jieyu:workspace-default-zoom-mode';
export const WORKSPACE_AUTO_SCROLL_KEY = 'jieyu:workspace-auto-scroll-enabled';
export const WORKSPACE_SNAP_KEY = 'jieyu:workspace-snap-enabled';

/** Removed with Greenfield: `jieyu:workspace-layout-contract-version` (no migration). */
const LEGACY_WORKSPACE_LAYOUT_CONTRACT_STORAGE_KEY = 'jieyu:workspace-layout-contract-version';

export function readStoredClampedNumber(key: string, min: number, max: number, fallback: number): number {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return fallback;
    const parsed = Number(stored);
    if (Number.isNaN(parsed)) return fallback;
    return Math.min(Math.max(parsed, min), max);
  } catch (error) {
    log.warn('Failed to read numeric workspace layout preference from localStorage', {
      storageKey: key,
      error: error instanceof Error ? error.message : String(error),
    });
    return fallback;
  }
}

export function readStoredLaneHeights(): Record<string, number> {
  try {
    const stored = localStorage.getItem('jieyu:lane-heights');
    if (!stored) return {};
    const parsed: unknown = JSON.parse(stored);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, number>;
    }
  } catch (error) {
    log.warn('Failed to read lane heights from localStorage, fallback to default', {
      storageKey: 'jieyu:lane-heights',
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return {};
}

export function readStoredBoolean(key: string, fallback: boolean): boolean {
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return fallback;
    if (stored === '1' || stored === 'true') return true;
    if (stored === '0' || stored === 'false') return false;
    return fallback;
  } catch (error) {
    log.warn('Failed to read boolean workspace layout preference from localStorage', {
      storageKey: key,
      error: error instanceof Error ? error.message : String(error),
    });
    return fallback;
  }
}

/**
 * Drop removed layout-contract key; coerce `jieyu:workspace-vertical-view` to `0`/`1` when stored as legacy `true`/`false`/other.
 */
function normalizeWorkspaceVerticalViewPreferenceInStorage(): void {
  try {
    localStorage.removeItem(LEGACY_WORKSPACE_LAYOUT_CONTRACT_STORAGE_KEY);
  } catch {
    // no-op
  }
  try {
    const raw = localStorage.getItem(WORKSPACE_VERTICAL_VIEW_STORAGE_KEY);
    if (raw === null) return;
    if (raw === '0' || raw === '1') return;

    const vertical = readStoredBoolean(WORKSPACE_VERTICAL_VIEW_STORAGE_KEY, false);
    localStorage.setItem(WORKSPACE_VERTICAL_VIEW_STORAGE_KEY, vertical ? '1' : '0');
  } catch (error) {
    log.warn('Failed to normalize workspace vertical view preference in localStorage', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function readStoredVerticalViewEnabled(): boolean {
  normalizeWorkspaceVerticalViewPreferenceInStorage();
  return readStoredBoolean(WORKSPACE_VERTICAL_VIEW_STORAGE_KEY, false);
}

export function readStoredWorkspaceZoomMode(): 'fit-all' | 'fit-selection' | 'custom' {
  try {
    const stored = localStorage.getItem(WORKSPACE_DEFAULT_ZOOM_MODE_KEY);
    if (stored === 'fit-all' || stored === 'fit-selection' || stored === 'custom') {
      return stored;
    }
    return 'fit-all';
  } catch (error) {
    log.warn('Failed to read workspace zoom mode from localStorage, fallback to default', {
      storageKey: WORKSPACE_DEFAULT_ZOOM_MODE_KEY,
      error: error instanceof Error ? error.message : String(error),
    });
    return 'fit-all';
  }
}

export function resetDocumentResizeStyles(): void {
  document.body.style.userSelect = '';
  document.body.style.cursor = '';
}
