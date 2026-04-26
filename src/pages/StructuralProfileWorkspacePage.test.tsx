// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppSidePaneProvider } from '../contexts/AppSidePaneContext';
import { LocaleProvider } from '../i18n';
import type { LanguageCatalogEntry } from '../services/LinguisticService.languageCatalog';
import { StructuralProfileWorkspacePage } from './StructuralProfileWorkspacePage';

const PROJECT_LANGUAGE_IDS = ['eng'] as const;

const {
  mockListLanguageCatalogEntries,
  mockPreviewStructuralRuleProfile,
} = vi.hoisted(() => ({
  mockListLanguageCatalogEntries: vi.fn(),
  mockPreviewStructuralRuleProfile: vi.fn(),
}));

vi.mock('../services/LinguisticService.languageCatalog', () => ({
  listLanguageCatalogEntries: mockListLanguageCatalogEntries,
}));

vi.mock('../services/LinguisticService.structuralProfiles', () => ({
  LinguisticStructuralProfileService: {
    previewStructuralRuleProfile: mockPreviewStructuralRuleProfile,
  },
}));

vi.mock('../hooks/useProjectLanguageIds', () => ({
  useProjectLanguageIds: () => ({ projectLanguageIds: PROJECT_LANGUAGE_IDS, loading: false }),
}));

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

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
    displayNames: [],
    ...overrides,
  };
}

let currentEntries: LanguageCatalogEntry[] = [];

function renderWorkspace(initialPath = '/assets/structural-profiles?languageId=eng', locale: 'zh-CN' | 'en-US' = 'en-US') {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <LocaleProvider locale={locale}>
          <AppSidePaneProvider>
            <Routes>
              <Route path="/assets/structural-profiles" element={<StructuralProfileWorkspacePage />} />
            </Routes>
          </AppSidePaneProvider>
        </LocaleProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('StructuralProfileWorkspacePage', () => {
  beforeEach(() => {
    currentEntries = [createEntry()];
    mockListLanguageCatalogEntries.mockReset();
    mockPreviewStructuralRuleProfile.mockReset();

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
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('previews structural profile rules for the selected catalog language', async () => {
    renderWorkspace();

    await screen.findByRole('heading', { name: 'Structural profile' });
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
});
