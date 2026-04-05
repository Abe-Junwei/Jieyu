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
  },
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
    fireEvent.click(screen.getByRole('button', { name: '保存条目' }));

    await waitFor(() => {
      expect(mockUpsertLanguageCatalogEntry).toHaveBeenCalled();
    });

    expect(mockUpsertLanguageCatalogEntry.mock.calls[0]?.[0]).toMatchObject({
      id: 'eng',
      localName: '英语（覆盖）',
      englishName: 'English Override',
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

    fireEvent.click(screen.getByRole('button', { name: '删除自定义条目' }));

    await waitFor(() => {
      expect(mockDeleteLanguageCatalogEntry).toHaveBeenCalledWith({
        languageId: 'user:demo-language',
        locale: 'zh-CN',
      });
    });

    fireEvent.click(screen.getByRole('button', { name: '新建自定义语言' }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText('例如 user:demo-language')).toBeTruthy();
    });
  });
});