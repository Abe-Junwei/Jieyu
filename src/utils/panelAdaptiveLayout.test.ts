// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  computeAdaptivePanelWidth,
  computeAutoUiFontScale,
  normalizeUiFontScale,
  persistUiFontScalePreference,
  readPersistedUiFontScalePreference,
  resolveEffectiveUiFontScale,
  resolveTextDirectionFromLocale,
  UI_FONT_SCALE_LIMITS,
} from './panelAdaptiveLayout';

afterEach(() => {
  window.localStorage.clear();
});

describe('panelAdaptiveLayout', () => {
  it('resolves rtl locales to rtl direction', () => {
    expect(resolveTextDirectionFromLocale('ar')).toBe('rtl');
    expect(resolveTextDirectionFromLocale('fa-IR')).toBe('rtl');
    expect(resolveTextDirectionFromLocale('ur-PK')).toBe('rtl');
  });

  it('keeps common ltr locales as ltr', () => {
    expect(resolveTextDirectionFromLocale('zh-CN')).toBe('ltr');
    expect(resolveTextDirectionFromLocale('en-US')).toBe('ltr');
  });

  it('produces wider suggestion for rtl than ltr under same inputs', () => {
    const ltr = computeAdaptivePanelWidth({
      baseWidth: 360,
      locale: 'en-US',
      direction: 'ltr',
      uiFontScale: 1,
      minWidth: 280,
      maxWidth: 900,
    });
    const rtl = computeAdaptivePanelWidth({
      baseWidth: 360,
      locale: 'ar',
      direction: 'rtl',
      uiFontScale: 1,
      minWidth: 280,
      maxWidth: 900,
    });
    expect(rtl).toBeGreaterThan(ltr);
  });

  it('respects min and max constraints', () => {
    const tooSmall = computeAdaptivePanelWidth({
      baseWidth: 120,
      locale: 'en-US',
      uiFontScale: 0.6,
      minWidth: 300,
      maxWidth: 600,
    });
    const tooLarge = computeAdaptivePanelWidth({
      baseWidth: 1400,
      locale: 'en-US',
      uiFontScale: 2,
      minWidth: 300,
      maxWidth: 600,
    });
    expect(tooSmall).toBe(300);
    expect(tooLarge).toBe(600);
  });

  it('normalizes ui font scale to supported range', () => {
    expect(normalizeUiFontScale(0.5)).toBe(0.85);
    expect(normalizeUiFontScale(1.8)).toBe(1.4);
    expect(normalizeUiFontScale(1.1)).toBe(1.1);
  });

  it('uses auto mode by default and keeps fallback manual scale', () => {
    const preference = readPersistedUiFontScalePreference();
    expect(preference.mode).toBe('auto');
    expect(preference.manualScale).toBe(UI_FONT_SCALE_LIMITS.fallback);
  });

  it('migrates legacy numeric storage into manual mode', () => {
    window.localStorage.setItem(UI_FONT_SCALE_LIMITS.storageKey, '1.2');
    const preference = readPersistedUiFontScalePreference();
    expect(preference.mode).toBe('manual');
    expect(preference.manualScale).toBe(1.2);
  });

  it('resolves effective scale from mode state', () => {
    const auto = resolveEffectiveUiFontScale({ mode: 'auto', manualScale: 1.18 }, 1.03);
    const manual = resolveEffectiveUiFontScale({ mode: 'manual', manualScale: 1.18 }, 1.03);
    expect(auto).toBe(1.03);
    expect(manual).toBe(1.18);
  });

  it('persists auto/manual preference payload as json object', () => {
    persistUiFontScalePreference({ mode: 'manual', manualScale: 1.25 });
    const raw = window.localStorage.getItem(UI_FONT_SCALE_LIMITS.storageKey);
    expect(raw).toContain('"mode":"manual"');
  });

  it('computes larger auto scale for rtl locale than ltr locale', () => {
    const ltrAuto = computeAutoUiFontScale('en-US', 'ltr');
    const rtlAuto = computeAutoUiFontScale('ar', 'rtl');
    expect(rtlAuto).toBeGreaterThan(ltrAuto);
  });
});
