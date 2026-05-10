import { useCallback } from 'react';

import { tf, type DictKey, type Locale } from '../i18n';

/**
 * Pre-bound `tf` for call sites that should not thread `locale` through every layer.
 * 引用须在 `locale` 不变时保持稳定，否则依赖该函数的 effect（如 Toast / deep-link）会重复触发。
 */
export function useLocaleBoundTf(
  locale: Locale,
): (key: string, opts?: Record<string, unknown>) => string {
  return useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      tf(locale, key as DictKey, (opts ?? {}) as Record<string, string | number>),
    [locale],
  );
}
