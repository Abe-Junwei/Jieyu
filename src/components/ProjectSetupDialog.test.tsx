// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectSetupDialog } from './ProjectSetupDialog';
import { renderWithLocale } from '../test/localeTestUtils';

const {
  mockCreateOrthography,
  mockCloneOrthographyToLanguage,
  mockCreateOrthographyBridge,
  mockListLanguageCatalogEntries,
  mockUseOrthographies,
  mockSearchLanguageCatalogSuggestions,
} = vi.hoisted(() => ({
  mockCreateOrthography: vi.fn(),
  mockCloneOrthographyToLanguage: vi.fn(),
  mockCreateOrthographyBridge: vi.fn(),
  mockListLanguageCatalogEntries: vi.fn(),
  mockUseOrthographies: vi.fn(),
  mockSearchLanguageCatalogSuggestions: vi.fn(),
}));

vi.mock('../services/LinguisticService.orthography', () => ({
  createOrthographyRecord: mockCreateOrthography,
  cloneOrthographyRecordToLanguage: mockCloneOrthographyToLanguage,
  createOrthographyBridgeRecord: mockCreateOrthographyBridge,
}));

vi.mock('../services/LinguisticService.languageCatalog', () => ({
  listLanguageCatalogEntries: mockListLanguageCatalogEntries,
}));

vi.mock('../services/LanguageCatalogSearchService', () => ({
  searchLanguageCatalogSuggestions: mockSearchLanguageCatalogSuggestions,
}));

vi.mock('../hooks/useOrthographies', () => ({
  useOrthographies: mockUseOrthographies,
}));

mockListLanguageCatalogEntries.mockResolvedValue([]);
mockSearchLanguageCatalogSuggestions.mockImplementation(async ({ query }: { query: string }) => {
  const normalized = query.trim().toLowerCase();
  if (normalized === 'english') {
    return [{
      id: 'eng',
      languageCode: 'eng',
      primaryLabel: 'English',
      matchedLabel: 'English',
      matchedLabelKind: 'english',
      matchSource: 'english-exact',
      rank: 1,
      hasRuntimeOverride: false,
    }];
  }
  if (normalized === 'portuguese') {
    return [{
      id: 'por',
      languageCode: 'por',
      primaryLabel: 'Portuguese',
      matchedLabel: 'Portuguese',
      matchedLabelKind: 'english',
      matchSource: 'english-exact',
      rank: 1,
      hasRuntimeOverride: false,
    }];
  }
  return [];
});

describe('ProjectSetupDialog orthography creation', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    cleanup();
    mockCreateOrthography.mockReset();
    mockCloneOrthographyToLanguage.mockReset();
    mockCreateOrthographyBridge.mockReset();
    mockListLanguageCatalogEntries.mockReset();
    mockListLanguageCatalogEntries.mockResolvedValue([]);
    mockUseOrthographies.mockReset();
    mockSearchLanguageCatalogSuggestions.mockReset();
    mockSearchLanguageCatalogSuggestions.mockImplementation(async ({ query }: { query: string }) => {
      const normalized = query.trim().toLowerCase();
      if (normalized === 'english') {
        return [{
          id: 'eng',
          languageCode: 'eng',
          primaryLabel: 'English',
          matchedLabel: 'English',
          matchedLabelKind: 'english',
          matchSource: 'english-exact',
          rank: 1,
          hasRuntimeOverride: false,
        }];
      }
      if (normalized === 'portuguese') {
        return [{
          id: 'por',
          languageCode: 'por',
          primaryLabel: 'Portuguese',
          matchedLabel: 'Portuguese',
          matchedLabelKind: 'english',
          matchSource: 'english-exact',
          rank: 1,
          hasRuntimeOverride: false,
        }];
      }
      return [];
    });
  });

  it('renders through DialogShell with panel footer actions', () => {
    mockUseOrthographies.mockReturnValue([]);

    renderWithLocale(
      <ProjectSetupDialog
        isOpen
        onClose={vi.fn()}
        onSubmit={vi.fn(async () => undefined)}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: '新建项目' });
    const closeButton = screen.getByRole('button', { name: '关闭' });
    const cancelButton = screen.getByRole('button', { name: '取消' });
    const createButton = screen.getByRole('button', { name: '创建项目' });

    expect(dialog.className).toContain('dialog-card');
    expect(dialog.className).toContain('project-setup-dialog');
    expect(closeButton.className).toContain('icon-btn');
    expect(cancelButton.className).toContain('panel-button--ghost');
    expect(createButton.className).toContain('panel-button--primary');
  });

  it('creates an IPA orthography inline and submits it as project default', async () => {
    mockUseOrthographies.mockReturnValue([]);
    mockCreateOrthography.mockResolvedValue({
      id: 'orth_project_ipa',
      languageId: 'eng',
      name: { zho: 'English IPA', eng: 'English IPA' },
      abbreviation: 'IPA',
      scriptTag: 'Latn',
      type: 'phonetic',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    });

    const onSubmit = vi.fn(async () => undefined);
    const onClose = vi.fn();
    renderWithLocale(
      <ProjectSetupDialog
        isOpen
        onClose={onClose}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('例：白马藏语田野调查'), {
      target: { value: '项目 A' },
    });

    fireEvent.change(screen.getByRole('combobox', { name: /目标语言/ }), {
      target: { value: 'English' },
    });
    const setupCodeInput = screen.getByRole('textbox', { name: /语言代码/ });
    fireEvent.change(setupCodeInput, {
      target: { value: 'eng' },
    });
    fireEvent.blur(setupCodeInput);

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: '正字法 / 书写系统' })).toBeTruthy();
    });

    const openBuilderButton = document.querySelector('.dialog-field-inline-btn') as HTMLButtonElement | null;
    expect(openBuilderButton).toBeTruthy();
    fireEvent.click(openBuilderButton as HTMLButtonElement);

    fireEvent.click(await screen.findByRole('button', { name: /确认风险并创建|创建并选中/ }));
    if (mockCreateOrthography.mock.calls.length === 0) {
      fireEvent.click(await screen.findByRole('button', { name: /确认风险并创建|创建并选中/ }));
    }

    await waitFor(() => {
      expect(mockCreateOrthography).toHaveBeenCalledWith(expect.objectContaining({
        languageId: 'eng',
        abbreviation: 'IPA',
        scriptTag: 'Latn',
        type: 'phonetic',
      }));
    });

    fireEvent.click(screen.getByRole('button', { name: '创建项目' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
        primaryTitle: '项目 A',
        primaryLanguageId: 'eng',
        primaryOrthographyId: 'orth_project_ipa',
      }));
    });
  });

  it('shows the selected orthography status badge in project setup', async () => {
    mockUseOrthographies.mockImplementation((languageIds: string[]) => {
      if (languageIds.includes('eng')) {
        return [{
          id: 'orth_project_reviewed',
          languageId: 'eng',
          name: { eng: 'English Reviewed' },
          scriptTag: 'Latn',
          type: 'practical',
          catalogMetadata: { catalogSource: 'built-in-reviewed', reviewStatus: 'verified-primary', priority: 'primary' },
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        }];
      }
      return [];
    });

    renderWithLocale(
      <ProjectSetupDialog
        isOpen
        onClose={vi.fn()}
        onSubmit={vi.fn(async () => undefined)}
      />,
    );

    fireEvent.change(screen.getByRole('combobox', { name: /目标语言/ }), {
      target: { value: 'English' },
    });
    const badgeCodeInput = screen.getByRole('textbox', { name: /语言代码/ });
    fireEvent.change(badgeCodeInput, {
      target: { value: 'eng' },
    });
    fireEvent.blur(badgeCodeInput);

    await waitFor(() => {
      expect(screen.getAllByText('English Reviewed · Latn · practical').length).toBeGreaterThan(0);
      expect(Array.from(document.querySelectorAll('.panel-chip')).some((node) => node.textContent === '已审校主项')).toBe(true);
    });

    expect(screen.queryByRole('button', { name: '管理写入桥接规则' })).toBeNull();
  });

  it('accepts an ISO code entered alongside the shared language search input', () => {
    mockUseOrthographies.mockReturnValue([]);

    renderWithLocale(
      <ProjectSetupDialog
        isOpen
        onClose={vi.fn()}
        onSubmit={vi.fn(async () => undefined)}
      />,
    );

    fireEvent.change(screen.getByRole('combobox', { name: /目标语言/ }), {
      target: { value: 'Portuguese' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /语言代码/ }), {
      target: { value: 'por' },
    });

    expect((screen.getByRole('textbox', { name: /语言代码/ }) as HTMLInputElement).value).toBe('por');
  });

  it('focuses the language code field when submit is attempted with invalid language input', () => {
    mockUseOrthographies.mockReturnValue([]);

    renderWithLocale(
      <ProjectSetupDialog
        isOpen
        onClose={vi.fn()}
        onSubmit={vi.fn(async () => undefined)}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('例：白马藏语田野调查'), {
      target: { value: '项目 B' },
    });

    fireEvent.click(screen.getByRole('button', { name: '创建项目' }));

    const languageCodeInput = screen.getByRole('textbox', { name: /语言代码/ }) as HTMLInputElement;
    expect(screen.getByText('语言代码必须是有效的 ISO 639-3 三字母代码。')).toBeTruthy();
    expect(document.activeElement).toBe(languageCodeInput);
  });
});
