/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initTheme, syncDocumentDataTheme, THEME_MODE_STORAGE_KEY } from './theme';

describe('theme (One Voice)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-appearance');
    document.documentElement.removeAttribute('data-theme-accent');
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-appearance');
    document.documentElement.removeAttribute('data-theme-accent');
  });

  it('clears legacy appearance / accent keys and DOM attrs on init', () => {
    localStorage.setItem('jieyu-appearance', 'mogao');
    localStorage.setItem('jieyu-theme-accent', 'blue');
    document.documentElement.setAttribute('data-appearance', 'mogao');
    document.documentElement.setAttribute('data-theme-accent', 'blue');

    initTheme();

    expect(localStorage.getItem('jieyu-appearance')).toBeNull();
    expect(localStorage.getItem('jieyu-theme-accent')).toBeNull();
    expect(document.documentElement.getAttribute('data-appearance')).toBeNull();
    expect(document.documentElement.getAttribute('data-theme-accent')).toBeNull();
  });

  it('keeps jieyu-theme preference and applies dark attribute', () => {
    localStorage.setItem(THEME_MODE_STORAGE_KEY, 'dark');
    const result = initTheme();
    expect(result.mode).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(THEME_MODE_STORAGE_KEY)).toBe('dark');
  });

  it('syncDocumentDataTheme maps light preference to no data-theme', () => {
    localStorage.setItem(THEME_MODE_STORAGE_KEY, 'light');
    document.documentElement.setAttribute('data-theme', 'dark');
    syncDocumentDataTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
  });
});
