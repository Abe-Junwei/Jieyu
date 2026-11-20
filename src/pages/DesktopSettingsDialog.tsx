import { useMemo } from 'react';
import { ModalPanel } from '../components/ui/ModalPanel';
import { SettingsAppearanceTab } from '../components/settings/SettingsAppearanceTab';
import { SettingsLanguageTab } from '../components/settings/SettingsLanguageTab';
import { getSettingsModalMessages } from '../i18n/messages';
import type { Locale } from '../i18n';
import type { ThemeMode } from '../components/settings/settingsConstants';
import type { UiFontScaleMode } from '../utils/panelAdaptiveLayout';
import '../styles/panels/settings-modal.css';

export function DesktopSettingsDialog(props: {
  isOpen: boolean;
  onClose: () => void;
  locale: Locale;
  themeMode: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  onLocaleChange: (locale: Locale) => void | Promise<void>;
  fontScale: number;
  fontScaleMode: UiFontScaleMode;
  onFontScaleChange: (scale: number) => void;
  onFontScaleModeChange: (mode: UiFontScaleMode) => void;
}) {
  const msg = getSettingsModalMessages(props.locale);
  const localeOptions = useMemo(
    () => [
      { value: 'zh-CN' as const, label: msg.localeChinese },
      { value: 'en-US' as const, label: msg.localeEnglish },
    ],
    [msg],
  );

  return (
    <ModalPanel
      isOpen={props.isOpen}
      onClose={props.onClose}
      topmost
      className="pnl-settings-modal panel-design-match panel-design-match-dialog"
      ariaLabel={msg.title}
      title={msg.title}
    >
      <SettingsAppearanceTab
        themeMode={props.themeMode}
        fontScale={props.fontScale}
        fontScaleMode={props.fontScaleMode}
        onThemeChange={props.onThemeChange}
        onFontScaleChange={props.onFontScaleChange}
        onFontScaleModeChange={props.onFontScaleModeChange}
        msg={msg}
      />
      <SettingsLanguageTab
        locale={props.locale}
        localeOptions={localeOptions}
        onLocaleChange={props.onLocaleChange}
        msg={msg}
      />
    </ModalPanel>
  );
}
