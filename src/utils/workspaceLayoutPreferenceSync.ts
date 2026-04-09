import type { VideoLayoutMode } from '../components/transcription/TranscriptionTimelineSections';

export const WORKSPACE_VIDEO_LAYOUT_MODE_STORAGE_KEY = 'jieyu:video-layout-mode';
export const WORKSPACE_VIDEO_PREVIEW_HEIGHT_STORAGE_KEY = 'jieyu:video-preview-height';
export const WORKSPACE_VIDEO_RIGHT_PANEL_WIDTH_STORAGE_KEY = 'jieyu:video-right-panel-width';

const WORKSPACE_LAYOUT_PREFERENCE_CHANGED_EVENT = 'jieyu:workspace-layout-preference-changed';

export function readStoredVideoLayoutModePreference(): VideoLayoutMode {
  try {
    const stored = localStorage.getItem(WORKSPACE_VIDEO_LAYOUT_MODE_STORAGE_KEY);
    return stored === 'left' || stored === 'right' ? stored : 'top';
  } catch {
    return 'top';
  }
}

export function readStoredVideoPreviewHeightPreference(): number {
  try {
    const stored = localStorage.getItem(WORKSPACE_VIDEO_PREVIEW_HEIGHT_STORAGE_KEY);
    if (!stored) return 220;
    const parsed = Number(stored);
    if (Number.isNaN(parsed)) return 220;
    return Math.min(600, Math.max(120, Math.round(parsed)));
  } catch {
    return 220;
  }
}

export function readStoredVideoRightPanelWidthPreference(): number {
  try {
    const stored = localStorage.getItem(WORKSPACE_VIDEO_RIGHT_PANEL_WIDTH_STORAGE_KEY);
    if (!stored) return 360;
    const parsed = Number(stored);
    if (Number.isNaN(parsed)) return 360;
    return Math.min(720, Math.max(260, Math.round(parsed)));
  } catch {
    return 360;
  }
}

export function emitWorkspaceLayoutPreferenceChanged(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new Event(WORKSPACE_LAYOUT_PREFERENCE_CHANGED_EVENT));
  } catch {
    // no-op
  }
}

export function subscribeWorkspaceLayoutPreferenceChanged(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleStorage = (event: StorageEvent) => {
    if (
      event.key === WORKSPACE_VIDEO_LAYOUT_MODE_STORAGE_KEY
      || event.key === WORKSPACE_VIDEO_PREVIEW_HEIGHT_STORAGE_KEY
      || event.key === WORKSPACE_VIDEO_RIGHT_PANEL_WIDTH_STORAGE_KEY
    ) {
      listener();
    }
  };

  window.addEventListener(WORKSPACE_LAYOUT_PREFERENCE_CHANGED_EVENT, listener as EventListener);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(WORKSPACE_LAYOUT_PREFERENCE_CHANGED_EVENT, listener as EventListener);
    window.removeEventListener('storage', handleStorage);
  };
}
