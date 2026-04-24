import type { DictKey, Locale } from './index';
import { t } from './index';

const catalogCache = new Map<string, unknown>();

export function readMessageCatalog<T>(locale: Locale, key: DictKey): T {
  const cacheKey = `${locale}:${key}`;
  const cached = catalogCache.get(cacheKey);
  if (cached) {
    return cached as T;
  }
  const parsed = JSON.parse(t(locale, key)) as T;
  catalogCache.set(cacheKey, parsed);
  return parsed;
}

export function formatCatalogTemplate(
  template: string,
  params: Record<string, string | number>,
): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, name: string) => {
    const value = params[name];
    return value === undefined ? `[i18n missing: ${name}]` : String(value);
  });
}
