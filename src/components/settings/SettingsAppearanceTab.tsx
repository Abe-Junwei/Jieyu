import { useCallback, useMemo } from 'react';
import { OptionGroup, SettingRow, SettingsSection } from '../settingsModalPrimitives';
import type { SettingsModalMessages } from '../../i18n/messages';
import type { ThemeMode } from './settingsConstants';
import type { UiFontScaleMode } from '../../utils/panelAdaptiveLayout';
import type { IconEffect } from '../../utils/iconEffect';
import type { Locale } from '../../i18n';

interface SettingsAppearanceTabProps {
  /** Reserved for future locale-specific appearance copy; unused after One-Voice cut. */
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
  locale: _locale,
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
  void _locale;
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
