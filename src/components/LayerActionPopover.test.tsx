// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LayerDocType } from '../db';
import { LocaleProvider } from '../i18n';
import { LayerActionPopover } from './LayerActionPopover';
import { renderWithLocale } from '../test/localeTestUtils';

const NOW = '2025-01-01T00:00:00.000Z';

const { mockCreateOrthography, mockCloneOrthographyToLanguage, mockCreateOrthographyBridge, mockListLanguageCatalogEntries, mockUseOrthographies } = vi.hoisted(() => ({
  mockCreateOrthography: vi.fn(),
  mockCloneOrthographyToLanguage: vi.fn(),
  mockCreateOrthographyBridge: vi.fn(),
  mockListLanguageCatalogEntries: vi.fn(),
  mockUseOrthographies: vi.fn(),
}));

vi.mock('../services/LinguisticService', () => ({
  LinguisticService: {
    createOrthography: mockCreateOrthography,
    cloneOrthographyToLanguage: mockCloneOrthographyToLanguage,
    createOrthographyBridge: mockCreateOrthographyBridge,
    listLanguageCatalogEntries: mockListLanguageCatalogEntries,
  },
}));

vi.mock('../hooks/useOrthographies', () => ({
  useOrthographies: mockUseOrthographies,
}));

mockListLanguageCatalogEntries.mockResolvedValue([]);

describe('LayerActionPopover orthography creation', () => {
  afterEach(() => {
    cleanup();
    mockCreateOrthography.mockReset();
    mockCloneOrthographyToLanguage.mockReset();
    mockCreateOrthographyBridge.mockReset();
    mockListLanguageCatalogEntries.mockReset();
    mockListLanguageCatalogEntries.mockResolvedValue([]);
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
    const createButton = screen.getByRole('button', { name: '新建转写层' });
    const closeButton = screen.getByRole('button', { name: '新建转写层 取消' });

    expect(dialog.className).toContain('dialog-card');
    expect(dialog.className).toContain('layer-action-dialog');
    expect(overlay.className).toContain('dialog-overlay-topmost');
    expect(closeButton.closest('.dialog-header')).toBeTruthy();
    expect(createButton.className).toContain('panel-button--primary');
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

    fireEvent.change(screen.getByRole('textbox', { name: /语言代码|ISO 639-3/i }), {
      target: { value: 'cmn' },
    });

    fireEvent.click(await screen.findByRole('button', { name: '新建' }));

    fireEvent.change(await screen.findByRole('combobox', { name: '创建方式' }), {
      target: { value: 'derive-other' },
    });

    fireEvent.change(await screen.findByPlaceholderText('来源语言 ISO 639-3 代码（如 eng）'), {
      target: { value: 'eng' },
    });

    await waitFor(() => {
      const sourceOrthographySelect = screen.getByRole('combobox', { name: '来源正字法' }) as HTMLSelectElement;
      expect(sourceOrthographySelect.options.length).toBeGreaterThan(0);
      expect(sourceOrthographySelect.value).toBe('orth_eng_base');
    });

    fireEvent.click(await screen.findByRole('button', { name: /确认风险并创建|创建并选中/ }));
    if (mockCloneOrthographyToLanguage.mock.calls.length === 0) {
      fireEvent.click(await screen.findByRole('button', { name: /确认风险并创建|创建并选中/ }));
    }

    await waitFor(() => {
      expect(mockCloneOrthographyToLanguage).toHaveBeenCalledWith(expect.objectContaining({
        sourceOrthographyId: 'orth_eng_base',
        targetLanguageId: 'cmn',
        scriptTag: 'Latn',
      }));
    });

    fireEvent.click(screen.getByRole('button', { name: '新建转写层' }));

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

  it('shows the selected orthography status badge in the dialog', async () => {
    mockUseOrthographies.mockImplementation((languageIds: string[]) => {
      if (languageIds.includes('eng')) {
        return [{
          id: 'orth_eng_reviewed',
          name: { eng: 'English Reviewed' },
          languageId: 'eng',
          scriptTag: 'Latn',
          type: 'practical',
          catalogMetadata: { catalogSource: 'built-in-reviewed', reviewStatus: 'verified-primary', priority: 'primary' },
          createdAt: NOW,
          updatedAt: NOW,
        }];
      }
      return [];
    });

    renderWithLocale(
      <LayerActionPopover
        action="create-transcription"
        layerId={undefined}
        deletableLayers={[]}
        createLayer={vi.fn(async () => true)}
        deleteLayer={vi.fn(async () => undefined)}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: /语言代码|ISO 639-3/i }), {
      target: { value: 'eng' },
    });

    await waitFor(() => {
      expect(screen.getAllByText('English Reviewed · Latn · practical').length).toBeGreaterThan(0);
      expect(Array.from(document.querySelectorAll('.panel-chip')).some((node) => node.textContent === '已审校主项')).toBe(true);
    });

    expect(screen.queryByRole('button', { name: '管理写入桥接规则' })).toBeNull();
  });

  it('prefills project default language and orthography and reset restores them', async () => {
    mockUseOrthographies.mockImplementation((languageIds: string[]) => {
      if (languageIds.includes('eng')) {
        return [{
          id: 'orth_eng_default',
          languageId: 'eng',
          name: { eng: 'English Default' },
          scriptTag: 'Latn',
          type: 'practical',
          createdAt: NOW,
          updatedAt: NOW,
        }];
      }
      if (languageIds.includes('jpn')) {
        return [{
          id: 'orth_jpn_default',
          languageId: 'jpn',
          name: { eng: 'Japanese Default' },
          scriptTag: 'Jpan',
          type: 'practical',
          createdAt: NOW,
          updatedAt: NOW,
        }];
      }
      return [];
    });

    renderWithLocale(
      <LayerActionPopover
        action="create-translation"
        layerId={undefined}
        deletableLayers={[makeLayer()]}
        defaultLanguageId="eng"
        defaultOrthographyId="orth_eng_default"
        createLayer={vi.fn(async () => true)}
        deleteLayer={vi.fn(async () => undefined)}
        onClose={vi.fn()}
      />,
    );

    const languageCodeInput = screen.getByRole('textbox', { name: /语言代码|ISO 639-3/i }) as HTMLInputElement;

    await waitFor(() => {
      expect(languageCodeInput.value).toBe('eng');
      expect((screen.getByRole('combobox', { name: /正字法|Orthography/i }) as HTMLSelectElement).value).toBe('orth_eng_default');
    });

    // 绕过 React 受控组件的值追踪器 | Bypass React controlled input value tracker
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      nativeInputValueSetter.call(languageCodeInput, 'jpn');
      languageCodeInput.dispatchEvent(new Event('input', { bubbles: true }));
      languageCodeInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await waitFor(() => {
      expect((screen.getByRole('textbox', { name: /语言代码|ISO 639-3/i }) as HTMLInputElement).value).toBe('jpn');
      expect((screen.getByRole('combobox', { name: /正字法|Orthography/i }) as HTMLSelectElement).value).toBe('orth_jpn_default');
    });

    fireEvent.click(screen.getByRole('button', { name: '重置表单' }));

    await waitFor(() => {
      expect((screen.getByRole('textbox', { name: /语言代码|ISO 639-3/i }) as HTMLInputElement).value).toBe('eng');
      expect((screen.getByRole('combobox', { name: /正字法|Orthography/i }) as HTMLSelectElement).value).toBe('orth_eng_default');
    });
  });

  it('shows an inline invalid language-code error while the user is typing an invalid value', async () => {
    mockUseOrthographies.mockReturnValue([]);

    renderWithLocale(
      <LayerActionPopover
        action="create-transcription"
        layerId={undefined}
        deletableLayers={[]}
        createLayer={vi.fn(async () => true)}
        deleteLayer={vi.fn(async () => undefined)}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: /语言代码|ISO 639-3/i }), {
      target: { value: 'bad!' },
    });

    expect(screen.getByText('请输入有效的 ISO 639 / BCP 47 语言代码。')).toBeTruthy();
  });

  it('keeps user edits when locale changes instead of resetting back to defaults', async () => {
    mockUseOrthographies.mockImplementation((languageIds: string[]) => {
      if (languageIds.includes('eng')) {
        return [{
          id: 'orth_eng_default',
          languageId: 'eng',
          name: { eng: 'English Default' },
          scriptTag: 'Latn',
          type: 'practical',
          createdAt: NOW,
          updatedAt: NOW,
        }];
      }
      if (languageIds.includes('jpn')) {
        return [{
          id: 'orth_jpn_default',
          languageId: 'jpn',
          name: { eng: 'Japanese Default' },
          scriptTag: 'Jpan',
          type: 'practical',
          createdAt: NOW,
          updatedAt: NOW,
        }];
      }
      return [];
    });

    const renderPopover = (locale: 'zh-CN' | 'en-US') => (
      <LocaleProvider locale={locale}>
        <LayerActionPopover
          action="create-translation"
          layerId={undefined}
          deletableLayers={[makeLayer()]}
          defaultLanguageId="eng"
          defaultOrthographyId="orth_eng_default"
          createLayer={vi.fn(async () => true)}
          deleteLayer={vi.fn(async () => undefined)}
          onClose={vi.fn()}
        />
      </LocaleProvider>
    );

    const { rerender } = render(renderPopover('zh-CN'));

    const languageCodeInput = screen.getByRole('textbox', { name: /语言代码|Language Code/i }) as HTMLInputElement;
    const aliasInput = screen.getByRole('textbox', { name: /别名（可选）|Alias \(optional\)/i }) as HTMLInputElement;

    await waitFor(() => {
      expect(languageCodeInput.value).toBe('eng');
      expect((screen.getByRole('combobox', { name: /正字法|Orthography/i }) as HTMLSelectElement).value).toBe('orth_eng_default');
    });

    fireEvent.change(languageCodeInput, { target: { value: 'jpn' } });
    fireEvent.change(aliasInput, { target: { value: 'draft alias' } });

    await waitFor(() => {
      expect((screen.getByRole('textbox', { name: /语言代码|Language Code/i }) as HTMLInputElement).value).toBe('jpn');
      expect(aliasInput.value).toBe('draft alias');
      expect((screen.getByRole('combobox', { name: /正字法|Orthography/i }) as HTMLSelectElement).value).toBe('orth_jpn_default');
    });

    rerender(renderPopover('en-US'));

    await waitFor(() => {
      expect((screen.getByRole('textbox', { name: /语言代码|Language Code/i }) as HTMLInputElement).value).toBe('jpn');
      expect((screen.getByRole('textbox', { name: /别名（可选）|Alias \(optional\)/i }) as HTMLInputElement).value).toBe('draft alias');
      expect((screen.getByRole('combobox', { name: /正字法|Orthography/i }) as HTMLSelectElement).value).toBe('orth_jpn_default');
    });
  });
});
