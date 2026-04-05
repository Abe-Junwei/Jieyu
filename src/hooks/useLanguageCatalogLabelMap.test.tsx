// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n';
import { useLanguageCatalogLabelMap } from './useLanguageCatalogLabelMap';

const { mockListLanguageCatalogEntries } = vi.hoisted(() => ({
  mockListLanguageCatalogEntries: vi.fn(),
}));

vi.mock('../services/LinguisticService', () => ({
  LinguisticService: {
    listLanguageCatalogEntries: mockListLanguageCatalogEntries,
  },
}));

function HookHarness() {
  const { resolveLabel, resolveLanguageDisplayName } = useLanguageCatalogLabelMap('zh-CN');

  return (
    <div>
      <div data-testid="same-locale">{resolveLabel('eng')}</div>
      <div data-testid="cross-locale">{resolveLanguageDisplayName('eng', 'en-US')}</div>
    </div>
  );
}

describe('useLanguageCatalogLabelMap', () => {
  beforeEach(() => {
    mockListLanguageCatalogEntries.mockReset();
    mockListLanguageCatalogEntries.mockResolvedValue([
      {
        id: 'eng',
        entryKind: 'override',
        hasPersistedRecord: true,
        languageCode: 'eng',
        englishName: 'English Override',
        localName: '英语资产标签',
        aliases: [],
        sourceType: 'user-override',
        visibility: 'visible',
        displayNames: [],
      },
    ]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('returns current-locale labels for resolveLabel but respects targetLocale for cross-locale resolution', async () => {
    render(
      <LocaleProvider locale="zh-CN">
        <HookHarness />
      </LocaleProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('same-locale').textContent).toBe('英语资产标签');
    });

    expect(screen.getByTestId('cross-locale').textContent).toBe('English Override');
  });
});