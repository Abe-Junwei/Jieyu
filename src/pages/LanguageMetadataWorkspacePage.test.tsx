// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppSidePaneProvider, useAppSidePaneRegistrationSnapshot } from '../contexts/AppSidePaneContext';
import { LocaleProvider } from '../i18n';
import { LanguageMetadataWorkspacePage } from './LanguageMetadataWorkspacePage';

const {
  mockListLanguageCatalogEntries,
  mockListLanguageCatalogHistory,
  mockUpsertLanguageCatalogEntry,
  mockDeleteLanguageCatalogEntry,
} = vi.hoisted(() => ({
  mockListLanguageCatalogEntries: vi.fn(),
  mockListLanguageCatalogHistory: vi.fn(),
  mockUpsertLanguageCatalogEntry: vi.fn(),
  mockDeleteLanguageCatalogEntry: vi.fn(),
}));

vi.mock('../services/LinguisticService', () => ({
  LinguisticService: {
    listLanguageCatalogEntries: mockListLanguageCatalogEntries,
    listLanguageCatalogHistory: mockListLanguageCatalogHistory,
    upsertLanguageCatalogEntry: mockUpsertLanguageCatalogEntry,
    deleteLanguageCatalogEntry: mockDeleteLanguageCatalogEntry,
    lookupIso639_3Seed: () => undefined,
  },
}));

vi.mock('../hooks/useProjectLanguageIds', () => ({
  useProjectLanguageIds: () => ({ projectLanguageIds: ['eng'], loading: false }),
}));

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

describe('LanguageMetadataWorkspacePage', () => {
  beforeEach(() => {
    mockListLanguageCatalogEntries.mockReset();
    mockListLanguageCatalogHistory.mockReset();
    mockUpsertLanguageCatalogEntry.mockReset();
    mockDeleteLanguageCatalogEntry.mockReset();

    mockListLanguageCatalogEntries.mockResolvedValue([
      {
        id: 'eng',
        entryKind: 'built-in',
        hasPersistedRecord: false,
        languageCode: 'eng',
        englishName: 'English',
        localName: '英语',
        aliases: ['英文'],
        sourceType: 'built-in-generated',
        visibility: 'visible',
        displayNames: [
          {
            locale: 'fr-FR',
            role: 'preferred',
            value: 'anglais',
            isPreferred: false,
            sourceType: 'built-in-generated',
            persisted: false,
          },
        ],
      },
      {
        id: 'user:demo-language',
        entryKind: 'custom',
        hasPersistedRecord: true,
        languageCode: 'demo',
        englishName: 'Demo Language',
        localName: '示例语言',
        aliases: ['示例'],
        sourceType: 'user-custom',
        visibility: 'visible',
        displayNames: [],
      },
    ]);
    mockListLanguageCatalogHistory.mockResolvedValue([
      {
        id: 'langhist-1',
        languageId: 'eng',
        action: 'update',
        summary: '更新语言元数据',
        changedFields: ['englishName', 'aliases'],
        reason: '根据术语表修正英文名与检索别名。',
        actorType: 'human',
        createdAt: '2026-04-05T00:00:00.000Z',
      },
    ]);
    mockUpsertLanguageCatalogEntry.mockImplementation(async (input: Record<string, unknown>) => ({
      id: String(input.id ?? 'eng'),
      entryKind: 'override',
      hasPersistedRecord: true,
      languageCode: String(input.languageCode ?? 'eng'),
      englishName: String(input.englishName ?? 'English'),
      localName: String(input.localName ?? '英语'),
      aliases: Array.isArray(input.aliases) ? input.aliases as string[] : [],
      sourceType: 'user-override',
      visibility: 'visible',
    }));
    mockDeleteLanguageCatalogEntry.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('loads the language metadata workspace and saves an override for a built-in entry', async () => {
    render(
      <MemoryRouter initialEntries={['/assets/language-metadata?languageId=eng']}>
        <LocaleProvider locale="zh-CN">
          <AppSidePaneProvider>
            <SidePaneSnapshot />
            <Routes>
              <Route path="/assets/language-metadata" element={<LanguageMetadataWorkspacePage />} />
            </Routes>
          </AppSidePaneProvider>
        </LocaleProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('英语')).toBeTruthy();
    });

    expect(screen.getByTestId('side-pane-title').textContent).toBe('语言元数据工作台');

    fireEvent.change(screen.getByDisplayValue('英语'), { target: { value: '英语（覆盖）' } });
    fireEvent.change(screen.getByDisplayValue('English'), { target: { value: 'English Override' } });
    fireEvent.change(screen.getByPlaceholderText('建议说明为何修改、来源依据或兼容性背景。'), { target: { value: '修正工作台展示名' } });
    fireEvent.click(screen.getByRole('button', { name: '保存条目' }));

    await waitFor(() => {
      expect(mockUpsertLanguageCatalogEntry).toHaveBeenCalled();
    });

    expect(mockUpsertLanguageCatalogEntry.mock.calls[0]?.[0]).toMatchObject({
      id: 'eng',
      localName: '英语（覆盖）',
      englishName: 'English Override',
      reason: '修正工作台展示名',
      locale: 'zh-CN',
    });

    expect(await screen.findByText('语言元数据已保存。')).toBeTruthy();
  });

  it('serializes supplemental display-name matrix rows when saving', async () => {
    const view = render(
      <MemoryRouter initialEntries={['/assets/language-metadata?languageId=eng']}>
        <LocaleProvider locale="zh-CN">
          <AppSidePaneProvider>
            <Routes>
              <Route path="/assets/language-metadata" element={<LanguageMetadataWorkspacePage />} />
            </Routes>
          </AppSidePaneProvider>
        </LocaleProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('英语')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: '新增名称行' }));

  const matrixRows = Array.from(view.container.querySelectorAll('.language-metadata-workspace-matrix-row'));
  const newRow = matrixRows[matrixRows.length - 1] as HTMLElement;
  const newRowQueries = within(newRow);

  fireEvent.change(newRowQueries.getByPlaceholderText('例如 fr-FR、zh-TW、native'), { target: { value: 'es-ES' } });
  fireEvent.change(newRowQueries.getByRole('textbox', { name: '显示值' }), { target: { value: 'inglés alternativo' } });
  fireEvent.change(newRowQueries.getByRole('combobox', { name: '角色' }), { target: { value: 'menu' } });

    fireEvent.click(screen.getByRole('button', { name: '保存条目' }));

    await waitFor(() => {
      expect(mockUpsertLanguageCatalogEntry).toHaveBeenCalled();
    });

    const calls = mockUpsertLanguageCatalogEntry.mock.calls;
    expect(calls[calls.length - 1]?.[0]).toMatchObject({
      id: 'eng',
      displayNames: expect.arrayContaining([
        expect.objectContaining({ locale: 'fr-FR', role: 'preferred', value: 'anglais' }),
        expect.objectContaining({ locale: 'es-ES', role: 'menu', value: 'inglés alternativo' }),
      ]),
    });
  });

  it('can switch to custom creation mode and request deletion for persisted custom entries', async () => {
    render(
      <MemoryRouter initialEntries={['/assets/language-metadata?languageId=user:demo-language']}>
        <LocaleProvider locale="zh-CN">
          <AppSidePaneProvider>
            <Routes>
              <Route path="/assets/language-metadata" element={<LanguageMetadataWorkspacePage />} />
            </Routes>
          </AppSidePaneProvider>
        </LocaleProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('示例语言')).toBeTruthy();
    });

    expect(await screen.findByText((content) => content.includes('变更字段：') && content.includes('英文名') && content.includes('别名 / 检索标签'))).toBeTruthy();
    expect(screen.getByText('根据术语表修正英文名与检索别名。')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '删除自定义条目' }));

    await waitFor(() => {
      expect(mockDeleteLanguageCatalogEntry).toHaveBeenCalledWith({
        languageId: 'user:demo-language',
        locale: 'zh-CN',
      });
    });

    fireEvent.click(screen.getByRole('button', { name: '新建自定义语言' }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText('留空则自动生成')).toBeTruthy();
    });
  });

  it('saves a new custom language with separate asset id and display code', async () => {
    render(
      <MemoryRouter initialEntries={['/assets/language-metadata']}>
        <LocaleProvider locale="zh-CN">
          <AppSidePaneProvider>
            <Routes>
              <Route path="/assets/language-metadata" element={<LanguageMetadataWorkspacePage />} />
            </Routes>
          </AppSidePaneProvider>
        </LocaleProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('英语')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: '新建自定义语言' }));

    const assetIdInput = await screen.findByPlaceholderText('留空则自动生成');
    const languageCodeInput = screen.getByRole('textbox', { name: '语言代码' });

    fireEvent.change(assetIdInput, { target: { value: 'user:field-language' } });
    fireEvent.change(languageCodeInput, { target: { value: 'fld' } });
    fireEvent.change(screen.getByRole('textbox', { name: '当前语言显示名' }), { target: { value: '田野语言' } });
    fireEvent.change(screen.getByRole('textbox', { name: '英文名' }), { target: { value: 'Field Language' } });
    fireEvent.click(screen.getByRole('button', { name: '保存条目' }));

    await waitFor(() => {
      expect(mockUpsertLanguageCatalogEntry).toHaveBeenCalled();
    });

    const lastCallIndex = mockUpsertLanguageCatalogEntry.mock.calls.length - 1;
    expect((lastCallIndex >= 0 ? mockUpsertLanguageCatalogEntry.mock.calls[lastCallIndex]?.[0] : undefined)).toMatchObject({
      id: 'user:field-language',
      languageCode: 'fld',
      localName: '田野语言',
      englishName: 'Field Language',
      locale: 'zh-CN',
    });
  });
});