/**
 * 快照恢复入口的数据层：列出、预览、恢复覆盖前快照与整库快照（用户决定 2026-10-09）。
 * Data layer of the snapshot restore entry: list, preview and restore pre-overwrite and library
 * snapshots (user decision 2026-10-09).
 */
import { useCallback, useState } from 'react';
import type {
  OverwriteSnapshotPreview,
  OverwriteSnapshotRestoreResult,
  OverwriteSnapshotSummary,
} from '../../services/overwriteSnapshotRestoreService';

function loadService() {
  return import('../../services/overwriteSnapshotRestoreService');
}

export function useOverwriteSnapshots() {
  const [snapshots, setSnapshots] = useState<OverwriteSnapshotSummary[] | null>(null);
  const refresh = useCallback(async (): Promise<void> => {
    const service = await loadService();
    setSnapshots(await service.listOverwriteSnapshots());
  }, []);
  const preview = useCallback(async (seq: number): Promise<OverwriteSnapshotPreview> => {
    const service = await loadService();
    return service.previewOverwriteSnapshot(seq);
  }, []);
  const restore = useCallback(async (seq: number): Promise<OverwriteSnapshotRestoreResult> => {
    const service = await loadService();
    return service.restoreOverwriteSnapshot(seq);
  }, []);
  return { snapshots, refresh, preview, restore };
}
