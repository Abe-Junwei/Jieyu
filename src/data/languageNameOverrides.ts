import type { LanguageNameQueryLocale } from './languageNameTypes';

const LANGUAGE_DISPLAY_NAME_ZH_OVERRIDES: Readonly<Record<string, string>> = {
  cmn: '普通话',
  zho: '中文',
  yue: '粤语',
  wuu: '吴语',
  nan: '闽南语',
  hak: '客家话',
  gan: '赣语',
  cjy: '晋语',
  hsn: '湘语',
  eng: '英语',
  jpn: '日语',
  kor: '韩语',
  fra: '法语',
  deu: '德语',
  spa: '西班牙语',
  rus: '俄语',
  ara: '阿拉伯语',
  por: '葡萄牙语',
  hin: '印地语',
  vie: '越南语',
  tha: '泰语',
  msa: '马来语',
  ind: '印尼语',
  bod: '藏语',
  uig: '维吾尔语',
  mon: '蒙古语',
  zha: '壮语',
  kaz: '哈萨克语',
  kir: '吉尔吉斯语',
  tgk: '塔吉克语',
  sjo: '锡伯语',
  mnc: '满语',
  iii: '彝语',
  hmn: '苗语',
  lis: '傈僳语',
  lhu: '拉祜语',
};

export function getLanguageDisplayNameOverride(
  languageId: string | undefined,
  locale: LanguageNameQueryLocale,
): string | undefined {
  const normalizedCode = languageId?.trim().toLowerCase();
  if (!normalizedCode) {
    return undefined;
  }
  if (locale === 'zh-CN') {
    return LANGUAGE_DISPLAY_NAME_ZH_OVERRIDES[normalizedCode];
  }
  return undefined;
}