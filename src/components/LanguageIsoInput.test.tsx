// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { renderWithLocale } from '../test/localeTestUtils';
import { LanguageIsoInput, type LanguageIsoInputValue } from './LanguageIsoInput';
import { searchLanguageCatalog } from '../utils/langMapping';

const { mockSearchLanguageCatalogSuggestions } = vi.hoisted(() => ({
  mockSearchLanguageCatalogSuggestions: vi.fn(),
}));

vi.mock('../services/LanguageCatalogSearchService', () => ({
  searchLanguageCatalogSuggestions: mockSearchLanguageCatalogSuggestions,
}));

const resolveInjectedLanguageDisplayName = (languageId: string | undefined) => {
  if (languageId?.trim().toLowerCase() === 'eng') {
    return '英语资产标签';
  }
  return languageId?.trim() ?? '';
};

function extractIsoCodeFromSuggestion(option: HTMLElement): string {
  const text = option.textContent ?? '';
  const matches = Array.from(text.matchAll(/·\s*([a-z]{3})(?=\s*·|$)/gi));
  const lastMatch = matches[matches.length - 1];
  if (!lastMatch?.[1]) {
    throw new Error(`Unable to extract ISO code from suggestion text: ${text}`);
  }
  return lastMatch[1].toLowerCase();
}

function mapMatchSource(matchSource: string, matchedLabelKind: string): string {
  if (matchSource === 'iso6393-exact') return 'code-exact';
  if (matchSource === 'alias-exact') return 'alias-exact';
  if (matchSource === 'name-exact') return `${matchedLabelKind}-exact`;
  if (matchSource === 'prefix') return matchedLabelKind === 'code' ? 'code-prefix' : `${matchedLabelKind}-prefix`;
  return matchedLabelKind === 'code' ? 'code-contains' : `${matchedLabelKind}-contains`;
}

beforeEach(() => {
  mockSearchLanguageCatalogSuggestions.mockImplementation(async ({ query, locale, limit = 5 }: { query: string; locale: 'zh-CN' | 'en-US'; limit?: number }) => (
    searchLanguageCatalog(query, locale, limit).map((match) => ({
      id: match.entry.languageId,
      languageCode: match.entry.iso6393,
      primaryLabel: match.matchedLabel,
      matchedLabel: match.matchedLabel,
      matchedLabelKind: match.matchedLabelKind,
      matchSource: mapMatchSource(match.matchSource, match.matchedLabelKind),
      rank: match.score,
      hasRuntimeOverride: false,
    }))
  ));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  mockSearchLanguageCatalogSuggestions.mockReset();
});

function StatefulLanguageIsoInputHarness({ locale = 'en-US' }: { locale?: 'zh-CN' | 'en-US' }) {
  const [value, setValue] = useState<LanguageIsoInputValue>({ languageName: '', languageCode: '' });

  return (
    <LanguageIsoInput
      locale={locale}
      value={value}
      onChange={setValue}
      nameLabel="Language name"
      codeLabel="Language code"
      namePlaceholder="Search language"
      codePlaceholder="ISO code"
    />
  );
}

function PrefilledLanguageIsoInputHarness() {
  const [value, setValue] = useState<LanguageIsoInputValue>({ languageName: 'English', languageCode: 'eng' });

  return (
    <LanguageIsoInput
      locale="en-US"
      value={value}
      onChange={setValue}
      nameLabel="Language name"
      codeLabel="Language code"
      namePlaceholder="Search language"
      codePlaceholder="ISO code"
    />
  );
}

describe('LanguageIsoInput', () => {
  it('exposes the language-name field as a combobox tied to the visible listbox', () => {
    const view = renderWithLocale(<StatefulLanguageIsoInputHarness />, 'en-US');
    const scopedQueries = within(view.container);

    const languageNameInput = scopedQueries.getByRole('combobox', { name: 'Language name' });

    fireEvent.change(languageNameInput, { target: { value: 'Chinese' } });

    return waitFor(() => {
      const listbox = scopedQueries.getByRole('listbox', { name: 'Language name' });
      const options = scopedQueries.getAllByRole('option');

      expect(languageNameInput.getAttribute('aria-autocomplete')).toBe('list');
      expect(languageNameInput.getAttribute('aria-controls')).toBe(listbox.id);
      expect(languageNameInput.getAttribute('aria-expanded')).toBe('true');
      expect(options.length).toBeGreaterThan(1);
    });
  });

  it('supports explicit keyboard selection from ambiguous suggestions', async () => {
    const view = renderWithLocale(<StatefulLanguageIsoInputHarness />, 'en-US');
    const scopedQueries = within(view.container);

    const languageNameInput = scopedQueries.getByRole('combobox', { name: 'Language name' });
    const languageCodeInput = scopedQueries.getByRole('textbox', { name: 'Language code' }) as HTMLInputElement;

    fireEvent.change(languageNameInput, { target: { value: 'Chinese' } });

  const options = await waitFor(() => scopedQueries.getAllByRole('option'));
    expect(options.length).toBeGreaterThan(1);

    fireEvent.keyDown(languageNameInput, { key: 'ArrowDown' });
    expect(options[0]?.getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(languageNameInput, { key: 'Enter' });
    expect(languageCodeInput.value).toBe('cmn');
  });

  it('does not navigate or commit suggestions beyond the rendered list', async () => {
    const view = renderWithLocale(<StatefulLanguageIsoInputHarness />, 'en-US');
    const scopedQueries = within(view.container);

    const languageNameInput = scopedQueries.getByRole('combobox', { name: 'Language name' }) as HTMLInputElement;
    const languageCodeInput = scopedQueries.getByRole('textbox', { name: 'Language code' }) as HTMLInputElement;

    fireEvent.change(languageNameInput, { target: { value: 'Chinese' } });

  const options = await waitFor(() => scopedQueries.getAllByRole('option'));
    expect(options.length).toBe(4);

    for (let index = 0; index < 6; index += 1) {
      fireEvent.keyDown(languageNameInput, { key: 'ArrowDown' });
    }

    const activeSuggestionId = languageNameInput.getAttribute('aria-activedescendant');
    const activeVisibleOption = options.find((option) => option.id === activeSuggestionId);

    expect(activeVisibleOption).toBeTruthy();
    expect(activeVisibleOption?.getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(languageNameInput, { key: 'Enter' });
    expect(languageCodeInput.value).toBe(extractIsoCodeFromSuggestion(activeVisibleOption!));
  });

  it('supports mouse selection from ambiguous suggestions', async () => {
    const view = renderWithLocale(<StatefulLanguageIsoInputHarness />, 'en-US');
    const scopedQueries = within(view.container);

    const languageNameInput = scopedQueries.getByRole('combobox', { name: 'Language name' });
    const languageCodeInput = scopedQueries.getByRole('textbox', { name: 'Language code' }) as HTMLInputElement;

    fireEvent.change(languageNameInput, { target: { value: 'Chinese' } });
    fireEvent.click((await waitFor(() => scopedQueries.getAllByRole('option')))[0]!);

    expect(languageCodeInput.value).toBe('cmn');
  });

  it('commits suggestion on mousedown to avoid click suppression in real browsers', async () => {
    const view = renderWithLocale(<StatefulLanguageIsoInputHarness />, 'en-US');
    const scopedQueries = within(view.container);

    const languageNameInput = scopedQueries.getByRole('combobox', { name: 'Language name' });
    const languageCodeInput = scopedQueries.getByRole('textbox', { name: 'Language code' }) as HTMLInputElement;

    fireEvent.change(languageNameInput, { target: { value: 'Chinese' } });
    fireEvent.mouseDown((await waitFor(() => scopedQueries.getAllByRole('option')))[0]!);

    expect(languageCodeInput.value).toBe('cmn');
  });

  it('clears the previous code before resolving a newly typed language name', async () => {
    const view = renderWithLocale(<PrefilledLanguageIsoInputHarness />, 'en-US');
    const scopedQueries = within(view.container);

    const languageNameInput = scopedQueries.getByRole('combobox', { name: 'Language name' });
    const languageCodeInput = scopedQueries.getByRole('textbox', { name: 'Language code' }) as HTMLInputElement;

    fireEvent.change(languageNameInput, { target: { value: 'P' } });
    expect(languageCodeInput.value).toBe('');

    fireEvent.change(languageNameInput, { target: { value: 'Portuguese' } });
    await waitFor(() => {
      expect(scopedQueries.getAllByRole('option').length).toBeGreaterThan(0);
    });
    expect(languageCodeInput.value).toBe('');
  });

  it('keeps a two-letter code draft until blur commits it', () => {
    const view = renderWithLocale(<StatefulLanguageIsoInputHarness />, 'en-US');
    const scopedQueries = within(view.container);

    const languageNameInput = scopedQueries.getByRole('combobox', { name: 'Language name' }) as HTMLInputElement;
    const languageCodeInput = scopedQueries.getByRole('textbox', { name: 'Language code' }) as HTMLInputElement;

    fireEvent.change(languageCodeInput, { target: { value: 'en' } });
    expect(languageCodeInput.value).toBe('en');
    expect(languageNameInput.value).toBe('');

    fireEvent.blur(languageCodeInput);
    expect(languageCodeInput.value).toBe('eng');
    expect(languageNameInput.value).toBe('English');
  });

  it('does not show code error while typing and only shows it after blur', async () => {
    const view = renderWithLocale(<StatefulLanguageIsoInputHarness locale="zh-CN" />, 'zh-CN');
    const scopedQueries = within(view.container);

    const languageCodeInput = scopedQueries.getByRole('textbox', { name: 'Language code' }) as HTMLInputElement;

    fireEvent.focus(languageCodeInput);
    fireEvent.change(languageCodeInput, { target: { value: 'e' } });
    expect(scopedQueries.queryByText('请输入有效的 ISO 639 / BCP 47 语言代码。')).toBeNull();

    fireEvent.change(languageCodeInput, { target: { value: '0' } });
    expect(scopedQueries.queryByText('请输入有效的 ISO 639 / BCP 47 语言代码。')).toBeNull();

    fireEvent.focusOut(languageCodeInput);
    await waitFor(() => {
      expect(scopedQueries.getByText('请输入有效的 ISO 639 / BCP 47 语言代码。')).toBeTruthy();
    });
  });

  it('relocalizes a committed value when the locale changes', () => {
    const view = renderWithLocale(
      <LanguageIsoInput
        locale="zh-CN"
        value={{ languageName: '英语', languageCode: 'eng' }}
        onChange={() => undefined}
        nameLabel="语言"
        codeLabel="语言代码"
        namePlaceholder="搜索语言"
        codePlaceholder="ISO 代码"
      />,
      'zh-CN',
    );

    expect((screen.getByRole('combobox', { name: '语言' }) as HTMLInputElement).value).toBe('英语 · English');

    view.rerender(
      <LanguageIsoInput
        locale="en-US"
        value={{ languageName: '英语', languageCode: 'eng' }}
        onChange={() => undefined}
        nameLabel="Language name"
        codeLabel="Language code"
        namePlaceholder="Search language"
        codePlaceholder="ISO code"
      />,
    );

    expect((screen.getByRole('combobox', { name: 'Language name' }) as HTMLInputElement).value).toBe('English');
  });

  it('uses an injected language display-name resolver when rehydrating from code', () => {
    renderWithLocale(
      <LanguageIsoInput
        locale="zh-CN"
        value={{ languageName: '英语', languageCode: 'eng' }}
        onChange={() => undefined}
        resolveLanguageDisplayName={resolveInjectedLanguageDisplayName}
        nameLabel="语言"
        codeLabel="语言代码"
        namePlaceholder="搜索语言"
        codePlaceholder="ISO 代码"
      />,
      'zh-CN',
    );

    expect((screen.getByRole('combobox', { name: '语言' }) as HTMLInputElement).value).toBe('英语资产标签 · English');
  });

  it('shows locale-first composite labels for code-driven selections after blur', () => {
    const view = renderWithLocale(<StatefulLanguageIsoInputHarness locale="zh-CN" />, 'zh-CN');
    const scopedQueries = within(view.container);

    const languageNameInput = scopedQueries.getByRole('combobox', { name: 'Language name' }) as HTMLInputElement;
    const languageCodeInput = scopedQueries.getByRole('textbox', { name: 'Language code' }) as HTMLInputElement;

    fireEvent.change(languageCodeInput, { target: { value: 'fra' } });

    // 验证代码输入后候选列表出现（option 角色） | Verify suggestion list appears after code input
    const options = scopedQueries.queryAllByRole('option');
    expect(options.length).toBeGreaterThan(0);

    fireEvent.blur(languageCodeInput);

    expect(languageNameInput.value).toBe('法语 · français · French');
  });

  it('shows input-first composite labels after the name field blurs', async () => {
    const view = renderWithLocale(<StatefulLanguageIsoInputHarness />, 'zh-CN');
    const scopedQueries = within(view.container);

    const languageNameInput = scopedQueries.getByRole('combobox', { name: 'Language name' }) as HTMLInputElement;

    fireEvent.focus(languageNameInput);
    fireEvent.change(languageNameInput, { target: { value: 'French' } });
    expect(languageNameInput.value).toBe('French');

    fireEvent.click((await waitFor(() => scopedQueries.getAllByRole('option')))[0]!);
    expect((scopedQueries.getByRole('textbox', { name: 'Language code' }) as HTMLInputElement).value).toBe('fra');

    fireEvent.blur(languageNameInput);
    expect(languageNameInput.value).toBe('french · français');
  });

  it('shows locale label before native when the hit came from an English name in a zh locale', async () => {
    const view = renderWithLocale(<StatefulLanguageIsoInputHarness locale="zh-CN" />, 'zh-CN');
    const scopedQueries = within(view.container);

    const languageNameInput = scopedQueries.getByRole('combobox', { name: 'Language name' }) as HTMLInputElement;

    fireEvent.focus(languageNameInput);
    fireEvent.change(languageNameInput, { target: { value: 'French' } });
    fireEvent.click((await waitFor(() => scopedQueries.getAllByRole('option')))[0]!);
    expect((scopedQueries.getByRole('textbox', { name: 'Language code' }) as HTMLInputElement).value).toBe('fra');
    fireEvent.blur(languageNameInput);

    expect(languageNameInput.value).toBe('french · 法语 · français');
  });

  it('shows locale label before English when the hit came from a native name in a zh locale', async () => {
    const view = renderWithLocale(<StatefulLanguageIsoInputHarness locale="zh-CN" />, 'zh-CN');
    const scopedQueries = within(view.container);

    const languageNameInput = scopedQueries.getByRole('combobox', { name: 'Language name' }) as HTMLInputElement;

    fireEvent.focus(languageNameInput);
    fireEvent.change(languageNameInput, { target: { value: 'français' } });
    fireEvent.click((await waitFor(() => scopedQueries.getAllByRole('option')))[0]!);
    expect((scopedQueries.getByRole('textbox', { name: 'Language code' }) as HTMLInputElement).value).toBe('fra');
    fireEvent.blur(languageNameInput);

    expect(languageNameInput.value).toBe('français · 法语 · French');
  });

  it('ignores stale async suggestion responses when an older search resolves last', async () => {
    vi.useFakeTimers();

    let resolveFrench: ((value: Awaited<ReturnType<typeof mockSearchLanguageCatalogSuggestions>>) => void) | null = null;
    let resolveGerman: ((value: Awaited<ReturnType<typeof mockSearchLanguageCatalogSuggestions>>) => void) | null = null;
    mockSearchLanguageCatalogSuggestions.mockImplementation(({ query, locale, limit = 5 }: { query: string; locale: 'zh-CN' | 'en-US'; limit?: number }) => {
      const suggestions = searchLanguageCatalog(query, locale, limit).map((match) => ({
        id: match.entry.languageId,
        languageCode: match.entry.iso6393,
        primaryLabel: match.matchedLabel,
        matchedLabel: match.matchedLabel,
        matchedLabelKind: match.matchedLabelKind,
        matchSource: mapMatchSource(match.matchSource, match.matchedLabelKind),
        rank: match.score,
        hasRuntimeOverride: false,
      }));

      return new Promise((resolve) => {
        if (query === 'French') {
          resolveFrench = resolve;
          return;
        }
        if (query === 'German') {
          resolveGerman = resolve;
          return;
        }
        resolve(suggestions);
      });
    });

    const view = renderWithLocale(<StatefulLanguageIsoInputHarness />, 'en-US');
    const scopedQueries = within(view.container);
    const languageNameInput = scopedQueries.getByRole('combobox', { name: 'Language name' }) as HTMLInputElement;
    const languageCodeInput = scopedQueries.getByRole('textbox', { name: 'Language code' }) as HTMLInputElement;

    fireEvent.change(languageNameInput, { target: { value: 'French' } });
    await act(async () => {
      vi.advanceTimersByTime(120);
      await Promise.resolve();
    });

    fireEvent.change(languageNameInput, { target: { value: 'German' } });
    await act(async () => {
      vi.advanceTimersByTime(120);
      await Promise.resolve();
    });

    expect(resolveFrench).toBeTypeOf('function');
    expect(resolveGerman).toBeTypeOf('function');

    await act(async () => {
      resolveFrench?.(searchLanguageCatalog('French', 'en-US', 5).map((match) => ({
        id: match.entry.languageId,
        languageCode: match.entry.iso6393,
        primaryLabel: match.matchedLabel,
        matchedLabel: match.matchedLabel,
        matchedLabelKind: match.matchedLabelKind,
        matchSource: mapMatchSource(match.matchSource, match.matchedLabelKind),
        rank: match.score,
        hasRuntimeOverride: false,
      })));
      await Promise.resolve();
    });

    expect(languageNameInput.value).toBe('German');
    expect(languageCodeInput.value).toBe('');

    await act(async () => {
      resolveGerman?.(searchLanguageCatalog('German', 'en-US', 5).map((match) => ({
        id: match.entry.languageId,
        languageCode: match.entry.iso6393,
        primaryLabel: match.matchedLabel,
        matchedLabel: match.matchedLabel,
        matchedLabelKind: match.matchedLabelKind,
        matchSource: mapMatchSource(match.matchSource, match.matchedLabelKind),
        rank: match.score,
        hasRuntimeOverride: false,
      })));
      await Promise.resolve();
    });

    expect(languageNameInput.value).toBe('German');
    expect(languageCodeInput.value).toBe('');
  });
});