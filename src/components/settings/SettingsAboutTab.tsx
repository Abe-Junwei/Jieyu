import { SettingsSection } from '../settingsModalPrimitives';
import type { SettingsModalMessages } from '../../i18n/messages';

interface SettingsAboutTabProps {
  version?: string | undefined;
  msg: SettingsModalMessages;
}

export function SettingsAboutTab({ version, msg }: SettingsAboutTabProps) {
  return (
    <div className="settings-sections-stack">
      <SettingsSection title={msg.tabAbout}>
        <div className="settings-about-section">
          <span className="settings-about-name">Jieyu</span>
          <p className="settings-about-desc">{msg.aboutDescription}</p>
          {version && (
            <div className="settings-about-row">
              <strong>{msg.aboutVersion}:</strong>
              <span>{version}</span>
            </div>
          )}
          <div className="settings-about-browser-support">
            <strong className="settings-about-browser-support-title">
              {msg.aboutBrowserSupportTitle}
            </strong>
            <p className="settings-about-desc settings-about-browser-support-body">
              {msg.aboutBrowserSupportBody}
            </p>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
