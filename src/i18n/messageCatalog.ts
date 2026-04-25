import type { DictKey, Locale } from './index';
import { t } from './index';

const MESSAGE_CATALOG_CACHE_GLOBAL_KEY = '__JIEYU_MESSAGE_CATALOG_CACHE__';

function getCatalogCache(): Map<string, unknown> {
  const globalValue = globalThis as typeof globalThis & {
    [MESSAGE_CATALOG_CACHE_GLOBAL_KEY]?: Map<string, unknown>;
  };
  const existing = globalValue[MESSAGE_CATALOG_CACHE_GLOBAL_KEY];
  if (existing instanceof Map) {
    return existing;
  }
  const created = new Map<string, unknown>();
  globalValue[MESSAGE_CATALOG_CACHE_GLOBAL_KEY] = created;
  return created;
}

const catalogCache = getCatalogCache();

export function readMessageCatalog<T>(locale: Locale, key: DictKey): T {
  const cacheKey = `${locale}:${key}`;
  const cached = catalogCache.get(cacheKey);
  if (cached) {
    return cached as T;
  }
  const rawCatalog = t(locale, key);
  try {
    const parsed = JSON.parse(rawCatalog) as T;
    catalogCache.set(cacheKey, parsed);
    catalogCache.set(`*:${key}`, parsed);
    return parsed;
  } catch (error) {
    const crossLocaleCached = catalogCache.get(`*:${key}`);
    if (crossLocaleCached) {
      catalogCache.set(cacheKey, crossLocaleCached);
      return crossLocaleCached as T;
    }
    if (import.meta.env.DEV) {
      console.warn(`[i18n] readMessageCatalog(): fallback to empty catalog for key "${String(key)}".`, {
        locale,
        rawCatalog,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    const empty = {} as T;
    catalogCache.set(cacheKey, empty);
    return empty;
  }
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
