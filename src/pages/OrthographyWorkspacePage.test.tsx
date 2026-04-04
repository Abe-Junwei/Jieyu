// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppSidePaneProvider, useAppSidePaneRegistrationSnapshot } from '../contexts/AppSidePaneContext';
import type { OrthographyDocType } from '../db';
import { LocaleProvider } from '../i18n';
import { OrthographyWorkspacePage } from './OrthographyWorkspacePage';

const { mockListOrthographies, mockUpdateOrthography } = vi.hoisted(() => ({
  mockListOrthographies: vi.fn(),
  mockUpdateOrthography: vi.fn(),
}));

vi.mock('../services/LinguisticService', () => ({
  LinguisticService: {
    listOrthographies: mockListOrthographies,
    updateOrthography: mockUpdateOrthography,
  },
}));

vi.mock('../components/OrthographyBridgeManager', () => ({
  OrthographyBridgeManager: ({ targetOrthography }: { targetOrthography?: OrthographyDocType }) => (
    <div data-testid="orthography-bridge-manager">
      {targetOrthography ? `bridge:${targetOrthography.id}` : 'bridge:none'}
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

describe('OrthographyWorkspacePage', () => {
  beforeEach(() => {
    mockListOrthographies.mockReset();
    mockUpdateOrthography.mockReset();
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

  it('loads the orthography workspace, selects the requested orthography, and registers side-pane summary', async () => {
    render(
      <MemoryRouter initialEntries={['/lexicon/orthographies?orthographyId=orth-source']}>
        <LocaleProvider locale="zh-CN">
          <AppSidePaneProvider>
            <SidePaneSnapshot />
            <Routes>
              <Route path="/lexicon/orthographies" element={<OrthographyWorkspacePage />} />
            </Routes>
          </AppSidePaneProvider>
        </LocaleProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByText('Bridge Orthography · Latn · practical').length).toBeGreaterThan(0);
    });

    expect(mockListOrthographies).toHaveBeenCalledWith({ includeBuiltIns: true });

    expect(screen.getByTestId('orthography-bridge-manager').textContent).toBe('bridge:orth-source');
    expect(screen.getByTestId('side-pane-title').textContent).toBe('正字法工作台');
    await waitFor(() => {
      expect(screen.getByTestId('side-pane-content').textContent).toContain('Bridge Orthography · Latn · practical');
    });
  });

  it('saves edited orthography metadata from the workspace panel', async () => {
    render(
      <MemoryRouter initialEntries={['/lexicon/orthographies?orthographyId=orth-source']}>
        <LocaleProvider locale="zh-CN">
          <AppSidePaneProvider>
            <Routes>
              <Route path="/lexicon/orthographies" element={<OrthographyWorkspacePage />} />
            </Routes>
          </AppSidePaneProvider>
        </LocaleProvider>
      </MemoryRouter>,
    );

    const nameInput = await screen.findByDisplayValue('Bridge Orthography');
    fireEvent.change(nameInput, { target: { value: 'Updated Bridge Orthography' } });
    fireEvent.change(screen.getAllByLabelText('键盘布局')[0]!, { target: { value: 'us-intl' } });
    fireEvent.change(screen.getByRole('combobox', { name: '审校状态' }), { target: { value: 'verified-secondary' } });
    fireEvent.change(screen.getByRole('combobox', { name: '目录优先级' }), { target: { value: 'secondary' } });
    fireEvent.click(screen.getAllByRole('button', { name: '保存元数据' })[0]!);

    await waitFor(() => {
      expect(mockUpdateOrthography).toHaveBeenCalledWith(expect.objectContaining({
        id: 'orth-source',
        languageId: 'eng',
        name: { eng: 'Updated Bridge Orthography' },
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

  it('shows sidebar entry context and blocks orthography switching while the draft is dirty until confirmed', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={['/lexicon/orthographies?orthographyId=orth-source&fromLayerId=layer_trc_bridge']}>
        <LocaleProvider locale="zh-CN">
          <AppSidePaneProvider>
            <Routes>
              <Route path="/lexicon/orthographies" element={<OrthographyWorkspacePage />} />
            </Routes>
          </AppSidePaneProvider>
        </LocaleProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('当前入口来自转写侧栏；后续可直接在这里长期维护桥接规则。')).toBeTruthy();

    fireEvent.change(await screen.findByLabelText('名称（英文）'), { target: { value: 'Dirty Bridge Orthography' } });
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
});