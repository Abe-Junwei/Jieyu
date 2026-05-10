// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Locale } from '../i18n';
import { useLocaleBoundTf } from './useLocaleBoundTf';

describe('useLocaleBoundTf', () => {
  it('keeps the same callback identity when locale is unchanged across rerenders', () => {
    const { result, rerender } = renderHook(
      ({ locale }: { locale: Locale }) => useLocaleBoundTf(locale),
      { initialProps: { locale: 'zh-CN' as Locale } },
    );
    const first = result.current;
    rerender({ locale: 'zh-CN' as Locale });
    expect(result.current).toBe(first);
  });

  it('changes callback identity when locale changes', () => {
    const { result, rerender } = renderHook(
      ({ locale }: { locale: Locale }) => useLocaleBoundTf(locale),
      { initialProps: { locale: 'zh-CN' as Locale } },
    );
    const first = result.current;
    rerender({ locale: 'en-US' as Locale });
    expect(result.current).not.toBe(first);
  });
});
