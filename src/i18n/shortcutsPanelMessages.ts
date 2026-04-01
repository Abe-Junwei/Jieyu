import type { Locale } from './index';

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

const zhCN: ShortcutsPanelMessages = {
  categoryPlayback: '\u64ad\u653e\u63a7\u5236',
  categoryEditing: '\u7f16\u8f91\u64cd\u4f5c',
  categoryNavigation: '\u5bfc\u822a',
  categoryView: '\u89c6\u56fe',
  categoryVoice: '\u8bed\u97f3\u667a\u80fd\u4f53',
  panelAriaLabel: '\u952e\u76d8\u5feb\u6377\u952e',
  panelTitle: '\u2328 \u952e\u76d8\u5feb\u6377\u952e',
  closePanelAriaLabel: '\u5173\u95ed\u5feb\u6377\u952e\u9762\u677f',
  scopeWaveform: '\u6ce2\u5f62\u533a',
  scopeGlobal: '\u5168\u5c40',
};

const enUS: ShortcutsPanelMessages = {
  categoryPlayback: 'Playback',
  categoryEditing: 'Editing',
  categoryNavigation: 'Navigation',
  categoryView: 'View',
  categoryVoice: 'Voice Agent',
  panelAriaLabel: 'Keyboard shortcuts',
  panelTitle: '\u2328 Keyboard Shortcuts',
  closePanelAriaLabel: 'Close shortcuts panel',
  scopeWaveform: 'Waveform',
  scopeGlobal: 'Global',
};

export function getShortcutsPanelMessages(locale: Locale): ShortcutsPanelMessages {
  return locale === 'zh-CN' ? zhCN : enUS;
}
