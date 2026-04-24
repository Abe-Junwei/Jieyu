import { normalizeLocale, t, tf, type DictKey, type Locale } from './index';

type LanguageSuggestion = {
  code: string;
  label: string;
};

const PROJECT_SUGGESTION_CODES = ['cmn', 'yue', 'wuu', 'nan', 'hak', 'bod', 'iii', 'khb', 'eng', 'jpn'] as const;

function projectSuggestKey(code: (typeof PROJECT_SUGGESTION_CODES)[number]): DictKey {
  return `msg.projectSetup.suggest.${code}` as DictKey;
}

export type ProjectSetupDialogMessages = {
  createFailed: string;
  invalidLanguageCode: string;
  invalidOrthographySelection: string;
  orthographyContextPrimaryLanguage: (language: string) => string;
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
  newOrthographyButton: string;
  noOrthographyHint: string;
  cancel: string;
  creating: string;
  createProject: string;
  languageSuggestions: LanguageSuggestion[];
};

function dictLocale(locale: Locale): 'zh-CN' | 'en-US' {
  return normalizeLocale(locale) === 'en-US' ? 'en-US' : 'zh-CN';
}

export function getProjectSetupDialogMessages(locale: Locale): ProjectSetupDialogMessages {
  const l = dictLocale(locale);
  const languageSuggestions: LanguageSuggestion[] = PROJECT_SUGGESTION_CODES.map((code) => ({
    code,
    label: t(l, projectSuggestKey(code)),
  }));
  return {
    createFailed: t(l, 'msg.projectSetup.createFailed'),
    invalidLanguageCode: t(l, 'msg.projectSetup.invalidLanguageCode'),
    invalidOrthographySelection: t(l, 'msg.projectSetup.invalidOrthographySelection'),
    orthographyContextPrimaryLanguage: (language) =>
      tf(l, 'msg.projectSetup.orthographyContextPrimaryLanguage', { language }),
    title: t(l, 'msg.projectSetup.title'),
    close: t(l, 'msg.projectSetup.close'),
    titleZhLabel: t(l, 'msg.projectSetup.titleZhLabel'),
    titleZhPlaceholder: t(l, 'msg.projectSetup.titleZhPlaceholder'),
    titleEnLabel: t(l, 'msg.projectSetup.titleEnLabel'),
    titleEnPlaceholder: t(l, 'msg.projectSetup.titleEnPlaceholder'),
    languageLabel: t(l, 'msg.projectSetup.languageLabel'),
    languagePlaceholder: t(l, 'msg.projectSetup.languagePlaceholder'),
    customLanguageOption: t(l, 'msg.projectSetup.customLanguageOption'),
    languageCodeLabel: t(l, 'msg.projectSetup.languageCodeLabel'),
    languageCodePlaceholder: t(l, 'msg.projectSetup.languageCodePlaceholder'),
    orthographyLabel: t(l, 'msg.projectSetup.orthographyLabel'),
    orthographyDefaultInference: t(l, 'msg.projectSetup.orthographyDefaultInference'),
    createOrthography: t(l, 'msg.projectSetup.createOrthography'),
    newOrthographyButton: t(l, 'msg.projectSetup.newOrthographyButton'),
    noOrthographyHint: t(l, 'msg.projectSetup.noOrthographyHint'),
    cancel: t(l, 'msg.projectSetup.cancel'),
    creating: t(l, 'msg.projectSetup.creating'),
    createProject: t(l, 'msg.projectSetup.createProject'),
    languageSuggestions,
  };
}
