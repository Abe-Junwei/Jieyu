// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppSidePaneProvider, useAppSidePaneRegistrationSnapshot } from '../contexts/AppSidePaneContext';
import type { OrthographyDocType } from '../db';
import { LocaleProvider } from '../i18n';
import { searchLanguageCatalog } from '../utils/langMapping';
import { OrthographyBridgeWorkspacePage } from './OrthographyBridgeWorkspacePage';

const { mockListOrthographies, mockListLanguageCatalogEntries, mockProjectLanguageIds, mockSearchLanguageCatalogSuggestions } = vi.hoisted(() => ({
  mockListOrthographies: vi.fn(),
  mockListLanguageCatalogEntries: vi.fn(),
  mockProjectLanguageIds: [] as string[],
  mockSearchLanguageCatalogSuggestions: vi.fn(),
}));

vi.mock('../services/LinguisticService.orthography', () => ({
  listOrthographyRecords: mockListOrthographies,
}));

vi.mock('../services/LinguisticService.languageCatalog', () => ({
  listLanguageCatalogEntries: mockListLanguageCatalogEntries,
}));

vi.mock('../services/LanguageCatalogSearchService', () => ({
  searchLanguageCatalogSuggestions: mockSearchLanguageCatalogSuggestions,
}));

vi.mock('../hooks/useProjectLanguageIds', () => ({
  useProjectLanguageIds: () => ({ projectLanguageIds: mockProjectLanguageIds, loading: false }),
}));

vi.mock('../components/OrthographyBridgeManager', () => ({
  OrthographyBridgeManager: ({
    targetOrthography,
    languageOptions,
  }: {
    targetOrthography?: OrthographyDocType;
    languageOptions: Array<{ code: string; label: string }>;
  }) => (
    <div data-testid="orthography-bridge-manager">
      <div>{targetOrthography ? `target:${targetOrthography.id}` : 'target:none'}</div>
      <div>{languageOptions.map((option) => `${option.code}:${option.label}`).join('|')}</div>
    </div>
  ),
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

let queryClient: QueryClient;

describe('OrthographyBridgeWorkspacePage', () => {
  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mockProjectLanguageIds.splice(0, mockProjectLanguageIds.length);
    mockListOrthographies.mockReset();
    mockListLanguageCatalogEntries.mockReset();
    mockSearchLanguageCatalogSuggestions.mockReset();

    mockListLanguageCatalogEntries.mockResolvedValue([
      {
        id: 'eng',
        entryKind: 'built-in',
        hasPersistedRecord: false,
        languageCode: 'eng',
        englishName: 'English',
        localName: '英语',
        aliases: [],
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
        localName: '中文',
        aliases: [],
        sourceType: 'built-in-generated',
        visibility: 'visible',
        displayNames: [],
      },
    ]);

    mockListOrthographies.mockResolvedValue([
      {
        id: 'orth-target',
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
    mockSearchLanguageCatalogSuggestions.mockImplementation(async ({ query, locale, limit = 5 }: { query: string; locale: 'zh-CN' | 'en-US'; limit?: number }) => (
      searchLanguageCatalog(query, locale, limit).map((match) => ({
        id: match.entry.languageId,
        languageCode: match.entry.iso6393,
        primaryLabel: match.matchedLabel,
        matchedLabel: match.matchedLabel,
        matchedLabelKind: match.matchedLabelKind,
        matchSource: match.matchSource,
        rank: match.score,
        hasRuntimeOverride: false,
      }))
    ));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('uses language catalog labels in the bridge manager options and search index', async () => {
    mockListLanguageCatalogEntries.mockResolvedValue([
      {
        id: 'eng',
        entryKind: 'built-in',
        hasPersistedRecord: false,
        languageCode: 'eng',
        englishName: 'English',
        localName: '英语资产标签',
        aliases: [],
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
        localName: '中文资产标签',
        aliases: [],
        sourceType: 'built-in-generated',
        visibility: 'visible',
        displayNames: [],
      },
    ]);

    render(
      <QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/assets/orthography-bridges?targetOrthographyId=orth-target']}>
        <LocaleProvider locale="zh-CN">
          <AppSidePaneProvider>
            <SidePaneSnapshot />
            <Routes>
              <Route path="/assets/orthography-bridges" element={<OrthographyBridgeWorkspacePage />} />
            </Routes>
          </AppSidePaneProvider>
        </LocaleProvider>
      </MemoryRouter></QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('orthography-bridge-manager').textContent).toContain('target:orth-target');
    });

    expect(mockListOrthographies).toHaveBeenCalledWith({ includeBuiltIns: true, orthographyIds: ['orth-target'] });
    expect(mockListLanguageCatalogEntries).toHaveBeenCalledWith({
      locale: 'zh-CN',
    });

    // 目录标签异步加载，需等待渲染更新 | Catalog labels load asynchronously, need to wait for render update
    await waitFor(() => {
      expect(screen.getByTestId('orthography-bridge-manager').textContent).toContain('eng:英语资产标签');
    });
    expect(screen.getByTestId('side-pane-title').textContent).toBe('正字法桥接工作台');

    fireEvent.change(screen.getByRole('searchbox', { name: '按语言、名称或脚本筛选目标正字法' }), { target: { value: '英语资产标签' } });

    await waitFor(() => {
      expect(mockSearchLanguageCatalogSuggestions).toHaveBeenCalledWith({
        query: '英语资产标签',
        locale: 'zh-CN',
        limit: 50,
      });
      const lastCall = mockListOrthographies.mock.calls[mockListOrthographies.mock.calls.length - 1]?.[0] as Record<string, unknown> | undefined;
      expect(lastCall).toEqual(expect.objectContaining({
        includeBuiltIns: true,
        searchText: '英语资产标签',
      }));
      expect(screen.getAllByText('Bridge Orthography · Latn · practical').length).toBeGreaterThan(0);
    });
  });

  it('falls back to the generated language display name when the catalog service has no overlay label', async () => {
    mockListLanguageCatalogEntries.mockResolvedValue([]);

    render(
      <QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/assets/orthography-bridges?targetOrthographyId=orth-target']}>
        <LocaleProvider locale="zh-CN">
          <AppSidePaneProvider>
            <Routes>
              <Route path="/assets/orthography-bridges" element={<OrthographyBridgeWorkspacePage />} />
            </Routes>
          </AppSidePaneProvider>
        </LocaleProvider>
      </MemoryRouter></QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('orthography-bridge-manager').textContent).toContain('eng:英语');
    });
  });

  it('keeps custom language asset ids in manager options and search labels', async () => {
    mockListOrthographies.mockResolvedValueOnce([
      {
        id: 'orth-custom-target',
        languageId: 'user:demo-language',
        name: { und: 'Custom Orthography' },
        scriptTag: 'Latn',
        type: 'practical',
        catalogMetadata: { catalogSource: 'user' },
        createdAt: '2026-04-04T00:00:00.000Z',
        updatedAt: '2026-04-04T00:00:00.000Z',
      },
      {
        id: 'orth-eng-target',
        languageId: 'eng',
        name: { eng: 'English Orthography' },
        scriptTag: 'Latn',
        type: 'practical',
        catalogMetadata: { catalogSource: 'built-in-reviewed' },
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
        localName: '示例语言资产',
        aliases: [],
        sourceType: 'user-custom',
        visibility: 'visible',
        displayNames: [],
      },
      {
        id: 'eng',
        entryKind: 'built-in',
        hasPersistedRecord: false,
        languageCode: 'eng',
        englishName: 'English',
        localName: '英语',
        aliases: [],
        sourceType: 'built-in-generated',
        visibility: 'visible',
        displayNames: [],
      },
    ]);

    render(
      <QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/assets/orthography-bridges?targetOrthographyId=orth-custom-target']}>
        <LocaleProvider locale="zh-CN">
          <AppSidePaneProvider>
            <Routes>
              <Route path="/assets/orthography-bridges" element={<OrthographyBridgeWorkspacePage />} />
            </Routes>
          </AppSidePaneProvider>
        </LocaleProvider>
      </MemoryRouter></QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('orthography-bridge-manager').textContent).toContain('user:demo-language:示例语言资产');
    });

    fireEvent.change(screen.getByRole('searchbox', { name: '按语言、名称或脚本筛选目标正字法' }), { target: { value: '示例语言资产' } });

    await waitFor(() => {
      expect(screen.getAllByText('Custom Orthography · Latn · practical').length).toBeGreaterThan(0);
    });
  });

  it('loads only project orthographies plus the selected target on the default project-only view', async () => {
    mockProjectLanguageIds.push('eng');

    render(
      <QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/assets/orthography-bridges?targetOrthographyId=orth-alt']}>
        <LocaleProvider locale="zh-CN">
          <AppSidePaneProvider>
            <Routes>
              <Route path="/assets/orthography-bridges" element={<OrthographyBridgeWorkspacePage />} />
            </Routes>
          </AppSidePaneProvider>
        </LocaleProvider>
      </MemoryRouter></QueryClientProvider>,
    );

    await waitFor(() => {
      expect(mockListOrthographies).toHaveBeenCalledWith({
        includeBuiltIns: true,
        languageIds: ['eng'],
      });
    });
  });

  it('switches from project-only scope to the full bridge catalog when the user selects all', async () => {
    mockProjectLanguageIds.push('eng');

    render(
      <QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/assets/orthography-bridges?targetOrthographyId=orth-target']}>
        <LocaleProvider locale="zh-CN">
          <AppSidePaneProvider>
            <Routes>
              <Route path="/assets/orthography-bridges" element={<OrthographyBridgeWorkspacePage />} />
            </Routes>
          </AppSidePaneProvider>
        </LocaleProvider>
      </MemoryRouter></QueryClientProvider>,
    );

    await waitFor(() => {
      expect(mockListOrthographies).toHaveBeenCalledWith({
        includeBuiltIns: true,
        languageIds: ['eng'],
      });
    });

    fireEvent.click(screen.getByRole('radio', { name: '全部' }));

    await waitFor(() => {
      const lastCall = mockListOrthographies.mock.calls[mockListOrthographies.mock.calls.length - 1]?.[0];
      expect(lastCall).toEqual({ includeBuiltIns: true });
    });
  });

  it('keeps the bridge list idle without project context until search or explicit browse-all', async () => {
    render(
      <QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/assets/orthography-bridges']}>
        <LocaleProvider locale="zh-CN">
          <AppSidePaneProvider>
            <Routes>
              <Route path="/assets/orthography-bridges" element={<OrthographyBridgeWorkspacePage />} />
            </Routes>
          </AppSidePaneProvider>
        </LocaleProvider>
      </MemoryRouter></QueryClientProvider>,
    );

    expect(await screen.findByText('当前没有项目语言上下文。先搜索目标正字法，或手动展开全部目录。')).toBeTruthy();
    expect(mockListOrthographies).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '全部' }));

    await waitFor(() => {
      expect(mockListOrthographies).toHaveBeenCalledWith({ includeBuiltIns: true });
    });
  });
});