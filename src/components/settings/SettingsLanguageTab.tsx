import { OptionGroup, SettingsSection } from '../settingsModalPrimitives';
import type { SettingsModalMessages } from '../../i18n/messages';
import type { Locale } from '../../i18n';

interface SettingsLanguageTabProps {
  locale: Locale;
  localeOptions: Array<{ value: Locale; label: string }>;
  onLocaleChange: (locale: Locale) => void | Promise<void>;
  msg: SettingsModalMessages;
}

export function SettingsLanguageTab({
  locale,
  localeOptions,
  onLocaleChange,
  msg,
}: SettingsLanguageTabProps) {
  return (
    <div className="settings-sections-stack">
      <SettingsSection title={msg.localeLabel}>
        <OptionGroup value={locale} options={localeOptions} onChange={onLocaleChange} />
      </SettingsSection>
    </div>
  );
}
