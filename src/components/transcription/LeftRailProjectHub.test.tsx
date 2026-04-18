// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../../i18n';
import { LeftRailProjectHub } from './LeftRailProjectHub';
import type { JieyuArchiveImportPreview } from '../../services/JymService';

const showToastMock = vi.hoisted(() => vi.fn());

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({
    showToast: showToastMock,
  }),
}));

function makePreview(): JieyuArchiveImportPreview {
  return {
    kind: 'jym',
    manifest: {
      formatVersion: 1,
      kind: 'jym',
      schemaVersion: 1,
      exportedAt: '2026-04-03T00:00:00.000Z',
    },
    collections: [
      {
        name: 'projects',
        incoming: 2,
        conflicts: 1,
        existing: 1,
        willInsertUpsert: 2,
        willInsertSkipExisting: 1,
        willInsertReplaceAll: 2,
      },
      {
        name: 'media',
        incoming: 1,
        conflicts: 0,
        existing: 0,
        willInsertUpsert: 1,
        willInsertSkipExisting: 1,
        willInsertReplaceAll: 1,
      },
    ],
    totalIncoming: 3,
    totalConflicts: 1,
  };
}

function renderHub(overrides: Partial<Parameters<typeof LeftRailProjectHub>[0]> = {}) {
  const onPreviewProjectArchiveImport = vi.fn(async () => makePreview());
  const onImportProjectArchive = vi.fn(async () => true);
  const onImportAnnotationFile = vi.fn(async () => undefined);
  const onApplyTextTimeMapping = vi.fn(async () => undefined);

  render(
    <LocaleProvider locale="zh-CN">
      <LeftRailProjectHub
        currentProjectLabel="项目 A"
        canDeleteProject
        canDeleteAudio
        onOpenProjectSetup={vi.fn()}
        onOpenAudioImport={vi.fn()}
        onDeleteCurrentProject={vi.fn()}
        onDeleteCurrentAudio={vi.fn()}
        onOpenSpeakerManagementPanel={vi.fn()}
        onImportAnnotationFile={onImportAnnotationFile}
        onPreviewProjectArchiveImport={onPreviewProjectArchiveImport}
        onImportProjectArchive={onImportProjectArchive}
        onApplyTextTimeMapping={onApplyTextTimeMapping}
        onExportEaf={vi.fn()}
        onExportTextGrid={vi.fn()}
        onExportTrs={vi.fn()}
        onExportFlextext={vi.fn()}
        onExportToolbox={vi.fn()}
        onExportJyt={vi.fn(async () => undefined)}
        onExportJym={vi.fn(async () => undefined)}
        {...overrides}
      />
    </LocaleProvider>,
  );

  return {
    onPreviewProjectArchiveImport,
    onImportProjectArchive,
    onImportAnnotationFile,
    onApplyTextTimeMapping,
  };
}

beforeEach(() => {
  showToastMock.mockReset();
  const host = document.createElement('div');
  host.id = 'left-rail-project-hub-slot';
  document.body.appendChild(host);
});

afterEach(() => {
  cleanup();
  document.getElementById('left-rail-project-hub-slot')?.remove();
});

describe('LeftRailProjectHub project import dialog', () => {
  it('opens the import preview dialog through the archive input with DialogShell wide layout', async () => {
    const { onPreviewProjectArchiveImport } = renderHub();
    const file = new File(['archive'], 'demo.jym', { type: 'application/octet-stream' });
    const input = document.querySelector('input[accept=".jyt,.jym"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(onPreviewProjectArchiveImport).toHaveBeenCalledWith(file);
    });

    const dialog = await screen.findByRole('dialog', { name: '导入项目预览' });
    const cancelButton = screen.getByRole('button', { name: '取消' });
    const confirmButton = screen.getByRole('button', { name: '开始导入项目' });

    expect(dialog.className).toContain('dialog-card');
    expect(dialog.className).toContain('dialog-card-wide');
    expect(dialog.className).toContain('left-rail-project-import-dialog');
    expect(cancelButton.className).toContain('panel-button--ghost');
    expect(confirmButton.className).toContain('panel-button--primary');
    expect(screen.getByText('demo.jym')).toBeTruthy();
    expect(screen.getByText('导入策略')).toBeTruthy();
    expect(screen.getByText('projects')).toBeTruthy();
  });

  it('passes the selected strategy when confirming archive import', async () => {
    const { onImportProjectArchive } = renderHub();
    const file = new File(['archive'], 'demo.jym', { type: 'application/octet-stream' });
    const input = document.querySelector('input[accept=".jyt,.jym"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    await screen.findByRole('dialog', { name: '导入项目预览' });
    fireEvent.click(screen.getByLabelText('保留已有项（skip-existing）'));
    fireEvent.click(screen.getByRole('button', { name: '开始导入项目' }));

    await waitFor(() => {
      expect(onImportProjectArchive).toHaveBeenCalledWith(file, 'skip-existing');
    });
  });

  it('opens annotation import strategy dialog and passes the selected strategy', async () => {
    const { onImportAnnotationFile } = renderHub();
    const file = new File(['annotation'], 'demo.eaf', { type: 'application/xml' });
    const input = document.querySelector('input[accept=".eaf,.textgrid,.TextGrid,.trs,.flextext,.txt,.toolbox"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    await screen.findByRole('dialog', { name: '导入标注文件' });
    fireEvent.click(screen.getByRole('radio', { name: /仅写入目标表示/ }));
    fireEvent.click(screen.getByRole('button', { name: '开始导入标注' }));

    await waitFor(() => {
      expect(onImportAnnotationFile).toHaveBeenCalledWith(file, 'bridge-target');
    });
  });

  it('shows logical timeline hint and mapping preview in export submenu when timeline mode is document', async () => {
    renderHub({
      activeTextTimelineMode: 'document',
      activeTextTimeMapping: {
        offsetSec: 3,
        scale: 1.2,
        revision: 2,
        logicalDurationSec: 1800,
      },
    });

    fireEvent.click(screen.getByRole('button', { name: '打开项目中心' }));
    const exportText = await screen.findByText('导出');
    const exportMenuButton = exportText.closest('button') as HTMLButtonElement;
    fireEvent.mouseEnter(exportMenuButton);

    const hintText = await screen.findByText('当前项目使用纯文本模式；导出时间戳不等于声学秒。');
    const hintButton = hintText.closest('button') as HTMLButtonElement;
    expect(hintButton.disabled).toBe(true);
    expect(await screen.findByText('时间映射预览：文档 0.0–1800.0s → 实际 3.0–2163.0s（偏移 3.0，倍率 ×1.20，版本 2）')).toBeTruthy();
  });

  it('opens the time-mapping calibration dialog and saves the edited values', async () => {
    const { onApplyTextTimeMapping } = renderHub({
      activeTextTimelineMode: 'document',
      activeTextTimeMapping: {
        offsetSec: 1,
        scale: 1.1,
        revision: 3,
      },
    });

    fireEvent.click(screen.getByRole('button', { name: '打开项目中心' }));
    const exportText = await screen.findByText('导出');
    const exportMenuButton = exportText.closest('button') as HTMLButtonElement;
    fireEvent.mouseEnter(exportMenuButton);
    fireEvent.click(await screen.findByText('校准时间映射…'));

    await screen.findByRole('dialog', { name: '校准逻辑时间映射' });
    const offsetInput = screen.getByLabelText('偏移秒数');
    const scaleInput = screen.getByLabelText('时间倍率');

    fireEvent.change(offsetInput, { target: { value: '5' } });
    fireEvent.change(scaleInput, { target: { value: '1.5' } });
    fireEvent.click(screen.getByRole('button', { name: '应用映射' }));

    await waitFor(() => {
      expect(onApplyTextTimeMapping).toHaveBeenCalledWith({
        offsetSec: 5,
        scale: 1.5,
      });
    });
  });

  it('rolls back to the previous time-mapping snapshot when available', async () => {
    const { onApplyTextTimeMapping } = renderHub({
      activeTextTimelineMode: 'document',
      activeTextTimeMapping: {
        offsetSec: 5,
        scale: 1.5,
        revision: 4,
        rollback: {
          offsetSec: 1,
          scale: 1.1,
          revision: 3,
        },
      } as Parameters<typeof LeftRailProjectHub>[0]['activeTextTimeMapping'],
    });

    fireEvent.click(screen.getByRole('button', { name: '打开项目中心' }));
    const exportText = await screen.findByText('导出');
    const exportMenuButton = exportText.closest('button') as HTMLButtonElement;
    fireEvent.mouseEnter(exportMenuButton);
    fireEvent.click(await screen.findByText('回滚上一版映射'));

    await waitFor(() => {
      expect(onApplyTextTimeMapping).toHaveBeenCalledWith({
        offsetSec: 1,
        scale: 1.1,
      });
    });
  });

  it('shows current and previous mapping entries in the calibration dialog', async () => {
    renderHub({
      activeTextTimelineMode: 'document',
      activeTextTimeMapping: {
        offsetSec: 5,
        scale: 1.5,
        revision: 4,
        rollback: {
          offsetSec: 1,
          scale: 1.1,
          revision: 3,
        },
        history: [
          {
            offsetSec: 0.5,
            scale: 0.95,
            revision: 2,
          },
          {
            offsetSec: 0,
            scale: 1,
            revision: 1,
          },
        ],
      } as Parameters<typeof LeftRailProjectHub>[0]['activeTextTimeMapping'],
    });

    fireEvent.click(screen.getByRole('button', { name: '打开项目中心' }));
    const exportText = await screen.findByText('导出');
    const exportMenuButton = exportText.closest('button') as HTMLButtonElement;
    fireEvent.mouseEnter(exportMenuButton);
    fireEvent.click(await screen.findByText('校准时间映射…'));

    await screen.findByRole('dialog', { name: '校准逻辑时间映射' });
    expect(await screen.findByText('当前版本 v4 · 偏移 5.0s · 倍率 ×1.50')).toBeTruthy();
    expect(await screen.findByText('上一版本 v3 · 偏移 1.0s · 倍率 ×1.10')).toBeTruthy();
    expect(await screen.findByText('更早版本 v2 · 偏移 0.5s · 倍率 ×0.95')).toBeTruthy();
    expect(await screen.findByText('更早版本 v1 · 偏移 0.0s · 倍率 ×1.00')).toBeTruthy();
  });

  it('fills the calibration form when a history entry is clicked', async () => {
    renderHub({
      activeTextTimelineMode: 'document',
      activeTextTimeMapping: {
        offsetSec: 5,
        scale: 1.5,
        revision: 4,
        rollback: {
          offsetSec: 1,
          scale: 1.1,
          revision: 3,
        },
        history: [
          {
            offsetSec: 0.5,
            scale: 0.95,
            revision: 2,
          },
        ],
      } as Parameters<typeof LeftRailProjectHub>[0]['activeTextTimeMapping'],
    });

    fireEvent.click(screen.getByRole('button', { name: '打开项目中心' }));
    const exportText = await screen.findByText('导出');
    const exportMenuButton = exportText.closest('button') as HTMLButtonElement;
    fireEvent.mouseEnter(exportMenuButton);
    fireEvent.click(await screen.findByText('校准时间映射…'));

    await screen.findByRole('dialog', { name: '校准逻辑时间映射' });
    fireEvent.click(screen.getByRole('button', { name: '更早版本 v2 · 偏移 0.5s · 倍率 ×0.95' }));

    expect((screen.getByLabelText('偏移秒数') as HTMLInputElement).value).toBe('0.5');
    expect((screen.getByLabelText('时间倍率') as HTMLInputElement).value).toBe('0.95');
  });
});