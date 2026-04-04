import type { MultiLangString, OrthographyDocType } from '../db';

const REVIEWED_AT = '2026-04-04T00:00:00.000Z';

type ScriptDefaults = {
  direction: NonNullable<OrthographyDocType['direction']>;
  primaryFonts: string[];
  fallbackFonts: string[];
  keyboardLayout: string;
  imeId: string;
};

type ReviewedOrthographyConfig = {
  id: string;
  languageId: string;
  zhName: string;
  enName: string;
  scriptTag: string;
  type?: NonNullable<OrthographyDocType['type']>;
  direction?: NonNullable<OrthographyDocType['direction']>;
  abbreviation?: string;
  regionTag?: string;
  variantTag?: string;
  exemplarMain?: string[];
  primaryFonts?: string[];
  fallbackFonts?: string[];
  keyboardLayout?: string;
  imeId?: string;
  noteZh?: string;
  noteEn?: string;
  priority?: 'primary' | 'secondary';
  reviewStatus?: NonNullable<NonNullable<OrthographyDocType['catalogMetadata']>['reviewStatus']>;
  provenanceSource?: string;
  seedKind?: string;
};

const SCRIPT_DEFAULTS: Record<string, ScriptDefaults> = {
  Latn: {
    direction: 'ltr',
    primaryFonts: ['Noto Sans', 'Noto Serif'],
    fallbackFonts: ['Gentium Plus'],
    keyboardLayout: 'latin-default',
    imeId: 'latin-default',
  },
  Cyrl: {
    direction: 'ltr',
    primaryFonts: ['Noto Sans', 'Noto Serif'],
    fallbackFonts: ['Gentium Plus'],
    keyboardLayout: 'cyrillic-default',
    imeId: 'cyrillic-default',
  },
  Arab: {
    direction: 'rtl',
    primaryFonts: ['Noto Naskh Arabic', 'Noto Sans Arabic'],
    fallbackFonts: ['Scheherazade New'],
    keyboardLayout: 'arabic-default',
    imeId: 'arabic-default',
  },
  Hebr: {
    direction: 'rtl',
    primaryFonts: ['Noto Sans Hebrew', 'Noto Sans'],
    fallbackFonts: ['Noto Serif'],
    keyboardLayout: 'hebrew-default',
    imeId: 'hebrew-default',
  },
  Hans: {
    direction: 'ltr',
    primaryFonts: ['Noto Sans SC', 'Noto Serif SC'],
    fallbackFonts: ['Noto Sans'],
    keyboardLayout: 'pinyin',
    imeId: 'pinyin',
  },
  Hant: {
    direction: 'ltr',
    primaryFonts: ['Noto Sans TC', 'Noto Serif TC'],
    fallbackFonts: ['Noto Sans'],
    keyboardLayout: 'zhuyin',
    imeId: 'zhuyin',
  },
  Jpan: {
    direction: 'ltr',
    primaryFonts: ['Noto Sans JP', 'Noto Serif JP'],
    fallbackFonts: ['Noto Sans'],
    keyboardLayout: 'kana-default',
    imeId: 'jp-ime',
  },
  Kore: {
    direction: 'ltr',
    primaryFonts: ['Noto Sans KR'],
    fallbackFonts: ['Noto Sans'],
    keyboardLayout: 'dubeolsik',
    imeId: 'ko-ime',
  },
  Deva: {
    direction: 'ltr',
    primaryFonts: ['Noto Sans Devanagari', 'Noto Serif Devanagari'],
    fallbackFonts: ['Annapurna SIL'],
    keyboardLayout: 'inscript-devanagari',
    imeId: 'devanagari-default',
  },
  Beng: {
    direction: 'ltr',
    primaryFonts: ['Noto Sans Bengali', 'Noto Sans'],
    fallbackFonts: ['Noto Serif'],
    keyboardLayout: 'bengali-default',
    imeId: 'bengali-default',
  },
  Taml: {
    direction: 'ltr',
    primaryFonts: ['Noto Sans Tamil', 'Noto Sans'],
    fallbackFonts: ['Noto Serif'],
    keyboardLayout: 'tamil-default',
    imeId: 'tamil-default',
  },
  Geor: {
    direction: 'ltr',
    primaryFonts: ['Noto Sans Georgian', 'Noto Sans'],
    fallbackFonts: ['Noto Serif'],
    keyboardLayout: 'georgian-default',
    imeId: 'georgian-default',
  },
  Armn: {
    direction: 'ltr',
    primaryFonts: ['Noto Sans', 'Noto Serif'],
    fallbackFonts: ['Gentium Plus'],
    keyboardLayout: 'armenian-default',
    imeId: 'armenian-default',
  },
  Sylo: {
    direction: 'ltr',
    primaryFonts: ['Noto Sans', 'Noto Sans Bengali'],
    fallbackFonts: ['Noto Serif'],
    keyboardLayout: 'syloti-nagri',
    imeId: 'syloti-default',
  },
};

const FALLBACK_SCRIPT_DEFAULTS: ScriptDefaults = {
  direction: 'ltr',
  primaryFonts: ['Noto Sans', 'Noto Serif'],
  fallbackFonts: ['Gentium Plus'],
  keyboardLayout: 'latin-default',
  imeId: 'latin-default',
};

function buildName(zhName: string, enName: string): MultiLangString {
  return {
    zho: zhName,
    eng: enName,
  };
}

function buildReviewedOrthography(config: ReviewedOrthographyConfig): OrthographyDocType {
  const defaults = SCRIPT_DEFAULTS[config.scriptTag] ?? FALLBACK_SCRIPT_DEFAULTS;
  const direction = config.direction ?? defaults.direction;
  const primaryFonts = config.primaryFonts ?? defaults.primaryFonts;
  const fallbackFonts = config.fallbackFonts ?? defaults.fallbackFonts;
  const reviewStatus = config.reviewStatus
    ?? (config.type === 'historical' ? 'historical' : 'verified-primary');
  const notes = config.noteZh || config.noteEn
    ? buildName(config.noteZh ?? config.noteEn ?? '', config.noteEn ?? config.noteZh ?? '')
    : undefined;

  return {
    id: config.id,
    languageId: config.languageId,
    name: buildName(config.zhName, config.enName),
    ...(config.abbreviation ? { abbreviation: config.abbreviation } : {}),
    type: config.type ?? 'practical',
    catalogMetadata: {
      catalogSource: 'built-in-reviewed',
      source: config.provenanceSource ?? 'top50-reviewed',
      reviewStatus,
      priority: config.priority ?? 'primary',
      seedKind: config.seedKind ?? 'reviewed',
    },
    scriptTag: config.scriptTag,
    ...(config.regionTag ? { regionTag: config.regionTag } : {}),
    ...(config.variantTag ? { variantTag: config.variantTag } : {}),
    direction,
    ...(config.exemplarMain?.length
      ? {
        exemplarCharacters: {
          main: config.exemplarMain,
        },
      }
      : {}),
    fontPreferences: {
      primary: primaryFonts,
      fallback: fallbackFonts,
    },
    inputHints: {
      keyboardLayout: config.keyboardLayout ?? defaults.keyboardLayout,
      imeId: config.imeId ?? defaults.imeId,
    },
    bidiPolicy: {
      isolateInlineRuns: direction === 'rtl',
      preferDirAttribute: true,
    },
    ...(notes ? { notes } : {}),
    createdAt: REVIEWED_AT,
    updatedAt: REVIEWED_AT,
  };
}

export const TOP50_REVIEWED_ORTHOGRAPHIES: OrthographyDocType[] = [
  buildReviewedOrthography({ id: 'eng-latn', languageId: 'eng', zhName: '英语标准拼写', enName: 'English Standard Orthography', scriptTag: 'Latn', exemplarMain: ['a', 'e', 'i', 'o', 'u', 'th', 'sh'], keyboardLayout: 'us-qwerty', imeId: 'latin-default' }),
  buildReviewedOrthography({ id: 'eng-ipa-latn', languageId: 'eng', zhName: '英语 IPA', enName: 'English IPA', scriptTag: 'Latn', type: 'phonetic', abbreviation: 'IPA', exemplarMain: ['i', 'æ', 'ʌ', 'ə', 'θ', 'ʃ'], keyboardLayout: 'sil-ipa', imeId: 'ipa-default', priority: 'secondary', reviewStatus: 'verified-secondary' }),
  buildReviewedOrthography({ id: 'deu-latn', languageId: 'deu', zhName: '德语标准拼写', enName: 'German Standard Orthography', scriptTag: 'Latn', exemplarMain: ['ä', 'ö', 'ü', 'ß'], keyboardLayout: 'de-qwertz' }),
  buildReviewedOrthography({ id: 'spa-latn', languageId: 'spa', zhName: '西班牙语标准拼写', enName: 'Spanish Standard Orthography', scriptTag: 'Latn', exemplarMain: ['á', 'é', 'í', 'ñ', 'll'], keyboardLayout: 'es-qwerty' }),
  buildReviewedOrthography({ id: 'fra-latn', languageId: 'fra', zhName: '法语标准拼写', enName: 'French Standard Orthography', scriptTag: 'Latn', exemplarMain: ['é', 'è', 'ê', 'ç', 'œ'], keyboardLayout: 'fr-azerty' }),
  buildReviewedOrthography({ id: 'rus-cyrl', languageId: 'rus', zhName: '俄语标准正字法', enName: 'Russian Standard Orthography', scriptTag: 'Cyrl', exemplarMain: ['а', 'б', 'в', 'ё', 'я'], keyboardLayout: 'ru-jcuken' }),
  buildReviewedOrthography({ id: 'ara-arab', languageId: 'ara', zhName: '现代标准阿拉伯语正字法', enName: 'Modern Standard Arabic Orthography', scriptTag: 'Arab', exemplarMain: ['ا', 'ب', 'ت', 'ث', 'ة'], keyboardLayout: 'arabic-101', imeId: 'arabic-default' }),
  buildReviewedOrthography({ id: 'lat-latn', languageId: 'lat', zhName: '古典拉丁语正字法', enName: 'Classical Latin Orthography', scriptTag: 'Latn', type: 'historical', exemplarMain: ['a', 'e', 'i', 'o', 'u', 'ae', 'oe'], keyboardLayout: 'latin-classical', reviewStatus: 'historical' }),
  buildReviewedOrthography({ id: 'ita-latn', languageId: 'ita', zhName: '意大利语标准拼写', enName: 'Italian Standard Orthography', scriptTag: 'Latn', exemplarMain: ['à', 'è', 'ì', 'ò', 'ù'], keyboardLayout: 'it-qwerty' }),
  buildReviewedOrthography({ id: 'jpn-jpan', languageId: 'jpn', zhName: '现代日语混合书写', enName: 'Modern Japanese Mixed Script', scriptTag: 'Jpan', exemplarMain: ['日', '本', '語', 'あ', 'ア'], keyboardLayout: 'jp-kana', imeId: 'jp-ime' }),
  buildReviewedOrthography({ id: 'jpn-hepburn-latn', languageId: 'jpn', zhName: '日语赫本罗马字', enName: 'Japanese Hepburn Romanization', scriptTag: 'Latn', variantTag: 'hepburn', exemplarMain: ['a', 'i', 'u', 'e', 'o', 'ryo'], keyboardLayout: 'latin-default', imeId: 'latin-default', priority: 'secondary', reviewStatus: 'verified-secondary' }),
  buildReviewedOrthography({ id: 'por-latn', languageId: 'por', zhName: '葡萄牙语标准拼写', enName: 'Portuguese Standard Orthography', scriptTag: 'Latn', exemplarMain: ['ã', 'õ', 'ç', 'lh', 'nh'], keyboardLayout: 'pt-qwerty' }),
  buildReviewedOrthography({ id: 'epo-latn', languageId: 'epo', zhName: '世界语正字法', enName: 'Esperanto Orthography', scriptTag: 'Latn', exemplarMain: ['ĉ', 'ĝ', 'ĥ', 'ĵ', 'ŝ', 'ŭ'], keyboardLayout: 'esperanto-x' }),
  buildReviewedOrthography({ id: 'fas-arab', languageId: 'fas', zhName: '现代波斯语正字法', enName: 'Modern Persian Orthography', scriptTag: 'Arab', exemplarMain: ['ا', 'پ', 'چ', 'ژ', 'گ'], keyboardLayout: 'persian-standard', imeId: 'persian-default' }),
  buildReviewedOrthography({ id: 'zho-hans', languageId: 'zho', zhName: '中文简体标准书写', enName: 'Chinese Simplified Standard Orthography', scriptTag: 'Hans', regionTag: 'CN', exemplarMain: ['语', '言', '学', '简', '体'], keyboardLayout: 'pinyin', imeId: 'pinyin' }),
  buildReviewedOrthography({ id: 'zho-hant', languageId: 'zho', zhName: '中文繁体标准书写', enName: 'Chinese Traditional Standard Orthography', scriptTag: 'Hant', regionTag: 'TW', exemplarMain: ['語', '言', '學', '繁', '體'], keyboardLayout: 'zhuyin', imeId: 'zhuyin', priority: 'secondary', reviewStatus: 'verified-secondary' }),
  buildReviewedOrthography({ id: 'zho-pinyin-latn', languageId: 'zho', zhName: '汉语拼音', enName: 'Hanyu Pinyin', scriptTag: 'Latn', variantTag: 'pinyin', exemplarMain: ['zh', 'ch', 'sh', 'ü', 'ang'], keyboardLayout: 'pinyin', imeId: 'latin-default', priority: 'secondary', reviewStatus: 'verified-secondary' }),
  buildReviewedOrthography({ id: 'heb-hebr', languageId: 'heb', zhName: '现代希伯来语正字法', enName: 'Modern Hebrew Orthography', scriptTag: 'Hebr', exemplarMain: ['א', 'ב', 'ג', 'ד', 'ה'], keyboardLayout: 'hebrew-standard', imeId: 'hebrew-default' }),
  buildReviewedOrthography({ id: 'nld-latn', languageId: 'nld', zhName: '荷兰语标准拼写', enName: 'Dutch Standard Orthography', scriptTag: 'Latn', exemplarMain: ['ij', 'é', 'ë'], keyboardLayout: 'nl-qwerty' }),
  buildReviewedOrthography({ id: 'pol-latn', languageId: 'pol', zhName: '波兰语标准拼写', enName: 'Polish Standard Orthography', scriptTag: 'Latn', exemplarMain: ['ą', 'ć', 'ę', 'ł', 'ń', 'ś', 'ź', 'ż'], keyboardLayout: 'pl-programmers' }),
  buildReviewedOrthography({ id: 'swe-latn', languageId: 'swe', zhName: '瑞典语标准拼写', enName: 'Swedish Standard Orthography', scriptTag: 'Latn', exemplarMain: ['å', 'ä', 'ö'], keyboardLayout: 'se-qwerty' }),
  buildReviewedOrthography({ id: 'tur-latn', languageId: 'tur', zhName: '土耳其语标准拼写', enName: 'Turkish Standard Orthography', scriptTag: 'Latn', exemplarMain: ['ç', 'ğ', 'ı', 'İ', 'ö', 'ş', 'ü'], keyboardLayout: 'tr-q' }),
  buildReviewedOrthography({ id: 'ukr-cyrl', languageId: 'ukr', zhName: '乌克兰语标准正字法', enName: 'Ukrainian Standard Orthography', scriptTag: 'Cyrl', exemplarMain: ['і', 'ї', 'є', 'ґ'], keyboardLayout: 'uk-standard' }),
  buildReviewedOrthography({ id: 'fin-latn', languageId: 'fin', zhName: '芬兰语标准拼写', enName: 'Finnish Standard Orthography', scriptTag: 'Latn', exemplarMain: ['ä', 'ö'], keyboardLayout: 'fi-qwerty' }),
  buildReviewedOrthography({ id: 'kor-kore', languageId: 'kor', zhName: '韩语标准书写', enName: 'Korean Standard Orthography', scriptTag: 'Kore', exemplarMain: ['한', '글', '어', '학'], keyboardLayout: 'dubeolsik', imeId: 'ko-ime' }),
  buildReviewedOrthography({ id: 'san-deva', languageId: 'san', zhName: '梵语天城文正字法', enName: 'Sanskrit Devanagari Orthography', scriptTag: 'Deva', exemplarMain: ['अ', 'आ', 'क', 'ष', 'ज्ञ'], keyboardLayout: 'inscript-devanagari' }),
  buildReviewedOrthography({ id: 'san-iast-latn', languageId: 'san', zhName: '梵语 IAST 转写', enName: 'Sanskrit IAST Romanization', scriptTag: 'Latn', variantTag: 'iast', exemplarMain: ['ā', 'ī', 'ū', 'ṛ', 'ṣ', 'ñ'], keyboardLayout: 'latin-diacritic', priority: 'secondary', reviewStatus: 'verified-secondary' }),
  buildReviewedOrthography({ id: 'ces-latn', languageId: 'ces', zhName: '捷克语标准拼写', enName: 'Czech Standard Orthography', scriptTag: 'Latn', exemplarMain: ['á', 'č', 'ď', 'ě', 'ř', 'š', 'ž'], keyboardLayout: 'cz-qwerty' }),
  buildReviewedOrthography({ id: 'cat-latn', languageId: 'cat', zhName: '加泰罗尼亚语标准拼写', enName: 'Catalan Standard Orthography', scriptTag: 'Latn', exemplarMain: ['à', 'ç', 'é', 'ï', 'l·l'], keyboardLayout: 'cat-latin' }),
  buildReviewedOrthography({ id: 'dan-latn', languageId: 'dan', zhName: '丹麦语标准拼写', enName: 'Danish Standard Orthography', scriptTag: 'Latn', exemplarMain: ['æ', 'ø', 'å'], keyboardLayout: 'dk-qwerty' }),
  buildReviewedOrthography({ id: 'ron-latn', languageId: 'ron', zhName: '罗马尼亚语标准拼写', enName: 'Romanian Standard Orthography', scriptTag: 'Latn', exemplarMain: ['ă', 'â', 'î', 'ș', 'ț'], keyboardLayout: 'ro-programmers' }),
  buildReviewedOrthography({ id: 'swa-latn', languageId: 'swa', zhName: '斯瓦希里语标准拼写', enName: 'Swahili Standard Orthography', scriptTag: 'Latn', exemplarMain: ['ng', 'ny', 'sh'], keyboardLayout: 'latin-default' }),
  buildReviewedOrthography({ id: 'hun-latn', languageId: 'hun', zhName: '匈牙利语标准拼写', enName: 'Hungarian Standard Orthography', scriptTag: 'Latn', exemplarMain: ['á', 'é', 'í', 'ó', 'ö', 'ő', 'ú', 'ü', 'ű'], keyboardLayout: 'hu-qwertz' }),
  buildReviewedOrthography({ id: 'syl-beng', languageId: 'syl', zhName: '锡尔赫特语孟加拉文书写', enName: 'Sylheti Bengali Orthography', scriptTag: 'Beng', exemplarMain: ['অ', 'আ', 'ক', 'ঙ'], keyboardLayout: 'bengali-default' }),
  buildReviewedOrthography({ id: 'syl-sylo', languageId: 'syl', zhName: '锡尔赫特语纳格里书写', enName: 'Sylheti Nagri Orthography', scriptTag: 'Sylo', type: 'historical', exemplarMain: ['ꠀ', 'ꠁ', 'ꠅ', 'ꠇ'], keyboardLayout: 'syloti-nagri', imeId: 'syloti-default' }),
  buildReviewedOrthography({ id: 'hrv-latn', languageId: 'hrv', zhName: '克罗地亚语标准拼写', enName: 'Croatian Standard Orthography', scriptTag: 'Latn', exemplarMain: ['č', 'ć', 'đ', 'š', 'ž'], keyboardLayout: 'hr-qwertz' }),
  buildReviewedOrthography({ id: 'nor-latn', languageId: 'nor', zhName: '挪威语标准拼写', enName: 'Norwegian Standard Orthography', scriptTag: 'Latn', exemplarMain: ['æ', 'ø', 'å'], keyboardLayout: 'no-qwerty' }),
  buildReviewedOrthography({ id: 'ben-beng', languageId: 'ben', zhName: '孟加拉语标准正字法', enName: 'Bangla Standard Orthography', scriptTag: 'Beng', exemplarMain: ['অ', 'আ', 'ই', 'উ', 'ক', 'খ'], keyboardLayout: 'bengali-inscript' }),
  buildReviewedOrthography({ id: 'aze-latn', languageId: 'aze', zhName: '阿塞拜疆语拉丁字母正字法', enName: 'Azerbaijani Latin Orthography', scriptTag: 'Latn', exemplarMain: ['ə', 'ğ', 'ı', 'ö', 'ş', 'ü'], keyboardLayout: 'az-latin' }),
  buildReviewedOrthography({ id: 'afr-latn', languageId: 'afr', zhName: '南非荷兰语标准拼写', enName: 'Afrikaans Standard Orthography', scriptTag: 'Latn', exemplarMain: ['ê', 'ë', 'ï', 'ô', 'û'], keyboardLayout: 'latin-default' }),
  buildReviewedOrthography({ id: 'est-latn', languageId: 'est', zhName: '爱沙尼亚语标准拼写', enName: 'Estonian Standard Orthography', scriptTag: 'Latn', exemplarMain: ['ä', 'õ', 'ö', 'ü'], keyboardLayout: 'ee-qwerty' }),
  buildReviewedOrthography({ id: 'bul-cyrl', languageId: 'bul', zhName: '保加利亚语标准正字法', enName: 'Bulgarian Standard Orthography', scriptTag: 'Cyrl', exemplarMain: ['ъ', 'ь', 'я', 'ю'], keyboardLayout: 'bg-standard' }),
  buildReviewedOrthography({ id: 'gle-latn', languageId: 'gle', zhName: '爱尔兰语标准拼写', enName: 'Irish Standard Orthography', scriptTag: 'Latn', exemplarMain: ['á', 'é', 'í', 'ó', 'ú'], keyboardLayout: 'irish-extended' }),
  buildReviewedOrthography({ id: 'bel-cyrl', languageId: 'bel', zhName: '白俄罗斯语标准正字法', enName: 'Belarusian Standard Orthography', scriptTag: 'Cyrl', exemplarMain: ['ў', 'і', 'ё'], keyboardLayout: 'be-standard' }),
  buildReviewedOrthography({ id: 'ind-latn', languageId: 'ind', zhName: '印尼语标准拼写', enName: 'Indonesian Standard Orthography', scriptTag: 'Latn', exemplarMain: ['ng', 'ny', 'sy'], keyboardLayout: 'latin-default' }),
  buildReviewedOrthography({ id: 'isl-latn', languageId: 'isl', zhName: '冰岛语标准拼写', enName: 'Icelandic Standard Orthography', scriptTag: 'Latn', exemplarMain: ['á', 'ð', 'é', 'í', 'ó', 'þ', 'æ', 'ö'], keyboardLayout: 'is-standard' }),
  buildReviewedOrthography({ id: 'lit-latn', languageId: 'lit', zhName: '立陶宛语标准拼写', enName: 'Lithuanian Standard Orthography', scriptTag: 'Latn', exemplarMain: ['ą', 'č', 'ę', 'ė', 'į', 'š', 'ų', 'ū', 'ž'], keyboardLayout: 'lt-standard' }),
  buildReviewedOrthography({ id: 'ile-latn', languageId: 'ile', zhName: '国际语（Interlingue）正字法', enName: 'Interlingue Orthography', scriptTag: 'Latn', exemplarMain: ['ĉ', 'sh', 'qu'], keyboardLayout: 'latin-default' }),
  buildReviewedOrthography({ id: 'hye-armn', languageId: 'hye', zhName: '亚美尼亚语标准正字法', enName: 'Armenian Standard Orthography', scriptTag: 'Armn', exemplarMain: ['ա', 'բ', 'գ', 'դ'], keyboardLayout: 'armenian-eastern' }),
  buildReviewedOrthography({ id: 'slk-latn', languageId: 'slk', zhName: '斯洛伐克语标准拼写', enName: 'Slovak Standard Orthography', scriptTag: 'Latn', exemplarMain: ['á', 'ä', 'č', 'ď', 'ĺ', 'ľ', 'ô', 'ŕ', 'š', 'ť', 'ž'], keyboardLayout: 'sk-qwertz' }),
  buildReviewedOrthography({ id: 'tam-taml', languageId: 'tam', zhName: '泰米尔语标准正字法', enName: 'Tamil Standard Orthography', scriptTag: 'Taml', exemplarMain: ['அ', 'ஆ', 'இ', 'உ', 'க', 'ங'], keyboardLayout: 'tamil99', imeId: 'tamil-default' }),
  buildReviewedOrthography({ id: 'sqi-latn', languageId: 'sqi', zhName: '阿尔巴尼亚语标准拼写', enName: 'Albanian Standard Orthography', scriptTag: 'Latn', exemplarMain: ['ë', 'ç', 'dh', 'gj', 'll'], keyboardLayout: 'al-latin' }),
  buildReviewedOrthography({ id: 'eus-latn', languageId: 'eus', zhName: '巴斯克语标准拼写', enName: 'Basque Standard Orthography', scriptTag: 'Latn', exemplarMain: ['tx', 'tz', 'dd', 'll'], keyboardLayout: 'eu-latin' }),
  buildReviewedOrthography({ id: 'kat-geor', languageId: 'kat', zhName: '格鲁吉亚语标准正字法', enName: 'Georgian Standard Orthography', scriptTag: 'Geor', exemplarMain: ['ა', 'ბ', 'გ', 'დ'], keyboardLayout: 'georgian-qwerty' }),
  buildReviewedOrthography({ id: 'srp-cyrl', languageId: 'srp', zhName: '塞尔维亚语西里尔字母正字法', enName: 'Serbian Cyrillic Orthography', scriptTag: 'Cyrl', exemplarMain: ['љ', 'њ', 'ђ', 'ћ', 'џ'], keyboardLayout: 'sr-cyrillic' }),
  buildReviewedOrthography({ id: 'srp-latn', languageId: 'srp', zhName: '塞尔维亚语拉丁字母正字法', enName: 'Serbian Latin Orthography', scriptTag: 'Latn', exemplarMain: ['lj', 'nj', 'đ', 'ć', 'dž'], keyboardLayout: 'sr-latin', priority: 'secondary', reviewStatus: 'verified-secondary' }),
  buildReviewedOrthography({ id: 'lav-latn', languageId: 'lav', zhName: '拉脱维亚语标准拼写', enName: 'Latvian Standard Orthography', scriptTag: 'Latn', exemplarMain: ['ā', 'č', 'ē', 'ģ', 'ī', 'ķ', 'ļ', 'ņ', 'š', 'ū', 'ž'], keyboardLayout: 'lv-standard' }),
];

export const TOP50_REVIEWED_LANGUAGE_IDS = new Set(
  TOP50_REVIEWED_ORTHOGRAPHIES.map((item) => item.languageId).filter((value): value is string => Boolean(value)),
);