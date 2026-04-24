import { createContext, createElement, useContext, type ReactNode } from 'react';

import { DICT_KEYS, type DictKey } from './dictKeys';

export type Locale = 'zh-CN' | 'en-US';

export const LOCALE_PREFERENCE_STORAGE_KEY = 'jieyu.locale';

const LocaleContext = createContext<Locale | null>(null);

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return createElement(LocaleContext.Provider, { value: locale }, children);
}

export function useOptionalLocale(): Locale | null {
  return useContext(LocaleContext);
}

export function useLocale(): Locale {
  return useOptionalLocale() ?? detectLocale();
}

export { DICT_KEYS, type DictKey };

let zhCNDictionary: Record<DictKey, string> | null = null;
let zhCNInflight: Promise<void> | null = null;

let enUSDictionary: Record<DictKey, string> | null = null;
let enUSInflight: Promise<void> | null = null;

async function ensureZhCNDictionaryLoaded(): Promise<void> {
  if (zhCNDictionary) {
    return;
  }
  if (!zhCNInflight) {
    zhCNInflight = import('./dictionaries/zh-CN').then((m) => {
      zhCNDictionary = m.zhCNDictionary as Record<DictKey, string>;
    });
  }
  await zhCNInflight;
}

/**
 * B-1：`zh-CN` / `en-US` 词表均为异步 chunk；`en-US` 会先拉取 `zh-CN` 作为 `t()` 回退串。
 * `main.tsx` 在首屏 `createRoot` 前会 `await` 当前 `detectLocale()`；切换语言时由 `App` 再次调用。
 */
export async function preloadLocaleDictionary(locale: Locale): Promise<void> {
  if (locale === 'zh-CN') {
    await ensureZhCNDictionaryLoaded();
    return;
  }
  if (locale === 'en-US') {
    await ensureZhCNDictionaryLoaded();
    if (enUSDictionary) {
      return;
    }
    if (!enUSInflight) {
      enUSInflight = import('./dictionaries/en-US').then((m) => {
        enUSDictionary = m.enUSDictionary as Record<DictKey, string>;
      });
    }
    await enUSInflight;
  }
}

export const dictionaries: Record<Locale, Record<DictKey, string>> = {
  get 'zh-CN'(): Record<DictKey, string> {
    return zhCNDictionary ?? ({} as Record<DictKey, string>);
  },
  get 'en-US'(): Record<DictKey, string> {
    return enUSDictionary ?? zhCNDictionary ?? ({} as Record<DictKey, string>);
  },
};

export function normalizeLocale(input: string | null | undefined): Locale | null {
  const normalized = input?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.startsWith('zh')) return 'zh-CN';
  if (normalized.startsWith('en')) return 'en-US';
  return null;
}

export function getStoredLocalePreference(): Locale | null {
  if (typeof window === 'undefined') return null;

  try {
    return normalizeLocale(window.localStorage.getItem(LOCALE_PREFERENCE_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function setStoredLocalePreference(locale: Locale): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(LOCALE_PREFERENCE_STORAGE_KEY, locale);
  } catch {
    // 忽略偏好写入失败，仍允许使用内存态 locale | Ignore persistence failures and keep in-memory locale working
  }
}

export function clearStoredLocalePreference(): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(LOCALE_PREFERENCE_STORAGE_KEY);
  } catch {
    // 忽略偏好删除失败 | Ignore preference deletion failures
  }
}

export function detectLocale(): Locale {
  const stored = getStoredLocalePreference();
  if (stored) return stored;

  if (typeof navigator === 'undefined') return 'zh-CN';

  return normalizeLocale(navigator.language) ?? 'zh-CN';
}

export function t(locale: Locale, key: DictKey): string {
  const zh = zhCNDictionary;
  if (locale === 'zh-CN') {
    return zh?.[key] ?? key;
  }
  const en = enUSDictionary;
  if (en) {
    return en[key] ?? zh?.[key] ?? key;
  }
  return zh?.[key] ?? key;
}

export function isDictKey(value: string): value is DictKey {
  return (DICT_KEYS as readonly string[]).includes(value);
}

export function tf(
  locale: Locale,
  key: DictKey,
  params: Record<string, string | number>,
): string {
  const template = t(locale, key);
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined) {
      if (import.meta.env.DEV) {
        console.warn(
          `[i18n] tf(): missing template param "{${name}}" for dict key "${String(key)}"`,
          { locale },
        );
      }
      return `[i18n missing: ${name}]`;
    }
    return String(value);
  });
}
