/**
 * 设置面板 | Settings Modal
 *
 * 统一设置入口：外观、快捷键、AI、播放、数据、关于。
 * Unified settings: Appearance, Shortcuts, AI, Playback, Data, About.
 */
import '../styles/panels/settings-modal.css';

export type { SettingsModalProps } from './settings/settingsConstants';
import { useState, useMemo, useId, memo } from 'react';
import { type SettingsModalProps } from './settings/settingsConstants';
import { getSettingsModalMessages } from '../i18n/messages';
import { getShortcutsPanelMessages } from '../i18n/messages';
import { getAppDataResilienceMessages } from '../i18n/messages';
import { resolveTextDirectionFromLocale } from '../utils/panelAdaptiveLayout';
import { ModalPanel } from './ui';
import { SettingsTabBar } from './settingsModalPrimitives';
import { SettingsAppearanceTab } from './settings/SettingsAppearanceTab';
import { SettingsLanguageTab } from './settings/SettingsLanguageTab';
import { SettingsShortcutsTab } from './settings/SettingsShortcutsTab';
import { SettingsAiTab } from './settings/SettingsAiTab';
import { SettingsPlaybackTab } from './settings/SettingsPlaybackTab';
import { SettingsDataTab } from './settings/SettingsDataTab';
import { SettingsAboutTab } from './settings/SettingsAboutTab';

type SettingsTab = 'appearance' | 'language' | 'shortcuts' | 'ai' | 'playback' | 'data' | 'about';

export const SettingsModal = memo(function SettingsModal({
  isOpen,
  onClose,
  locale,
  themeMode,
  onThemeChange,
  onLocaleChange,
  fontScale,
  fontScaleMode,
  onFontScaleChange,
  onFontScaleModeChange,
  iconEffect,
  onIconEffectChange,
  version,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');
  const tabIdPrefix = useId();
  const msg = getSettingsModalMessages(locale);
  const shortcutsMsg = getShortcutsPanelMessages(locale);
  const resilienceMsg = useMemo(() => getAppDataResilienceMessages(locale), [locale]);
  const settingsShellTextDirection = useMemo(
    () => resolveTextDirectionFromLocale(locale),
    [locale],
  );

  const tabs = useMemo(
    () => [
      { id: 'appearance' as const, label: msg.tabAppearance },
      { id: 'language' as const, label: msg.tabLanguage },
      { id: 'shortcuts' as const, label: msg.tabShortcuts },
      { id: 'ai' as const, label: msg.tabAi },
      { id: 'playback' as const, label: msg.tabPlayback },
      { id: 'data' as const, label: msg.tabData },
      { id: 'about' as const, label: msg.tabAbout },
    ],
    [msg],
  );

  const localeOptions = useMemo(
    () => [
      { value: 'zh-CN' as const, label: msg.localeChinese },
      { value: 'en-US' as const, label: msg.localeEnglish },
    ],
    [msg],
  );

  return (
    <ModalPanel
      isOpen={isOpen}
      onClose={onClose}
      topmost
      dir={settingsShellTextDirection}
      className="pnl-settings-modal panel-design-match panel-design-match-dialog"
      ariaLabel={msg.title}
      title={msg.title}
      headerClassName="settings-modal-header"
      bodyClassName="settings-modal-body"
      titleClassName="settings-modal-title"
      closeLabel={msg.close}
    >
      <div className="settings-layout">
        <SettingsTabBar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          tabs={tabs}
          idPrefix={tabIdPrefix}
          label={msg.title}
        />

        <div
          className="settings-tab-content"
          role="tabpanel"
          id={`${tabIdPrefix}-panel`}
          aria-labelledby={`${tabIdPrefix}-${activeTab}`}
          tabIndex={0}
        >
          {activeTab === 'appearance' && (
            <SettingsAppearanceTab
              locale={locale}
              themeMode={themeMode}
              fontScale={fontScale}
              fontScaleMode={fontScaleMode}
              iconEffect={iconEffect}
              onThemeChange={onThemeChange}
              onFontScaleModeChange={onFontScaleModeChange}
              onIconEffectChange={onIconEffectChange}
              onFontScaleChange={onFontScaleChange}
              msg={msg}
            />
          )}

          {activeTab === 'language' && (
            <SettingsLanguageTab
              locale={locale}
              localeOptions={localeOptions}
              onLocaleChange={onLocaleChange}
              msg={msg}
            />
          )}

          {activeTab === 'shortcuts' && (
            <SettingsShortcutsTab locale={locale} msg={msg} shortcutsMsg={shortcutsMsg} />
          )}

          {activeTab === 'ai' && <SettingsAiTab locale={locale} msg={msg} />}

          {activeTab === 'playback' && <SettingsPlaybackTab locale={locale} msg={msg} />}

          {activeTab === 'data' && (
            <SettingsDataTab locale={locale} msg={msg} resilienceMsg={resilienceMsg} />
          )}

          {activeTab === 'about' && <SettingsAboutTab version={version} msg={msg} />}
        </div>
      </div>
    </ModalPanel>
  );
});
