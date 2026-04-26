// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppSidePaneProvider, useAppSidePaneRegistrationSnapshot } from '../contexts/AppSidePaneContext';
import { LocaleProvider } from '../i18n';
import type { CustomFieldDefinitionDocType } from '../db';
import type { LanguageCatalogEntry } from '../services/LinguisticService.languageCatalog';
import { LanguageMetadataWorkspacePage } from './LanguageMetadataWorkspacePage';

const PROJECT_LANGUAGE_IDS = ['eng'] as const;

const {
  mockListLanguageCatalogEntries,
  mockListLanguageCatalogHistory,
  mockUpsertLanguageCatalogEntry,
  mockDeleteLanguageCatalogEntry,
  mockListCustomFieldDefinitions,
  mockUpsertCustomFieldDefinition,
  mockDeleteCustomFieldDefinition,
  mockLookupIso639_3Seed,
  mockForwardGeocode,
  mockReverseGeocode,
  mockSearchLanguageCatalogSuggestions,
  mockPreviewStructuralRuleProfile,
} = vi.hoisted(() => ({
  mockListLanguageCatalogEntries: vi.fn(),
  mockListLanguageCatalogHistory: vi.fn(),
  mockUpsertLanguageCatalogEntry: vi.fn(),
  mockDeleteLanguageCatalogEntry: vi.fn(),
  mockListCustomFieldDefinitions: vi.fn(),
  mockUpsertCustomFieldDefinition: vi.fn(),
  mockDeleteCustomFieldDefinition: vi.fn(),
  mockLookupIso639_3Seed: vi.fn(),
  mockForwardGeocode: vi.fn(),
  mockReverseGeocode: vi.fn(),
  mockSearchLanguageCatalogSuggestions: vi.fn(),
  mockPreviewStructuralRuleProfile: vi.fn(),
}));

vi.mock('../services/LinguisticService.languageCatalog', () => ({
  listLanguageCatalogEntries: mockListLanguageCatalogEntries,
  listLanguageCatalogHistory: mockListLanguageCatalogHistory,
  upsertLanguageCatalogEntry: mockUpsertLanguageCatalogEntry,
  deleteLanguageCatalogEntry: mockDeleteLanguageCatalogEntry,
  listCustomFieldDefinitions: mockListCustomFieldDefinitions,
  upsertCustomFieldDefinition: mockUpsertCustomFieldDefinition,
  deleteCustomFieldDefinition: mockDeleteCustomFieldDefinition,
  lookupIso639_3Seed: mockLookupIso639_3Seed,
}));

vi.mock('../services/LanguageCatalogSearchService', () => ({
  searchLanguageCatalogSuggestions: mockSearchLanguageCatalogSuggestions,
}));

vi.mock('../services/LinguisticService.structuralProfiles', () => ({
  LinguisticStructuralProfileService: {
    previewStructuralRuleProfile: mockPreviewStructuralRuleProfile,
  },
}));

vi.mock('../components/languageGeocoder', () => ({
  forwardGeocode: mockForwardGeocode,
  reverseGeocode: mockReverseGeocode,
  readGeocoderCapabilities: vi.fn(() => ({
    supportsForwardGeocode: true,
    supportsReverseGeocode: true,
    supportsBias: true,
    supportsCountryFilter: true,
    supportsStructuredQuery: true,
  })),
}));

vi.mock('../components/LanguageMapEmbed', () => ({
  LanguageMapEmbed: ({
    latitude,
    longitude,
    onCoordinateClick,
    onCoordinateDragEnd,
  }: {
    latitude: number;
    longitude: number;
    onCoordinateClick?: (lat: number, lng: number) => void;
    onCoordinateDragEnd?: (lat: number, lng: number) => void;
  }) => (
    <div data-testid="mock-language-map">
      <span data-testid="mock-language-map-coords">{latitude},{longitude}</span>
      <button type="button" onClick={() => onCoordinateClick?.(31.23, 121.47)}>模拟地图点选</button>
      <button type="button" onClick={() => onCoordinateDragEnd?.(30.67, 104.06)}>模拟地图拖拽</button>
    </div>
  ),
}));

vi.mock('../hooks/useProjectLanguageIds', () => ({
  useProjectLanguageIds: () => ({ projectLanguageIds: PROJECT_LANGUAGE_IDS, loading: false }),
}));

let currentEntries: LanguageCatalogEntry[] = [];
let currentFieldDefinitions: CustomFieldDefinitionDocType[] = [];
let currentHistory: Array<{
  id: string;
  languageId: string;
  action: string;
  summary: string;
  changedFields: string[];
  reason: string;
  actorType: string;
  createdAt: string;
}> = [];

function createEntry(overrides: Partial<LanguageCatalogEntry> = {}): LanguageCatalogEntry {
  return {
    id: 'eng',
    entryKind: 'built-in',
    hasPersistedRecord: false,
    languageCode: 'eng',
    englishName: 'English',
    localName: '英语',
    genus: '印欧语系',
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
    ...overrides,
  };
}

function renderWorkspace(initialPath = '/assets/language-metadata?languageId=eng', locale: 'zh-CN' | 'en-US' = 'zh-CN') {
  return render(
    <QueryClientProvider client={queryClient}>
    <MemoryRouter initialEntries={[initialPath]}>
      <LocaleProvider locale={locale}>
        <AppSidePaneProvider>
          <SidePaneSnapshot />
          <Routes>
            <Route path="/assets/language-metadata" element={<LanguageMetadataWorkspacePage />} />
          </Routes>
        </AppSidePaneProvider>
      </LocaleProvider>
    </MemoryRouter>
    </QueryClientProvider>,
  );
}

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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let queryClient: QueryClient;

describe('LanguageMetadataWorkspacePage', () => {
  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    currentEntries = [
      createEntry(),
      createEntry({
        id: 'user:demo-language',
        entryKind: 'custom',
        hasPersistedRecord: true,
        languageCode: 'demo',
        englishName: 'Demo Language',
        localName: '示例语言',
        aliases: ['示例'],
        sourceType: 'user-custom',
        displayNames: [],
      }),
    ];
    currentFieldDefinitions = [];
    currentHistory = [
      {
        id: 'langhist-1',
        languageId: 'user:demo-language',
        action: 'update',
        summary: '更新语言元数据',
        changedFields: ['englishName', 'aliases'],
        reason: '根据术语表修正英文名与检索别名。',
        actorType: 'human',
        createdAt: '2026-04-05T00:00:00.000Z',
      },
    ];

    mockListLanguageCatalogEntries.mockReset();
    mockListLanguageCatalogHistory.mockReset();
    mockUpsertLanguageCatalogEntry.mockReset();
    mockDeleteLanguageCatalogEntry.mockReset();
    mockListCustomFieldDefinitions.mockReset();
    mockUpsertCustomFieldDefinition.mockReset();
    mockDeleteCustomFieldDefinition.mockReset();
    mockLookupIso639_3Seed.mockReset();
    mockForwardGeocode.mockReset();
    mockReverseGeocode.mockReset();
    mockSearchLanguageCatalogSuggestions.mockReset();
    mockPreviewStructuralRuleProfile.mockReset();

    mockSearchLanguageCatalogSuggestions.mockImplementation(async ({ query }: { query: string; locale: string }) => {
      const normalizedQuery = query.trim().toLowerCase();
      if (!normalizedQuery) return [];
      return currentEntries
        .filter((entry) => [
          entry.id,
          entry.languageCode,
          entry.localName,
          entry.englishName,
          ...(entry.aliases ?? []),
        ]
          .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
          .some((v) => v.toLowerCase().includes(normalizedQuery)))
        .map((entry) => ({
          id: entry.id,
          languageCode: entry.languageCode,
          primaryLabel: entry.localName,
          matchedLabel: entry.localName,
          matchSource: 'localName' as const,
          rank: 0,
        }));
    });
    mockPreviewStructuralRuleProfile.mockResolvedValue({
      resolution: {
        profile: {
          id: 'system.leipzig-structural.v1',
          label: 'Leipzig structural profile',
          version: '1',
          scope: 'system',
          symbols: {
            morphemeBoundary: '-',
            featureSeparator: '.',
            cliticBoundary: '=',
            infixStart: '<',
            infixEnd: '>',
            suppliedStart: '[',
            suppliedEnd: ']',
            alternationMarker: '\\',
          },
          zeroMarkers: ['ZERO'],
          reduplicationMarkers: ['REDUP'],
          warningPolicy: {
            emptySegment: 'warning',
            unmatchedWrapper: 'warning',
            alternationMarker: 'info',
          },
          projectionTargets: ['latex'],
        },
        appliedAssetIds: [],
        diagnostics: [],
      },
      parseResult: {
        profileId: 'system.leipzig-structural.v1',
        input: '1SG=COP dog-PL',
        segments: [
          { id: 'seg-1', text: '1SG', kind: 'feature', wordIndex: 0, startOffset: 0, endOffset: 3 },
          { id: 'seg-2', text: 'COP', kind: 'feature', wordIndex: 0, startOffset: 4, endOffset: 7 },
        ],
        boundaries: [{ type: 'clitic', marker: '=', offset: 3, wordIndex: 0 }],
        features: [{ segmentId: 'seg-1', label: '1SG' }],
        warnings: [],
        projectionDiagnostics: [{ target: 'latex', status: 'complete', message: 'ready' }],
      },
      candidateGraph: {
        id: 'candidate',
        text: '1SG=COP dog-PL',
        displayGloss: '1SG=COP dog-PL',
        nodes: [{ id: 'token-1', type: 'token', label: '1SG=COP dog-PL' }],
        relations: [],
        projectionDiagnostics: [{ target: 'latex', status: 'complete', message: 'ready' }],
      },
    });

    mockListLanguageCatalogEntries.mockImplementation(async (input: {
      searchText?: string;
      languageIds?: readonly string[];
    }) => {
      const normalizedSearchText = input.searchText?.trim().toLowerCase() ?? '';
      const requestedIds = input.languageIds?.map((languageId) => languageId.trim().toLowerCase()).filter(Boolean);
      const baseEntries = requestedIds && requestedIds.length > 0
        ? currentEntries.filter((entry) => requestedIds.includes(entry.id.toLowerCase()))
        : currentEntries;

      if (!normalizedSearchText) {
        return baseEntries;
      }

      return currentEntries.filter((entry) => [
        entry.id,
        entry.languageCode,
        entry.localName,
        entry.englishName,
        ...(entry.aliases ?? []),
      ]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .some((value) => value.toLowerCase().includes(normalizedSearchText)));
    });
    mockListLanguageCatalogHistory.mockImplementation(async (languageId: string) => currentHistory.filter((item) => item.languageId === languageId));
    mockListCustomFieldDefinitions.mockImplementation(async () => currentFieldDefinitions);
    mockLookupIso639_3Seed.mockReturnValue(undefined);
    mockForwardGeocode.mockResolvedValue([]);
    mockUpsertCustomFieldDefinition.mockImplementation(async (input: Partial<CustomFieldDefinitionDocType>) => ({
      id: String(input.id ?? 'custom-field'),
      name: input.name ?? { 'zh-CN': '新字段' },
      fieldType: input.fieldType ?? 'text',
      sortOrder: input.sortOrder ?? 0,
      createdAt: '2026-04-07T00:00:00.000Z',
      updatedAt: '2026-04-07T00:00:00.000Z',
      ...(input.required !== undefined ? { required: input.required } : {}),
      ...(input.options !== undefined ? { options: input.options } : {}),
      ...(input.defaultValue !== undefined ? { defaultValue: input.defaultValue } : {}),
      ...(input.minValue !== undefined ? { minValue: input.minValue } : {}),
      ...(input.maxValue !== undefined ? { maxValue: input.maxValue } : {}),
      ...(input.pattern !== undefined ? { pattern: input.pattern } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.placeholder !== undefined ? { placeholder: input.placeholder } : {}),
      ...(input.helpText !== undefined ? { helpText: input.helpText } : {}),
    }));
    mockDeleteLanguageCatalogEntry.mockResolvedValue(undefined);
    mockReverseGeocode.mockResolvedValue(null);
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('loads the language metadata workspace and saves an override for a built-in entry', async () => {
    renderWorkspace();

    await waitFor(() => {
      expect(screen.getByDisplayValue('英语')).toBeTruthy();
    });

    expect(mockListLanguageCatalogEntries).toHaveBeenCalledWith(expect.objectContaining({
      locale: 'zh-CN',
      includeHidden: true,
      languageIds: ['eng'],
    }));

    expect(screen.getByTestId('side-pane-title').textContent).toBe('语言元数据工作台');

    fireEvent.change(screen.getByRole('textbox', { name: '当前语言显示名' }), { target: { value: '英语（覆盖）' } });
    fireEvent.change(screen.getByRole('textbox', { name: '英文名' }), { target: { value: 'English Override' } });
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
  });

  it('previews structural profile rules from the language asset workspace', async () => {
    renderWorkspace();

    await screen.findByRole('heading', { name: 'Structural Profile' });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

    await waitFor(() => {
      expect(mockPreviewStructuralRuleProfile).toHaveBeenCalledWith({
        languageId: 'eng',
        glossText: '1SG=COP dog-PL',
      });
    });
    expect(await screen.findByText('Ready for confirmation.')).toBeTruthy();
    expect(screen.getByText(/1SG:feature/)).toBeTruthy();
  });

  it('serializes supplemental display-name matrix rows when saving', async () => {
    const view = renderWorkspace();

    await waitFor(() => {
      expect(screen.getByDisplayValue('英语')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: '新增名称行' }));

    const matrixRows = Array.from(view.container.querySelectorAll('.lm-matrix-row'));
    const newRow = matrixRows[matrixRows.length - 1] as HTMLElement;
    const newRowQueries = within(newRow);

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
        expect.objectContaining({ locale: 'zh-CN', role: 'menu', value: 'inglés alternativo' }),
        expect.objectContaining({ locale: 'fr-FR', role: 'preferred', value: 'anglais' }),
      ]),
    });
  });

  it('keeps unsaved draft edits when the catalog list refreshes for the same selected entry', async () => {
    renderWorkspace('/assets/language-metadata?languageId=user:demo-language');

    await waitFor(() => {
      expect(screen.getByDisplayValue('示例语言')).toBeTruthy();
    });

    const englishNameInput = screen.getByRole('textbox', { name: '英文名' }) as HTMLInputElement;
    fireEvent.change(englishNameInput, { target: { value: 'Unsaved Override' } });
    expect(englishNameInput.value).toBe('Unsaved Override');

    fireEvent.change(screen.getByRole('searchbox', { name: '按名称、别名、代码或标准标识定位' }), { target: { value: '示例' } });

    await waitFor(() => {
      expect(mockSearchLanguageCatalogSuggestions).toHaveBeenCalledWith(expect.objectContaining({
        query: '示例',
        locale: 'zh-CN',
        catalogScope: 'language',
      }));
    });

    expect((screen.getByRole('textbox', { name: '英文名' }) as HTMLInputElement).value).toBe('Unsaved Override');
  });

  it('can switch to custom creation mode and request deletion for persisted custom entries', async () => {
    renderWorkspace('/assets/language-metadata?languageId=user:demo-language');

    await waitFor(() => {
      expect(screen.getByDisplayValue('示例语言')).toBeTruthy();
    });

    expect(mockListLanguageCatalogEntries).toHaveBeenCalledWith(expect.objectContaining({
      locale: 'zh-CN',
      includeHidden: true,
      languageIds: expect.arrayContaining(['eng', 'user:demo-language']),
    }));

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
    renderWorkspace('/assets/language-metadata');

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
    expect(lastCallIndex >= 0 ? mockUpsertLanguageCatalogEntry.mock.calls[lastCallIndex]?.[0] : undefined).toMatchObject({
      id: 'user:field-language',
      languageCode: 'fld',
      localName: '田野语言',
      englishName: 'Field Language',
      locale: 'zh-CN',
    });
  });

  it('persists existing custom field values with typed conversion during page save', async () => {
    currentEntries = [
      createEntry({
        customFields: {
          vitalityScore: 3,
        },
      }),
    ];
    currentFieldDefinitions = [
      {
        id: 'vitalityScore',
        name: { 'zh-CN': '活力评分' },
        fieldType: 'number',
        required: true,
        minValue: 1,
        maxValue: 5,
        helpText: { 'zh-CN': '范围 1 到 5' },
        sortOrder: 0,
        createdAt: '2026-04-07T00:00:00.000Z',
        updatedAt: '2026-04-07T00:00:00.000Z',
      },
    ];

    renderWorkspace();

    await waitFor(() => {
      expect(mockListCustomFieldDefinitions).toHaveBeenCalled();
      expect(screen.getByDisplayValue('英语')).toBeTruthy();
    });

    fireEvent.change(screen.getByDisplayValue('英语'), { target: { value: '英语（保留字段）' } });
    fireEvent.click(screen.getByRole('button', { name: '保存条目' }));

    await waitFor(() => {
      expect(mockUpsertLanguageCatalogEntry).toHaveBeenCalled();
    });

    const lastCallIndex = mockUpsertLanguageCatalogEntry.mock.calls.length - 1;
    expect(lastCallIndex >= 0 ? mockUpsertLanguageCatalogEntry.mock.calls[lastCallIndex]?.[0] : undefined).toMatchObject({
      id: 'eng',
      customFields: {
        vitalityScore: 3,
      },
    });
  });

  it('generates classification path from family fields when saving', async () => {
    renderWorkspace('/assets/language-metadata?languageId=user:demo-language');

    await waitFor(() => {
      expect(screen.getByDisplayValue('示例语言')).toBeTruthy();
    });

    fireEvent.change(screen.getByRole('textbox', { name: '语系' }), { target: { value: '汉藏语系' } });
    fireEvent.change(screen.getByRole('textbox', { name: '语族' }), { target: { value: '藏缅语族' } });
    fireEvent.change(screen.getByRole('textbox', { name: '语支' }), { target: { value: '缅语支' } });
    fireEvent.change(screen.getByRole('textbox', { name: '方言' }), { target: { value: '阿昌话\n梁河话' } });
    fireEvent.change(screen.getByRole('textbox', { name: '土语' }), { target: { value: '户撒土语' } });

    expect((screen.getByRole('textbox', { name: '谱系路径' }) as HTMLInputElement).value).toBe('语系: 汉藏语系 / 语族: 藏缅语族 / 语支: 缅语支 / 方言: 阿昌话、梁河话 / 土语: 户撒土语');

    fireEvent.click(screen.getByRole('button', { name: '保存条目' }));

    await waitFor(() => {
      expect(mockUpsertLanguageCatalogEntry).toHaveBeenCalled();
    });

    const lastCallIndex = mockUpsertLanguageCatalogEntry.mock.calls.length - 1;
    expect(lastCallIndex >= 0 ? mockUpsertLanguageCatalogEntry.mock.calls[lastCallIndex]?.[0] : undefined).toMatchObject({
      id: 'user:demo-language',
      classificationPath: '汉藏语系 / 藏缅语族 / 缅语支 / 阿昌话、梁河话 / 户撒土语',
      dialects: ['阿昌话', '梁河话'],
      vernaculars: ['户撒土语'],
    });
  });

  it('updates coordinates from map drag and persists reverse-geocoded location state', async () => {
    currentEntries = [
      createEntry({
        latitude: 39.9,
        longitude: 116.4,
      }),
    ];
    mockReverseGeocode.mockResolvedValue({
      label: '成都，中国',
      provider: 'nominatim',
      latitude: 30.67,
      longitude: 104.06,
    });

    renderWorkspace();

    expect(await screen.findByTestId('mock-language-map')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '模拟地图拖拽' }));

    await waitFor(() => {
      expect(mockReverseGeocode).toHaveBeenCalledWith(expect.objectContaining({
        latitude: 30.67,
        longitude: 104.06,
        locale: 'zh-CN',
      }));
    });

    expect(await screen.findByText((content) => content.includes('当前位置：成都，中国'))).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '保存条目' }));

    await waitFor(() => {
      expect(mockUpsertLanguageCatalogEntry).toHaveBeenCalled();
    });

    const lastCallIndex = mockUpsertLanguageCatalogEntry.mock.calls.length - 1;
    expect(lastCallIndex >= 0 ? mockUpsertLanguageCatalogEntry.mock.calls[lastCallIndex]?.[0] : undefined).toMatchObject({
      id: 'eng',
      latitude: 30.67,
      longitude: 104.06,
    });
  });

  it('renders the map immediately after manually entering valid coordinates', async () => {
    renderWorkspace('/assets/language-metadata?languageId=user:demo-language');

    await waitFor(() => {
      expect(screen.getByDisplayValue('示例语言')).toBeTruthy();
    });

    fireEvent.change(screen.getByRole('textbox', { name: '纬度' }), { target: { value: '35.8617' } });
    fireEvent.change(screen.getByRole('textbox', { name: '经度' }), { target: { value: '104.1954' } });

    await waitFor(() => {
      expect(screen.getByTestId('mock-language-map')).toBeTruthy();
    });

    expect(screen.getByTestId('mock-language-map-coords').textContent).toBe('35.8617,104.1954');
  });

  it('appends a searched administrative division and persists structured geography data', async () => {
    mockForwardGeocode.mockResolvedValue([
      {
        id: 'nominatim:kunming',
        displayName: '昆明市, 云南省, 中国',
        primaryText: '昆明市',
        secondaryText: '昆明市, 云南省, 中国',
        lat: 25.0438,
        lng: 102.71,
        provider: 'nominatim',
        administrativeHierarchy: {
          country: '中国',
          countryCode: 'CN',
          province: '云南省',
          city: '昆明市',
          county: '五华区',
          township: '普吉街道',
          village: '篆塘社区',
        },
      },
    ]);

    renderWorkspace('/assets/language-metadata?languageId=user:demo-language');

    await waitFor(() => {
      expect(screen.getByDisplayValue('示例语言')).toBeTruthy();
    });

    fireEvent.change(screen.getByRole('textbox', { name: '检索地点并补全行政区' }), { target: { value: '昆明市' } });
    fireEvent.click(screen.getByRole('button', { name: '检索' }));
    await waitFor(() => {
      expect(mockForwardGeocode).toHaveBeenCalled();
    });
    fireEvent.click(await screen.findByRole('button', { name: /昆明市/ }));
    fireEvent.click(screen.getByRole('button', { name: '加入列表' }));

    expect((screen.getByRole('textbox', { name: '已选行政区条目' }) as HTMLTextAreaElement).value).toContain('国家: 中国 / 省州: 云南省 / 城市: 昆明市 / 县区: 五华区 / 乡镇: 普吉街道 / 村: 篆塘社区');
    expect(await screen.findByTestId('mock-language-map')).toBeTruthy();
    expect(screen.getByTestId('mock-language-map-coords').textContent).toBe('25.0438,102.71');
    expect(screen.getByText((content) => content.includes('当前位置：昆明市, 云南省, 中国'))).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '保存条目' }));

    await waitFor(() => {
      expect(mockUpsertLanguageCatalogEntry).toHaveBeenCalled();
    });

    const lastCallIndex = mockUpsertLanguageCatalogEntry.mock.calls.length - 1;
    expect(lastCallIndex >= 0 ? mockUpsertLanguageCatalogEntry.mock.calls[lastCallIndex]?.[0] : undefined).toMatchObject({
      id: 'user:demo-language',
      countries: ['CN'],
      administrativeDivisions: [
        {
          country: '中国',
          province: '云南省',
          city: '昆明市',
          county: '五华区',
          township: '普吉街道',
          village: '篆塘社区',
        },
      ],
    });
  });

  it('keeps latest administrative search results when an earlier request resolves later', async () => {
    const firstSearch = createDeferred<Array<{
      id: string;
      displayName: string;
      primaryText: string;
      secondaryText?: string;
      lat: number;
      lng: number;
      provider: 'nominatim';
    }>>();
    const secondSearch = createDeferred<Array<{
      id: string;
      displayName: string;
      primaryText: string;
      secondaryText?: string;
      lat: number;
      lng: number;
      provider: 'nominatim';
    }>>();

    mockForwardGeocode
      .mockImplementationOnce(async () => firstSearch.promise)
      .mockImplementationOnce(async () => secondSearch.promise);

    renderWorkspace('/assets/language-metadata?languageId=user:demo-language');

    await waitFor(() => {
      expect(screen.getByDisplayValue('示例语言')).toBeTruthy();
    });

    const adminSearchInput = screen.getByRole('textbox', { name: '检索地点并补全行政区' });

    fireEvent.change(adminSearchInput, { target: { value: '昆明' } });
    fireEvent.keyDown(adminSearchInput, { key: 'Enter' });

    fireEvent.change(adminSearchInput, { target: { value: '大理' } });
    fireEvent.keyDown(adminSearchInput, { key: 'Enter' });

    await waitFor(() => {
      expect(mockForwardGeocode).toHaveBeenCalledTimes(2);
    });

    secondSearch.resolve([
      {
        id: 'nominatim:dali',
        displayName: '大理白族自治州, 云南省, 中国',
        primaryText: '大理市',
        secondaryText: '大理白族自治州, 云南省, 中国',
        lat: 25.6,
        lng: 100.27,
        provider: 'nominatim',
      },
    ]);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /大理市/ })).toBeTruthy();
    });

    firstSearch.resolve([
      {
        id: 'nominatim:kunming',
        displayName: '昆明市, 云南省, 中国',
        primaryText: '昆明市',
        secondaryText: '昆明市, 云南省, 中国',
        lat: 25.04,
        lng: 102.71,
        provider: 'nominatim',
      },
    ]);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /大理市/ })).toBeTruthy();
      expect(screen.queryByRole('button', { name: /昆明市/ })).toBeNull();
    });
  });

  it('geocodes manually edited administrative divisions when adding without choosing a search result', async () => {
    mockForwardGeocode.mockResolvedValue([
      {
        id: 'nominatim:dali-heqing',
        displayName: '鹤庆县, 大理白族自治州, 云南省, 中国',
        primaryText: '鹤庆县',
        secondaryText: '鹤庆县, 大理白族自治州, 云南省, 中国',
        lat: 26.5606,
        lng: 100.1766,
        provider: 'nominatim',
        administrativeHierarchy: {
          country: '中国',
          countryCode: 'CN',
          province: '云南省',
          city: '大理白族自治州',
          county: '鹤庆县',
        },
      },
    ]);

    renderWorkspace('/assets/language-metadata?languageId=user:demo-language');

    await waitFor(() => {
      expect(screen.getByDisplayValue('示例语言')).toBeTruthy();
    });

    expect(screen.queryByTestId('mock-language-map')).toBeNull();

    fireEvent.change(screen.getByRole('textbox', { name: '国家' }), { target: { value: '中国' } });
    fireEvent.change(screen.getByRole('textbox', { name: '省 / 州' }), { target: { value: '云南省' } });
    fireEvent.change(screen.getByRole('textbox', { name: '城市' }), { target: { value: '大理白族自治州' } });
    fireEvent.change(screen.getByRole('textbox', { name: '县 / 区' }), { target: { value: '鹤庆县' } });

    await waitFor(() => {
      expect((screen.getByRole('button', { name: '加入列表' }) as HTMLButtonElement).disabled).toBe(false);
    });

    fireEvent.click(screen.getByRole('button', { name: '加入列表' }));

    await waitFor(() => {
      expect(mockForwardGeocode).toHaveBeenCalledWith(expect.objectContaining({
        query: '鹤庆县, 大理白族自治州, 云南省, 中国',
        structuredAddress: true,
        limit: 1,
      }));
    });

    expect(await screen.findByTestId('mock-language-map')).toBeTruthy();
    expect(screen.getByTestId('mock-language-map-coords').textContent).toBe('26.5606,100.1766');
    expect(screen.getByText((content) => content.includes('当前位置：鹤庆县, 大理白族自治州, 云南省, 中国'))).toBeTruthy();
    expect((screen.getByRole('textbox', { name: '已选行政区条目' }) as HTMLTextAreaElement).value).toContain('国家: 中国 / 省州: 云南省 / 城市: 大理白族自治州 / 县区: 鹤庆县');

    fireEvent.click(screen.getByRole('button', { name: '保存条目' }));

    await waitFor(() => {
      expect(mockUpsertLanguageCatalogEntry).toHaveBeenCalled();
    });

    const lastCallIndex = mockUpsertLanguageCatalogEntry.mock.calls.length - 1;
    expect(lastCallIndex >= 0 ? mockUpsertLanguageCatalogEntry.mock.calls[lastCallIndex]?.[0] : undefined).toMatchObject({
      countries: ['中国'],
      administrativeDivisions: [
        {
          country: '中国',
          province: '云南省',
          city: '大理白族自治州',
          county: '鹤庆县',
        },
      ],
    });
  });

  it('reuses legacy localized country names as geocode country filters in english locale', async () => {
    mockForwardGeocode.mockResolvedValue([]);

    currentEntries = [
      createEntry({
        id: 'user:demo-language',
        entryKind: 'custom',
        hasPersistedRecord: true,
        languageCode: 'demo',
        englishName: 'Demo Language',
        localName: '示例语言',
        aliases: ['示例'],
        sourceType: 'user-custom',
        displayNames: [],
        countries: ['中国'],
      }),
    ];

    renderWorkspace('/assets/language-metadata?languageId=user:demo-language', 'en-US');

    await waitFor(() => {
      expect(screen.getByDisplayValue('Demo Language')).toBeTruthy();
    });

    fireEvent.change(screen.getByRole('textbox', { name: 'Search a place and complete the hierarchy' }), { target: { value: 'Kunming' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(mockForwardGeocode).toHaveBeenCalledWith(expect.objectContaining({
        query: 'Kunming',
        countryCodes: ['cn'],
      }));
    });
  });

  it('keeps existing administrative-division lines visible and editable in the geography picker', async () => {
    currentEntries = [
      createEntry({
        id: 'user:demo-language',
        entryKind: 'custom',
        hasPersistedRecord: true,
        languageCode: 'demo',
        englishName: 'Demo Language',
        localName: '示例语言',
        aliases: ['示例'],
        sourceType: 'user-custom',
        displayNames: [],
        administrativeDivisions: [
          {
            country: '中国',
            province: '云南省',
            city: '昆明市',
          },
        ],
      }),
    ];

    renderWorkspace('/assets/language-metadata?languageId=user:demo-language');

    await waitFor(() => {
      expect(screen.getByDisplayValue('示例语言')).toBeTruthy();
    });

    const divisionsInput = await screen.findByRole('textbox', { name: '已选行政区条目' }) as HTMLTextAreaElement;
    expect(divisionsInput.value).toContain('国家: 中国 / 省州: 云南省 / 城市: 昆明市');

    fireEvent.change(divisionsInput, {
      target: {
        value: '国家: 中国 / 省州: 云南省 / 城市: 昆明市\nCountry: Nepal / State: Bagmati / City: Kathmandu',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存条目' }));

    await waitFor(() => {
      expect(mockUpsertLanguageCatalogEntry).toHaveBeenCalled();
    });

    const lastCallIndex = mockUpsertLanguageCatalogEntry.mock.calls.length - 1;
    expect(lastCallIndex >= 0 ? mockUpsertLanguageCatalogEntry.mock.calls[lastCallIndex]?.[0] : undefined).toMatchObject({
      administrativeDivisions: [
        {
          country: '中国',
          province: '云南省',
          city: '昆明市',
        },
        {
          country: 'Nepal',
          province: 'Bagmati',
          city: 'Kathmandu',
        },
      ],
    });
  });

  it('keeps legacy country names without appending duplicate ISO codes when adding administrative divisions', async () => {
    mockForwardGeocode.mockResolvedValue([
      {
        id: 'nominatim:kunming',
        displayName: '昆明市, 云南省, 中国',
        primaryText: '昆明市',
        secondaryText: '昆明市, 云南省, 中国',
        lat: 25.0438,
        lng: 102.71,
        provider: 'nominatim',
        administrativeHierarchy: {
          country: '中国',
          countryCode: 'CN',
          province: '云南省',
          city: '昆明市',
        },
      },
    ]);

    currentEntries = [
      createEntry({
        id: 'user:demo-language',
        entryKind: 'custom',
        hasPersistedRecord: true,
        languageCode: 'demo',
        englishName: 'Demo Language',
        localName: '示例语言',
        aliases: ['示例'],
        sourceType: 'user-custom',
        displayNames: [],
        countries: ['China'],
      }),
    ];

    renderWorkspace('/assets/language-metadata?languageId=user:demo-language');

    await waitFor(() => {
      expect(screen.getByDisplayValue('示例语言')).toBeTruthy();
    });

    fireEvent.change(screen.getByRole('textbox', { name: '检索地点并补全行政区' }), { target: { value: '昆明市' } });
    fireEvent.click(screen.getByRole('button', { name: '检索' }));
    fireEvent.click(await screen.findByRole('button', { name: /昆明市/ }));
    fireEvent.click(screen.getByRole('button', { name: '加入列表' }));
    fireEvent.click(screen.getByRole('button', { name: '保存条目' }));

    await waitFor(() => {
      expect(mockUpsertLanguageCatalogEntry).toHaveBeenCalled();
    });

    const lastCallIndex = mockUpsertLanguageCatalogEntry.mock.calls.length - 1;
    expect(lastCallIndex >= 0 ? mockUpsertLanguageCatalogEntry.mock.calls[lastCallIndex]?.[0] : undefined).toMatchObject({
      id: 'user:demo-language',
      countries: ['China'],
      administrativeDivisions: [
        {
          country: '中国',
          province: '云南省',
          city: '昆明市',
        },
      ],
    });
  });

  it('does not append duplicate localized country names when ISO code already exists', async () => {
    mockForwardGeocode.mockResolvedValue([]);

    currentEntries = [
      createEntry({
        id: 'user:demo-language',
        entryKind: 'custom',
        hasPersistedRecord: true,
        languageCode: 'demo',
        englishName: 'Demo Language',
        localName: '示例语言',
        aliases: ['示例'],
        sourceType: 'user-custom',
        displayNames: [],
        countries: ['CN'],
      }),
    ];

    renderWorkspace('/assets/language-metadata?languageId=user:demo-language');

    await waitFor(() => {
      expect(screen.getByDisplayValue('示例语言')).toBeTruthy();
    });

    fireEvent.change(screen.getByRole('textbox', { name: '国家' }), { target: { value: '中国' } });
    fireEvent.change(screen.getByRole('textbox', { name: '城市' }), { target: { value: '昆明市' } });
    fireEvent.click(screen.getByRole('button', { name: '加入列表' }));
    fireEvent.click(screen.getByRole('button', { name: '保存条目' }));

    await waitFor(() => {
      expect(mockUpsertLanguageCatalogEntry).toHaveBeenCalled();
    });

    const lastCallIndex = mockUpsertLanguageCatalogEntry.mock.calls.length - 1;
    expect(lastCallIndex >= 0 ? mockUpsertLanguageCatalogEntry.mock.calls[lastCallIndex]?.[0] : undefined).toMatchObject({
      id: 'user:demo-language',
      countries: ['CN'],
    });
  });
});
