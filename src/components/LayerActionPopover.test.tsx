// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { within } from '@testing-library/react';
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

vi.mock('../services/LinguisticService.orthography', () => ({
  createOrthographyRecord: mockCreateOrthography,
  cloneOrthographyRecordToLanguage: mockCloneOrthographyToLanguage,
  createOrthographyBridgeRecord: mockCreateOrthographyBridge,
}));

vi.mock('../services/LinguisticService.languageCatalog', () => ({
  listLanguageCatalogEntries: mockListLanguageCatalogEntries,
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

    const codeInputForCmn = screen.getByRole('textbox', { name: /语言代码|ISO 639-3/i });
    fireEvent.change(codeInputForCmn, {
      target: { value: 'cmn' },
    });
    fireEvent.blur(codeInputForCmn);

    const openBuilderButton = document.querySelector('.layer-action-dialog-inline-btn') as HTMLButtonElement | null;
    expect(openBuilderButton).toBeTruthy();
    fireEvent.click(openBuilderButton as HTMLButtonElement);

    fireEvent.change(await screen.findByRole('combobox', { name: '创建方式' }), {
      target: { value: 'derive-other' },
    });

    const sourceLanguageCodeInput = await screen.findByPlaceholderText('来源语言 ISO 639-3 代码（如 eng）');
    fireEvent.change(sourceLanguageCodeInput, {
      target: { value: 'eng' },
    });
    fireEvent.blur(sourceLanguageCodeInput);

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
        'text',
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

    const codeInputForEng = screen.getByRole('textbox', { name: /语言代码|ISO 639-3/i });
    fireEvent.change(codeInputForEng, {
      target: { value: 'eng' },
    });
    fireEvent.blur(codeInputForEng);

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

    // 等待异步语言目录加载完成，避免 resolveLanguageDisplayName 引用变化覆盖用户输入
    // Wait for async language catalog to settle so resolveLanguageDisplayName ref stabilises
    await waitFor(() => {
      expect(mockListLanguageCatalogEntries).toHaveBeenCalled();
    });

    fireEvent.change(languageCodeInput, { target: { value: 'jpn' } });
    fireEvent.blur(languageCodeInput);

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

  it('passes selected translation host ids when creating a translation layer', async () => {
    mockUseOrthographies.mockReturnValue([]);
    const rootA = makeLayer({
      id: 'layer-trc-a',
      key: 'trc-a',
      layerType: 'transcription',
      languageId: 'zho',
      constraint: 'independent_boundary',
      name: { zho: '转写层甲' },
    });
    const rootB = makeLayer({
      id: 'layer-trc-b',
      key: 'trc-b',
      layerType: 'transcription',
      languageId: 'jpn',
      constraint: 'independent_boundary',
      name: { zho: '转写层乙' },
    });
    const createLayer = vi.fn(async () => true);

    renderWithLocale(
      <LayerActionPopover
        action="create-translation"
        layerId={undefined}
        deletableLayers={[rootA, rootB]}
        createLayer={createLayer}
        deleteLayer={vi.fn(async () => undefined)}
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: '新建翻译层' });
    const hostCheckbox = within(dialog).getByRole('checkbox', { name: /日语 jpn/ });
    fireEvent.click(hostCheckbox);

    const languageCodeInput = within(dialog).getByRole('textbox', { name: /语言代码|ISO 639-3/i });
    fireEvent.change(languageCodeInput, { target: { value: 'fra' } });
    fireEvent.blur(languageCodeInput);

    await waitFor(() => {
      expect((within(dialog).getByRole('button', { name: '新建翻译层' }) as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(within(dialog).getByRole('button', { name: '新建翻译层' }));

    await waitFor(() => {
      expect(createLayer).toHaveBeenCalledWith(
        'translation',
        expect.objectContaining({
          languageId: 'fra',
          hostTranscriptionLayerIds: [rootB.id],
          preferredHostTranscriptionLayerId: rootB.id,
        }),
        'text',
      );
    });
  });

  it('shows an inline invalid language-code error after the user finishes editing an invalid value', async () => {
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

    const languageCodeInput = screen.getByRole('textbox', { name: /语言代码|ISO 639-3/i }) as HTMLInputElement;
    fireEvent.focus(languageCodeInput);
    fireEvent.change(languageCodeInput, {
      target: { value: '0' },
    });

    expect(screen.queryByText('请输入有效的 ISO 639 / BCP 47 语言代码。')).toBeNull();

    fireEvent.focusOut(languageCodeInput);

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

    // 等待异步语言目录加载完成 | Wait for async language catalog to settle
    await waitFor(() => {
      expect(mockListLanguageCatalogEntries).toHaveBeenCalled();
    });

    fireEvent.change(languageCodeInput, { target: { value: 'jpn' } });
    fireEvent.blur(languageCodeInput);
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
