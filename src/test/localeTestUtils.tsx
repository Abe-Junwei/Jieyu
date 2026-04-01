// @vitest-environment jsdom

import React from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { LocaleProvider, type Locale } from '../i18n';

export function createLocaleWrapper(locale: Locale = 'zh-CN') {
  return function LocaleWrapper({ children }: { children: React.ReactNode }) {
    return <LocaleProvider locale={locale}>{children}</LocaleProvider>;
  };
}

export function renderWithLocale(
  element: React.ReactElement,
  locale: Locale = 'zh-CN',
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  return render(element, { wrapper: createLocaleWrapper(locale), ...options });
}