// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LayerDocType } from '../db';
import { LocaleProvider } from '../i18n';
import { LayerManagerPopover } from './LayerManagerPopover';

afterEach(() => {
  cleanup();
});

function makeLayer(overrides: Partial<LayerDocType> = {}): LayerDocType {
  return {
    id: 'layer-1',
    projectId: 'project-1',
    mediaId: 'media-1',
    key: 'layer-key',
    layerType: 'transcription',
    name: { zho: '默认层' },
    languageId: 'cmn',
    constraint: 'independent_boundary',
    createdAt: '2026-04-03T00:00:00.000Z',
    updatedAt: '2026-04-03T00:00:00.000Z',
    ...overrides,
  } as LayerDocType;
}

function renderDialog() {
  const transcriptionLayer = makeLayer();
  const translationLayer = makeLayer({
    id: 'layer-2',
    key: 'layer-translation',
    layerType: 'translation',
    name: { zho: '日语翻译' },
    languageId: 'jpn',
  });

  return render(
    <LocaleProvider locale="zh-CN">
      <LayerManagerPopover
        allLayers={[transcriptionLayer, translationLayer]}
        isOpen
        renderMode="dialog"
        onToggle={vi.fn()}
        onClose={vi.fn()}
        onCreateTranscriptionLayer={vi.fn(async () => true)}
        onCreateTranslationLayer={vi.fn(async () => true)}
        deletableLayers={[translationLayer]}
        layerToDeleteId={translationLayer.id}
        onLayerToDeleteIdChange={vi.fn()}
        layerPendingDelete={translationLayer}
        onDeleteLayer={vi.fn()}
        message=""
      />
    </LocaleProvider>,
  );
}

describe('LayerManagerPopover', () => {
  it('renders dialog mode through DialogShell with modal semantics and panel actions', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog', { name: '层管理' });
    const overlay = dialog.parentElement?.parentElement as HTMLDivElement;
    const closeButtons = screen.getAllByRole('button', { name: '关闭' });
    const footerCloseButton = closeButtons.find((button) => button.className.includes('panel-button--ghost'));
    const createTranscriptionButton = screen.getByRole('button', { name: '新建转写层' });
    const createTranslationButton = screen.getByRole('button', { name: '新建翻译层' });
    const confirmDeleteButton = screen.getByRole('button', { name: '确认删除' });

    expect(dialog.className).toContain('dialog-card');
    expect(dialog.className).toContain('layer-manager');
    expect(overlay.className).toContain('dialog-overlay-topmost');
    expect(footerCloseButton?.className).toContain('panel-button--ghost');
    expect(createTranscriptionButton.className).toContain('panel-button--primary');
    expect(createTranslationButton.className).toContain('panel-button--primary');
    expect(confirmDeleteButton.className).toContain('panel-button--danger');
    expect(screen.getAllByText('新建转写层').length).toBeGreaterThan(0);
    expect(screen.getAllByText('新建翻译层').length).toBeGreaterThan(0);
    expect(screen.getAllByText('删除层').length).toBeGreaterThan(0);
  });

  it('exposes accessible names for layer management form controls', () => {
    renderDialog();

    expect(screen.getByRole('combobox', { name: '新建转写层 选择语言' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: '新建转写层 别名（可选）' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: '新建翻译层 选择语言' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: '新建翻译层 别名（可选）' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: '翻译层输出形态' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: '删除目标层' })).toBeTruthy();
  });
});
