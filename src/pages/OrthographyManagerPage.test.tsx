// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppSidePaneProvider, useAppSidePaneRegistrationSnapshot } from '../contexts/AppSidePaneContext';
import type { OrthographyDocType } from '../db';
import { LocaleProvider } from '../i18n';
import { OrthographyManagerPage } from './OrthographyManagerPage';

const { mockListOrthographies, mockUpdateOrthography, mockListLanguageCatalogEntries } = vi.hoisted(() => ({
  mockListOrthographies: vi.fn(),
  mockUpdateOrthography: vi.fn(),
  mockListLanguageCatalogEntries: vi.fn(),
}));

vi.mock('../services/LinguisticService.orthography', () => ({
  listOrthographyRecords: mockListOrthographies,
  updateOrthographyRecord: mockUpdateOrthography,
}));

vi.mock('../services/LinguisticService.languageCatalog', () => ({
  listLanguageCatalogEntries: mockListLanguageCatalogEntries,
}));

vi.mock('../hooks/useProjectLanguageIds', () => {
  const stableIds: string[] = [];
  return {
    useProjectLanguageIds: () => ({ projectLanguageIds: stableIds, loading: false }),
  };
});

function SidePaneSnapshot() {
  const registration = useAppSidePaneRegistrationSnapshot();

  return (
    <>
      <div data-testid="side-pane-title">{registration?.title ?? ''}</div>
      <div data-testid="side-pane-subtitle">{registration?.subtitle ?? ''}</div>
      <div data-testid="side-pane-content">{registration?.content ?? null}</div>
    </>
  );
}

describe('OrthographyManagerPage', () => {
  beforeEach(() => {
    mockListOrthographies.mockReset();
    mockUpdateOrthography.mockReset();
    mockListLanguageCatalogEntries.mockReset();
    mockListOrthographies.mockResolvedValue([
      {
        id: 'orth-source',
        languageId: 'eng',
        name: { eng: 'Bridge Orthography' },
        scriptTag: 'Latn',
        type: 'practical',
        catalogMetadata: { catalogSource: 'built-in-reviewed', reviewStatus: 'verified-primary', priority: 'primary' },
        createdAt: '2026-04-04T00:00:00.000Z',
        updatedAt: '2026-04-04T00:00:00.000Z',
      },
      {
        id: 'orth-alt',
        languageId: 'zho',
        name: { zho: '备选正字法' },
        scriptTag: 'Hans',
        type: 'practical',
        catalogMetadata: { catalogSource: 'user' },
        createdAt: '2026-04-04T00:00:00.000Z',
        updatedAt: '2026-04-04T00:00:00.000Z',
      },
    ] satisfies OrthographyDocType[]);
    mockListLanguageCatalogEntries.mockImplementation(async ({ locale }: { locale: 'zh-CN' | 'en-US' }) => ([
      {
        id: 'eng',
        entryKind: 'built-in',
        hasPersistedRecord: false,
        languageCode: 'eng',
        englishName: 'English',
        localName: locale === 'en-US' ? 'English' : '英语',
        aliases: ['英文'],
        sourceType: 'built-in-generated',
        visibility: 'visible',
        displayNames: [],
      },
      {
        id: 'zho',
        entryKind: 'built-in',
        hasPersistedRecord: false,
        languageCode: 'zho',
        englishName: 'Chinese',
        localName: locale === 'en-US' ? 'Chinese' : '中文',
        aliases: ['汉语'],
        sourceType: 'built-in-generated',
        visibility: 'visible',
        displayNames: [],
      },
    ]));
    mockUpdateOrthography.mockImplementation(async (input: Record<string, unknown>) => ({
      id: 'orth-source',
      languageId: String(input.languageId ?? 'eng'),
      name: input.name as OrthographyDocType['name'],
      scriptTag: String(input.scriptTag ?? 'Latn'),
      type: (input.type as OrthographyDocType['type']) ?? 'practical',
      direction: (input.direction as OrthographyDocType['direction']) ?? 'ltr',
      ...(typeof input.localeTag === 'string' ? { localeTag: input.localeTag } : {}),
      ...(typeof input.regionTag === 'string' ? { regionTag: input.regionTag } : {}),
      ...(typeof input.variantTag === 'string' ? { variantTag: input.variantTag } : {}),
      ...(typeof input.abbreviation === 'string' ? { abbreviation: input.abbreviation } : {}),
      ...((input.exemplarCharacters as OrthographyDocType['exemplarCharacters'] | undefined)
        ? { exemplarCharacters: input.exemplarCharacters as OrthographyDocType['exemplarCharacters'] }
        : {}),
      ...((input.fontPreferences as OrthographyDocType['fontPreferences'] | undefined)
        ? { fontPreferences: input.fontPreferences as OrthographyDocType['fontPreferences'] }
        : {}),
      ...((input.inputHints as OrthographyDocType['inputHints'] | undefined)
        ? { inputHints: input.inputHints as OrthographyDocType['inputHints'] }
        : {}),
      ...((input.normalization as OrthographyDocType['normalization'] | undefined)
        ? { normalization: input.normalization as OrthographyDocType['normalization'] }
        : {}),
      ...((input.collation as OrthographyDocType['collation'] | undefined)
        ? { collation: input.collation as OrthographyDocType['collation'] }
        : {}),
      ...((input.conversionRules as Record<string, unknown> | undefined)
        ? { conversionRules: input.conversionRules as Record<string, unknown> }
        : {}),
      ...((input.notes as OrthographyDocType['notes'] | undefined)
        ? { notes: input.notes as OrthographyDocType['notes'] }
        : {}),
      bidiPolicy: input.bidiPolicy as OrthographyDocType['bidiPolicy'],
      catalogMetadata: (input.catalogMetadata as OrthographyDocType['catalogMetadata'] | undefined)
        ?? { catalogSource: 'built-in-reviewed', reviewStatus: 'verified-primary', priority: 'primary' },
      createdAt: '2026-04-04T00:00:00.000Z',
      updatedAt: '2026-04-05T00:00:00.000Z',
    }));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('loads the orthography manager, selects the requested orthography, and registers side-pane summary', async () => {
    render(
      <MemoryRouter initialEntries={['/assets/orthographies?orthographyId=orth-source']}>
        <LocaleProvider locale="zh-CN">
          <AppSidePaneProvider>
            <SidePaneSnapshot />
            <Routes>
              <Route path="/assets/orthographies" element={<OrthographyManagerPage />} />
            </Routes>
          </AppSidePaneProvider>
        </LocaleProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByText('Bridge Orthography · Latn · practical').length).toBeGreaterThan(0);
    });

    expect(mockListOrthographies).toHaveBeenCalledWith({
      includeBuiltIns: true,
      orthographyIds: ['orth-source'],
    });
    expect(mockListLanguageCatalogEntries).toHaveBeenCalledWith({
      locale: 'zh-CN',
      languageIds: ['eng', 'zho'],
    });

    await waitFor(() => {
      const bridgeLinks = screen.getAllByRole('link', { name: '打开正字法桥接工作台' });
      expect(bridgeLinks).toHaveLength(2);
      bridgeLinks.forEach((link) => {
        expect(link.getAttribute('href')).toBe('/assets/orthography-bridges?targetOrthographyId=orth-source');
      });
    });
    expect(screen.getByTestId('side-pane-title').textContent).toBe('正字法管理器');
    await waitFor(() => {
      expect(screen.getByTestId('side-pane-content').textContent).toContain('Bridge Orthography · Latn · practical');
    });
  });

  it('saves edited orthography metadata from the workspace panel', async () => {
    render(
      <MemoryRouter initialEntries={['/assets/orthographies?orthographyId=orth-source']}>
        <LocaleProvider locale="zh-CN">
          <AppSidePaneProvider>
            <Routes>
              <Route path="/assets/orthographies" element={<OrthographyManagerPage />} />
            </Routes>
          </AppSidePaneProvider>
        </LocaleProvider>
      </MemoryRouter>,
    );

    const nameInput = (await screen.findAllByDisplayValue('Bridge Orthography'))[0]!;
    fireEvent.change(nameInput, { target: { value: 'Updated Bridge Orthography' } });
    fireEvent.change(screen.getAllByLabelText('键盘布局')[0]!, { target: { value: 'us-intl' } });
    fireEvent.change(screen.getByRole('combobox', { name: '审校状态' }), { target: { value: 'verified-secondary' } });
    fireEvent.change(screen.getByRole('combobox', { name: '目录优先级' }), { target: { value: 'secondary' } });
    fireEvent.click(screen.getAllByRole('button', { name: '保存元数据' })[0]!);

    await waitFor(() => {
      expect(mockUpdateOrthography).toHaveBeenCalledWith(expect.objectContaining({
        id: 'orth-source',
        languageId: 'eng',
        name: { und: 'Updated Bridge Orthography', eng: 'Bridge Orthography' },
        scriptTag: 'Latn',
        type: 'practical',
        direction: 'ltr',
        inputHints: { keyboardLayout: 'us-intl' },
        catalogMetadata: { reviewStatus: 'verified-secondary', priority: 'secondary' },
      }));
    });

    expect(await screen.findByText('正字法元数据已保存。')).toBeTruthy();
    expect(screen.getAllByText('Updated Bridge Orthography · Latn · practical').length).toBeGreaterThan(0);
    expect(screen.getAllByText('已审校·次级').length).toBeGreaterThan(0);
  });

  it('resets the language input UI together with the draft state', async () => {
    render(
      <MemoryRouter initialEntries={['/assets/orthographies?orthographyId=orth-source']}>
        <LocaleProvider locale="zh-CN">
          <AppSidePaneProvider>
            <Routes>
              <Route path="/assets/orthographies" element={<OrthographyManagerPage />} />
            </Routes>
          </AppSidePaneProvider>
        </LocaleProvider>
      </MemoryRouter>,
    );

    const languageNameInput = await screen.findByRole('combobox', { name: '语言' });
    const languageCodeInput = screen.getByRole('textbox', { name: '来源语言代码' });

    fireEvent.change(languageCodeInput, { target: { value: 'zho' } });

    await waitFor(() => {
      expect((languageCodeInput as HTMLInputElement).value).toBe('zho');
      expect((languageNameInput as HTMLInputElement).value).toBe('中文 · Chinese');
    });

    fireEvent.click(screen.getByRole('button', { name: '重置修改' }));

    await waitFor(() => {
      expect((languageNameInput as HTMLInputElement).value).toBe('英语 · English');
      expect((languageCodeInput as HTMLInputElement).value).toBe('eng');
    });
  });

  it('does not auto-infer a language from a two-character code while the user is still typing', async () => {
    render(
      <MemoryRouter initialEntries={['/assets/orthographies?orthographyId=orth-source']}>
        <LocaleProvider locale="zh-CN">
          <AppSidePaneProvider>
            <Routes>
              <Route path="/assets/orthographies" element={<OrthographyManagerPage />} />
            </Routes>
          </AppSidePaneProvider>
        </LocaleProvider>
      </MemoryRouter>,
    );

    const languageNameInput = await screen.findByRole('combobox', { name: '语言' });
    const languageCodeInput = screen.getByRole('textbox', { name: '来源语言代码' });

    fireEvent.change(languageCodeInput, { target: { value: 'en' } });

    await waitFor(() => {
      expect((languageCodeInput as HTMLInputElement).value).toBe('en');
      expect((languageNameInput as HTMLInputElement).value).toBe('');
    });

    fireEvent.blur(languageCodeInput);

    await waitFor(() => {
      expect((languageCodeInput as HTMLInputElement).value).toBe('eng');
      expect((languageNameInput as HTMLInputElement).value).toBe('英语 · English');
    });
  });

  it('allows continuing deletion after a normalized code has fallen back to a two-character draft', async () => {
    render(
      <MemoryRouter initialEntries={['/assets/orthographies?orthographyId=orth-source']}>
        <LocaleProvider locale="zh-CN">
          <AppSidePaneProvider>
            <Routes>
              <Route path="/assets/orthographies" element={<OrthographyManagerPage />} />
            </Routes>
          </AppSidePaneProvider>
        </LocaleProvider>
      </MemoryRouter>,
    );

    const languageCodeInput = await screen.findByRole('textbox', { name: '来源语言代码' });

    fireEvent.change(languageCodeInput, { target: { value: 'en' } });

    fireEvent.change(languageCodeInput, { target: { value: '' } });

    await waitFor(() => {
      expect((languageCodeInput as HTMLInputElement).value).toBe('');
    });
  });

  it('commits a new language after the previous name has been cleared and replaced', async () => {
    render(
      <MemoryRouter initialEntries={['/assets/orthographies?orthographyId=orth-source']}>
        <LocaleProvider locale="zh-CN">
          <AppSidePaneProvider>
            <Routes>
              <Route path="/assets/orthographies" element={<OrthographyManagerPage />} />
            </Routes>
          </AppSidePaneProvider>
        </LocaleProvider>
      </MemoryRouter>,
    );

    const languageNameInput = await screen.findByRole('combobox', { name: '语言' });
    const languageCodeInput = screen.getByRole('textbox', { name: '来源语言代码' });

    fireEvent.change(languageCodeInput, { target: { value: 'eng' } });
    await waitFor(() => {
      expect((languageCodeInput as HTMLInputElement).value).toBe('eng');
      expect((languageNameInput as HTMLInputElement).value).toBe('英语 · English');
    });

    fireEvent.change(languageNameInput, { target: { value: 'P' } });
    await waitFor(() => {
      expect((languageNameInput as HTMLInputElement).value).toBe('P');
      expect((languageCodeInput as HTMLInputElement).value).toBe('');
    });

    fireEvent.change(languageNameInput, { target: { value: 'Portuguese' } });
    await waitFor(() => {
      expect((languageNameInput as HTMLInputElement).value).toBe('Portuguese');
      expect((languageCodeInput as HTMLInputElement).value).toBe('');
    });

    fireEvent.change(languageCodeInput, { target: { value: 'por' } });
    await waitFor(() => {
      expect((languageCodeInput as HTMLInputElement).value).toBe('por');
    });

    fireEvent.click(screen.getAllByRole('button', { name: '保存元数据' })[0]!);

    await waitFor(() => {
      const lastCallIndex = mockUpdateOrthography.mock.calls.length - 1;
      const lastCall = (lastCallIndex >= 0
        ? mockUpdateOrthography.mock.calls[lastCallIndex]?.[0]
        : undefined) as Record<string, unknown> | undefined;
      expect(lastCall).toBeTruthy();
      expect(lastCall).toEqual(expect.objectContaining({
        languageId: 'por',
      }));
    });
  });

  it('saves additional localized name labels from the workspace panel', async () => {
    render(
      <MemoryRouter initialEntries={['/assets/orthographies?orthographyId=orth-source']}>
        <LocaleProvider locale="zh-CN">
          <AppSidePaneProvider>
            <Routes>
              <Route path="/assets/orthographies" element={<OrthographyManagerPage />} />
            </Routes>
          </AppSidePaneProvider>
        </LocaleProvider>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: '添加语言标签' }));

  fireEvent.change(screen.getByPlaceholderText('例如 fra、deu、zh-Hant'), { target: { value: 'fra' } });
  fireEvent.change(screen.getByPlaceholderText('输入该标签对应的名称'), { target: { value: 'Orthographe passerelle' } });
    fireEvent.click(screen.getAllByRole('button', { name: '保存元数据' })[0]!);

    await waitFor(() => {
      expect(mockUpdateOrthography).toHaveBeenCalledWith(expect.objectContaining({
        id: 'orth-source',
        name: {
          und: 'Bridge Orthography',
          eng: 'Bridge Orthography',
          fra: 'Orthographe passerelle',
        },
      }));
    });
  });

  it('clears detected locale tags when switching from a tagged code to a plain language', async () => {
    render(
      <MemoryRouter initialEntries={['/assets/orthographies?orthographyId=orth-source']}>
        <LocaleProvider locale="zh-CN">
          <AppSidePaneProvider>
            <Routes>
              <Route path="/assets/orthographies" element={<OrthographyManagerPage />} />
            </Routes>
          </AppSidePaneProvider>
        </LocaleProvider>
      </MemoryRouter>,
    );

    const languageCodeInput = await screen.findByRole('textbox', { name: '来源语言代码' });

    fireEvent.change(languageCodeInput, { target: { value: 'en-US' } });
    await waitFor(() => {
      expect((languageCodeInput as HTMLInputElement).value).toBe('eng');
    });

    fireEvent.change(languageCodeInput, { target: { value: 'zho' } });
    fireEvent.click(screen.getAllByRole('button', { name: '保存元数据' })[0]!);

    await waitFor(() => {
      const lastCallIndex = mockUpdateOrthography.mock.calls.length - 1;
      const lastCall = (lastCallIndex >= 0
        ? mockUpdateOrthography.mock.calls[lastCallIndex]?.[0]
        : undefined) as Record<string, unknown> | undefined;
      expect(lastCall).toBeTruthy();
      expect(lastCall).toEqual(expect.objectContaining({
        languageId: 'zho',
      }));
      expect(lastCall?.localeTag).toBeUndefined();
      expect(lastCall?.regionTag).toBeUndefined();
      expect(lastCall?.variantTag).toBeUndefined();
    });
  });

  it('clears detected locale tags after editing the language name without a fresh match', async () => {
    render(
      <MemoryRouter initialEntries={['/assets/orthographies?orthographyId=orth-source']}>
        <LocaleProvider locale="zh-CN">
          <AppSidePaneProvider>
            <Routes>
              <Route path="/assets/orthographies" element={<OrthographyManagerPage />} />
            </Routes>
          </AppSidePaneProvider>
        </LocaleProvider>
      </MemoryRouter>,
    );

    const languageNameInput = await screen.findByRole('combobox', { name: '语言' });
    const languageCodeInput = screen.getByRole('textbox', { name: '来源语言代码' });

    fireEvent.change(languageCodeInput, { target: { value: 'en-US' } });
    await waitFor(() => {
      expect((languageCodeInput as HTMLInputElement).value).toBe('eng');
    });

    fireEvent.change(languageNameInput, { target: { value: 'English custom' } });
    fireEvent.change(screen.getAllByLabelText('键盘布局')[0]!, { target: { value: 'us-intl' } });
    fireEvent.click(screen.getAllByRole('button', { name: '保存元数据' })[0]!);

    await waitFor(() => {
      const lastCallIndex = mockUpdateOrthography.mock.calls.length - 1;
      const lastCall = (lastCallIndex >= 0
        ? mockUpdateOrthography.mock.calls[lastCallIndex]?.[0]
        : undefined) as Record<string, unknown> | undefined;
      expect(lastCall).toBeTruthy();
      expect(lastCall).toEqual(expect.objectContaining({
        languageId: '',
      }));
      expect(lastCall?.localeTag).toBeUndefined();
      expect(lastCall?.regionTag).toBeUndefined();
      expect(lastCall?.variantTag).toBeUndefined();
    });
  });

  it('keeps unsaved draft edits when the locale changes and only relocalizes the language display', async () => {
    const renderPage = (locale: 'zh-CN' | 'en-US') => (
      <MemoryRouter initialEntries={['/assets/orthographies?orthographyId=orth-source']}>
        <LocaleProvider locale={locale}>
          <AppSidePaneProvider>
            <Routes>
              <Route path="/assets/orthographies" element={<OrthographyManagerPage />} />
            </Routes>
          </AppSidePaneProvider>
        </LocaleProvider>
      </MemoryRouter>
    );

    const { rerender } = render(renderPage('zh-CN'));

    const nameInput = (await screen.findAllByDisplayValue('Bridge Orthography'))[0]!;
    const languageNameInput = screen.getByRole('combobox', { name: '语言' });

    fireEvent.change(nameInput, { target: { value: 'Dirty Bridge Orthography' } });

    await waitFor(() => {
      expect(screen.getByDisplayValue('Dirty Bridge Orthography')).toBeTruthy();
      expect((languageNameInput as HTMLInputElement).value).toBe('英语 · English');
    });

    rerender(renderPage('en-US'));

    await waitFor(() => {
      expect(screen.getByDisplayValue('Dirty Bridge Orthography')).toBeTruthy();
      expect((screen.getByRole('combobox', { name: 'Language' }) as HTMLInputElement).value).toBe('English');
    });

    fireEvent.click(screen.getAllByRole('button', { name: /保存元数据|Save metadata/ })[0]!);

    await waitFor(() => {
      const lastCallIndex = mockUpdateOrthography.mock.calls.length - 1;
      const lastCall = (lastCallIndex >= 0
        ? mockUpdateOrthography.mock.calls[lastCallIndex]?.[0]
        : undefined) as Record<string, unknown> | undefined;
      expect(lastCall).toBeTruthy();
      expect(lastCall).toEqual(expect.objectContaining({
        languageId: 'eng',
        name: { und: 'Dirty Bridge Orthography', eng: 'Bridge Orthography' },
      }));
    });
  });

  it('shows custom language asset id separately from language code and saves the asset id', async () => {
    mockListOrthographies.mockResolvedValueOnce([
      {
        id: 'orth-custom',
        languageId: 'user:demo-language',
        name: { und: 'Custom Bridge Orthography' },
        scriptTag: 'Latn',
        type: 'practical',
        catalogMetadata: { catalogSource: 'user' },
        createdAt: '2026-04-04T00:00:00.000Z',
        updatedAt: '2026-04-04T00:00:00.000Z',
      },
    ] satisfies OrthographyDocType[]);
    mockListLanguageCatalogEntries.mockResolvedValueOnce([
      {
        id: 'user:demo-language',
        entryKind: 'custom',
        hasPersistedRecord: true,
        languageCode: 'demo',
        englishName: 'Demo Language',
        localName: '示例语言',
        aliases: [],
        sourceType: 'user-custom',
        visibility: 'visible',
        displayNames: [],
      },
    ]);

    render(
      <MemoryRouter initialEntries={['/assets/orthographies?orthographyId=orth-custom']}>
        <LocaleProvider locale="zh-CN">
          <AppSidePaneProvider>
            <Routes>
              <Route path="/assets/orthographies" element={<OrthographyManagerPage />} />
            </Routes>
          </AppSidePaneProvider>
        </LocaleProvider>
      </MemoryRouter>,
    );

    const languageCodeInput = await screen.findByRole('textbox', { name: '来源语言代码' });
    const assetIdInput = screen.getByRole('textbox', { name: '语言 ID（系统唯一标识）' });

    await waitFor(() => {
      expect((languageCodeInput as HTMLInputElement).value).toBe('demo');
      expect((assetIdInput as HTMLInputElement).value).toBe('user:demo-language');
    });

    fireEvent.change(assetIdInput, { target: { value: 'user:field-language' } });

    await waitFor(() => {
      expect((assetIdInput as HTMLInputElement).value).toBe('user:field-language');
      expect((screen.getAllByRole('button', { name: '保存元数据' })[0] as HTMLButtonElement).disabled).toBe(false);
    });

    fireEvent.click(screen.getAllByRole('button', { name: '保存元数据' })[0]!);

    await waitFor(() => {
      const lastCallIndex = mockUpdateOrthography.mock.calls.length - 1;
      const lastCall = (lastCallIndex >= 0
        ? mockUpdateOrthography.mock.calls[lastCallIndex]?.[0]
        : undefined) as Record<string, unknown> | undefined;
      expect(lastCall).toBeTruthy();
      expect(lastCall).toEqual(expect.objectContaining({
        id: 'orth-custom',
        languageId: 'user:field-language',
      }));
    });
  });

  it('shows sidebar entry context and blocks orthography switching while the draft is dirty until confirmed', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={['/assets/orthographies?orthographyId=orth-source&fromLayerId=layer_trc_bridge']}>
        <LocaleProvider locale="zh-CN">
          <AppSidePaneProvider>
            <SidePaneSnapshot />
            <Routes>
              <Route path="/assets/orthographies" element={<OrthographyManagerPage />} />
            </Routes>
          </AppSidePaneProvider>
        </LocaleProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('当前入口来自转写侧栏；桥接规则维护已迁移到独立的正字法桥接工作台。')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByTestId('side-pane-content').textContent).toContain('Bridge Orthography · Latn · practical');
    });
    const bridgeLinks = screen.getAllByRole('link', { name: '打开正字法桥接工作台' });
    expect(bridgeLinks).toHaveLength(2);
    bridgeLinks.forEach((link) => {
      expect(link.getAttribute('href')).toBe('/assets/orthography-bridges?targetOrthographyId=orth-source&fromLayerId=layer_trc_bridge');
    });

    fireEvent.change(await screen.findByLabelText('英文名称'), { target: { value: 'Dirty Bridge Orthography' } });
    fireEvent.click(screen.getAllByRole('button', { name: /备选正字法/ })[0]!);

    expect(confirmSpy).toHaveBeenCalledWith('当前正字法有未保存修改。仍要切换或离开吗？');
    expect(screen.getAllByText('Bridge Orthography · Latn · practical').length).toBeGreaterThan(0);

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getAllByRole('button', { name: /备选正字法/ })[0]!);

    await waitFor(() => {
      expect(screen.getAllByText('备选正字法 · Hans · practical').length).toBeGreaterThan(0);
    });

    confirmSpy.mockRestore();
  });

  it('blocks bridge workspace navigation while the draft is dirty until confirmed', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={['/assets/orthographies?orthographyId=orth-source']}>
        <LocaleProvider locale="zh-CN">
          <AppSidePaneProvider>
            <Routes>
              <Route path="/assets/orthographies" element={<OrthographyManagerPage />} />
            </Routes>
          </AppSidePaneProvider>
        </LocaleProvider>
      </MemoryRouter>,
    );

    fireEvent.change(await screen.findByLabelText('英文名称'), { target: { value: 'Dirty Bridge Orthography' } });
    const detailBridgeLink = screen.getAllByRole('link', { name: '打开正字法桥接工作台' })
      .find((link) => link.getAttribute('href')?.includes('targetOrthographyId=orth-source'));
    expect(detailBridgeLink).toBeTruthy();
    fireEvent.click(detailBridgeLink!);

    expect(confirmSpy).toHaveBeenCalledWith('当前正字法有未保存修改。仍要切换或离开吗？');
    confirmSpy.mockRestore();
  });
});