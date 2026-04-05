// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { renderWithLocale } from '../test/localeTestUtils';
import { LanguageIsoInput, type LanguageIsoInputValue } from './LanguageIsoInput';

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

afterEach(() => {
  cleanup();
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

    const listbox = scopedQueries.getByRole('listbox', { name: 'Language name' });
    const options = scopedQueries.getAllByRole('option');

    expect(languageNameInput.getAttribute('aria-autocomplete')).toBe('list');
    expect(languageNameInput.getAttribute('aria-controls')).toBe(listbox.id);
    expect(languageNameInput.getAttribute('aria-expanded')).toBe('true');
    expect(options.length).toBeGreaterThan(1);
  });

  it('supports explicit keyboard selection from ambiguous suggestions', () => {
    const view = renderWithLocale(<StatefulLanguageIsoInputHarness />, 'en-US');
    const scopedQueries = within(view.container);

    const languageNameInput = scopedQueries.getByRole('combobox', { name: 'Language name' });
    const languageCodeInput = scopedQueries.getByRole('textbox', { name: 'Language code' }) as HTMLInputElement;

    fireEvent.change(languageNameInput, { target: { value: 'Chinese' } });

    const options = scopedQueries.getAllByRole('option');
    expect(options.length).toBeGreaterThan(1);

    fireEvent.keyDown(languageNameInput, { key: 'ArrowDown' });
    expect(options[0]?.getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(languageNameInput, { key: 'Enter' });
    expect(languageCodeInput.value).toBe('cmn');
  });

  it('does not navigate or commit suggestions beyond the rendered list', () => {
    const view = renderWithLocale(<StatefulLanguageIsoInputHarness />, 'en-US');
    const scopedQueries = within(view.container);

    const languageNameInput = scopedQueries.getByRole('combobox', { name: 'Language name' }) as HTMLInputElement;
    const languageCodeInput = scopedQueries.getByRole('textbox', { name: 'Language code' }) as HTMLInputElement;

    fireEvent.change(languageNameInput, { target: { value: 'Chinese' } });

    const options = scopedQueries.getAllByRole('option');
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

  it('supports mouse selection from ambiguous suggestions', () => {
    const view = renderWithLocale(<StatefulLanguageIsoInputHarness />, 'en-US');
    const scopedQueries = within(view.container);

    const languageNameInput = scopedQueries.getByRole('combobox', { name: 'Language name' });
    const languageCodeInput = scopedQueries.getByRole('textbox', { name: 'Language code' }) as HTMLInputElement;

    fireEvent.change(languageNameInput, { target: { value: 'Chinese' } });
    fireEvent.click(scopedQueries.getAllByRole('option')[0]!);

    expect(languageCodeInput.value).toBe('cmn');
  });

  it('clears the previous code before resolving a newly typed language name', () => {
    const view = renderWithLocale(<PrefilledLanguageIsoInputHarness />, 'en-US');
    const scopedQueries = within(view.container);

    const languageNameInput = scopedQueries.getByRole('combobox', { name: 'Language name' });
    const languageCodeInput = scopedQueries.getByRole('textbox', { name: 'Language code' }) as HTMLInputElement;

    fireEvent.change(languageNameInput, { target: { value: 'P' } });
    expect(languageCodeInput.value).toBe('');

    fireEvent.change(languageNameInput, { target: { value: 'Portuguese' } });
    expect(languageCodeInput.value).toBe('por');
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
    fireEvent.blur(languageCodeInput);

    expect(languageNameInput.value).toBe('法语 · français · French');
  });

  it('shows input-first composite labels after the name field blurs', () => {
    const view = renderWithLocale(<StatefulLanguageIsoInputHarness />, 'zh-CN');
    const scopedQueries = within(view.container);

    const languageNameInput = scopedQueries.getByRole('combobox', { name: 'Language name' }) as HTMLInputElement;

    fireEvent.focus(languageNameInput);
    fireEvent.change(languageNameInput, { target: { value: 'French' } });
    expect(languageNameInput.value).toBe('French');

    fireEvent.blur(languageNameInput);
    expect(languageNameInput.value).toBe('French · français');
  });

  it('shows locale label before native when the hit came from an English name in a zh locale', () => {
    const view = renderWithLocale(<StatefulLanguageIsoInputHarness locale="zh-CN" />, 'zh-CN');
    const scopedQueries = within(view.container);

    const languageNameInput = scopedQueries.getByRole('combobox', { name: 'Language name' }) as HTMLInputElement;

    fireEvent.focus(languageNameInput);
    fireEvent.change(languageNameInput, { target: { value: 'French' } });
    fireEvent.blur(languageNameInput);

    expect(languageNameInput.value).toBe('French · 法语 · français');
  });

  it('shows locale label before English when the hit came from a native name in a zh locale', () => {
    const view = renderWithLocale(<StatefulLanguageIsoInputHarness locale="zh-CN" />, 'zh-CN');
    const scopedQueries = within(view.container);

    const languageNameInput = scopedQueries.getByRole('combobox', { name: 'Language name' }) as HTMLInputElement;

    fireEvent.focus(languageNameInput);
    fireEvent.change(languageNameInput, { target: { value: 'français' } });
    fireEvent.blur(languageNameInput);

    expect(languageNameInput.value).toBe('français · 法语 · French');
  });
});