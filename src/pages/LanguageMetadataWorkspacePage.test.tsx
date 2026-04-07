// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppSidePaneProvider, useAppSidePaneRegistrationSnapshot } from '../contexts/AppSidePaneContext';
import { LocaleProvider } from '../i18n';
import type { CustomFieldDefinitionDocType } from '../db';
import type { LanguageCatalogEntry } from '../services/LinguisticService.languageCatalog';
import { LanguageMetadataWorkspacePage } from './LanguageMetadataWorkspacePage';

const {
  mockListLanguageCatalogEntries,
  mockListLanguageCatalogHistory,
  mockUpsertLanguageCatalogEntry,
  mockDeleteLanguageCatalogEntry,
  mockListCustomFieldDefinitions,
  mockUpsertCustomFieldDefinition,
  mockDeleteCustomFieldDefinition,
  mockLookupIso639_3Seed,
  mockReverseGeocode,
} = vi.hoisted(() => ({
  mockListLanguageCatalogEntries: vi.fn(),
  mockListLanguageCatalogHistory: vi.fn(),
  mockUpsertLanguageCatalogEntry: vi.fn(),
  mockDeleteLanguageCatalogEntry: vi.fn(),
  mockListCustomFieldDefinitions: vi.fn(),
  mockUpsertCustomFieldDefinition: vi.fn(),
  mockDeleteCustomFieldDefinition: vi.fn(),
  mockLookupIso639_3Seed: vi.fn(),
  mockReverseGeocode: vi.fn(),
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

vi.mock('../components/languageGeocoder', () => ({
  forwardGeocode: vi.fn(async () => []),
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
  useProjectLanguageIds: () => ({ projectLanguageIds: ['eng'], loading: false }),
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

function renderWorkspace(initialPath = '/assets/language-metadata?languageId=eng') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
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

describe('LanguageMetadataWorkspacePage', () => {
  beforeEach(() => {
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
    mockReverseGeocode.mockReset();

    mockListLanguageCatalogEntries.mockImplementation(async () => currentEntries);
    mockListLanguageCatalogHistory.mockImplementation(async (languageId: string) => currentHistory.filter((item) => item.languageId === languageId));
    mockListCustomFieldDefinitions.mockImplementation(async () => currentFieldDefinitions);
    mockLookupIso639_3Seed.mockReturnValue(undefined);
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
  });

  it('serializes supplemental display-name matrix rows when saving', async () => {
    const view = renderWorkspace();

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
    renderWorkspace('/assets/language-metadata?languageId=user:demo-language');

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
      expect((screen.getByRole('textbox', { name: '纬度' }) as HTMLInputElement).value).toBe('30.67');
      expect((screen.getByRole('textbox', { name: '经度' }) as HTMLInputElement).value).toBe('104.06');
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
    expect(mockReverseGeocode).toHaveBeenCalledWith(expect.objectContaining({
      latitude: 30.67,
      longitude: 104.06,
      locale: 'zh-CN',
    }));
  });
});
