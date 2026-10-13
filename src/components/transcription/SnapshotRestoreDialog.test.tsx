// @vitest-environment jsdom
/**
 * 快照恢复对话框：列表（时间、项目、大小）、预览、二次确认、拒绝原因、恢复后重新加载。
 * Snapshot restore dialog: list (time, project, size), preview, double confirm, refusal reasons,
 * reload after a restore.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  OverwriteSnapshotPreview,
  OverwriteSnapshotSummary,
} from '../../services/overwriteSnapshotRestoreService';
import { SnapshotRestoreDialog } from './SnapshotRestoreDialog';

const service = vi.hoisted(() => ({
  listOverwriteSnapshots: vi.fn(),
  previewOverwriteSnapshot: vi.fn(),
  restoreOverwriteSnapshot: vi.fn(),
}));
vi.mock('../../services/overwriteSnapshotRestoreService', () => service);

const projectSnapshot: OverwriteSnapshotSummary = {
  seq: 7,
  scope: 'project',
  projectId: 'pA',
  projectTitle: { default: 'Alpha' },
  projectCount: 1,
  createdAt: '2026-10-09T01:00:00.000Z',
  packageKind: 'jyt',
  rowCount: 12,
  sizeBytes: 2048,
};
const librarySnapshot: OverwriteSnapshotSummary = {
  ...projectSnapshot,
  seq: 8,
  scope: 'library',
  projectId: null,
  projectCount: 3,
  packageKind: 'jyb',
  sizeBytes: 3 * 1024 * 1024,
};

function previewOf(
  summary: OverwriteSnapshotSummary,
  extra: Partial<OverwriteSnapshotPreview> = {},
): OverwriteSnapshotPreview {
  return {
    summary,
    collections: [{ name: 'texts', snapshotRows: 1, currentRows: 1 }],
    preferenceKeys: [],
    available: true,
    bytesAtRisk: [],
    ...extra,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderDialog(onReload = vi.fn()) {
  render(<SnapshotRestoreDialog locale="zh-CN" isOpen onClose={vi.fn()} onReload={onReload} />);
  return { onReload };
}

describe('SnapshotRestoreDialog', () => {
  it('lists snapshots with time, project and size', async () => {
    service.listOverwriteSnapshots.mockResolvedValue([librarySnapshot, projectSnapshot]);
    renderDialog();
    const row = await screen.findByTestId('snapshot-restore-row-7');
    expect(row.textContent).toContain('Alpha');
    expect(row.textContent).toContain('2.0 KiB');
    expect(row.textContent).toContain('12 条');
    expect(row.textContent).toContain('JYT 导入覆盖前');
    expect(row.textContent).toContain(new Date(projectSnapshot.createdAt).toLocaleString('zh-CN'));
    const library = screen.getByTestId('snapshot-restore-row-8');
    expect(library.textContent).toContain('整库（3 个项目）');
    expect(library.textContent).toContain('3.0 MiB');
  });

  it('shows an empty state', async () => {
    service.listOverwriteSnapshots.mockResolvedValue([]);
    renderDialog();
    expect(await screen.findByTestId('snapshot-restore-empty')).toBeTruthy();
  });

  it('previews, then restores only after the second click, then offers a reload', async () => {
    service.listOverwriteSnapshots.mockResolvedValue([librarySnapshot]);
    service.previewOverwriteSnapshot.mockResolvedValue(
      previewOf(librarySnapshot, { preferenceKeys: ['jieyu.locale'] }),
    );
    service.restoreOverwriteSnapshot.mockResolvedValue({
      restoredSeq: 8,
      scope: 'library',
      projectId: null,
      preRestoreSnapshotSeq: 9,
      verifiedRows: 12,
      restoredPreferenceKeys: ['jieyu.locale'],
    });
    const { onReload } = renderDialog();
    fireEvent.click(await screen.findByTestId('snapshot-restore-preview-8'));
    expect((await screen.findByTestId('snapshot-restore-preferences')).textContent).toContain(
      'jieyu.locale',
    );
    fireEvent.click(screen.getByTestId('snapshot-restore-restore'));
    expect(screen.getByTestId('snapshot-restore-warning')).toBeTruthy();
    expect(service.restoreOverwriteSnapshot).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '确认恢复' }));
    await waitFor(() => expect(service.restoreOverwriteSnapshot).toHaveBeenCalledWith(8));
    expect((await screen.findByTestId('snapshot-restore-done')).textContent).toContain('#9');
    fireEvent.click(screen.getByTestId('snapshot-restore-reload'));
    expect(onReload).toHaveBeenCalled();
  });

  it('explains a refusal and keeps restore disabled', async () => {
    service.listOverwriteSnapshots.mockResolvedValue([projectSnapshot]);
    service.previewOverwriteSnapshot.mockResolvedValue(
      previewOf(projectSnapshot, {
        available: false,
        reason: 'local-bytes-would-be-lost',
        bytesAtRisk: ['media_items:m1', 'lexeme_assets:a1'],
      }),
    );
    renderDialog();
    fireEvent.click(await screen.findByTestId('snapshot-restore-preview-7'));
    expect((await screen.findByTestId('snapshot-restore-blocked')).textContent).toContain('2');
    expect((screen.getByTestId('snapshot-restore-restore') as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('explains when the bytes needed by a snapshot differ on this device', async () => {
    service.listOverwriteSnapshots.mockResolvedValue([projectSnapshot]);
    service.previewOverwriteSnapshot.mockResolvedValue(
      previewOf(projectSnapshot, {
        available: false,
        reason: 'snapshot-bytes-unavailable',
        bytesAtRisk: ['media_items:m1'],
      }),
    );
    renderDialog();
    fireEvent.click(await screen.findByTestId('snapshot-restore-preview-7'));
    expect((await screen.findByTestId('snapshot-restore-blocked')).textContent).toContain(
      '字节在本机缺失或已变化',
    );
  });

  it('shows the error when the restore fails', async () => {
    service.listOverwriteSnapshots.mockResolvedValue([projectSnapshot]);
    service.previewOverwriteSnapshot.mockResolvedValue(previewOf(projectSnapshot));
    service.restoreOverwriteSnapshot.mockRejectedValue(new Error('changed after preview'));
    renderDialog();
    fireEvent.click(await screen.findByTestId('snapshot-restore-preview-7'));
    fireEvent.click(await screen.findByTestId('snapshot-restore-restore'));
    fireEvent.click(screen.getByTestId('snapshot-restore-restore'));
    expect((await screen.findByTestId('snapshot-restore-error')).textContent).toContain(
      'changed after preview',
    );
    expect(screen.queryByTestId('snapshot-restore-reload')).toBeNull();
  });

  it('reports a committed but unverified restore and offers reload', async () => {
    service.listOverwriteSnapshots.mockResolvedValue([projectSnapshot]);
    service.previewOverwriteSnapshot.mockResolvedValue(previewOf(projectSnapshot));
    service.restoreOverwriteSnapshot.mockRejectedValue(
      Object.assign(new Error('cleanup unavailable'), {
        name: 'OverwriteSnapshotPostCommitError',
        preRestoreSnapshotSeq: 9,
      }),
    );
    const { onReload } = renderDialog();
    fireEvent.click(await screen.findByTestId('snapshot-restore-preview-7'));
    fireEvent.click(await screen.findByTestId('snapshot-restore-restore'));
    fireEvent.click(screen.getByTestId('snapshot-restore-restore'));
    expect((await screen.findByTestId('snapshot-restore-pending')).textContent).toContain('#9');
    expect(screen.queryByTestId('snapshot-restore-error')).toBeNull();
    fireEvent.click(screen.getByTestId('snapshot-restore-reload'));
    expect(onReload).toHaveBeenCalled();
  });

  it('keeps a verified restore successful when the snapshot list refresh fails', async () => {
    service.listOverwriteSnapshots
      .mockResolvedValueOnce([projectSnapshot])
      .mockRejectedValueOnce(new Error('list refresh unavailable'));
    service.previewOverwriteSnapshot.mockResolvedValue(previewOf(projectSnapshot));
    service.restoreOverwriteSnapshot.mockResolvedValue({
      restoredSeq: 7,
      scope: 'project',
      projectId: 'pA',
      preRestoreSnapshotSeq: 9,
      verifiedRows: 12,
      restoredPreferenceKeys: [],
    });
    renderDialog();
    fireEvent.click(await screen.findByTestId('snapshot-restore-preview-7'));
    fireEvent.click(await screen.findByTestId('snapshot-restore-restore'));
    fireEvent.click(screen.getByTestId('snapshot-restore-restore'));
    expect(await screen.findByTestId('snapshot-restore-done')).toBeTruthy();
    expect(screen.queryByTestId('snapshot-restore-error')).toBeNull();
    expect(screen.getByTestId('snapshot-restore-reload')).toBeTruthy();
  });
});
