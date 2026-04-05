// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppSidePaneProvider, useAppSidePaneRegistrationSnapshot } from '../contexts/AppSidePaneContext';
import type { OrthographyDocType } from '../db';
import { LocaleProvider } from '../i18n';
import { OrthographyBridgeWorkspacePage } from './OrthographyBridgeWorkspacePage';

const { mockListOrthographies, mockListLanguageCatalogEntries } = vi.hoisted(() => ({
  mockListOrthographies: vi.fn(),
  mockListLanguageCatalogEntries: vi.fn(),
}));

vi.mock('../services/LinguisticService', () => ({
  LinguisticService: {
    listOrthographies: mockListOrthographies,
    listLanguageCatalogEntries: mockListLanguageCatalogEntries,
  },
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

describe('OrthographyBridgeWorkspacePage', () => {
  beforeEach(() => {
    mockListOrthographies.mockReset();
    mockListLanguageCatalogEntries.mockReset();

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
      <MemoryRouter initialEntries={['/assets/orthography-bridges?targetOrthographyId=orth-target']}>
        <LocaleProvider locale="zh-CN">
          <AppSidePaneProvider>
            <SidePaneSnapshot />
            <Routes>
              <Route path="/assets/orthography-bridges" element={<OrthographyBridgeWorkspacePage />} />
            </Routes>
          </AppSidePaneProvider>
        </LocaleProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('orthography-bridge-manager').textContent).toContain('target:orth-target');
    });

    expect(screen.getByTestId('orthography-bridge-manager').textContent).toContain('eng:英语资产标签');
    expect(screen.getByTestId('orthography-bridge-manager').textContent).toContain('zho:中文资产标签');
    expect(screen.getByTestId('side-pane-title').textContent).toBe('正字法桥接工作台');

    fireEvent.change(screen.getByRole('searchbox', { name: '按语言、名称或脚本筛选目标正字法' }), { target: { value: '英语资产标签' } });

    await waitFor(() => {
      expect(screen.getAllByText('Bridge Orthography · Latn · practical').length).toBeGreaterThan(0);
    });
  });

  it('falls back to the generated language display name when the catalog service has no overlay label', async () => {
    mockListLanguageCatalogEntries.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={['/assets/orthography-bridges?targetOrthographyId=orth-target']}>
        <LocaleProvider locale="zh-CN">
          <AppSidePaneProvider>
            <Routes>
              <Route path="/assets/orthography-bridges" element={<OrthographyBridgeWorkspacePage />} />
            </Routes>
          </AppSidePaneProvider>
        </LocaleProvider>
      </MemoryRouter>,
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
      <MemoryRouter initialEntries={['/assets/orthography-bridges?targetOrthographyId=orth-custom-target']}>
        <LocaleProvider locale="zh-CN">
          <AppSidePaneProvider>
            <Routes>
              <Route path="/assets/orthography-bridges" element={<OrthographyBridgeWorkspacePage />} />
            </Routes>
          </AppSidePaneProvider>
        </LocaleProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('orthography-bridge-manager').textContent).toContain('user:demo-language:示例语言资产');
    });

    fireEvent.change(screen.getByRole('searchbox', { name: '按语言、名称或脚本筛选目标正字法' }), { target: { value: '示例语言资产' } });

    await waitFor(() => {
      expect(screen.getAllByText('Custom Orthography · Latn · practical').length).toBeGreaterThan(0);
    });
  });
});