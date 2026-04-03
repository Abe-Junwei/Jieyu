// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LayerDocType } from '../db';
import { LayerActionPopover } from './LayerActionPopover';
import { renderWithLocale } from '../test/localeTestUtils';

const NOW = '2025-01-01T00:00:00.000Z';

const { mockCreateOrthography, mockCloneOrthographyToLanguage, mockCreateOrthographyTransform, mockUseOrthographies } = vi.hoisted(() => ({
  mockCreateOrthography: vi.fn(),
  mockCloneOrthographyToLanguage: vi.fn(),
  mockCreateOrthographyTransform: vi.fn(),
  mockUseOrthographies: vi.fn(),
}));

vi.mock('../services/LinguisticService', () => ({
  LinguisticService: {
    createOrthography: mockCreateOrthography,
    cloneOrthographyToLanguage: mockCloneOrthographyToLanguage,
    createOrthographyTransform: mockCreateOrthographyTransform,
  },
}));

vi.mock('../hooks/useOrthographies', () => ({
  useOrthographies: mockUseOrthographies,
}));

describe('LayerActionPopover orthography creation', () => {
  afterEach(() => {
    cleanup();
    mockCreateOrthography.mockReset();
    mockCloneOrthographyToLanguage.mockReset();
    mockCreateOrthographyTransform.mockReset();
    mockUseOrthographies.mockReset();
  });

  function makeLayer(overrides: Partial<LayerDocType> = {}): LayerDocType {
    return {
      id: 'layer-1',
      projectId: 'project-1',
      mediaId: 'media-1',
      key: 'layer-key',
      layerType: 'transcription',
      name: { zho: '默认转写' },
      languageId: 'cmn',
      constraint: 'independent_boundary',
      createdAt: NOW,
      updatedAt: NOW,
      ...overrides,
    } as LayerDocType;
  }

  it('renders create-transcription path through DialogShell with panel footer actions', () => {
    mockUseOrthographies.mockReturnValue([]);
    const transcriptionLayer = makeLayer();

    renderWithLocale(
      <LayerActionPopover
        action="create-transcription"
        layerId={undefined}
        deletableLayers={[transcriptionLayer]}
        createLayer={vi.fn(async () => true)}
        deleteLayer={vi.fn(async () => undefined)}
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: '新建转写层' });
    const overlay = dialog.parentElement as HTMLDivElement;
    const createButton = screen.getByRole('button', { name: '创建' });
    const cancelButton = screen.getByRole('button', { name: '取消' });
    const closeButton = screen.getByRole('button', { name: '新建转写层 取消' });

    expect(dialog.className).toContain('dialog-card');
    expect(dialog.className).toContain('layer-action-dialog');
    expect(overlay.className).toContain('dialog-overlay-topmost');
    expect(closeButton.closest('.dialog-header')).toBeTruthy();
    expect(createButton.className).toContain('panel-button--primary');
    expect(cancelButton.className).toContain('panel-button--ghost');
    expect(screen.getAllByText('新建转写层').length).toBeGreaterThan(0);
  });

  it('renders delete path through DialogShell with destructive footer action', () => {
    mockUseOrthographies.mockReturnValue([]);
    const transcriptionLayer = makeLayer();
    const translationLayer = makeLayer({
      id: 'layer-2',
      key: 'layer-translation',
      layerType: 'translation',
      name: { zho: '日语翻译' },
      languageId: 'jpn',
    });

    renderWithLocale(
      <LayerActionPopover
        action="delete"
        layerId={translationLayer.id}
        deletableLayers={[transcriptionLayer, translationLayer]}
        createLayer={vi.fn(async () => true)}
        deleteLayer={vi.fn(async () => undefined)}
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: '删除层' });
    const overlay = dialog.parentElement as HTMLDivElement;
    const deleteButton = screen.getByRole('button', { name: '删除' });
    const cancelButton = screen.getByRole('button', { name: '取消' });

    expect(dialog.className).toContain('dialog-card');
    expect(dialog.className).toContain('layer-action-dialog');
    expect(overlay.className).toContain('dialog-overlay-topmost');
    expect(deleteButton.className).toContain('panel-button--danger');
    expect(cancelButton.className).toContain('panel-button--ghost');
    expect(screen.getByRole('option', { name: /日语翻译/ })).toBeTruthy();
    expect(screen.getAllByText('删除层').length).toBeGreaterThan(0);
  });

  it('derives a new current-language orthography from another language before layer creation', async () => {
    mockUseOrthographies.mockImplementation((languageIds: string[]) => {
      if (languageIds.includes('eng')) {
        return [{
          id: 'orth_eng_base',
          name: { eng: 'English Practical' },
          languageId: 'eng',
          abbreviation: 'ENG-PRAC',
          scriptTag: 'Latn',
          type: 'practical',
          createdAt: NOW,
          updatedAt: NOW,
        }];
      }
      return [];
    });
    mockCloneOrthographyToLanguage.mockResolvedValue({
      id: 'orth_cmn_derived',
      name: { eng: 'English Practical' },
      languageId: 'cmn',
      abbreviation: 'ENG-PRAC',
      scriptTag: 'Latn',
      type: 'practical',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const createLayer = vi.fn(async () => true);
    const onClose = vi.fn();

    renderWithLocale(
      <LayerActionPopover
        action="create-transcription"
        layerId={undefined}
        deletableLayers={[]}
        createLayer={createLayer}
        deleteLayer={vi.fn(async () => undefined)}
        onClose={onClose}
      />,
    );

    fireEvent.change(document.body.querySelectorAll('select')[0] as HTMLSelectElement, {
      target: { value: 'cmn' },
    });

    await waitFor(() => {
      expect(document.body.querySelectorAll('select').length).toBeGreaterThanOrEqual(2);
    });

    fireEvent.change(document.body.querySelectorAll('select')[1] as HTMLSelectElement, {
      target: { value: '__create_new_orthography__' },
    });

    fireEvent.change(await screen.findByDisplayValue('基于 IPA 创建'), {
      target: { value: 'derive-other' },
    });

    await waitFor(() => {
      expect(document.body.querySelectorAll('select').length).toBeGreaterThanOrEqual(4);
    });

    fireEvent.change(document.body.querySelectorAll('select')[3] as HTMLSelectElement, {
      target: { value: 'eng' },
    });

    await waitFor(() => {
      const selects = document.body.querySelectorAll('select');
      expect(selects.length).toBeGreaterThanOrEqual(5);
      const sourceOrthographySelect = selects[4] as HTMLSelectElement;
      expect(sourceOrthographySelect.options.length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole('button', { name: '确认风险并创建' }));
    fireEvent.click(await screen.findByRole('button', { name: '创建并选中' }));

    await waitFor(() => {
      expect(mockCloneOrthographyToLanguage).toHaveBeenCalledWith(expect.objectContaining({
        sourceOrthographyId: 'orth_eng_base',
        targetLanguageId: 'cmn',
        scriptTag: 'Latn',
      }));
    });

    fireEvent.click(screen.getByRole('button', { name: '创建' }));

    await waitFor(() => {
      expect(createLayer).toHaveBeenCalledWith(
        'transcription',
        expect.objectContaining({
          languageId: 'cmn',
          orthographyId: 'orth_cmn_derived',
        }),
        undefined,
      );
      expect(onClose).toHaveBeenCalled();
    });
  });
});
