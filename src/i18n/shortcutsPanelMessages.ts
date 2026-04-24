import { normalizeLocale, t, type Locale } from './index';

export type ShortcutsPanelMessages = {
  categoryPlayback: string;
  categoryEditing: string;
  categoryNavigation: string;
  categoryView: string;
  categoryVoice: string;
  panelAriaLabel: string;
  panelTitle: string;
  closePanelAriaLabel: string;
  scopeWaveform: string;
  scopeGlobal: string;
};

export function getShortcutsPanelMessages(locale: Locale): ShortcutsPanelMessages {
  const normalizedLocale = normalizeLocale(locale) ?? 'zh-CN';
  return {
    categoryPlayback: t(normalizedLocale, 'shortcuts.category.playback'),
    categoryEditing: t(normalizedLocale, 'shortcuts.category.editing'),
    categoryNavigation: t(normalizedLocale, 'shortcuts.category.navigation'),
    categoryView: t(normalizedLocale, 'shortcuts.category.view'),
    categoryVoice: t(normalizedLocale, 'shortcuts.category.voice'),
    panelAriaLabel: t(normalizedLocale, 'shortcuts.panel.ariaLabel'),
    panelTitle: t(normalizedLocale, 'shortcuts.panel.title'),
    closePanelAriaLabel: t(normalizedLocale, 'shortcuts.panel.closeAriaLabel'),
    scopeWaveform: t(normalizedLocale, 'shortcuts.scope.waveform'),
    scopeGlobal: t(normalizedLocale, 'shortcuts.scope.global'),
  };
}
