import { useState, useCallback, useMemo } from 'react';
import { OptionGroup, SettingRow, SettingsSection } from '../settingsModalPrimitives';
import {
  THEME_ACCENTS,
  THEMES,
  getTheme,
  getThemeAccent,
  setAppearance,
  setThemeAccent,
  themeIdToPreviewClassSlug,
  type ThemeAccentId,
  type ThemeId,
} from '../../utils/theme';
import type { SettingsModalMessages } from '../../i18n/messages';
import type { ThemeMode } from './settingsConstants';
import type { UiFontScaleMode } from '../../utils/panelAdaptiveLayout';
import type { IconEffect } from '../../utils/iconEffect';
import type { Locale } from '../../i18n';

interface SettingsAppearanceTabProps {
  locale: Locale;
  themeMode: ThemeMode;
  fontScale: number;
  fontScaleMode: UiFontScaleMode;
  iconEffect: IconEffect;
  onThemeChange: (mode: ThemeMode) => void;
  onFontScaleModeChange: (mode: UiFontScaleMode) => void;
  onIconEffectChange: (effect: IconEffect) => void;
  onFontScaleChange: (scale: number) => void;
  msg: SettingsModalMessages;
}

export function SettingsAppearanceTab({
  locale,
  themeMode,
  fontScale,
  fontScaleMode,
  iconEffect,
  onThemeChange,
  onFontScaleModeChange,
  onIconEffectChange,
  onFontScaleChange,
  msg,
}: SettingsAppearanceTabProps) {
  const [activeTheme, setActiveTheme] = useState<ThemeId>(() => getTheme());
  const [activeThemeAccent, setActiveThemeAccent] = useState<ThemeAccentId>(() => getThemeAccent());

  const handleThemeChange = useCallback((themeId: ThemeId) => {
    setActiveTheme(themeId);
    setAppearance(themeId);
  }, []);

  const handleThemeAccentChange = useCallback((accentId: ThemeAccentId) => {
    setActiveThemeAccent(accentId);
    setThemeAccent(accentId);
  }, []);

  const resolvedMode: 'light' | 'dark' =
    themeMode === 'dark'
      ? 'dark'
      : themeMode === 'light'
        ? 'light'
        : typeof window !== 'undefined' &&
            window.matchMedia?.('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';

  const themeOptions = useMemo(
    () => [
      { value: 'light' as const, label: msg.themeLight },
      { value: 'dark' as const, label: msg.themeDark },
      { value: 'system' as const, label: msg.themeSystem },
    ],
    [msg],
  );

  const fontScaleModeOptions = useMemo(
    () => [
      { value: 'auto' as const, label: msg.fontScaleModeAuto },
      { value: 'manual' as const, label: msg.fontScaleModeManual },
    ],
    [msg],
  );

  const iconEffectOptions = useMemo(
    () => [
      { value: 'material' as const, label: msg.iconEffectMaterial },
      { value: 'motion' as const, label: msg.iconEffectMotion },
    ],
    [msg],
  );

  const handleFontScaleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onFontScaleModeChange('manual');
      onFontScaleChange(Number(e.target.value));
    },
    [onFontScaleChange, onFontScaleModeChange],
  );

  const handleFontScaleReset = useCallback(() => {
    onFontScaleModeChange('auto');
  }, [onFontScaleModeChange]);

  return (
    <div className="settings-sections-stack">
      <SettingsSection title={msg.themeLabel}>
        <OptionGroup value={themeMode} options={themeOptions} onChange={onThemeChange} />
      </SettingsSection>

      <SettingsSection title="\u914d\u8272\u65b9\u6848">
        <div className="theme-grid">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              className={`theme-card${activeTheme === theme.id ? ' theme-card-active' : ''}`}
              onClick={() => handleThemeChange(theme.id)}
            >
              <div
                className={`theme-card-preview theme-card-preview-mode-${resolvedMode} theme-card-preview-theme-${themeIdToPreviewClassSlug(theme.id)}`}
              >
                <span className="theme-card-swatch-accent" />
                <span className="theme-card-swatch-bg" />
              </div>
              <div className="theme-card-info">
                <span className="theme-card-name">{theme.name}</span>
                <span className="theme-card-subtitle">{theme.subtitle}</span>
              </div>
            </button>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title={msg.themeAccentLabel}>
        <div className="theme-accent-grid" role="radiogroup" aria-label={msg.themeAccentLabel}>
          {THEME_ACCENTS.map((accent) => {
            const label = locale === 'zh-CN' ? accent.labelZh : accent.labelEn;
            const isActive = activeThemeAccent === accent.id;
            const swatchColor = resolvedMode === 'dark' ? accent.swatchDark : accent.swatchLight;
            const swatchStyleProps = {
              style: { ['--theme-accent-chip-color' as string]: swatchColor },
            };
            return (
              <button
                key={accent.id}
                type="button"
                role="radio"
                aria-checked={isActive}
                className={`theme-accent-chip${isActive ? ' theme-accent-chip-active' : ''}`}
                onClick={() => handleThemeAccentChange(accent.id)}
                title={label}
              >
                <span
                  className={`theme-accent-chip-swatch${accent.id === 'default' ? ' theme-accent-chip-swatch-default' : ''}`}
                  {...swatchStyleProps}
                  aria-hidden="true"
                />
                <span className="theme-accent-chip-label">{label}</span>
              </button>
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection title={msg.fontScaleLabel}>
        <SettingRow label={msg.fontScaleModeLabel}>
          <OptionGroup
            value={fontScaleMode}
            options={fontScaleModeOptions}
            onChange={onFontScaleModeChange}
          />
        </SettingRow>
        <div className="settings-font-scale-row">
          <input
            type="range"
            className="settings-font-scale-slider"
            aria-label={msg.fontScaleLabel}
            min={0.85}
            max={1.4}
            step={0.05}
            value={fontScale}
            onChange={handleFontScaleInput}
            disabled={fontScaleMode === 'auto'}
          />
          <span className="settings-font-scale-value">{Math.round(fontScale * 100)}%</span>
          {fontScaleMode !== 'auto' && (
            <button
              type="button"
              className="settings-font-scale-reset-btn"
              onClick={handleFontScaleReset}
            >
              {msg.fontScaleReset}
            </button>
          )}
        </div>
      </SettingsSection>

      <SettingsSection title={msg.iconEffectTitle}>
        <OptionGroup value={iconEffect} options={iconEffectOptions} onChange={onIconEffectChange} />
        <p className="small-text settings-icon-effect-hint">{msg.iconEffectHint}</p>
      </SettingsSection>
    </div>
  );
}
