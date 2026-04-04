import type { Locale } from './index';

type LanguageSuggestion = {
  code: string;
  label: string;
};

export type ProjectSetupDialogMessages = {
  createFailed: string;
  title: string;
  close: string;
  titleZhLabel: string;
  titleZhPlaceholder: string;
  titleEnLabel: string;
  titleEnPlaceholder: string;
  languageLabel: string;
  languagePlaceholder: string;
  customLanguageOption: string;
  languageCodeLabel: string;
  languageCodePlaceholder: string;
  orthographyLabel: string;
  orthographyDefaultInference: string;
  createOrthography: string;
  noOrthographyHint: string;
  cancel: string;
  creating: string;
  createProject: string;
  languageSuggestions: LanguageSuggestion[];
};

const zhLanguageSuggestions: LanguageSuggestion[] = [
  { code: 'cmn', label: '\u666e\u901a\u8bdd Mandarin' },
  { code: 'yue', label: '\u7ca4\u8bed Cantonese' },
  { code: 'wuu', label: '\u5434\u8bed Wu' },
  { code: 'nan', label: '\u95fd\u5357\u8bed Min Nan' },
  { code: 'hak', label: '\u5ba2\u5bb6\u8bdd Hakka' },
  { code: 'bod', label: '\u85cf\u8bed Tibetan' },
  { code: 'iii', label: '\u5f5d\u8bed Yi' },
  { code: 'khb', label: '\u50a3\u4ec2\u8bed Tai Lue' },
  { code: 'eng', label: '\u82f1\u8bed English' },
  { code: 'jpn', label: '\u65e5\u8bed Japanese' },
];

const enLanguageSuggestions: LanguageSuggestion[] = [
  { code: 'cmn', label: 'Mandarin Chinese' },
  { code: 'yue', label: 'Cantonese' },
  { code: 'wuu', label: 'Wu Chinese' },
  { code: 'nan', label: 'Min Nan' },
  { code: 'hak', label: 'Hakka' },
  { code: 'bod', label: 'Tibetan' },
  { code: 'iii', label: 'Yi' },
  { code: 'khb', label: 'Tai Lue' },
  { code: 'eng', label: 'English' },
  { code: 'jpn', label: 'Japanese' },
];

const zhCN: ProjectSetupDialogMessages = {
  createFailed: '\u521b\u5efa\u5931\u8d25',
  title: '\u65b0\u5efa\u9879\u76ee',
  close: '\u5173\u95ed',
  titleZhLabel: '\u9879\u76ee\u540d\u79f0\uff08\u4e2d\u6587\uff09',
  titleZhPlaceholder: '\u4f8b\uff1a\u767d\u9a6c\u85cf\u8bed\u7530\u91ce\u8c03\u67e5',
  titleEnLabel: '\u9879\u76ee\u540d\u79f0\uff08\u82f1\u6587\uff09',
  titleEnPlaceholder: 'e.g. Baima Tibetan Fieldwork',
  languageLabel: '\u76ee\u6807\u8bed\u8a00',
  languagePlaceholder: '\u8bf7\u9009\u62e9\u8bed\u8a00...',
  customLanguageOption: '\u5176\u4ed6\uff08\u624b\u52a8\u8f93\u5165 ISO 639-3 \u4ee3\u7801\uff09',
  languageCodeLabel: '\u8bed\u8a00\u4ee3\u7801\uff08ISO 639-3\uff09',
  languageCodePlaceholder: '\u4f8b\uff1abfy',
  orthographyLabel: '\u6b63\u5b57\u6cd5 / \u4e66\u5199\u7cfb\u7edf',
  orthographyDefaultInference: '\u5f53\u524d\u8bed\u8a00\u6682\u65e0\u53ef\u7528\u6b63\u5b57\u6cd5',
  createOrthography: '+ \u65b0\u5efa\u6b63\u5b57\u6cd5\u2026',
  noOrthographyHint: '\u5f53\u524d\u8bed\u8a00\u5c1a\u672a\u5339\u914d\u5230\u5185\u7f6e\u6216\u81ea\u5efa\u6b63\u5b57\u6cd5\uff0c\u53ef\u76f4\u63a5\u65b0\u5efa\u4e00\u5957\u6b63\u5b57\u6cd5\u3002',
  cancel: '\u53d6\u6d88',
  creating: '\u521b\u5efa\u4e2d...',
  createProject: '\u521b\u5efa\u9879\u76ee',
  languageSuggestions: zhLanguageSuggestions,
};

const enUS: ProjectSetupDialogMessages = {
  createFailed: 'Create failed',
  title: 'New Project',
  close: 'Close',
  titleZhLabel: 'Project name (ZH)',
  titleZhPlaceholder: 'e.g. Baima Tibetan Fieldwork',
  titleEnLabel: 'Project name (EN)',
  titleEnPlaceholder: 'e.g. Baima Tibetan Fieldwork',
  languageLabel: 'Target language',
  languagePlaceholder: 'Select language...',
  customLanguageOption: 'Other (manual ISO 639-3 input)',
  languageCodeLabel: 'Language code (ISO 639-3)',
  languageCodePlaceholder: 'e.g. bfy',
  orthographyLabel: 'Orthography / Writing System',
  orthographyDefaultInference: 'No available orthography yet',
  createOrthography: '+ New orthography\u2026',
  noOrthographyHint: 'No built-in or custom orthography is available for this language yet. You can create one directly.',
  cancel: 'Cancel',
  creating: 'Creating...',
  createProject: 'Create Project',
  languageSuggestions: enLanguageSuggestions,
};

export function getProjectSetupDialogMessages(locale: Locale): ProjectSetupDialogMessages {
  return locale === 'zh-CN' ? zhCN : enUS;
}
