import { useCallback, useMemo } from 'react';
import { OptionGroup, SettingRow, SettingsSection } from '../settingsModalPrimitives';
import type { SettingsModalMessages } from '../../i18n/messages';
import type { ThemeMode } from './settingsConstants';
import type { UiFontScaleMode } from '../../utils/panelAdaptiveLayout';

interface SettingsAppearanceTabProps {
  themeMode: ThemeMode;
  fontScale: number;
  fontScaleMode: UiFontScaleMode;
  onThemeChange: (mode: ThemeMode) => void;
  onFontScaleModeChange: (mode: UiFontScaleMode) => void;
  onFontScaleChange: (scale: number) => void;
  msg: SettingsModalMessages;
}

export function SettingsAppearanceTab({
  themeMode,
  fontScale,
  fontScaleMode,
  onThemeChange,
  onFontScaleModeChange,
  onFontScaleChange,
  msg,
}: SettingsAppearanceTabProps) {
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
    </div>
  );
}
