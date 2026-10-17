const SYNC_MARKERS = ['icloud', 'mobile documents', 'onedrive', 'baidunetdisk', 'baiduyun'];

export type SyncFolderWarning = 'sync-folder';

export function syncFolderWarning(
  folderPath: string,
  extraMarkers: readonly string[] = [],
): SyncFolderWarning | null {
  const folded = folderPath.toLowerCase();
  const markers = [...SYNC_MARKERS, ...extraMarkers.map((marker) => marker.toLowerCase())];
  return markers.some((marker) => marker.length > 0 && folded.includes(marker))
    ? 'sync-folder'
    : null;
}
