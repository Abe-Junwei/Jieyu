import type {
  LanguageAliasToCodeRecord,
  LanguageAliasesByCodeRecord,
  LanguageDisplayCoreEntry,
  LanguageNameQueryLocale,
  LanguageQueryIndexLocaleRecord,
} from '../languageNameTypes';

export const GENERATED_LANGUAGE_DISPLAY_NAME_CORE: Readonly<Record<string, LanguageDisplayCoreEntry>> = 
{
  "eng": {
    "english": "English",
    "native": "English",
    "byLocale": {
      "zh-CN": "英语",
      "en-US": "English",
      "fr-FR": "anglais",
      "es-ES": "inglés",
      "de-DE": "Englisch"
    }
  },
  "deu": {
    "english": "German",
    "native": "Deutsch",
    "byLocale": {
      "zh-CN": "德语",
      "en-US": "German",
      "fr-FR": "allemand",
      "es-ES": "alemán",
      "de-DE": "Deutsch"
    }
  },
  "spa": {
    "english": "Spanish",
    "native": "español",
    "byLocale": {
      "zh-CN": "西班牙语",
      "en-US": "Spanish",
      "fr-FR": "espagnol",
      "es-ES": "español",
      "de-DE": "Spanisch"
    }
  },
  "fra": {
    "english": "French",
    "native": "français",
    "byLocale": {
      "zh-CN": "法语",
      "en-US": "French",
      "fr-FR": "français",
      "es-ES": "francés",
      "de-DE": "Französisch"
    }
  },
  "rus": {
    "english": "Russian",
    "native": "русский",
    "byLocale": {
      "zh-CN": "俄语",
      "en-US": "Russian",
      "fr-FR": "russe",
      "es-ES": "ruso",
      "de-DE": "Russisch"
    }
  },
  "ara": {
    "english": "Arabic",
    "native": "العربية",
    "byLocale": {
      "zh-CN": "阿拉伯语",
      "en-US": "Arabic",
      "fr-FR": "arabe",
      "es-ES": "árabe",
      "de-DE": "Arabisch"
    }
  },
  "lat": {
    "english": "Latin",
    "byLocale": {
      "zh-CN": "拉丁语",
      "en-US": "Latin",
      "fr-FR": "latin",
      "es-ES": "latín",
      "de-DE": "Latein"
    }
  },
  "ita": {
    "english": "Italian",
    "native": "italiano",
    "byLocale": {
      "zh-CN": "意大利语",
      "en-US": "Italian",
      "fr-FR": "italien",
      "es-ES": "italiano",
      "de-DE": "Italienisch"
    }
  },
  "jpn": {
    "english": "Japanese",
    "native": "日本語",
    "byLocale": {
      "zh-CN": "日语",
      "en-US": "Japanese",
      "fr-FR": "japonais",
      "es-ES": "japonés",
      "de-DE": "Japanisch"
    }
  },
  "por": {
    "english": "Portuguese",
    "native": "português",
    "byLocale": {
      "zh-CN": "葡萄牙语",
      "en-US": "Portuguese",
      "fr-FR": "portugais",
      "es-ES": "portugués",
      "de-DE": "Portugiesisch"
    }
  },
  "epo": {
    "english": "Esperanto",
    "native": "Esperanto",
    "byLocale": {
      "zh-CN": "世界语",
      "en-US": "Esperanto",
      "fr-FR": "espéranto",
      "es-ES": "esperanto",
      "de-DE": "Esperanto"
    }
  },
  "fas": {
    "english": "Persian",
    "native": "فارسی",
    "byLocale": {
      "zh-CN": "波斯语",
      "en-US": "Persian",
      "fr-FR": "persan",
      "es-ES": "persa",
      "de-DE": "Persisch"
    }
  },
  "zho": {
    "english": "Chinese",
    "native": "中文",
    "byLocale": {
      "zh-CN": "中文",
      "en-US": "Chinese",
      "fr-FR": "chinois",
      "es-ES": "chino",
      "de-DE": "Chinesisch"
    }
  },
  "heb": {
    "english": "Hebrew",
    "native": "עברית",
    "byLocale": {
      "zh-CN": "希伯来语",
      "en-US": "Hebrew",
      "fr-FR": "hébreu",
      "es-ES": "hebreo",
      "de-DE": "Hebräisch"
    }
  },
  "nld": {
    "english": "Dutch",
    "native": "Nederlands",
    "byLocale": {
      "zh-CN": "荷兰语",
      "en-US": "Dutch",
      "fr-FR": "néerlandais",
      "es-ES": "neerlandés",
      "de-DE": "Niederländisch"
    }
  },
  "pol": {
    "english": "Polish",
    "native": "polski",
    "byLocale": {
      "zh-CN": "波兰语",
      "en-US": "Polish",
      "fr-FR": "polonais",
      "es-ES": "polaco",
      "de-DE": "Polnisch"
    }
  },
  "swe": {
    "english": "Swedish",
    "native": "svenska",
    "byLocale": {
      "zh-CN": "瑞典语",
      "en-US": "Swedish",
      "fr-FR": "suédois",
      "es-ES": "sueco",
      "de-DE": "Schwedisch"
    }
  },
  "tur": {
    "english": "Turkish",
    "native": "Türkçe",
    "byLocale": {
      "zh-CN": "土耳其语",
      "en-US": "Turkish",
      "fr-FR": "turc",
      "es-ES": "turco",
      "de-DE": "Türkisch"
    }
  },
  "ukr": {
    "english": "Ukrainian",
    "native": "українська",
    "byLocale": {
      "zh-CN": "乌克兰语",
      "en-US": "Ukrainian",
      "fr-FR": "ukrainien",
      "es-ES": "ucraniano",
      "de-DE": "Ukrainisch"
    }
  },
  "fin": {
    "english": "Finnish",
    "native": "suomi",
    "byLocale": {
      "zh-CN": "芬兰语",
      "en-US": "Finnish",
      "fr-FR": "finnois",
      "es-ES": "finés",
      "de-DE": "Finnisch"
    }
  },
  "kor": {
    "english": "Korean",
    "native": "한국어",
    "byLocale": {
      "zh-CN": "韩语",
      "en-US": "Korean",
      "fr-FR": "coréen",
      "es-ES": "coreano",
      "de-DE": "Koreanisch"
    }
  },
  "san": {
    "english": "Sanskrit",
    "native": "संस्कृत भाषा",
    "byLocale": {
      "zh-CN": "梵语",
      "en-US": "Sanskrit",
      "fr-FR": "sanskrit",
      "es-ES": "sánscrito",
      "de-DE": "Sanskrit"
    }
  },
  "ces": {
    "english": "Czech",
    "native": "čeština",
    "byLocale": {
      "zh-CN": "捷克语",
      "en-US": "Czech",
      "fr-FR": "tchèque",
      "es-ES": "checo",
      "de-DE": "Tschechisch"
    }
  },
  "cat": {
    "english": "Catalan",
    "native": "català",
    "byLocale": {
      "zh-CN": "加泰罗尼亚语",
      "en-US": "Catalan",
      "fr-FR": "catalan",
      "es-ES": "catalán",
      "de-DE": "Katalanisch"
    }
  },
  "dan": {
    "english": "Danish",
    "native": "dansk",
    "byLocale": {
      "zh-CN": "丹麦语",
      "en-US": "Danish",
      "fr-FR": "danois",
      "es-ES": "danés",
      "de-DE": "Dänisch"
    }
  },
  "ron": {
    "english": "Romanian",
    "native": "română",
    "byLocale": {
      "zh-CN": "罗马尼亚语",
      "en-US": "Romanian",
      "fr-FR": "roumain",
      "es-ES": "rumano",
      "de-DE": "Rumänisch"
    }
  },
  "swa": {
    "english": "Swahili",
    "native": "Kiswahili",
    "byLocale": {
      "zh-CN": "斯瓦希里语",
      "en-US": "Swahili",
      "fr-FR": "swahili",
      "es-ES": "suajili",
      "de-DE": "Suaheli"
    }
  },
  "hun": {
    "english": "Hungarian",
    "native": "magyar",
    "byLocale": {
      "zh-CN": "匈牙利语",
      "en-US": "Hungarian",
      "fr-FR": "hongrois",
      "es-ES": "húngaro",
      "de-DE": "Ungarisch"
    }
  },
  "syl": {
    "english": "Sylheti"
  },
  "hrv": {
    "english": "Croatian",
    "native": "hrvatski",
    "byLocale": {
      "zh-CN": "克罗地亚语",
      "en-US": "Croatian",
      "fr-FR": "croate",
      "es-ES": "croata",
      "de-DE": "Kroatisch"
    }
  },
  "nor": {
    "english": "Norwegian",
    "native": "norsk",
    "byLocale": {
      "zh-CN": "挪威语",
      "en-US": "Norwegian",
      "fr-FR": "norvégien",
      "es-ES": "noruego",
      "de-DE": "Norwegisch"
    }
  },
  "ben": {
    "english": "Bangla",
    "native": "বাংলা",
    "byLocale": {
      "zh-CN": "孟加拉语",
      "en-US": "Bangla",
      "fr-FR": "bengali",
      "es-ES": "bengalí",
      "de-DE": "Bengalisch"
    }
  },
  "aze": {
    "english": "Azerbaijani",
    "native": "azərbaycan",
    "byLocale": {
      "zh-CN": "阿塞拜疆语",
      "en-US": "Azerbaijani",
      "fr-FR": "azerbaïdjanais",
      "es-ES": "azerbaiyano",
      "de-DE": "Aserbaidschanisch"
    }
  },
  "afr": {
    "english": "Afrikaans",
    "native": "Afrikaans",
    "byLocale": {
      "zh-CN": "南非荷兰语",
      "en-US": "Afrikaans",
      "fr-FR": "afrikaans",
      "es-ES": "afrikáans",
      "de-DE": "Afrikaans"
    }
  },
  "est": {
    "english": "Estonian",
    "native": "eesti",
    "byLocale": {
      "zh-CN": "爱沙尼亚语",
      "en-US": "Estonian",
      "fr-FR": "estonien",
      "es-ES": "estonio",
      "de-DE": "Estnisch"
    }
  },
  "bul": {
    "english": "Bulgarian",
    "native": "български",
    "byLocale": {
      "zh-CN": "保加利亚语",
      "en-US": "Bulgarian",
      "fr-FR": "bulgare",
      "es-ES": "búlgaro",
      "de-DE": "Bulgarisch"
    }
  },
  "gle": {
    "english": "Irish",
    "native": "Gaeilge",
    "byLocale": {
      "zh-CN": "爱尔兰语",
      "en-US": "Irish",
      "fr-FR": "irlandais",
      "es-ES": "irlandés",
      "de-DE": "Irisch"
    }
  },
  "bel": {
    "english": "Belarusian",
    "native": "беларуская",
    "byLocale": {
      "zh-CN": "白俄罗斯语",
      "en-US": "Belarusian",
      "fr-FR": "biélorusse",
      "es-ES": "bielorruso",
      "de-DE": "Belarussisch"
    }
  },
  "ind": {
    "english": "Indonesian",
    "native": "Bahasa Indonesia",
    "byLocale": {
      "zh-CN": "印度尼西亚语",
      "en-US": "Indonesian",
      "fr-FR": "indonésien",
      "es-ES": "indonesio",
      "de-DE": "Indonesisch"
    }
  },
  "isl": {
    "english": "Icelandic",
    "native": "íslenska",
    "byLocale": {
      "zh-CN": "冰岛语",
      "en-US": "Icelandic",
      "fr-FR": "islandais",
      "es-ES": "islandés",
      "de-DE": "Isländisch"
    }
  },
  "lit": {
    "english": "Lithuanian",
    "native": "lietuvių",
    "byLocale": {
      "zh-CN": "立陶宛语",
      "en-US": "Lithuanian",
      "fr-FR": "lituanien",
      "es-ES": "lituano",
      "de-DE": "Litauisch"
    }
  },
  "ile": {
    "english": "Interlingue",
    "native": "Interlingue",
    "byLocale": {
      "zh-CN": "国际文字（E）",
      "en-US": "Interlingue",
      "fr-FR": "interlingue",
      "es-ES": "interlingue",
      "de-DE": "Interlingue"
    }
  },
  "hye": {
    "english": "Armenian",
    "native": "հայերեն",
    "byLocale": {
      "zh-CN": "亚美尼亚语",
      "en-US": "Armenian",
      "fr-FR": "arménien",
      "es-ES": "armenio",
      "de-DE": "Armenisch"
    }
  },
  "slk": {
    "english": "Slovak",
    "native": "slovenčina",
    "byLocale": {
      "zh-CN": "斯洛伐克语",
      "en-US": "Slovak",
      "fr-FR": "slovaque",
      "es-ES": "eslovaco",
      "de-DE": "Slowakisch"
    }
  },
  "tam": {
    "english": "Tamil",
    "native": "தமிழ்",
    "byLocale": {
      "zh-CN": "泰米尔语",
      "en-US": "Tamil",
      "fr-FR": "tamoul",
      "es-ES": "tamil",
      "de-DE": "Tamil"
    }
  },
  "sqi": {
    "english": "Albanian",
    "native": "shqip",
    "byLocale": {
      "zh-CN": "阿尔巴尼亚语",
      "en-US": "Albanian",
      "fr-FR": "albanais",
      "es-ES": "albanés",
      "de-DE": "Albanisch"
    }
  },
  "eus": {
    "english": "Basque",
    "native": "euskara",
    "byLocale": {
      "zh-CN": "巴斯克语",
      "en-US": "Basque",
      "fr-FR": "basque",
      "es-ES": "euskera",
      "de-DE": "Baskisch"
    }
  },
  "kat": {
    "english": "Georgian",
    "native": "ქართული",
    "byLocale": {
      "zh-CN": "格鲁吉亚语",
      "en-US": "Georgian",
      "fr-FR": "géorgien",
      "es-ES": "georgiano",
      "de-DE": "Georgisch"
    }
  },
  "srp": {
    "english": "Serbian",
    "native": "српски",
    "byLocale": {
      "zh-CN": "塞尔维亚语",
      "en-US": "Serbian",
      "fr-FR": "serbe",
      "es-ES": "serbio",
      "de-DE": "Serbisch"
    }
  },
  "lav": {
    "english": "Latvian",
    "native": "latviešu",
    "byLocale": {
      "zh-CN": "拉脱维亚语",
      "en-US": "Latvian",
      "fr-FR": "letton",
      "es-ES": "letón",
      "de-DE": "Lettisch"
    }
  },
  "tha": {
    "english": "Thai",
    "native": "ไทย",
    "byLocale": {
      "zh-CN": "泰语",
      "en-US": "Thai",
      "fr-FR": "thaï",
      "es-ES": "tailandés",
      "de-DE": "Thailändisch"
    }
  },
  "slv": {
    "english": "Slovene",
    "native": "slovenščina",
    "byLocale": {
      "zh-CN": "斯洛文尼亚语",
      "en-US": "Slovenian",
      "fr-FR": "slovène",
      "es-ES": "esloveno",
      "de-DE": "Slowenisch"
    }
  },
  "vie": {
    "english": "Vietnamese",
    "native": "Tiếng Việt",
    "byLocale": {
      "zh-CN": "越南语",
      "en-US": "Vietnamese",
      "fr-FR": "vietnamien",
      "es-ES": "vietnamita",
      "de-DE": "Vietnamesisch"
    }
  },
  "oci": {
    "english": "Occitan",
    "native": "occitan",
    "byLocale": {
      "zh-CN": "奥克语",
      "en-US": "Occitan",
      "fr-FR": "occitan",
      "es-ES": "occitano",
      "de-DE": "Okzitanisch"
    }
  },
  "kaz": {
    "english": "Kazakh",
    "native": "қазақ тілі",
    "byLocale": {
      "zh-CN": "哈萨克语",
      "en-US": "Kazakh",
      "fr-FR": "kazakh",
      "es-ES": "kazajo",
      "de-DE": "Kasachisch"
    }
  },
  "cym": {
    "english": "Welsh",
    "native": "Cymraeg",
    "byLocale": {
      "zh-CN": "威尔士语",
      "en-US": "Welsh",
      "fr-FR": "gallois",
      "es-ES": "galés",
      "de-DE": "Walisisch"
    }
  },
  "msa": {
    "english": "Malay",
    "native": "Melayu",
    "byLocale": {
      "zh-CN": "马来语",
      "en-US": "Malay",
      "fr-FR": "malais",
      "es-ES": "malayo",
      "de-DE": "Malaiisch"
    }
  },
  "ina": {
    "english": "Interlingua (International Auxiliary Language Association)",
    "native": "interlingua",
    "byLocale": {
      "zh-CN": "国际语",
      "en-US": "Interlingua",
      "fr-FR": "interlingua",
      "es-ES": "interlingua",
      "de-DE": "Interlingua"
    }
  },
  "yid": {
    "english": "Yiddish",
    "native": "ייִדיש",
    "byLocale": {
      "zh-CN": "意第绪语",
      "en-US": "Yiddish",
      "fr-FR": "yiddish",
      "es-ES": "yidis",
      "de-DE": "Jiddisch"
    }
  },
  "mkd": {
    "english": "Macedonian",
    "native": "македонски",
    "byLocale": {
      "zh-CN": "马其顿语",
      "en-US": "Macedonian",
      "fr-FR": "macédonien",
      "es-ES": "macedonio",
      "de-DE": "Mazedonisch"
    }
  },
  "grc": {
    "english": "Ancient Greek",
    "byLocale": {
      "zh-CN": "古希腊语",
      "en-US": "Ancient Greek",
      "fr-FR": "grec ancien",
      "es-ES": "griego antiguo",
      "de-DE": "Altgriechisch"
    }
  },
  "kur": {
    "english": "Kurdish",
    "native": "Kurdî",
    "byLocale": {
      "zh-CN": "库尔德语",
      "en-US": "Kurdish",
      "fr-FR": "kurde",
      "es-ES": "kurdo",
      "de-DE": "Kurdisch"
    }
  },
  "lfn": {
    "english": "Lingua Franca Nova",
    "byLocale": {
      "en-US": "Lingua Franca Nova",
      "fr-FR": "lingua franca nova",
      "de-DE": "Lingua Franca Nova"
    }
  },
  "mon": {
    "english": "Mongolian",
    "native": "монгол",
    "byLocale": {
      "zh-CN": "蒙古语",
      "en-US": "Mongolian",
      "fr-FR": "mongol",
      "es-ES": "mongol",
      "de-DE": "Mongolisch"
    }
  },
  "ido": {
    "english": "Ido",
    "byLocale": {
      "zh-CN": "伊多语",
      "en-US": "Ido",
      "fr-FR": "ido",
      "es-ES": "ido",
      "de-DE": "Ido"
    }
  },
  "glg": {
    "english": "Galician",
    "native": "galego",
    "byLocale": {
      "zh-CN": "加利西亚语",
      "en-US": "Galician",
      "fr-FR": "galicien",
      "es-ES": "gallego",
      "de-DE": "Galicisch"
    }
  },
  "tel": {
    "english": "Telugu",
    "native": "తెలుగు",
    "byLocale": {
      "zh-CN": "泰卢固语",
      "en-US": "Telugu",
      "fr-FR": "télougou",
      "es-ES": "telugu",
      "de-DE": "Telugu"
    }
  },
  "mlt": {
    "english": "Maltese",
    "native": "Malti",
    "byLocale": {
      "zh-CN": "马耳他语",
      "en-US": "Maltese",
      "fr-FR": "maltais",
      "es-ES": "maltés",
      "de-DE": "Maltesisch"
    }
  },
  "pus": {
    "english": "Pashto",
    "native": "پښتو",
    "byLocale": {
      "zh-CN": "普什图语",
      "en-US": "Pashto",
      "fr-FR": "pachto",
      "es-ES": "pastún",
      "de-DE": "Paschtu"
    }
  },
  "tat": {
    "english": "Tatar",
    "native": "татар",
    "byLocale": {
      "zh-CN": "鞑靼语",
      "en-US": "Tatar",
      "fr-FR": "tatar",
      "es-ES": "tártaro",
      "de-DE": "Tatarisch"
    }
  },
  "pan": {
    "english": "Punjabi",
    "native": "ਪੰਜਾਬੀ",
    "byLocale": {
      "zh-CN": "旁遮普语",
      "en-US": "Punjabi",
      "fr-FR": "pendjabi",
      "es-ES": "punyabí",
      "de-DE": "Punjabi"
    }
  },
  "uzb": {
    "english": "Uzbek",
    "native": "o‘zbek",
    "byLocale": {
      "zh-CN": "乌兹别克语",
      "en-US": "Uzbek",
      "fr-FR": "ouzbek",
      "es-ES": "uzbeko",
      "de-DE": "Usbekisch"
    }
  },
  "ltz": {
    "english": "Luxembourgish",
    "native": "Lëtzebuergesch",
    "byLocale": {
      "zh-CN": "卢森堡语",
      "en-US": "Luxembourgish",
      "fr-FR": "luxembourgeois",
      "es-ES": "luxemburgués",
      "de-DE": "Luxemburgisch"
    }
  },
  "nep": {
    "english": "Nepali",
    "native": "नेपाली",
    "byLocale": {
      "zh-CN": "尼泊尔语",
      "en-US": "Nepali",
      "fr-FR": "népalais",
      "es-ES": "nepalí",
      "de-DE": "Nepalesisch"
    }
  },
  "gla": {
    "english": "Scottish Gaelic",
    "native": "Gàidhlig",
    "byLocale": {
      "zh-CN": "苏格兰盖尔语",
      "en-US": "Scottish Gaelic",
      "fr-FR": "gaélique écossais",
      "es-ES": "gaélico escocés",
      "de-DE": "Gälisch (Schottland)"
    }
  },
  "bre": {
    "english": "Breton",
    "native": "brezhoneg",
    "byLocale": {
      "zh-CN": "布列塔尼语",
      "en-US": "Breton",
      "fr-FR": "breton",
      "es-ES": "bretón",
      "de-DE": "Bretonisch"
    }
  },
  "cmn": {
    "english": "Mandarin",
    "native": "普通话",
    "byLocale": {
      "fr-FR": "mandarin",
      "es-ES": "mandarín",
      "de-DE": "Mandarin",
      "zh-CN": "普通话",
      "en-US": "Mandarin"
    }
  },
  "kir": {
    "english": "Kyrgyz",
    "native": "кыргызча",
    "byLocale": {
      "zh-CN": "吉尔吉斯语",
      "en-US": "Kyrgyz",
      "fr-FR": "kirghize",
      "es-ES": "kirguís",
      "de-DE": "Kirgisisch"
    }
  },
  "fao": {
    "english": "Faroese",
    "native": "føroyskt",
    "byLocale": {
      "zh-CN": "法罗语",
      "en-US": "Faroese",
      "fr-FR": "féroïen",
      "es-ES": "feroés",
      "de-DE": "Färöisch"
    }
  },
  "amh": {
    "english": "Amharic",
    "native": "አማርኛ",
    "byLocale": {
      "zh-CN": "阿姆哈拉语",
      "en-US": "Amharic",
      "fr-FR": "amharique",
      "es-ES": "amárico",
      "de-DE": "Amharisch"
    }
  },
  "kan": {
    "english": "Kannada",
    "native": "ಕನ್ನಡ",
    "byLocale": {
      "zh-CN": "卡纳达语",
      "en-US": "Kannada",
      "fr-FR": "kannada",
      "es-ES": "canarés",
      "de-DE": "Kannada"
    }
  },
  "mar": {
    "english": "Marathi",
    "native": "मराठी",
    "byLocale": {
      "zh-CN": "马拉地语",
      "en-US": "Marathi",
      "fr-FR": "marathi",
      "es-ES": "maratí",
      "de-DE": "Marathi"
    }
  },
  "tgl": {
    "english": "Tagalog",
    "native": "Tagalog",
    "byLocale": {
      "zh-CN": "他加禄语",
      "en-US": "Tagalog",
      "fr-FR": "tagalog",
      "es-ES": "tagalo",
      "de-DE": "Tagalog"
    }
  },
  "roh": {
    "english": "Romansh",
    "native": "rumantsch",
    "byLocale": {
      "zh-CN": "罗曼什语",
      "en-US": "Romansh",
      "fr-FR": "romanche",
      "es-ES": "romanche",
      "de-DE": "Rätoromanisch"
    }
  },
  "bak": {
    "english": "Bashkir",
    "byLocale": {
      "zh-CN": "巴什基尔语",
      "en-US": "Bashkir",
      "fr-FR": "bachkir",
      "es-ES": "baskir",
      "de-DE": "Baschkirisch"
    }
  },
  "mal": {
    "english": "Malayalam",
    "native": "മലയാളം",
    "byLocale": {
      "zh-CN": "马拉雅拉姆语",
      "en-US": "Malayalam",
      "fr-FR": "malayalam",
      "es-ES": "malayálam",
      "de-DE": "Malayalam"
    }
  },
  "mya": {
    "english": "Burmese",
    "native": "မြန်မာ",
    "byLocale": {
      "zh-CN": "缅甸语",
      "en-US": "Burmese",
      "fr-FR": "birman",
      "es-ES": "birmano",
      "de-DE": "Birmanisch"
    }
  },
  "que": {
    "english": "Quechua",
    "native": "Runasimi",
    "byLocale": {
      "zh-CN": "克丘亚语",
      "en-US": "Quechua",
      "fr-FR": "quechua",
      "es-ES": "quechua",
      "de-DE": "Quechua"
    }
  },
  "jav": {
    "english": "Javanese",
    "native": "Jawa",
    "byLocale": {
      "zh-CN": "爪哇语",
      "en-US": "Javanese",
      "fr-FR": "javanais",
      "es-ES": "javanés",
      "de-DE": "Javanisch"
    }
  },
  "uig": {
    "english": "Uyghur",
    "native": "ئۇيغۇرچە",
    "byLocale": {
      "zh-CN": "维吾尔语",
      "en-US": "Uyghur",
      "fr-FR": "ouïghour",
      "es-ES": "uigur",
      "de-DE": "Uigurisch"
    }
  },
  "mri": {
    "english": "Māori",
    "native": "Māori",
    "byLocale": {
      "zh-CN": "毛利语",
      "en-US": "Māori",
      "fr-FR": "maori",
      "es-ES": "maorí",
      "de-DE": "Māori"
    }
  },
  "tgk": {
    "english": "Tajik",
    "native": "тоҷикӣ",
    "byLocale": {
      "zh-CN": "塔吉克语",
      "en-US": "Tajik",
      "fr-FR": "tadjik",
      "es-ES": "tayiko",
      "de-DE": "Tadschikisch"
    }
  },
  "tuk": {
    "english": "Turkmen",
    "native": "türkmen dili",
    "byLocale": {
      "zh-CN": "土库曼语",
      "en-US": "Turkmen",
      "fr-FR": "turkmène",
      "es-ES": "turcomano",
      "de-DE": "Turkmenisch"
    }
  },
  "abk": {
    "english": "Abkhaz",
    "byLocale": {
      "zh-CN": "阿布哈西亚语",
      "en-US": "Abkhazian",
      "fr-FR": "abkhaze",
      "es-ES": "abjasio",
      "de-DE": "Abchasisch"
    }
  },
  "guj": {
    "english": "Gujarati",
    "native": "ગુજરાતી",
    "byLocale": {
      "zh-CN": "古吉拉特语",
      "en-US": "Gujarati",
      "fr-FR": "goudjarati",
      "es-ES": "guyaratí",
      "de-DE": "Gujarati"
    }
  },
  "szl": {
    "english": "Silesian",
    "native": "ślōnski",
    "byLocale": {
      "zh-CN": "西里西亚语",
      "en-US": "Silesian",
      "fr-FR": "silésien",
      "es-ES": "silesio",
      "de-DE": "Schlesisch (Wasserpolnisch)"
    }
  },
  "khm": {
    "english": "Khmer",
    "native": "ខ្មែរ",
    "byLocale": {
      "zh-CN": "高棉语",
      "en-US": "Khmer",
      "fr-FR": "khmer",
      "es-ES": "jemer",
      "de-DE": "Khmer"
    }
  },
  "zul": {
    "english": "Zulu",
    "native": "isiZulu",
    "byLocale": {
      "zh-CN": "祖鲁语",
      "en-US": "Zulu",
      "fr-FR": "zoulou",
      "es-ES": "zulú",
      "de-DE": "Zulu"
    }
  },
  "bod": {
    "english": "Tibetan",
    "native": "བོད་སྐད་",
    "byLocale": {
      "zh-CN": "藏语",
      "en-US": "Tibetan",
      "fr-FR": "tibétain",
      "es-ES": "tibetano",
      "de-DE": "Tibetisch"
    }
  },
  "che": {
    "english": "Chechen",
    "native": "нохчийн",
    "byLocale": {
      "zh-CN": "车臣语",
      "en-US": "Chechen",
      "fr-FR": "tchétchène",
      "es-ES": "checheno",
      "de-DE": "Tschetschenisch"
    }
  },
  "zza": {
    "english": "Zazaki",
    "byLocale": {
      "zh-CN": "扎扎语",
      "en-US": "Zaza",
      "fr-FR": "zazaki",
      "es-ES": "zazaki",
      "de-DE": "Zaza"
    }
  },
  "asm": {
    "english": "Assamese",
    "native": "অসমীয়া",
    "byLocale": {
      "zh-CN": "阿萨姆语",
      "en-US": "Assamese",
      "fr-FR": "assamais",
      "es-ES": "asamés",
      "de-DE": "Assamesisch"
    }
  },
  "cor": {
    "english": "Cornish",
    "native": "kernewek",
    "byLocale": {
      "zh-CN": "康沃尔语",
      "en-US": "Cornish",
      "fr-FR": "cornique",
      "es-ES": "córnico",
      "de-DE": "Kornisch"
    }
  },
  "chv": {
    "english": "Chuvash",
    "native": "чӑваш",
    "byLocale": {
      "zh-CN": "楚瓦什语",
      "en-US": "Chuvash",
      "fr-FR": "tchouvache",
      "es-ES": "chuvasio",
      "de-DE": "Tschuwaschisch"
    }
  },
  "haw": {
    "english": "Hawaiian",
    "native": "ʻŌlelo Hawaiʻi",
    "byLocale": {
      "zh-CN": "夏威夷语",
      "en-US": "Hawaiian",
      "fr-FR": "hawaïen",
      "es-ES": "hawaiano",
      "de-DE": "Hawaiisch"
    }
  },
  "sco": {
    "english": "Scots",
    "byLocale": {
      "zh-CN": "苏格兰语",
      "en-US": "Scots",
      "fr-FR": "écossais",
      "es-ES": "escocés",
      "de-DE": "Schottisch"
    }
  },
  "vol": {
    "english": "Volapük",
    "byLocale": {
      "zh-CN": "沃拉普克语",
      "en-US": "Volapük",
      "fr-FR": "volapük",
      "es-ES": "volapük",
      "de-DE": "Volapük"
    }
  },
  "hbs": {
    "english": "Serbo-Croatian",
    "native": "srpskohrvatski",
    "byLocale": {
      "zh-CN": "塞尔维亚-克罗地亚语",
      "en-US": "Serbo-Croatian",
      "fr-FR": "serbo-croate",
      "es-ES": "serbocroata",
      "de-DE": "Serbo-Kroatisch"
    }
  },
  "hau": {
    "english": "Hausa",
    "native": "Hausa",
    "byLocale": {
      "zh-CN": "豪萨语",
      "en-US": "Hausa",
      "fr-FR": "haoussa",
      "es-ES": "hausa",
      "de-DE": "Haussa"
    }
  },
  "grn": {
    "english": "Guarani",
    "byLocale": {
      "zh-CN": "瓜拉尼语",
      "en-US": "Guarani",
      "fr-FR": "guarani",
      "es-ES": "guaraní",
      "de-DE": "Guaraní"
    }
  },
  "som": {
    "english": "Somali",
    "native": "Soomaali",
    "byLocale": {
      "zh-CN": "索马里语",
      "en-US": "Somali",
      "fr-FR": "somali",
      "es-ES": "somalí",
      "de-DE": "Somali"
    }
  },
  "mlg": {
    "english": "Malagasy",
    "native": "Malagasy",
    "byLocale": {
      "zh-CN": "马拉加斯语",
      "en-US": "Malagasy",
      "fr-FR": "malgache",
      "es-ES": "malgache",
      "de-DE": "Malagasy"
    }
  },
  "srd": {
    "english": "Sardinian",
    "native": "sardu",
    "byLocale": {
      "zh-CN": "萨丁语",
      "en-US": "Sardinian",
      "fr-FR": "sarde",
      "es-ES": "sardo",
      "de-DE": "Sardisch"
    }
  },
  "ory": {
    "english": "Odia",
    "native": "ଓଡ଼ିଆ",
    "byLocale": {
      "zh-CN": "奥里亚语",
      "en-US": "Odia",
      "fr-FR": "odia",
      "es-ES": "oriya",
      "de-DE": "Oriya"
    }
  },
  "glv": {
    "english": "Manx",
    "native": "Gaelg",
    "byLocale": {
      "zh-CN": "马恩语",
      "en-US": "Manx",
      "fr-FR": "mannois",
      "es-ES": "manés",
      "de-DE": "Manx"
    }
  },
  "arg": {
    "english": "Aragonese",
    "byLocale": {
      "zh-CN": "阿拉贡语",
      "en-US": "Aragonese",
      "fr-FR": "aragonais",
      "es-ES": "aragonés",
      "de-DE": "Aragonesisch"
    }
  },
  "crh": {
    "english": "Crimean Tatar",
    "byLocale": {
      "zh-CN": "克里米亚鞑靼语",
      "en-US": "Crimean Tatar",
      "fr-FR": "tatar de Crimée",
      "es-ES": "tártaro de Crimea",
      "de-DE": "Krimtatarisch"
    }
  },
  "lao": {
    "english": "Lao",
    "native": "ລາວ",
    "byLocale": {
      "zh-CN": "老挝语",
      "en-US": "Lao",
      "fr-FR": "lao",
      "es-ES": "lao",
      "de-DE": "Laotisch"
    }
  },
  "sah": {
    "english": "Yakut",
    "native": "саха тыла",
    "byLocale": {
      "zh-CN": "萨哈语",
      "en-US": "Yakut",
      "fr-FR": "iakoute",
      "es-ES": "sakha",
      "de-DE": "Jakutisch"
    }
  },
  "cop": {
    "english": "Coptic",
    "byLocale": {
      "zh-CN": "科普特语",
      "en-US": "Coptic",
      "fr-FR": "copte",
      "es-ES": "copto",
      "de-DE": "Koptisch"
    }
  },
  "pli": {
    "english": "Pali",
    "byLocale": {
      "zh-CN": "巴利语",
      "en-US": "Pali",
      "fr-FR": "pali",
      "es-ES": "pali",
      "de-DE": "Pali"
    }
  },
  "xho": {
    "english": "Xhosa",
    "native": "IsiXhosa",
    "byLocale": {
      "zh-CN": "科萨语",
      "en-US": "Xhosa",
      "fr-FR": "xhosa",
      "es-ES": "xhosa",
      "de-DE": "Xhosa"
    }
  },
  "csb": {
    "english": "Kashubian",
    "byLocale": {
      "zh-CN": "卡舒比语",
      "en-US": "Kashubian",
      "fr-FR": "kachoube",
      "es-ES": "casubio",
      "de-DE": "Kaschubisch"
    }
  },
  "arn": {
    "english": "Mapudungun",
    "byLocale": {
      "zh-CN": "马普切语",
      "en-US": "Mapuche",
      "fr-FR": "mapuche",
      "es-ES": "mapuche",
      "de-DE": "Mapudungun"
    }
  },
  "sin": {
    "english": "Sinhala",
    "native": "සිංහල",
    "byLocale": {
      "zh-CN": "僧伽罗语",
      "en-US": "Sinhala",
      "fr-FR": "cingalais",
      "es-ES": "cingalés",
      "de-DE": "Singhalesisch"
    }
  },
  "ang": {
    "english": "Old English",
    "byLocale": {
      "zh-CN": "古英语",
      "en-US": "Old English",
      "fr-FR": "ancien anglais",
      "es-ES": "inglés antiguo",
      "de-DE": "Altenglisch"
    }
  },
  "kas": {
    "english": "Kashmiri",
    "native": "کٲشُر",
    "byLocale": {
      "zh-CN": "克什米尔语",
      "en-US": "Kashmiri",
      "fr-FR": "cachemiri",
      "es-ES": "cachemir",
      "de-DE": "Kaschmiri"
    }
  },
  "got": {
    "english": "Gothic",
    "byLocale": {
      "zh-CN": "哥特语",
      "en-US": "Gothic",
      "fr-FR": "gotique",
      "es-ES": "gótico",
      "de-DE": "Gotisch"
    }
  },
  "egy": {
    "english": "Egyptian",
    "byLocale": {
      "zh-CN": "古埃及语",
      "en-US": "Ancient Egyptian",
      "fr-FR": "égyptien ancien",
      "es-ES": "egipcio antiguo",
      "de-DE": "Ägyptisch"
    }
  },
  "rom": {
    "english": "Romani",
    "byLocale": {
      "zh-CN": "吉普赛语",
      "en-US": "Romany",
      "fr-FR": "romani",
      "es-ES": "romaní",
      "de-DE": "Romani"
    }
  },
  "snd": {
    "english": "Sindhi",
    "native": "سنڌي",
    "byLocale": {
      "zh-CN": "信德语",
      "en-US": "Sindhi",
      "fr-FR": "sindhi",
      "es-ES": "sindi",
      "de-DE": "Sindhi"
    }
  },
  "cos": {
    "english": "Corsican",
    "byLocale": {
      "zh-CN": "科西嘉语",
      "en-US": "Corsican",
      "fr-FR": "corse",
      "es-ES": "corso",
      "de-DE": "Korsisch"
    }
  },
  "ceb": {
    "english": "Cebuano",
    "native": "Cebuano",
    "byLocale": {
      "zh-CN": "宿务语",
      "en-US": "Cebuano",
      "fr-FR": "cebuano",
      "es-ES": "cebuano",
      "de-DE": "Cebuano"
    }
  },
  "nds": {
    "english": "Low German",
    "native": "Neddersass’sch",
    "byLocale": {
      "zh-CN": "低地德语",
      "en-US": "Low German",
      "fr-FR": "bas-allemand",
      "es-ES": "bajo alemán",
      "de-DE": "Niederdeutsch"
    }
  },
  "aym": {
    "english": "Aymara",
    "byLocale": {
      "zh-CN": "艾马拉语",
      "en-US": "Aymara",
      "fr-FR": "aymara",
      "es-ES": "aimara",
      "de-DE": "Aymara"
    }
  },
  "scn": {
    "english": "Sicilian",
    "byLocale": {
      "zh-CN": "西西里语",
      "en-US": "Sicilian",
      "fr-FR": "sicilien",
      "es-ES": "siciliano",
      "de-DE": "Sizilianisch"
    }
  },
  "ast": {
    "english": "Asturian",
    "native": "asturianu",
    "byLocale": {
      "zh-CN": "阿斯图里亚斯语",
      "en-US": "Asturian",
      "fr-FR": "asturien",
      "es-ES": "asturiano",
      "de-DE": "Asturisch"
    }
  },
  "dzo": {
    "english": "Dzongkha",
    "native": "རྫོང་ཁ",
    "byLocale": {
      "zh-CN": "宗卡语",
      "en-US": "Dzongkha",
      "fr-FR": "dzongkha",
      "es-ES": "dzongkha",
      "de-DE": "Dzongkha"
    }
  },
  "tok": {
    "english": "Toki Pona",
    "native": "toki pona",
    "byLocale": {
      "zh-CN": "道本语",
      "en-US": "Toki Pona",
      "fr-FR": "toki pona",
      "es-ES": "toki pona",
      "de-DE": "Toki Pona"
    }
  },
  "kal": {
    "english": "Greenlandic",
    "native": "kalaallisut",
    "byLocale": {
      "zh-CN": "格陵兰语",
      "en-US": "Kalaallisut",
      "fr-FR": "groenlandais",
      "es-ES": "groenlandés",
      "de-DE": "Grönländisch"
    }
  },
  "ava": {
    "english": "Avar",
    "byLocale": {
      "zh-CN": "阿瓦尔语",
      "en-US": "Avaric",
      "fr-FR": "avar",
      "es-ES": "avar",
      "de-DE": "Awarisch"
    }
  },
  "sun": {
    "english": "Sundanese",
    "native": "Basa Sunda",
    "byLocale": {
      "zh-CN": "巽他语",
      "en-US": "Sundanese",
      "fr-FR": "soundanais",
      "es-ES": "sundanés",
      "de-DE": "Sundanesisch"
    }
  },
  "wln": {
    "english": "Walloon",
    "byLocale": {
      "zh-CN": "瓦隆语",
      "en-US": "Walloon",
      "fr-FR": "wallon",
      "es-ES": "valón",
      "de-DE": "Wallonisch"
    }
  },
  "cnr": {
    "english": "Montenegrin",
    "native": "crnogorski",
    "byLocale": {
      "zh-CN": "黑山语",
      "en-US": "Montenegrin",
      "fr-FR": "monténégrin",
      "es-ES": "montenegrino",
      "de-DE": "Montenegrinisch"
    }
  },
  "prs": {
    "english": "Dari",
    "native": "دری",
    "byLocale": {
      "zh-CN": "达里语",
      "en-US": "Dari",
      "fr-FR": "dari",
      "es-ES": "darí",
      "de-DE": "Dari"
    }
  },
  "nap": {
    "english": "Neapolitan",
    "byLocale": {
      "zh-CN": "那不勒斯语",
      "en-US": "Neapolitan",
      "fr-FR": "napolitain",
      "es-ES": "napolitano",
      "de-DE": "Neapolitanisch"
    }
  },
  "tir": {
    "english": "Tigrinya",
    "native": "ትግርኛ",
    "byLocale": {
      "zh-CN": "提格利尼亚语",
      "en-US": "Tigrinya",
      "fr-FR": "tigrigna",
      "es-ES": "tigriña",
      "de-DE": "Tigrinya"
    }
  },
  "ain": {
    "english": "Ainu",
    "byLocale": {
      "zh-CN": "阿伊努语",
      "en-US": "Ainu",
      "fr-FR": "aïnou",
      "es-ES": "ainu",
      "de-DE": "Ainu"
    }
  },
  "udm": {
    "english": "Udmurt",
    "byLocale": {
      "zh-CN": "乌德穆尔特语",
      "en-US": "Udmurt",
      "fr-FR": "oudmourte",
      "es-ES": "udmurt",
      "de-DE": "Udmurtisch"
    }
  },
  "akk": {
    "english": "Akkadian",
    "byLocale": {
      "zh-CN": "阿卡德语",
      "en-US": "Akkadian",
      "fr-FR": "akkadien",
      "es-ES": "acadio",
      "de-DE": "Akkadisch"
    }
  },
  "gag": {
    "english": "Gagauz",
    "byLocale": {
      "zh-CN": "加告兹语",
      "en-US": "Gagauz",
      "fr-FR": "gagaouze",
      "es-ES": "gagauzo",
      "de-DE": "Gagausisch"
    }
  },
  "ibo": {
    "english": "Igbo",
    "native": "Igbo",
    "byLocale": {
      "zh-CN": "伊博语",
      "en-US": "Igbo",
      "fr-FR": "igbo",
      "es-ES": "igbo",
      "de-DE": "Igbo"
    }
  },
  "krl": {
    "english": "Karelian",
    "byLocale": {
      "zh-CN": "卡累利阿语",
      "en-US": "Karelian",
      "fr-FR": "carélien",
      "es-ES": "carelio",
      "de-DE": "Karelisch"
    }
  },
  "ave": {
    "english": "Avestan",
    "byLocale": {
      "zh-CN": "阿维斯塔语",
      "en-US": "Avestan",
      "fr-FR": "avestique",
      "es-ES": "avéstico",
      "de-DE": "Avestisch"
    }
  },
  "div": {
    "english": "Dhivehi",
    "byLocale": {
      "zh-CN": "迪维希语",
      "en-US": "Dhivehi",
      "fr-FR": "maldivien",
      "es-ES": "divehi",
      "de-DE": "Dhivehi"
    }
  },
  "isv": {
    "english": "Interslavic"
  },
  "tyv": {
    "english": "Tuvan",
    "byLocale": {
      "zh-CN": "图瓦语",
      "en-US": "Tuvinian",
      "fr-FR": "touvain",
      "es-ES": "tuviniano",
      "de-DE": "Tuwinisch"
    }
  },
  "lmo": {
    "english": "Lombard",
    "native": "Lombard",
    "byLocale": {
      "zh-CN": "伦巴第语",
      "en-US": "Lombard",
      "fr-FR": "lombard",
      "es-ES": "lombardo",
      "de-DE": "Lombardisch"
    }
  },
  "ota": {
    "english": "Ottoman Turkish",
    "byLocale": {
      "zh-CN": "奥斯曼土耳其语",
      "en-US": "Ottoman Turkish",
      "fr-FR": "turc ottoman",
      "es-ES": "turco otomano",
      "de-DE": "Osmanisch"
    }
  },
  "myv": {
    "english": "Erzya",
    "byLocale": {
      "zh-CN": "厄尔兹亚语",
      "en-US": "Erzya",
      "fr-FR": "erzya",
      "es-ES": "erzya",
      "de-DE": "Ersja-Mordwinisch"
    }
  },
  "bal": {
    "english": "Balochi",
    "byLocale": {
      "zh-CN": "俾路支语",
      "en-US": "Baluchi",
      "fr-FR": "baloutchi",
      "es-ES": "baluchi",
      "de-DE": "Belutschisch"
    }
  },
  "yor": {
    "english": "Yoruba",
    "native": "Èdè Yorùbá",
    "byLocale": {
      "zh-CN": "约鲁巴语",
      "en-US": "Yoruba",
      "fr-FR": "yoruba",
      "es-ES": "yoruba",
      "de-DE": "Yoruba"
    }
  },
  "pms": {
    "english": "Piedmontese",
    "byLocale": {
      "en-US": "Piedmontese",
      "fr-FR": "piémontais",
      "de-DE": "Piemontesisch"
    }
  },
  "ady": {
    "english": "Adyghe",
    "byLocale": {
      "zh-CN": "阿迪格语",
      "en-US": "Adyghe",
      "fr-FR": "adyguéen",
      "es-ES": "adigué",
      "de-DE": "Adygeisch"
    }
  },
  "wol": {
    "english": "Wolof",
    "native": "Wolof",
    "byLocale": {
      "zh-CN": "沃洛夫语",
      "en-US": "Wolof",
      "fr-FR": "wolof",
      "es-ES": "wólof",
      "de-DE": "Wolof"
    }
  },
  "fur": {
    "english": "Friulian",
    "native": "furlan",
    "byLocale": {
      "zh-CN": "弗留利语",
      "en-US": "Friulian",
      "fr-FR": "frioulan",
      "es-ES": "friulano",
      "de-DE": "Friaulisch"
    }
  },
  "smo": {
    "english": "Samoan",
    "byLocale": {
      "zh-CN": "萨摩亚语",
      "en-US": "Samoan",
      "fr-FR": "samoan",
      "es-ES": "samoano",
      "de-DE": "Samoanisch"
    }
  },
  "rue": {
    "english": "Rusyn",
    "byLocale": {
      "en-US": "Rusyn",
      "fr-FR": "ruthène",
      "de-DE": "Russinisch"
    }
  },
  "sot": {
    "english": "Sesotho",
    "native": "Sesotho",
    "byLocale": {
      "zh-CN": "南索托语",
      "en-US": "Southern Sotho",
      "fr-FR": "sotho du Sud",
      "es-ES": "sotho meridional",
      "de-DE": "Süd-Sotho"
    }
  },
  "hat": {
    "english": "Haitian Creole",
    "byLocale": {
      "zh-CN": "海地克里奥尔语",
      "en-US": "Haitian Creole",
      "fr-FR": "créole haïtien",
      "es-ES": "criollo haitiano",
      "de-DE": "Haiti-Kreolisch"
    }
  },
  "syc": {
    "english": "Syriac",
    "byLocale": {
      "zh-CN": "古典叙利亚语",
      "en-US": "Classical Syriac",
      "fr-FR": "syriaque classique",
      "es-ES": "siríaco clásico",
      "de-DE": "Altsyrisch"
    }
  },
  "kom": {
    "english": "Komi",
    "byLocale": {
      "zh-CN": "科米语",
      "en-US": "Komi",
      "fr-FR": "komi",
      "es-ES": "komi",
      "de-DE": "Komi"
    }
  },
  "kin": {
    "english": "Kinyarwanda",
    "native": "Ikinyarwanda",
    "byLocale": {
      "zh-CN": "卢旺达语",
      "en-US": "Kinyarwanda",
      "fr-FR": "kinyarwanda",
      "es-ES": "kinyarwanda",
      "de-DE": "Kinyarwanda"
    }
  },
  "hif": {
    "english": "Fiji Hindi",
    "byLocale": {
      "en-US": "Fiji Hindi",
      "fr-FR": "hindi fidjien",
      "de-DE": "Fidschi-Hindi"
    }
  },
  "tpi": {
    "english": "Tok Pisin",
    "byLocale": {
      "zh-CN": "托克皮辛语",
      "en-US": "Tok Pisin",
      "fr-FR": "tok pisin",
      "es-ES": "tok pisin",
      "de-DE": "Neumelanesisch"
    }
  },
  "nav": {
    "english": "Navajo",
    "byLocale": {
      "zh-CN": "纳瓦霍语",
      "en-US": "Navajo",
      "fr-FR": "navajo",
      "es-ES": "navajo",
      "de-DE": "Navajo"
    }
  },
  "ton": {
    "english": "Tongan",
    "native": "lea fakatonga",
    "byLocale": {
      "zh-CN": "汤加语",
      "en-US": "Tongan",
      "fr-FR": "tongien",
      "es-ES": "tongano",
      "de-DE": "Tongaisch"
    }
  },
  "nob": {
    "english": "Bokmål",
    "native": "norsk bokmål",
    "byLocale": {
      "zh-CN": "书面挪威语",
      "en-US": "Norwegian Bokmål",
      "fr-FR": "norvégien bokmål",
      "es-ES": "noruego bokmal",
      "de-DE": "Norwegisch (Bokmål)"
    }
  },
  "nno": {
    "english": "Nynorsk",
    "native": "norsk nynorsk",
    "byLocale": {
      "zh-CN": "挪威尼诺斯克语",
      "en-US": "Norwegian Nynorsk",
      "fr-FR": "norvégien nynorsk",
      "es-ES": "noruego nynorsk",
      "de-DE": "Norwegisch (Nynorsk)"
    }
  },
  "kok": {
    "english": "Konkani",
    "native": "कोंकणी",
    "byLocale": {
      "zh-CN": "孔卡尼语",
      "en-US": "Konkani",
      "fr-FR": "konkani",
      "es-ES": "konkaní",
      "de-DE": "Konkani"
    }
  },
  "mai": {
    "english": "Maithili",
    "native": "मैथिली",
    "byLocale": {
      "zh-CN": "迈蒂利语",
      "en-US": "Maithili",
      "fr-FR": "maïthili",
      "es-ES": "maithili",
      "de-DE": "Maithili"
    }
  },
  "mnc": {
    "english": "Manchu",
    "byLocale": {
      "zh-CN": "满语",
      "en-US": "Manchu",
      "fr-FR": "mandchou",
      "es-ES": "manchú",
      "de-DE": "Mandschurisch"
    }
  },
  "liv": {
    "english": "Livonian",
    "byLocale": {
      "en-US": "Livonian",
      "fr-FR": "livonien",
      "de-DE": "Livisch"
    }
  },
  "nov": {
    "english": "Novial",
    "byLocale": {
      "en-US": "Novial",
      "fr-FR": "novial",
      "de-DE": "Novial"
    }
  },
  "tsn": {
    "english": "Tswana",
    "native": "Setswana",
    "byLocale": {
      "zh-CN": "茨瓦纳语",
      "en-US": "Tswana",
      "fr-FR": "tswana",
      "es-ES": "setsuana",
      "de-DE": "Tswana"
    }
  },
  "vec": {
    "english": "Venetian",
    "native": "veneto",
    "byLocale": {
      "zh-CN": "威尼斯语",
      "en-US": "Venetian",
      "fr-FR": "vénitien",
      "es-ES": "veneciano",
      "de-DE": "Venetisch"
    }
  },
  "sux": {
    "english": "Sumerian",
    "byLocale": {
      "zh-CN": "苏美尔语",
      "en-US": "Sumerian",
      "fr-FR": "sumérien",
      "es-ES": "sumerio",
      "de-DE": "Sumerisch"
    }
  },
  "hsb": {
    "english": "Upper Sorbian",
    "native": "hornjoserbšćina",
    "byLocale": {
      "zh-CN": "上索布语",
      "en-US": "Upper Sorbian",
      "fr-FR": "haut-sorabe",
      "es-ES": "alto sorbio",
      "de-DE": "Obersorbisch"
    }
  },
  "lim": {
    "english": "Limburgish language",
    "byLocale": {
      "zh-CN": "林堡语",
      "en-US": "Limburgish",
      "fr-FR": "limbourgeois",
      "es-ES": "limburgués",
      "de-DE": "Limburgisch"
    }
  },
  "tlh": {
    "english": "Klingon",
    "byLocale": {
      "zh-CN": "克林贡语",
      "en-US": "Klingon",
      "fr-FR": "klingon",
      "es-ES": "klingon",
      "de-DE": "Klingonisch"
    }
  },
  "new": {
    "english": "Newar",
    "byLocale": {
      "zh-CN": "尼瓦尔语",
      "en-US": "Newari",
      "fr-FR": "newari",
      "es-ES": "nevarí",
      "de-DE": "Newari"
    }
  },
  "bua": {
    "english": "Buryat",
    "byLocale": {
      "zh-CN": "布里亚特语",
      "en-US": "Buriat",
      "fr-FR": "bouriate",
      "es-ES": "buriato",
      "de-DE": "Burjatisch"
    }
  },
  "lld": {
    "english": "Ladin"
  },
  "sme": {
    "english": "Northern Sami",
    "native": "davvisámegiella",
    "byLocale": {
      "zh-CN": "北方萨米语",
      "en-US": "Northern Sami",
      "fr-FR": "same du Nord",
      "es-ES": "sami septentrional",
      "de-DE": "Nordsamisch"
    }
  },
  "ssw": {
    "english": "Swazi",
    "byLocale": {
      "zh-CN": "斯瓦蒂语",
      "en-US": "Swati",
      "fr-FR": "swati",
      "es-ES": "suazi",
      "de-DE": "Swazi"
    }
  },
  "aar": {
    "english": "Afar",
    "byLocale": {
      "zh-CN": "阿法尔语",
      "en-US": "Afar",
      "fr-FR": "afar",
      "es-ES": "afar",
      "de-DE": "Afar"
    }
  },
  "lez": {
    "english": "Lezgian",
    "byLocale": {
      "zh-CN": "列兹金语",
      "en-US": "Lezghian",
      "fr-FR": "lezghien",
      "es-ES": "lezgiano",
      "de-DE": "Lesgisch"
    }
  },
  "bho": {
    "english": "Bhojpuri",
    "native": "भोजपुरी",
    "byLocale": {
      "zh-CN": "博杰普尔语",
      "en-US": "Bhojpuri",
      "fr-FR": "bhodjpouri",
      "es-ES": "bhoyapurí",
      "de-DE": "Bhodschpuri"
    }
  },
  "kaa": {
    "english": "Karakalpak",
    "byLocale": {
      "zh-CN": "卡拉卡尔帕克语",
      "en-US": "Kara-Kalpak",
      "fr-FR": "karakalpak",
      "es-ES": "karakalpako",
      "de-DE": "Karakalpakisch"
    }
  },
  "dsb": {
    "english": "Lower Sorbian",
    "native": "dolnoserbšćina",
    "byLocale": {
      "zh-CN": "下索布语",
      "en-US": "Lower Sorbian",
      "fr-FR": "bas-sorabe",
      "es-ES": "bajo sorbio",
      "de-DE": "Niedersorbisch"
    }
  },
  "mni": {
    "english": "Meitei",
    "native": "মৈতৈলোন্",
    "byLocale": {
      "zh-CN": "曼尼普尔语",
      "en-US": "Manipuri",
      "fr-FR": "manipuri",
      "es-ES": "manipurí",
      "de-DE": "Meithei"
    }
  },
  "rup": {
    "english": "Aromanian",
    "byLocale": {
      "zh-CN": "阿罗马尼亚语",
      "en-US": "Aromanian",
      "fr-FR": "aroumain",
      "es-ES": "arrumano",
      "de-DE": "Aromunisch"
    }
  },
  "iku": {
    "english": "Inuktitut",
    "byLocale": {
      "zh-CN": "因纽特语",
      "en-US": "Inuktitut",
      "fr-FR": "inuktitut",
      "es-ES": "inuktitut",
      "de-DE": "Inuktitut"
    }
  },
  "nau": {
    "english": "Nauruan",
    "byLocale": {
      "zh-CN": "瑙鲁语",
      "en-US": "Nauru",
      "fr-FR": "nauruan",
      "es-ES": "nauruano",
      "de-DE": "Nauruisch"
    }
  },
  "pap": {
    "english": "Papiamento",
    "byLocale": {
      "zh-CN": "帕皮阿门托语",
      "en-US": "Papiamento",
      "fr-FR": "papiamento",
      "es-ES": "papiamento",
      "de-DE": "Papiamento"
    }
  },
  "bar": {
    "english": "Bavarian",
    "byLocale": {
      "en-US": "Bavarian",
      "fr-FR": "bavarois",
      "de-DE": "Bairisch"
    }
  },
  "run": {
    "english": "Kirundi",
    "native": "Ikirundi",
    "byLocale": {
      "zh-CN": "隆迪语",
      "en-US": "Rundi",
      "fr-FR": "roundi",
      "es-ES": "kirundi",
      "de-DE": "Rundi"
    }
  },
  "krc": {
    "english": "Karachay-Balkar",
    "byLocale": {
      "zh-CN": "卡拉恰伊巴尔卡尔语",
      "en-US": "Karachay-Balkar",
      "fr-FR": "karatchaï balkar",
      "es-ES": "karachay-balkar",
      "de-DE": "Karatschaiisch-Balkarisch"
    }
  },
  "tet": {
    "english": "Tetum",
    "byLocale": {
      "zh-CN": "德顿语",
      "en-US": "Tetum",
      "fr-FR": "tétoum",
      "es-ES": "tetún",
      "de-DE": "Tetum"
    }
  },
  "vep": {
    "english": "Veps",
    "byLocale": {
      "zh-CN": "维普森语",
      "en-US": "Veps",
      "fr-FR": "vepse",
      "de-DE": "Wepsisch"
    }
  },
  "non": {
    "english": "Old Norse",
    "byLocale": {
      "zh-CN": "古诺尔斯语",
      "en-US": "Old Norse",
      "fr-FR": "vieux norrois",
      "es-ES": "nórdico antiguo",
      "de-DE": "Altnordisch"
    }
  },
  "nya": {
    "english": "Chewa",
    "byLocale": {
      "zh-CN": "齐切瓦语",
      "en-US": "Nyanja",
      "fr-FR": "chewa",
      "es-ES": "nyanja",
      "de-DE": "Nyanja"
    }
  },
  "chr": {
    "english": "Cherokee",
    "native": "ᏣᎳᎩ",
    "byLocale": {
      "zh-CN": "切罗基语",
      "en-US": "Cherokee",
      "fr-FR": "cherokee",
      "es-ES": "cheroqui",
      "de-DE": "Cherokee"
    }
  },
  "wuu": {
    "english": "Wu Chinese",
    "native": "吴语",
    "byLocale": {
      "zh-CN": "吴语",
      "en-US": "Wu Chinese",
      "fr-FR": "chinois wu",
      "es-ES": "chino wu",
      "de-DE": "Wu-Chinesisch"
    }
  },
  "bam": {
    "english": "Bambara",
    "native": "bamanakan",
    "byLocale": {
      "zh-CN": "班巴拉语",
      "en-US": "Bambara",
      "fr-FR": "bambara",
      "es-ES": "bambara",
      "de-DE": "Bambara"
    }
  },
  "ful": {
    "english": "Fula",
    "native": "Pulaar",
    "byLocale": {
      "zh-CN": "富拉语",
      "en-US": "Fula",
      "fr-FR": "peul",
      "es-ES": "fula",
      "de-DE": "Ful"
    }
  },
  "inh": {
    "english": "Ingush",
    "byLocale": {
      "zh-CN": "印古什语",
      "en-US": "Ingush",
      "fr-FR": "ingouche",
      "es-ES": "ingush",
      "de-DE": "Inguschisch"
    }
  },
  "orm": {
    "english": "Oromo",
    "native": "Oromoo",
    "byLocale": {
      "zh-CN": "奥罗莫语",
      "en-US": "Oromo",
      "fr-FR": "oromo",
      "es-ES": "oromo",
      "de-DE": "Oromo"
    }
  },
  "ban": {
    "english": "Balinese",
    "byLocale": {
      "zh-CN": "巴厘语",
      "en-US": "Balinese",
      "fr-FR": "balinais",
      "es-ES": "balinés",
      "de-DE": "Balinesisch"
    }
  },
  "fij": {
    "english": "Fijian",
    "byLocale": {
      "zh-CN": "斐济语",
      "en-US": "Fijian",
      "fr-FR": "fidjien",
      "es-ES": "fiyiano",
      "de-DE": "Fidschi"
    }
  },
  "chm": {
    "english": "Mari",
    "byLocale": {
      "zh-CN": "马里语",
      "en-US": "Mari",
      "fr-FR": "mari",
      "es-ES": "marí",
      "de-DE": "Mari"
    }
  },
  "mdf": {
    "english": "Moksha",
    "byLocale": {
      "zh-CN": "莫克沙语",
      "en-US": "Moksha",
      "fr-FR": "mokcha",
      "es-ES": "moksha",
      "de-DE": "Mokschanisch"
    }
  },
  "sna": {
    "english": "Shona",
    "native": "chiShona",
    "byLocale": {
      "zh-CN": "绍纳语",
      "en-US": "Shona",
      "fr-FR": "shona",
      "es-ES": "shona",
      "de-DE": "Shona"
    }
  },
  "lij": {
    "english": "Ligurian",
    "native": "ligure",
    "byLocale": {
      "zh-CN": "利古里亚语",
      "en-US": "Ligurian",
      "fr-FR": "ligure",
      "es-ES": "ligur",
      "de-DE": "Ligurisch"
    }
  },
  "min": {
    "english": "Minangkabau",
    "byLocale": {
      "zh-CN": "米南佳保语",
      "en-US": "Minangkabau",
      "fr-FR": "minangkabau",
      "es-ES": "minangkabau",
      "de-DE": "Minangkabau"
    }
  },
  "sat": {
    "english": "Santali",
    "native": "ᱥᱟᱱᱛᱟᱲᱤ",
    "byLocale": {
      "zh-CN": "桑塔利语",
      "en-US": "Santali",
      "fr-FR": "santali",
      "es-ES": "santali",
      "de-DE": "Santali"
    }
  },
  "abq": {
    "english": "Abaza"
  },
  "ewe": {
    "english": "Ewe",
    "native": "eʋegbe",
    "byLocale": {
      "zh-CN": "埃维语",
      "en-US": "Ewe",
      "fr-FR": "éwé",
      "es-ES": "ewé",
      "de-DE": "Ewe"
    }
  },
  "bis": {
    "english": "Bislama",
    "byLocale": {
      "zh-CN": "比斯拉马语",
      "en-US": "Bislama",
      "fr-FR": "bichelamar",
      "es-ES": "bislama",
      "de-DE": "Bislama"
    }
  },
  "kbd": {
    "english": "Kabardian",
    "byLocale": {
      "zh-CN": "卡巴尔德语",
      "en-US": "Kabardian",
      "fr-FR": "kabarde",
      "es-ES": "kabardiano",
      "de-DE": "Kabardinisch"
    }
  },
  "nrf": {
    "english": "Norman"
  },
  "fry": {
    "english": "West Frisian",
    "native": "Frysk",
    "byLocale": {
      "zh-CN": "西弗里西亚语",
      "en-US": "Western Frisian",
      "fr-FR": "frison occidental",
      "es-ES": "frisón occidental",
      "de-DE": "Westfriesisch"
    }
  },
  "arz": {
    "english": "Egyptian Arabic",
    "byLocale": {
      "en-US": "Egyptian Arabic",
      "fr-FR": "arabe égyptien",
      "de-DE": "Ägyptisches Arabisch"
    }
  },
  "vro": {
    "english": "Võro",
    "byLocale": {
      "en-US": "Võro",
      "fr-FR": "võro",
      "de-DE": "Võro"
    }
  },
  "ilo": {
    "english": "Ilocano",
    "byLocale": {
      "zh-CN": "伊洛卡诺语",
      "en-US": "Iloko",
      "fr-FR": "ilocano",
      "es-ES": "ilocano",
      "de-DE": "Ilokano"
    }
  },
  "lin": {
    "english": "Lingala",
    "native": "lingála",
    "byLocale": {
      "zh-CN": "林加拉语",
      "en-US": "Lingala",
      "fr-FR": "lingala",
      "es-ES": "lingala",
      "de-DE": "Lingala"
    }
  },
  "jbo": {
    "english": "Lojban",
    "byLocale": {
      "zh-CN": "逻辑语",
      "en-US": "Lojban",
      "fr-FR": "lojban",
      "es-ES": "lojban",
      "de-DE": "Lojban"
    }
  },
  "mwl": {
    "english": "Mirandese",
    "byLocale": {
      "zh-CN": "米兰德斯语",
      "en-US": "Mirandese",
      "fr-FR": "mirandais",
      "es-ES": "mirandés",
      "de-DE": "Mirandesisch"
    }
  },
  "frp": {
    "english": "Arpitan language",
    "byLocale": {
      "en-US": "Arpitan",
      "fr-FR": "francoprovençal",
      "de-DE": "Frankoprovenzalisch"
    }
  },
  "tso": {
    "english": "Tsonga",
    "byLocale": {
      "zh-CN": "聪加语",
      "en-US": "Tsonga",
      "fr-FR": "tsonga",
      "es-ES": "tsonga",
      "de-DE": "Tsonga"
    }
  },
  "xal": {
    "english": "Kalmyk",
    "byLocale": {
      "zh-CN": "卡尔梅克语",
      "en-US": "Kalmyk",
      "fr-FR": "kalmouk",
      "es-ES": "kalmyk",
      "de-DE": "Kalmückisch"
    }
  },
  "ett": {
    "english": "Etruscan"
  },
  "tah": {
    "english": "Tahitian",
    "byLocale": {
      "zh-CN": "塔希提语",
      "en-US": "Tahitian",
      "fr-FR": "tahitien",
      "es-ES": "tahitiano",
      "de-DE": "Tahitisch"
    }
  },
  "ven": {
    "english": "Venda",
    "byLocale": {
      "zh-CN": "文达语",
      "en-US": "Venda",
      "fr-FR": "venda",
      "es-ES": "venda",
      "de-DE": "Venda"
    }
  },
  "tcy": {
    "english": "Tulu",
    "byLocale": {
      "en-US": "Tulu",
      "fr-FR": "toulou",
      "de-DE": "Tulu"
    }
  },
  "cha": {
    "english": "Chamorro",
    "byLocale": {
      "zh-CN": "查莫罗语",
      "en-US": "Chamorro",
      "fr-FR": "chamorro",
      "es-ES": "chamorro",
      "de-DE": "Chamorro"
    }
  },
  "hak": {
    "english": "Hakka Chinese",
    "native": "客家話",
    "byLocale": {
      "zh-CN": "客家话",
      "en-US": "Hakka Chinese",
      "fr-FR": "hakka",
      "es-ES": "chino hakka",
      "de-DE": "Hakka"
    }
  },
  "kjh": {
    "english": "Khakas"
  },
  "ace": {
    "english": "Acehnese",
    "byLocale": {
      "zh-CN": "亚齐语",
      "en-US": "Acehnese",
      "fr-FR": "aceh",
      "es-ES": "achenés",
      "de-DE": "Aceh"
    }
  },
  "gsw": {
    "english": "Swiss German",
    "native": "Schwiizertüütsch",
    "byLocale": {
      "zh-CN": "瑞士德语",
      "en-US": "Swiss German",
      "fr-FR": "suisse allemand",
      "es-ES": "alemán suizo",
      "de-DE": "Schweizerdeutsch"
    }
  },
  "war": {
    "english": "Waray",
    "byLocale": {
      "zh-CN": "瓦瑞语",
      "en-US": "Waray",
      "fr-FR": "waray",
      "es-ES": "waray",
      "de-DE": "Waray"
    }
  },
  "hit": {
    "english": "Hittite",
    "byLocale": {
      "zh-CN": "赫梯语",
      "en-US": "Hittite",
      "fr-FR": "hittite",
      "es-ES": "hitita",
      "de-DE": "Hethitisch"
    }
  },
  "mns": {
    "english": "Mansi"
  },
  "pcd": {
    "english": "Picard",
    "byLocale": {
      "en-US": "Picard",
      "fr-FR": "picard",
      "de-DE": "Picardisch"
    }
  },
  "gez": {
    "english": "Ge'ez",
    "byLocale": {
      "zh-CN": "吉兹语",
      "en-US": "Geez",
      "fr-FR": "guèze",
      "es-ES": "geez",
      "de-DE": "Geez"
    }
  },
  "brx": {
    "english": "Bodo",
    "native": "बर’",
    "byLocale": {
      "zh-CN": "博多语",
      "en-US": "Bodo",
      "fr-FR": "bodo",
      "es-ES": "bodo",
      "de-DE": "Bodo"
    }
  },
  "phn": {
    "english": "Phoenician",
    "byLocale": {
      "zh-CN": "腓尼基语",
      "en-US": "Phoenician",
      "fr-FR": "phénicien",
      "es-ES": "fenicio",
      "de-DE": "Phönizisch"
    }
  },
  "mah": {
    "english": "Marshallese",
    "byLocale": {
      "zh-CN": "马绍尔语",
      "en-US": "Marshallese",
      "fr-FR": "marshallais",
      "es-ES": "marshalés",
      "de-DE": "Marschallesisch"
    }
  },
  "kca": {
    "english": "Khanty"
  },
  "dgo": {
    "english": "Dogri",
    "native": "डोगरी",
    "byLocale": {
      "zh-CN": "多格拉语",
      "en-US": "Dogri",
      "fr-FR": "dogri",
      "es-ES": "dogri",
      "de-DE": "Dogri"
    }
  },
  "brh": {
    "english": "Brahui",
    "byLocale": {
      "en-US": "Brahui",
      "fr-FR": "brahoui",
      "de-DE": "Brahui"
    }
  },
  "nog": {
    "english": "Nogai",
    "byLocale": {
      "zh-CN": "诺盖语",
      "en-US": "Nogai",
      "fr-FR": "nogaï",
      "es-ES": "nogai",
      "de-DE": "Nogai"
    }
  },
  "ckt": {
    "english": "Chukchi"
  },
  "lbe": {
    "english": "Lak"
  },
  "mzn": {
    "english": "Mazanderani",
    "native": "مازرونی",
    "byLocale": {
      "zh-CN": "马赞德兰语",
      "en-US": "Mazanderani",
      "fr-FR": "mazandérani",
      "es-ES": "mazandaraní",
      "de-DE": "Masanderanisch"
    }
  },
  "gil": {
    "english": "Gilbertese",
    "byLocale": {
      "zh-CN": "吉尔伯特语",
      "en-US": "Gilbertese",
      "fr-FR": "gilbertin",
      "es-ES": "gilbertés",
      "de-DE": "Kiribatisch"
    }
  },
  "bug": {
    "english": "Bugis",
    "byLocale": {
      "zh-CN": "布吉语",
      "en-US": "Buginese",
      "fr-FR": "bugi",
      "es-ES": "buginés",
      "de-DE": "Buginesisch"
    }
  },
  "izh": {
    "english": "Ingrian",
    "byLocale": {
      "en-US": "Ingrian",
      "fr-FR": "ingrien",
      "de-DE": "Ischorisch"
    }
  },
  "kon": {
    "english": "Kongo",
    "byLocale": {
      "zh-CN": "刚果语",
      "en-US": "Kongo",
      "fr-FR": "kikongo",
      "es-ES": "kongo",
      "de-DE": "Kongolesisch"
    }
  },
  "ell": {
    "english": "Modern Greek",
    "native": "Ελληνικά",
    "byLocale": {
      "zh-CN": "希腊语",
      "en-US": "Greek",
      "fr-FR": "grec",
      "es-ES": "griego",
      "de-DE": "Griechisch"
    }
  },
  "chg": {
    "english": "Chagatai",
    "byLocale": {
      "zh-CN": "察合台语",
      "en-US": "Chagatai",
      "fr-FR": "tchaghataï",
      "es-ES": "chagatái",
      "de-DE": "Tschagataisch"
    }
  },
  "pdc": {
    "english": "Pennsylvania German",
    "byLocale": {
      "en-US": "Pennsylvania German",
      "fr-FR": "pennsilfaanisch",
      "de-DE": "Pennsylvaniadeutsch"
    }
  },
  "aka": {
    "english": "Akan",
    "native": "Akan",
    "byLocale": {
      "zh-CN": "阿肯语",
      "en-US": "Akan",
      "fr-FR": "akan",
      "es-ES": "akan",
      "de-DE": "Akan"
    }
  },
  "kum": {
    "english": "Kumyk",
    "byLocale": {
      "zh-CN": "库梅克语",
      "en-US": "Kumyk",
      "fr-FR": "koumyk",
      "es-ES": "kumyk",
      "de-DE": "Kumükisch"
    }
  },
  "hmo": {
    "english": "Hiri Motu",
    "byLocale": {
      "zh-CN": "希里莫图语",
      "en-US": "Hiri Motu",
      "fr-FR": "hiri motu",
      "es-ES": "hiri motu",
      "de-DE": "Hiri-Motu"
    }
  },
  "ale": {
    "english": "Aleut",
    "byLocale": {
      "zh-CN": "阿留申语",
      "en-US": "Aleut",
      "fr-FR": "aléoute",
      "es-ES": "aleutiano",
      "de-DE": "Aleutisch"
    }
  },
  "awa": {
    "english": "Awadhi",
    "byLocale": {
      "zh-CN": "阿瓦德语",
      "en-US": "Awadhi",
      "fr-FR": "awadhi",
      "es-ES": "avadhi",
      "de-DE": "Awadhi"
    }
  },
  "dlm": {
    "english": "Dalmatian"
  },
  "her": {
    "english": "Herero",
    "byLocale": {
      "zh-CN": "赫雷罗语",
      "en-US": "Herero",
      "fr-FR": "héréro",
      "es-ES": "herero",
      "de-DE": "Herero"
    }
  },
  "enm": {
    "english": "Middle English",
    "byLocale": {
      "zh-CN": "中古英语",
      "en-US": "Middle English",
      "fr-FR": "moyen anglais",
      "es-ES": "inglés medio",
      "de-DE": "Mittelenglisch"
    }
  },
  "prg": {
    "english": "Old Prussian",
    "native": "prūsiskan",
    "byLocale": {
      "zh-CN": "普鲁士语",
      "en-US": "Prussian",
      "fr-FR": "prussien",
      "es-ES": "prusiano",
      "de-DE": "Altpreußisch"
    }
  },
  "yrk": {
    "english": "Nenets"
  },
  "qya": {
    "english": "Quenya"
  },
  "vot": {
    "english": "Votic",
    "byLocale": {
      "zh-CN": "沃提克语",
      "en-US": "Votic",
      "fr-FR": "vote",
      "es-ES": "vótico",
      "de-DE": "Wotisch"
    }
  },
  "pau": {
    "english": "Palauan",
    "byLocale": {
      "zh-CN": "帕劳语",
      "en-US": "Palauan",
      "fr-FR": "palau",
      "es-ES": "palauano",
      "de-DE": "Palau"
    }
  },
  "nan": {
    "english": "Southern Min",
    "native": "閩南語",
    "byLocale": {
      "zh-CN": "闽南语",
      "en-US": "Southern Min",
      "fr-FR": "minnan",
      "es-ES": "minnan",
      "de-DE": "Min Nan"
    }
  },
  "nso": {
    "english": "Northern Sotho",
    "native": "Sesotho sa Leboa",
    "byLocale": {
      "zh-CN": "北索托语",
      "en-US": "Northern Sotho",
      "fr-FR": "sotho du Nord",
      "es-ES": "sotho septentrional",
      "de-DE": "Nord-Sotho"
    }
  },
  "sag": {
    "english": "Sango",
    "native": "Sängö",
    "byLocale": {
      "zh-CN": "桑戈语",
      "en-US": "Sango",
      "fr-FR": "sango",
      "es-ES": "sango",
      "de-DE": "Sango"
    }
  },
  "stq": {
    "english": "Saterland Frisian",
    "byLocale": {
      "en-US": "Saterland Frisian",
      "fr-FR": "saterlandais",
      "de-DE": "Saterfriesisch"
    }
  },
  "yue": {
    "english": "Cantonese",
    "native": "粵語",
    "byLocale": {
      "zh-CN": "粤语",
      "en-US": "Cantonese",
      "fr-FR": "cantonais",
      "es-ES": "cantonés",
      "de-DE": "Kantonesisch"
    }
  },
  "xmf": {
    "english": "Mingrelian",
    "byLocale": {
      "en-US": "Mingrelian",
      "fr-FR": "mingrélien",
      "de-DE": "Mingrelisch"
    }
  },
  "bjn": {
    "english": "Banjar",
    "byLocale": {
      "en-US": "Banjar",
      "fr-FR": "banjar",
      "de-DE": "Banjaresisch"
    }
  },
  "ase": {
    "english": "American Sign Language",
    "byLocale": {
      "en-US": "American Sign Language",
      "fr-FR": "langue des signes américaine",
      "de-DE": "Amerikanische Gebärdensprache"
    }
  },
  "kau": {
    "english": "Kanuri",
    "byLocale": {
      "zh-CN": "卡努里语",
      "en-US": "Kanuri",
      "fr-FR": "kanouri",
      "es-ES": "kanuri",
      "de-DE": "Kanuri"
    }
  },
  "nrn": {
    "english": "Norn"
  },
  "frr": {
    "english": "North Frisian",
    "byLocale": {
      "zh-CN": "北弗里西亚语",
      "en-US": "Northern Frisian",
      "fr-FR": "frison septentrional",
      "es-ES": "frisón septentrional",
      "de-DE": "Nordfriesisch"
    }
  },
  "lug": {
    "english": "Luganda",
    "native": "Luganda",
    "byLocale": {
      "zh-CN": "卢干达语",
      "en-US": "Ganda",
      "fr-FR": "ganda",
      "es-ES": "ganda",
      "de-DE": "Ganda"
    }
  },
  "cre": {
    "english": "Cree",
    "byLocale": {
      "zh-CN": "克里语",
      "en-US": "Cree",
      "fr-FR": "cree",
      "es-ES": "cree",
      "de-DE": "Cree"
    }
  },
  "gan": {
    "english": "Gan Chinese",
    "byLocale": {
      "zh-CN": "赣语",
      "en-US": "Gan Chinese",
      "fr-FR": "gan",
      "es-ES": "chino gan",
      "de-DE": "Gan"
    }
  },
  "kik": {
    "english": "Gikuyu",
    "native": "Gikuyu",
    "byLocale": {
      "zh-CN": "吉库尤语",
      "en-US": "Kikuyu",
      "fr-FR": "kikuyu",
      "es-ES": "kikuyu",
      "de-DE": "Kikuyu"
    }
  },
  "mag": {
    "english": "Magahi",
    "byLocale": {
      "zh-CN": "摩揭陀语",
      "en-US": "Magahi",
      "fr-FR": "magahi",
      "es-ES": "magahi",
      "de-DE": "Khotta"
    }
  },
  "pox": {
    "english": "Polabian"
  },
  "zha": {
    "english": "Zhuang",
    "native": "Vahcuengh",
    "byLocale": {
      "zh-CN": "壮语",
      "en-US": "Zhuang",
      "fr-FR": "zhuang",
      "es-ES": "zhuang",
      "de-DE": "Zhuang"
    }
  },
  "bsk": {
    "english": "Burushaski"
  },
  "sva": {
    "english": "Svan"
  },
  "fro": {
    "english": "Old French",
    "byLocale": {
      "zh-CN": "古法语",
      "en-US": "Old French",
      "fr-FR": "ancien français",
      "es-ES": "francés antiguo",
      "de-DE": "Altfranzösisch"
    }
  },
  "nbl": {
    "english": "Southern Ndebele",
    "byLocale": {
      "zh-CN": "南恩德贝勒语",
      "en-US": "South Ndebele",
      "fr-FR": "ndébélé du Sud",
      "es-ES": "ndebele meridional",
      "de-DE": "Süd-Ndebele"
    }
  },
  "lzz": {
    "english": "Laz",
    "byLocale": {
      "en-US": "Laz",
      "fr-FR": "laze",
      "de-DE": "Lasisch"
    }
  },
  "tvl": {
    "english": "Tuvaluan",
    "byLocale": {
      "zh-CN": "图瓦卢语",
      "en-US": "Tuvalu",
      "fr-FR": "tuvalu",
      "es-ES": "tuvaluano",
      "de-DE": "Tuvaluisch"
    }
  },
  "elx": {
    "english": "Elamite",
    "byLocale": {
      "zh-CN": "埃兰语",
      "en-US": "Elamite",
      "fr-FR": "élamite",
      "es-ES": "elamita",
      "de-DE": "Elamisch"
    }
  },
  "koi": {
    "english": "Komi-Permyak",
    "byLocale": {
      "zh-CN": "科米-彼尔米亚克语",
      "en-US": "Komi-Permyak",
      "fr-FR": "komi-permiak",
      "es-ES": "komi permio",
      "de-DE": "Komi-Permjakisch"
    }
  },
  "sgs": {
    "english": "Samogitian",
    "byLocale": {
      "en-US": "Samogitian",
      "fr-FR": "samogitien",
      "de-DE": "Samogitisch"
    }
  },
  "sma": {
    "english": "Southern Sami",
    "byLocale": {
      "zh-CN": "南萨米语",
      "en-US": "Southern Sami",
      "fr-FR": "same du Sud",
      "es-ES": "sami meridional",
      "de-DE": "Südsamisch"
    }
  },
  "ext": {
    "english": "Extremaduran",
    "byLocale": {
      "en-US": "Extremaduran",
      "fr-FR": "estrémègne",
      "de-DE": "Extremadurisch"
    }
  },
  "evn": {
    "english": "Evenki"
  },
  "kab": {
    "english": "Kabyle",
    "native": "Taqbaylit",
    "byLocale": {
      "zh-CN": "卡拜尔语",
      "en-US": "Kabyle",
      "fr-FR": "kabyle",
      "es-ES": "cabileño",
      "de-DE": "Kabylisch"
    }
  },
  "rap": {
    "english": "Rapa Nui",
    "byLocale": {
      "zh-CN": "拉帕努伊语",
      "en-US": "Rapanui",
      "fr-FR": "rapanui",
      "es-ES": "rapanui",
      "de-DE": "Rapanui"
    }
  },
  "rut": {
    "english": "Rutulian"
  },
  "lzh": {
    "english": "Classical Chinese",
    "byLocale": {
      "en-US": "Literary Chinese",
      "fr-FR": "chinois littéraire",
      "de-DE": "Klassisches Chinesisch"
    }
  },
  "raj": {
    "english": "Rajasthani",
    "native": "राजस्थानी",
    "byLocale": {
      "zh-CN": "拉贾斯坦语",
      "en-US": "Rajasthani",
      "fr-FR": "rajasthani",
      "es-ES": "rajasthani",
      "de-DE": "Rajasthani"
    }
  },
  "srn": {
    "english": "Sranan Tongo",
    "byLocale": {
      "zh-CN": "苏里南汤加语",
      "en-US": "Sranan Tongo",
      "fr-FR": "sranan tongo",
      "es-ES": "sranan tongo",
      "de-DE": "Srananisch"
    }
  },
  "niu": {
    "english": "Niuean",
    "byLocale": {
      "zh-CN": "纽埃语",
      "en-US": "Niuean",
      "fr-FR": "niuéen",
      "es-ES": "niueano",
      "de-DE": "Niue"
    }
  },
  "smn": {
    "english": "Inari Sami",
    "native": "anarâškielâ",
    "byLocale": {
      "zh-CN": "伊纳里萨米语",
      "en-US": "Inari Sami",
      "fr-FR": "same d’Inari",
      "es-ES": "sami inari",
      "de-DE": "Inari-Samisch"
    }
  },
  "glk": {
    "english": "Gilaki",
    "byLocale": {
      "en-US": "Gilaki",
      "fr-FR": "gilaki",
      "de-DE": "Gilaki"
    }
  },
  "peo": {
    "english": "Old Persian",
    "byLocale": {
      "zh-CN": "古波斯语",
      "en-US": "Old Persian",
      "fr-FR": "persan ancien",
      "es-ES": "persa antiguo",
      "de-DE": "Altpersisch"
    }
  },
  "ryu": {
    "english": "Okinawan"
  },
  "tly": {
    "english": "Talysh",
    "byLocale": {
      "en-US": "Talysh",
      "fr-FR": "talysh",
      "de-DE": "Talisch"
    }
  },
  "chu": {
    "english": "Church Slavonic",
    "byLocale": {
      "zh-CN": "教会斯拉夫语",
      "en-US": "Church Slavic",
      "fr-FR": "slavon d’église",
      "es-ES": "eslavo eclesiástico",
      "de-DE": "Kirchenslawisch"
    }
  },
  "orv": {
    "english": "Old East Slavic"
  },
  "fon": {
    "english": "Fon",
    "byLocale": {
      "zh-CN": "丰语",
      "en-US": "Fon",
      "fr-FR": "fon",
      "es-ES": "fon",
      "de-DE": "Fon"
    }
  },
  "pam": {
    "english": "Kapampangan",
    "byLocale": {
      "zh-CN": "邦板牙语",
      "en-US": "Pampanga",
      "fr-FR": "pampangan",
      "es-ES": "pampanga",
      "de-DE": "Pampanggan"
    }
  },
  "mad": {
    "english": "Madurese",
    "byLocale": {
      "zh-CN": "马都拉语",
      "en-US": "Madurese",
      "fr-FR": "madurais",
      "es-ES": "madurés",
      "de-DE": "Maduresisch"
    }
  },
  "fit": {
    "english": "Meänkieli",
    "byLocale": {
      "en-US": "Tornedalen Finnish",
      "fr-FR": "finnois tornédalien",
      "de-DE": "Meänkieli"
    }
  },
  "pal": {
    "english": "Middle Persian",
    "byLocale": {
      "zh-CN": "巴拉维语",
      "en-US": "Pahlavi",
      "fr-FR": "pahlavi",
      "es-ES": "pahlavi",
      "de-DE": "Mittelpersisch"
    }
  },
  "hne": {
    "english": "Chhattisgarhi"
  },
  "ckb": {
    "english": "Central Kurdish",
    "native": "کوردیی ناوەندی",
    "byLocale": {
      "zh-CN": "中库尔德语",
      "en-US": "Central Kurdish",
      "fr-FR": "sorani",
      "es-ES": "kurdo sorani",
      "de-DE": "Zentralkurdisch"
    }
  },
  "bpy": {
    "english": "Bishnupriya Manipuri",
    "byLocale": {
      "en-US": "Bishnupriya",
      "fr-FR": "bishnupriya",
      "de-DE": "Bishnupriya"
    }
  },
  "sog": {
    "english": "Sogdian",
    "byLocale": {
      "zh-CN": "粟特语",
      "en-US": "Sogdien",
      "fr-FR": "sogdien",
      "es-ES": "sogdiano",
      "de-DE": "Sogdisch"
    }
  },
  "ipk": {
    "english": "Iñupiaq",
    "byLocale": {
      "zh-CN": "伊努皮克语",
      "en-US": "Inupiaq",
      "fr-FR": "inupiaq",
      "es-ES": "inupiaq",
      "de-DE": "Inupiak"
    }
  },
  "mwr": {
    "english": "Marwari",
    "byLocale": {
      "zh-CN": "马尔瓦里语",
      "en-US": "Marwari",
      "fr-FR": "marwarî",
      "es-ES": "marwari",
      "de-DE": "Marwari"
    }
  },
  "uga": {
    "english": "Ugaritic",
    "byLocale": {
      "zh-CN": "乌加里特语",
      "en-US": "Ugaritic",
      "fr-FR": "ougaritique",
      "es-ES": "ugarítico",
      "de-DE": "Ugaritisch"
    }
  },
  "fkv": {
    "english": "Kven"
  },
  "tab": {
    "english": "Tabasaran"
  },
  "jam": {
    "english": "Jamaican Patois",
    "byLocale": {
      "en-US": "Jamaican Creole English",
      "fr-FR": "créole jamaïcain",
      "de-DE": "Jamaikanisch-Kreolisch"
    }
  },
  "bgc": {
    "english": "Haryanvi",
    "native": "हरियाणवी",
    "byLocale": {
      "zh-CN": "哈里亚纳语",
      "en-US": "Haryanvi",
      "fr-FR": "haryanvi",
      "es-ES": "haryanvi",
      "de-DE": "Haryanvi"
    }
  },
  "nio": {
    "english": "Nganasan"
  },
  "mnw": {
    "english": "Mon"
  },
  "skr": {
    "english": "Saraiki",
    "byLocale": {
      "zh-CN": "色莱基语"
    }
  },
  "tkl": {
    "english": "Tokelauan",
    "byLocale": {
      "zh-CN": "托克劳语",
      "en-US": "Tokelauan",
      "fr-FR": "tokelau",
      "es-ES": "tokelauano",
      "de-DE": "Tokelauanisch"
    }
  },
  "dng": {
    "english": "Dungan"
  },
  "kmr": {
    "english": "Northern Kurdish",
    "native": "kurdî (kurmancî)",
    "byLocale": {
      "zh-CN": "库尔曼吉语",
      "en-US": "Northern Kurdish",
      "fr-FR": "kurde",
      "es-ES": "kurdo",
      "de-DE": "Kurdisch"
    }
  },
  "osc": {
    "english": "Oscan"
  },
  "smj": {
    "english": "Lule Sami",
    "byLocale": {
      "zh-CN": "吕勒萨米语",
      "en-US": "Lule Sami",
      "fr-FR": "same de Lule",
      "es-ES": "sami lule",
      "de-DE": "Lule-Samisch"
    }
  },
  "cbk": {
    "english": "Chavacano"
  },
  "sel": {
    "english": "Selkup",
    "byLocale": {
      "zh-CN": "塞尔库普语",
      "en-US": "Selkup",
      "fr-FR": "selkoupe",
      "es-ES": "selkup",
      "de-DE": "Selkupisch"
    }
  },
  "tmh": {
    "english": "Tuareg",
    "byLocale": {
      "zh-CN": "塔马奇克语",
      "en-US": "Tamashek",
      "fr-FR": "tamacheq",
      "es-ES": "tamashek",
      "de-DE": "Tamaseq"
    }
  },
  "ltg": {
    "english": "Latgalian",
    "byLocale": {
      "en-US": "Latgalian",
      "fr-FR": "latgalien",
      "de-DE": "Lettgallisch"
    }
  },
  "ket": {
    "english": "Ket"
  },
  "sjd": {
    "english": "Kildin Sami"
  },
  "lab": {
    "english": "Linear A"
  },
  "hil": {
    "english": "Hiligaynon",
    "byLocale": {
      "zh-CN": "希利盖农语",
      "en-US": "Hiligaynon",
      "fr-FR": "hiligaynon",
      "es-ES": "hiligaynon",
      "de-DE": "Hiligaynon"
    }
  },
  "shi": {
    "english": "Tashelhit",
    "native": "ⵜⴰⵛⵍⵃⵉⵜ",
    "byLocale": {
      "zh-CN": "希尔哈语",
      "en-US": "Tachelhit",
      "fr-FR": "chleuh",
      "es-ES": "tashelhit",
      "de-DE": "Taschelhit"
    }
  },
  "prv": {
    "english": "Provençal"
  },
  "gon": {
    "english": "Gondi",
    "byLocale": {
      "zh-CN": "冈德语",
      "en-US": "Gondi",
      "fr-FR": "gondi",
      "es-ES": "gondi",
      "de-DE": "Gondi"
    }
  },
  "naq": {
    "english": "Khoekhoe",
    "native": "Khoekhoegowab",
    "byLocale": {
      "zh-CN": "纳马语",
      "en-US": "Nama",
      "fr-FR": "nama",
      "es-ES": "nama",
      "de-DE": "Nama"
    }
  },
  "pag": {
    "english": "Pangasinan",
    "byLocale": {
      "zh-CN": "邦阿西南语",
      "en-US": "Pangasinan",
      "fr-FR": "pangasinan",
      "es-ES": "pangasinán",
      "de-DE": "Pangasinan"
    }
  },
  "cho": {
    "english": "Choctaw",
    "byLocale": {
      "zh-CN": "乔克托语",
      "en-US": "Choctaw",
      "fr-FR": "choctaw",
      "es-ES": "choctaw",
      "de-DE": "Choctaw"
    }
  },
  "kpy": {
    "english": "Koryak"
  },
  "ttt": {
    "english": "Tat",
    "byLocale": {
      "en-US": "Muslim Tat",
      "fr-FR": "tati caucasien",
      "de-DE": "Tatisch"
    }
  },
  "hbo": {
    "english": "Biblical Hebrew"
  },
  "yua": {
    "english": "Yucatec Maya"
  },
  "xpr": {
    "english": "Parthian"
  },
  "anp": {
    "english": "Angika",
    "byLocale": {
      "zh-CN": "昂加语",
      "en-US": "Angika",
      "fr-FR": "angika",
      "es-ES": "angika",
      "de-DE": "Angika"
    }
  },
  "eve": {
    "english": "Even"
  },
  "dyu": {
    "english": "Dioula",
    "byLocale": {
      "zh-CN": "迪尤拉语",
      "en-US": "Dyula",
      "fr-FR": "dioula",
      "es-ES": "diula",
      "de-DE": "Dyula"
    }
  },
  "dlg": {
    "english": "Dolgan"
  },
  "goh": {
    "english": "Old High German",
    "byLocale": {
      "zh-CN": "古高地德语",
      "en-US": "Old High German",
      "fr-FR": "ancien haut allemand",
      "es-ES": "alto alemán antiguo",
      "de-DE": "Althochdeutsch"
    }
  },
  "mos": {
    "english": "Mooré",
    "byLocale": {
      "zh-CN": "莫西语",
      "en-US": "Mossi",
      "fr-FR": "moré",
      "es-ES": "mossi",
      "de-DE": "Mossi"
    }
  },
  "niv": {
    "english": "Nivkh"
  },
  "pnt": {
    "english": "Pontic Greek",
    "byLocale": {
      "en-US": "Pontic",
      "fr-FR": "pontique",
      "de-DE": "Pontisch"
    }
  },
  "uby": {
    "english": "Ubykh"
  },
  "fsl": {
    "english": "French Sign Language"
  },
  "oji": {
    "english": "Ojibwe",
    "byLocale": {
      "zh-CN": "奥吉布瓦语",
      "en-US": "Ojibwa",
      "fr-FR": "ojibwa",
      "es-ES": "ojibwa",
      "de-DE": "Ojibwa"
    }
  },
  "bem": {
    "english": "Bemba",
    "native": "Ichibemba",
    "byLocale": {
      "zh-CN": "本巴语",
      "en-US": "Bemba",
      "fr-FR": "bemba",
      "es-ES": "bemba",
      "de-DE": "Bemba"
    }
  },
  "mnk": {
    "english": "Mandinka",
    "byLocale": {
      "zh-CN": "曼丁哥语",
      "en-US": "Mandingo",
      "fr-FR": "mandingue",
      "es-ES": "mandingo",
      "de-DE": "Malinke"
    }
  },
  "kdr": {
    "english": "Karaim"
  },
  "ary": {
    "english": "Moroccan Arabic",
    "byLocale": {
      "en-US": "Moroccan Arabic",
      "fr-FR": "arabe marocain",
      "de-DE": "Marokkanisches Arabisch"
    }
  },
  "sms": {
    "english": "Skolt Sami",
    "byLocale": {
      "zh-CN": "斯科特萨米语",
      "en-US": "Skolt Sami",
      "fr-FR": "same skolt",
      "es-ES": "sami skolt",
      "de-DE": "Skolt-Samisch"
    }
  },
  "chy": {
    "english": "Cheyenne",
    "byLocale": {
      "zh-CN": "夏延语",
      "en-US": "Cheyenne",
      "fr-FR": "cheyenne",
      "es-ES": "cheyene",
      "de-DE": "Cheyenne"
    }
  },
  "cdo": {
    "english": "Eastern Min"
  },
  "agx": {
    "english": "Aghul"
  },
  "wym": {
    "english": "Wymysorys"
  },
  "qxq": {
    "english": "Qashqai"
  },
  "xil": {
    "english": "Illyrian"
  },
  "gld": {
    "english": "Nanai"
  },
  "crs": {
    "english": "Seychellois Creole",
    "byLocale": {
      "zh-CN": "塞舌尔克里奥尔语",
      "en-US": "Seselwa Creole French",
      "fr-FR": "créole seychellois",
      "es-ES": "criollo seychelense",
      "de-DE": "Seychellenkreol"
    }
  },
  "tig": {
    "english": "Tigre",
    "byLocale": {
      "zh-CN": "提格雷语",
      "en-US": "Tigre",
      "fr-FR": "tigré",
      "es-ES": "tigré",
      "de-DE": "Tigre"
    }
  },
  "wbl": {
    "english": "Wakhi"
  },
  "lus": {
    "english": "Mizo",
    "byLocale": {
      "zh-CN": "米佐语",
      "en-US": "Mizo",
      "fr-FR": "lushaï",
      "es-ES": "mizo",
      "de-DE": "Lushai"
    }
  },
  "xcb": {
    "english": "Cumbric"
  },
  "vsn": {
    "english": "Vedic Sanskrit"
  },
  "hyw": {
    "english": "Western Armenian"
  },
  "avk": {
    "english": "Kotava",
    "byLocale": {
      "en-US": "Kotava",
      "fr-FR": "kotava",
      "de-DE": "Kotava"
    }
  },
  "slr": {
    "english": "Salar"
  },
  "otk": {
    "english": "Old Turkic"
  },
  "nde": {
    "english": "Northern Ndebele",
    "native": "isiNdebele",
    "byLocale": {
      "zh-CN": "北恩德贝勒语",
      "en-US": "North Ndebele",
      "fr-FR": "ndébélé du Nord",
      "es-ES": "ndebele septentrional",
      "de-DE": "Nord-Ndebele"
    }
  },
  "kha": {
    "english": "Khasi",
    "byLocale": {
      "zh-CN": "卡西语",
      "en-US": "Khasi",
      "fr-FR": "khasi",
      "es-ES": "khasi",
      "de-DE": "Khasi"
    }
  },
  "twi": {
    "english": "Twi",
    "native": "Akan",
    "byLocale": {
      "zh-CN": "契维语",
      "en-US": "Twi",
      "fr-FR": "twi",
      "es-ES": "twi",
      "de-DE": "Twi"
    }
  },
  "grt": {
    "english": "Garo"
  },
  "txh": {
    "english": "Thracian"
  },
  "khw": {
    "english": "Khowar",
    "byLocale": {
      "en-US": "Khowar",
      "fr-FR": "khowar",
      "de-DE": "Khowar"
    }
  },
  "xbc": {
    "english": "Bactrian"
  },
  "xpi": {
    "english": "Pictish"
  },
  "mxi": {
    "english": "Andalusi Romance"
  },
  "xpu": {
    "english": "Punic"
  },
  "sgh": {
    "english": "Shughni"
  },
  "bra": {
    "english": "Braj Bhasha",
    "byLocale": {
      "zh-CN": "布拉杰语",
      "en-US": "Braj",
      "fr-FR": "braj",
      "es-ES": "braj",
      "de-DE": "Braj-Bhakha"
    }
  },
  "snk": {
    "english": "Soninke",
    "byLocale": {
      "zh-CN": "索宁克语",
      "en-US": "Soninke",
      "fr-FR": "soninké",
      "es-ES": "soninké",
      "de-DE": "Soninke"
    }
  },
  "xpg": {
    "english": "Phrygian"
  },
  "sjn": {
    "english": "Sindarin"
  },
  "ruo": {
    "english": "Istro-Romanian"
  },
  "nzs": {
    "english": "New Zealand Sign Language"
  },
  "cjs": {
    "english": "Shor"
  },
  "lua": {
    "english": "Luba-Kasai",
    "byLocale": {
      "zh-CN": "卢巴-卢拉语",
      "en-US": "Luba-Lulua",
      "fr-FR": "luba-kasaï (ciluba)",
      "es-ES": "luba-lulua",
      "de-DE": "Luba-Lulua"
    }
  },
  "vls": {
    "english": "West Flemish",
    "byLocale": {
      "en-US": "West Flemish",
      "fr-FR": "flamand occidental",
      "de-DE": "Westflämisch"
    }
  },
  "zea": {
    "english": "Zeelandic",
    "byLocale": {
      "en-US": "Zeelandic",
      "fr-FR": "zélandais",
      "de-DE": "Seeländisch"
    }
  },
  "pfl": {
    "english": "Palatinate German",
    "byLocale": {
      "en-US": "Palatine German",
      "fr-FR": "allemand palatin",
      "de-DE": "Pfälzisch"
    }
  },
  "aii": {
    "english": "Assyrian Neo-Aramaic"
  },
  "bfi": {
    "english": "British Sign Language"
  },
  "osx": {
    "english": "Old Saxon"
  },
  "xhu": {
    "english": "Hurrian"
  },
  "sjt": {
    "english": "Ter Sami"
  },
  "xvn": {
    "english": "Vandalic"
  },
  "yai": {
    "english": "Yaghnobi"
  },
  "sje": {
    "english": "Pite Sami"
  },
  "shn": {
    "english": "Shan",
    "byLocale": {
      "zh-CN": "掸语",
      "en-US": "Shan",
      "fr-FR": "shan",
      "es-ES": "shan",
      "de-DE": "Schan"
    }
  },
  "tli": {
    "english": "Tlingit",
    "byLocale": {
      "zh-CN": "特林吉特语",
      "en-US": "Tlingit",
      "fr-FR": "tlingit",
      "es-ES": "tlingit",
      "de-DE": "Tlingit"
    }
  },
  "sga": {
    "english": "Old Irish",
    "byLocale": {
      "zh-CN": "古爱尔兰语",
      "en-US": "Old Irish",
      "fr-FR": "ancien irlandais",
      "es-ES": "irlandés antiguo",
      "de-DE": "Altirisch"
    }
  },
  "lbj": {
    "english": "Ladakhi"
  },
  "bhb": {
    "english": "Bhili"
  },
  "rar": {
    "english": "Cook Islands Maori",
    "byLocale": {
      "zh-CN": "拉罗汤加语",
      "en-US": "Rarotongan",
      "fr-FR": "rarotongien",
      "es-ES": "rarotongano",
      "de-DE": "Rarotonganisch"
    }
  },
  "tkr": {
    "english": "Tsakhur",
    "byLocale": {
      "en-US": "Tsakhur",
      "fr-FR": "tsakhour",
      "de-DE": "Tsachurisch"
    }
  },
  "srh": {
    "english": "Sarikoli"
  },
  "uum": {
    "english": "Urum"
  },
  "sia": {
    "english": "Akkala Sami"
  },
  "ist": {
    "english": "Istriot"
  },
  "xld": {
    "english": "Lydian"
  },
  "lkt": {
    "english": "Lakota",
    "native": "Lakȟólʼiyapi",
    "byLocale": {
      "zh-CN": "拉科塔语",
      "en-US": "Lakota",
      "fr-FR": "lakota",
      "es-ES": "lakota",
      "de-DE": "Lakota"
    }
  },
  "kim": {
    "english": "Tofa"
  },
  "jrb": {
    "english": "Judeo-Arabic",
    "byLocale": {
      "zh-CN": "犹太阿拉伯语",
      "en-US": "Judeo-Arabic",
      "fr-FR": "judéo-arabe",
      "es-ES": "judeo-árabe",
      "de-DE": "Jüdisch-Arabisch"
    }
  },
  "tzm": {
    "english": "Central Atlas Tamazight",
    "native": "Tamaziɣt n laṭlaṣ",
    "byLocale": {
      "zh-CN": "塔马齐格特语",
      "en-US": "Central Atlas Tamazight",
      "fr-FR": "amazighe de l’Atlas central",
      "es-ES": "tamazight del Atlas Central",
      "de-DE": "Zentralatlas-Tamazight"
    }
  },
  "arq": {
    "english": "Algerian Arabic",
    "byLocale": {
      "en-US": "Algerian Arabic",
      "fr-FR": "arabe algérien",
      "de-DE": "Algerisches Arabisch"
    }
  },
  "myp": {
    "english": "Pirahã"
  },
  "mey": {
    "english": "Hassaniya Arabic"
  },
  "tsg": {
    "english": "Tausug"
  },
  "rif": {
    "english": "Tarifit",
    "byLocale": {
      "zh-CN": "里夫语",
      "en-US": "Riffian",
      "fr-FR": "rifain",
      "de-DE": "Tarifit"
    }
  },
  "mrj": {
    "english": "Hill Mari",
    "byLocale": {
      "en-US": "Western Mari",
      "fr-FR": "mari occidental",
      "de-DE": "Bergmari"
    }
  },
  "bft": {
    "english": "Balti"
  },
  "clw": {
    "english": "Chulym"
  },
  "jct": {
    "english": "Krymchak"
  },
  "udi": {
    "english": "Udi"
  },
  "sju": {
    "english": "Ume Sami"
  },
  "ruq": {
    "english": "Megleno-Romanian"
  },
  "xga": {
    "english": "Galatian"
  },
  "aib": {
    "english": "Äynu"
  },
  "ncs": {
    "english": "Nicaraguan Sign Language"
  },
  "afb": {
    "english": "Gulf Arabic"
  },
  "swg": {
    "english": "Swabian"
  },
  "eya": {
    "english": "Eyak"
  },
  "dar": {
    "english": "Dargwa",
    "byLocale": {
      "zh-CN": "达尔格瓦语",
      "en-US": "Dargwa",
      "fr-FR": "dargwa",
      "es-ES": "dargva",
      "de-DE": "Darginisch"
    }
  },
  "trp": {
    "english": "Kokborok"
  },
  "xlc": {
    "english": "Lycian"
  },
  "hoc": {
    "english": "Ho"
  },
  "pih": {
    "english": "Pitkern"
  },
  "xum": {
    "english": "Umbrian"
  },
  "din": {
    "english": "Dinka",
    "byLocale": {
      "zh-CN": "丁卡语",
      "en-US": "Dinka",
      "fr-FR": "dinka",
      "es-ES": "dinka",
      "de-DE": "Dinka"
    }
  },
  "lif": {
    "english": "Limbu"
  },
  "lki": {
    "english": "Laki"
  },
  "ise": {
    "english": "Italian Sign Language"
  },
  "scl": {
    "english": "Shina"
  },
  "xeb": {
    "english": "Eblaite"
  },
  "xur": {
    "english": "Urartian"
  },
  "zkz": {
    "english": "Khazar language"
  },
  "gmy": {
    "english": "Mycenaean Greek"
  },
  "gmh": {
    "english": "Middle High German",
    "byLocale": {
      "zh-CN": "中古高地德语",
      "en-US": "Middle High German",
      "fr-FR": "moyen haut-allemand",
      "es-ES": "alto alemán medio",
      "de-DE": "Mittelhochdeutsch"
    }
  },
  "aln": {
    "english": "Gheg",
    "byLocale": {
      "en-US": "Gheg Albanian",
      "fr-FR": "guègue",
      "de-DE": "Gegisch"
    }
  },
  "alt": {
    "english": "Southern Altai",
    "byLocale": {
      "zh-CN": "南阿尔泰语",
      "en-US": "Southern Altai",
      "fr-FR": "altaï du Sud",
      "es-ES": "altái meridional",
      "de-DE": "Süd-Altaisch"
    }
  },
  "rhg": {
    "english": "Rohingya",
    "byLocale": {
      "zh-CN": "罗兴亚语",
      "en-US": "Rohingya",
      "fr-FR": "rohingya",
      "es-ES": "rohinyá",
      "de-DE": "Rohingyalisch"
    }
  },
  "lrl": {
    "english": "Achomi"
  },
  "tum": {
    "english": "Tumbuka",
    "byLocale": {
      "zh-CN": "通布卡语",
      "en-US": "Tumbuka",
      "fr-FR": "tumbuka",
      "es-ES": "tumbuka",
      "de-DE": "Tumbuka"
    }
  },
  "bin": {
    "english": "Edo",
    "byLocale": {
      "zh-CN": "比尼语",
      "en-US": "Bini",
      "fr-FR": "bini",
      "es-ES": "bini",
      "de-DE": "Bini"
    }
  },
  "bik": {
    "english": "Bikol",
    "byLocale": {
      "zh-CN": "比科尔语",
      "en-US": "Bikol",
      "fr-FR": "bikol",
      "es-ES": "bicol",
      "de-DE": "Bikol"
    }
  },
  "iii": {
    "english": "Sichuan Yi",
    "native": "ꆈꌠꉙ",
    "byLocale": {
      "zh-CN": "凉山彝语",
      "en-US": "Sichuan Yi",
      "fr-FR": "yi du Sichuan",
      "es-ES": "yi de Sichuán",
      "de-DE": "Yi"
    }
  },
  "olo": {
    "english": "Livvi-Karelian"
  },
  "xsr": {
    "english": "Sherpa"
  },
  "umb": {
    "english": "Umbundu",
    "byLocale": {
      "zh-CN": "翁本杜语",
      "en-US": "Umbundu",
      "fr-FR": "umbundu",
      "es-ES": "umbundu",
      "de-DE": "Umbundu"
    }
  },
  "acm": {
    "english": "Iraqi Arabic"
  },
  "sas": {
    "english": "Sasak",
    "byLocale": {
      "zh-CN": "萨萨克语",
      "en-US": "Sasak",
      "fr-FR": "sasak",
      "es-ES": "sasak",
      "de-DE": "Sasak"
    }
  },
  "kua": {
    "english": "Kwanyama",
    "byLocale": {
      "zh-CN": "宽亚玛语",
      "en-US": "Kuanyama",
      "fr-FR": "kuanyama",
      "es-ES": "kuanyama",
      "de-DE": "Kwanyama"
    }
  }
};

export const GENERATED_LANGUAGE_QUERY_INDEXES: Readonly<Record<LanguageNameQueryLocale, LanguageQueryIndexLocaleRecord>> = 
{
  "zh-CN": {
    "eng": [
      {
        "label": "英语",
        "kind": "local"
      },
      {
        "label": "English",
        "kind": "native"
      },
      {
        "label": "anglais",
        "kind": "alias"
      },
      {
        "label": "inglés",
        "kind": "alias"
      },
      {
        "label": "Englisch",
        "kind": "alias"
      },
      {
        "label": "英文",
        "kind": "alias"
      },
      {
        "label": "英語",
        "kind": "alias"
      },
      {
        "label": "american english",
        "kind": "alias"
      },
      {
        "label": "british english",
        "kind": "alias"
      }
    ],
    "deu": [
      {
        "label": "德语",
        "kind": "local"
      },
      {
        "label": "Deutsch",
        "kind": "native"
      },
      {
        "label": "German",
        "kind": "english"
      },
      {
        "label": "allemand",
        "kind": "alias"
      },
      {
        "label": "alemán",
        "kind": "alias"
      },
      {
        "label": "德文",
        "kind": "alias"
      },
      {
        "label": "德語",
        "kind": "alias"
      }
    ],
    "spa": [
      {
        "label": "西班牙语",
        "kind": "local"
      },
      {
        "label": "español",
        "kind": "native"
      },
      {
        "label": "Spanish",
        "kind": "english"
      },
      {
        "label": "espagnol",
        "kind": "alias"
      },
      {
        "label": "Spanisch",
        "kind": "alias"
      },
      {
        "label": "西文",
        "kind": "alias"
      },
      {
        "label": "西語",
        "kind": "alias"
      },
      {
        "label": "castilian",
        "kind": "alias"
      },
      {
        "label": "castilian spanish",
        "kind": "alias"
      },
      {
        "label": "latin american spanish",
        "kind": "alias"
      },
      {
        "label": "mexican spanish",
        "kind": "alias"
      }
    ],
    "fra": [
      {
        "label": "法语",
        "kind": "local"
      },
      {
        "label": "français",
        "kind": "native"
      },
      {
        "label": "French",
        "kind": "english"
      },
      {
        "label": "francés",
        "kind": "alias"
      },
      {
        "label": "Französisch",
        "kind": "alias"
      },
      {
        "label": "法文",
        "kind": "alias"
      },
      {
        "label": "法語",
        "kind": "alias"
      }
    ],
    "rus": [
      {
        "label": "俄语",
        "kind": "local"
      },
      {
        "label": "русский",
        "kind": "native"
      },
      {
        "label": "Russian",
        "kind": "english"
      },
      {
        "label": "russe",
        "kind": "alias"
      },
      {
        "label": "ruso",
        "kind": "alias"
      },
      {
        "label": "Russisch",
        "kind": "alias"
      },
      {
        "label": "俄文",
        "kind": "alias"
      },
      {
        "label": "俄語",
        "kind": "alias"
      }
    ],
    "ara": [
      {
        "label": "阿拉伯语",
        "kind": "local"
      },
      {
        "label": "العربية",
        "kind": "native"
      },
      {
        "label": "Arabic",
        "kind": "english"
      },
      {
        "label": "arabe",
        "kind": "alias"
      },
      {
        "label": "árabe",
        "kind": "alias"
      },
      {
        "label": "Arabisch",
        "kind": "alias"
      },
      {
        "label": "阿文",
        "kind": "alias"
      },
      {
        "label": "阿语",
        "kind": "alias"
      },
      {
        "label": "阿語",
        "kind": "alias"
      },
      {
        "label": "modern standard arabic",
        "kind": "alias"
      }
    ],
    "lat": [
      {
        "label": "拉丁语",
        "kind": "local"
      },
      {
        "label": "Latin",
        "kind": "english"
      },
      {
        "label": "latín",
        "kind": "alias"
      },
      {
        "label": "Latein",
        "kind": "alias"
      }
    ],
    "ita": [
      {
        "label": "意大利语",
        "kind": "local"
      },
      {
        "label": "italiano",
        "kind": "native"
      },
      {
        "label": "Italian",
        "kind": "english"
      },
      {
        "label": "italien",
        "kind": "alias"
      },
      {
        "label": "Italienisch",
        "kind": "alias"
      },
      {
        "label": "意文",
        "kind": "alias"
      },
      {
        "label": "意语",
        "kind": "alias"
      },
      {
        "label": "意語",
        "kind": "alias"
      }
    ],
    "jpn": [
      {
        "label": "日语",
        "kind": "local"
      },
      {
        "label": "日本語",
        "kind": "native"
      },
      {
        "label": "Japanese",
        "kind": "english"
      },
      {
        "label": "japonais",
        "kind": "alias"
      },
      {
        "label": "japonés",
        "kind": "alias"
      },
      {
        "label": "Japanisch",
        "kind": "alias"
      },
      {
        "label": "日文",
        "kind": "alias"
      },
      {
        "label": "日語",
        "kind": "alias"
      }
    ],
    "por": [
      {
        "label": "葡萄牙语",
        "kind": "local"
      },
      {
        "label": "português",
        "kind": "native"
      },
      {
        "label": "Portuguese",
        "kind": "english"
      },
      {
        "label": "portugais",
        "kind": "alias"
      },
      {
        "label": "portugués",
        "kind": "alias"
      },
      {
        "label": "Portugiesisch",
        "kind": "alias"
      },
      {
        "label": "葡文",
        "kind": "alias"
      },
      {
        "label": "葡语",
        "kind": "alias"
      },
      {
        "label": "葡語",
        "kind": "alias"
      },
      {
        "label": "brazilian portuguese",
        "kind": "alias"
      },
      {
        "label": "european portuguese",
        "kind": "alias"
      }
    ],
    "epo": [
      {
        "label": "世界语",
        "kind": "local"
      },
      {
        "label": "Esperanto",
        "kind": "native"
      },
      {
        "label": "espéranto",
        "kind": "alias"
      }
    ],
    "fas": [
      {
        "label": "波斯语",
        "kind": "local"
      },
      {
        "label": "فارسی",
        "kind": "native"
      },
      {
        "label": "Persian",
        "kind": "english"
      },
      {
        "label": "persan",
        "kind": "alias"
      },
      {
        "label": "persa",
        "kind": "alias"
      },
      {
        "label": "Persisch",
        "kind": "alias"
      },
      {
        "label": "波斯文",
        "kind": "alias"
      },
      {
        "label": "波斯語",
        "kind": "alias"
      },
      {
        "label": "法尔西",
        "kind": "alias"
      },
      {
        "label": "法爾西",
        "kind": "alias"
      },
      {
        "label": "farsi",
        "kind": "alias"
      },
      {
        "label": "persian farsi",
        "kind": "alias"
      }
    ],
    "zho": [
      {
        "label": "中文",
        "kind": "local"
      },
      {
        "label": "Chinese",
        "kind": "english"
      },
      {
        "label": "chinois",
        "kind": "alias"
      },
      {
        "label": "chino",
        "kind": "alias"
      },
      {
        "label": "Chinesisch",
        "kind": "alias"
      },
      {
        "label": "汉文",
        "kind": "alias"
      },
      {
        "label": "漢文",
        "kind": "alias"
      },
      {
        "label": "华文",
        "kind": "alias"
      },
      {
        "label": "華文",
        "kind": "alias"
      }
    ],
    "heb": [
      {
        "label": "希伯来语",
        "kind": "local"
      },
      {
        "label": "עברית",
        "kind": "native"
      },
      {
        "label": "Hebrew",
        "kind": "english"
      },
      {
        "label": "hébreu",
        "kind": "alias"
      },
      {
        "label": "hebreo",
        "kind": "alias"
      },
      {
        "label": "Hebräisch",
        "kind": "alias"
      },
      {
        "label": "希伯来文",
        "kind": "alias"
      },
      {
        "label": "希伯來文",
        "kind": "alias"
      }
    ],
    "nld": [
      {
        "label": "荷兰语",
        "kind": "local"
      },
      {
        "label": "Nederlands",
        "kind": "native"
      },
      {
        "label": "Dutch",
        "kind": "english"
      },
      {
        "label": "néerlandais",
        "kind": "alias"
      },
      {
        "label": "neerlandés",
        "kind": "alias"
      },
      {
        "label": "Niederländisch",
        "kind": "alias"
      },
      {
        "label": "荷文",
        "kind": "alias"
      },
      {
        "label": "荷语",
        "kind": "alias"
      },
      {
        "label": "荷語",
        "kind": "alias"
      },
      {
        "label": "flemish",
        "kind": "alias"
      }
    ],
    "pol": [
      {
        "label": "波兰语",
        "kind": "local"
      },
      {
        "label": "polski",
        "kind": "native"
      },
      {
        "label": "Polish",
        "kind": "english"
      },
      {
        "label": "polonais",
        "kind": "alias"
      },
      {
        "label": "polaco",
        "kind": "alias"
      },
      {
        "label": "Polnisch",
        "kind": "alias"
      },
      {
        "label": "波文",
        "kind": "alias"
      },
      {
        "label": "波语",
        "kind": "alias"
      },
      {
        "label": "波語",
        "kind": "alias"
      }
    ],
    "swe": [
      {
        "label": "瑞典语",
        "kind": "local"
      },
      {
        "label": "svenska",
        "kind": "native"
      },
      {
        "label": "Swedish",
        "kind": "english"
      },
      {
        "label": "suédois",
        "kind": "alias"
      },
      {
        "label": "sueco",
        "kind": "alias"
      },
      {
        "label": "Schwedisch",
        "kind": "alias"
      }
    ],
    "tur": [
      {
        "label": "土耳其语",
        "kind": "local"
      },
      {
        "label": "Türkçe",
        "kind": "native"
      },
      {
        "label": "Turkish",
        "kind": "english"
      },
      {
        "label": "turc",
        "kind": "alias"
      },
      {
        "label": "turco",
        "kind": "alias"
      },
      {
        "label": "Türkisch",
        "kind": "alias"
      },
      {
        "label": "土文",
        "kind": "alias"
      },
      {
        "label": "土语",
        "kind": "alias"
      },
      {
        "label": "土語",
        "kind": "alias"
      }
    ],
    "ukr": [
      {
        "label": "乌克兰语",
        "kind": "local"
      },
      {
        "label": "українська",
        "kind": "native"
      },
      {
        "label": "Ukrainian",
        "kind": "english"
      },
      {
        "label": "ukrainien",
        "kind": "alias"
      },
      {
        "label": "ucraniano",
        "kind": "alias"
      },
      {
        "label": "Ukrainisch",
        "kind": "alias"
      }
    ],
    "fin": [
      {
        "label": "芬兰语",
        "kind": "local"
      },
      {
        "label": "suomi",
        "kind": "native"
      },
      {
        "label": "Finnish",
        "kind": "english"
      },
      {
        "label": "finnois",
        "kind": "alias"
      },
      {
        "label": "finés",
        "kind": "alias"
      },
      {
        "label": "Finnisch",
        "kind": "alias"
      }
    ],
    "kor": [
      {
        "label": "韩语",
        "kind": "local"
      },
      {
        "label": "한국어",
        "kind": "native"
      },
      {
        "label": "Korean",
        "kind": "english"
      },
      {
        "label": "coréen",
        "kind": "alias"
      },
      {
        "label": "coreano",
        "kind": "alias"
      },
      {
        "label": "Koreanisch",
        "kind": "alias"
      },
      {
        "label": "韩文",
        "kind": "alias"
      },
      {
        "label": "韓文",
        "kind": "alias"
      },
      {
        "label": "韩国语",
        "kind": "alias"
      },
      {
        "label": "朝鲜语",
        "kind": "alias"
      },
      {
        "label": "朝鮮文",
        "kind": "alias"
      },
      {
        "label": "韓語",
        "kind": "alias"
      }
    ],
    "san": [
      {
        "label": "梵语",
        "kind": "local"
      },
      {
        "label": "संस्कृत भाषा",
        "kind": "native"
      },
      {
        "label": "Sanskrit",
        "kind": "english"
      },
      {
        "label": "sánscrito",
        "kind": "alias"
      }
    ],
    "ces": [
      {
        "label": "捷克语",
        "kind": "local"
      },
      {
        "label": "čeština",
        "kind": "native"
      },
      {
        "label": "Czech",
        "kind": "english"
      },
      {
        "label": "tchèque",
        "kind": "alias"
      },
      {
        "label": "checo",
        "kind": "alias"
      },
      {
        "label": "Tschechisch",
        "kind": "alias"
      }
    ],
    "cat": [
      {
        "label": "加泰罗尼亚语",
        "kind": "local"
      },
      {
        "label": "català",
        "kind": "native"
      },
      {
        "label": "Catalan",
        "kind": "english"
      },
      {
        "label": "catalán",
        "kind": "alias"
      },
      {
        "label": "Katalanisch",
        "kind": "alias"
      }
    ],
    "dan": [
      {
        "label": "丹麦语",
        "kind": "local"
      },
      {
        "label": "dansk",
        "kind": "native"
      },
      {
        "label": "Danish",
        "kind": "english"
      },
      {
        "label": "danois",
        "kind": "alias"
      },
      {
        "label": "danés",
        "kind": "alias"
      },
      {
        "label": "Dänisch",
        "kind": "alias"
      }
    ],
    "ron": [
      {
        "label": "罗马尼亚语",
        "kind": "local"
      },
      {
        "label": "română",
        "kind": "native"
      },
      {
        "label": "Romanian",
        "kind": "english"
      },
      {
        "label": "roumain",
        "kind": "alias"
      },
      {
        "label": "rumano",
        "kind": "alias"
      },
      {
        "label": "Rumänisch",
        "kind": "alias"
      }
    ],
    "swa": [
      {
        "label": "斯瓦希里语",
        "kind": "local"
      },
      {
        "label": "Kiswahili",
        "kind": "native"
      },
      {
        "label": "Swahili",
        "kind": "english"
      },
      {
        "label": "suajili",
        "kind": "alias"
      },
      {
        "label": "Suaheli",
        "kind": "alias"
      }
    ],
    "hun": [
      {
        "label": "匈牙利语",
        "kind": "local"
      },
      {
        "label": "magyar",
        "kind": "native"
      },
      {
        "label": "Hungarian",
        "kind": "english"
      },
      {
        "label": "hongrois",
        "kind": "alias"
      },
      {
        "label": "húngaro",
        "kind": "alias"
      },
      {
        "label": "Ungarisch",
        "kind": "alias"
      }
    ],
    "syl": [
      {
        "label": "Sylheti",
        "kind": "english"
      }
    ],
    "hrv": [
      {
        "label": "克罗地亚语",
        "kind": "local"
      },
      {
        "label": "hrvatski",
        "kind": "native"
      },
      {
        "label": "Croatian",
        "kind": "english"
      },
      {
        "label": "croate",
        "kind": "alias"
      },
      {
        "label": "croata",
        "kind": "alias"
      },
      {
        "label": "Kroatisch",
        "kind": "alias"
      }
    ],
    "nor": [
      {
        "label": "挪威语",
        "kind": "local"
      },
      {
        "label": "norsk",
        "kind": "native"
      },
      {
        "label": "Norwegian",
        "kind": "english"
      },
      {
        "label": "norvégien",
        "kind": "alias"
      },
      {
        "label": "noruego",
        "kind": "alias"
      },
      {
        "label": "Norwegisch",
        "kind": "alias"
      }
    ],
    "ben": [
      {
        "label": "孟加拉语",
        "kind": "local"
      },
      {
        "label": "বাংলা",
        "kind": "native"
      },
      {
        "label": "Bangla",
        "kind": "english"
      },
      {
        "label": "bengali",
        "kind": "alias"
      },
      {
        "label": "bengalí",
        "kind": "alias"
      },
      {
        "label": "Bengalisch",
        "kind": "alias"
      },
      {
        "label": "孟加拉文",
        "kind": "alias"
      },
      {
        "label": "孟加拉語",
        "kind": "alias"
      }
    ],
    "aze": [
      {
        "label": "阿塞拜疆语",
        "kind": "local"
      },
      {
        "label": "azərbaycan",
        "kind": "native"
      },
      {
        "label": "Azerbaijani",
        "kind": "english"
      },
      {
        "label": "azerbaïdjanais",
        "kind": "alias"
      },
      {
        "label": "azerbaiyano",
        "kind": "alias"
      },
      {
        "label": "Aserbaidschanisch",
        "kind": "alias"
      }
    ],
    "afr": [
      {
        "label": "南非荷兰语",
        "kind": "local"
      },
      {
        "label": "Afrikaans",
        "kind": "native"
      },
      {
        "label": "afrikáans",
        "kind": "alias"
      }
    ],
    "est": [
      {
        "label": "爱沙尼亚语",
        "kind": "local"
      },
      {
        "label": "eesti",
        "kind": "native"
      },
      {
        "label": "Estonian",
        "kind": "english"
      },
      {
        "label": "estonien",
        "kind": "alias"
      },
      {
        "label": "estonio",
        "kind": "alias"
      },
      {
        "label": "Estnisch",
        "kind": "alias"
      }
    ],
    "bul": [
      {
        "label": "保加利亚语",
        "kind": "local"
      },
      {
        "label": "български",
        "kind": "native"
      },
      {
        "label": "Bulgarian",
        "kind": "english"
      },
      {
        "label": "bulgare",
        "kind": "alias"
      },
      {
        "label": "búlgaro",
        "kind": "alias"
      },
      {
        "label": "Bulgarisch",
        "kind": "alias"
      }
    ],
    "gle": [
      {
        "label": "爱尔兰语",
        "kind": "local"
      },
      {
        "label": "Gaeilge",
        "kind": "native"
      },
      {
        "label": "Irish",
        "kind": "english"
      },
      {
        "label": "irlandais",
        "kind": "alias"
      },
      {
        "label": "irlandés",
        "kind": "alias"
      },
      {
        "label": "Irisch",
        "kind": "alias"
      }
    ],
    "bel": [
      {
        "label": "白俄罗斯语",
        "kind": "local"
      },
      {
        "label": "беларуская",
        "kind": "native"
      },
      {
        "label": "Belarusian",
        "kind": "english"
      },
      {
        "label": "biélorusse",
        "kind": "alias"
      },
      {
        "label": "bielorruso",
        "kind": "alias"
      },
      {
        "label": "Belarussisch",
        "kind": "alias"
      }
    ],
    "ind": [
      {
        "label": "印度尼西亚语",
        "kind": "local"
      },
      {
        "label": "Bahasa Indonesia",
        "kind": "native"
      },
      {
        "label": "Indonesian",
        "kind": "english"
      },
      {
        "label": "indonésien",
        "kind": "alias"
      },
      {
        "label": "indonesio",
        "kind": "alias"
      },
      {
        "label": "Indonesisch",
        "kind": "alias"
      },
      {
        "label": "印尼文",
        "kind": "alias"
      },
      {
        "label": "印尼语",
        "kind": "alias"
      },
      {
        "label": "印尼語",
        "kind": "alias"
      }
    ],
    "isl": [
      {
        "label": "冰岛语",
        "kind": "local"
      },
      {
        "label": "íslenska",
        "kind": "native"
      },
      {
        "label": "Icelandic",
        "kind": "english"
      },
      {
        "label": "islandais",
        "kind": "alias"
      },
      {
        "label": "islandés",
        "kind": "alias"
      },
      {
        "label": "Isländisch",
        "kind": "alias"
      }
    ],
    "lit": [
      {
        "label": "立陶宛语",
        "kind": "local"
      },
      {
        "label": "lietuvių",
        "kind": "native"
      },
      {
        "label": "Lithuanian",
        "kind": "english"
      },
      {
        "label": "lituanien",
        "kind": "alias"
      },
      {
        "label": "lituano",
        "kind": "alias"
      },
      {
        "label": "Litauisch",
        "kind": "alias"
      }
    ],
    "ile": [
      {
        "label": "国际文字（E）",
        "kind": "local"
      },
      {
        "label": "Interlingue",
        "kind": "native"
      }
    ],
    "hye": [
      {
        "label": "亚美尼亚语",
        "kind": "local"
      },
      {
        "label": "հայերեն",
        "kind": "native"
      },
      {
        "label": "Armenian",
        "kind": "english"
      },
      {
        "label": "arménien",
        "kind": "alias"
      },
      {
        "label": "armenio",
        "kind": "alias"
      },
      {
        "label": "Armenisch",
        "kind": "alias"
      }
    ],
    "slk": [
      {
        "label": "斯洛伐克语",
        "kind": "local"
      },
      {
        "label": "slovenčina",
        "kind": "native"
      },
      {
        "label": "Slovak",
        "kind": "english"
      },
      {
        "label": "slovaque",
        "kind": "alias"
      },
      {
        "label": "eslovaco",
        "kind": "alias"
      },
      {
        "label": "Slowakisch",
        "kind": "alias"
      }
    ],
    "tam": [
      {
        "label": "泰米尔语",
        "kind": "local"
      },
      {
        "label": "தமிழ்",
        "kind": "native"
      },
      {
        "label": "Tamil",
        "kind": "english"
      },
      {
        "label": "tamoul",
        "kind": "alias"
      }
    ],
    "sqi": [
      {
        "label": "阿尔巴尼亚语",
        "kind": "local"
      },
      {
        "label": "shqip",
        "kind": "native"
      },
      {
        "label": "Albanian",
        "kind": "english"
      },
      {
        "label": "albanais",
        "kind": "alias"
      },
      {
        "label": "albanés",
        "kind": "alias"
      },
      {
        "label": "Albanisch",
        "kind": "alias"
      }
    ],
    "eus": [
      {
        "label": "巴斯克语",
        "kind": "local"
      },
      {
        "label": "euskara",
        "kind": "native"
      },
      {
        "label": "Basque",
        "kind": "english"
      },
      {
        "label": "euskera",
        "kind": "alias"
      },
      {
        "label": "Baskisch",
        "kind": "alias"
      }
    ],
    "kat": [
      {
        "label": "格鲁吉亚语",
        "kind": "local"
      },
      {
        "label": "ქართული",
        "kind": "native"
      },
      {
        "label": "Georgian",
        "kind": "english"
      },
      {
        "label": "géorgien",
        "kind": "alias"
      },
      {
        "label": "georgiano",
        "kind": "alias"
      },
      {
        "label": "Georgisch",
        "kind": "alias"
      }
    ],
    "srp": [
      {
        "label": "塞尔维亚语",
        "kind": "local"
      },
      {
        "label": "српски",
        "kind": "native"
      },
      {
        "label": "Serbian",
        "kind": "english"
      },
      {
        "label": "serbe",
        "kind": "alias"
      },
      {
        "label": "serbio",
        "kind": "alias"
      },
      {
        "label": "Serbisch",
        "kind": "alias"
      }
    ],
    "lav": [
      {
        "label": "拉脱维亚语",
        "kind": "local"
      },
      {
        "label": "latviešu",
        "kind": "native"
      },
      {
        "label": "Latvian",
        "kind": "english"
      },
      {
        "label": "letton",
        "kind": "alias"
      },
      {
        "label": "letón",
        "kind": "alias"
      },
      {
        "label": "Lettisch",
        "kind": "alias"
      }
    ],
    "tha": [
      {
        "label": "泰语",
        "kind": "local"
      },
      {
        "label": "ไทย",
        "kind": "native"
      },
      {
        "label": "Thai",
        "kind": "english"
      },
      {
        "label": "thaï",
        "kind": "alias"
      },
      {
        "label": "tailandés",
        "kind": "alias"
      },
      {
        "label": "Thailändisch",
        "kind": "alias"
      },
      {
        "label": "泰文",
        "kind": "alias"
      },
      {
        "label": "泰語",
        "kind": "alias"
      }
    ],
    "slv": [
      {
        "label": "斯洛文尼亚语",
        "kind": "local"
      },
      {
        "label": "slovenščina",
        "kind": "native"
      },
      {
        "label": "Slovene",
        "kind": "english"
      },
      {
        "label": "Slovenian",
        "kind": "alias"
      },
      {
        "label": "slovène",
        "kind": "alias"
      },
      {
        "label": "esloveno",
        "kind": "alias"
      },
      {
        "label": "Slowenisch",
        "kind": "alias"
      }
    ],
    "vie": [
      {
        "label": "越南语",
        "kind": "local"
      },
      {
        "label": "Tiếng Việt",
        "kind": "native"
      },
      {
        "label": "Vietnamese",
        "kind": "english"
      },
      {
        "label": "vietnamien",
        "kind": "alias"
      },
      {
        "label": "vietnamita",
        "kind": "alias"
      },
      {
        "label": "Vietnamesisch",
        "kind": "alias"
      },
      {
        "label": "越文",
        "kind": "alias"
      },
      {
        "label": "越語",
        "kind": "alias"
      }
    ],
    "oci": [
      {
        "label": "奥克语",
        "kind": "local"
      },
      {
        "label": "occitan",
        "kind": "native"
      },
      {
        "label": "occitano",
        "kind": "alias"
      },
      {
        "label": "Okzitanisch",
        "kind": "alias"
      }
    ],
    "kaz": [
      {
        "label": "哈萨克语",
        "kind": "local"
      },
      {
        "label": "қазақ тілі",
        "kind": "native"
      },
      {
        "label": "Kazakh",
        "kind": "english"
      },
      {
        "label": "kazajo",
        "kind": "alias"
      },
      {
        "label": "Kasachisch",
        "kind": "alias"
      },
      {
        "label": "哈薩克語",
        "kind": "alias"
      }
    ],
    "cym": [
      {
        "label": "威尔士语",
        "kind": "local"
      },
      {
        "label": "Cymraeg",
        "kind": "native"
      },
      {
        "label": "Welsh",
        "kind": "english"
      },
      {
        "label": "gallois",
        "kind": "alias"
      },
      {
        "label": "galés",
        "kind": "alias"
      },
      {
        "label": "Walisisch",
        "kind": "alias"
      }
    ],
    "msa": [
      {
        "label": "马来语",
        "kind": "local"
      },
      {
        "label": "Melayu",
        "kind": "native"
      },
      {
        "label": "Malay",
        "kind": "english"
      },
      {
        "label": "malais",
        "kind": "alias"
      },
      {
        "label": "malayo",
        "kind": "alias"
      },
      {
        "label": "Malaiisch",
        "kind": "alias"
      },
      {
        "label": "马来文",
        "kind": "alias"
      },
      {
        "label": "马来话",
        "kind": "alias"
      },
      {
        "label": "馬來文",
        "kind": "alias"
      },
      {
        "label": "馬來話",
        "kind": "alias"
      },
      {
        "label": "bahasa melayu",
        "kind": "alias"
      }
    ],
    "ina": [
      {
        "label": "国际语",
        "kind": "local"
      },
      {
        "label": "interlingua",
        "kind": "native"
      },
      {
        "label": "Interlingua (International Auxiliary Language Association)",
        "kind": "english"
      }
    ],
    "yid": [
      {
        "label": "意第绪语",
        "kind": "local"
      },
      {
        "label": "ייִדיש",
        "kind": "native"
      },
      {
        "label": "Yiddish",
        "kind": "english"
      },
      {
        "label": "yidis",
        "kind": "alias"
      },
      {
        "label": "Jiddisch",
        "kind": "alias"
      }
    ],
    "mkd": [
      {
        "label": "马其顿语",
        "kind": "local"
      },
      {
        "label": "македонски",
        "kind": "native"
      },
      {
        "label": "Macedonian",
        "kind": "english"
      },
      {
        "label": "macédonien",
        "kind": "alias"
      },
      {
        "label": "macedonio",
        "kind": "alias"
      },
      {
        "label": "Mazedonisch",
        "kind": "alias"
      }
    ],
    "grc": [
      {
        "label": "古希腊语",
        "kind": "local"
      },
      {
        "label": "Ancient Greek",
        "kind": "english"
      },
      {
        "label": "grec ancien",
        "kind": "alias"
      },
      {
        "label": "griego antiguo",
        "kind": "alias"
      },
      {
        "label": "Altgriechisch",
        "kind": "alias"
      }
    ],
    "kur": [
      {
        "label": "库尔德语",
        "kind": "local"
      },
      {
        "label": "Kurdî",
        "kind": "native"
      },
      {
        "label": "Kurdish",
        "kind": "english"
      },
      {
        "label": "kurde",
        "kind": "alias"
      },
      {
        "label": "kurdo",
        "kind": "alias"
      },
      {
        "label": "Kurdisch",
        "kind": "alias"
      }
    ],
    "lfn": [
      {
        "label": "Lingua Franca Nova",
        "kind": "english"
      }
    ],
    "mon": [
      {
        "label": "蒙古语",
        "kind": "local"
      },
      {
        "label": "монгол",
        "kind": "native"
      },
      {
        "label": "Mongolian",
        "kind": "english"
      },
      {
        "label": "mongol",
        "kind": "alias"
      },
      {
        "label": "Mongolisch",
        "kind": "alias"
      },
      {
        "label": "蒙古文",
        "kind": "alias"
      },
      {
        "label": "蒙古語",
        "kind": "alias"
      },
      {
        "label": "蒙古話",
        "kind": "alias"
      }
    ],
    "ido": [
      {
        "label": "伊多语",
        "kind": "local"
      },
      {
        "label": "Ido",
        "kind": "english"
      }
    ],
    "glg": [
      {
        "label": "加利西亚语",
        "kind": "local"
      },
      {
        "label": "galego",
        "kind": "native"
      },
      {
        "label": "Galician",
        "kind": "english"
      },
      {
        "label": "galicien",
        "kind": "alias"
      },
      {
        "label": "gallego",
        "kind": "alias"
      },
      {
        "label": "Galicisch",
        "kind": "alias"
      }
    ],
    "tel": [
      {
        "label": "泰卢固语",
        "kind": "local"
      },
      {
        "label": "తెలుగు",
        "kind": "native"
      },
      {
        "label": "Telugu",
        "kind": "english"
      },
      {
        "label": "télougou",
        "kind": "alias"
      }
    ],
    "mlt": [
      {
        "label": "马耳他语",
        "kind": "local"
      },
      {
        "label": "Malti",
        "kind": "native"
      },
      {
        "label": "Maltese",
        "kind": "english"
      },
      {
        "label": "maltais",
        "kind": "alias"
      },
      {
        "label": "maltés",
        "kind": "alias"
      },
      {
        "label": "Maltesisch",
        "kind": "alias"
      }
    ],
    "pus": [
      {
        "label": "普什图语",
        "kind": "local"
      },
      {
        "label": "پښتو",
        "kind": "native"
      },
      {
        "label": "Pashto",
        "kind": "english"
      },
      {
        "label": "pachto",
        "kind": "alias"
      },
      {
        "label": "pastún",
        "kind": "alias"
      },
      {
        "label": "Paschtu",
        "kind": "alias"
      }
    ],
    "tat": [
      {
        "label": "鞑靼语",
        "kind": "local"
      },
      {
        "label": "татар",
        "kind": "native"
      },
      {
        "label": "Tatar",
        "kind": "english"
      },
      {
        "label": "tártaro",
        "kind": "alias"
      },
      {
        "label": "Tatarisch",
        "kind": "alias"
      }
    ],
    "pan": [
      {
        "label": "旁遮普语",
        "kind": "local"
      },
      {
        "label": "ਪੰਜਾਬੀ",
        "kind": "native"
      },
      {
        "label": "Punjabi",
        "kind": "english"
      },
      {
        "label": "pendjabi",
        "kind": "alias"
      },
      {
        "label": "punyabí",
        "kind": "alias"
      },
      {
        "label": "旁遮普文",
        "kind": "alias"
      },
      {
        "label": "旁遮普語",
        "kind": "alias"
      }
    ],
    "uzb": [
      {
        "label": "乌兹别克语",
        "kind": "local"
      },
      {
        "label": "o‘zbek",
        "kind": "native"
      },
      {
        "label": "Uzbek",
        "kind": "english"
      },
      {
        "label": "ouzbek",
        "kind": "alias"
      },
      {
        "label": "uzbeko",
        "kind": "alias"
      },
      {
        "label": "Usbekisch",
        "kind": "alias"
      }
    ],
    "ltz": [
      {
        "label": "卢森堡语",
        "kind": "local"
      },
      {
        "label": "Lëtzebuergesch",
        "kind": "native"
      },
      {
        "label": "Luxembourgish",
        "kind": "english"
      },
      {
        "label": "luxembourgeois",
        "kind": "alias"
      },
      {
        "label": "luxemburgués",
        "kind": "alias"
      },
      {
        "label": "Luxemburgisch",
        "kind": "alias"
      }
    ],
    "nep": [
      {
        "label": "尼泊尔语",
        "kind": "local"
      },
      {
        "label": "नेपाली",
        "kind": "native"
      },
      {
        "label": "Nepali",
        "kind": "english"
      },
      {
        "label": "népalais",
        "kind": "alias"
      },
      {
        "label": "nepalí",
        "kind": "alias"
      },
      {
        "label": "Nepalesisch",
        "kind": "alias"
      },
      {
        "label": "尼泊尔文",
        "kind": "alias"
      },
      {
        "label": "尼泊爾文",
        "kind": "alias"
      }
    ],
    "gla": [
      {
        "label": "苏格兰盖尔语",
        "kind": "local"
      },
      {
        "label": "Gàidhlig",
        "kind": "native"
      },
      {
        "label": "Scottish Gaelic",
        "kind": "english"
      },
      {
        "label": "gaélique écossais",
        "kind": "alias"
      },
      {
        "label": "gaélico escocés",
        "kind": "alias"
      },
      {
        "label": "Gälisch (Schottland)",
        "kind": "alias"
      }
    ],
    "bre": [
      {
        "label": "布列塔尼语",
        "kind": "local"
      },
      {
        "label": "brezhoneg",
        "kind": "native"
      },
      {
        "label": "Breton",
        "kind": "english"
      },
      {
        "label": "bretón",
        "kind": "alias"
      },
      {
        "label": "Bretonisch",
        "kind": "alias"
      }
    ],
    "cmn": [
      {
        "label": "普通话",
        "kind": "local"
      },
      {
        "label": "Mandarin",
        "kind": "english"
      },
      {
        "label": "mandarín",
        "kind": "alias"
      },
      {
        "label": "中文",
        "kind": "alias"
      },
      {
        "label": "chinese",
        "kind": "alias"
      },
      {
        "label": "mandarin chinese",
        "kind": "alias"
      },
      {
        "label": "standard chinese",
        "kind": "alias"
      },
      {
        "label": "putonghua",
        "kind": "alias"
      },
      {
        "label": "guoyu",
        "kind": "alias"
      },
      {
        "label": "汉语",
        "kind": "alias"
      },
      {
        "label": "国语",
        "kind": "alias"
      },
      {
        "label": "國語",
        "kind": "alias"
      },
      {
        "label": "华语",
        "kind": "alias"
      },
      {
        "label": "華語",
        "kind": "alias"
      },
      {
        "label": "官话",
        "kind": "alias"
      },
      {
        "label": "北方话",
        "kind": "alias"
      },
      {
        "label": "北方方言",
        "kind": "alias"
      },
      {
        "label": "中文普通话",
        "kind": "alias"
      }
    ],
    "kir": [
      {
        "label": "吉尔吉斯语",
        "kind": "local"
      },
      {
        "label": "кыргызча",
        "kind": "native"
      },
      {
        "label": "Kyrgyz",
        "kind": "english"
      },
      {
        "label": "kirghize",
        "kind": "alias"
      },
      {
        "label": "kirguís",
        "kind": "alias"
      },
      {
        "label": "Kirgisisch",
        "kind": "alias"
      },
      {
        "label": "柯尔克孜语",
        "kind": "alias"
      },
      {
        "label": "柯爾克孜語",
        "kind": "alias"
      },
      {
        "label": "吉爾吉斯語",
        "kind": "alias"
      }
    ],
    "fao": [
      {
        "label": "法罗语",
        "kind": "local"
      },
      {
        "label": "føroyskt",
        "kind": "native"
      },
      {
        "label": "Faroese",
        "kind": "english"
      },
      {
        "label": "féroïen",
        "kind": "alias"
      },
      {
        "label": "feroés",
        "kind": "alias"
      },
      {
        "label": "Färöisch",
        "kind": "alias"
      }
    ],
    "amh": [
      {
        "label": "阿姆哈拉语",
        "kind": "local"
      },
      {
        "label": "አማርኛ",
        "kind": "native"
      },
      {
        "label": "Amharic",
        "kind": "english"
      },
      {
        "label": "amharique",
        "kind": "alias"
      },
      {
        "label": "amárico",
        "kind": "alias"
      },
      {
        "label": "Amharisch",
        "kind": "alias"
      },
      {
        "label": "阿姆哈拉文",
        "kind": "alias"
      },
      {
        "label": "阿姆哈拉語",
        "kind": "alias"
      }
    ],
    "kan": [
      {
        "label": "卡纳达语",
        "kind": "local"
      },
      {
        "label": "ಕನ್ನಡ",
        "kind": "native"
      },
      {
        "label": "Kannada",
        "kind": "english"
      },
      {
        "label": "canarés",
        "kind": "alias"
      }
    ],
    "mar": [
      {
        "label": "马拉地语",
        "kind": "local"
      },
      {
        "label": "मराठी",
        "kind": "native"
      },
      {
        "label": "Marathi",
        "kind": "english"
      },
      {
        "label": "maratí",
        "kind": "alias"
      }
    ],
    "tgl": [
      {
        "label": "他加禄语",
        "kind": "local"
      },
      {
        "label": "Tagalog",
        "kind": "native"
      },
      {
        "label": "tagalo",
        "kind": "alias"
      },
      {
        "label": "他加禄文",
        "kind": "alias"
      },
      {
        "label": "他加祿文",
        "kind": "alias"
      }
    ],
    "roh": [
      {
        "label": "罗曼什语",
        "kind": "local"
      },
      {
        "label": "rumantsch",
        "kind": "native"
      },
      {
        "label": "Romansh",
        "kind": "english"
      },
      {
        "label": "romanche",
        "kind": "alias"
      },
      {
        "label": "Rätoromanisch",
        "kind": "alias"
      }
    ],
    "bak": [
      {
        "label": "巴什基尔语",
        "kind": "local"
      },
      {
        "label": "Bashkir",
        "kind": "english"
      },
      {
        "label": "bachkir",
        "kind": "alias"
      },
      {
        "label": "baskir",
        "kind": "alias"
      },
      {
        "label": "Baschkirisch",
        "kind": "alias"
      }
    ],
    "mal": [
      {
        "label": "马拉雅拉姆语",
        "kind": "local"
      },
      {
        "label": "മലയാളം",
        "kind": "native"
      },
      {
        "label": "Malayalam",
        "kind": "english"
      },
      {
        "label": "malayálam",
        "kind": "alias"
      }
    ],
    "mya": [
      {
        "label": "缅甸语",
        "kind": "local"
      },
      {
        "label": "မြန်မာ",
        "kind": "native"
      },
      {
        "label": "Burmese",
        "kind": "english"
      },
      {
        "label": "birman",
        "kind": "alias"
      },
      {
        "label": "birmano",
        "kind": "alias"
      },
      {
        "label": "Birmanisch",
        "kind": "alias"
      },
      {
        "label": "缅语",
        "kind": "alias"
      },
      {
        "label": "缅文",
        "kind": "alias"
      },
      {
        "label": "緬語",
        "kind": "alias"
      },
      {
        "label": "緬文",
        "kind": "alias"
      }
    ],
    "que": [
      {
        "label": "克丘亚语",
        "kind": "local"
      },
      {
        "label": "Runasimi",
        "kind": "native"
      },
      {
        "label": "Quechua",
        "kind": "english"
      }
    ],
    "jav": [
      {
        "label": "爪哇语",
        "kind": "local"
      },
      {
        "label": "Jawa",
        "kind": "native"
      },
      {
        "label": "Javanese",
        "kind": "english"
      },
      {
        "label": "javanais",
        "kind": "alias"
      },
      {
        "label": "javanés",
        "kind": "alias"
      },
      {
        "label": "Javanisch",
        "kind": "alias"
      }
    ],
    "uig": [
      {
        "label": "维吾尔语",
        "kind": "local"
      },
      {
        "label": "ئۇيغۇرچە",
        "kind": "native"
      },
      {
        "label": "Uyghur",
        "kind": "english"
      },
      {
        "label": "ouïghour",
        "kind": "alias"
      },
      {
        "label": "uigur",
        "kind": "alias"
      },
      {
        "label": "Uigurisch",
        "kind": "alias"
      },
      {
        "label": "维语",
        "kind": "alias"
      },
      {
        "label": "維語",
        "kind": "alias"
      },
      {
        "label": "維吾爾語",
        "kind": "alias"
      }
    ],
    "mri": [
      {
        "label": "毛利语",
        "kind": "local"
      },
      {
        "label": "Māori",
        "kind": "native"
      },
      {
        "label": "maori",
        "kind": "alias"
      },
      {
        "label": "maorí",
        "kind": "alias"
      }
    ],
    "tgk": [
      {
        "label": "塔吉克语",
        "kind": "local"
      },
      {
        "label": "тоҷикӣ",
        "kind": "native"
      },
      {
        "label": "Tajik",
        "kind": "english"
      },
      {
        "label": "tadjik",
        "kind": "alias"
      },
      {
        "label": "tayiko",
        "kind": "alias"
      },
      {
        "label": "Tadschikisch",
        "kind": "alias"
      },
      {
        "label": "塔吉克語",
        "kind": "alias"
      }
    ],
    "tuk": [
      {
        "label": "土库曼语",
        "kind": "local"
      },
      {
        "label": "türkmen dili",
        "kind": "native"
      },
      {
        "label": "Turkmen",
        "kind": "english"
      },
      {
        "label": "turkmène",
        "kind": "alias"
      },
      {
        "label": "turcomano",
        "kind": "alias"
      },
      {
        "label": "Turkmenisch",
        "kind": "alias"
      }
    ],
    "abk": [
      {
        "label": "阿布哈西亚语",
        "kind": "local"
      },
      {
        "label": "Abkhaz",
        "kind": "english"
      },
      {
        "label": "Abkhazian",
        "kind": "alias"
      },
      {
        "label": "abkhaze",
        "kind": "alias"
      },
      {
        "label": "abjasio",
        "kind": "alias"
      },
      {
        "label": "Abchasisch",
        "kind": "alias"
      }
    ],
    "guj": [
      {
        "label": "古吉拉特语",
        "kind": "local"
      },
      {
        "label": "ગુજરાતી",
        "kind": "native"
      },
      {
        "label": "Gujarati",
        "kind": "english"
      },
      {
        "label": "goudjarati",
        "kind": "alias"
      },
      {
        "label": "guyaratí",
        "kind": "alias"
      }
    ],
    "szl": [
      {
        "label": "西里西亚语",
        "kind": "local"
      },
      {
        "label": "ślōnski",
        "kind": "native"
      },
      {
        "label": "Silesian",
        "kind": "english"
      },
      {
        "label": "silésien",
        "kind": "alias"
      },
      {
        "label": "silesio",
        "kind": "alias"
      },
      {
        "label": "Schlesisch (Wasserpolnisch)",
        "kind": "alias"
      }
    ],
    "khm": [
      {
        "label": "高棉语",
        "kind": "local"
      },
      {
        "label": "ខ្មែរ",
        "kind": "native"
      },
      {
        "label": "Khmer",
        "kind": "english"
      },
      {
        "label": "jemer",
        "kind": "alias"
      },
      {
        "label": "高棉文",
        "kind": "alias"
      },
      {
        "label": "柬语",
        "kind": "alias"
      },
      {
        "label": "柬語",
        "kind": "alias"
      },
      {
        "label": "柬埔寨语",
        "kind": "alias"
      },
      {
        "label": "柬埔寨語",
        "kind": "alias"
      }
    ],
    "zul": [
      {
        "label": "祖鲁语",
        "kind": "local"
      },
      {
        "label": "isiZulu",
        "kind": "native"
      },
      {
        "label": "Zulu",
        "kind": "english"
      },
      {
        "label": "zoulou",
        "kind": "alias"
      },
      {
        "label": "zulú",
        "kind": "alias"
      }
    ],
    "bod": [
      {
        "label": "藏语",
        "kind": "local"
      },
      {
        "label": "བོད་སྐད་",
        "kind": "native"
      },
      {
        "label": "Tibetan",
        "kind": "english"
      },
      {
        "label": "tibétain",
        "kind": "alias"
      },
      {
        "label": "tibetano",
        "kind": "alias"
      },
      {
        "label": "Tibetisch",
        "kind": "alias"
      },
      {
        "label": "藏文",
        "kind": "alias"
      },
      {
        "label": "藏語",
        "kind": "alias"
      },
      {
        "label": "藏話",
        "kind": "alias"
      }
    ],
    "che": [
      {
        "label": "车臣语",
        "kind": "local"
      },
      {
        "label": "нохчийн",
        "kind": "native"
      },
      {
        "label": "Chechen",
        "kind": "english"
      },
      {
        "label": "tchétchène",
        "kind": "alias"
      },
      {
        "label": "checheno",
        "kind": "alias"
      },
      {
        "label": "Tschetschenisch",
        "kind": "alias"
      }
    ],
    "zza": [
      {
        "label": "扎扎语",
        "kind": "local"
      },
      {
        "label": "Zazaki",
        "kind": "english"
      },
      {
        "label": "Zaza",
        "kind": "alias"
      }
    ],
    "asm": [
      {
        "label": "阿萨姆语",
        "kind": "local"
      },
      {
        "label": "অসমীয়া",
        "kind": "native"
      },
      {
        "label": "Assamese",
        "kind": "english"
      },
      {
        "label": "assamais",
        "kind": "alias"
      },
      {
        "label": "asamés",
        "kind": "alias"
      },
      {
        "label": "Assamesisch",
        "kind": "alias"
      }
    ],
    "cor": [
      {
        "label": "康沃尔语",
        "kind": "local"
      },
      {
        "label": "kernewek",
        "kind": "native"
      },
      {
        "label": "Cornish",
        "kind": "english"
      },
      {
        "label": "cornique",
        "kind": "alias"
      },
      {
        "label": "córnico",
        "kind": "alias"
      },
      {
        "label": "Kornisch",
        "kind": "alias"
      }
    ],
    "chv": [
      {
        "label": "楚瓦什语",
        "kind": "local"
      },
      {
        "label": "чӑваш",
        "kind": "native"
      },
      {
        "label": "Chuvash",
        "kind": "english"
      },
      {
        "label": "tchouvache",
        "kind": "alias"
      },
      {
        "label": "chuvasio",
        "kind": "alias"
      },
      {
        "label": "Tschuwaschisch",
        "kind": "alias"
      }
    ],
    "haw": [
      {
        "label": "夏威夷语",
        "kind": "local"
      },
      {
        "label": "ʻŌlelo Hawaiʻi",
        "kind": "native"
      },
      {
        "label": "Hawaiian",
        "kind": "english"
      },
      {
        "label": "hawaïen",
        "kind": "alias"
      },
      {
        "label": "hawaiano",
        "kind": "alias"
      },
      {
        "label": "Hawaiisch",
        "kind": "alias"
      }
    ],
    "sco": [
      {
        "label": "苏格兰语",
        "kind": "local"
      },
      {
        "label": "Scots",
        "kind": "english"
      },
      {
        "label": "écossais",
        "kind": "alias"
      },
      {
        "label": "escocés",
        "kind": "alias"
      },
      {
        "label": "Schottisch",
        "kind": "alias"
      }
    ],
    "vol": [
      {
        "label": "沃拉普克语",
        "kind": "local"
      },
      {
        "label": "Volapük",
        "kind": "english"
      }
    ],
    "hbs": [
      {
        "label": "塞尔维亚-克罗地亚语",
        "kind": "local"
      },
      {
        "label": "srpskohrvatski",
        "kind": "native"
      },
      {
        "label": "Serbo-Croatian",
        "kind": "english"
      },
      {
        "label": "serbo-croate",
        "kind": "alias"
      },
      {
        "label": "serbocroata",
        "kind": "alias"
      },
      {
        "label": "Serbo-Kroatisch",
        "kind": "alias"
      }
    ],
    "hau": [
      {
        "label": "豪萨语",
        "kind": "local"
      },
      {
        "label": "Hausa",
        "kind": "native"
      },
      {
        "label": "haoussa",
        "kind": "alias"
      },
      {
        "label": "Haussa",
        "kind": "alias"
      }
    ],
    "grn": [
      {
        "label": "瓜拉尼语",
        "kind": "local"
      },
      {
        "label": "Guarani",
        "kind": "english"
      },
      {
        "label": "guaraní",
        "kind": "alias"
      }
    ],
    "som": [
      {
        "label": "索马里语",
        "kind": "local"
      },
      {
        "label": "Soomaali",
        "kind": "native"
      },
      {
        "label": "Somali",
        "kind": "english"
      },
      {
        "label": "somalí",
        "kind": "alias"
      }
    ],
    "mlg": [
      {
        "label": "马拉加斯语",
        "kind": "local"
      },
      {
        "label": "Malagasy",
        "kind": "native"
      },
      {
        "label": "malgache",
        "kind": "alias"
      }
    ],
    "srd": [
      {
        "label": "萨丁语",
        "kind": "local"
      },
      {
        "label": "sardu",
        "kind": "native"
      },
      {
        "label": "Sardinian",
        "kind": "english"
      },
      {
        "label": "sarde",
        "kind": "alias"
      },
      {
        "label": "sardo",
        "kind": "alias"
      },
      {
        "label": "Sardisch",
        "kind": "alias"
      }
    ],
    "ory": [
      {
        "label": "奥里亚语",
        "kind": "local"
      },
      {
        "label": "ଓଡ଼ିଆ",
        "kind": "native"
      },
      {
        "label": "Odia",
        "kind": "english"
      },
      {
        "label": "oriya",
        "kind": "alias"
      }
    ],
    "glv": [
      {
        "label": "马恩语",
        "kind": "local"
      },
      {
        "label": "Gaelg",
        "kind": "native"
      },
      {
        "label": "Manx",
        "kind": "english"
      },
      {
        "label": "mannois",
        "kind": "alias"
      },
      {
        "label": "manés",
        "kind": "alias"
      }
    ],
    "arg": [
      {
        "label": "阿拉贡语",
        "kind": "local"
      },
      {
        "label": "Aragonese",
        "kind": "english"
      },
      {
        "label": "aragonais",
        "kind": "alias"
      },
      {
        "label": "aragonés",
        "kind": "alias"
      },
      {
        "label": "Aragonesisch",
        "kind": "alias"
      }
    ],
    "crh": [
      {
        "label": "克里米亚鞑靼语",
        "kind": "local"
      },
      {
        "label": "Crimean Tatar",
        "kind": "english"
      },
      {
        "label": "tatar de Crimée",
        "kind": "alias"
      },
      {
        "label": "tártaro de Crimea",
        "kind": "alias"
      },
      {
        "label": "Krimtatarisch",
        "kind": "alias"
      }
    ],
    "lao": [
      {
        "label": "老挝语",
        "kind": "local"
      },
      {
        "label": "ລາວ",
        "kind": "native"
      },
      {
        "label": "Lao",
        "kind": "english"
      },
      {
        "label": "Laotisch",
        "kind": "alias"
      }
    ],
    "sah": [
      {
        "label": "萨哈语",
        "kind": "local"
      },
      {
        "label": "саха тыла",
        "kind": "native"
      },
      {
        "label": "Yakut",
        "kind": "english"
      },
      {
        "label": "iakoute",
        "kind": "alias"
      },
      {
        "label": "sakha",
        "kind": "alias"
      },
      {
        "label": "Jakutisch",
        "kind": "alias"
      }
    ],
    "cop": [
      {
        "label": "科普特语",
        "kind": "local"
      },
      {
        "label": "Coptic",
        "kind": "english"
      },
      {
        "label": "copte",
        "kind": "alias"
      },
      {
        "label": "copto",
        "kind": "alias"
      },
      {
        "label": "Koptisch",
        "kind": "alias"
      }
    ],
    "pli": [
      {
        "label": "巴利语",
        "kind": "local"
      },
      {
        "label": "Pali",
        "kind": "english"
      }
    ],
    "xho": [
      {
        "label": "科萨语",
        "kind": "local"
      },
      {
        "label": "IsiXhosa",
        "kind": "native"
      },
      {
        "label": "Xhosa",
        "kind": "english"
      }
    ],
    "csb": [
      {
        "label": "卡舒比语",
        "kind": "local"
      },
      {
        "label": "Kashubian",
        "kind": "english"
      },
      {
        "label": "kachoube",
        "kind": "alias"
      },
      {
        "label": "casubio",
        "kind": "alias"
      },
      {
        "label": "Kaschubisch",
        "kind": "alias"
      }
    ],
    "arn": [
      {
        "label": "马普切语",
        "kind": "local"
      },
      {
        "label": "Mapudungun",
        "kind": "english"
      },
      {
        "label": "Mapuche",
        "kind": "alias"
      }
    ],
    "sin": [
      {
        "label": "僧伽罗语",
        "kind": "local"
      },
      {
        "label": "සිංහල",
        "kind": "native"
      },
      {
        "label": "Sinhala",
        "kind": "english"
      },
      {
        "label": "cingalais",
        "kind": "alias"
      },
      {
        "label": "cingalés",
        "kind": "alias"
      },
      {
        "label": "Singhalesisch",
        "kind": "alias"
      },
      {
        "label": "sinhalese",
        "kind": "alias"
      }
    ],
    "ang": [
      {
        "label": "古英语",
        "kind": "local"
      },
      {
        "label": "Old English",
        "kind": "english"
      },
      {
        "label": "ancien anglais",
        "kind": "alias"
      },
      {
        "label": "inglés antiguo",
        "kind": "alias"
      },
      {
        "label": "Altenglisch",
        "kind": "alias"
      }
    ],
    "kas": [
      {
        "label": "克什米尔语",
        "kind": "local"
      },
      {
        "label": "کٲشُر",
        "kind": "native"
      },
      {
        "label": "Kashmiri",
        "kind": "english"
      },
      {
        "label": "cachemiri",
        "kind": "alias"
      },
      {
        "label": "cachemir",
        "kind": "alias"
      },
      {
        "label": "Kaschmiri",
        "kind": "alias"
      }
    ],
    "got": [
      {
        "label": "哥特语",
        "kind": "local"
      },
      {
        "label": "Gothic",
        "kind": "english"
      },
      {
        "label": "gotique",
        "kind": "alias"
      },
      {
        "label": "gótico",
        "kind": "alias"
      },
      {
        "label": "Gotisch",
        "kind": "alias"
      }
    ],
    "egy": [
      {
        "label": "古埃及语",
        "kind": "local"
      },
      {
        "label": "Egyptian",
        "kind": "english"
      },
      {
        "label": "Ancient Egyptian",
        "kind": "alias"
      },
      {
        "label": "égyptien ancien",
        "kind": "alias"
      },
      {
        "label": "egipcio antiguo",
        "kind": "alias"
      },
      {
        "label": "Ägyptisch",
        "kind": "alias"
      }
    ],
    "rom": [
      {
        "label": "吉普赛语",
        "kind": "local"
      },
      {
        "label": "Romani",
        "kind": "english"
      },
      {
        "label": "Romany",
        "kind": "alias"
      },
      {
        "label": "romaní",
        "kind": "alias"
      }
    ],
    "snd": [
      {
        "label": "信德语",
        "kind": "local"
      },
      {
        "label": "سنڌي",
        "kind": "native"
      },
      {
        "label": "Sindhi",
        "kind": "english"
      },
      {
        "label": "sindi",
        "kind": "alias"
      }
    ],
    "cos": [
      {
        "label": "科西嘉语",
        "kind": "local"
      },
      {
        "label": "Corsican",
        "kind": "english"
      },
      {
        "label": "corse",
        "kind": "alias"
      },
      {
        "label": "corso",
        "kind": "alias"
      },
      {
        "label": "Korsisch",
        "kind": "alias"
      }
    ],
    "ceb": [
      {
        "label": "宿务语",
        "kind": "local"
      },
      {
        "label": "Cebuano",
        "kind": "native"
      }
    ],
    "nds": [
      {
        "label": "低地德语",
        "kind": "local"
      },
      {
        "label": "Neddersass’sch",
        "kind": "native"
      },
      {
        "label": "Low German",
        "kind": "english"
      },
      {
        "label": "bas-allemand",
        "kind": "alias"
      },
      {
        "label": "bajo alemán",
        "kind": "alias"
      },
      {
        "label": "Niederdeutsch",
        "kind": "alias"
      }
    ],
    "aym": [
      {
        "label": "艾马拉语",
        "kind": "local"
      },
      {
        "label": "Aymara",
        "kind": "english"
      },
      {
        "label": "aimara",
        "kind": "alias"
      }
    ],
    "scn": [
      {
        "label": "西西里语",
        "kind": "local"
      },
      {
        "label": "Sicilian",
        "kind": "english"
      },
      {
        "label": "sicilien",
        "kind": "alias"
      },
      {
        "label": "siciliano",
        "kind": "alias"
      },
      {
        "label": "Sizilianisch",
        "kind": "alias"
      }
    ],
    "ast": [
      {
        "label": "阿斯图里亚斯语",
        "kind": "local"
      },
      {
        "label": "asturianu",
        "kind": "native"
      },
      {
        "label": "Asturian",
        "kind": "english"
      },
      {
        "label": "asturien",
        "kind": "alias"
      },
      {
        "label": "asturiano",
        "kind": "alias"
      },
      {
        "label": "Asturisch",
        "kind": "alias"
      }
    ],
    "dzo": [
      {
        "label": "宗卡语",
        "kind": "local"
      },
      {
        "label": "རྫོང་ཁ",
        "kind": "native"
      },
      {
        "label": "Dzongkha",
        "kind": "english"
      }
    ],
    "tok": [
      {
        "label": "道本语",
        "kind": "local"
      },
      {
        "label": "toki pona",
        "kind": "native"
      }
    ],
    "kal": [
      {
        "label": "格陵兰语",
        "kind": "local"
      },
      {
        "label": "kalaallisut",
        "kind": "native"
      },
      {
        "label": "Greenlandic",
        "kind": "english"
      },
      {
        "label": "groenlandais",
        "kind": "alias"
      },
      {
        "label": "groenlandés",
        "kind": "alias"
      },
      {
        "label": "Grönländisch",
        "kind": "alias"
      }
    ],
    "ava": [
      {
        "label": "阿瓦尔语",
        "kind": "local"
      },
      {
        "label": "Avar",
        "kind": "english"
      },
      {
        "label": "Avaric",
        "kind": "alias"
      },
      {
        "label": "Awarisch",
        "kind": "alias"
      }
    ],
    "sun": [
      {
        "label": "巽他语",
        "kind": "local"
      },
      {
        "label": "Basa Sunda",
        "kind": "native"
      },
      {
        "label": "Sundanese",
        "kind": "english"
      },
      {
        "label": "soundanais",
        "kind": "alias"
      },
      {
        "label": "sundanés",
        "kind": "alias"
      },
      {
        "label": "Sundanesisch",
        "kind": "alias"
      }
    ],
    "wln": [
      {
        "label": "瓦隆语",
        "kind": "local"
      },
      {
        "label": "Walloon",
        "kind": "english"
      },
      {
        "label": "wallon",
        "kind": "alias"
      },
      {
        "label": "valón",
        "kind": "alias"
      },
      {
        "label": "Wallonisch",
        "kind": "alias"
      }
    ],
    "cnr": [
      {
        "label": "黑山语",
        "kind": "local"
      },
      {
        "label": "crnogorski",
        "kind": "native"
      },
      {
        "label": "Montenegrin",
        "kind": "english"
      },
      {
        "label": "monténégrin",
        "kind": "alias"
      },
      {
        "label": "montenegrino",
        "kind": "alias"
      },
      {
        "label": "Montenegrinisch",
        "kind": "alias"
      }
    ],
    "prs": [
      {
        "label": "达里语",
        "kind": "local"
      },
      {
        "label": "دری",
        "kind": "native"
      },
      {
        "label": "Dari",
        "kind": "english"
      },
      {
        "label": "darí",
        "kind": "alias"
      }
    ],
    "nap": [
      {
        "label": "那不勒斯语",
        "kind": "local"
      },
      {
        "label": "Neapolitan",
        "kind": "english"
      },
      {
        "label": "napolitain",
        "kind": "alias"
      },
      {
        "label": "napolitano",
        "kind": "alias"
      },
      {
        "label": "Neapolitanisch",
        "kind": "alias"
      }
    ],
    "tir": [
      {
        "label": "提格利尼亚语",
        "kind": "local"
      },
      {
        "label": "ትግርኛ",
        "kind": "native"
      },
      {
        "label": "Tigrinya",
        "kind": "english"
      },
      {
        "label": "tigrigna",
        "kind": "alias"
      },
      {
        "label": "tigriña",
        "kind": "alias"
      }
    ],
    "ain": [
      {
        "label": "阿伊努语",
        "kind": "local"
      },
      {
        "label": "Ainu",
        "kind": "english"
      },
      {
        "label": "aïnou",
        "kind": "alias"
      }
    ],
    "udm": [
      {
        "label": "乌德穆尔特语",
        "kind": "local"
      },
      {
        "label": "Udmurt",
        "kind": "english"
      },
      {
        "label": "oudmourte",
        "kind": "alias"
      },
      {
        "label": "Udmurtisch",
        "kind": "alias"
      }
    ],
    "akk": [
      {
        "label": "阿卡德语",
        "kind": "local"
      },
      {
        "label": "Akkadian",
        "kind": "english"
      },
      {
        "label": "akkadien",
        "kind": "alias"
      },
      {
        "label": "acadio",
        "kind": "alias"
      },
      {
        "label": "Akkadisch",
        "kind": "alias"
      }
    ],
    "gag": [
      {
        "label": "加告兹语",
        "kind": "local"
      },
      {
        "label": "Gagauz",
        "kind": "english"
      },
      {
        "label": "gagaouze",
        "kind": "alias"
      },
      {
        "label": "gagauzo",
        "kind": "alias"
      },
      {
        "label": "Gagausisch",
        "kind": "alias"
      }
    ],
    "ibo": [
      {
        "label": "伊博语",
        "kind": "local"
      },
      {
        "label": "Igbo",
        "kind": "native"
      }
    ],
    "krl": [
      {
        "label": "卡累利阿语",
        "kind": "local"
      },
      {
        "label": "Karelian",
        "kind": "english"
      },
      {
        "label": "carélien",
        "kind": "alias"
      },
      {
        "label": "carelio",
        "kind": "alias"
      },
      {
        "label": "Karelisch",
        "kind": "alias"
      }
    ],
    "ave": [
      {
        "label": "阿维斯塔语",
        "kind": "local"
      },
      {
        "label": "Avestan",
        "kind": "english"
      },
      {
        "label": "avestique",
        "kind": "alias"
      },
      {
        "label": "avéstico",
        "kind": "alias"
      },
      {
        "label": "Avestisch",
        "kind": "alias"
      }
    ],
    "div": [
      {
        "label": "迪维希语",
        "kind": "local"
      },
      {
        "label": "Dhivehi",
        "kind": "english"
      },
      {
        "label": "maldivien",
        "kind": "alias"
      },
      {
        "label": "divehi",
        "kind": "alias"
      },
      {
        "label": "maldivian",
        "kind": "alias"
      }
    ],
    "isv": [
      {
        "label": "Interslavic",
        "kind": "english"
      }
    ],
    "tyv": [
      {
        "label": "图瓦语",
        "kind": "local"
      },
      {
        "label": "Tuvan",
        "kind": "english"
      },
      {
        "label": "Tuvinian",
        "kind": "alias"
      },
      {
        "label": "touvain",
        "kind": "alias"
      },
      {
        "label": "tuviniano",
        "kind": "alias"
      },
      {
        "label": "Tuwinisch",
        "kind": "alias"
      }
    ],
    "lmo": [
      {
        "label": "伦巴第语",
        "kind": "local"
      },
      {
        "label": "Lombard",
        "kind": "native"
      },
      {
        "label": "lombardo",
        "kind": "alias"
      },
      {
        "label": "Lombardisch",
        "kind": "alias"
      }
    ],
    "ota": [
      {
        "label": "奥斯曼土耳其语",
        "kind": "local"
      },
      {
        "label": "Ottoman Turkish",
        "kind": "english"
      },
      {
        "label": "turc ottoman",
        "kind": "alias"
      },
      {
        "label": "turco otomano",
        "kind": "alias"
      },
      {
        "label": "Osmanisch",
        "kind": "alias"
      }
    ],
    "myv": [
      {
        "label": "厄尔兹亚语",
        "kind": "local"
      },
      {
        "label": "Erzya",
        "kind": "english"
      },
      {
        "label": "Ersja-Mordwinisch",
        "kind": "alias"
      }
    ],
    "bal": [
      {
        "label": "俾路支语",
        "kind": "local"
      },
      {
        "label": "Balochi",
        "kind": "english"
      },
      {
        "label": "Baluchi",
        "kind": "alias"
      },
      {
        "label": "baloutchi",
        "kind": "alias"
      },
      {
        "label": "Belutschisch",
        "kind": "alias"
      }
    ],
    "yor": [
      {
        "label": "约鲁巴语",
        "kind": "local"
      },
      {
        "label": "Èdè Yorùbá",
        "kind": "native"
      },
      {
        "label": "Yoruba",
        "kind": "english"
      }
    ],
    "pms": [
      {
        "label": "Piedmontese",
        "kind": "english"
      },
      {
        "label": "piémontais",
        "kind": "alias"
      },
      {
        "label": "Piemontesisch",
        "kind": "alias"
      }
    ],
    "ady": [
      {
        "label": "阿迪格语",
        "kind": "local"
      },
      {
        "label": "Adyghe",
        "kind": "english"
      },
      {
        "label": "adyguéen",
        "kind": "alias"
      },
      {
        "label": "adigué",
        "kind": "alias"
      },
      {
        "label": "Adygeisch",
        "kind": "alias"
      }
    ],
    "wol": [
      {
        "label": "沃洛夫语",
        "kind": "local"
      },
      {
        "label": "Wolof",
        "kind": "native"
      },
      {
        "label": "wólof",
        "kind": "alias"
      }
    ],
    "fur": [
      {
        "label": "弗留利语",
        "kind": "local"
      },
      {
        "label": "furlan",
        "kind": "native"
      },
      {
        "label": "Friulian",
        "kind": "english"
      },
      {
        "label": "frioulan",
        "kind": "alias"
      },
      {
        "label": "friulano",
        "kind": "alias"
      },
      {
        "label": "Friaulisch",
        "kind": "alias"
      }
    ],
    "smo": [
      {
        "label": "萨摩亚语",
        "kind": "local"
      },
      {
        "label": "Samoan",
        "kind": "english"
      },
      {
        "label": "samoano",
        "kind": "alias"
      },
      {
        "label": "Samoanisch",
        "kind": "alias"
      }
    ],
    "rue": [
      {
        "label": "Rusyn",
        "kind": "english"
      },
      {
        "label": "ruthène",
        "kind": "alias"
      },
      {
        "label": "Russinisch",
        "kind": "alias"
      }
    ],
    "sot": [
      {
        "label": "南索托语",
        "kind": "local"
      },
      {
        "label": "Sesotho",
        "kind": "native"
      },
      {
        "label": "Southern Sotho",
        "kind": "alias"
      },
      {
        "label": "sotho du Sud",
        "kind": "alias"
      },
      {
        "label": "sotho meridional",
        "kind": "alias"
      },
      {
        "label": "Süd-Sotho",
        "kind": "alias"
      }
    ],
    "hat": [
      {
        "label": "海地克里奥尔语",
        "kind": "local"
      },
      {
        "label": "Haitian Creole",
        "kind": "english"
      },
      {
        "label": "créole haïtien",
        "kind": "alias"
      },
      {
        "label": "criollo haitiano",
        "kind": "alias"
      },
      {
        "label": "Haiti-Kreolisch",
        "kind": "alias"
      }
    ],
    "syc": [
      {
        "label": "古典叙利亚语",
        "kind": "local"
      },
      {
        "label": "Syriac",
        "kind": "english"
      },
      {
        "label": "Classical Syriac",
        "kind": "alias"
      },
      {
        "label": "syriaque classique",
        "kind": "alias"
      },
      {
        "label": "siríaco clásico",
        "kind": "alias"
      },
      {
        "label": "Altsyrisch",
        "kind": "alias"
      }
    ],
    "kom": [
      {
        "label": "科米语",
        "kind": "local"
      },
      {
        "label": "Komi",
        "kind": "english"
      }
    ],
    "kin": [
      {
        "label": "卢旺达语",
        "kind": "local"
      },
      {
        "label": "Ikinyarwanda",
        "kind": "native"
      },
      {
        "label": "Kinyarwanda",
        "kind": "english"
      }
    ],
    "hif": [
      {
        "label": "Fiji Hindi",
        "kind": "english"
      },
      {
        "label": "hindi fidjien",
        "kind": "alias"
      },
      {
        "label": "Fidschi-Hindi",
        "kind": "alias"
      }
    ],
    "tpi": [
      {
        "label": "托克皮辛语",
        "kind": "local"
      },
      {
        "label": "Tok Pisin",
        "kind": "english"
      },
      {
        "label": "Neumelanesisch",
        "kind": "alias"
      }
    ],
    "nav": [
      {
        "label": "纳瓦霍语",
        "kind": "local"
      },
      {
        "label": "Navajo",
        "kind": "english"
      }
    ],
    "ton": [
      {
        "label": "汤加语",
        "kind": "local"
      },
      {
        "label": "lea fakatonga",
        "kind": "native"
      },
      {
        "label": "Tongan",
        "kind": "english"
      },
      {
        "label": "tongien",
        "kind": "alias"
      },
      {
        "label": "tongano",
        "kind": "alias"
      },
      {
        "label": "Tongaisch",
        "kind": "alias"
      }
    ],
    "nob": [
      {
        "label": "书面挪威语",
        "kind": "local"
      },
      {
        "label": "norsk bokmål",
        "kind": "native"
      },
      {
        "label": "Bokmål",
        "kind": "english"
      },
      {
        "label": "Norwegian Bokmål",
        "kind": "alias"
      },
      {
        "label": "norvégien bokmål",
        "kind": "alias"
      },
      {
        "label": "noruego bokmal",
        "kind": "alias"
      },
      {
        "label": "Norwegisch (Bokmål)",
        "kind": "alias"
      }
    ],
    "nno": [
      {
        "label": "挪威尼诺斯克语",
        "kind": "local"
      },
      {
        "label": "norsk nynorsk",
        "kind": "native"
      },
      {
        "label": "Nynorsk",
        "kind": "english"
      },
      {
        "label": "Norwegian Nynorsk",
        "kind": "alias"
      },
      {
        "label": "norvégien nynorsk",
        "kind": "alias"
      },
      {
        "label": "noruego nynorsk",
        "kind": "alias"
      },
      {
        "label": "Norwegisch (Nynorsk)",
        "kind": "alias"
      }
    ],
    "kok": [
      {
        "label": "孔卡尼语",
        "kind": "local"
      },
      {
        "label": "कोंकणी",
        "kind": "native"
      },
      {
        "label": "Konkani",
        "kind": "english"
      },
      {
        "label": "konkaní",
        "kind": "alias"
      }
    ],
    "mai": [
      {
        "label": "迈蒂利语",
        "kind": "local"
      },
      {
        "label": "मैथिली",
        "kind": "native"
      },
      {
        "label": "Maithili",
        "kind": "english"
      },
      {
        "label": "maïthili",
        "kind": "alias"
      }
    ],
    "mnc": [
      {
        "label": "满语",
        "kind": "local"
      },
      {
        "label": "Manchu",
        "kind": "english"
      },
      {
        "label": "mandchou",
        "kind": "alias"
      },
      {
        "label": "manchú",
        "kind": "alias"
      },
      {
        "label": "Mandschurisch",
        "kind": "alias"
      },
      {
        "label": "滿語",
        "kind": "alias"
      }
    ],
    "liv": [
      {
        "label": "Livonian",
        "kind": "english"
      },
      {
        "label": "livonien",
        "kind": "alias"
      },
      {
        "label": "Livisch",
        "kind": "alias"
      }
    ],
    "nov": [
      {
        "label": "Novial",
        "kind": "english"
      }
    ],
    "tsn": [
      {
        "label": "茨瓦纳语",
        "kind": "local"
      },
      {
        "label": "Setswana",
        "kind": "native"
      },
      {
        "label": "Tswana",
        "kind": "english"
      },
      {
        "label": "setsuana",
        "kind": "alias"
      }
    ],
    "vec": [
      {
        "label": "威尼斯语",
        "kind": "local"
      },
      {
        "label": "veneto",
        "kind": "native"
      },
      {
        "label": "Venetian",
        "kind": "english"
      },
      {
        "label": "vénitien",
        "kind": "alias"
      },
      {
        "label": "veneciano",
        "kind": "alias"
      },
      {
        "label": "Venetisch",
        "kind": "alias"
      }
    ],
    "sux": [
      {
        "label": "苏美尔语",
        "kind": "local"
      },
      {
        "label": "Sumerian",
        "kind": "english"
      },
      {
        "label": "sumérien",
        "kind": "alias"
      },
      {
        "label": "sumerio",
        "kind": "alias"
      },
      {
        "label": "Sumerisch",
        "kind": "alias"
      }
    ],
    "hsb": [
      {
        "label": "上索布语",
        "kind": "local"
      },
      {
        "label": "hornjoserbšćina",
        "kind": "native"
      },
      {
        "label": "Upper Sorbian",
        "kind": "english"
      },
      {
        "label": "haut-sorabe",
        "kind": "alias"
      },
      {
        "label": "alto sorbio",
        "kind": "alias"
      },
      {
        "label": "Obersorbisch",
        "kind": "alias"
      }
    ],
    "lim": [
      {
        "label": "林堡语",
        "kind": "local"
      },
      {
        "label": "Limburgish language",
        "kind": "english"
      },
      {
        "label": "Limburgish",
        "kind": "alias"
      },
      {
        "label": "limbourgeois",
        "kind": "alias"
      },
      {
        "label": "limburgués",
        "kind": "alias"
      },
      {
        "label": "Limburgisch",
        "kind": "alias"
      }
    ],
    "tlh": [
      {
        "label": "克林贡语",
        "kind": "local"
      },
      {
        "label": "Klingon",
        "kind": "english"
      },
      {
        "label": "Klingonisch",
        "kind": "alias"
      }
    ],
    "new": [
      {
        "label": "尼瓦尔语",
        "kind": "local"
      },
      {
        "label": "Newar",
        "kind": "english"
      },
      {
        "label": "Newari",
        "kind": "alias"
      },
      {
        "label": "nevarí",
        "kind": "alias"
      }
    ],
    "bua": [
      {
        "label": "布里亚特语",
        "kind": "local"
      },
      {
        "label": "Buryat",
        "kind": "english"
      },
      {
        "label": "Buriat",
        "kind": "alias"
      },
      {
        "label": "bouriate",
        "kind": "alias"
      },
      {
        "label": "buriato",
        "kind": "alias"
      },
      {
        "label": "Burjatisch",
        "kind": "alias"
      }
    ],
    "lld": [
      {
        "label": "Ladin",
        "kind": "english"
      }
    ],
    "sme": [
      {
        "label": "北方萨米语",
        "kind": "local"
      },
      {
        "label": "davvisámegiella",
        "kind": "native"
      },
      {
        "label": "Northern Sami",
        "kind": "english"
      },
      {
        "label": "same du Nord",
        "kind": "alias"
      },
      {
        "label": "sami septentrional",
        "kind": "alias"
      },
      {
        "label": "Nordsamisch",
        "kind": "alias"
      }
    ],
    "ssw": [
      {
        "label": "斯瓦蒂语",
        "kind": "local"
      },
      {
        "label": "Swazi",
        "kind": "english"
      },
      {
        "label": "Swati",
        "kind": "alias"
      },
      {
        "label": "suazi",
        "kind": "alias"
      }
    ],
    "aar": [
      {
        "label": "阿法尔语",
        "kind": "local"
      },
      {
        "label": "Afar",
        "kind": "english"
      }
    ],
    "lez": [
      {
        "label": "列兹金语",
        "kind": "local"
      },
      {
        "label": "Lezgian",
        "kind": "english"
      },
      {
        "label": "Lezghian",
        "kind": "alias"
      },
      {
        "label": "lezghien",
        "kind": "alias"
      },
      {
        "label": "lezgiano",
        "kind": "alias"
      },
      {
        "label": "Lesgisch",
        "kind": "alias"
      }
    ],
    "bho": [
      {
        "label": "博杰普尔语",
        "kind": "local"
      },
      {
        "label": "भोजपुरी",
        "kind": "native"
      },
      {
        "label": "Bhojpuri",
        "kind": "english"
      },
      {
        "label": "bhodjpouri",
        "kind": "alias"
      },
      {
        "label": "bhoyapurí",
        "kind": "alias"
      },
      {
        "label": "Bhodschpuri",
        "kind": "alias"
      }
    ],
    "kaa": [
      {
        "label": "卡拉卡尔帕克语",
        "kind": "local"
      },
      {
        "label": "Karakalpak",
        "kind": "english"
      },
      {
        "label": "Kara-Kalpak",
        "kind": "alias"
      },
      {
        "label": "karakalpako",
        "kind": "alias"
      },
      {
        "label": "Karakalpakisch",
        "kind": "alias"
      }
    ],
    "dsb": [
      {
        "label": "下索布语",
        "kind": "local"
      },
      {
        "label": "dolnoserbšćina",
        "kind": "native"
      },
      {
        "label": "Lower Sorbian",
        "kind": "english"
      },
      {
        "label": "bas-sorabe",
        "kind": "alias"
      },
      {
        "label": "bajo sorbio",
        "kind": "alias"
      },
      {
        "label": "Niedersorbisch",
        "kind": "alias"
      }
    ],
    "mni": [
      {
        "label": "曼尼普尔语",
        "kind": "local"
      },
      {
        "label": "মৈতৈলোন্",
        "kind": "native"
      },
      {
        "label": "Meitei",
        "kind": "english"
      },
      {
        "label": "Manipuri",
        "kind": "alias"
      },
      {
        "label": "manipurí",
        "kind": "alias"
      },
      {
        "label": "Meithei",
        "kind": "alias"
      }
    ],
    "rup": [
      {
        "label": "阿罗马尼亚语",
        "kind": "local"
      },
      {
        "label": "Aromanian",
        "kind": "english"
      },
      {
        "label": "aroumain",
        "kind": "alias"
      },
      {
        "label": "arrumano",
        "kind": "alias"
      },
      {
        "label": "Aromunisch",
        "kind": "alias"
      }
    ],
    "iku": [
      {
        "label": "因纽特语",
        "kind": "local"
      },
      {
        "label": "Inuktitut",
        "kind": "english"
      }
    ],
    "nau": [
      {
        "label": "瑙鲁语",
        "kind": "local"
      },
      {
        "label": "Nauruan",
        "kind": "english"
      },
      {
        "label": "Nauru",
        "kind": "alias"
      },
      {
        "label": "nauruano",
        "kind": "alias"
      },
      {
        "label": "Nauruisch",
        "kind": "alias"
      }
    ],
    "pap": [
      {
        "label": "帕皮阿门托语",
        "kind": "local"
      },
      {
        "label": "Papiamento",
        "kind": "english"
      }
    ],
    "bar": [
      {
        "label": "Bavarian",
        "kind": "english"
      },
      {
        "label": "bavarois",
        "kind": "alias"
      },
      {
        "label": "Bairisch",
        "kind": "alias"
      }
    ],
    "run": [
      {
        "label": "隆迪语",
        "kind": "local"
      },
      {
        "label": "Ikirundi",
        "kind": "native"
      },
      {
        "label": "Kirundi",
        "kind": "english"
      },
      {
        "label": "Rundi",
        "kind": "alias"
      },
      {
        "label": "roundi",
        "kind": "alias"
      }
    ],
    "krc": [
      {
        "label": "卡拉恰伊巴尔卡尔语",
        "kind": "local"
      },
      {
        "label": "Karachay-Balkar",
        "kind": "english"
      },
      {
        "label": "karatchaï balkar",
        "kind": "alias"
      },
      {
        "label": "Karatschaiisch-Balkarisch",
        "kind": "alias"
      }
    ],
    "tet": [
      {
        "label": "德顿语",
        "kind": "local"
      },
      {
        "label": "Tetum",
        "kind": "english"
      },
      {
        "label": "tétoum",
        "kind": "alias"
      },
      {
        "label": "tetún",
        "kind": "alias"
      }
    ],
    "vep": [
      {
        "label": "维普森语",
        "kind": "local"
      },
      {
        "label": "Veps",
        "kind": "english"
      },
      {
        "label": "vepse",
        "kind": "alias"
      },
      {
        "label": "Wepsisch",
        "kind": "alias"
      }
    ],
    "non": [
      {
        "label": "古诺尔斯语",
        "kind": "local"
      },
      {
        "label": "Old Norse",
        "kind": "english"
      },
      {
        "label": "vieux norrois",
        "kind": "alias"
      },
      {
        "label": "nórdico antiguo",
        "kind": "alias"
      },
      {
        "label": "Altnordisch",
        "kind": "alias"
      }
    ],
    "nya": [
      {
        "label": "齐切瓦语",
        "kind": "local"
      },
      {
        "label": "Chewa",
        "kind": "english"
      },
      {
        "label": "Nyanja",
        "kind": "alias"
      }
    ],
    "chr": [
      {
        "label": "切罗基语",
        "kind": "local"
      },
      {
        "label": "ᏣᎳᎩ",
        "kind": "native"
      },
      {
        "label": "Cherokee",
        "kind": "english"
      },
      {
        "label": "cheroqui",
        "kind": "alias"
      }
    ],
    "wuu": [
      {
        "label": "吴语",
        "kind": "local"
      },
      {
        "label": "Wu Chinese",
        "kind": "english"
      },
      {
        "label": "chinois wu",
        "kind": "alias"
      },
      {
        "label": "chino wu",
        "kind": "alias"
      },
      {
        "label": "Wu-Chinesisch",
        "kind": "alias"
      },
      {
        "label": "shanghainese",
        "kind": "alias"
      },
      {
        "label": "上海话",
        "kind": "alias"
      },
      {
        "label": "上海话方言",
        "kind": "alias"
      }
    ],
    "bam": [
      {
        "label": "班巴拉语",
        "kind": "local"
      },
      {
        "label": "bamanakan",
        "kind": "native"
      },
      {
        "label": "Bambara",
        "kind": "english"
      }
    ],
    "ful": [
      {
        "label": "富拉语",
        "kind": "local"
      },
      {
        "label": "Pulaar",
        "kind": "native"
      },
      {
        "label": "Fula",
        "kind": "english"
      },
      {
        "label": "peul",
        "kind": "alias"
      },
      {
        "label": "Ful",
        "kind": "alias"
      }
    ],
    "inh": [
      {
        "label": "印古什语",
        "kind": "local"
      },
      {
        "label": "Ingush",
        "kind": "english"
      },
      {
        "label": "ingouche",
        "kind": "alias"
      },
      {
        "label": "Inguschisch",
        "kind": "alias"
      }
    ],
    "orm": [
      {
        "label": "奥罗莫语",
        "kind": "local"
      },
      {
        "label": "Oromoo",
        "kind": "native"
      },
      {
        "label": "Oromo",
        "kind": "english"
      }
    ],
    "ban": [
      {
        "label": "巴厘语",
        "kind": "local"
      },
      {
        "label": "Balinese",
        "kind": "english"
      },
      {
        "label": "balinais",
        "kind": "alias"
      },
      {
        "label": "balinés",
        "kind": "alias"
      },
      {
        "label": "Balinesisch",
        "kind": "alias"
      }
    ],
    "fij": [
      {
        "label": "斐济语",
        "kind": "local"
      },
      {
        "label": "Fijian",
        "kind": "english"
      },
      {
        "label": "fidjien",
        "kind": "alias"
      },
      {
        "label": "fiyiano",
        "kind": "alias"
      },
      {
        "label": "Fidschi",
        "kind": "alias"
      }
    ],
    "chm": [
      {
        "label": "马里语",
        "kind": "local"
      },
      {
        "label": "Mari",
        "kind": "english"
      },
      {
        "label": "marí",
        "kind": "alias"
      }
    ],
    "mdf": [
      {
        "label": "莫克沙语",
        "kind": "local"
      },
      {
        "label": "Moksha",
        "kind": "english"
      },
      {
        "label": "mokcha",
        "kind": "alias"
      },
      {
        "label": "Mokschanisch",
        "kind": "alias"
      }
    ],
    "sna": [
      {
        "label": "绍纳语",
        "kind": "local"
      },
      {
        "label": "chiShona",
        "kind": "native"
      },
      {
        "label": "Shona",
        "kind": "english"
      }
    ],
    "lij": [
      {
        "label": "利古里亚语",
        "kind": "local"
      },
      {
        "label": "ligure",
        "kind": "native"
      },
      {
        "label": "Ligurian",
        "kind": "english"
      },
      {
        "label": "ligur",
        "kind": "alias"
      },
      {
        "label": "Ligurisch",
        "kind": "alias"
      }
    ],
    "min": [
      {
        "label": "米南佳保语",
        "kind": "local"
      },
      {
        "label": "Minangkabau",
        "kind": "english"
      }
    ],
    "sat": [
      {
        "label": "桑塔利语",
        "kind": "local"
      },
      {
        "label": "ᱥᱟᱱᱛᱟᱲᱤ",
        "kind": "native"
      },
      {
        "label": "Santali",
        "kind": "english"
      }
    ],
    "abq": [
      {
        "label": "Abaza",
        "kind": "english"
      }
    ],
    "ewe": [
      {
        "label": "埃维语",
        "kind": "local"
      },
      {
        "label": "eʋegbe",
        "kind": "native"
      },
      {
        "label": "Ewe",
        "kind": "english"
      },
      {
        "label": "éwé",
        "kind": "alias"
      },
      {
        "label": "ewé",
        "kind": "alias"
      }
    ],
    "bis": [
      {
        "label": "比斯拉马语",
        "kind": "local"
      },
      {
        "label": "Bislama",
        "kind": "english"
      },
      {
        "label": "bichelamar",
        "kind": "alias"
      }
    ],
    "kbd": [
      {
        "label": "卡巴尔德语",
        "kind": "local"
      },
      {
        "label": "Kabardian",
        "kind": "english"
      },
      {
        "label": "kabarde",
        "kind": "alias"
      },
      {
        "label": "kabardiano",
        "kind": "alias"
      },
      {
        "label": "Kabardinisch",
        "kind": "alias"
      }
    ],
    "nrf": [
      {
        "label": "Norman",
        "kind": "english"
      }
    ],
    "fry": [
      {
        "label": "西弗里西亚语",
        "kind": "local"
      },
      {
        "label": "Frysk",
        "kind": "native"
      },
      {
        "label": "West Frisian",
        "kind": "english"
      },
      {
        "label": "Western Frisian",
        "kind": "alias"
      },
      {
        "label": "frison occidental",
        "kind": "alias"
      },
      {
        "label": "frisón occidental",
        "kind": "alias"
      },
      {
        "label": "Westfriesisch",
        "kind": "alias"
      }
    ],
    "arz": [
      {
        "label": "Egyptian Arabic",
        "kind": "english"
      },
      {
        "label": "arabe égyptien",
        "kind": "alias"
      },
      {
        "label": "Ägyptisches Arabisch",
        "kind": "alias"
      }
    ],
    "vro": [
      {
        "label": "Võro",
        "kind": "english"
      }
    ],
    "ilo": [
      {
        "label": "伊洛卡诺语",
        "kind": "local"
      },
      {
        "label": "Ilocano",
        "kind": "english"
      },
      {
        "label": "Iloko",
        "kind": "alias"
      },
      {
        "label": "Ilokano",
        "kind": "alias"
      }
    ],
    "lin": [
      {
        "label": "林加拉语",
        "kind": "local"
      },
      {
        "label": "lingála",
        "kind": "native"
      },
      {
        "label": "Lingala",
        "kind": "english"
      }
    ],
    "jbo": [
      {
        "label": "逻辑语",
        "kind": "local"
      },
      {
        "label": "Lojban",
        "kind": "english"
      }
    ],
    "mwl": [
      {
        "label": "米兰德斯语",
        "kind": "local"
      },
      {
        "label": "Mirandese",
        "kind": "english"
      },
      {
        "label": "mirandais",
        "kind": "alias"
      },
      {
        "label": "mirandés",
        "kind": "alias"
      },
      {
        "label": "Mirandesisch",
        "kind": "alias"
      }
    ],
    "frp": [
      {
        "label": "Arpitan language",
        "kind": "english"
      },
      {
        "label": "Arpitan",
        "kind": "alias"
      },
      {
        "label": "francoprovençal",
        "kind": "alias"
      },
      {
        "label": "Frankoprovenzalisch",
        "kind": "alias"
      }
    ],
    "tso": [
      {
        "label": "聪加语",
        "kind": "local"
      },
      {
        "label": "Tsonga",
        "kind": "english"
      }
    ],
    "xal": [
      {
        "label": "卡尔梅克语",
        "kind": "local"
      },
      {
        "label": "Kalmyk",
        "kind": "english"
      },
      {
        "label": "kalmouk",
        "kind": "alias"
      },
      {
        "label": "Kalmückisch",
        "kind": "alias"
      }
    ],
    "ett": [
      {
        "label": "Etruscan",
        "kind": "english"
      }
    ],
    "tah": [
      {
        "label": "塔希提语",
        "kind": "local"
      },
      {
        "label": "Tahitian",
        "kind": "english"
      },
      {
        "label": "tahitien",
        "kind": "alias"
      },
      {
        "label": "tahitiano",
        "kind": "alias"
      },
      {
        "label": "Tahitisch",
        "kind": "alias"
      }
    ],
    "ven": [
      {
        "label": "文达语",
        "kind": "local"
      },
      {
        "label": "Venda",
        "kind": "english"
      }
    ],
    "tcy": [
      {
        "label": "Tulu",
        "kind": "english"
      },
      {
        "label": "toulou",
        "kind": "alias"
      }
    ],
    "cha": [
      {
        "label": "查莫罗语",
        "kind": "local"
      },
      {
        "label": "Chamorro",
        "kind": "english"
      }
    ],
    "hak": [
      {
        "label": "客家话",
        "kind": "local"
      },
      {
        "label": "客家話",
        "kind": "native"
      },
      {
        "label": "Hakka Chinese",
        "kind": "english"
      },
      {
        "label": "hakka",
        "kind": "alias"
      },
      {
        "label": "chino hakka",
        "kind": "alias"
      },
      {
        "label": "客家语",
        "kind": "alias"
      }
    ],
    "kjh": [
      {
        "label": "Khakas",
        "kind": "english"
      }
    ],
    "ace": [
      {
        "label": "亚齐语",
        "kind": "local"
      },
      {
        "label": "Acehnese",
        "kind": "english"
      },
      {
        "label": "aceh",
        "kind": "alias"
      },
      {
        "label": "achenés",
        "kind": "alias"
      }
    ],
    "gsw": [
      {
        "label": "瑞士德语",
        "kind": "local"
      },
      {
        "label": "Schwiizertüütsch",
        "kind": "native"
      },
      {
        "label": "Swiss German",
        "kind": "english"
      },
      {
        "label": "suisse allemand",
        "kind": "alias"
      },
      {
        "label": "alemán suizo",
        "kind": "alias"
      },
      {
        "label": "Schweizerdeutsch",
        "kind": "alias"
      },
      {
        "label": "alemannic",
        "kind": "alias"
      },
      {
        "label": "alsatian",
        "kind": "alias"
      }
    ],
    "war": [
      {
        "label": "瓦瑞语",
        "kind": "local"
      },
      {
        "label": "Waray",
        "kind": "english"
      }
    ],
    "hit": [
      {
        "label": "赫梯语",
        "kind": "local"
      },
      {
        "label": "Hittite",
        "kind": "english"
      },
      {
        "label": "hitita",
        "kind": "alias"
      },
      {
        "label": "Hethitisch",
        "kind": "alias"
      }
    ],
    "mns": [
      {
        "label": "Mansi",
        "kind": "english"
      }
    ],
    "pcd": [
      {
        "label": "Picard",
        "kind": "english"
      },
      {
        "label": "Picardisch",
        "kind": "alias"
      }
    ],
    "gez": [
      {
        "label": "吉兹语",
        "kind": "local"
      },
      {
        "label": "Ge'ez",
        "kind": "english"
      },
      {
        "label": "Geez",
        "kind": "alias"
      },
      {
        "label": "guèze",
        "kind": "alias"
      }
    ],
    "brx": [
      {
        "label": "博多语",
        "kind": "local"
      },
      {
        "label": "बर’",
        "kind": "native"
      },
      {
        "label": "Bodo",
        "kind": "english"
      }
    ],
    "phn": [
      {
        "label": "腓尼基语",
        "kind": "local"
      },
      {
        "label": "Phoenician",
        "kind": "english"
      },
      {
        "label": "phénicien",
        "kind": "alias"
      },
      {
        "label": "fenicio",
        "kind": "alias"
      },
      {
        "label": "Phönizisch",
        "kind": "alias"
      }
    ],
    "mah": [
      {
        "label": "马绍尔语",
        "kind": "local"
      },
      {
        "label": "Marshallese",
        "kind": "english"
      },
      {
        "label": "marshallais",
        "kind": "alias"
      },
      {
        "label": "marshalés",
        "kind": "alias"
      },
      {
        "label": "Marschallesisch",
        "kind": "alias"
      }
    ],
    "kca": [
      {
        "label": "Khanty",
        "kind": "english"
      }
    ],
    "dgo": [
      {
        "label": "多格拉语",
        "kind": "local"
      },
      {
        "label": "डोगरी",
        "kind": "native"
      },
      {
        "label": "Dogri",
        "kind": "english"
      }
    ],
    "brh": [
      {
        "label": "Brahui",
        "kind": "english"
      },
      {
        "label": "brahoui",
        "kind": "alias"
      }
    ],
    "nog": [
      {
        "label": "诺盖语",
        "kind": "local"
      },
      {
        "label": "Nogai",
        "kind": "english"
      },
      {
        "label": "nogaï",
        "kind": "alias"
      }
    ],
    "ckt": [
      {
        "label": "Chukchi",
        "kind": "english"
      }
    ],
    "lbe": [
      {
        "label": "Lak",
        "kind": "english"
      }
    ],
    "mzn": [
      {
        "label": "马赞德兰语",
        "kind": "local"
      },
      {
        "label": "مازرونی",
        "kind": "native"
      },
      {
        "label": "Mazanderani",
        "kind": "english"
      },
      {
        "label": "mazandérani",
        "kind": "alias"
      },
      {
        "label": "mazandaraní",
        "kind": "alias"
      },
      {
        "label": "Masanderanisch",
        "kind": "alias"
      }
    ],
    "gil": [
      {
        "label": "吉尔伯特语",
        "kind": "local"
      },
      {
        "label": "Gilbertese",
        "kind": "english"
      },
      {
        "label": "gilbertin",
        "kind": "alias"
      },
      {
        "label": "gilbertés",
        "kind": "alias"
      },
      {
        "label": "Kiribatisch",
        "kind": "alias"
      }
    ],
    "bug": [
      {
        "label": "布吉语",
        "kind": "local"
      },
      {
        "label": "Bugis",
        "kind": "english"
      },
      {
        "label": "Buginese",
        "kind": "alias"
      },
      {
        "label": "bugi",
        "kind": "alias"
      },
      {
        "label": "buginés",
        "kind": "alias"
      },
      {
        "label": "Buginesisch",
        "kind": "alias"
      }
    ],
    "izh": [
      {
        "label": "Ingrian",
        "kind": "english"
      },
      {
        "label": "ingrien",
        "kind": "alias"
      },
      {
        "label": "Ischorisch",
        "kind": "alias"
      }
    ],
    "kon": [
      {
        "label": "刚果语",
        "kind": "local"
      },
      {
        "label": "Kongo",
        "kind": "english"
      },
      {
        "label": "kikongo",
        "kind": "alias"
      },
      {
        "label": "Kongolesisch",
        "kind": "alias"
      }
    ],
    "ell": [
      {
        "label": "希腊语",
        "kind": "local"
      },
      {
        "label": "Ελληνικά",
        "kind": "native"
      },
      {
        "label": "Modern Greek",
        "kind": "english"
      },
      {
        "label": "Greek",
        "kind": "alias"
      },
      {
        "label": "grec",
        "kind": "alias"
      },
      {
        "label": "griego",
        "kind": "alias"
      },
      {
        "label": "Griechisch",
        "kind": "alias"
      }
    ],
    "chg": [
      {
        "label": "察合台语",
        "kind": "local"
      },
      {
        "label": "Chagatai",
        "kind": "english"
      },
      {
        "label": "tchaghataï",
        "kind": "alias"
      },
      {
        "label": "chagatái",
        "kind": "alias"
      },
      {
        "label": "Tschagataisch",
        "kind": "alias"
      }
    ],
    "pdc": [
      {
        "label": "Pennsylvania German",
        "kind": "english"
      },
      {
        "label": "pennsilfaanisch",
        "kind": "alias"
      },
      {
        "label": "Pennsylvaniadeutsch",
        "kind": "alias"
      }
    ],
    "aka": [
      {
        "label": "阿肯语",
        "kind": "local"
      },
      {
        "label": "Akan",
        "kind": "native"
      }
    ],
    "kum": [
      {
        "label": "库梅克语",
        "kind": "local"
      },
      {
        "label": "Kumyk",
        "kind": "english"
      },
      {
        "label": "koumyk",
        "kind": "alias"
      },
      {
        "label": "Kumükisch",
        "kind": "alias"
      }
    ],
    "hmo": [
      {
        "label": "希里莫图语",
        "kind": "local"
      },
      {
        "label": "Hiri Motu",
        "kind": "english"
      },
      {
        "label": "Hiri-Motu",
        "kind": "alias"
      }
    ],
    "ale": [
      {
        "label": "阿留申语",
        "kind": "local"
      },
      {
        "label": "Aleut",
        "kind": "english"
      },
      {
        "label": "aléoute",
        "kind": "alias"
      },
      {
        "label": "aleutiano",
        "kind": "alias"
      },
      {
        "label": "Aleutisch",
        "kind": "alias"
      }
    ],
    "awa": [
      {
        "label": "阿瓦德语",
        "kind": "local"
      },
      {
        "label": "Awadhi",
        "kind": "english"
      },
      {
        "label": "avadhi",
        "kind": "alias"
      }
    ],
    "dlm": [
      {
        "label": "Dalmatian",
        "kind": "english"
      }
    ],
    "her": [
      {
        "label": "赫雷罗语",
        "kind": "local"
      },
      {
        "label": "Herero",
        "kind": "english"
      },
      {
        "label": "héréro",
        "kind": "alias"
      }
    ],
    "enm": [
      {
        "label": "中古英语",
        "kind": "local"
      },
      {
        "label": "Middle English",
        "kind": "english"
      },
      {
        "label": "moyen anglais",
        "kind": "alias"
      },
      {
        "label": "inglés medio",
        "kind": "alias"
      },
      {
        "label": "Mittelenglisch",
        "kind": "alias"
      }
    ],
    "prg": [
      {
        "label": "普鲁士语",
        "kind": "local"
      },
      {
        "label": "prūsiskan",
        "kind": "native"
      },
      {
        "label": "Old Prussian",
        "kind": "english"
      },
      {
        "label": "Prussian",
        "kind": "alias"
      },
      {
        "label": "prussien",
        "kind": "alias"
      },
      {
        "label": "prusiano",
        "kind": "alias"
      },
      {
        "label": "Altpreußisch",
        "kind": "alias"
      }
    ],
    "yrk": [
      {
        "label": "Nenets",
        "kind": "english"
      }
    ],
    "qya": [
      {
        "label": "Quenya",
        "kind": "english"
      }
    ],
    "vot": [
      {
        "label": "沃提克语",
        "kind": "local"
      },
      {
        "label": "Votic",
        "kind": "english"
      },
      {
        "label": "vote",
        "kind": "alias"
      },
      {
        "label": "vótico",
        "kind": "alias"
      },
      {
        "label": "Wotisch",
        "kind": "alias"
      }
    ],
    "pau": [
      {
        "label": "帕劳语",
        "kind": "local"
      },
      {
        "label": "Palauan",
        "kind": "english"
      },
      {
        "label": "palau",
        "kind": "alias"
      },
      {
        "label": "palauano",
        "kind": "alias"
      }
    ],
    "nan": [
      {
        "label": "闽南语",
        "kind": "local"
      },
      {
        "label": "閩南語",
        "kind": "native"
      },
      {
        "label": "Southern Min",
        "kind": "english"
      },
      {
        "label": "minnan",
        "kind": "alias"
      },
      {
        "label": "Min Nan",
        "kind": "alias"
      },
      {
        "label": "hokkien",
        "kind": "alias"
      },
      {
        "label": "taiwanese hokkien",
        "kind": "alias"
      },
      {
        "label": "台语",
        "kind": "alias"
      },
      {
        "label": "臺語",
        "kind": "alias"
      },
      {
        "label": "河洛话",
        "kind": "alias"
      },
      {
        "label": "河洛話",
        "kind": "alias"
      }
    ],
    "nso": [
      {
        "label": "北索托语",
        "kind": "local"
      },
      {
        "label": "Sesotho sa Leboa",
        "kind": "native"
      },
      {
        "label": "Northern Sotho",
        "kind": "english"
      },
      {
        "label": "sotho du Nord",
        "kind": "alias"
      },
      {
        "label": "sotho septentrional",
        "kind": "alias"
      },
      {
        "label": "Nord-Sotho",
        "kind": "alias"
      }
    ],
    "sag": [
      {
        "label": "桑戈语",
        "kind": "local"
      },
      {
        "label": "Sängö",
        "kind": "native"
      },
      {
        "label": "Sango",
        "kind": "english"
      }
    ],
    "stq": [
      {
        "label": "Saterland Frisian",
        "kind": "english"
      },
      {
        "label": "saterlandais",
        "kind": "alias"
      },
      {
        "label": "Saterfriesisch",
        "kind": "alias"
      }
    ],
    "yue": [
      {
        "label": "粤语",
        "kind": "local"
      },
      {
        "label": "粵語",
        "kind": "native"
      },
      {
        "label": "Cantonese",
        "kind": "english"
      },
      {
        "label": "cantonais",
        "kind": "alias"
      },
      {
        "label": "cantonés",
        "kind": "alias"
      },
      {
        "label": "Kantonesisch",
        "kind": "alias"
      },
      {
        "label": "cantonese chinese",
        "kind": "alias"
      },
      {
        "label": "guangdonghua",
        "kind": "alias"
      },
      {
        "label": "广东话",
        "kind": "alias"
      },
      {
        "label": "廣東話",
        "kind": "alias"
      },
      {
        "label": "白话",
        "kind": "alias"
      },
      {
        "label": "白話",
        "kind": "alias"
      }
    ],
    "xmf": [
      {
        "label": "Mingrelian",
        "kind": "english"
      },
      {
        "label": "mingrélien",
        "kind": "alias"
      },
      {
        "label": "Mingrelisch",
        "kind": "alias"
      }
    ],
    "bjn": [
      {
        "label": "Banjar",
        "kind": "english"
      },
      {
        "label": "Banjaresisch",
        "kind": "alias"
      }
    ],
    "ase": [
      {
        "label": "American Sign Language",
        "kind": "english"
      },
      {
        "label": "langue des signes américaine",
        "kind": "alias"
      },
      {
        "label": "Amerikanische Gebärdensprache",
        "kind": "alias"
      }
    ],
    "kau": [
      {
        "label": "卡努里语",
        "kind": "local"
      },
      {
        "label": "Kanuri",
        "kind": "english"
      },
      {
        "label": "kanouri",
        "kind": "alias"
      }
    ],
    "nrn": [
      {
        "label": "Norn",
        "kind": "english"
      }
    ],
    "frr": [
      {
        "label": "北弗里西亚语",
        "kind": "local"
      },
      {
        "label": "North Frisian",
        "kind": "english"
      },
      {
        "label": "Northern Frisian",
        "kind": "alias"
      },
      {
        "label": "frison septentrional",
        "kind": "alias"
      },
      {
        "label": "frisón septentrional",
        "kind": "alias"
      },
      {
        "label": "Nordfriesisch",
        "kind": "alias"
      }
    ],
    "lug": [
      {
        "label": "卢干达语",
        "kind": "local"
      },
      {
        "label": "Luganda",
        "kind": "native"
      },
      {
        "label": "Ganda",
        "kind": "alias"
      }
    ],
    "cre": [
      {
        "label": "克里语",
        "kind": "local"
      },
      {
        "label": "Cree",
        "kind": "english"
      }
    ],
    "gan": [
      {
        "label": "赣语",
        "kind": "local"
      },
      {
        "label": "Gan Chinese",
        "kind": "english"
      },
      {
        "label": "gan",
        "kind": "alias"
      },
      {
        "label": "chino gan",
        "kind": "alias"
      },
      {
        "label": "贛語",
        "kind": "alias"
      }
    ],
    "kik": [
      {
        "label": "吉库尤语",
        "kind": "local"
      },
      {
        "label": "Gikuyu",
        "kind": "native"
      },
      {
        "label": "Kikuyu",
        "kind": "alias"
      }
    ],
    "mag": [
      {
        "label": "摩揭陀语",
        "kind": "local"
      },
      {
        "label": "Magahi",
        "kind": "english"
      },
      {
        "label": "Khotta",
        "kind": "alias"
      }
    ],
    "pox": [
      {
        "label": "Polabian",
        "kind": "english"
      }
    ],
    "zha": [
      {
        "label": "壮语",
        "kind": "local"
      },
      {
        "label": "Vahcuengh",
        "kind": "native"
      },
      {
        "label": "Zhuang",
        "kind": "english"
      },
      {
        "label": "壮文",
        "kind": "alias"
      },
      {
        "label": "壯語",
        "kind": "alias"
      }
    ],
    "bsk": [
      {
        "label": "Burushaski",
        "kind": "english"
      }
    ],
    "sva": [
      {
        "label": "Svan",
        "kind": "english"
      }
    ],
    "fro": [
      {
        "label": "古法语",
        "kind": "local"
      },
      {
        "label": "Old French",
        "kind": "english"
      },
      {
        "label": "ancien français",
        "kind": "alias"
      },
      {
        "label": "francés antiguo",
        "kind": "alias"
      },
      {
        "label": "Altfranzösisch",
        "kind": "alias"
      }
    ],
    "nbl": [
      {
        "label": "南恩德贝勒语",
        "kind": "local"
      },
      {
        "label": "Southern Ndebele",
        "kind": "english"
      },
      {
        "label": "South Ndebele",
        "kind": "alias"
      },
      {
        "label": "ndébélé du Sud",
        "kind": "alias"
      },
      {
        "label": "ndebele meridional",
        "kind": "alias"
      },
      {
        "label": "Süd-Ndebele",
        "kind": "alias"
      }
    ],
    "lzz": [
      {
        "label": "Laz",
        "kind": "english"
      },
      {
        "label": "laze",
        "kind": "alias"
      },
      {
        "label": "Lasisch",
        "kind": "alias"
      }
    ],
    "tvl": [
      {
        "label": "图瓦卢语",
        "kind": "local"
      },
      {
        "label": "Tuvaluan",
        "kind": "english"
      },
      {
        "label": "Tuvalu",
        "kind": "alias"
      },
      {
        "label": "tuvaluano",
        "kind": "alias"
      },
      {
        "label": "Tuvaluisch",
        "kind": "alias"
      }
    ],
    "elx": [
      {
        "label": "埃兰语",
        "kind": "local"
      },
      {
        "label": "Elamite",
        "kind": "english"
      },
      {
        "label": "élamite",
        "kind": "alias"
      },
      {
        "label": "elamita",
        "kind": "alias"
      },
      {
        "label": "Elamisch",
        "kind": "alias"
      }
    ],
    "koi": [
      {
        "label": "科米-彼尔米亚克语",
        "kind": "local"
      },
      {
        "label": "Komi-Permyak",
        "kind": "english"
      },
      {
        "label": "komi-permiak",
        "kind": "alias"
      },
      {
        "label": "komi permio",
        "kind": "alias"
      },
      {
        "label": "Komi-Permjakisch",
        "kind": "alias"
      }
    ],
    "sgs": [
      {
        "label": "Samogitian",
        "kind": "english"
      },
      {
        "label": "samogitien",
        "kind": "alias"
      },
      {
        "label": "Samogitisch",
        "kind": "alias"
      }
    ],
    "sma": [
      {
        "label": "南萨米语",
        "kind": "local"
      },
      {
        "label": "Southern Sami",
        "kind": "english"
      },
      {
        "label": "same du Sud",
        "kind": "alias"
      },
      {
        "label": "sami meridional",
        "kind": "alias"
      },
      {
        "label": "Südsamisch",
        "kind": "alias"
      }
    ],
    "ext": [
      {
        "label": "Extremaduran",
        "kind": "english"
      },
      {
        "label": "estrémègne",
        "kind": "alias"
      },
      {
        "label": "Extremadurisch",
        "kind": "alias"
      }
    ],
    "evn": [
      {
        "label": "Evenki",
        "kind": "english"
      }
    ],
    "kab": [
      {
        "label": "卡拜尔语",
        "kind": "local"
      },
      {
        "label": "Taqbaylit",
        "kind": "native"
      },
      {
        "label": "Kabyle",
        "kind": "english"
      },
      {
        "label": "cabileño",
        "kind": "alias"
      },
      {
        "label": "Kabylisch",
        "kind": "alias"
      }
    ],
    "rap": [
      {
        "label": "拉帕努伊语",
        "kind": "local"
      },
      {
        "label": "Rapa Nui",
        "kind": "english"
      },
      {
        "label": "Rapanui",
        "kind": "alias"
      }
    ],
    "rut": [
      {
        "label": "Rutulian",
        "kind": "english"
      }
    ],
    "lzh": [
      {
        "label": "Classical Chinese",
        "kind": "english"
      },
      {
        "label": "Literary Chinese",
        "kind": "alias"
      },
      {
        "label": "chinois littéraire",
        "kind": "alias"
      },
      {
        "label": "Klassisches Chinesisch",
        "kind": "alias"
      }
    ],
    "raj": [
      {
        "label": "拉贾斯坦语",
        "kind": "local"
      },
      {
        "label": "राजस्थानी",
        "kind": "native"
      },
      {
        "label": "Rajasthani",
        "kind": "english"
      }
    ],
    "srn": [
      {
        "label": "苏里南汤加语",
        "kind": "local"
      },
      {
        "label": "Sranan Tongo",
        "kind": "english"
      },
      {
        "label": "Srananisch",
        "kind": "alias"
      }
    ],
    "niu": [
      {
        "label": "纽埃语",
        "kind": "local"
      },
      {
        "label": "Niuean",
        "kind": "english"
      },
      {
        "label": "niuéen",
        "kind": "alias"
      },
      {
        "label": "niueano",
        "kind": "alias"
      },
      {
        "label": "Niue",
        "kind": "alias"
      }
    ],
    "smn": [
      {
        "label": "伊纳里萨米语",
        "kind": "local"
      },
      {
        "label": "anarâškielâ",
        "kind": "native"
      },
      {
        "label": "Inari Sami",
        "kind": "english"
      },
      {
        "label": "same d’Inari",
        "kind": "alias"
      },
      {
        "label": "sami inari",
        "kind": "alias"
      },
      {
        "label": "Inari-Samisch",
        "kind": "alias"
      }
    ],
    "glk": [
      {
        "label": "Gilaki",
        "kind": "english"
      }
    ],
    "peo": [
      {
        "label": "古波斯语",
        "kind": "local"
      },
      {
        "label": "Old Persian",
        "kind": "english"
      },
      {
        "label": "persan ancien",
        "kind": "alias"
      },
      {
        "label": "persa antiguo",
        "kind": "alias"
      },
      {
        "label": "Altpersisch",
        "kind": "alias"
      }
    ],
    "ryu": [
      {
        "label": "Okinawan",
        "kind": "english"
      }
    ],
    "tly": [
      {
        "label": "Talysh",
        "kind": "english"
      },
      {
        "label": "Talisch",
        "kind": "alias"
      }
    ],
    "chu": [
      {
        "label": "教会斯拉夫语",
        "kind": "local"
      },
      {
        "label": "Church Slavonic",
        "kind": "english"
      },
      {
        "label": "Church Slavic",
        "kind": "alias"
      },
      {
        "label": "slavon d’église",
        "kind": "alias"
      },
      {
        "label": "eslavo eclesiástico",
        "kind": "alias"
      },
      {
        "label": "Kirchenslawisch",
        "kind": "alias"
      }
    ],
    "orv": [
      {
        "label": "Old East Slavic",
        "kind": "english"
      }
    ],
    "fon": [
      {
        "label": "丰语",
        "kind": "local"
      },
      {
        "label": "Fon",
        "kind": "english"
      }
    ],
    "pam": [
      {
        "label": "邦板牙语",
        "kind": "local"
      },
      {
        "label": "Kapampangan",
        "kind": "english"
      },
      {
        "label": "Pampanga",
        "kind": "alias"
      },
      {
        "label": "pampangan",
        "kind": "alias"
      },
      {
        "label": "Pampanggan",
        "kind": "alias"
      }
    ],
    "mad": [
      {
        "label": "马都拉语",
        "kind": "local"
      },
      {
        "label": "Madurese",
        "kind": "english"
      },
      {
        "label": "madurais",
        "kind": "alias"
      },
      {
        "label": "madurés",
        "kind": "alias"
      },
      {
        "label": "Maduresisch",
        "kind": "alias"
      }
    ],
    "fit": [
      {
        "label": "Meänkieli",
        "kind": "english"
      },
      {
        "label": "Tornedalen Finnish",
        "kind": "alias"
      },
      {
        "label": "finnois tornédalien",
        "kind": "alias"
      }
    ],
    "pal": [
      {
        "label": "巴拉维语",
        "kind": "local"
      },
      {
        "label": "Middle Persian",
        "kind": "english"
      },
      {
        "label": "Pahlavi",
        "kind": "alias"
      },
      {
        "label": "Mittelpersisch",
        "kind": "alias"
      }
    ],
    "hne": [
      {
        "label": "Chhattisgarhi",
        "kind": "english"
      }
    ],
    "ckb": [
      {
        "label": "中库尔德语",
        "kind": "local"
      },
      {
        "label": "کوردیی ناوەندی",
        "kind": "native"
      },
      {
        "label": "Central Kurdish",
        "kind": "english"
      },
      {
        "label": "sorani",
        "kind": "alias"
      },
      {
        "label": "kurdo sorani",
        "kind": "alias"
      },
      {
        "label": "Zentralkurdisch",
        "kind": "alias"
      }
    ],
    "bpy": [
      {
        "label": "Bishnupriya Manipuri",
        "kind": "english"
      },
      {
        "label": "Bishnupriya",
        "kind": "alias"
      }
    ],
    "sog": [
      {
        "label": "粟特语",
        "kind": "local"
      },
      {
        "label": "Sogdian",
        "kind": "english"
      },
      {
        "label": "Sogdien",
        "kind": "alias"
      },
      {
        "label": "sogdiano",
        "kind": "alias"
      },
      {
        "label": "Sogdisch",
        "kind": "alias"
      }
    ],
    "ipk": [
      {
        "label": "伊努皮克语",
        "kind": "local"
      },
      {
        "label": "Iñupiaq",
        "kind": "english"
      },
      {
        "label": "Inupiaq",
        "kind": "alias"
      },
      {
        "label": "Inupiak",
        "kind": "alias"
      }
    ],
    "mwr": [
      {
        "label": "马尔瓦里语",
        "kind": "local"
      },
      {
        "label": "Marwari",
        "kind": "english"
      },
      {
        "label": "marwarî",
        "kind": "alias"
      }
    ],
    "uga": [
      {
        "label": "乌加里特语",
        "kind": "local"
      },
      {
        "label": "Ugaritic",
        "kind": "english"
      },
      {
        "label": "ougaritique",
        "kind": "alias"
      },
      {
        "label": "ugarítico",
        "kind": "alias"
      },
      {
        "label": "Ugaritisch",
        "kind": "alias"
      }
    ],
    "fkv": [
      {
        "label": "Kven",
        "kind": "english"
      }
    ],
    "tab": [
      {
        "label": "Tabasaran",
        "kind": "english"
      }
    ],
    "jam": [
      {
        "label": "Jamaican Patois",
        "kind": "english"
      },
      {
        "label": "Jamaican Creole English",
        "kind": "alias"
      },
      {
        "label": "créole jamaïcain",
        "kind": "alias"
      },
      {
        "label": "Jamaikanisch-Kreolisch",
        "kind": "alias"
      }
    ],
    "bgc": [
      {
        "label": "哈里亚纳语",
        "kind": "local"
      },
      {
        "label": "हरियाणवी",
        "kind": "native"
      },
      {
        "label": "Haryanvi",
        "kind": "english"
      }
    ],
    "nio": [
      {
        "label": "Nganasan",
        "kind": "english"
      }
    ],
    "mnw": [
      {
        "label": "Mon",
        "kind": "english"
      }
    ],
    "skr": [
      {
        "label": "色莱基语",
        "kind": "local"
      },
      {
        "label": "Saraiki",
        "kind": "english"
      }
    ],
    "tkl": [
      {
        "label": "托克劳语",
        "kind": "local"
      },
      {
        "label": "Tokelauan",
        "kind": "english"
      },
      {
        "label": "tokelau",
        "kind": "alias"
      },
      {
        "label": "tokelauano",
        "kind": "alias"
      },
      {
        "label": "Tokelauanisch",
        "kind": "alias"
      }
    ],
    "dng": [
      {
        "label": "Dungan",
        "kind": "english"
      }
    ],
    "kmr": [
      {
        "label": "库尔曼吉语",
        "kind": "local"
      },
      {
        "label": "kurdî (kurmancî)",
        "kind": "native"
      },
      {
        "label": "Northern Kurdish",
        "kind": "english"
      },
      {
        "label": "kurde",
        "kind": "alias"
      },
      {
        "label": "kurdo",
        "kind": "alias"
      },
      {
        "label": "Kurdisch",
        "kind": "alias"
      },
      {
        "label": "kurmanji",
        "kind": "alias"
      }
    ],
    "osc": [
      {
        "label": "Oscan",
        "kind": "english"
      }
    ],
    "smj": [
      {
        "label": "吕勒萨米语",
        "kind": "local"
      },
      {
        "label": "Lule Sami",
        "kind": "english"
      },
      {
        "label": "same de Lule",
        "kind": "alias"
      },
      {
        "label": "sami lule",
        "kind": "alias"
      },
      {
        "label": "Lule-Samisch",
        "kind": "alias"
      }
    ],
    "cbk": [
      {
        "label": "Chavacano",
        "kind": "english"
      }
    ],
    "sel": [
      {
        "label": "塞尔库普语",
        "kind": "local"
      },
      {
        "label": "Selkup",
        "kind": "english"
      },
      {
        "label": "selkoupe",
        "kind": "alias"
      },
      {
        "label": "Selkupisch",
        "kind": "alias"
      }
    ],
    "tmh": [
      {
        "label": "塔马奇克语",
        "kind": "local"
      },
      {
        "label": "Tuareg",
        "kind": "english"
      },
      {
        "label": "Tamashek",
        "kind": "alias"
      },
      {
        "label": "tamacheq",
        "kind": "alias"
      },
      {
        "label": "Tamaseq",
        "kind": "alias"
      }
    ],
    "ltg": [
      {
        "label": "Latgalian",
        "kind": "english"
      },
      {
        "label": "latgalien",
        "kind": "alias"
      },
      {
        "label": "Lettgallisch",
        "kind": "alias"
      }
    ],
    "ket": [
      {
        "label": "Ket",
        "kind": "english"
      }
    ],
    "sjd": [
      {
        "label": "Kildin Sami",
        "kind": "english"
      }
    ],
    "lab": [
      {
        "label": "Linear A",
        "kind": "english"
      }
    ],
    "hil": [
      {
        "label": "希利盖农语",
        "kind": "local"
      },
      {
        "label": "Hiligaynon",
        "kind": "english"
      }
    ],
    "shi": [
      {
        "label": "希尔哈语",
        "kind": "local"
      },
      {
        "label": "ⵜⴰⵛⵍⵃⵉⵜ",
        "kind": "native"
      },
      {
        "label": "Tashelhit",
        "kind": "english"
      },
      {
        "label": "Tachelhit",
        "kind": "alias"
      },
      {
        "label": "chleuh",
        "kind": "alias"
      },
      {
        "label": "Taschelhit",
        "kind": "alias"
      }
    ],
    "prv": [
      {
        "label": "Provençal",
        "kind": "english"
      }
    ],
    "gon": [
      {
        "label": "冈德语",
        "kind": "local"
      },
      {
        "label": "Gondi",
        "kind": "english"
      }
    ],
    "naq": [
      {
        "label": "纳马语",
        "kind": "local"
      },
      {
        "label": "Khoekhoegowab",
        "kind": "native"
      },
      {
        "label": "Khoekhoe",
        "kind": "english"
      },
      {
        "label": "Nama",
        "kind": "alias"
      }
    ],
    "pag": [
      {
        "label": "邦阿西南语",
        "kind": "local"
      },
      {
        "label": "Pangasinan",
        "kind": "english"
      },
      {
        "label": "pangasinán",
        "kind": "alias"
      }
    ],
    "cho": [
      {
        "label": "乔克托语",
        "kind": "local"
      },
      {
        "label": "Choctaw",
        "kind": "english"
      }
    ],
    "kpy": [
      {
        "label": "Koryak",
        "kind": "english"
      }
    ],
    "ttt": [
      {
        "label": "Tat",
        "kind": "english"
      },
      {
        "label": "Muslim Tat",
        "kind": "alias"
      },
      {
        "label": "tati caucasien",
        "kind": "alias"
      },
      {
        "label": "Tatisch",
        "kind": "alias"
      }
    ],
    "hbo": [
      {
        "label": "Biblical Hebrew",
        "kind": "english"
      }
    ],
    "yua": [
      {
        "label": "Yucatec Maya",
        "kind": "english"
      }
    ],
    "xpr": [
      {
        "label": "Parthian",
        "kind": "english"
      }
    ],
    "anp": [
      {
        "label": "昂加语",
        "kind": "local"
      },
      {
        "label": "Angika",
        "kind": "english"
      }
    ],
    "eve": [
      {
        "label": "Even",
        "kind": "english"
      }
    ],
    "dyu": [
      {
        "label": "迪尤拉语",
        "kind": "local"
      },
      {
        "label": "Dioula",
        "kind": "english"
      },
      {
        "label": "Dyula",
        "kind": "alias"
      },
      {
        "label": "diula",
        "kind": "alias"
      }
    ],
    "dlg": [
      {
        "label": "Dolgan",
        "kind": "english"
      }
    ],
    "goh": [
      {
        "label": "古高地德语",
        "kind": "local"
      },
      {
        "label": "Old High German",
        "kind": "english"
      },
      {
        "label": "ancien haut allemand",
        "kind": "alias"
      },
      {
        "label": "alto alemán antiguo",
        "kind": "alias"
      },
      {
        "label": "Althochdeutsch",
        "kind": "alias"
      }
    ],
    "mos": [
      {
        "label": "莫西语",
        "kind": "local"
      },
      {
        "label": "Mooré",
        "kind": "english"
      },
      {
        "label": "Mossi",
        "kind": "alias"
      },
      {
        "label": "moré",
        "kind": "alias"
      }
    ],
    "niv": [
      {
        "label": "Nivkh",
        "kind": "english"
      }
    ],
    "pnt": [
      {
        "label": "Pontic Greek",
        "kind": "english"
      },
      {
        "label": "Pontic",
        "kind": "alias"
      },
      {
        "label": "pontique",
        "kind": "alias"
      },
      {
        "label": "Pontisch",
        "kind": "alias"
      }
    ],
    "uby": [
      {
        "label": "Ubykh",
        "kind": "english"
      }
    ],
    "fsl": [
      {
        "label": "French Sign Language",
        "kind": "english"
      }
    ],
    "oji": [
      {
        "label": "奥吉布瓦语",
        "kind": "local"
      },
      {
        "label": "Ojibwe",
        "kind": "english"
      },
      {
        "label": "Ojibwa",
        "kind": "alias"
      }
    ],
    "bem": [
      {
        "label": "本巴语",
        "kind": "local"
      },
      {
        "label": "Ichibemba",
        "kind": "native"
      },
      {
        "label": "Bemba",
        "kind": "english"
      }
    ],
    "mnk": [
      {
        "label": "曼丁哥语",
        "kind": "local"
      },
      {
        "label": "Mandinka",
        "kind": "english"
      },
      {
        "label": "Mandingo",
        "kind": "alias"
      },
      {
        "label": "mandingue",
        "kind": "alias"
      },
      {
        "label": "Malinke",
        "kind": "alias"
      }
    ],
    "kdr": [
      {
        "label": "Karaim",
        "kind": "english"
      }
    ],
    "ary": [
      {
        "label": "Moroccan Arabic",
        "kind": "english"
      },
      {
        "label": "arabe marocain",
        "kind": "alias"
      },
      {
        "label": "Marokkanisches Arabisch",
        "kind": "alias"
      }
    ],
    "sms": [
      {
        "label": "斯科特萨米语",
        "kind": "local"
      },
      {
        "label": "Skolt Sami",
        "kind": "english"
      },
      {
        "label": "same skolt",
        "kind": "alias"
      },
      {
        "label": "sami skolt",
        "kind": "alias"
      },
      {
        "label": "Skolt-Samisch",
        "kind": "alias"
      }
    ],
    "chy": [
      {
        "label": "夏延语",
        "kind": "local"
      },
      {
        "label": "Cheyenne",
        "kind": "english"
      },
      {
        "label": "cheyene",
        "kind": "alias"
      }
    ],
    "cdo": [
      {
        "label": "Eastern Min",
        "kind": "english"
      }
    ],
    "agx": [
      {
        "label": "Aghul",
        "kind": "english"
      }
    ],
    "wym": [
      {
        "label": "Wymysorys",
        "kind": "english"
      }
    ],
    "qxq": [
      {
        "label": "Qashqai",
        "kind": "english"
      }
    ],
    "xil": [
      {
        "label": "Illyrian",
        "kind": "english"
      }
    ],
    "gld": [
      {
        "label": "Nanai",
        "kind": "english"
      }
    ],
    "crs": [
      {
        "label": "塞舌尔克里奥尔语",
        "kind": "local"
      },
      {
        "label": "Seychellois Creole",
        "kind": "english"
      },
      {
        "label": "Seselwa Creole French",
        "kind": "alias"
      },
      {
        "label": "créole seychellois",
        "kind": "alias"
      },
      {
        "label": "criollo seychelense",
        "kind": "alias"
      },
      {
        "label": "Seychellenkreol",
        "kind": "alias"
      }
    ],
    "tig": [
      {
        "label": "提格雷语",
        "kind": "local"
      },
      {
        "label": "Tigre",
        "kind": "english"
      },
      {
        "label": "tigré",
        "kind": "alias"
      }
    ],
    "wbl": [
      {
        "label": "Wakhi",
        "kind": "english"
      }
    ],
    "lus": [
      {
        "label": "米佐语",
        "kind": "local"
      },
      {
        "label": "Mizo",
        "kind": "english"
      },
      {
        "label": "lushaï",
        "kind": "alias"
      },
      {
        "label": "Lushai",
        "kind": "alias"
      }
    ],
    "xcb": [
      {
        "label": "Cumbric",
        "kind": "english"
      }
    ],
    "vsn": [
      {
        "label": "Vedic Sanskrit",
        "kind": "english"
      }
    ],
    "hyw": [
      {
        "label": "Western Armenian",
        "kind": "english"
      }
    ],
    "avk": [
      {
        "label": "Kotava",
        "kind": "english"
      }
    ],
    "slr": [
      {
        "label": "Salar",
        "kind": "english"
      }
    ],
    "otk": [
      {
        "label": "Old Turkic",
        "kind": "english"
      }
    ],
    "nde": [
      {
        "label": "北恩德贝勒语",
        "kind": "local"
      },
      {
        "label": "isiNdebele",
        "kind": "native"
      },
      {
        "label": "Northern Ndebele",
        "kind": "english"
      },
      {
        "label": "North Ndebele",
        "kind": "alias"
      },
      {
        "label": "ndébélé du Nord",
        "kind": "alias"
      },
      {
        "label": "ndebele septentrional",
        "kind": "alias"
      },
      {
        "label": "Nord-Ndebele",
        "kind": "alias"
      }
    ],
    "kha": [
      {
        "label": "卡西语",
        "kind": "local"
      },
      {
        "label": "Khasi",
        "kind": "english"
      }
    ],
    "twi": [
      {
        "label": "契维语",
        "kind": "local"
      },
      {
        "label": "Akan",
        "kind": "native"
      },
      {
        "label": "Twi",
        "kind": "english"
      }
    ],
    "grt": [
      {
        "label": "Garo",
        "kind": "english"
      }
    ],
    "txh": [
      {
        "label": "Thracian",
        "kind": "english"
      }
    ],
    "khw": [
      {
        "label": "Khowar",
        "kind": "english"
      }
    ],
    "xbc": [
      {
        "label": "Bactrian",
        "kind": "english"
      }
    ],
    "xpi": [
      {
        "label": "Pictish",
        "kind": "english"
      }
    ],
    "mxi": [
      {
        "label": "Andalusi Romance",
        "kind": "english"
      }
    ],
    "xpu": [
      {
        "label": "Punic",
        "kind": "english"
      }
    ],
    "sgh": [
      {
        "label": "Shughni",
        "kind": "english"
      }
    ],
    "bra": [
      {
        "label": "布拉杰语",
        "kind": "local"
      },
      {
        "label": "Braj Bhasha",
        "kind": "english"
      },
      {
        "label": "Braj",
        "kind": "alias"
      },
      {
        "label": "Braj-Bhakha",
        "kind": "alias"
      }
    ],
    "snk": [
      {
        "label": "索宁克语",
        "kind": "local"
      },
      {
        "label": "Soninke",
        "kind": "english"
      },
      {
        "label": "soninké",
        "kind": "alias"
      }
    ],
    "xpg": [
      {
        "label": "Phrygian",
        "kind": "english"
      }
    ],
    "sjn": [
      {
        "label": "Sindarin",
        "kind": "english"
      }
    ],
    "ruo": [
      {
        "label": "Istro-Romanian",
        "kind": "english"
      }
    ],
    "nzs": [
      {
        "label": "New Zealand Sign Language",
        "kind": "english"
      }
    ],
    "cjs": [
      {
        "label": "Shor",
        "kind": "english"
      }
    ],
    "lua": [
      {
        "label": "卢巴-卢拉语",
        "kind": "local"
      },
      {
        "label": "Luba-Kasai",
        "kind": "english"
      },
      {
        "label": "Luba-Lulua",
        "kind": "alias"
      },
      {
        "label": "luba-kasaï (ciluba)",
        "kind": "alias"
      }
    ],
    "vls": [
      {
        "label": "West Flemish",
        "kind": "english"
      },
      {
        "label": "flamand occidental",
        "kind": "alias"
      },
      {
        "label": "Westflämisch",
        "kind": "alias"
      }
    ],
    "zea": [
      {
        "label": "Zeelandic",
        "kind": "english"
      },
      {
        "label": "zélandais",
        "kind": "alias"
      },
      {
        "label": "Seeländisch",
        "kind": "alias"
      }
    ],
    "pfl": [
      {
        "label": "Palatinate German",
        "kind": "english"
      },
      {
        "label": "Palatine German",
        "kind": "alias"
      },
      {
        "label": "allemand palatin",
        "kind": "alias"
      },
      {
        "label": "Pfälzisch",
        "kind": "alias"
      }
    ],
    "aii": [
      {
        "label": "Assyrian Neo-Aramaic",
        "kind": "english"
      }
    ],
    "bfi": [
      {
        "label": "British Sign Language",
        "kind": "english"
      }
    ],
    "osx": [
      {
        "label": "Old Saxon",
        "kind": "english"
      }
    ],
    "xhu": [
      {
        "label": "Hurrian",
        "kind": "english"
      }
    ],
    "sjt": [
      {
        "label": "Ter Sami",
        "kind": "english"
      }
    ],
    "xvn": [
      {
        "label": "Vandalic",
        "kind": "english"
      }
    ],
    "yai": [
      {
        "label": "Yaghnobi",
        "kind": "english"
      }
    ],
    "sje": [
      {
        "label": "Pite Sami",
        "kind": "english"
      }
    ],
    "shn": [
      {
        "label": "掸语",
        "kind": "local"
      },
      {
        "label": "Shan",
        "kind": "english"
      },
      {
        "label": "Schan",
        "kind": "alias"
      }
    ],
    "tli": [
      {
        "label": "特林吉特语",
        "kind": "local"
      },
      {
        "label": "Tlingit",
        "kind": "english"
      }
    ],
    "sga": [
      {
        "label": "古爱尔兰语",
        "kind": "local"
      },
      {
        "label": "Old Irish",
        "kind": "english"
      },
      {
        "label": "ancien irlandais",
        "kind": "alias"
      },
      {
        "label": "irlandés antiguo",
        "kind": "alias"
      },
      {
        "label": "Altirisch",
        "kind": "alias"
      }
    ],
    "lbj": [
      {
        "label": "Ladakhi",
        "kind": "english"
      }
    ],
    "bhb": [
      {
        "label": "Bhili",
        "kind": "english"
      }
    ],
    "rar": [
      {
        "label": "拉罗汤加语",
        "kind": "local"
      },
      {
        "label": "Cook Islands Maori",
        "kind": "english"
      },
      {
        "label": "Rarotongan",
        "kind": "alias"
      },
      {
        "label": "rarotongien",
        "kind": "alias"
      },
      {
        "label": "rarotongano",
        "kind": "alias"
      },
      {
        "label": "Rarotonganisch",
        "kind": "alias"
      }
    ],
    "tkr": [
      {
        "label": "Tsakhur",
        "kind": "english"
      },
      {
        "label": "tsakhour",
        "kind": "alias"
      },
      {
        "label": "Tsachurisch",
        "kind": "alias"
      }
    ],
    "srh": [
      {
        "label": "Sarikoli",
        "kind": "english"
      }
    ],
    "uum": [
      {
        "label": "Urum",
        "kind": "english"
      }
    ],
    "sia": [
      {
        "label": "Akkala Sami",
        "kind": "english"
      }
    ],
    "ist": [
      {
        "label": "Istriot",
        "kind": "english"
      }
    ],
    "xld": [
      {
        "label": "Lydian",
        "kind": "english"
      }
    ],
    "lkt": [
      {
        "label": "拉科塔语",
        "kind": "local"
      },
      {
        "label": "Lakȟólʼiyapi",
        "kind": "native"
      },
      {
        "label": "Lakota",
        "kind": "english"
      }
    ],
    "kim": [
      {
        "label": "Tofa",
        "kind": "english"
      }
    ],
    "jrb": [
      {
        "label": "犹太阿拉伯语",
        "kind": "local"
      },
      {
        "label": "Judeo-Arabic",
        "kind": "english"
      },
      {
        "label": "judéo-arabe",
        "kind": "alias"
      },
      {
        "label": "judeo-árabe",
        "kind": "alias"
      },
      {
        "label": "Jüdisch-Arabisch",
        "kind": "alias"
      }
    ],
    "tzm": [
      {
        "label": "塔马齐格特语",
        "kind": "local"
      },
      {
        "label": "Tamaziɣt n laṭlaṣ",
        "kind": "native"
      },
      {
        "label": "Central Atlas Tamazight",
        "kind": "english"
      },
      {
        "label": "amazighe de l’Atlas central",
        "kind": "alias"
      },
      {
        "label": "tamazight del Atlas Central",
        "kind": "alias"
      },
      {
        "label": "Zentralatlas-Tamazight",
        "kind": "alias"
      }
    ],
    "arq": [
      {
        "label": "Algerian Arabic",
        "kind": "english"
      },
      {
        "label": "arabe algérien",
        "kind": "alias"
      },
      {
        "label": "Algerisches Arabisch",
        "kind": "alias"
      }
    ],
    "myp": [
      {
        "label": "Pirahã",
        "kind": "english"
      }
    ],
    "mey": [
      {
        "label": "Hassaniya Arabic",
        "kind": "english"
      }
    ],
    "tsg": [
      {
        "label": "Tausug",
        "kind": "english"
      }
    ],
    "rif": [
      {
        "label": "里夫语",
        "kind": "local"
      },
      {
        "label": "Tarifit",
        "kind": "english"
      },
      {
        "label": "Riffian",
        "kind": "alias"
      },
      {
        "label": "rifain",
        "kind": "alias"
      }
    ],
    "mrj": [
      {
        "label": "Hill Mari",
        "kind": "english"
      },
      {
        "label": "Western Mari",
        "kind": "alias"
      },
      {
        "label": "mari occidental",
        "kind": "alias"
      },
      {
        "label": "Bergmari",
        "kind": "alias"
      }
    ],
    "bft": [
      {
        "label": "Balti",
        "kind": "english"
      }
    ],
    "clw": [
      {
        "label": "Chulym",
        "kind": "english"
      }
    ],
    "jct": [
      {
        "label": "Krymchak",
        "kind": "english"
      }
    ],
    "udi": [
      {
        "label": "Udi",
        "kind": "english"
      }
    ],
    "sju": [
      {
        "label": "Ume Sami",
        "kind": "english"
      }
    ],
    "ruq": [
      {
        "label": "Megleno-Romanian",
        "kind": "english"
      }
    ],
    "xga": [
      {
        "label": "Galatian",
        "kind": "english"
      }
    ],
    "aib": [
      {
        "label": "Äynu",
        "kind": "english"
      }
    ],
    "ncs": [
      {
        "label": "Nicaraguan Sign Language",
        "kind": "english"
      }
    ],
    "afb": [
      {
        "label": "Gulf Arabic",
        "kind": "english"
      }
    ],
    "swg": [
      {
        "label": "Swabian",
        "kind": "english"
      }
    ],
    "eya": [
      {
        "label": "Eyak",
        "kind": "english"
      }
    ],
    "dar": [
      {
        "label": "达尔格瓦语",
        "kind": "local"
      },
      {
        "label": "Dargwa",
        "kind": "english"
      },
      {
        "label": "dargva",
        "kind": "alias"
      },
      {
        "label": "Darginisch",
        "kind": "alias"
      }
    ],
    "trp": [
      {
        "label": "Kokborok",
        "kind": "english"
      }
    ],
    "xlc": [
      {
        "label": "Lycian",
        "kind": "english"
      }
    ],
    "hoc": [
      {
        "label": "Ho",
        "kind": "english"
      }
    ],
    "pih": [
      {
        "label": "Pitkern",
        "kind": "english"
      }
    ],
    "xum": [
      {
        "label": "Umbrian",
        "kind": "english"
      }
    ],
    "din": [
      {
        "label": "丁卡语",
        "kind": "local"
      },
      {
        "label": "Dinka",
        "kind": "english"
      }
    ],
    "lif": [
      {
        "label": "Limbu",
        "kind": "english"
      }
    ],
    "lki": [
      {
        "label": "Laki",
        "kind": "english"
      }
    ],
    "ise": [
      {
        "label": "Italian Sign Language",
        "kind": "english"
      }
    ],
    "scl": [
      {
        "label": "Shina",
        "kind": "english"
      }
    ],
    "xeb": [
      {
        "label": "Eblaite",
        "kind": "english"
      }
    ],
    "xur": [
      {
        "label": "Urartian",
        "kind": "english"
      }
    ],
    "zkz": [
      {
        "label": "Khazar language",
        "kind": "english"
      }
    ],
    "gmy": [
      {
        "label": "Mycenaean Greek",
        "kind": "english"
      }
    ],
    "gmh": [
      {
        "label": "中古高地德语",
        "kind": "local"
      },
      {
        "label": "Middle High German",
        "kind": "english"
      },
      {
        "label": "moyen haut-allemand",
        "kind": "alias"
      },
      {
        "label": "alto alemán medio",
        "kind": "alias"
      },
      {
        "label": "Mittelhochdeutsch",
        "kind": "alias"
      }
    ],
    "aln": [
      {
        "label": "Gheg",
        "kind": "english"
      },
      {
        "label": "Gheg Albanian",
        "kind": "alias"
      },
      {
        "label": "guègue",
        "kind": "alias"
      },
      {
        "label": "Gegisch",
        "kind": "alias"
      }
    ],
    "alt": [
      {
        "label": "南阿尔泰语",
        "kind": "local"
      },
      {
        "label": "Southern Altai",
        "kind": "english"
      },
      {
        "label": "altaï du Sud",
        "kind": "alias"
      },
      {
        "label": "altái meridional",
        "kind": "alias"
      },
      {
        "label": "Süd-Altaisch",
        "kind": "alias"
      }
    ],
    "rhg": [
      {
        "label": "罗兴亚语",
        "kind": "local"
      },
      {
        "label": "Rohingya",
        "kind": "english"
      },
      {
        "label": "rohinyá",
        "kind": "alias"
      },
      {
        "label": "Rohingyalisch",
        "kind": "alias"
      }
    ],
    "lrl": [
      {
        "label": "Achomi",
        "kind": "english"
      }
    ],
    "tum": [
      {
        "label": "通布卡语",
        "kind": "local"
      },
      {
        "label": "Tumbuka",
        "kind": "english"
      }
    ],
    "bin": [
      {
        "label": "比尼语",
        "kind": "local"
      },
      {
        "label": "Edo",
        "kind": "english"
      },
      {
        "label": "Bini",
        "kind": "alias"
      }
    ],
    "bik": [
      {
        "label": "比科尔语",
        "kind": "local"
      },
      {
        "label": "Bikol",
        "kind": "english"
      },
      {
        "label": "bicol",
        "kind": "alias"
      }
    ],
    "iii": [
      {
        "label": "凉山彝语",
        "kind": "local"
      },
      {
        "label": "ꆈꌠꉙ",
        "kind": "native"
      },
      {
        "label": "Sichuan Yi",
        "kind": "english"
      },
      {
        "label": "yi du Sichuan",
        "kind": "alias"
      },
      {
        "label": "yi de Sichuán",
        "kind": "alias"
      },
      {
        "label": "Yi",
        "kind": "alias"
      },
      {
        "label": "nuosu",
        "kind": "alias"
      },
      {
        "label": "彝语",
        "kind": "alias"
      },
      {
        "label": "彝文",
        "kind": "alias"
      },
      {
        "label": "彝語",
        "kind": "alias"
      }
    ],
    "olo": [
      {
        "label": "Livvi-Karelian",
        "kind": "english"
      }
    ],
    "xsr": [
      {
        "label": "Sherpa",
        "kind": "english"
      }
    ],
    "umb": [
      {
        "label": "翁本杜语",
        "kind": "local"
      },
      {
        "label": "Umbundu",
        "kind": "english"
      }
    ],
    "acm": [
      {
        "label": "Iraqi Arabic",
        "kind": "english"
      }
    ],
    "sas": [
      {
        "label": "萨萨克语",
        "kind": "local"
      },
      {
        "label": "Sasak",
        "kind": "english"
      }
    ],
    "kua": [
      {
        "label": "宽亚玛语",
        "kind": "local"
      },
      {
        "label": "Kwanyama",
        "kind": "english"
      },
      {
        "label": "Kuanyama",
        "kind": "alias"
      }
    ]
  },
  "en-US": {
    "eng": [
      {
        "label": "English",
        "kind": "local"
      },
      {
        "label": "英语",
        "kind": "alias"
      },
      {
        "label": "anglais",
        "kind": "alias"
      },
      {
        "label": "inglés",
        "kind": "alias"
      },
      {
        "label": "Englisch",
        "kind": "alias"
      },
      {
        "label": "英文",
        "kind": "alias"
      },
      {
        "label": "英語",
        "kind": "alias"
      },
      {
        "label": "american english",
        "kind": "alias"
      },
      {
        "label": "british english",
        "kind": "alias"
      }
    ],
    "deu": [
      {
        "label": "German",
        "kind": "local"
      },
      {
        "label": "Deutsch",
        "kind": "native"
      },
      {
        "label": "德语",
        "kind": "alias"
      },
      {
        "label": "allemand",
        "kind": "alias"
      },
      {
        "label": "alemán",
        "kind": "alias"
      },
      {
        "label": "德文",
        "kind": "alias"
      },
      {
        "label": "德語",
        "kind": "alias"
      }
    ],
    "spa": [
      {
        "label": "Spanish",
        "kind": "local"
      },
      {
        "label": "español",
        "kind": "native"
      },
      {
        "label": "西班牙语",
        "kind": "alias"
      },
      {
        "label": "espagnol",
        "kind": "alias"
      },
      {
        "label": "Spanisch",
        "kind": "alias"
      },
      {
        "label": "西文",
        "kind": "alias"
      },
      {
        "label": "西語",
        "kind": "alias"
      },
      {
        "label": "castilian",
        "kind": "alias"
      },
      {
        "label": "castilian spanish",
        "kind": "alias"
      },
      {
        "label": "latin american spanish",
        "kind": "alias"
      },
      {
        "label": "mexican spanish",
        "kind": "alias"
      }
    ],
    "fra": [
      {
        "label": "French",
        "kind": "local"
      },
      {
        "label": "français",
        "kind": "native"
      },
      {
        "label": "法语",
        "kind": "alias"
      },
      {
        "label": "francés",
        "kind": "alias"
      },
      {
        "label": "Französisch",
        "kind": "alias"
      },
      {
        "label": "法文",
        "kind": "alias"
      },
      {
        "label": "法語",
        "kind": "alias"
      }
    ],
    "rus": [
      {
        "label": "Russian",
        "kind": "local"
      },
      {
        "label": "русский",
        "kind": "native"
      },
      {
        "label": "俄语",
        "kind": "alias"
      },
      {
        "label": "russe",
        "kind": "alias"
      },
      {
        "label": "ruso",
        "kind": "alias"
      },
      {
        "label": "Russisch",
        "kind": "alias"
      },
      {
        "label": "俄文",
        "kind": "alias"
      },
      {
        "label": "俄語",
        "kind": "alias"
      }
    ],
    "ara": [
      {
        "label": "Arabic",
        "kind": "local"
      },
      {
        "label": "العربية",
        "kind": "native"
      },
      {
        "label": "阿拉伯语",
        "kind": "alias"
      },
      {
        "label": "arabe",
        "kind": "alias"
      },
      {
        "label": "árabe",
        "kind": "alias"
      },
      {
        "label": "Arabisch",
        "kind": "alias"
      },
      {
        "label": "阿文",
        "kind": "alias"
      },
      {
        "label": "阿语",
        "kind": "alias"
      },
      {
        "label": "阿語",
        "kind": "alias"
      },
      {
        "label": "modern standard arabic",
        "kind": "alias"
      }
    ],
    "lat": [
      {
        "label": "Latin",
        "kind": "local"
      },
      {
        "label": "拉丁语",
        "kind": "alias"
      },
      {
        "label": "latín",
        "kind": "alias"
      },
      {
        "label": "Latein",
        "kind": "alias"
      }
    ],
    "ita": [
      {
        "label": "Italian",
        "kind": "local"
      },
      {
        "label": "italiano",
        "kind": "native"
      },
      {
        "label": "意大利语",
        "kind": "alias"
      },
      {
        "label": "italien",
        "kind": "alias"
      },
      {
        "label": "Italienisch",
        "kind": "alias"
      },
      {
        "label": "意文",
        "kind": "alias"
      },
      {
        "label": "意语",
        "kind": "alias"
      },
      {
        "label": "意語",
        "kind": "alias"
      }
    ],
    "jpn": [
      {
        "label": "Japanese",
        "kind": "local"
      },
      {
        "label": "日本語",
        "kind": "native"
      },
      {
        "label": "日语",
        "kind": "alias"
      },
      {
        "label": "japonais",
        "kind": "alias"
      },
      {
        "label": "japonés",
        "kind": "alias"
      },
      {
        "label": "Japanisch",
        "kind": "alias"
      },
      {
        "label": "日文",
        "kind": "alias"
      },
      {
        "label": "日語",
        "kind": "alias"
      }
    ],
    "por": [
      {
        "label": "Portuguese",
        "kind": "local"
      },
      {
        "label": "português",
        "kind": "native"
      },
      {
        "label": "葡萄牙语",
        "kind": "alias"
      },
      {
        "label": "portugais",
        "kind": "alias"
      },
      {
        "label": "portugués",
        "kind": "alias"
      },
      {
        "label": "Portugiesisch",
        "kind": "alias"
      },
      {
        "label": "葡文",
        "kind": "alias"
      },
      {
        "label": "葡语",
        "kind": "alias"
      },
      {
        "label": "葡語",
        "kind": "alias"
      },
      {
        "label": "brazilian portuguese",
        "kind": "alias"
      },
      {
        "label": "european portuguese",
        "kind": "alias"
      }
    ],
    "epo": [
      {
        "label": "Esperanto",
        "kind": "local"
      },
      {
        "label": "世界语",
        "kind": "alias"
      },
      {
        "label": "espéranto",
        "kind": "alias"
      }
    ],
    "fas": [
      {
        "label": "Persian",
        "kind": "local"
      },
      {
        "label": "فارسی",
        "kind": "native"
      },
      {
        "label": "波斯语",
        "kind": "alias"
      },
      {
        "label": "persan",
        "kind": "alias"
      },
      {
        "label": "persa",
        "kind": "alias"
      },
      {
        "label": "Persisch",
        "kind": "alias"
      },
      {
        "label": "波斯文",
        "kind": "alias"
      },
      {
        "label": "波斯語",
        "kind": "alias"
      },
      {
        "label": "法尔西",
        "kind": "alias"
      },
      {
        "label": "法爾西",
        "kind": "alias"
      },
      {
        "label": "farsi",
        "kind": "alias"
      },
      {
        "label": "persian farsi",
        "kind": "alias"
      }
    ],
    "zho": [
      {
        "label": "Chinese",
        "kind": "local"
      },
      {
        "label": "中文",
        "kind": "native"
      },
      {
        "label": "chinois",
        "kind": "alias"
      },
      {
        "label": "chino",
        "kind": "alias"
      },
      {
        "label": "Chinesisch",
        "kind": "alias"
      },
      {
        "label": "汉文",
        "kind": "alias"
      },
      {
        "label": "漢文",
        "kind": "alias"
      },
      {
        "label": "华文",
        "kind": "alias"
      },
      {
        "label": "華文",
        "kind": "alias"
      }
    ],
    "heb": [
      {
        "label": "Hebrew",
        "kind": "local"
      },
      {
        "label": "עברית",
        "kind": "native"
      },
      {
        "label": "希伯来语",
        "kind": "alias"
      },
      {
        "label": "hébreu",
        "kind": "alias"
      },
      {
        "label": "hebreo",
        "kind": "alias"
      },
      {
        "label": "Hebräisch",
        "kind": "alias"
      },
      {
        "label": "希伯来文",
        "kind": "alias"
      },
      {
        "label": "希伯來文",
        "kind": "alias"
      }
    ],
    "nld": [
      {
        "label": "Dutch",
        "kind": "local"
      },
      {
        "label": "Nederlands",
        "kind": "native"
      },
      {
        "label": "荷兰语",
        "kind": "alias"
      },
      {
        "label": "néerlandais",
        "kind": "alias"
      },
      {
        "label": "neerlandés",
        "kind": "alias"
      },
      {
        "label": "Niederländisch",
        "kind": "alias"
      },
      {
        "label": "荷文",
        "kind": "alias"
      },
      {
        "label": "荷语",
        "kind": "alias"
      },
      {
        "label": "荷語",
        "kind": "alias"
      },
      {
        "label": "flemish",
        "kind": "alias"
      }
    ],
    "pol": [
      {
        "label": "Polish",
        "kind": "local"
      },
      {
        "label": "polski",
        "kind": "native"
      },
      {
        "label": "波兰语",
        "kind": "alias"
      },
      {
        "label": "polonais",
        "kind": "alias"
      },
      {
        "label": "polaco",
        "kind": "alias"
      },
      {
        "label": "Polnisch",
        "kind": "alias"
      },
      {
        "label": "波文",
        "kind": "alias"
      },
      {
        "label": "波语",
        "kind": "alias"
      },
      {
        "label": "波語",
        "kind": "alias"
      }
    ],
    "swe": [
      {
        "label": "Swedish",
        "kind": "local"
      },
      {
        "label": "svenska",
        "kind": "native"
      },
      {
        "label": "瑞典语",
        "kind": "alias"
      },
      {
        "label": "suédois",
        "kind": "alias"
      },
      {
        "label": "sueco",
        "kind": "alias"
      },
      {
        "label": "Schwedisch",
        "kind": "alias"
      }
    ],
    "tur": [
      {
        "label": "Turkish",
        "kind": "local"
      },
      {
        "label": "Türkçe",
        "kind": "native"
      },
      {
        "label": "土耳其语",
        "kind": "alias"
      },
      {
        "label": "turc",
        "kind": "alias"
      },
      {
        "label": "turco",
        "kind": "alias"
      },
      {
        "label": "Türkisch",
        "kind": "alias"
      },
      {
        "label": "土文",
        "kind": "alias"
      },
      {
        "label": "土语",
        "kind": "alias"
      },
      {
        "label": "土語",
        "kind": "alias"
      }
    ],
    "ukr": [
      {
        "label": "Ukrainian",
        "kind": "local"
      },
      {
        "label": "українська",
        "kind": "native"
      },
      {
        "label": "乌克兰语",
        "kind": "alias"
      },
      {
        "label": "ukrainien",
        "kind": "alias"
      },
      {
        "label": "ucraniano",
        "kind": "alias"
      },
      {
        "label": "Ukrainisch",
        "kind": "alias"
      }
    ],
    "fin": [
      {
        "label": "Finnish",
        "kind": "local"
      },
      {
        "label": "suomi",
        "kind": "native"
      },
      {
        "label": "芬兰语",
        "kind": "alias"
      },
      {
        "label": "finnois",
        "kind": "alias"
      },
      {
        "label": "finés",
        "kind": "alias"
      },
      {
        "label": "Finnisch",
        "kind": "alias"
      }
    ],
    "kor": [
      {
        "label": "Korean",
        "kind": "local"
      },
      {
        "label": "한국어",
        "kind": "native"
      },
      {
        "label": "韩语",
        "kind": "alias"
      },
      {
        "label": "coréen",
        "kind": "alias"
      },
      {
        "label": "coreano",
        "kind": "alias"
      },
      {
        "label": "Koreanisch",
        "kind": "alias"
      },
      {
        "label": "韩文",
        "kind": "alias"
      },
      {
        "label": "韓文",
        "kind": "alias"
      },
      {
        "label": "韩国语",
        "kind": "alias"
      },
      {
        "label": "朝鲜语",
        "kind": "alias"
      },
      {
        "label": "朝鮮文",
        "kind": "alias"
      },
      {
        "label": "韓語",
        "kind": "alias"
      }
    ],
    "san": [
      {
        "label": "Sanskrit",
        "kind": "local"
      },
      {
        "label": "संस्कृत भाषा",
        "kind": "native"
      },
      {
        "label": "梵语",
        "kind": "alias"
      },
      {
        "label": "sánscrito",
        "kind": "alias"
      }
    ],
    "ces": [
      {
        "label": "Czech",
        "kind": "local"
      },
      {
        "label": "čeština",
        "kind": "native"
      },
      {
        "label": "捷克语",
        "kind": "alias"
      },
      {
        "label": "tchèque",
        "kind": "alias"
      },
      {
        "label": "checo",
        "kind": "alias"
      },
      {
        "label": "Tschechisch",
        "kind": "alias"
      }
    ],
    "cat": [
      {
        "label": "Catalan",
        "kind": "local"
      },
      {
        "label": "català",
        "kind": "native"
      },
      {
        "label": "加泰罗尼亚语",
        "kind": "alias"
      },
      {
        "label": "catalán",
        "kind": "alias"
      },
      {
        "label": "Katalanisch",
        "kind": "alias"
      }
    ],
    "dan": [
      {
        "label": "Danish",
        "kind": "local"
      },
      {
        "label": "dansk",
        "kind": "native"
      },
      {
        "label": "丹麦语",
        "kind": "alias"
      },
      {
        "label": "danois",
        "kind": "alias"
      },
      {
        "label": "danés",
        "kind": "alias"
      },
      {
        "label": "Dänisch",
        "kind": "alias"
      }
    ],
    "ron": [
      {
        "label": "Romanian",
        "kind": "local"
      },
      {
        "label": "română",
        "kind": "native"
      },
      {
        "label": "罗马尼亚语",
        "kind": "alias"
      },
      {
        "label": "roumain",
        "kind": "alias"
      },
      {
        "label": "rumano",
        "kind": "alias"
      },
      {
        "label": "Rumänisch",
        "kind": "alias"
      }
    ],
    "swa": [
      {
        "label": "Swahili",
        "kind": "local"
      },
      {
        "label": "Kiswahili",
        "kind": "native"
      },
      {
        "label": "斯瓦希里语",
        "kind": "alias"
      },
      {
        "label": "suajili",
        "kind": "alias"
      },
      {
        "label": "Suaheli",
        "kind": "alias"
      }
    ],
    "hun": [
      {
        "label": "Hungarian",
        "kind": "local"
      },
      {
        "label": "magyar",
        "kind": "native"
      },
      {
        "label": "匈牙利语",
        "kind": "alias"
      },
      {
        "label": "hongrois",
        "kind": "alias"
      },
      {
        "label": "húngaro",
        "kind": "alias"
      },
      {
        "label": "Ungarisch",
        "kind": "alias"
      }
    ],
    "syl": [
      {
        "label": "Sylheti",
        "kind": "english"
      }
    ],
    "hrv": [
      {
        "label": "Croatian",
        "kind": "local"
      },
      {
        "label": "hrvatski",
        "kind": "native"
      },
      {
        "label": "克罗地亚语",
        "kind": "alias"
      },
      {
        "label": "croate",
        "kind": "alias"
      },
      {
        "label": "croata",
        "kind": "alias"
      },
      {
        "label": "Kroatisch",
        "kind": "alias"
      }
    ],
    "nor": [
      {
        "label": "Norwegian",
        "kind": "local"
      },
      {
        "label": "norsk",
        "kind": "native"
      },
      {
        "label": "挪威语",
        "kind": "alias"
      },
      {
        "label": "norvégien",
        "kind": "alias"
      },
      {
        "label": "noruego",
        "kind": "alias"
      },
      {
        "label": "Norwegisch",
        "kind": "alias"
      }
    ],
    "ben": [
      {
        "label": "Bangla",
        "kind": "local"
      },
      {
        "label": "বাংলা",
        "kind": "native"
      },
      {
        "label": "孟加拉语",
        "kind": "alias"
      },
      {
        "label": "bengali",
        "kind": "alias"
      },
      {
        "label": "bengalí",
        "kind": "alias"
      },
      {
        "label": "Bengalisch",
        "kind": "alias"
      },
      {
        "label": "孟加拉文",
        "kind": "alias"
      },
      {
        "label": "孟加拉語",
        "kind": "alias"
      }
    ],
    "aze": [
      {
        "label": "Azerbaijani",
        "kind": "local"
      },
      {
        "label": "azərbaycan",
        "kind": "native"
      },
      {
        "label": "阿塞拜疆语",
        "kind": "alias"
      },
      {
        "label": "azerbaïdjanais",
        "kind": "alias"
      },
      {
        "label": "azerbaiyano",
        "kind": "alias"
      },
      {
        "label": "Aserbaidschanisch",
        "kind": "alias"
      }
    ],
    "afr": [
      {
        "label": "Afrikaans",
        "kind": "local"
      },
      {
        "label": "南非荷兰语",
        "kind": "alias"
      },
      {
        "label": "afrikáans",
        "kind": "alias"
      }
    ],
    "est": [
      {
        "label": "Estonian",
        "kind": "local"
      },
      {
        "label": "eesti",
        "kind": "native"
      },
      {
        "label": "爱沙尼亚语",
        "kind": "alias"
      },
      {
        "label": "estonien",
        "kind": "alias"
      },
      {
        "label": "estonio",
        "kind": "alias"
      },
      {
        "label": "Estnisch",
        "kind": "alias"
      }
    ],
    "bul": [
      {
        "label": "Bulgarian",
        "kind": "local"
      },
      {
        "label": "български",
        "kind": "native"
      },
      {
        "label": "保加利亚语",
        "kind": "alias"
      },
      {
        "label": "bulgare",
        "kind": "alias"
      },
      {
        "label": "búlgaro",
        "kind": "alias"
      },
      {
        "label": "Bulgarisch",
        "kind": "alias"
      }
    ],
    "gle": [
      {
        "label": "Irish",
        "kind": "local"
      },
      {
        "label": "Gaeilge",
        "kind": "native"
      },
      {
        "label": "爱尔兰语",
        "kind": "alias"
      },
      {
        "label": "irlandais",
        "kind": "alias"
      },
      {
        "label": "irlandés",
        "kind": "alias"
      },
      {
        "label": "Irisch",
        "kind": "alias"
      }
    ],
    "bel": [
      {
        "label": "Belarusian",
        "kind": "local"
      },
      {
        "label": "беларуская",
        "kind": "native"
      },
      {
        "label": "白俄罗斯语",
        "kind": "alias"
      },
      {
        "label": "biélorusse",
        "kind": "alias"
      },
      {
        "label": "bielorruso",
        "kind": "alias"
      },
      {
        "label": "Belarussisch",
        "kind": "alias"
      }
    ],
    "ind": [
      {
        "label": "Indonesian",
        "kind": "local"
      },
      {
        "label": "Bahasa Indonesia",
        "kind": "native"
      },
      {
        "label": "印度尼西亚语",
        "kind": "alias"
      },
      {
        "label": "indonésien",
        "kind": "alias"
      },
      {
        "label": "indonesio",
        "kind": "alias"
      },
      {
        "label": "Indonesisch",
        "kind": "alias"
      },
      {
        "label": "印尼文",
        "kind": "alias"
      },
      {
        "label": "印尼语",
        "kind": "alias"
      },
      {
        "label": "印尼語",
        "kind": "alias"
      }
    ],
    "isl": [
      {
        "label": "Icelandic",
        "kind": "local"
      },
      {
        "label": "íslenska",
        "kind": "native"
      },
      {
        "label": "冰岛语",
        "kind": "alias"
      },
      {
        "label": "islandais",
        "kind": "alias"
      },
      {
        "label": "islandés",
        "kind": "alias"
      },
      {
        "label": "Isländisch",
        "kind": "alias"
      }
    ],
    "lit": [
      {
        "label": "Lithuanian",
        "kind": "local"
      },
      {
        "label": "lietuvių",
        "kind": "native"
      },
      {
        "label": "立陶宛语",
        "kind": "alias"
      },
      {
        "label": "lituanien",
        "kind": "alias"
      },
      {
        "label": "lituano",
        "kind": "alias"
      },
      {
        "label": "Litauisch",
        "kind": "alias"
      }
    ],
    "ile": [
      {
        "label": "Interlingue",
        "kind": "local"
      },
      {
        "label": "国际文字（E）",
        "kind": "alias"
      }
    ],
    "hye": [
      {
        "label": "Armenian",
        "kind": "local"
      },
      {
        "label": "հայերեն",
        "kind": "native"
      },
      {
        "label": "亚美尼亚语",
        "kind": "alias"
      },
      {
        "label": "arménien",
        "kind": "alias"
      },
      {
        "label": "armenio",
        "kind": "alias"
      },
      {
        "label": "Armenisch",
        "kind": "alias"
      }
    ],
    "slk": [
      {
        "label": "Slovak",
        "kind": "local"
      },
      {
        "label": "slovenčina",
        "kind": "native"
      },
      {
        "label": "斯洛伐克语",
        "kind": "alias"
      },
      {
        "label": "slovaque",
        "kind": "alias"
      },
      {
        "label": "eslovaco",
        "kind": "alias"
      },
      {
        "label": "Slowakisch",
        "kind": "alias"
      }
    ],
    "tam": [
      {
        "label": "Tamil",
        "kind": "local"
      },
      {
        "label": "தமிழ்",
        "kind": "native"
      },
      {
        "label": "泰米尔语",
        "kind": "alias"
      },
      {
        "label": "tamoul",
        "kind": "alias"
      }
    ],
    "sqi": [
      {
        "label": "Albanian",
        "kind": "local"
      },
      {
        "label": "shqip",
        "kind": "native"
      },
      {
        "label": "阿尔巴尼亚语",
        "kind": "alias"
      },
      {
        "label": "albanais",
        "kind": "alias"
      },
      {
        "label": "albanés",
        "kind": "alias"
      },
      {
        "label": "Albanisch",
        "kind": "alias"
      }
    ],
    "eus": [
      {
        "label": "Basque",
        "kind": "local"
      },
      {
        "label": "euskara",
        "kind": "native"
      },
      {
        "label": "巴斯克语",
        "kind": "alias"
      },
      {
        "label": "euskera",
        "kind": "alias"
      },
      {
        "label": "Baskisch",
        "kind": "alias"
      }
    ],
    "kat": [
      {
        "label": "Georgian",
        "kind": "local"
      },
      {
        "label": "ქართული",
        "kind": "native"
      },
      {
        "label": "格鲁吉亚语",
        "kind": "alias"
      },
      {
        "label": "géorgien",
        "kind": "alias"
      },
      {
        "label": "georgiano",
        "kind": "alias"
      },
      {
        "label": "Georgisch",
        "kind": "alias"
      }
    ],
    "srp": [
      {
        "label": "Serbian",
        "kind": "local"
      },
      {
        "label": "српски",
        "kind": "native"
      },
      {
        "label": "塞尔维亚语",
        "kind": "alias"
      },
      {
        "label": "serbe",
        "kind": "alias"
      },
      {
        "label": "serbio",
        "kind": "alias"
      },
      {
        "label": "Serbisch",
        "kind": "alias"
      }
    ],
    "lav": [
      {
        "label": "Latvian",
        "kind": "local"
      },
      {
        "label": "latviešu",
        "kind": "native"
      },
      {
        "label": "拉脱维亚语",
        "kind": "alias"
      },
      {
        "label": "letton",
        "kind": "alias"
      },
      {
        "label": "letón",
        "kind": "alias"
      },
      {
        "label": "Lettisch",
        "kind": "alias"
      }
    ],
    "tha": [
      {
        "label": "Thai",
        "kind": "local"
      },
      {
        "label": "ไทย",
        "kind": "native"
      },
      {
        "label": "泰语",
        "kind": "alias"
      },
      {
        "label": "thaï",
        "kind": "alias"
      },
      {
        "label": "tailandés",
        "kind": "alias"
      },
      {
        "label": "Thailändisch",
        "kind": "alias"
      },
      {
        "label": "泰文",
        "kind": "alias"
      },
      {
        "label": "泰語",
        "kind": "alias"
      }
    ],
    "slv": [
      {
        "label": "Slovenian",
        "kind": "local"
      },
      {
        "label": "slovenščina",
        "kind": "native"
      },
      {
        "label": "Slovene",
        "kind": "english"
      },
      {
        "label": "斯洛文尼亚语",
        "kind": "alias"
      },
      {
        "label": "slovène",
        "kind": "alias"
      },
      {
        "label": "esloveno",
        "kind": "alias"
      },
      {
        "label": "Slowenisch",
        "kind": "alias"
      }
    ],
    "vie": [
      {
        "label": "Vietnamese",
        "kind": "local"
      },
      {
        "label": "Tiếng Việt",
        "kind": "native"
      },
      {
        "label": "越南语",
        "kind": "alias"
      },
      {
        "label": "vietnamien",
        "kind": "alias"
      },
      {
        "label": "vietnamita",
        "kind": "alias"
      },
      {
        "label": "Vietnamesisch",
        "kind": "alias"
      },
      {
        "label": "越文",
        "kind": "alias"
      },
      {
        "label": "越語",
        "kind": "alias"
      }
    ],
    "oci": [
      {
        "label": "Occitan",
        "kind": "local"
      },
      {
        "label": "奥克语",
        "kind": "alias"
      },
      {
        "label": "occitano",
        "kind": "alias"
      },
      {
        "label": "Okzitanisch",
        "kind": "alias"
      }
    ],
    "kaz": [
      {
        "label": "Kazakh",
        "kind": "local"
      },
      {
        "label": "қазақ тілі",
        "kind": "native"
      },
      {
        "label": "哈萨克语",
        "kind": "alias"
      },
      {
        "label": "kazajo",
        "kind": "alias"
      },
      {
        "label": "Kasachisch",
        "kind": "alias"
      },
      {
        "label": "哈薩克語",
        "kind": "alias"
      }
    ],
    "cym": [
      {
        "label": "Welsh",
        "kind": "local"
      },
      {
        "label": "Cymraeg",
        "kind": "native"
      },
      {
        "label": "威尔士语",
        "kind": "alias"
      },
      {
        "label": "gallois",
        "kind": "alias"
      },
      {
        "label": "galés",
        "kind": "alias"
      },
      {
        "label": "Walisisch",
        "kind": "alias"
      }
    ],
    "msa": [
      {
        "label": "Malay",
        "kind": "local"
      },
      {
        "label": "Melayu",
        "kind": "native"
      },
      {
        "label": "马来语",
        "kind": "alias"
      },
      {
        "label": "malais",
        "kind": "alias"
      },
      {
        "label": "malayo",
        "kind": "alias"
      },
      {
        "label": "Malaiisch",
        "kind": "alias"
      },
      {
        "label": "马来文",
        "kind": "alias"
      },
      {
        "label": "马来话",
        "kind": "alias"
      },
      {
        "label": "馬來文",
        "kind": "alias"
      },
      {
        "label": "馬來話",
        "kind": "alias"
      },
      {
        "label": "bahasa melayu",
        "kind": "alias"
      }
    ],
    "ina": [
      {
        "label": "Interlingua",
        "kind": "local"
      },
      {
        "label": "Interlingua (International Auxiliary Language Association)",
        "kind": "english"
      },
      {
        "label": "国际语",
        "kind": "alias"
      }
    ],
    "yid": [
      {
        "label": "Yiddish",
        "kind": "local"
      },
      {
        "label": "ייִדיש",
        "kind": "native"
      },
      {
        "label": "意第绪语",
        "kind": "alias"
      },
      {
        "label": "yidis",
        "kind": "alias"
      },
      {
        "label": "Jiddisch",
        "kind": "alias"
      }
    ],
    "mkd": [
      {
        "label": "Macedonian",
        "kind": "local"
      },
      {
        "label": "македонски",
        "kind": "native"
      },
      {
        "label": "马其顿语",
        "kind": "alias"
      },
      {
        "label": "macédonien",
        "kind": "alias"
      },
      {
        "label": "macedonio",
        "kind": "alias"
      },
      {
        "label": "Mazedonisch",
        "kind": "alias"
      }
    ],
    "grc": [
      {
        "label": "Ancient Greek",
        "kind": "local"
      },
      {
        "label": "古希腊语",
        "kind": "alias"
      },
      {
        "label": "grec ancien",
        "kind": "alias"
      },
      {
        "label": "griego antiguo",
        "kind": "alias"
      },
      {
        "label": "Altgriechisch",
        "kind": "alias"
      }
    ],
    "kur": [
      {
        "label": "Kurdish",
        "kind": "local"
      },
      {
        "label": "Kurdî",
        "kind": "native"
      },
      {
        "label": "库尔德语",
        "kind": "alias"
      },
      {
        "label": "kurde",
        "kind": "alias"
      },
      {
        "label": "kurdo",
        "kind": "alias"
      },
      {
        "label": "Kurdisch",
        "kind": "alias"
      }
    ],
    "lfn": [
      {
        "label": "Lingua Franca Nova",
        "kind": "local"
      }
    ],
    "mon": [
      {
        "label": "Mongolian",
        "kind": "local"
      },
      {
        "label": "монгол",
        "kind": "native"
      },
      {
        "label": "蒙古语",
        "kind": "alias"
      },
      {
        "label": "mongol",
        "kind": "alias"
      },
      {
        "label": "Mongolisch",
        "kind": "alias"
      },
      {
        "label": "蒙古文",
        "kind": "alias"
      },
      {
        "label": "蒙古語",
        "kind": "alias"
      },
      {
        "label": "蒙古話",
        "kind": "alias"
      }
    ],
    "ido": [
      {
        "label": "Ido",
        "kind": "local"
      },
      {
        "label": "伊多语",
        "kind": "alias"
      }
    ],
    "glg": [
      {
        "label": "Galician",
        "kind": "local"
      },
      {
        "label": "galego",
        "kind": "native"
      },
      {
        "label": "加利西亚语",
        "kind": "alias"
      },
      {
        "label": "galicien",
        "kind": "alias"
      },
      {
        "label": "gallego",
        "kind": "alias"
      },
      {
        "label": "Galicisch",
        "kind": "alias"
      }
    ],
    "tel": [
      {
        "label": "Telugu",
        "kind": "local"
      },
      {
        "label": "తెలుగు",
        "kind": "native"
      },
      {
        "label": "泰卢固语",
        "kind": "alias"
      },
      {
        "label": "télougou",
        "kind": "alias"
      }
    ],
    "mlt": [
      {
        "label": "Maltese",
        "kind": "local"
      },
      {
        "label": "Malti",
        "kind": "native"
      },
      {
        "label": "马耳他语",
        "kind": "alias"
      },
      {
        "label": "maltais",
        "kind": "alias"
      },
      {
        "label": "maltés",
        "kind": "alias"
      },
      {
        "label": "Maltesisch",
        "kind": "alias"
      }
    ],
    "pus": [
      {
        "label": "Pashto",
        "kind": "local"
      },
      {
        "label": "پښتو",
        "kind": "native"
      },
      {
        "label": "普什图语",
        "kind": "alias"
      },
      {
        "label": "pachto",
        "kind": "alias"
      },
      {
        "label": "pastún",
        "kind": "alias"
      },
      {
        "label": "Paschtu",
        "kind": "alias"
      }
    ],
    "tat": [
      {
        "label": "Tatar",
        "kind": "local"
      },
      {
        "label": "татар",
        "kind": "native"
      },
      {
        "label": "鞑靼语",
        "kind": "alias"
      },
      {
        "label": "tártaro",
        "kind": "alias"
      },
      {
        "label": "Tatarisch",
        "kind": "alias"
      }
    ],
    "pan": [
      {
        "label": "Punjabi",
        "kind": "local"
      },
      {
        "label": "ਪੰਜਾਬੀ",
        "kind": "native"
      },
      {
        "label": "旁遮普语",
        "kind": "alias"
      },
      {
        "label": "pendjabi",
        "kind": "alias"
      },
      {
        "label": "punyabí",
        "kind": "alias"
      },
      {
        "label": "旁遮普文",
        "kind": "alias"
      },
      {
        "label": "旁遮普語",
        "kind": "alias"
      }
    ],
    "uzb": [
      {
        "label": "Uzbek",
        "kind": "local"
      },
      {
        "label": "o‘zbek",
        "kind": "native"
      },
      {
        "label": "乌兹别克语",
        "kind": "alias"
      },
      {
        "label": "ouzbek",
        "kind": "alias"
      },
      {
        "label": "uzbeko",
        "kind": "alias"
      },
      {
        "label": "Usbekisch",
        "kind": "alias"
      }
    ],
    "ltz": [
      {
        "label": "Luxembourgish",
        "kind": "local"
      },
      {
        "label": "Lëtzebuergesch",
        "kind": "native"
      },
      {
        "label": "卢森堡语",
        "kind": "alias"
      },
      {
        "label": "luxembourgeois",
        "kind": "alias"
      },
      {
        "label": "luxemburgués",
        "kind": "alias"
      },
      {
        "label": "Luxemburgisch",
        "kind": "alias"
      }
    ],
    "nep": [
      {
        "label": "Nepali",
        "kind": "local"
      },
      {
        "label": "नेपाली",
        "kind": "native"
      },
      {
        "label": "尼泊尔语",
        "kind": "alias"
      },
      {
        "label": "népalais",
        "kind": "alias"
      },
      {
        "label": "nepalí",
        "kind": "alias"
      },
      {
        "label": "Nepalesisch",
        "kind": "alias"
      },
      {
        "label": "尼泊尔文",
        "kind": "alias"
      },
      {
        "label": "尼泊爾文",
        "kind": "alias"
      }
    ],
    "gla": [
      {
        "label": "Scottish Gaelic",
        "kind": "local"
      },
      {
        "label": "Gàidhlig",
        "kind": "native"
      },
      {
        "label": "苏格兰盖尔语",
        "kind": "alias"
      },
      {
        "label": "gaélique écossais",
        "kind": "alias"
      },
      {
        "label": "gaélico escocés",
        "kind": "alias"
      },
      {
        "label": "Gälisch (Schottland)",
        "kind": "alias"
      }
    ],
    "bre": [
      {
        "label": "Breton",
        "kind": "local"
      },
      {
        "label": "brezhoneg",
        "kind": "native"
      },
      {
        "label": "布列塔尼语",
        "kind": "alias"
      },
      {
        "label": "bretón",
        "kind": "alias"
      },
      {
        "label": "Bretonisch",
        "kind": "alias"
      }
    ],
    "cmn": [
      {
        "label": "Mandarin",
        "kind": "local"
      },
      {
        "label": "普通话",
        "kind": "native"
      },
      {
        "label": "mandarín",
        "kind": "alias"
      },
      {
        "label": "中文",
        "kind": "alias"
      },
      {
        "label": "chinese",
        "kind": "alias"
      },
      {
        "label": "mandarin chinese",
        "kind": "alias"
      },
      {
        "label": "standard chinese",
        "kind": "alias"
      },
      {
        "label": "putonghua",
        "kind": "alias"
      },
      {
        "label": "guoyu",
        "kind": "alias"
      },
      {
        "label": "汉语",
        "kind": "alias"
      },
      {
        "label": "国语",
        "kind": "alias"
      },
      {
        "label": "國語",
        "kind": "alias"
      },
      {
        "label": "华语",
        "kind": "alias"
      },
      {
        "label": "華語",
        "kind": "alias"
      },
      {
        "label": "官话",
        "kind": "alias"
      },
      {
        "label": "北方话",
        "kind": "alias"
      },
      {
        "label": "北方方言",
        "kind": "alias"
      },
      {
        "label": "中文普通话",
        "kind": "alias"
      }
    ],
    "kir": [
      {
        "label": "Kyrgyz",
        "kind": "local"
      },
      {
        "label": "кыргызча",
        "kind": "native"
      },
      {
        "label": "吉尔吉斯语",
        "kind": "alias"
      },
      {
        "label": "kirghize",
        "kind": "alias"
      },
      {
        "label": "kirguís",
        "kind": "alias"
      },
      {
        "label": "Kirgisisch",
        "kind": "alias"
      },
      {
        "label": "柯尔克孜语",
        "kind": "alias"
      },
      {
        "label": "柯爾克孜語",
        "kind": "alias"
      },
      {
        "label": "吉爾吉斯語",
        "kind": "alias"
      }
    ],
    "fao": [
      {
        "label": "Faroese",
        "kind": "local"
      },
      {
        "label": "føroyskt",
        "kind": "native"
      },
      {
        "label": "法罗语",
        "kind": "alias"
      },
      {
        "label": "féroïen",
        "kind": "alias"
      },
      {
        "label": "feroés",
        "kind": "alias"
      },
      {
        "label": "Färöisch",
        "kind": "alias"
      }
    ],
    "amh": [
      {
        "label": "Amharic",
        "kind": "local"
      },
      {
        "label": "አማርኛ",
        "kind": "native"
      },
      {
        "label": "阿姆哈拉语",
        "kind": "alias"
      },
      {
        "label": "amharique",
        "kind": "alias"
      },
      {
        "label": "amárico",
        "kind": "alias"
      },
      {
        "label": "Amharisch",
        "kind": "alias"
      },
      {
        "label": "阿姆哈拉文",
        "kind": "alias"
      },
      {
        "label": "阿姆哈拉語",
        "kind": "alias"
      }
    ],
    "kan": [
      {
        "label": "Kannada",
        "kind": "local"
      },
      {
        "label": "ಕನ್ನಡ",
        "kind": "native"
      },
      {
        "label": "卡纳达语",
        "kind": "alias"
      },
      {
        "label": "canarés",
        "kind": "alias"
      }
    ],
    "mar": [
      {
        "label": "Marathi",
        "kind": "local"
      },
      {
        "label": "मराठी",
        "kind": "native"
      },
      {
        "label": "马拉地语",
        "kind": "alias"
      },
      {
        "label": "maratí",
        "kind": "alias"
      }
    ],
    "tgl": [
      {
        "label": "Tagalog",
        "kind": "local"
      },
      {
        "label": "他加禄语",
        "kind": "alias"
      },
      {
        "label": "tagalo",
        "kind": "alias"
      },
      {
        "label": "他加禄文",
        "kind": "alias"
      },
      {
        "label": "他加祿文",
        "kind": "alias"
      }
    ],
    "roh": [
      {
        "label": "Romansh",
        "kind": "local"
      },
      {
        "label": "rumantsch",
        "kind": "native"
      },
      {
        "label": "罗曼什语",
        "kind": "alias"
      },
      {
        "label": "romanche",
        "kind": "alias"
      },
      {
        "label": "Rätoromanisch",
        "kind": "alias"
      }
    ],
    "bak": [
      {
        "label": "Bashkir",
        "kind": "local"
      },
      {
        "label": "巴什基尔语",
        "kind": "alias"
      },
      {
        "label": "bachkir",
        "kind": "alias"
      },
      {
        "label": "baskir",
        "kind": "alias"
      },
      {
        "label": "Baschkirisch",
        "kind": "alias"
      }
    ],
    "mal": [
      {
        "label": "Malayalam",
        "kind": "local"
      },
      {
        "label": "മലയാളം",
        "kind": "native"
      },
      {
        "label": "马拉雅拉姆语",
        "kind": "alias"
      },
      {
        "label": "malayálam",
        "kind": "alias"
      }
    ],
    "mya": [
      {
        "label": "Burmese",
        "kind": "local"
      },
      {
        "label": "မြန်မာ",
        "kind": "native"
      },
      {
        "label": "缅甸语",
        "kind": "alias"
      },
      {
        "label": "birman",
        "kind": "alias"
      },
      {
        "label": "birmano",
        "kind": "alias"
      },
      {
        "label": "Birmanisch",
        "kind": "alias"
      },
      {
        "label": "缅语",
        "kind": "alias"
      },
      {
        "label": "缅文",
        "kind": "alias"
      },
      {
        "label": "緬語",
        "kind": "alias"
      },
      {
        "label": "緬文",
        "kind": "alias"
      }
    ],
    "que": [
      {
        "label": "Quechua",
        "kind": "local"
      },
      {
        "label": "Runasimi",
        "kind": "native"
      },
      {
        "label": "克丘亚语",
        "kind": "alias"
      }
    ],
    "jav": [
      {
        "label": "Javanese",
        "kind": "local"
      },
      {
        "label": "Jawa",
        "kind": "native"
      },
      {
        "label": "爪哇语",
        "kind": "alias"
      },
      {
        "label": "javanais",
        "kind": "alias"
      },
      {
        "label": "javanés",
        "kind": "alias"
      },
      {
        "label": "Javanisch",
        "kind": "alias"
      }
    ],
    "uig": [
      {
        "label": "Uyghur",
        "kind": "local"
      },
      {
        "label": "ئۇيغۇرچە",
        "kind": "native"
      },
      {
        "label": "维吾尔语",
        "kind": "alias"
      },
      {
        "label": "ouïghour",
        "kind": "alias"
      },
      {
        "label": "uigur",
        "kind": "alias"
      },
      {
        "label": "Uigurisch",
        "kind": "alias"
      },
      {
        "label": "维语",
        "kind": "alias"
      },
      {
        "label": "維語",
        "kind": "alias"
      },
      {
        "label": "維吾爾語",
        "kind": "alias"
      }
    ],
    "mri": [
      {
        "label": "Māori",
        "kind": "local"
      },
      {
        "label": "毛利语",
        "kind": "alias"
      },
      {
        "label": "maori",
        "kind": "alias"
      },
      {
        "label": "maorí",
        "kind": "alias"
      }
    ],
    "tgk": [
      {
        "label": "Tajik",
        "kind": "local"
      },
      {
        "label": "тоҷикӣ",
        "kind": "native"
      },
      {
        "label": "塔吉克语",
        "kind": "alias"
      },
      {
        "label": "tadjik",
        "kind": "alias"
      },
      {
        "label": "tayiko",
        "kind": "alias"
      },
      {
        "label": "Tadschikisch",
        "kind": "alias"
      },
      {
        "label": "塔吉克語",
        "kind": "alias"
      }
    ],
    "tuk": [
      {
        "label": "Turkmen",
        "kind": "local"
      },
      {
        "label": "türkmen dili",
        "kind": "native"
      },
      {
        "label": "土库曼语",
        "kind": "alias"
      },
      {
        "label": "turkmène",
        "kind": "alias"
      },
      {
        "label": "turcomano",
        "kind": "alias"
      },
      {
        "label": "Turkmenisch",
        "kind": "alias"
      }
    ],
    "abk": [
      {
        "label": "Abkhazian",
        "kind": "local"
      },
      {
        "label": "Abkhaz",
        "kind": "english"
      },
      {
        "label": "阿布哈西亚语",
        "kind": "alias"
      },
      {
        "label": "abkhaze",
        "kind": "alias"
      },
      {
        "label": "abjasio",
        "kind": "alias"
      },
      {
        "label": "Abchasisch",
        "kind": "alias"
      }
    ],
    "guj": [
      {
        "label": "Gujarati",
        "kind": "local"
      },
      {
        "label": "ગુજરાતી",
        "kind": "native"
      },
      {
        "label": "古吉拉特语",
        "kind": "alias"
      },
      {
        "label": "goudjarati",
        "kind": "alias"
      },
      {
        "label": "guyaratí",
        "kind": "alias"
      }
    ],
    "szl": [
      {
        "label": "Silesian",
        "kind": "local"
      },
      {
        "label": "ślōnski",
        "kind": "native"
      },
      {
        "label": "西里西亚语",
        "kind": "alias"
      },
      {
        "label": "silésien",
        "kind": "alias"
      },
      {
        "label": "silesio",
        "kind": "alias"
      },
      {
        "label": "Schlesisch (Wasserpolnisch)",
        "kind": "alias"
      }
    ],
    "khm": [
      {
        "label": "Khmer",
        "kind": "local"
      },
      {
        "label": "ខ្មែរ",
        "kind": "native"
      },
      {
        "label": "高棉语",
        "kind": "alias"
      },
      {
        "label": "jemer",
        "kind": "alias"
      },
      {
        "label": "高棉文",
        "kind": "alias"
      },
      {
        "label": "柬语",
        "kind": "alias"
      },
      {
        "label": "柬語",
        "kind": "alias"
      },
      {
        "label": "柬埔寨语",
        "kind": "alias"
      },
      {
        "label": "柬埔寨語",
        "kind": "alias"
      }
    ],
    "zul": [
      {
        "label": "Zulu",
        "kind": "local"
      },
      {
        "label": "isiZulu",
        "kind": "native"
      },
      {
        "label": "祖鲁语",
        "kind": "alias"
      },
      {
        "label": "zoulou",
        "kind": "alias"
      },
      {
        "label": "zulú",
        "kind": "alias"
      }
    ],
    "bod": [
      {
        "label": "Tibetan",
        "kind": "local"
      },
      {
        "label": "བོད་སྐད་",
        "kind": "native"
      },
      {
        "label": "藏语",
        "kind": "alias"
      },
      {
        "label": "tibétain",
        "kind": "alias"
      },
      {
        "label": "tibetano",
        "kind": "alias"
      },
      {
        "label": "Tibetisch",
        "kind": "alias"
      },
      {
        "label": "藏文",
        "kind": "alias"
      },
      {
        "label": "藏語",
        "kind": "alias"
      },
      {
        "label": "藏話",
        "kind": "alias"
      }
    ],
    "che": [
      {
        "label": "Chechen",
        "kind": "local"
      },
      {
        "label": "нохчийн",
        "kind": "native"
      },
      {
        "label": "车臣语",
        "kind": "alias"
      },
      {
        "label": "tchétchène",
        "kind": "alias"
      },
      {
        "label": "checheno",
        "kind": "alias"
      },
      {
        "label": "Tschetschenisch",
        "kind": "alias"
      }
    ],
    "zza": [
      {
        "label": "Zaza",
        "kind": "local"
      },
      {
        "label": "Zazaki",
        "kind": "english"
      },
      {
        "label": "扎扎语",
        "kind": "alias"
      }
    ],
    "asm": [
      {
        "label": "Assamese",
        "kind": "local"
      },
      {
        "label": "অসমীয়া",
        "kind": "native"
      },
      {
        "label": "阿萨姆语",
        "kind": "alias"
      },
      {
        "label": "assamais",
        "kind": "alias"
      },
      {
        "label": "asamés",
        "kind": "alias"
      },
      {
        "label": "Assamesisch",
        "kind": "alias"
      }
    ],
    "cor": [
      {
        "label": "Cornish",
        "kind": "local"
      },
      {
        "label": "kernewek",
        "kind": "native"
      },
      {
        "label": "康沃尔语",
        "kind": "alias"
      },
      {
        "label": "cornique",
        "kind": "alias"
      },
      {
        "label": "córnico",
        "kind": "alias"
      },
      {
        "label": "Kornisch",
        "kind": "alias"
      }
    ],
    "chv": [
      {
        "label": "Chuvash",
        "kind": "local"
      },
      {
        "label": "чӑваш",
        "kind": "native"
      },
      {
        "label": "楚瓦什语",
        "kind": "alias"
      },
      {
        "label": "tchouvache",
        "kind": "alias"
      },
      {
        "label": "chuvasio",
        "kind": "alias"
      },
      {
        "label": "Tschuwaschisch",
        "kind": "alias"
      }
    ],
    "haw": [
      {
        "label": "Hawaiian",
        "kind": "local"
      },
      {
        "label": "ʻŌlelo Hawaiʻi",
        "kind": "native"
      },
      {
        "label": "夏威夷语",
        "kind": "alias"
      },
      {
        "label": "hawaïen",
        "kind": "alias"
      },
      {
        "label": "hawaiano",
        "kind": "alias"
      },
      {
        "label": "Hawaiisch",
        "kind": "alias"
      }
    ],
    "sco": [
      {
        "label": "Scots",
        "kind": "local"
      },
      {
        "label": "苏格兰语",
        "kind": "alias"
      },
      {
        "label": "écossais",
        "kind": "alias"
      },
      {
        "label": "escocés",
        "kind": "alias"
      },
      {
        "label": "Schottisch",
        "kind": "alias"
      }
    ],
    "vol": [
      {
        "label": "Volapük",
        "kind": "local"
      },
      {
        "label": "沃拉普克语",
        "kind": "alias"
      }
    ],
    "hbs": [
      {
        "label": "Serbo-Croatian",
        "kind": "local"
      },
      {
        "label": "srpskohrvatski",
        "kind": "native"
      },
      {
        "label": "塞尔维亚-克罗地亚语",
        "kind": "alias"
      },
      {
        "label": "serbo-croate",
        "kind": "alias"
      },
      {
        "label": "serbocroata",
        "kind": "alias"
      },
      {
        "label": "Serbo-Kroatisch",
        "kind": "alias"
      }
    ],
    "hau": [
      {
        "label": "Hausa",
        "kind": "local"
      },
      {
        "label": "豪萨语",
        "kind": "alias"
      },
      {
        "label": "haoussa",
        "kind": "alias"
      },
      {
        "label": "Haussa",
        "kind": "alias"
      }
    ],
    "grn": [
      {
        "label": "Guarani",
        "kind": "local"
      },
      {
        "label": "瓜拉尼语",
        "kind": "alias"
      },
      {
        "label": "guaraní",
        "kind": "alias"
      }
    ],
    "som": [
      {
        "label": "Somali",
        "kind": "local"
      },
      {
        "label": "Soomaali",
        "kind": "native"
      },
      {
        "label": "索马里语",
        "kind": "alias"
      },
      {
        "label": "somalí",
        "kind": "alias"
      }
    ],
    "mlg": [
      {
        "label": "Malagasy",
        "kind": "local"
      },
      {
        "label": "马拉加斯语",
        "kind": "alias"
      },
      {
        "label": "malgache",
        "kind": "alias"
      }
    ],
    "srd": [
      {
        "label": "Sardinian",
        "kind": "local"
      },
      {
        "label": "sardu",
        "kind": "native"
      },
      {
        "label": "萨丁语",
        "kind": "alias"
      },
      {
        "label": "sarde",
        "kind": "alias"
      },
      {
        "label": "sardo",
        "kind": "alias"
      },
      {
        "label": "Sardisch",
        "kind": "alias"
      }
    ],
    "ory": [
      {
        "label": "Odia",
        "kind": "local"
      },
      {
        "label": "ଓଡ଼ିଆ",
        "kind": "native"
      },
      {
        "label": "奥里亚语",
        "kind": "alias"
      },
      {
        "label": "oriya",
        "kind": "alias"
      }
    ],
    "glv": [
      {
        "label": "Manx",
        "kind": "local"
      },
      {
        "label": "Gaelg",
        "kind": "native"
      },
      {
        "label": "马恩语",
        "kind": "alias"
      },
      {
        "label": "mannois",
        "kind": "alias"
      },
      {
        "label": "manés",
        "kind": "alias"
      }
    ],
    "arg": [
      {
        "label": "Aragonese",
        "kind": "local"
      },
      {
        "label": "阿拉贡语",
        "kind": "alias"
      },
      {
        "label": "aragonais",
        "kind": "alias"
      },
      {
        "label": "aragonés",
        "kind": "alias"
      },
      {
        "label": "Aragonesisch",
        "kind": "alias"
      }
    ],
    "crh": [
      {
        "label": "Crimean Tatar",
        "kind": "local"
      },
      {
        "label": "克里米亚鞑靼语",
        "kind": "alias"
      },
      {
        "label": "tatar de Crimée",
        "kind": "alias"
      },
      {
        "label": "tártaro de Crimea",
        "kind": "alias"
      },
      {
        "label": "Krimtatarisch",
        "kind": "alias"
      }
    ],
    "lao": [
      {
        "label": "Lao",
        "kind": "local"
      },
      {
        "label": "ລາວ",
        "kind": "native"
      },
      {
        "label": "老挝语",
        "kind": "alias"
      },
      {
        "label": "Laotisch",
        "kind": "alias"
      }
    ],
    "sah": [
      {
        "label": "Yakut",
        "kind": "local"
      },
      {
        "label": "саха тыла",
        "kind": "native"
      },
      {
        "label": "萨哈语",
        "kind": "alias"
      },
      {
        "label": "iakoute",
        "kind": "alias"
      },
      {
        "label": "sakha",
        "kind": "alias"
      },
      {
        "label": "Jakutisch",
        "kind": "alias"
      }
    ],
    "cop": [
      {
        "label": "Coptic",
        "kind": "local"
      },
      {
        "label": "科普特语",
        "kind": "alias"
      },
      {
        "label": "copte",
        "kind": "alias"
      },
      {
        "label": "copto",
        "kind": "alias"
      },
      {
        "label": "Koptisch",
        "kind": "alias"
      }
    ],
    "pli": [
      {
        "label": "Pali",
        "kind": "local"
      },
      {
        "label": "巴利语",
        "kind": "alias"
      }
    ],
    "xho": [
      {
        "label": "Xhosa",
        "kind": "local"
      },
      {
        "label": "IsiXhosa",
        "kind": "native"
      },
      {
        "label": "科萨语",
        "kind": "alias"
      }
    ],
    "csb": [
      {
        "label": "Kashubian",
        "kind": "local"
      },
      {
        "label": "卡舒比语",
        "kind": "alias"
      },
      {
        "label": "kachoube",
        "kind": "alias"
      },
      {
        "label": "casubio",
        "kind": "alias"
      },
      {
        "label": "Kaschubisch",
        "kind": "alias"
      }
    ],
    "arn": [
      {
        "label": "Mapuche",
        "kind": "local"
      },
      {
        "label": "Mapudungun",
        "kind": "english"
      },
      {
        "label": "马普切语",
        "kind": "alias"
      }
    ],
    "sin": [
      {
        "label": "Sinhala",
        "kind": "local"
      },
      {
        "label": "සිංහල",
        "kind": "native"
      },
      {
        "label": "僧伽罗语",
        "kind": "alias"
      },
      {
        "label": "cingalais",
        "kind": "alias"
      },
      {
        "label": "cingalés",
        "kind": "alias"
      },
      {
        "label": "Singhalesisch",
        "kind": "alias"
      },
      {
        "label": "sinhalese",
        "kind": "alias"
      }
    ],
    "ang": [
      {
        "label": "Old English",
        "kind": "local"
      },
      {
        "label": "古英语",
        "kind": "alias"
      },
      {
        "label": "ancien anglais",
        "kind": "alias"
      },
      {
        "label": "inglés antiguo",
        "kind": "alias"
      },
      {
        "label": "Altenglisch",
        "kind": "alias"
      }
    ],
    "kas": [
      {
        "label": "Kashmiri",
        "kind": "local"
      },
      {
        "label": "کٲشُر",
        "kind": "native"
      },
      {
        "label": "克什米尔语",
        "kind": "alias"
      },
      {
        "label": "cachemiri",
        "kind": "alias"
      },
      {
        "label": "cachemir",
        "kind": "alias"
      },
      {
        "label": "Kaschmiri",
        "kind": "alias"
      }
    ],
    "got": [
      {
        "label": "Gothic",
        "kind": "local"
      },
      {
        "label": "哥特语",
        "kind": "alias"
      },
      {
        "label": "gotique",
        "kind": "alias"
      },
      {
        "label": "gótico",
        "kind": "alias"
      },
      {
        "label": "Gotisch",
        "kind": "alias"
      }
    ],
    "egy": [
      {
        "label": "Ancient Egyptian",
        "kind": "local"
      },
      {
        "label": "Egyptian",
        "kind": "english"
      },
      {
        "label": "古埃及语",
        "kind": "alias"
      },
      {
        "label": "égyptien ancien",
        "kind": "alias"
      },
      {
        "label": "egipcio antiguo",
        "kind": "alias"
      },
      {
        "label": "Ägyptisch",
        "kind": "alias"
      }
    ],
    "rom": [
      {
        "label": "Romany",
        "kind": "local"
      },
      {
        "label": "Romani",
        "kind": "english"
      },
      {
        "label": "吉普赛语",
        "kind": "alias"
      },
      {
        "label": "romaní",
        "kind": "alias"
      }
    ],
    "snd": [
      {
        "label": "Sindhi",
        "kind": "local"
      },
      {
        "label": "سنڌي",
        "kind": "native"
      },
      {
        "label": "信德语",
        "kind": "alias"
      },
      {
        "label": "sindi",
        "kind": "alias"
      }
    ],
    "cos": [
      {
        "label": "Corsican",
        "kind": "local"
      },
      {
        "label": "科西嘉语",
        "kind": "alias"
      },
      {
        "label": "corse",
        "kind": "alias"
      },
      {
        "label": "corso",
        "kind": "alias"
      },
      {
        "label": "Korsisch",
        "kind": "alias"
      }
    ],
    "ceb": [
      {
        "label": "Cebuano",
        "kind": "local"
      },
      {
        "label": "宿务语",
        "kind": "alias"
      }
    ],
    "nds": [
      {
        "label": "Low German",
        "kind": "local"
      },
      {
        "label": "Neddersass’sch",
        "kind": "native"
      },
      {
        "label": "低地德语",
        "kind": "alias"
      },
      {
        "label": "bas-allemand",
        "kind": "alias"
      },
      {
        "label": "bajo alemán",
        "kind": "alias"
      },
      {
        "label": "Niederdeutsch",
        "kind": "alias"
      }
    ],
    "aym": [
      {
        "label": "Aymara",
        "kind": "local"
      },
      {
        "label": "艾马拉语",
        "kind": "alias"
      },
      {
        "label": "aimara",
        "kind": "alias"
      }
    ],
    "scn": [
      {
        "label": "Sicilian",
        "kind": "local"
      },
      {
        "label": "西西里语",
        "kind": "alias"
      },
      {
        "label": "sicilien",
        "kind": "alias"
      },
      {
        "label": "siciliano",
        "kind": "alias"
      },
      {
        "label": "Sizilianisch",
        "kind": "alias"
      }
    ],
    "ast": [
      {
        "label": "Asturian",
        "kind": "local"
      },
      {
        "label": "asturianu",
        "kind": "native"
      },
      {
        "label": "阿斯图里亚斯语",
        "kind": "alias"
      },
      {
        "label": "asturien",
        "kind": "alias"
      },
      {
        "label": "asturiano",
        "kind": "alias"
      },
      {
        "label": "Asturisch",
        "kind": "alias"
      }
    ],
    "dzo": [
      {
        "label": "Dzongkha",
        "kind": "local"
      },
      {
        "label": "རྫོང་ཁ",
        "kind": "native"
      },
      {
        "label": "宗卡语",
        "kind": "alias"
      }
    ],
    "tok": [
      {
        "label": "Toki Pona",
        "kind": "local"
      },
      {
        "label": "道本语",
        "kind": "alias"
      }
    ],
    "kal": [
      {
        "label": "Kalaallisut",
        "kind": "local"
      },
      {
        "label": "Greenlandic",
        "kind": "english"
      },
      {
        "label": "格陵兰语",
        "kind": "alias"
      },
      {
        "label": "groenlandais",
        "kind": "alias"
      },
      {
        "label": "groenlandés",
        "kind": "alias"
      },
      {
        "label": "Grönländisch",
        "kind": "alias"
      }
    ],
    "ava": [
      {
        "label": "Avaric",
        "kind": "local"
      },
      {
        "label": "Avar",
        "kind": "english"
      },
      {
        "label": "阿瓦尔语",
        "kind": "alias"
      },
      {
        "label": "Awarisch",
        "kind": "alias"
      }
    ],
    "sun": [
      {
        "label": "Sundanese",
        "kind": "local"
      },
      {
        "label": "Basa Sunda",
        "kind": "native"
      },
      {
        "label": "巽他语",
        "kind": "alias"
      },
      {
        "label": "soundanais",
        "kind": "alias"
      },
      {
        "label": "sundanés",
        "kind": "alias"
      },
      {
        "label": "Sundanesisch",
        "kind": "alias"
      }
    ],
    "wln": [
      {
        "label": "Walloon",
        "kind": "local"
      },
      {
        "label": "瓦隆语",
        "kind": "alias"
      },
      {
        "label": "wallon",
        "kind": "alias"
      },
      {
        "label": "valón",
        "kind": "alias"
      },
      {
        "label": "Wallonisch",
        "kind": "alias"
      }
    ],
    "cnr": [
      {
        "label": "Montenegrin",
        "kind": "local"
      },
      {
        "label": "crnogorski",
        "kind": "native"
      },
      {
        "label": "黑山语",
        "kind": "alias"
      },
      {
        "label": "monténégrin",
        "kind": "alias"
      },
      {
        "label": "montenegrino",
        "kind": "alias"
      },
      {
        "label": "Montenegrinisch",
        "kind": "alias"
      }
    ],
    "prs": [
      {
        "label": "Dari",
        "kind": "local"
      },
      {
        "label": "دری",
        "kind": "native"
      },
      {
        "label": "达里语",
        "kind": "alias"
      },
      {
        "label": "darí",
        "kind": "alias"
      }
    ],
    "nap": [
      {
        "label": "Neapolitan",
        "kind": "local"
      },
      {
        "label": "那不勒斯语",
        "kind": "alias"
      },
      {
        "label": "napolitain",
        "kind": "alias"
      },
      {
        "label": "napolitano",
        "kind": "alias"
      },
      {
        "label": "Neapolitanisch",
        "kind": "alias"
      }
    ],
    "tir": [
      {
        "label": "Tigrinya",
        "kind": "local"
      },
      {
        "label": "ትግርኛ",
        "kind": "native"
      },
      {
        "label": "提格利尼亚语",
        "kind": "alias"
      },
      {
        "label": "tigrigna",
        "kind": "alias"
      },
      {
        "label": "tigriña",
        "kind": "alias"
      }
    ],
    "ain": [
      {
        "label": "Ainu",
        "kind": "local"
      },
      {
        "label": "阿伊努语",
        "kind": "alias"
      },
      {
        "label": "aïnou",
        "kind": "alias"
      }
    ],
    "udm": [
      {
        "label": "Udmurt",
        "kind": "local"
      },
      {
        "label": "乌德穆尔特语",
        "kind": "alias"
      },
      {
        "label": "oudmourte",
        "kind": "alias"
      },
      {
        "label": "Udmurtisch",
        "kind": "alias"
      }
    ],
    "akk": [
      {
        "label": "Akkadian",
        "kind": "local"
      },
      {
        "label": "阿卡德语",
        "kind": "alias"
      },
      {
        "label": "akkadien",
        "kind": "alias"
      },
      {
        "label": "acadio",
        "kind": "alias"
      },
      {
        "label": "Akkadisch",
        "kind": "alias"
      }
    ],
    "gag": [
      {
        "label": "Gagauz",
        "kind": "local"
      },
      {
        "label": "加告兹语",
        "kind": "alias"
      },
      {
        "label": "gagaouze",
        "kind": "alias"
      },
      {
        "label": "gagauzo",
        "kind": "alias"
      },
      {
        "label": "Gagausisch",
        "kind": "alias"
      }
    ],
    "ibo": [
      {
        "label": "Igbo",
        "kind": "local"
      },
      {
        "label": "伊博语",
        "kind": "alias"
      }
    ],
    "krl": [
      {
        "label": "Karelian",
        "kind": "local"
      },
      {
        "label": "卡累利阿语",
        "kind": "alias"
      },
      {
        "label": "carélien",
        "kind": "alias"
      },
      {
        "label": "carelio",
        "kind": "alias"
      },
      {
        "label": "Karelisch",
        "kind": "alias"
      }
    ],
    "ave": [
      {
        "label": "Avestan",
        "kind": "local"
      },
      {
        "label": "阿维斯塔语",
        "kind": "alias"
      },
      {
        "label": "avestique",
        "kind": "alias"
      },
      {
        "label": "avéstico",
        "kind": "alias"
      },
      {
        "label": "Avestisch",
        "kind": "alias"
      }
    ],
    "div": [
      {
        "label": "Dhivehi",
        "kind": "local"
      },
      {
        "label": "迪维希语",
        "kind": "alias"
      },
      {
        "label": "maldivien",
        "kind": "alias"
      },
      {
        "label": "divehi",
        "kind": "alias"
      },
      {
        "label": "maldivian",
        "kind": "alias"
      }
    ],
    "isv": [
      {
        "label": "Interslavic",
        "kind": "english"
      }
    ],
    "tyv": [
      {
        "label": "Tuvinian",
        "kind": "local"
      },
      {
        "label": "Tuvan",
        "kind": "english"
      },
      {
        "label": "图瓦语",
        "kind": "alias"
      },
      {
        "label": "touvain",
        "kind": "alias"
      },
      {
        "label": "tuviniano",
        "kind": "alias"
      },
      {
        "label": "Tuwinisch",
        "kind": "alias"
      }
    ],
    "lmo": [
      {
        "label": "Lombard",
        "kind": "local"
      },
      {
        "label": "伦巴第语",
        "kind": "alias"
      },
      {
        "label": "lombardo",
        "kind": "alias"
      },
      {
        "label": "Lombardisch",
        "kind": "alias"
      }
    ],
    "ota": [
      {
        "label": "Ottoman Turkish",
        "kind": "local"
      },
      {
        "label": "奥斯曼土耳其语",
        "kind": "alias"
      },
      {
        "label": "turc ottoman",
        "kind": "alias"
      },
      {
        "label": "turco otomano",
        "kind": "alias"
      },
      {
        "label": "Osmanisch",
        "kind": "alias"
      }
    ],
    "myv": [
      {
        "label": "Erzya",
        "kind": "local"
      },
      {
        "label": "厄尔兹亚语",
        "kind": "alias"
      },
      {
        "label": "Ersja-Mordwinisch",
        "kind": "alias"
      }
    ],
    "bal": [
      {
        "label": "Baluchi",
        "kind": "local"
      },
      {
        "label": "Balochi",
        "kind": "english"
      },
      {
        "label": "俾路支语",
        "kind": "alias"
      },
      {
        "label": "baloutchi",
        "kind": "alias"
      },
      {
        "label": "Belutschisch",
        "kind": "alias"
      }
    ],
    "yor": [
      {
        "label": "Yoruba",
        "kind": "local"
      },
      {
        "label": "Èdè Yorùbá",
        "kind": "native"
      },
      {
        "label": "约鲁巴语",
        "kind": "alias"
      }
    ],
    "pms": [
      {
        "label": "Piedmontese",
        "kind": "local"
      },
      {
        "label": "piémontais",
        "kind": "alias"
      },
      {
        "label": "Piemontesisch",
        "kind": "alias"
      }
    ],
    "ady": [
      {
        "label": "Adyghe",
        "kind": "local"
      },
      {
        "label": "阿迪格语",
        "kind": "alias"
      },
      {
        "label": "adyguéen",
        "kind": "alias"
      },
      {
        "label": "adigué",
        "kind": "alias"
      },
      {
        "label": "Adygeisch",
        "kind": "alias"
      }
    ],
    "wol": [
      {
        "label": "Wolof",
        "kind": "local"
      },
      {
        "label": "沃洛夫语",
        "kind": "alias"
      },
      {
        "label": "wólof",
        "kind": "alias"
      }
    ],
    "fur": [
      {
        "label": "Friulian",
        "kind": "local"
      },
      {
        "label": "furlan",
        "kind": "native"
      },
      {
        "label": "弗留利语",
        "kind": "alias"
      },
      {
        "label": "frioulan",
        "kind": "alias"
      },
      {
        "label": "friulano",
        "kind": "alias"
      },
      {
        "label": "Friaulisch",
        "kind": "alias"
      }
    ],
    "smo": [
      {
        "label": "Samoan",
        "kind": "local"
      },
      {
        "label": "萨摩亚语",
        "kind": "alias"
      },
      {
        "label": "samoano",
        "kind": "alias"
      },
      {
        "label": "Samoanisch",
        "kind": "alias"
      }
    ],
    "rue": [
      {
        "label": "Rusyn",
        "kind": "local"
      },
      {
        "label": "ruthène",
        "kind": "alias"
      },
      {
        "label": "Russinisch",
        "kind": "alias"
      }
    ],
    "sot": [
      {
        "label": "Southern Sotho",
        "kind": "local"
      },
      {
        "label": "Sesotho",
        "kind": "native"
      },
      {
        "label": "南索托语",
        "kind": "alias"
      },
      {
        "label": "sotho du Sud",
        "kind": "alias"
      },
      {
        "label": "sotho meridional",
        "kind": "alias"
      },
      {
        "label": "Süd-Sotho",
        "kind": "alias"
      }
    ],
    "hat": [
      {
        "label": "Haitian Creole",
        "kind": "local"
      },
      {
        "label": "海地克里奥尔语",
        "kind": "alias"
      },
      {
        "label": "créole haïtien",
        "kind": "alias"
      },
      {
        "label": "criollo haitiano",
        "kind": "alias"
      },
      {
        "label": "Haiti-Kreolisch",
        "kind": "alias"
      }
    ],
    "syc": [
      {
        "label": "Classical Syriac",
        "kind": "local"
      },
      {
        "label": "Syriac",
        "kind": "english"
      },
      {
        "label": "古典叙利亚语",
        "kind": "alias"
      },
      {
        "label": "syriaque classique",
        "kind": "alias"
      },
      {
        "label": "siríaco clásico",
        "kind": "alias"
      },
      {
        "label": "Altsyrisch",
        "kind": "alias"
      }
    ],
    "kom": [
      {
        "label": "Komi",
        "kind": "local"
      },
      {
        "label": "科米语",
        "kind": "alias"
      }
    ],
    "kin": [
      {
        "label": "Kinyarwanda",
        "kind": "local"
      },
      {
        "label": "Ikinyarwanda",
        "kind": "native"
      },
      {
        "label": "卢旺达语",
        "kind": "alias"
      }
    ],
    "hif": [
      {
        "label": "Fiji Hindi",
        "kind": "local"
      },
      {
        "label": "hindi fidjien",
        "kind": "alias"
      },
      {
        "label": "Fidschi-Hindi",
        "kind": "alias"
      }
    ],
    "tpi": [
      {
        "label": "Tok Pisin",
        "kind": "local"
      },
      {
        "label": "托克皮辛语",
        "kind": "alias"
      },
      {
        "label": "Neumelanesisch",
        "kind": "alias"
      }
    ],
    "nav": [
      {
        "label": "Navajo",
        "kind": "local"
      },
      {
        "label": "纳瓦霍语",
        "kind": "alias"
      }
    ],
    "ton": [
      {
        "label": "Tongan",
        "kind": "local"
      },
      {
        "label": "lea fakatonga",
        "kind": "native"
      },
      {
        "label": "汤加语",
        "kind": "alias"
      },
      {
        "label": "tongien",
        "kind": "alias"
      },
      {
        "label": "tongano",
        "kind": "alias"
      },
      {
        "label": "Tongaisch",
        "kind": "alias"
      }
    ],
    "nob": [
      {
        "label": "Norwegian Bokmål",
        "kind": "local"
      },
      {
        "label": "norsk bokmål",
        "kind": "native"
      },
      {
        "label": "Bokmål",
        "kind": "english"
      },
      {
        "label": "书面挪威语",
        "kind": "alias"
      },
      {
        "label": "norvégien bokmål",
        "kind": "alias"
      },
      {
        "label": "noruego bokmal",
        "kind": "alias"
      },
      {
        "label": "Norwegisch (Bokmål)",
        "kind": "alias"
      }
    ],
    "nno": [
      {
        "label": "Norwegian Nynorsk",
        "kind": "local"
      },
      {
        "label": "norsk nynorsk",
        "kind": "native"
      },
      {
        "label": "Nynorsk",
        "kind": "english"
      },
      {
        "label": "挪威尼诺斯克语",
        "kind": "alias"
      },
      {
        "label": "norvégien nynorsk",
        "kind": "alias"
      },
      {
        "label": "noruego nynorsk",
        "kind": "alias"
      },
      {
        "label": "Norwegisch (Nynorsk)",
        "kind": "alias"
      }
    ],
    "kok": [
      {
        "label": "Konkani",
        "kind": "local"
      },
      {
        "label": "कोंकणी",
        "kind": "native"
      },
      {
        "label": "孔卡尼语",
        "kind": "alias"
      },
      {
        "label": "konkaní",
        "kind": "alias"
      }
    ],
    "mai": [
      {
        "label": "Maithili",
        "kind": "local"
      },
      {
        "label": "मैथिली",
        "kind": "native"
      },
      {
        "label": "迈蒂利语",
        "kind": "alias"
      },
      {
        "label": "maïthili",
        "kind": "alias"
      }
    ],
    "mnc": [
      {
        "label": "Manchu",
        "kind": "local"
      },
      {
        "label": "满语",
        "kind": "alias"
      },
      {
        "label": "mandchou",
        "kind": "alias"
      },
      {
        "label": "manchú",
        "kind": "alias"
      },
      {
        "label": "Mandschurisch",
        "kind": "alias"
      },
      {
        "label": "滿語",
        "kind": "alias"
      }
    ],
    "liv": [
      {
        "label": "Livonian",
        "kind": "local"
      },
      {
        "label": "livonien",
        "kind": "alias"
      },
      {
        "label": "Livisch",
        "kind": "alias"
      }
    ],
    "nov": [
      {
        "label": "Novial",
        "kind": "local"
      }
    ],
    "tsn": [
      {
        "label": "Tswana",
        "kind": "local"
      },
      {
        "label": "Setswana",
        "kind": "native"
      },
      {
        "label": "茨瓦纳语",
        "kind": "alias"
      },
      {
        "label": "setsuana",
        "kind": "alias"
      }
    ],
    "vec": [
      {
        "label": "Venetian",
        "kind": "local"
      },
      {
        "label": "veneto",
        "kind": "native"
      },
      {
        "label": "威尼斯语",
        "kind": "alias"
      },
      {
        "label": "vénitien",
        "kind": "alias"
      },
      {
        "label": "veneciano",
        "kind": "alias"
      },
      {
        "label": "Venetisch",
        "kind": "alias"
      }
    ],
    "sux": [
      {
        "label": "Sumerian",
        "kind": "local"
      },
      {
        "label": "苏美尔语",
        "kind": "alias"
      },
      {
        "label": "sumérien",
        "kind": "alias"
      },
      {
        "label": "sumerio",
        "kind": "alias"
      },
      {
        "label": "Sumerisch",
        "kind": "alias"
      }
    ],
    "hsb": [
      {
        "label": "Upper Sorbian",
        "kind": "local"
      },
      {
        "label": "hornjoserbšćina",
        "kind": "native"
      },
      {
        "label": "上索布语",
        "kind": "alias"
      },
      {
        "label": "haut-sorabe",
        "kind": "alias"
      },
      {
        "label": "alto sorbio",
        "kind": "alias"
      },
      {
        "label": "Obersorbisch",
        "kind": "alias"
      }
    ],
    "lim": [
      {
        "label": "Limburgish",
        "kind": "local"
      },
      {
        "label": "Limburgish language",
        "kind": "english"
      },
      {
        "label": "林堡语",
        "kind": "alias"
      },
      {
        "label": "limbourgeois",
        "kind": "alias"
      },
      {
        "label": "limburgués",
        "kind": "alias"
      },
      {
        "label": "Limburgisch",
        "kind": "alias"
      }
    ],
    "tlh": [
      {
        "label": "Klingon",
        "kind": "local"
      },
      {
        "label": "克林贡语",
        "kind": "alias"
      },
      {
        "label": "Klingonisch",
        "kind": "alias"
      }
    ],
    "new": [
      {
        "label": "Newari",
        "kind": "local"
      },
      {
        "label": "Newar",
        "kind": "english"
      },
      {
        "label": "尼瓦尔语",
        "kind": "alias"
      },
      {
        "label": "nevarí",
        "kind": "alias"
      }
    ],
    "bua": [
      {
        "label": "Buriat",
        "kind": "local"
      },
      {
        "label": "Buryat",
        "kind": "english"
      },
      {
        "label": "布里亚特语",
        "kind": "alias"
      },
      {
        "label": "bouriate",
        "kind": "alias"
      },
      {
        "label": "buriato",
        "kind": "alias"
      },
      {
        "label": "Burjatisch",
        "kind": "alias"
      }
    ],
    "lld": [
      {
        "label": "Ladin",
        "kind": "english"
      }
    ],
    "sme": [
      {
        "label": "Northern Sami",
        "kind": "local"
      },
      {
        "label": "davvisámegiella",
        "kind": "native"
      },
      {
        "label": "北方萨米语",
        "kind": "alias"
      },
      {
        "label": "same du Nord",
        "kind": "alias"
      },
      {
        "label": "sami septentrional",
        "kind": "alias"
      },
      {
        "label": "Nordsamisch",
        "kind": "alias"
      }
    ],
    "ssw": [
      {
        "label": "Swati",
        "kind": "local"
      },
      {
        "label": "Swazi",
        "kind": "english"
      },
      {
        "label": "斯瓦蒂语",
        "kind": "alias"
      },
      {
        "label": "suazi",
        "kind": "alias"
      }
    ],
    "aar": [
      {
        "label": "Afar",
        "kind": "local"
      },
      {
        "label": "阿法尔语",
        "kind": "alias"
      }
    ],
    "lez": [
      {
        "label": "Lezghian",
        "kind": "local"
      },
      {
        "label": "Lezgian",
        "kind": "english"
      },
      {
        "label": "列兹金语",
        "kind": "alias"
      },
      {
        "label": "lezghien",
        "kind": "alias"
      },
      {
        "label": "lezgiano",
        "kind": "alias"
      },
      {
        "label": "Lesgisch",
        "kind": "alias"
      }
    ],
    "bho": [
      {
        "label": "Bhojpuri",
        "kind": "local"
      },
      {
        "label": "भोजपुरी",
        "kind": "native"
      },
      {
        "label": "博杰普尔语",
        "kind": "alias"
      },
      {
        "label": "bhodjpouri",
        "kind": "alias"
      },
      {
        "label": "bhoyapurí",
        "kind": "alias"
      },
      {
        "label": "Bhodschpuri",
        "kind": "alias"
      }
    ],
    "kaa": [
      {
        "label": "Kara-Kalpak",
        "kind": "local"
      },
      {
        "label": "Karakalpak",
        "kind": "english"
      },
      {
        "label": "卡拉卡尔帕克语",
        "kind": "alias"
      },
      {
        "label": "karakalpako",
        "kind": "alias"
      },
      {
        "label": "Karakalpakisch",
        "kind": "alias"
      }
    ],
    "dsb": [
      {
        "label": "Lower Sorbian",
        "kind": "local"
      },
      {
        "label": "dolnoserbšćina",
        "kind": "native"
      },
      {
        "label": "下索布语",
        "kind": "alias"
      },
      {
        "label": "bas-sorabe",
        "kind": "alias"
      },
      {
        "label": "bajo sorbio",
        "kind": "alias"
      },
      {
        "label": "Niedersorbisch",
        "kind": "alias"
      }
    ],
    "mni": [
      {
        "label": "Manipuri",
        "kind": "local"
      },
      {
        "label": "মৈতৈলোন্",
        "kind": "native"
      },
      {
        "label": "Meitei",
        "kind": "english"
      },
      {
        "label": "曼尼普尔语",
        "kind": "alias"
      },
      {
        "label": "manipurí",
        "kind": "alias"
      },
      {
        "label": "Meithei",
        "kind": "alias"
      }
    ],
    "rup": [
      {
        "label": "Aromanian",
        "kind": "local"
      },
      {
        "label": "阿罗马尼亚语",
        "kind": "alias"
      },
      {
        "label": "aroumain",
        "kind": "alias"
      },
      {
        "label": "arrumano",
        "kind": "alias"
      },
      {
        "label": "Aromunisch",
        "kind": "alias"
      }
    ],
    "iku": [
      {
        "label": "Inuktitut",
        "kind": "local"
      },
      {
        "label": "因纽特语",
        "kind": "alias"
      }
    ],
    "nau": [
      {
        "label": "Nauru",
        "kind": "local"
      },
      {
        "label": "Nauruan",
        "kind": "english"
      },
      {
        "label": "瑙鲁语",
        "kind": "alias"
      },
      {
        "label": "nauruano",
        "kind": "alias"
      },
      {
        "label": "Nauruisch",
        "kind": "alias"
      }
    ],
    "pap": [
      {
        "label": "Papiamento",
        "kind": "local"
      },
      {
        "label": "帕皮阿门托语",
        "kind": "alias"
      }
    ],
    "bar": [
      {
        "label": "Bavarian",
        "kind": "local"
      },
      {
        "label": "bavarois",
        "kind": "alias"
      },
      {
        "label": "Bairisch",
        "kind": "alias"
      }
    ],
    "run": [
      {
        "label": "Rundi",
        "kind": "local"
      },
      {
        "label": "Ikirundi",
        "kind": "native"
      },
      {
        "label": "Kirundi",
        "kind": "english"
      },
      {
        "label": "隆迪语",
        "kind": "alias"
      },
      {
        "label": "roundi",
        "kind": "alias"
      }
    ],
    "krc": [
      {
        "label": "Karachay-Balkar",
        "kind": "local"
      },
      {
        "label": "卡拉恰伊巴尔卡尔语",
        "kind": "alias"
      },
      {
        "label": "karatchaï balkar",
        "kind": "alias"
      },
      {
        "label": "Karatschaiisch-Balkarisch",
        "kind": "alias"
      }
    ],
    "tet": [
      {
        "label": "Tetum",
        "kind": "local"
      },
      {
        "label": "德顿语",
        "kind": "alias"
      },
      {
        "label": "tétoum",
        "kind": "alias"
      },
      {
        "label": "tetún",
        "kind": "alias"
      }
    ],
    "vep": [
      {
        "label": "Veps",
        "kind": "local"
      },
      {
        "label": "维普森语",
        "kind": "alias"
      },
      {
        "label": "vepse",
        "kind": "alias"
      },
      {
        "label": "Wepsisch",
        "kind": "alias"
      }
    ],
    "non": [
      {
        "label": "Old Norse",
        "kind": "local"
      },
      {
        "label": "古诺尔斯语",
        "kind": "alias"
      },
      {
        "label": "vieux norrois",
        "kind": "alias"
      },
      {
        "label": "nórdico antiguo",
        "kind": "alias"
      },
      {
        "label": "Altnordisch",
        "kind": "alias"
      }
    ],
    "nya": [
      {
        "label": "Nyanja",
        "kind": "local"
      },
      {
        "label": "Chewa",
        "kind": "english"
      },
      {
        "label": "齐切瓦语",
        "kind": "alias"
      }
    ],
    "chr": [
      {
        "label": "Cherokee",
        "kind": "local"
      },
      {
        "label": "ᏣᎳᎩ",
        "kind": "native"
      },
      {
        "label": "切罗基语",
        "kind": "alias"
      },
      {
        "label": "cheroqui",
        "kind": "alias"
      }
    ],
    "wuu": [
      {
        "label": "Wu Chinese",
        "kind": "local"
      },
      {
        "label": "吴语",
        "kind": "native"
      },
      {
        "label": "chinois wu",
        "kind": "alias"
      },
      {
        "label": "chino wu",
        "kind": "alias"
      },
      {
        "label": "Wu-Chinesisch",
        "kind": "alias"
      },
      {
        "label": "shanghainese",
        "kind": "alias"
      },
      {
        "label": "上海话",
        "kind": "alias"
      },
      {
        "label": "上海话方言",
        "kind": "alias"
      }
    ],
    "bam": [
      {
        "label": "Bambara",
        "kind": "local"
      },
      {
        "label": "bamanakan",
        "kind": "native"
      },
      {
        "label": "班巴拉语",
        "kind": "alias"
      }
    ],
    "ful": [
      {
        "label": "Fula",
        "kind": "local"
      },
      {
        "label": "Pulaar",
        "kind": "native"
      },
      {
        "label": "富拉语",
        "kind": "alias"
      },
      {
        "label": "peul",
        "kind": "alias"
      },
      {
        "label": "Ful",
        "kind": "alias"
      }
    ],
    "inh": [
      {
        "label": "Ingush",
        "kind": "local"
      },
      {
        "label": "印古什语",
        "kind": "alias"
      },
      {
        "label": "ingouche",
        "kind": "alias"
      },
      {
        "label": "Inguschisch",
        "kind": "alias"
      }
    ],
    "orm": [
      {
        "label": "Oromo",
        "kind": "local"
      },
      {
        "label": "Oromoo",
        "kind": "native"
      },
      {
        "label": "奥罗莫语",
        "kind": "alias"
      }
    ],
    "ban": [
      {
        "label": "Balinese",
        "kind": "local"
      },
      {
        "label": "巴厘语",
        "kind": "alias"
      },
      {
        "label": "balinais",
        "kind": "alias"
      },
      {
        "label": "balinés",
        "kind": "alias"
      },
      {
        "label": "Balinesisch",
        "kind": "alias"
      }
    ],
    "fij": [
      {
        "label": "Fijian",
        "kind": "local"
      },
      {
        "label": "斐济语",
        "kind": "alias"
      },
      {
        "label": "fidjien",
        "kind": "alias"
      },
      {
        "label": "fiyiano",
        "kind": "alias"
      },
      {
        "label": "Fidschi",
        "kind": "alias"
      }
    ],
    "chm": [
      {
        "label": "Mari",
        "kind": "local"
      },
      {
        "label": "马里语",
        "kind": "alias"
      },
      {
        "label": "marí",
        "kind": "alias"
      }
    ],
    "mdf": [
      {
        "label": "Moksha",
        "kind": "local"
      },
      {
        "label": "莫克沙语",
        "kind": "alias"
      },
      {
        "label": "mokcha",
        "kind": "alias"
      },
      {
        "label": "Mokschanisch",
        "kind": "alias"
      }
    ],
    "sna": [
      {
        "label": "Shona",
        "kind": "local"
      },
      {
        "label": "chiShona",
        "kind": "native"
      },
      {
        "label": "绍纳语",
        "kind": "alias"
      }
    ],
    "lij": [
      {
        "label": "Ligurian",
        "kind": "local"
      },
      {
        "label": "ligure",
        "kind": "native"
      },
      {
        "label": "利古里亚语",
        "kind": "alias"
      },
      {
        "label": "ligur",
        "kind": "alias"
      },
      {
        "label": "Ligurisch",
        "kind": "alias"
      }
    ],
    "min": [
      {
        "label": "Minangkabau",
        "kind": "local"
      },
      {
        "label": "米南佳保语",
        "kind": "alias"
      }
    ],
    "sat": [
      {
        "label": "Santali",
        "kind": "local"
      },
      {
        "label": "ᱥᱟᱱᱛᱟᱲᱤ",
        "kind": "native"
      },
      {
        "label": "桑塔利语",
        "kind": "alias"
      }
    ],
    "abq": [
      {
        "label": "Abaza",
        "kind": "english"
      }
    ],
    "ewe": [
      {
        "label": "Ewe",
        "kind": "local"
      },
      {
        "label": "eʋegbe",
        "kind": "native"
      },
      {
        "label": "埃维语",
        "kind": "alias"
      },
      {
        "label": "éwé",
        "kind": "alias"
      },
      {
        "label": "ewé",
        "kind": "alias"
      }
    ],
    "bis": [
      {
        "label": "Bislama",
        "kind": "local"
      },
      {
        "label": "比斯拉马语",
        "kind": "alias"
      },
      {
        "label": "bichelamar",
        "kind": "alias"
      }
    ],
    "kbd": [
      {
        "label": "Kabardian",
        "kind": "local"
      },
      {
        "label": "卡巴尔德语",
        "kind": "alias"
      },
      {
        "label": "kabarde",
        "kind": "alias"
      },
      {
        "label": "kabardiano",
        "kind": "alias"
      },
      {
        "label": "Kabardinisch",
        "kind": "alias"
      }
    ],
    "nrf": [
      {
        "label": "Norman",
        "kind": "english"
      }
    ],
    "fry": [
      {
        "label": "Western Frisian",
        "kind": "local"
      },
      {
        "label": "Frysk",
        "kind": "native"
      },
      {
        "label": "West Frisian",
        "kind": "english"
      },
      {
        "label": "西弗里西亚语",
        "kind": "alias"
      },
      {
        "label": "frison occidental",
        "kind": "alias"
      },
      {
        "label": "frisón occidental",
        "kind": "alias"
      },
      {
        "label": "Westfriesisch",
        "kind": "alias"
      }
    ],
    "arz": [
      {
        "label": "Egyptian Arabic",
        "kind": "local"
      },
      {
        "label": "arabe égyptien",
        "kind": "alias"
      },
      {
        "label": "Ägyptisches Arabisch",
        "kind": "alias"
      }
    ],
    "vro": [
      {
        "label": "Võro",
        "kind": "local"
      }
    ],
    "ilo": [
      {
        "label": "Iloko",
        "kind": "local"
      },
      {
        "label": "Ilocano",
        "kind": "english"
      },
      {
        "label": "伊洛卡诺语",
        "kind": "alias"
      },
      {
        "label": "Ilokano",
        "kind": "alias"
      }
    ],
    "lin": [
      {
        "label": "Lingala",
        "kind": "local"
      },
      {
        "label": "lingála",
        "kind": "native"
      },
      {
        "label": "林加拉语",
        "kind": "alias"
      }
    ],
    "jbo": [
      {
        "label": "Lojban",
        "kind": "local"
      },
      {
        "label": "逻辑语",
        "kind": "alias"
      }
    ],
    "mwl": [
      {
        "label": "Mirandese",
        "kind": "local"
      },
      {
        "label": "米兰德斯语",
        "kind": "alias"
      },
      {
        "label": "mirandais",
        "kind": "alias"
      },
      {
        "label": "mirandés",
        "kind": "alias"
      },
      {
        "label": "Mirandesisch",
        "kind": "alias"
      }
    ],
    "frp": [
      {
        "label": "Arpitan",
        "kind": "local"
      },
      {
        "label": "Arpitan language",
        "kind": "english"
      },
      {
        "label": "francoprovençal",
        "kind": "alias"
      },
      {
        "label": "Frankoprovenzalisch",
        "kind": "alias"
      }
    ],
    "tso": [
      {
        "label": "Tsonga",
        "kind": "local"
      },
      {
        "label": "聪加语",
        "kind": "alias"
      }
    ],
    "xal": [
      {
        "label": "Kalmyk",
        "kind": "local"
      },
      {
        "label": "卡尔梅克语",
        "kind": "alias"
      },
      {
        "label": "kalmouk",
        "kind": "alias"
      },
      {
        "label": "Kalmückisch",
        "kind": "alias"
      }
    ],
    "ett": [
      {
        "label": "Etruscan",
        "kind": "english"
      }
    ],
    "tah": [
      {
        "label": "Tahitian",
        "kind": "local"
      },
      {
        "label": "塔希提语",
        "kind": "alias"
      },
      {
        "label": "tahitien",
        "kind": "alias"
      },
      {
        "label": "tahitiano",
        "kind": "alias"
      },
      {
        "label": "Tahitisch",
        "kind": "alias"
      }
    ],
    "ven": [
      {
        "label": "Venda",
        "kind": "local"
      },
      {
        "label": "文达语",
        "kind": "alias"
      }
    ],
    "tcy": [
      {
        "label": "Tulu",
        "kind": "local"
      },
      {
        "label": "toulou",
        "kind": "alias"
      }
    ],
    "cha": [
      {
        "label": "Chamorro",
        "kind": "local"
      },
      {
        "label": "查莫罗语",
        "kind": "alias"
      }
    ],
    "hak": [
      {
        "label": "Hakka Chinese",
        "kind": "local"
      },
      {
        "label": "客家話",
        "kind": "native"
      },
      {
        "label": "客家话",
        "kind": "alias"
      },
      {
        "label": "hakka",
        "kind": "alias"
      },
      {
        "label": "chino hakka",
        "kind": "alias"
      },
      {
        "label": "客家语",
        "kind": "alias"
      }
    ],
    "kjh": [
      {
        "label": "Khakas",
        "kind": "english"
      }
    ],
    "ace": [
      {
        "label": "Acehnese",
        "kind": "local"
      },
      {
        "label": "亚齐语",
        "kind": "alias"
      },
      {
        "label": "aceh",
        "kind": "alias"
      },
      {
        "label": "achenés",
        "kind": "alias"
      }
    ],
    "gsw": [
      {
        "label": "Swiss German",
        "kind": "local"
      },
      {
        "label": "Schwiizertüütsch",
        "kind": "native"
      },
      {
        "label": "瑞士德语",
        "kind": "alias"
      },
      {
        "label": "suisse allemand",
        "kind": "alias"
      },
      {
        "label": "alemán suizo",
        "kind": "alias"
      },
      {
        "label": "Schweizerdeutsch",
        "kind": "alias"
      },
      {
        "label": "alemannic",
        "kind": "alias"
      },
      {
        "label": "alsatian",
        "kind": "alias"
      }
    ],
    "war": [
      {
        "label": "Waray",
        "kind": "local"
      },
      {
        "label": "瓦瑞语",
        "kind": "alias"
      }
    ],
    "hit": [
      {
        "label": "Hittite",
        "kind": "local"
      },
      {
        "label": "赫梯语",
        "kind": "alias"
      },
      {
        "label": "hitita",
        "kind": "alias"
      },
      {
        "label": "Hethitisch",
        "kind": "alias"
      }
    ],
    "mns": [
      {
        "label": "Mansi",
        "kind": "english"
      }
    ],
    "pcd": [
      {
        "label": "Picard",
        "kind": "local"
      },
      {
        "label": "Picardisch",
        "kind": "alias"
      }
    ],
    "gez": [
      {
        "label": "Geez",
        "kind": "local"
      },
      {
        "label": "Ge'ez",
        "kind": "english"
      },
      {
        "label": "吉兹语",
        "kind": "alias"
      },
      {
        "label": "guèze",
        "kind": "alias"
      }
    ],
    "brx": [
      {
        "label": "Bodo",
        "kind": "local"
      },
      {
        "label": "बर’",
        "kind": "native"
      },
      {
        "label": "博多语",
        "kind": "alias"
      }
    ],
    "phn": [
      {
        "label": "Phoenician",
        "kind": "local"
      },
      {
        "label": "腓尼基语",
        "kind": "alias"
      },
      {
        "label": "phénicien",
        "kind": "alias"
      },
      {
        "label": "fenicio",
        "kind": "alias"
      },
      {
        "label": "Phönizisch",
        "kind": "alias"
      }
    ],
    "mah": [
      {
        "label": "Marshallese",
        "kind": "local"
      },
      {
        "label": "马绍尔语",
        "kind": "alias"
      },
      {
        "label": "marshallais",
        "kind": "alias"
      },
      {
        "label": "marshalés",
        "kind": "alias"
      },
      {
        "label": "Marschallesisch",
        "kind": "alias"
      }
    ],
    "kca": [
      {
        "label": "Khanty",
        "kind": "english"
      }
    ],
    "dgo": [
      {
        "label": "Dogri",
        "kind": "local"
      },
      {
        "label": "डोगरी",
        "kind": "native"
      },
      {
        "label": "多格拉语",
        "kind": "alias"
      }
    ],
    "brh": [
      {
        "label": "Brahui",
        "kind": "local"
      },
      {
        "label": "brahoui",
        "kind": "alias"
      }
    ],
    "nog": [
      {
        "label": "Nogai",
        "kind": "local"
      },
      {
        "label": "诺盖语",
        "kind": "alias"
      },
      {
        "label": "nogaï",
        "kind": "alias"
      }
    ],
    "ckt": [
      {
        "label": "Chukchi",
        "kind": "english"
      }
    ],
    "lbe": [
      {
        "label": "Lak",
        "kind": "english"
      }
    ],
    "mzn": [
      {
        "label": "Mazanderani",
        "kind": "local"
      },
      {
        "label": "مازرونی",
        "kind": "native"
      },
      {
        "label": "马赞德兰语",
        "kind": "alias"
      },
      {
        "label": "mazandérani",
        "kind": "alias"
      },
      {
        "label": "mazandaraní",
        "kind": "alias"
      },
      {
        "label": "Masanderanisch",
        "kind": "alias"
      }
    ],
    "gil": [
      {
        "label": "Gilbertese",
        "kind": "local"
      },
      {
        "label": "吉尔伯特语",
        "kind": "alias"
      },
      {
        "label": "gilbertin",
        "kind": "alias"
      },
      {
        "label": "gilbertés",
        "kind": "alias"
      },
      {
        "label": "Kiribatisch",
        "kind": "alias"
      }
    ],
    "bug": [
      {
        "label": "Buginese",
        "kind": "local"
      },
      {
        "label": "Bugis",
        "kind": "english"
      },
      {
        "label": "布吉语",
        "kind": "alias"
      },
      {
        "label": "bugi",
        "kind": "alias"
      },
      {
        "label": "buginés",
        "kind": "alias"
      },
      {
        "label": "Buginesisch",
        "kind": "alias"
      }
    ],
    "izh": [
      {
        "label": "Ingrian",
        "kind": "local"
      },
      {
        "label": "ingrien",
        "kind": "alias"
      },
      {
        "label": "Ischorisch",
        "kind": "alias"
      }
    ],
    "kon": [
      {
        "label": "Kongo",
        "kind": "local"
      },
      {
        "label": "刚果语",
        "kind": "alias"
      },
      {
        "label": "kikongo",
        "kind": "alias"
      },
      {
        "label": "Kongolesisch",
        "kind": "alias"
      }
    ],
    "ell": [
      {
        "label": "Greek",
        "kind": "local"
      },
      {
        "label": "Ελληνικά",
        "kind": "native"
      },
      {
        "label": "Modern Greek",
        "kind": "english"
      },
      {
        "label": "希腊语",
        "kind": "alias"
      },
      {
        "label": "grec",
        "kind": "alias"
      },
      {
        "label": "griego",
        "kind": "alias"
      },
      {
        "label": "Griechisch",
        "kind": "alias"
      }
    ],
    "chg": [
      {
        "label": "Chagatai",
        "kind": "local"
      },
      {
        "label": "察合台语",
        "kind": "alias"
      },
      {
        "label": "tchaghataï",
        "kind": "alias"
      },
      {
        "label": "chagatái",
        "kind": "alias"
      },
      {
        "label": "Tschagataisch",
        "kind": "alias"
      }
    ],
    "pdc": [
      {
        "label": "Pennsylvania German",
        "kind": "local"
      },
      {
        "label": "pennsilfaanisch",
        "kind": "alias"
      },
      {
        "label": "Pennsylvaniadeutsch",
        "kind": "alias"
      }
    ],
    "aka": [
      {
        "label": "Akan",
        "kind": "local"
      },
      {
        "label": "阿肯语",
        "kind": "alias"
      }
    ],
    "kum": [
      {
        "label": "Kumyk",
        "kind": "local"
      },
      {
        "label": "库梅克语",
        "kind": "alias"
      },
      {
        "label": "koumyk",
        "kind": "alias"
      },
      {
        "label": "Kumükisch",
        "kind": "alias"
      }
    ],
    "hmo": [
      {
        "label": "Hiri Motu",
        "kind": "local"
      },
      {
        "label": "希里莫图语",
        "kind": "alias"
      },
      {
        "label": "Hiri-Motu",
        "kind": "alias"
      }
    ],
    "ale": [
      {
        "label": "Aleut",
        "kind": "local"
      },
      {
        "label": "阿留申语",
        "kind": "alias"
      },
      {
        "label": "aléoute",
        "kind": "alias"
      },
      {
        "label": "aleutiano",
        "kind": "alias"
      },
      {
        "label": "Aleutisch",
        "kind": "alias"
      }
    ],
    "awa": [
      {
        "label": "Awadhi",
        "kind": "local"
      },
      {
        "label": "阿瓦德语",
        "kind": "alias"
      },
      {
        "label": "avadhi",
        "kind": "alias"
      }
    ],
    "dlm": [
      {
        "label": "Dalmatian",
        "kind": "english"
      }
    ],
    "her": [
      {
        "label": "Herero",
        "kind": "local"
      },
      {
        "label": "赫雷罗语",
        "kind": "alias"
      },
      {
        "label": "héréro",
        "kind": "alias"
      }
    ],
    "enm": [
      {
        "label": "Middle English",
        "kind": "local"
      },
      {
        "label": "中古英语",
        "kind": "alias"
      },
      {
        "label": "moyen anglais",
        "kind": "alias"
      },
      {
        "label": "inglés medio",
        "kind": "alias"
      },
      {
        "label": "Mittelenglisch",
        "kind": "alias"
      }
    ],
    "prg": [
      {
        "label": "Prussian",
        "kind": "local"
      },
      {
        "label": "prūsiskan",
        "kind": "native"
      },
      {
        "label": "Old Prussian",
        "kind": "english"
      },
      {
        "label": "普鲁士语",
        "kind": "alias"
      },
      {
        "label": "prussien",
        "kind": "alias"
      },
      {
        "label": "prusiano",
        "kind": "alias"
      },
      {
        "label": "Altpreußisch",
        "kind": "alias"
      }
    ],
    "yrk": [
      {
        "label": "Nenets",
        "kind": "english"
      }
    ],
    "qya": [
      {
        "label": "Quenya",
        "kind": "english"
      }
    ],
    "vot": [
      {
        "label": "Votic",
        "kind": "local"
      },
      {
        "label": "沃提克语",
        "kind": "alias"
      },
      {
        "label": "vote",
        "kind": "alias"
      },
      {
        "label": "vótico",
        "kind": "alias"
      },
      {
        "label": "Wotisch",
        "kind": "alias"
      }
    ],
    "pau": [
      {
        "label": "Palauan",
        "kind": "local"
      },
      {
        "label": "帕劳语",
        "kind": "alias"
      },
      {
        "label": "palau",
        "kind": "alias"
      },
      {
        "label": "palauano",
        "kind": "alias"
      }
    ],
    "nan": [
      {
        "label": "Southern Min",
        "kind": "local"
      },
      {
        "label": "閩南語",
        "kind": "native"
      },
      {
        "label": "闽南语",
        "kind": "alias"
      },
      {
        "label": "minnan",
        "kind": "alias"
      },
      {
        "label": "Min Nan",
        "kind": "alias"
      },
      {
        "label": "hokkien",
        "kind": "alias"
      },
      {
        "label": "taiwanese hokkien",
        "kind": "alias"
      },
      {
        "label": "台语",
        "kind": "alias"
      },
      {
        "label": "臺語",
        "kind": "alias"
      },
      {
        "label": "河洛话",
        "kind": "alias"
      },
      {
        "label": "河洛話",
        "kind": "alias"
      }
    ],
    "nso": [
      {
        "label": "Northern Sotho",
        "kind": "local"
      },
      {
        "label": "Sesotho sa Leboa",
        "kind": "native"
      },
      {
        "label": "北索托语",
        "kind": "alias"
      },
      {
        "label": "sotho du Nord",
        "kind": "alias"
      },
      {
        "label": "sotho septentrional",
        "kind": "alias"
      },
      {
        "label": "Nord-Sotho",
        "kind": "alias"
      }
    ],
    "sag": [
      {
        "label": "Sango",
        "kind": "local"
      },
      {
        "label": "Sängö",
        "kind": "native"
      },
      {
        "label": "桑戈语",
        "kind": "alias"
      }
    ],
    "stq": [
      {
        "label": "Saterland Frisian",
        "kind": "local"
      },
      {
        "label": "saterlandais",
        "kind": "alias"
      },
      {
        "label": "Saterfriesisch",
        "kind": "alias"
      }
    ],
    "yue": [
      {
        "label": "Cantonese",
        "kind": "local"
      },
      {
        "label": "粵語",
        "kind": "native"
      },
      {
        "label": "粤语",
        "kind": "alias"
      },
      {
        "label": "cantonais",
        "kind": "alias"
      },
      {
        "label": "cantonés",
        "kind": "alias"
      },
      {
        "label": "Kantonesisch",
        "kind": "alias"
      },
      {
        "label": "cantonese chinese",
        "kind": "alias"
      },
      {
        "label": "guangdonghua",
        "kind": "alias"
      },
      {
        "label": "广东话",
        "kind": "alias"
      },
      {
        "label": "廣東話",
        "kind": "alias"
      },
      {
        "label": "白话",
        "kind": "alias"
      },
      {
        "label": "白話",
        "kind": "alias"
      }
    ],
    "xmf": [
      {
        "label": "Mingrelian",
        "kind": "local"
      },
      {
        "label": "mingrélien",
        "kind": "alias"
      },
      {
        "label": "Mingrelisch",
        "kind": "alias"
      }
    ],
    "bjn": [
      {
        "label": "Banjar",
        "kind": "local"
      },
      {
        "label": "Banjaresisch",
        "kind": "alias"
      }
    ],
    "ase": [
      {
        "label": "American Sign Language",
        "kind": "local"
      },
      {
        "label": "langue des signes américaine",
        "kind": "alias"
      },
      {
        "label": "Amerikanische Gebärdensprache",
        "kind": "alias"
      }
    ],
    "kau": [
      {
        "label": "Kanuri",
        "kind": "local"
      },
      {
        "label": "卡努里语",
        "kind": "alias"
      },
      {
        "label": "kanouri",
        "kind": "alias"
      }
    ],
    "nrn": [
      {
        "label": "Norn",
        "kind": "english"
      }
    ],
    "frr": [
      {
        "label": "Northern Frisian",
        "kind": "local"
      },
      {
        "label": "North Frisian",
        "kind": "english"
      },
      {
        "label": "北弗里西亚语",
        "kind": "alias"
      },
      {
        "label": "frison septentrional",
        "kind": "alias"
      },
      {
        "label": "frisón septentrional",
        "kind": "alias"
      },
      {
        "label": "Nordfriesisch",
        "kind": "alias"
      }
    ],
    "lug": [
      {
        "label": "Ganda",
        "kind": "local"
      },
      {
        "label": "Luganda",
        "kind": "native"
      },
      {
        "label": "卢干达语",
        "kind": "alias"
      }
    ],
    "cre": [
      {
        "label": "Cree",
        "kind": "local"
      },
      {
        "label": "克里语",
        "kind": "alias"
      }
    ],
    "gan": [
      {
        "label": "Gan Chinese",
        "kind": "local"
      },
      {
        "label": "赣语",
        "kind": "alias"
      },
      {
        "label": "gan",
        "kind": "alias"
      },
      {
        "label": "chino gan",
        "kind": "alias"
      },
      {
        "label": "贛語",
        "kind": "alias"
      }
    ],
    "kik": [
      {
        "label": "Kikuyu",
        "kind": "local"
      },
      {
        "label": "Gikuyu",
        "kind": "native"
      },
      {
        "label": "吉库尤语",
        "kind": "alias"
      }
    ],
    "mag": [
      {
        "label": "Magahi",
        "kind": "local"
      },
      {
        "label": "摩揭陀语",
        "kind": "alias"
      },
      {
        "label": "Khotta",
        "kind": "alias"
      }
    ],
    "pox": [
      {
        "label": "Polabian",
        "kind": "english"
      }
    ],
    "zha": [
      {
        "label": "Zhuang",
        "kind": "local"
      },
      {
        "label": "Vahcuengh",
        "kind": "native"
      },
      {
        "label": "壮语",
        "kind": "alias"
      },
      {
        "label": "壮文",
        "kind": "alias"
      },
      {
        "label": "壯語",
        "kind": "alias"
      }
    ],
    "bsk": [
      {
        "label": "Burushaski",
        "kind": "english"
      }
    ],
    "sva": [
      {
        "label": "Svan",
        "kind": "english"
      }
    ],
    "fro": [
      {
        "label": "Old French",
        "kind": "local"
      },
      {
        "label": "古法语",
        "kind": "alias"
      },
      {
        "label": "ancien français",
        "kind": "alias"
      },
      {
        "label": "francés antiguo",
        "kind": "alias"
      },
      {
        "label": "Altfranzösisch",
        "kind": "alias"
      }
    ],
    "nbl": [
      {
        "label": "South Ndebele",
        "kind": "local"
      },
      {
        "label": "Southern Ndebele",
        "kind": "english"
      },
      {
        "label": "南恩德贝勒语",
        "kind": "alias"
      },
      {
        "label": "ndébélé du Sud",
        "kind": "alias"
      },
      {
        "label": "ndebele meridional",
        "kind": "alias"
      },
      {
        "label": "Süd-Ndebele",
        "kind": "alias"
      }
    ],
    "lzz": [
      {
        "label": "Laz",
        "kind": "local"
      },
      {
        "label": "laze",
        "kind": "alias"
      },
      {
        "label": "Lasisch",
        "kind": "alias"
      }
    ],
    "tvl": [
      {
        "label": "Tuvalu",
        "kind": "local"
      },
      {
        "label": "Tuvaluan",
        "kind": "english"
      },
      {
        "label": "图瓦卢语",
        "kind": "alias"
      },
      {
        "label": "tuvaluano",
        "kind": "alias"
      },
      {
        "label": "Tuvaluisch",
        "kind": "alias"
      }
    ],
    "elx": [
      {
        "label": "Elamite",
        "kind": "local"
      },
      {
        "label": "埃兰语",
        "kind": "alias"
      },
      {
        "label": "élamite",
        "kind": "alias"
      },
      {
        "label": "elamita",
        "kind": "alias"
      },
      {
        "label": "Elamisch",
        "kind": "alias"
      }
    ],
    "koi": [
      {
        "label": "Komi-Permyak",
        "kind": "local"
      },
      {
        "label": "科米-彼尔米亚克语",
        "kind": "alias"
      },
      {
        "label": "komi-permiak",
        "kind": "alias"
      },
      {
        "label": "komi permio",
        "kind": "alias"
      },
      {
        "label": "Komi-Permjakisch",
        "kind": "alias"
      }
    ],
    "sgs": [
      {
        "label": "Samogitian",
        "kind": "local"
      },
      {
        "label": "samogitien",
        "kind": "alias"
      },
      {
        "label": "Samogitisch",
        "kind": "alias"
      }
    ],
    "sma": [
      {
        "label": "Southern Sami",
        "kind": "local"
      },
      {
        "label": "南萨米语",
        "kind": "alias"
      },
      {
        "label": "same du Sud",
        "kind": "alias"
      },
      {
        "label": "sami meridional",
        "kind": "alias"
      },
      {
        "label": "Südsamisch",
        "kind": "alias"
      }
    ],
    "ext": [
      {
        "label": "Extremaduran",
        "kind": "local"
      },
      {
        "label": "estrémègne",
        "kind": "alias"
      },
      {
        "label": "Extremadurisch",
        "kind": "alias"
      }
    ],
    "evn": [
      {
        "label": "Evenki",
        "kind": "english"
      }
    ],
    "kab": [
      {
        "label": "Kabyle",
        "kind": "local"
      },
      {
        "label": "Taqbaylit",
        "kind": "native"
      },
      {
        "label": "卡拜尔语",
        "kind": "alias"
      },
      {
        "label": "cabileño",
        "kind": "alias"
      },
      {
        "label": "Kabylisch",
        "kind": "alias"
      }
    ],
    "rap": [
      {
        "label": "Rapanui",
        "kind": "local"
      },
      {
        "label": "Rapa Nui",
        "kind": "english"
      },
      {
        "label": "拉帕努伊语",
        "kind": "alias"
      }
    ],
    "rut": [
      {
        "label": "Rutulian",
        "kind": "english"
      }
    ],
    "lzh": [
      {
        "label": "Literary Chinese",
        "kind": "local"
      },
      {
        "label": "Classical Chinese",
        "kind": "english"
      },
      {
        "label": "chinois littéraire",
        "kind": "alias"
      },
      {
        "label": "Klassisches Chinesisch",
        "kind": "alias"
      }
    ],
    "raj": [
      {
        "label": "Rajasthani",
        "kind": "local"
      },
      {
        "label": "राजस्थानी",
        "kind": "native"
      },
      {
        "label": "拉贾斯坦语",
        "kind": "alias"
      }
    ],
    "srn": [
      {
        "label": "Sranan Tongo",
        "kind": "local"
      },
      {
        "label": "苏里南汤加语",
        "kind": "alias"
      },
      {
        "label": "Srananisch",
        "kind": "alias"
      }
    ],
    "niu": [
      {
        "label": "Niuean",
        "kind": "local"
      },
      {
        "label": "纽埃语",
        "kind": "alias"
      },
      {
        "label": "niuéen",
        "kind": "alias"
      },
      {
        "label": "niueano",
        "kind": "alias"
      },
      {
        "label": "Niue",
        "kind": "alias"
      }
    ],
    "smn": [
      {
        "label": "Inari Sami",
        "kind": "local"
      },
      {
        "label": "anarâškielâ",
        "kind": "native"
      },
      {
        "label": "伊纳里萨米语",
        "kind": "alias"
      },
      {
        "label": "same d’Inari",
        "kind": "alias"
      },
      {
        "label": "sami inari",
        "kind": "alias"
      },
      {
        "label": "Inari-Samisch",
        "kind": "alias"
      }
    ],
    "glk": [
      {
        "label": "Gilaki",
        "kind": "local"
      }
    ],
    "peo": [
      {
        "label": "Old Persian",
        "kind": "local"
      },
      {
        "label": "古波斯语",
        "kind": "alias"
      },
      {
        "label": "persan ancien",
        "kind": "alias"
      },
      {
        "label": "persa antiguo",
        "kind": "alias"
      },
      {
        "label": "Altpersisch",
        "kind": "alias"
      }
    ],
    "ryu": [
      {
        "label": "Okinawan",
        "kind": "english"
      }
    ],
    "tly": [
      {
        "label": "Talysh",
        "kind": "local"
      },
      {
        "label": "Talisch",
        "kind": "alias"
      }
    ],
    "chu": [
      {
        "label": "Church Slavic",
        "kind": "local"
      },
      {
        "label": "Church Slavonic",
        "kind": "english"
      },
      {
        "label": "教会斯拉夫语",
        "kind": "alias"
      },
      {
        "label": "slavon d’église",
        "kind": "alias"
      },
      {
        "label": "eslavo eclesiástico",
        "kind": "alias"
      },
      {
        "label": "Kirchenslawisch",
        "kind": "alias"
      }
    ],
    "orv": [
      {
        "label": "Old East Slavic",
        "kind": "english"
      }
    ],
    "fon": [
      {
        "label": "Fon",
        "kind": "local"
      },
      {
        "label": "丰语",
        "kind": "alias"
      }
    ],
    "pam": [
      {
        "label": "Pampanga",
        "kind": "local"
      },
      {
        "label": "Kapampangan",
        "kind": "english"
      },
      {
        "label": "邦板牙语",
        "kind": "alias"
      },
      {
        "label": "pampangan",
        "kind": "alias"
      },
      {
        "label": "Pampanggan",
        "kind": "alias"
      }
    ],
    "mad": [
      {
        "label": "Madurese",
        "kind": "local"
      },
      {
        "label": "马都拉语",
        "kind": "alias"
      },
      {
        "label": "madurais",
        "kind": "alias"
      },
      {
        "label": "madurés",
        "kind": "alias"
      },
      {
        "label": "Maduresisch",
        "kind": "alias"
      }
    ],
    "fit": [
      {
        "label": "Tornedalen Finnish",
        "kind": "local"
      },
      {
        "label": "Meänkieli",
        "kind": "english"
      },
      {
        "label": "finnois tornédalien",
        "kind": "alias"
      }
    ],
    "pal": [
      {
        "label": "Pahlavi",
        "kind": "local"
      },
      {
        "label": "Middle Persian",
        "kind": "english"
      },
      {
        "label": "巴拉维语",
        "kind": "alias"
      },
      {
        "label": "Mittelpersisch",
        "kind": "alias"
      }
    ],
    "hne": [
      {
        "label": "Chhattisgarhi",
        "kind": "english"
      }
    ],
    "ckb": [
      {
        "label": "Central Kurdish",
        "kind": "local"
      },
      {
        "label": "کوردیی ناوەندی",
        "kind": "native"
      },
      {
        "label": "中库尔德语",
        "kind": "alias"
      },
      {
        "label": "sorani",
        "kind": "alias"
      },
      {
        "label": "kurdo sorani",
        "kind": "alias"
      },
      {
        "label": "Zentralkurdisch",
        "kind": "alias"
      }
    ],
    "bpy": [
      {
        "label": "Bishnupriya",
        "kind": "local"
      },
      {
        "label": "Bishnupriya Manipuri",
        "kind": "english"
      }
    ],
    "sog": [
      {
        "label": "Sogdien",
        "kind": "local"
      },
      {
        "label": "Sogdian",
        "kind": "english"
      },
      {
        "label": "粟特语",
        "kind": "alias"
      },
      {
        "label": "sogdiano",
        "kind": "alias"
      },
      {
        "label": "Sogdisch",
        "kind": "alias"
      }
    ],
    "ipk": [
      {
        "label": "Inupiaq",
        "kind": "local"
      },
      {
        "label": "Iñupiaq",
        "kind": "english"
      },
      {
        "label": "伊努皮克语",
        "kind": "alias"
      },
      {
        "label": "Inupiak",
        "kind": "alias"
      }
    ],
    "mwr": [
      {
        "label": "Marwari",
        "kind": "local"
      },
      {
        "label": "马尔瓦里语",
        "kind": "alias"
      },
      {
        "label": "marwarî",
        "kind": "alias"
      }
    ],
    "uga": [
      {
        "label": "Ugaritic",
        "kind": "local"
      },
      {
        "label": "乌加里特语",
        "kind": "alias"
      },
      {
        "label": "ougaritique",
        "kind": "alias"
      },
      {
        "label": "ugarítico",
        "kind": "alias"
      },
      {
        "label": "Ugaritisch",
        "kind": "alias"
      }
    ],
    "fkv": [
      {
        "label": "Kven",
        "kind": "english"
      }
    ],
    "tab": [
      {
        "label": "Tabasaran",
        "kind": "english"
      }
    ],
    "jam": [
      {
        "label": "Jamaican Creole English",
        "kind": "local"
      },
      {
        "label": "Jamaican Patois",
        "kind": "english"
      },
      {
        "label": "créole jamaïcain",
        "kind": "alias"
      },
      {
        "label": "Jamaikanisch-Kreolisch",
        "kind": "alias"
      }
    ],
    "bgc": [
      {
        "label": "Haryanvi",
        "kind": "local"
      },
      {
        "label": "हरियाणवी",
        "kind": "native"
      },
      {
        "label": "哈里亚纳语",
        "kind": "alias"
      }
    ],
    "nio": [
      {
        "label": "Nganasan",
        "kind": "english"
      }
    ],
    "mnw": [
      {
        "label": "Mon",
        "kind": "english"
      }
    ],
    "skr": [
      {
        "label": "Saraiki",
        "kind": "english"
      },
      {
        "label": "色莱基语",
        "kind": "alias"
      }
    ],
    "tkl": [
      {
        "label": "Tokelauan",
        "kind": "local"
      },
      {
        "label": "托克劳语",
        "kind": "alias"
      },
      {
        "label": "tokelau",
        "kind": "alias"
      },
      {
        "label": "tokelauano",
        "kind": "alias"
      },
      {
        "label": "Tokelauanisch",
        "kind": "alias"
      }
    ],
    "dng": [
      {
        "label": "Dungan",
        "kind": "english"
      }
    ],
    "kmr": [
      {
        "label": "Northern Kurdish",
        "kind": "local"
      },
      {
        "label": "kurdî (kurmancî)",
        "kind": "native"
      },
      {
        "label": "库尔曼吉语",
        "kind": "alias"
      },
      {
        "label": "kurde",
        "kind": "alias"
      },
      {
        "label": "kurdo",
        "kind": "alias"
      },
      {
        "label": "Kurdisch",
        "kind": "alias"
      },
      {
        "label": "kurmanji",
        "kind": "alias"
      }
    ],
    "osc": [
      {
        "label": "Oscan",
        "kind": "english"
      }
    ],
    "smj": [
      {
        "label": "Lule Sami",
        "kind": "local"
      },
      {
        "label": "吕勒萨米语",
        "kind": "alias"
      },
      {
        "label": "same de Lule",
        "kind": "alias"
      },
      {
        "label": "sami lule",
        "kind": "alias"
      },
      {
        "label": "Lule-Samisch",
        "kind": "alias"
      }
    ],
    "cbk": [
      {
        "label": "Chavacano",
        "kind": "english"
      }
    ],
    "sel": [
      {
        "label": "Selkup",
        "kind": "local"
      },
      {
        "label": "塞尔库普语",
        "kind": "alias"
      },
      {
        "label": "selkoupe",
        "kind": "alias"
      },
      {
        "label": "Selkupisch",
        "kind": "alias"
      }
    ],
    "tmh": [
      {
        "label": "Tamashek",
        "kind": "local"
      },
      {
        "label": "Tuareg",
        "kind": "english"
      },
      {
        "label": "塔马奇克语",
        "kind": "alias"
      },
      {
        "label": "tamacheq",
        "kind": "alias"
      },
      {
        "label": "Tamaseq",
        "kind": "alias"
      }
    ],
    "ltg": [
      {
        "label": "Latgalian",
        "kind": "local"
      },
      {
        "label": "latgalien",
        "kind": "alias"
      },
      {
        "label": "Lettgallisch",
        "kind": "alias"
      }
    ],
    "ket": [
      {
        "label": "Ket",
        "kind": "english"
      }
    ],
    "sjd": [
      {
        "label": "Kildin Sami",
        "kind": "english"
      }
    ],
    "lab": [
      {
        "label": "Linear A",
        "kind": "english"
      }
    ],
    "hil": [
      {
        "label": "Hiligaynon",
        "kind": "local"
      },
      {
        "label": "希利盖农语",
        "kind": "alias"
      }
    ],
    "shi": [
      {
        "label": "Tachelhit",
        "kind": "local"
      },
      {
        "label": "ⵜⴰⵛⵍⵃⵉⵜ",
        "kind": "native"
      },
      {
        "label": "Tashelhit",
        "kind": "english"
      },
      {
        "label": "希尔哈语",
        "kind": "alias"
      },
      {
        "label": "chleuh",
        "kind": "alias"
      },
      {
        "label": "Taschelhit",
        "kind": "alias"
      }
    ],
    "prv": [
      {
        "label": "Provençal",
        "kind": "english"
      }
    ],
    "gon": [
      {
        "label": "Gondi",
        "kind": "local"
      },
      {
        "label": "冈德语",
        "kind": "alias"
      }
    ],
    "naq": [
      {
        "label": "Nama",
        "kind": "local"
      },
      {
        "label": "Khoekhoegowab",
        "kind": "native"
      },
      {
        "label": "Khoekhoe",
        "kind": "english"
      },
      {
        "label": "纳马语",
        "kind": "alias"
      }
    ],
    "pag": [
      {
        "label": "Pangasinan",
        "kind": "local"
      },
      {
        "label": "邦阿西南语",
        "kind": "alias"
      },
      {
        "label": "pangasinán",
        "kind": "alias"
      }
    ],
    "cho": [
      {
        "label": "Choctaw",
        "kind": "local"
      },
      {
        "label": "乔克托语",
        "kind": "alias"
      }
    ],
    "kpy": [
      {
        "label": "Koryak",
        "kind": "english"
      }
    ],
    "ttt": [
      {
        "label": "Muslim Tat",
        "kind": "local"
      },
      {
        "label": "Tat",
        "kind": "english"
      },
      {
        "label": "tati caucasien",
        "kind": "alias"
      },
      {
        "label": "Tatisch",
        "kind": "alias"
      }
    ],
    "hbo": [
      {
        "label": "Biblical Hebrew",
        "kind": "english"
      }
    ],
    "yua": [
      {
        "label": "Yucatec Maya",
        "kind": "english"
      }
    ],
    "xpr": [
      {
        "label": "Parthian",
        "kind": "english"
      }
    ],
    "anp": [
      {
        "label": "Angika",
        "kind": "local"
      },
      {
        "label": "昂加语",
        "kind": "alias"
      }
    ],
    "eve": [
      {
        "label": "Even",
        "kind": "english"
      }
    ],
    "dyu": [
      {
        "label": "Dyula",
        "kind": "local"
      },
      {
        "label": "Dioula",
        "kind": "english"
      },
      {
        "label": "迪尤拉语",
        "kind": "alias"
      },
      {
        "label": "diula",
        "kind": "alias"
      }
    ],
    "dlg": [
      {
        "label": "Dolgan",
        "kind": "english"
      }
    ],
    "goh": [
      {
        "label": "Old High German",
        "kind": "local"
      },
      {
        "label": "古高地德语",
        "kind": "alias"
      },
      {
        "label": "ancien haut allemand",
        "kind": "alias"
      },
      {
        "label": "alto alemán antiguo",
        "kind": "alias"
      },
      {
        "label": "Althochdeutsch",
        "kind": "alias"
      }
    ],
    "mos": [
      {
        "label": "Mossi",
        "kind": "local"
      },
      {
        "label": "Mooré",
        "kind": "english"
      },
      {
        "label": "莫西语",
        "kind": "alias"
      },
      {
        "label": "moré",
        "kind": "alias"
      }
    ],
    "niv": [
      {
        "label": "Nivkh",
        "kind": "english"
      }
    ],
    "pnt": [
      {
        "label": "Pontic",
        "kind": "local"
      },
      {
        "label": "Pontic Greek",
        "kind": "english"
      },
      {
        "label": "pontique",
        "kind": "alias"
      },
      {
        "label": "Pontisch",
        "kind": "alias"
      }
    ],
    "uby": [
      {
        "label": "Ubykh",
        "kind": "english"
      }
    ],
    "fsl": [
      {
        "label": "French Sign Language",
        "kind": "english"
      }
    ],
    "oji": [
      {
        "label": "Ojibwa",
        "kind": "local"
      },
      {
        "label": "Ojibwe",
        "kind": "english"
      },
      {
        "label": "奥吉布瓦语",
        "kind": "alias"
      }
    ],
    "bem": [
      {
        "label": "Bemba",
        "kind": "local"
      },
      {
        "label": "Ichibemba",
        "kind": "native"
      },
      {
        "label": "本巴语",
        "kind": "alias"
      }
    ],
    "mnk": [
      {
        "label": "Mandingo",
        "kind": "local"
      },
      {
        "label": "Mandinka",
        "kind": "english"
      },
      {
        "label": "曼丁哥语",
        "kind": "alias"
      },
      {
        "label": "mandingue",
        "kind": "alias"
      },
      {
        "label": "Malinke",
        "kind": "alias"
      }
    ],
    "kdr": [
      {
        "label": "Karaim",
        "kind": "english"
      }
    ],
    "ary": [
      {
        "label": "Moroccan Arabic",
        "kind": "local"
      },
      {
        "label": "arabe marocain",
        "kind": "alias"
      },
      {
        "label": "Marokkanisches Arabisch",
        "kind": "alias"
      }
    ],
    "sms": [
      {
        "label": "Skolt Sami",
        "kind": "local"
      },
      {
        "label": "斯科特萨米语",
        "kind": "alias"
      },
      {
        "label": "same skolt",
        "kind": "alias"
      },
      {
        "label": "sami skolt",
        "kind": "alias"
      },
      {
        "label": "Skolt-Samisch",
        "kind": "alias"
      }
    ],
    "chy": [
      {
        "label": "Cheyenne",
        "kind": "local"
      },
      {
        "label": "夏延语",
        "kind": "alias"
      },
      {
        "label": "cheyene",
        "kind": "alias"
      }
    ],
    "cdo": [
      {
        "label": "Eastern Min",
        "kind": "english"
      }
    ],
    "agx": [
      {
        "label": "Aghul",
        "kind": "english"
      }
    ],
    "wym": [
      {
        "label": "Wymysorys",
        "kind": "english"
      }
    ],
    "qxq": [
      {
        "label": "Qashqai",
        "kind": "english"
      }
    ],
    "xil": [
      {
        "label": "Illyrian",
        "kind": "english"
      }
    ],
    "gld": [
      {
        "label": "Nanai",
        "kind": "english"
      }
    ],
    "crs": [
      {
        "label": "Seselwa Creole French",
        "kind": "local"
      },
      {
        "label": "Seychellois Creole",
        "kind": "english"
      },
      {
        "label": "塞舌尔克里奥尔语",
        "kind": "alias"
      },
      {
        "label": "créole seychellois",
        "kind": "alias"
      },
      {
        "label": "criollo seychelense",
        "kind": "alias"
      },
      {
        "label": "Seychellenkreol",
        "kind": "alias"
      }
    ],
    "tig": [
      {
        "label": "Tigre",
        "kind": "local"
      },
      {
        "label": "提格雷语",
        "kind": "alias"
      },
      {
        "label": "tigré",
        "kind": "alias"
      }
    ],
    "wbl": [
      {
        "label": "Wakhi",
        "kind": "english"
      }
    ],
    "lus": [
      {
        "label": "Mizo",
        "kind": "local"
      },
      {
        "label": "米佐语",
        "kind": "alias"
      },
      {
        "label": "lushaï",
        "kind": "alias"
      },
      {
        "label": "Lushai",
        "kind": "alias"
      }
    ],
    "xcb": [
      {
        "label": "Cumbric",
        "kind": "english"
      }
    ],
    "vsn": [
      {
        "label": "Vedic Sanskrit",
        "kind": "english"
      }
    ],
    "hyw": [
      {
        "label": "Western Armenian",
        "kind": "english"
      }
    ],
    "avk": [
      {
        "label": "Kotava",
        "kind": "local"
      }
    ],
    "slr": [
      {
        "label": "Salar",
        "kind": "english"
      }
    ],
    "otk": [
      {
        "label": "Old Turkic",
        "kind": "english"
      }
    ],
    "nde": [
      {
        "label": "North Ndebele",
        "kind": "local"
      },
      {
        "label": "isiNdebele",
        "kind": "native"
      },
      {
        "label": "Northern Ndebele",
        "kind": "english"
      },
      {
        "label": "北恩德贝勒语",
        "kind": "alias"
      },
      {
        "label": "ndébélé du Nord",
        "kind": "alias"
      },
      {
        "label": "ndebele septentrional",
        "kind": "alias"
      },
      {
        "label": "Nord-Ndebele",
        "kind": "alias"
      }
    ],
    "kha": [
      {
        "label": "Khasi",
        "kind": "local"
      },
      {
        "label": "卡西语",
        "kind": "alias"
      }
    ],
    "twi": [
      {
        "label": "Twi",
        "kind": "local"
      },
      {
        "label": "Akan",
        "kind": "native"
      },
      {
        "label": "契维语",
        "kind": "alias"
      }
    ],
    "grt": [
      {
        "label": "Garo",
        "kind": "english"
      }
    ],
    "txh": [
      {
        "label": "Thracian",
        "kind": "english"
      }
    ],
    "khw": [
      {
        "label": "Khowar",
        "kind": "local"
      }
    ],
    "xbc": [
      {
        "label": "Bactrian",
        "kind": "english"
      }
    ],
    "xpi": [
      {
        "label": "Pictish",
        "kind": "english"
      }
    ],
    "mxi": [
      {
        "label": "Andalusi Romance",
        "kind": "english"
      }
    ],
    "xpu": [
      {
        "label": "Punic",
        "kind": "english"
      }
    ],
    "sgh": [
      {
        "label": "Shughni",
        "kind": "english"
      }
    ],
    "bra": [
      {
        "label": "Braj",
        "kind": "local"
      },
      {
        "label": "Braj Bhasha",
        "kind": "english"
      },
      {
        "label": "布拉杰语",
        "kind": "alias"
      },
      {
        "label": "Braj-Bhakha",
        "kind": "alias"
      }
    ],
    "snk": [
      {
        "label": "Soninke",
        "kind": "local"
      },
      {
        "label": "索宁克语",
        "kind": "alias"
      },
      {
        "label": "soninké",
        "kind": "alias"
      }
    ],
    "xpg": [
      {
        "label": "Phrygian",
        "kind": "english"
      }
    ],
    "sjn": [
      {
        "label": "Sindarin",
        "kind": "english"
      }
    ],
    "ruo": [
      {
        "label": "Istro-Romanian",
        "kind": "english"
      }
    ],
    "nzs": [
      {
        "label": "New Zealand Sign Language",
        "kind": "english"
      }
    ],
    "cjs": [
      {
        "label": "Shor",
        "kind": "english"
      }
    ],
    "lua": [
      {
        "label": "Luba-Lulua",
        "kind": "local"
      },
      {
        "label": "Luba-Kasai",
        "kind": "english"
      },
      {
        "label": "卢巴-卢拉语",
        "kind": "alias"
      },
      {
        "label": "luba-kasaï (ciluba)",
        "kind": "alias"
      }
    ],
    "vls": [
      {
        "label": "West Flemish",
        "kind": "local"
      },
      {
        "label": "flamand occidental",
        "kind": "alias"
      },
      {
        "label": "Westflämisch",
        "kind": "alias"
      }
    ],
    "zea": [
      {
        "label": "Zeelandic",
        "kind": "local"
      },
      {
        "label": "zélandais",
        "kind": "alias"
      },
      {
        "label": "Seeländisch",
        "kind": "alias"
      }
    ],
    "pfl": [
      {
        "label": "Palatine German",
        "kind": "local"
      },
      {
        "label": "Palatinate German",
        "kind": "english"
      },
      {
        "label": "allemand palatin",
        "kind": "alias"
      },
      {
        "label": "Pfälzisch",
        "kind": "alias"
      }
    ],
    "aii": [
      {
        "label": "Assyrian Neo-Aramaic",
        "kind": "english"
      }
    ],
    "bfi": [
      {
        "label": "British Sign Language",
        "kind": "english"
      }
    ],
    "osx": [
      {
        "label": "Old Saxon",
        "kind": "english"
      }
    ],
    "xhu": [
      {
        "label": "Hurrian",
        "kind": "english"
      }
    ],
    "sjt": [
      {
        "label": "Ter Sami",
        "kind": "english"
      }
    ],
    "xvn": [
      {
        "label": "Vandalic",
        "kind": "english"
      }
    ],
    "yai": [
      {
        "label": "Yaghnobi",
        "kind": "english"
      }
    ],
    "sje": [
      {
        "label": "Pite Sami",
        "kind": "english"
      }
    ],
    "shn": [
      {
        "label": "Shan",
        "kind": "local"
      },
      {
        "label": "掸语",
        "kind": "alias"
      },
      {
        "label": "Schan",
        "kind": "alias"
      }
    ],
    "tli": [
      {
        "label": "Tlingit",
        "kind": "local"
      },
      {
        "label": "特林吉特语",
        "kind": "alias"
      }
    ],
    "sga": [
      {
        "label": "Old Irish",
        "kind": "local"
      },
      {
        "label": "古爱尔兰语",
        "kind": "alias"
      },
      {
        "label": "ancien irlandais",
        "kind": "alias"
      },
      {
        "label": "irlandés antiguo",
        "kind": "alias"
      },
      {
        "label": "Altirisch",
        "kind": "alias"
      }
    ],
    "lbj": [
      {
        "label": "Ladakhi",
        "kind": "english"
      }
    ],
    "bhb": [
      {
        "label": "Bhili",
        "kind": "english"
      }
    ],
    "rar": [
      {
        "label": "Rarotongan",
        "kind": "local"
      },
      {
        "label": "Cook Islands Maori",
        "kind": "english"
      },
      {
        "label": "拉罗汤加语",
        "kind": "alias"
      },
      {
        "label": "rarotongien",
        "kind": "alias"
      },
      {
        "label": "rarotongano",
        "kind": "alias"
      },
      {
        "label": "Rarotonganisch",
        "kind": "alias"
      }
    ],
    "tkr": [
      {
        "label": "Tsakhur",
        "kind": "local"
      },
      {
        "label": "tsakhour",
        "kind": "alias"
      },
      {
        "label": "Tsachurisch",
        "kind": "alias"
      }
    ],
    "srh": [
      {
        "label": "Sarikoli",
        "kind": "english"
      }
    ],
    "uum": [
      {
        "label": "Urum",
        "kind": "english"
      }
    ],
    "sia": [
      {
        "label": "Akkala Sami",
        "kind": "english"
      }
    ],
    "ist": [
      {
        "label": "Istriot",
        "kind": "english"
      }
    ],
    "xld": [
      {
        "label": "Lydian",
        "kind": "english"
      }
    ],
    "lkt": [
      {
        "label": "Lakota",
        "kind": "local"
      },
      {
        "label": "Lakȟólʼiyapi",
        "kind": "native"
      },
      {
        "label": "拉科塔语",
        "kind": "alias"
      }
    ],
    "kim": [
      {
        "label": "Tofa",
        "kind": "english"
      }
    ],
    "jrb": [
      {
        "label": "Judeo-Arabic",
        "kind": "local"
      },
      {
        "label": "犹太阿拉伯语",
        "kind": "alias"
      },
      {
        "label": "judéo-arabe",
        "kind": "alias"
      },
      {
        "label": "judeo-árabe",
        "kind": "alias"
      },
      {
        "label": "Jüdisch-Arabisch",
        "kind": "alias"
      }
    ],
    "tzm": [
      {
        "label": "Central Atlas Tamazight",
        "kind": "local"
      },
      {
        "label": "Tamaziɣt n laṭlaṣ",
        "kind": "native"
      },
      {
        "label": "塔马齐格特语",
        "kind": "alias"
      },
      {
        "label": "amazighe de l’Atlas central",
        "kind": "alias"
      },
      {
        "label": "tamazight del Atlas Central",
        "kind": "alias"
      },
      {
        "label": "Zentralatlas-Tamazight",
        "kind": "alias"
      }
    ],
    "arq": [
      {
        "label": "Algerian Arabic",
        "kind": "local"
      },
      {
        "label": "arabe algérien",
        "kind": "alias"
      },
      {
        "label": "Algerisches Arabisch",
        "kind": "alias"
      }
    ],
    "myp": [
      {
        "label": "Pirahã",
        "kind": "english"
      }
    ],
    "mey": [
      {
        "label": "Hassaniya Arabic",
        "kind": "english"
      }
    ],
    "tsg": [
      {
        "label": "Tausug",
        "kind": "english"
      }
    ],
    "rif": [
      {
        "label": "Riffian",
        "kind": "local"
      },
      {
        "label": "Tarifit",
        "kind": "english"
      },
      {
        "label": "里夫语",
        "kind": "alias"
      },
      {
        "label": "rifain",
        "kind": "alias"
      }
    ],
    "mrj": [
      {
        "label": "Western Mari",
        "kind": "local"
      },
      {
        "label": "Hill Mari",
        "kind": "english"
      },
      {
        "label": "mari occidental",
        "kind": "alias"
      },
      {
        "label": "Bergmari",
        "kind": "alias"
      }
    ],
    "bft": [
      {
        "label": "Balti",
        "kind": "english"
      }
    ],
    "clw": [
      {
        "label": "Chulym",
        "kind": "english"
      }
    ],
    "jct": [
      {
        "label": "Krymchak",
        "kind": "english"
      }
    ],
    "udi": [
      {
        "label": "Udi",
        "kind": "english"
      }
    ],
    "sju": [
      {
        "label": "Ume Sami",
        "kind": "english"
      }
    ],
    "ruq": [
      {
        "label": "Megleno-Romanian",
        "kind": "english"
      }
    ],
    "xga": [
      {
        "label": "Galatian",
        "kind": "english"
      }
    ],
    "aib": [
      {
        "label": "Äynu",
        "kind": "english"
      }
    ],
    "ncs": [
      {
        "label": "Nicaraguan Sign Language",
        "kind": "english"
      }
    ],
    "afb": [
      {
        "label": "Gulf Arabic",
        "kind": "english"
      }
    ],
    "swg": [
      {
        "label": "Swabian",
        "kind": "english"
      }
    ],
    "eya": [
      {
        "label": "Eyak",
        "kind": "english"
      }
    ],
    "dar": [
      {
        "label": "Dargwa",
        "kind": "local"
      },
      {
        "label": "达尔格瓦语",
        "kind": "alias"
      },
      {
        "label": "dargva",
        "kind": "alias"
      },
      {
        "label": "Darginisch",
        "kind": "alias"
      }
    ],
    "trp": [
      {
        "label": "Kokborok",
        "kind": "english"
      }
    ],
    "xlc": [
      {
        "label": "Lycian",
        "kind": "english"
      }
    ],
    "hoc": [
      {
        "label": "Ho",
        "kind": "english"
      }
    ],
    "pih": [
      {
        "label": "Pitkern",
        "kind": "english"
      }
    ],
    "xum": [
      {
        "label": "Umbrian",
        "kind": "english"
      }
    ],
    "din": [
      {
        "label": "Dinka",
        "kind": "local"
      },
      {
        "label": "丁卡语",
        "kind": "alias"
      }
    ],
    "lif": [
      {
        "label": "Limbu",
        "kind": "english"
      }
    ],
    "lki": [
      {
        "label": "Laki",
        "kind": "english"
      }
    ],
    "ise": [
      {
        "label": "Italian Sign Language",
        "kind": "english"
      }
    ],
    "scl": [
      {
        "label": "Shina",
        "kind": "english"
      }
    ],
    "xeb": [
      {
        "label": "Eblaite",
        "kind": "english"
      }
    ],
    "xur": [
      {
        "label": "Urartian",
        "kind": "english"
      }
    ],
    "zkz": [
      {
        "label": "Khazar language",
        "kind": "english"
      }
    ],
    "gmy": [
      {
        "label": "Mycenaean Greek",
        "kind": "english"
      }
    ],
    "gmh": [
      {
        "label": "Middle High German",
        "kind": "local"
      },
      {
        "label": "中古高地德语",
        "kind": "alias"
      },
      {
        "label": "moyen haut-allemand",
        "kind": "alias"
      },
      {
        "label": "alto alemán medio",
        "kind": "alias"
      },
      {
        "label": "Mittelhochdeutsch",
        "kind": "alias"
      }
    ],
    "aln": [
      {
        "label": "Gheg Albanian",
        "kind": "local"
      },
      {
        "label": "Gheg",
        "kind": "english"
      },
      {
        "label": "guègue",
        "kind": "alias"
      },
      {
        "label": "Gegisch",
        "kind": "alias"
      }
    ],
    "alt": [
      {
        "label": "Southern Altai",
        "kind": "local"
      },
      {
        "label": "南阿尔泰语",
        "kind": "alias"
      },
      {
        "label": "altaï du Sud",
        "kind": "alias"
      },
      {
        "label": "altái meridional",
        "kind": "alias"
      },
      {
        "label": "Süd-Altaisch",
        "kind": "alias"
      }
    ],
    "rhg": [
      {
        "label": "Rohingya",
        "kind": "local"
      },
      {
        "label": "罗兴亚语",
        "kind": "alias"
      },
      {
        "label": "rohinyá",
        "kind": "alias"
      },
      {
        "label": "Rohingyalisch",
        "kind": "alias"
      }
    ],
    "lrl": [
      {
        "label": "Achomi",
        "kind": "english"
      }
    ],
    "tum": [
      {
        "label": "Tumbuka",
        "kind": "local"
      },
      {
        "label": "通布卡语",
        "kind": "alias"
      }
    ],
    "bin": [
      {
        "label": "Bini",
        "kind": "local"
      },
      {
        "label": "Edo",
        "kind": "english"
      },
      {
        "label": "比尼语",
        "kind": "alias"
      }
    ],
    "bik": [
      {
        "label": "Bikol",
        "kind": "local"
      },
      {
        "label": "比科尔语",
        "kind": "alias"
      },
      {
        "label": "bicol",
        "kind": "alias"
      }
    ],
    "iii": [
      {
        "label": "Sichuan Yi",
        "kind": "local"
      },
      {
        "label": "ꆈꌠꉙ",
        "kind": "native"
      },
      {
        "label": "凉山彝语",
        "kind": "alias"
      },
      {
        "label": "yi du Sichuan",
        "kind": "alias"
      },
      {
        "label": "yi de Sichuán",
        "kind": "alias"
      },
      {
        "label": "Yi",
        "kind": "alias"
      },
      {
        "label": "nuosu",
        "kind": "alias"
      },
      {
        "label": "彝语",
        "kind": "alias"
      },
      {
        "label": "彝文",
        "kind": "alias"
      },
      {
        "label": "彝語",
        "kind": "alias"
      }
    ],
    "olo": [
      {
        "label": "Livvi-Karelian",
        "kind": "english"
      }
    ],
    "xsr": [
      {
        "label": "Sherpa",
        "kind": "english"
      }
    ],
    "umb": [
      {
        "label": "Umbundu",
        "kind": "local"
      },
      {
        "label": "翁本杜语",
        "kind": "alias"
      }
    ],
    "acm": [
      {
        "label": "Iraqi Arabic",
        "kind": "english"
      }
    ],
    "sas": [
      {
        "label": "Sasak",
        "kind": "local"
      },
      {
        "label": "萨萨克语",
        "kind": "alias"
      }
    ],
    "kua": [
      {
        "label": "Kuanyama",
        "kind": "local"
      },
      {
        "label": "Kwanyama",
        "kind": "english"
      },
      {
        "label": "宽亚玛语",
        "kind": "alias"
      }
    ]
  },
  "fr-FR": {
    "eng": [
      {
        "label": "anglais",
        "kind": "local"
      },
      {
        "label": "English",
        "kind": "native"
      },
      {
        "label": "英语",
        "kind": "alias"
      },
      {
        "label": "inglés",
        "kind": "alias"
      },
      {
        "label": "Englisch",
        "kind": "alias"
      },
      {
        "label": "英文",
        "kind": "alias"
      },
      {
        "label": "英語",
        "kind": "alias"
      },
      {
        "label": "american english",
        "kind": "alias"
      },
      {
        "label": "british english",
        "kind": "alias"
      }
    ],
    "deu": [
      {
        "label": "allemand",
        "kind": "local"
      },
      {
        "label": "Deutsch",
        "kind": "native"
      },
      {
        "label": "German",
        "kind": "english"
      },
      {
        "label": "德语",
        "kind": "alias"
      },
      {
        "label": "alemán",
        "kind": "alias"
      },
      {
        "label": "德文",
        "kind": "alias"
      },
      {
        "label": "德語",
        "kind": "alias"
      }
    ],
    "spa": [
      {
        "label": "espagnol",
        "kind": "local"
      },
      {
        "label": "español",
        "kind": "native"
      },
      {
        "label": "Spanish",
        "kind": "english"
      },
      {
        "label": "西班牙语",
        "kind": "alias"
      },
      {
        "label": "Spanisch",
        "kind": "alias"
      },
      {
        "label": "西文",
        "kind": "alias"
      },
      {
        "label": "西語",
        "kind": "alias"
      },
      {
        "label": "castilian",
        "kind": "alias"
      },
      {
        "label": "castilian spanish",
        "kind": "alias"
      },
      {
        "label": "latin american spanish",
        "kind": "alias"
      },
      {
        "label": "mexican spanish",
        "kind": "alias"
      }
    ],
    "fra": [
      {
        "label": "français",
        "kind": "local"
      },
      {
        "label": "French",
        "kind": "english"
      },
      {
        "label": "法语",
        "kind": "alias"
      },
      {
        "label": "francés",
        "kind": "alias"
      },
      {
        "label": "Französisch",
        "kind": "alias"
      },
      {
        "label": "法文",
        "kind": "alias"
      },
      {
        "label": "法語",
        "kind": "alias"
      }
    ],
    "rus": [
      {
        "label": "russe",
        "kind": "local"
      },
      {
        "label": "русский",
        "kind": "native"
      },
      {
        "label": "Russian",
        "kind": "english"
      },
      {
        "label": "俄语",
        "kind": "alias"
      },
      {
        "label": "ruso",
        "kind": "alias"
      },
      {
        "label": "Russisch",
        "kind": "alias"
      },
      {
        "label": "俄文",
        "kind": "alias"
      },
      {
        "label": "俄語",
        "kind": "alias"
      }
    ],
    "ara": [
      {
        "label": "arabe",
        "kind": "local"
      },
      {
        "label": "العربية",
        "kind": "native"
      },
      {
        "label": "Arabic",
        "kind": "english"
      },
      {
        "label": "阿拉伯语",
        "kind": "alias"
      },
      {
        "label": "árabe",
        "kind": "alias"
      },
      {
        "label": "Arabisch",
        "kind": "alias"
      },
      {
        "label": "阿文",
        "kind": "alias"
      },
      {
        "label": "阿语",
        "kind": "alias"
      },
      {
        "label": "阿語",
        "kind": "alias"
      },
      {
        "label": "modern standard arabic",
        "kind": "alias"
      }
    ],
    "lat": [
      {
        "label": "latin",
        "kind": "local"
      },
      {
        "label": "拉丁语",
        "kind": "alias"
      },
      {
        "label": "latín",
        "kind": "alias"
      },
      {
        "label": "Latein",
        "kind": "alias"
      }
    ],
    "ita": [
      {
        "label": "italien",
        "kind": "local"
      },
      {
        "label": "italiano",
        "kind": "native"
      },
      {
        "label": "Italian",
        "kind": "english"
      },
      {
        "label": "意大利语",
        "kind": "alias"
      },
      {
        "label": "Italienisch",
        "kind": "alias"
      },
      {
        "label": "意文",
        "kind": "alias"
      },
      {
        "label": "意语",
        "kind": "alias"
      },
      {
        "label": "意語",
        "kind": "alias"
      }
    ],
    "jpn": [
      {
        "label": "japonais",
        "kind": "local"
      },
      {
        "label": "日本語",
        "kind": "native"
      },
      {
        "label": "Japanese",
        "kind": "english"
      },
      {
        "label": "日语",
        "kind": "alias"
      },
      {
        "label": "japonés",
        "kind": "alias"
      },
      {
        "label": "Japanisch",
        "kind": "alias"
      },
      {
        "label": "日文",
        "kind": "alias"
      },
      {
        "label": "日語",
        "kind": "alias"
      }
    ],
    "por": [
      {
        "label": "portugais",
        "kind": "local"
      },
      {
        "label": "português",
        "kind": "native"
      },
      {
        "label": "Portuguese",
        "kind": "english"
      },
      {
        "label": "葡萄牙语",
        "kind": "alias"
      },
      {
        "label": "portugués",
        "kind": "alias"
      },
      {
        "label": "Portugiesisch",
        "kind": "alias"
      },
      {
        "label": "葡文",
        "kind": "alias"
      },
      {
        "label": "葡语",
        "kind": "alias"
      },
      {
        "label": "葡語",
        "kind": "alias"
      },
      {
        "label": "brazilian portuguese",
        "kind": "alias"
      },
      {
        "label": "european portuguese",
        "kind": "alias"
      }
    ],
    "epo": [
      {
        "label": "espéranto",
        "kind": "local"
      },
      {
        "label": "Esperanto",
        "kind": "native"
      },
      {
        "label": "世界语",
        "kind": "alias"
      }
    ],
    "fas": [
      {
        "label": "persan",
        "kind": "local"
      },
      {
        "label": "فارسی",
        "kind": "native"
      },
      {
        "label": "Persian",
        "kind": "english"
      },
      {
        "label": "波斯语",
        "kind": "alias"
      },
      {
        "label": "persa",
        "kind": "alias"
      },
      {
        "label": "Persisch",
        "kind": "alias"
      },
      {
        "label": "波斯文",
        "kind": "alias"
      },
      {
        "label": "波斯語",
        "kind": "alias"
      },
      {
        "label": "法尔西",
        "kind": "alias"
      },
      {
        "label": "法爾西",
        "kind": "alias"
      },
      {
        "label": "farsi",
        "kind": "alias"
      },
      {
        "label": "persian farsi",
        "kind": "alias"
      }
    ],
    "zho": [
      {
        "label": "chinois",
        "kind": "local"
      },
      {
        "label": "中文",
        "kind": "native"
      },
      {
        "label": "Chinese",
        "kind": "english"
      },
      {
        "label": "chino",
        "kind": "alias"
      },
      {
        "label": "Chinesisch",
        "kind": "alias"
      },
      {
        "label": "汉文",
        "kind": "alias"
      },
      {
        "label": "漢文",
        "kind": "alias"
      },
      {
        "label": "华文",
        "kind": "alias"
      },
      {
        "label": "華文",
        "kind": "alias"
      }
    ],
    "heb": [
      {
        "label": "hébreu",
        "kind": "local"
      },
      {
        "label": "עברית",
        "kind": "native"
      },
      {
        "label": "Hebrew",
        "kind": "english"
      },
      {
        "label": "希伯来语",
        "kind": "alias"
      },
      {
        "label": "hebreo",
        "kind": "alias"
      },
      {
        "label": "Hebräisch",
        "kind": "alias"
      },
      {
        "label": "希伯来文",
        "kind": "alias"
      },
      {
        "label": "希伯來文",
        "kind": "alias"
      }
    ],
    "nld": [
      {
        "label": "néerlandais",
        "kind": "local"
      },
      {
        "label": "Nederlands",
        "kind": "native"
      },
      {
        "label": "Dutch",
        "kind": "english"
      },
      {
        "label": "荷兰语",
        "kind": "alias"
      },
      {
        "label": "neerlandés",
        "kind": "alias"
      },
      {
        "label": "Niederländisch",
        "kind": "alias"
      },
      {
        "label": "荷文",
        "kind": "alias"
      },
      {
        "label": "荷语",
        "kind": "alias"
      },
      {
        "label": "荷語",
        "kind": "alias"
      },
      {
        "label": "flemish",
        "kind": "alias"
      }
    ],
    "pol": [
      {
        "label": "polonais",
        "kind": "local"
      },
      {
        "label": "polski",
        "kind": "native"
      },
      {
        "label": "Polish",
        "kind": "english"
      },
      {
        "label": "波兰语",
        "kind": "alias"
      },
      {
        "label": "polaco",
        "kind": "alias"
      },
      {
        "label": "Polnisch",
        "kind": "alias"
      },
      {
        "label": "波文",
        "kind": "alias"
      },
      {
        "label": "波语",
        "kind": "alias"
      },
      {
        "label": "波語",
        "kind": "alias"
      }
    ],
    "swe": [
      {
        "label": "suédois",
        "kind": "local"
      },
      {
        "label": "svenska",
        "kind": "native"
      },
      {
        "label": "Swedish",
        "kind": "english"
      },
      {
        "label": "瑞典语",
        "kind": "alias"
      },
      {
        "label": "sueco",
        "kind": "alias"
      },
      {
        "label": "Schwedisch",
        "kind": "alias"
      }
    ],
    "tur": [
      {
        "label": "turc",
        "kind": "local"
      },
      {
        "label": "Türkçe",
        "kind": "native"
      },
      {
        "label": "Turkish",
        "kind": "english"
      },
      {
        "label": "土耳其语",
        "kind": "alias"
      },
      {
        "label": "turco",
        "kind": "alias"
      },
      {
        "label": "Türkisch",
        "kind": "alias"
      },
      {
        "label": "土文",
        "kind": "alias"
      },
      {
        "label": "土语",
        "kind": "alias"
      },
      {
        "label": "土語",
        "kind": "alias"
      }
    ],
    "ukr": [
      {
        "label": "ukrainien",
        "kind": "local"
      },
      {
        "label": "українська",
        "kind": "native"
      },
      {
        "label": "Ukrainian",
        "kind": "english"
      },
      {
        "label": "乌克兰语",
        "kind": "alias"
      },
      {
        "label": "ucraniano",
        "kind": "alias"
      },
      {
        "label": "Ukrainisch",
        "kind": "alias"
      }
    ],
    "fin": [
      {
        "label": "finnois",
        "kind": "local"
      },
      {
        "label": "suomi",
        "kind": "native"
      },
      {
        "label": "Finnish",
        "kind": "english"
      },
      {
        "label": "芬兰语",
        "kind": "alias"
      },
      {
        "label": "finés",
        "kind": "alias"
      },
      {
        "label": "Finnisch",
        "kind": "alias"
      }
    ],
    "kor": [
      {
        "label": "coréen",
        "kind": "local"
      },
      {
        "label": "한국어",
        "kind": "native"
      },
      {
        "label": "Korean",
        "kind": "english"
      },
      {
        "label": "韩语",
        "kind": "alias"
      },
      {
        "label": "coreano",
        "kind": "alias"
      },
      {
        "label": "Koreanisch",
        "kind": "alias"
      },
      {
        "label": "韩文",
        "kind": "alias"
      },
      {
        "label": "韓文",
        "kind": "alias"
      },
      {
        "label": "韩国语",
        "kind": "alias"
      },
      {
        "label": "朝鲜语",
        "kind": "alias"
      },
      {
        "label": "朝鮮文",
        "kind": "alias"
      },
      {
        "label": "韓語",
        "kind": "alias"
      }
    ],
    "san": [
      {
        "label": "sanskrit",
        "kind": "local"
      },
      {
        "label": "संस्कृत भाषा",
        "kind": "native"
      },
      {
        "label": "梵语",
        "kind": "alias"
      },
      {
        "label": "sánscrito",
        "kind": "alias"
      }
    ],
    "ces": [
      {
        "label": "tchèque",
        "kind": "local"
      },
      {
        "label": "čeština",
        "kind": "native"
      },
      {
        "label": "Czech",
        "kind": "english"
      },
      {
        "label": "捷克语",
        "kind": "alias"
      },
      {
        "label": "checo",
        "kind": "alias"
      },
      {
        "label": "Tschechisch",
        "kind": "alias"
      }
    ],
    "cat": [
      {
        "label": "catalan",
        "kind": "local"
      },
      {
        "label": "català",
        "kind": "native"
      },
      {
        "label": "加泰罗尼亚语",
        "kind": "alias"
      },
      {
        "label": "catalán",
        "kind": "alias"
      },
      {
        "label": "Katalanisch",
        "kind": "alias"
      }
    ],
    "dan": [
      {
        "label": "danois",
        "kind": "local"
      },
      {
        "label": "dansk",
        "kind": "native"
      },
      {
        "label": "Danish",
        "kind": "english"
      },
      {
        "label": "丹麦语",
        "kind": "alias"
      },
      {
        "label": "danés",
        "kind": "alias"
      },
      {
        "label": "Dänisch",
        "kind": "alias"
      }
    ],
    "ron": [
      {
        "label": "roumain",
        "kind": "local"
      },
      {
        "label": "română",
        "kind": "native"
      },
      {
        "label": "Romanian",
        "kind": "english"
      },
      {
        "label": "罗马尼亚语",
        "kind": "alias"
      },
      {
        "label": "rumano",
        "kind": "alias"
      },
      {
        "label": "Rumänisch",
        "kind": "alias"
      }
    ],
    "swa": [
      {
        "label": "swahili",
        "kind": "local"
      },
      {
        "label": "Kiswahili",
        "kind": "native"
      },
      {
        "label": "斯瓦希里语",
        "kind": "alias"
      },
      {
        "label": "suajili",
        "kind": "alias"
      },
      {
        "label": "Suaheli",
        "kind": "alias"
      }
    ],
    "hun": [
      {
        "label": "hongrois",
        "kind": "local"
      },
      {
        "label": "magyar",
        "kind": "native"
      },
      {
        "label": "Hungarian",
        "kind": "english"
      },
      {
        "label": "匈牙利语",
        "kind": "alias"
      },
      {
        "label": "húngaro",
        "kind": "alias"
      },
      {
        "label": "Ungarisch",
        "kind": "alias"
      }
    ],
    "syl": [
      {
        "label": "Sylheti",
        "kind": "english"
      }
    ],
    "hrv": [
      {
        "label": "croate",
        "kind": "local"
      },
      {
        "label": "hrvatski",
        "kind": "native"
      },
      {
        "label": "Croatian",
        "kind": "english"
      },
      {
        "label": "克罗地亚语",
        "kind": "alias"
      },
      {
        "label": "croata",
        "kind": "alias"
      },
      {
        "label": "Kroatisch",
        "kind": "alias"
      }
    ],
    "nor": [
      {
        "label": "norvégien",
        "kind": "local"
      },
      {
        "label": "norsk",
        "kind": "native"
      },
      {
        "label": "Norwegian",
        "kind": "english"
      },
      {
        "label": "挪威语",
        "kind": "alias"
      },
      {
        "label": "noruego",
        "kind": "alias"
      },
      {
        "label": "Norwegisch",
        "kind": "alias"
      }
    ],
    "ben": [
      {
        "label": "bengali",
        "kind": "local"
      },
      {
        "label": "বাংলা",
        "kind": "native"
      },
      {
        "label": "Bangla",
        "kind": "english"
      },
      {
        "label": "孟加拉语",
        "kind": "alias"
      },
      {
        "label": "bengalí",
        "kind": "alias"
      },
      {
        "label": "Bengalisch",
        "kind": "alias"
      },
      {
        "label": "孟加拉文",
        "kind": "alias"
      },
      {
        "label": "孟加拉語",
        "kind": "alias"
      }
    ],
    "aze": [
      {
        "label": "azerbaïdjanais",
        "kind": "local"
      },
      {
        "label": "azərbaycan",
        "kind": "native"
      },
      {
        "label": "Azerbaijani",
        "kind": "english"
      },
      {
        "label": "阿塞拜疆语",
        "kind": "alias"
      },
      {
        "label": "azerbaiyano",
        "kind": "alias"
      },
      {
        "label": "Aserbaidschanisch",
        "kind": "alias"
      }
    ],
    "afr": [
      {
        "label": "afrikaans",
        "kind": "local"
      },
      {
        "label": "南非荷兰语",
        "kind": "alias"
      },
      {
        "label": "afrikáans",
        "kind": "alias"
      }
    ],
    "est": [
      {
        "label": "estonien",
        "kind": "local"
      },
      {
        "label": "eesti",
        "kind": "native"
      },
      {
        "label": "Estonian",
        "kind": "english"
      },
      {
        "label": "爱沙尼亚语",
        "kind": "alias"
      },
      {
        "label": "estonio",
        "kind": "alias"
      },
      {
        "label": "Estnisch",
        "kind": "alias"
      }
    ],
    "bul": [
      {
        "label": "bulgare",
        "kind": "local"
      },
      {
        "label": "български",
        "kind": "native"
      },
      {
        "label": "Bulgarian",
        "kind": "english"
      },
      {
        "label": "保加利亚语",
        "kind": "alias"
      },
      {
        "label": "búlgaro",
        "kind": "alias"
      },
      {
        "label": "Bulgarisch",
        "kind": "alias"
      }
    ],
    "gle": [
      {
        "label": "irlandais",
        "kind": "local"
      },
      {
        "label": "Gaeilge",
        "kind": "native"
      },
      {
        "label": "Irish",
        "kind": "english"
      },
      {
        "label": "爱尔兰语",
        "kind": "alias"
      },
      {
        "label": "irlandés",
        "kind": "alias"
      },
      {
        "label": "Irisch",
        "kind": "alias"
      }
    ],
    "bel": [
      {
        "label": "biélorusse",
        "kind": "local"
      },
      {
        "label": "беларуская",
        "kind": "native"
      },
      {
        "label": "Belarusian",
        "kind": "english"
      },
      {
        "label": "白俄罗斯语",
        "kind": "alias"
      },
      {
        "label": "bielorruso",
        "kind": "alias"
      },
      {
        "label": "Belarussisch",
        "kind": "alias"
      }
    ],
    "ind": [
      {
        "label": "indonésien",
        "kind": "local"
      },
      {
        "label": "Bahasa Indonesia",
        "kind": "native"
      },
      {
        "label": "Indonesian",
        "kind": "english"
      },
      {
        "label": "印度尼西亚语",
        "kind": "alias"
      },
      {
        "label": "indonesio",
        "kind": "alias"
      },
      {
        "label": "Indonesisch",
        "kind": "alias"
      },
      {
        "label": "印尼文",
        "kind": "alias"
      },
      {
        "label": "印尼语",
        "kind": "alias"
      },
      {
        "label": "印尼語",
        "kind": "alias"
      }
    ],
    "isl": [
      {
        "label": "islandais",
        "kind": "local"
      },
      {
        "label": "íslenska",
        "kind": "native"
      },
      {
        "label": "Icelandic",
        "kind": "english"
      },
      {
        "label": "冰岛语",
        "kind": "alias"
      },
      {
        "label": "islandés",
        "kind": "alias"
      },
      {
        "label": "Isländisch",
        "kind": "alias"
      }
    ],
    "lit": [
      {
        "label": "lituanien",
        "kind": "local"
      },
      {
        "label": "lietuvių",
        "kind": "native"
      },
      {
        "label": "Lithuanian",
        "kind": "english"
      },
      {
        "label": "立陶宛语",
        "kind": "alias"
      },
      {
        "label": "lituano",
        "kind": "alias"
      },
      {
        "label": "Litauisch",
        "kind": "alias"
      }
    ],
    "ile": [
      {
        "label": "interlingue",
        "kind": "local"
      },
      {
        "label": "国际文字（E）",
        "kind": "alias"
      }
    ],
    "hye": [
      {
        "label": "arménien",
        "kind": "local"
      },
      {
        "label": "հայերեն",
        "kind": "native"
      },
      {
        "label": "Armenian",
        "kind": "english"
      },
      {
        "label": "亚美尼亚语",
        "kind": "alias"
      },
      {
        "label": "armenio",
        "kind": "alias"
      },
      {
        "label": "Armenisch",
        "kind": "alias"
      }
    ],
    "slk": [
      {
        "label": "slovaque",
        "kind": "local"
      },
      {
        "label": "slovenčina",
        "kind": "native"
      },
      {
        "label": "Slovak",
        "kind": "english"
      },
      {
        "label": "斯洛伐克语",
        "kind": "alias"
      },
      {
        "label": "eslovaco",
        "kind": "alias"
      },
      {
        "label": "Slowakisch",
        "kind": "alias"
      }
    ],
    "tam": [
      {
        "label": "tamoul",
        "kind": "local"
      },
      {
        "label": "தமிழ்",
        "kind": "native"
      },
      {
        "label": "Tamil",
        "kind": "english"
      },
      {
        "label": "泰米尔语",
        "kind": "alias"
      }
    ],
    "sqi": [
      {
        "label": "albanais",
        "kind": "local"
      },
      {
        "label": "shqip",
        "kind": "native"
      },
      {
        "label": "Albanian",
        "kind": "english"
      },
      {
        "label": "阿尔巴尼亚语",
        "kind": "alias"
      },
      {
        "label": "albanés",
        "kind": "alias"
      },
      {
        "label": "Albanisch",
        "kind": "alias"
      }
    ],
    "eus": [
      {
        "label": "basque",
        "kind": "local"
      },
      {
        "label": "euskara",
        "kind": "native"
      },
      {
        "label": "巴斯克语",
        "kind": "alias"
      },
      {
        "label": "euskera",
        "kind": "alias"
      },
      {
        "label": "Baskisch",
        "kind": "alias"
      }
    ],
    "kat": [
      {
        "label": "géorgien",
        "kind": "local"
      },
      {
        "label": "ქართული",
        "kind": "native"
      },
      {
        "label": "Georgian",
        "kind": "english"
      },
      {
        "label": "格鲁吉亚语",
        "kind": "alias"
      },
      {
        "label": "georgiano",
        "kind": "alias"
      },
      {
        "label": "Georgisch",
        "kind": "alias"
      }
    ],
    "srp": [
      {
        "label": "serbe",
        "kind": "local"
      },
      {
        "label": "српски",
        "kind": "native"
      },
      {
        "label": "Serbian",
        "kind": "english"
      },
      {
        "label": "塞尔维亚语",
        "kind": "alias"
      },
      {
        "label": "serbio",
        "kind": "alias"
      },
      {
        "label": "Serbisch",
        "kind": "alias"
      }
    ],
    "lav": [
      {
        "label": "letton",
        "kind": "local"
      },
      {
        "label": "latviešu",
        "kind": "native"
      },
      {
        "label": "Latvian",
        "kind": "english"
      },
      {
        "label": "拉脱维亚语",
        "kind": "alias"
      },
      {
        "label": "letón",
        "kind": "alias"
      },
      {
        "label": "Lettisch",
        "kind": "alias"
      }
    ],
    "tha": [
      {
        "label": "thaï",
        "kind": "local"
      },
      {
        "label": "ไทย",
        "kind": "native"
      },
      {
        "label": "Thai",
        "kind": "english"
      },
      {
        "label": "泰语",
        "kind": "alias"
      },
      {
        "label": "tailandés",
        "kind": "alias"
      },
      {
        "label": "Thailändisch",
        "kind": "alias"
      },
      {
        "label": "泰文",
        "kind": "alias"
      },
      {
        "label": "泰語",
        "kind": "alias"
      }
    ],
    "slv": [
      {
        "label": "slovène",
        "kind": "local"
      },
      {
        "label": "slovenščina",
        "kind": "native"
      },
      {
        "label": "Slovene",
        "kind": "english"
      },
      {
        "label": "斯洛文尼亚语",
        "kind": "alias"
      },
      {
        "label": "Slovenian",
        "kind": "alias"
      },
      {
        "label": "esloveno",
        "kind": "alias"
      },
      {
        "label": "Slowenisch",
        "kind": "alias"
      }
    ],
    "vie": [
      {
        "label": "vietnamien",
        "kind": "local"
      },
      {
        "label": "Tiếng Việt",
        "kind": "native"
      },
      {
        "label": "Vietnamese",
        "kind": "english"
      },
      {
        "label": "越南语",
        "kind": "alias"
      },
      {
        "label": "vietnamita",
        "kind": "alias"
      },
      {
        "label": "Vietnamesisch",
        "kind": "alias"
      },
      {
        "label": "越文",
        "kind": "alias"
      },
      {
        "label": "越語",
        "kind": "alias"
      }
    ],
    "oci": [
      {
        "label": "occitan",
        "kind": "local"
      },
      {
        "label": "奥克语",
        "kind": "alias"
      },
      {
        "label": "occitano",
        "kind": "alias"
      },
      {
        "label": "Okzitanisch",
        "kind": "alias"
      }
    ],
    "kaz": [
      {
        "label": "kazakh",
        "kind": "local"
      },
      {
        "label": "қазақ тілі",
        "kind": "native"
      },
      {
        "label": "哈萨克语",
        "kind": "alias"
      },
      {
        "label": "kazajo",
        "kind": "alias"
      },
      {
        "label": "Kasachisch",
        "kind": "alias"
      },
      {
        "label": "哈薩克語",
        "kind": "alias"
      }
    ],
    "cym": [
      {
        "label": "gallois",
        "kind": "local"
      },
      {
        "label": "Cymraeg",
        "kind": "native"
      },
      {
        "label": "Welsh",
        "kind": "english"
      },
      {
        "label": "威尔士语",
        "kind": "alias"
      },
      {
        "label": "galés",
        "kind": "alias"
      },
      {
        "label": "Walisisch",
        "kind": "alias"
      }
    ],
    "msa": [
      {
        "label": "malais",
        "kind": "local"
      },
      {
        "label": "Melayu",
        "kind": "native"
      },
      {
        "label": "Malay",
        "kind": "english"
      },
      {
        "label": "马来语",
        "kind": "alias"
      },
      {
        "label": "malayo",
        "kind": "alias"
      },
      {
        "label": "Malaiisch",
        "kind": "alias"
      },
      {
        "label": "马来文",
        "kind": "alias"
      },
      {
        "label": "马来话",
        "kind": "alias"
      },
      {
        "label": "馬來文",
        "kind": "alias"
      },
      {
        "label": "馬來話",
        "kind": "alias"
      },
      {
        "label": "bahasa melayu",
        "kind": "alias"
      }
    ],
    "ina": [
      {
        "label": "interlingua",
        "kind": "local"
      },
      {
        "label": "Interlingua (International Auxiliary Language Association)",
        "kind": "english"
      },
      {
        "label": "国际语",
        "kind": "alias"
      }
    ],
    "yid": [
      {
        "label": "yiddish",
        "kind": "local"
      },
      {
        "label": "ייִדיש",
        "kind": "native"
      },
      {
        "label": "意第绪语",
        "kind": "alias"
      },
      {
        "label": "yidis",
        "kind": "alias"
      },
      {
        "label": "Jiddisch",
        "kind": "alias"
      }
    ],
    "mkd": [
      {
        "label": "macédonien",
        "kind": "local"
      },
      {
        "label": "македонски",
        "kind": "native"
      },
      {
        "label": "Macedonian",
        "kind": "english"
      },
      {
        "label": "马其顿语",
        "kind": "alias"
      },
      {
        "label": "macedonio",
        "kind": "alias"
      },
      {
        "label": "Mazedonisch",
        "kind": "alias"
      }
    ],
    "grc": [
      {
        "label": "grec ancien",
        "kind": "local"
      },
      {
        "label": "Ancient Greek",
        "kind": "english"
      },
      {
        "label": "古希腊语",
        "kind": "alias"
      },
      {
        "label": "griego antiguo",
        "kind": "alias"
      },
      {
        "label": "Altgriechisch",
        "kind": "alias"
      }
    ],
    "kur": [
      {
        "label": "kurde",
        "kind": "local"
      },
      {
        "label": "Kurdî",
        "kind": "native"
      },
      {
        "label": "Kurdish",
        "kind": "english"
      },
      {
        "label": "库尔德语",
        "kind": "alias"
      },
      {
        "label": "kurdo",
        "kind": "alias"
      },
      {
        "label": "Kurdisch",
        "kind": "alias"
      }
    ],
    "lfn": [
      {
        "label": "lingua franca nova",
        "kind": "local"
      }
    ],
    "mon": [
      {
        "label": "mongol",
        "kind": "local"
      },
      {
        "label": "монгол",
        "kind": "native"
      },
      {
        "label": "Mongolian",
        "kind": "english"
      },
      {
        "label": "蒙古语",
        "kind": "alias"
      },
      {
        "label": "Mongolisch",
        "kind": "alias"
      },
      {
        "label": "蒙古文",
        "kind": "alias"
      },
      {
        "label": "蒙古語",
        "kind": "alias"
      },
      {
        "label": "蒙古話",
        "kind": "alias"
      }
    ],
    "ido": [
      {
        "label": "ido",
        "kind": "local"
      },
      {
        "label": "伊多语",
        "kind": "alias"
      }
    ],
    "glg": [
      {
        "label": "galicien",
        "kind": "local"
      },
      {
        "label": "galego",
        "kind": "native"
      },
      {
        "label": "Galician",
        "kind": "english"
      },
      {
        "label": "加利西亚语",
        "kind": "alias"
      },
      {
        "label": "gallego",
        "kind": "alias"
      },
      {
        "label": "Galicisch",
        "kind": "alias"
      }
    ],
    "tel": [
      {
        "label": "télougou",
        "kind": "local"
      },
      {
        "label": "తెలుగు",
        "kind": "native"
      },
      {
        "label": "Telugu",
        "kind": "english"
      },
      {
        "label": "泰卢固语",
        "kind": "alias"
      }
    ],
    "mlt": [
      {
        "label": "maltais",
        "kind": "local"
      },
      {
        "label": "Malti",
        "kind": "native"
      },
      {
        "label": "Maltese",
        "kind": "english"
      },
      {
        "label": "马耳他语",
        "kind": "alias"
      },
      {
        "label": "maltés",
        "kind": "alias"
      },
      {
        "label": "Maltesisch",
        "kind": "alias"
      }
    ],
    "pus": [
      {
        "label": "pachto",
        "kind": "local"
      },
      {
        "label": "پښتو",
        "kind": "native"
      },
      {
        "label": "Pashto",
        "kind": "english"
      },
      {
        "label": "普什图语",
        "kind": "alias"
      },
      {
        "label": "pastún",
        "kind": "alias"
      },
      {
        "label": "Paschtu",
        "kind": "alias"
      }
    ],
    "tat": [
      {
        "label": "tatar",
        "kind": "local"
      },
      {
        "label": "татар",
        "kind": "native"
      },
      {
        "label": "鞑靼语",
        "kind": "alias"
      },
      {
        "label": "tártaro",
        "kind": "alias"
      },
      {
        "label": "Tatarisch",
        "kind": "alias"
      }
    ],
    "pan": [
      {
        "label": "pendjabi",
        "kind": "local"
      },
      {
        "label": "ਪੰਜਾਬੀ",
        "kind": "native"
      },
      {
        "label": "Punjabi",
        "kind": "english"
      },
      {
        "label": "旁遮普语",
        "kind": "alias"
      },
      {
        "label": "punyabí",
        "kind": "alias"
      },
      {
        "label": "旁遮普文",
        "kind": "alias"
      },
      {
        "label": "旁遮普語",
        "kind": "alias"
      }
    ],
    "uzb": [
      {
        "label": "ouzbek",
        "kind": "local"
      },
      {
        "label": "o‘zbek",
        "kind": "native"
      },
      {
        "label": "Uzbek",
        "kind": "english"
      },
      {
        "label": "乌兹别克语",
        "kind": "alias"
      },
      {
        "label": "uzbeko",
        "kind": "alias"
      },
      {
        "label": "Usbekisch",
        "kind": "alias"
      }
    ],
    "ltz": [
      {
        "label": "luxembourgeois",
        "kind": "local"
      },
      {
        "label": "Lëtzebuergesch",
        "kind": "native"
      },
      {
        "label": "Luxembourgish",
        "kind": "english"
      },
      {
        "label": "卢森堡语",
        "kind": "alias"
      },
      {
        "label": "luxemburgués",
        "kind": "alias"
      },
      {
        "label": "Luxemburgisch",
        "kind": "alias"
      }
    ],
    "nep": [
      {
        "label": "népalais",
        "kind": "local"
      },
      {
        "label": "नेपाली",
        "kind": "native"
      },
      {
        "label": "Nepali",
        "kind": "english"
      },
      {
        "label": "尼泊尔语",
        "kind": "alias"
      },
      {
        "label": "nepalí",
        "kind": "alias"
      },
      {
        "label": "Nepalesisch",
        "kind": "alias"
      },
      {
        "label": "尼泊尔文",
        "kind": "alias"
      },
      {
        "label": "尼泊爾文",
        "kind": "alias"
      }
    ],
    "gla": [
      {
        "label": "gaélique écossais",
        "kind": "local"
      },
      {
        "label": "Gàidhlig",
        "kind": "native"
      },
      {
        "label": "Scottish Gaelic",
        "kind": "english"
      },
      {
        "label": "苏格兰盖尔语",
        "kind": "alias"
      },
      {
        "label": "gaélico escocés",
        "kind": "alias"
      },
      {
        "label": "Gälisch (Schottland)",
        "kind": "alias"
      }
    ],
    "bre": [
      {
        "label": "breton",
        "kind": "local"
      },
      {
        "label": "brezhoneg",
        "kind": "native"
      },
      {
        "label": "布列塔尼语",
        "kind": "alias"
      },
      {
        "label": "bretón",
        "kind": "alias"
      },
      {
        "label": "Bretonisch",
        "kind": "alias"
      }
    ],
    "cmn": [
      {
        "label": "mandarin",
        "kind": "local"
      },
      {
        "label": "普通话",
        "kind": "native"
      },
      {
        "label": "mandarín",
        "kind": "alias"
      },
      {
        "label": "中文",
        "kind": "alias"
      },
      {
        "label": "chinese",
        "kind": "alias"
      },
      {
        "label": "mandarin chinese",
        "kind": "alias"
      },
      {
        "label": "standard chinese",
        "kind": "alias"
      },
      {
        "label": "putonghua",
        "kind": "alias"
      },
      {
        "label": "guoyu",
        "kind": "alias"
      },
      {
        "label": "汉语",
        "kind": "alias"
      },
      {
        "label": "国语",
        "kind": "alias"
      },
      {
        "label": "國語",
        "kind": "alias"
      },
      {
        "label": "华语",
        "kind": "alias"
      },
      {
        "label": "華語",
        "kind": "alias"
      },
      {
        "label": "官话",
        "kind": "alias"
      },
      {
        "label": "北方话",
        "kind": "alias"
      },
      {
        "label": "北方方言",
        "kind": "alias"
      },
      {
        "label": "中文普通话",
        "kind": "alias"
      }
    ],
    "kir": [
      {
        "label": "kirghize",
        "kind": "local"
      },
      {
        "label": "кыргызча",
        "kind": "native"
      },
      {
        "label": "Kyrgyz",
        "kind": "english"
      },
      {
        "label": "吉尔吉斯语",
        "kind": "alias"
      },
      {
        "label": "kirguís",
        "kind": "alias"
      },
      {
        "label": "Kirgisisch",
        "kind": "alias"
      },
      {
        "label": "柯尔克孜语",
        "kind": "alias"
      },
      {
        "label": "柯爾克孜語",
        "kind": "alias"
      },
      {
        "label": "吉爾吉斯語",
        "kind": "alias"
      }
    ],
    "fao": [
      {
        "label": "féroïen",
        "kind": "local"
      },
      {
        "label": "føroyskt",
        "kind": "native"
      },
      {
        "label": "Faroese",
        "kind": "english"
      },
      {
        "label": "法罗语",
        "kind": "alias"
      },
      {
        "label": "feroés",
        "kind": "alias"
      },
      {
        "label": "Färöisch",
        "kind": "alias"
      }
    ],
    "amh": [
      {
        "label": "amharique",
        "kind": "local"
      },
      {
        "label": "አማርኛ",
        "kind": "native"
      },
      {
        "label": "Amharic",
        "kind": "english"
      },
      {
        "label": "阿姆哈拉语",
        "kind": "alias"
      },
      {
        "label": "amárico",
        "kind": "alias"
      },
      {
        "label": "Amharisch",
        "kind": "alias"
      },
      {
        "label": "阿姆哈拉文",
        "kind": "alias"
      },
      {
        "label": "阿姆哈拉語",
        "kind": "alias"
      }
    ],
    "kan": [
      {
        "label": "kannada",
        "kind": "local"
      },
      {
        "label": "ಕನ್ನಡ",
        "kind": "native"
      },
      {
        "label": "卡纳达语",
        "kind": "alias"
      },
      {
        "label": "canarés",
        "kind": "alias"
      }
    ],
    "mar": [
      {
        "label": "marathi",
        "kind": "local"
      },
      {
        "label": "मराठी",
        "kind": "native"
      },
      {
        "label": "马拉地语",
        "kind": "alias"
      },
      {
        "label": "maratí",
        "kind": "alias"
      }
    ],
    "tgl": [
      {
        "label": "tagalog",
        "kind": "local"
      },
      {
        "label": "他加禄语",
        "kind": "alias"
      },
      {
        "label": "tagalo",
        "kind": "alias"
      },
      {
        "label": "他加禄文",
        "kind": "alias"
      },
      {
        "label": "他加祿文",
        "kind": "alias"
      }
    ],
    "roh": [
      {
        "label": "romanche",
        "kind": "local"
      },
      {
        "label": "rumantsch",
        "kind": "native"
      },
      {
        "label": "Romansh",
        "kind": "english"
      },
      {
        "label": "罗曼什语",
        "kind": "alias"
      },
      {
        "label": "Rätoromanisch",
        "kind": "alias"
      }
    ],
    "bak": [
      {
        "label": "bachkir",
        "kind": "local"
      },
      {
        "label": "Bashkir",
        "kind": "english"
      },
      {
        "label": "巴什基尔语",
        "kind": "alias"
      },
      {
        "label": "baskir",
        "kind": "alias"
      },
      {
        "label": "Baschkirisch",
        "kind": "alias"
      }
    ],
    "mal": [
      {
        "label": "malayalam",
        "kind": "local"
      },
      {
        "label": "മലയാളം",
        "kind": "native"
      },
      {
        "label": "马拉雅拉姆语",
        "kind": "alias"
      },
      {
        "label": "malayálam",
        "kind": "alias"
      }
    ],
    "mya": [
      {
        "label": "birman",
        "kind": "local"
      },
      {
        "label": "မြန်မာ",
        "kind": "native"
      },
      {
        "label": "Burmese",
        "kind": "english"
      },
      {
        "label": "缅甸语",
        "kind": "alias"
      },
      {
        "label": "birmano",
        "kind": "alias"
      },
      {
        "label": "Birmanisch",
        "kind": "alias"
      },
      {
        "label": "缅语",
        "kind": "alias"
      },
      {
        "label": "缅文",
        "kind": "alias"
      },
      {
        "label": "緬語",
        "kind": "alias"
      },
      {
        "label": "緬文",
        "kind": "alias"
      }
    ],
    "que": [
      {
        "label": "quechua",
        "kind": "local"
      },
      {
        "label": "Runasimi",
        "kind": "native"
      },
      {
        "label": "克丘亚语",
        "kind": "alias"
      }
    ],
    "jav": [
      {
        "label": "javanais",
        "kind": "local"
      },
      {
        "label": "Jawa",
        "kind": "native"
      },
      {
        "label": "Javanese",
        "kind": "english"
      },
      {
        "label": "爪哇语",
        "kind": "alias"
      },
      {
        "label": "javanés",
        "kind": "alias"
      },
      {
        "label": "Javanisch",
        "kind": "alias"
      }
    ],
    "uig": [
      {
        "label": "ouïghour",
        "kind": "local"
      },
      {
        "label": "ئۇيغۇرچە",
        "kind": "native"
      },
      {
        "label": "Uyghur",
        "kind": "english"
      },
      {
        "label": "维吾尔语",
        "kind": "alias"
      },
      {
        "label": "uigur",
        "kind": "alias"
      },
      {
        "label": "Uigurisch",
        "kind": "alias"
      },
      {
        "label": "维语",
        "kind": "alias"
      },
      {
        "label": "維語",
        "kind": "alias"
      },
      {
        "label": "維吾爾語",
        "kind": "alias"
      }
    ],
    "mri": [
      {
        "label": "maori",
        "kind": "local"
      },
      {
        "label": "Māori",
        "kind": "native"
      },
      {
        "label": "毛利语",
        "kind": "alias"
      },
      {
        "label": "maorí",
        "kind": "alias"
      }
    ],
    "tgk": [
      {
        "label": "tadjik",
        "kind": "local"
      },
      {
        "label": "тоҷикӣ",
        "kind": "native"
      },
      {
        "label": "Tajik",
        "kind": "english"
      },
      {
        "label": "塔吉克语",
        "kind": "alias"
      },
      {
        "label": "tayiko",
        "kind": "alias"
      },
      {
        "label": "Tadschikisch",
        "kind": "alias"
      },
      {
        "label": "塔吉克語",
        "kind": "alias"
      }
    ],
    "tuk": [
      {
        "label": "turkmène",
        "kind": "local"
      },
      {
        "label": "türkmen dili",
        "kind": "native"
      },
      {
        "label": "Turkmen",
        "kind": "english"
      },
      {
        "label": "土库曼语",
        "kind": "alias"
      },
      {
        "label": "turcomano",
        "kind": "alias"
      },
      {
        "label": "Turkmenisch",
        "kind": "alias"
      }
    ],
    "abk": [
      {
        "label": "abkhaze",
        "kind": "local"
      },
      {
        "label": "Abkhaz",
        "kind": "english"
      },
      {
        "label": "阿布哈西亚语",
        "kind": "alias"
      },
      {
        "label": "Abkhazian",
        "kind": "alias"
      },
      {
        "label": "abjasio",
        "kind": "alias"
      },
      {
        "label": "Abchasisch",
        "kind": "alias"
      }
    ],
    "guj": [
      {
        "label": "goudjarati",
        "kind": "local"
      },
      {
        "label": "ગુજરાતી",
        "kind": "native"
      },
      {
        "label": "Gujarati",
        "kind": "english"
      },
      {
        "label": "古吉拉特语",
        "kind": "alias"
      },
      {
        "label": "guyaratí",
        "kind": "alias"
      }
    ],
    "szl": [
      {
        "label": "silésien",
        "kind": "local"
      },
      {
        "label": "ślōnski",
        "kind": "native"
      },
      {
        "label": "Silesian",
        "kind": "english"
      },
      {
        "label": "西里西亚语",
        "kind": "alias"
      },
      {
        "label": "silesio",
        "kind": "alias"
      },
      {
        "label": "Schlesisch (Wasserpolnisch)",
        "kind": "alias"
      }
    ],
    "khm": [
      {
        "label": "khmer",
        "kind": "local"
      },
      {
        "label": "ខ្មែរ",
        "kind": "native"
      },
      {
        "label": "高棉语",
        "kind": "alias"
      },
      {
        "label": "jemer",
        "kind": "alias"
      },
      {
        "label": "高棉文",
        "kind": "alias"
      },
      {
        "label": "柬语",
        "kind": "alias"
      },
      {
        "label": "柬語",
        "kind": "alias"
      },
      {
        "label": "柬埔寨语",
        "kind": "alias"
      },
      {
        "label": "柬埔寨語",
        "kind": "alias"
      }
    ],
    "zul": [
      {
        "label": "zoulou",
        "kind": "local"
      },
      {
        "label": "isiZulu",
        "kind": "native"
      },
      {
        "label": "Zulu",
        "kind": "english"
      },
      {
        "label": "祖鲁语",
        "kind": "alias"
      },
      {
        "label": "zulú",
        "kind": "alias"
      }
    ],
    "bod": [
      {
        "label": "tibétain",
        "kind": "local"
      },
      {
        "label": "བོད་སྐད་",
        "kind": "native"
      },
      {
        "label": "Tibetan",
        "kind": "english"
      },
      {
        "label": "藏语",
        "kind": "alias"
      },
      {
        "label": "tibetano",
        "kind": "alias"
      },
      {
        "label": "Tibetisch",
        "kind": "alias"
      },
      {
        "label": "藏文",
        "kind": "alias"
      },
      {
        "label": "藏語",
        "kind": "alias"
      },
      {
        "label": "藏話",
        "kind": "alias"
      }
    ],
    "che": [
      {
        "label": "tchétchène",
        "kind": "local"
      },
      {
        "label": "нохчийн",
        "kind": "native"
      },
      {
        "label": "Chechen",
        "kind": "english"
      },
      {
        "label": "车臣语",
        "kind": "alias"
      },
      {
        "label": "checheno",
        "kind": "alias"
      },
      {
        "label": "Tschetschenisch",
        "kind": "alias"
      }
    ],
    "zza": [
      {
        "label": "zazaki",
        "kind": "local"
      },
      {
        "label": "扎扎语",
        "kind": "alias"
      },
      {
        "label": "Zaza",
        "kind": "alias"
      }
    ],
    "asm": [
      {
        "label": "assamais",
        "kind": "local"
      },
      {
        "label": "অসমীয়া",
        "kind": "native"
      },
      {
        "label": "Assamese",
        "kind": "english"
      },
      {
        "label": "阿萨姆语",
        "kind": "alias"
      },
      {
        "label": "asamés",
        "kind": "alias"
      },
      {
        "label": "Assamesisch",
        "kind": "alias"
      }
    ],
    "cor": [
      {
        "label": "cornique",
        "kind": "local"
      },
      {
        "label": "kernewek",
        "kind": "native"
      },
      {
        "label": "Cornish",
        "kind": "english"
      },
      {
        "label": "康沃尔语",
        "kind": "alias"
      },
      {
        "label": "córnico",
        "kind": "alias"
      },
      {
        "label": "Kornisch",
        "kind": "alias"
      }
    ],
    "chv": [
      {
        "label": "tchouvache",
        "kind": "local"
      },
      {
        "label": "чӑваш",
        "kind": "native"
      },
      {
        "label": "Chuvash",
        "kind": "english"
      },
      {
        "label": "楚瓦什语",
        "kind": "alias"
      },
      {
        "label": "chuvasio",
        "kind": "alias"
      },
      {
        "label": "Tschuwaschisch",
        "kind": "alias"
      }
    ],
    "haw": [
      {
        "label": "hawaïen",
        "kind": "local"
      },
      {
        "label": "ʻŌlelo Hawaiʻi",
        "kind": "native"
      },
      {
        "label": "Hawaiian",
        "kind": "english"
      },
      {
        "label": "夏威夷语",
        "kind": "alias"
      },
      {
        "label": "hawaiano",
        "kind": "alias"
      },
      {
        "label": "Hawaiisch",
        "kind": "alias"
      }
    ],
    "sco": [
      {
        "label": "écossais",
        "kind": "local"
      },
      {
        "label": "Scots",
        "kind": "english"
      },
      {
        "label": "苏格兰语",
        "kind": "alias"
      },
      {
        "label": "escocés",
        "kind": "alias"
      },
      {
        "label": "Schottisch",
        "kind": "alias"
      }
    ],
    "vol": [
      {
        "label": "volapük",
        "kind": "local"
      },
      {
        "label": "沃拉普克语",
        "kind": "alias"
      }
    ],
    "hbs": [
      {
        "label": "serbo-croate",
        "kind": "local"
      },
      {
        "label": "srpskohrvatski",
        "kind": "native"
      },
      {
        "label": "Serbo-Croatian",
        "kind": "english"
      },
      {
        "label": "塞尔维亚-克罗地亚语",
        "kind": "alias"
      },
      {
        "label": "serbocroata",
        "kind": "alias"
      },
      {
        "label": "Serbo-Kroatisch",
        "kind": "alias"
      }
    ],
    "hau": [
      {
        "label": "haoussa",
        "kind": "local"
      },
      {
        "label": "Hausa",
        "kind": "native"
      },
      {
        "label": "豪萨语",
        "kind": "alias"
      },
      {
        "label": "Haussa",
        "kind": "alias"
      }
    ],
    "grn": [
      {
        "label": "guarani",
        "kind": "local"
      },
      {
        "label": "瓜拉尼语",
        "kind": "alias"
      },
      {
        "label": "guaraní",
        "kind": "alias"
      }
    ],
    "som": [
      {
        "label": "somali",
        "kind": "local"
      },
      {
        "label": "Soomaali",
        "kind": "native"
      },
      {
        "label": "索马里语",
        "kind": "alias"
      },
      {
        "label": "somalí",
        "kind": "alias"
      }
    ],
    "mlg": [
      {
        "label": "malgache",
        "kind": "local"
      },
      {
        "label": "Malagasy",
        "kind": "native"
      },
      {
        "label": "马拉加斯语",
        "kind": "alias"
      }
    ],
    "srd": [
      {
        "label": "sarde",
        "kind": "local"
      },
      {
        "label": "sardu",
        "kind": "native"
      },
      {
        "label": "Sardinian",
        "kind": "english"
      },
      {
        "label": "萨丁语",
        "kind": "alias"
      },
      {
        "label": "sardo",
        "kind": "alias"
      },
      {
        "label": "Sardisch",
        "kind": "alias"
      }
    ],
    "ory": [
      {
        "label": "odia",
        "kind": "local"
      },
      {
        "label": "ଓଡ଼ିଆ",
        "kind": "native"
      },
      {
        "label": "奥里亚语",
        "kind": "alias"
      },
      {
        "label": "oriya",
        "kind": "alias"
      }
    ],
    "glv": [
      {
        "label": "mannois",
        "kind": "local"
      },
      {
        "label": "Gaelg",
        "kind": "native"
      },
      {
        "label": "Manx",
        "kind": "english"
      },
      {
        "label": "马恩语",
        "kind": "alias"
      },
      {
        "label": "manés",
        "kind": "alias"
      }
    ],
    "arg": [
      {
        "label": "aragonais",
        "kind": "local"
      },
      {
        "label": "Aragonese",
        "kind": "english"
      },
      {
        "label": "阿拉贡语",
        "kind": "alias"
      },
      {
        "label": "aragonés",
        "kind": "alias"
      },
      {
        "label": "Aragonesisch",
        "kind": "alias"
      }
    ],
    "crh": [
      {
        "label": "tatar de Crimée",
        "kind": "local"
      },
      {
        "label": "Crimean Tatar",
        "kind": "english"
      },
      {
        "label": "克里米亚鞑靼语",
        "kind": "alias"
      },
      {
        "label": "tártaro de Crimea",
        "kind": "alias"
      },
      {
        "label": "Krimtatarisch",
        "kind": "alias"
      }
    ],
    "lao": [
      {
        "label": "lao",
        "kind": "local"
      },
      {
        "label": "ລາວ",
        "kind": "native"
      },
      {
        "label": "老挝语",
        "kind": "alias"
      },
      {
        "label": "Laotisch",
        "kind": "alias"
      }
    ],
    "sah": [
      {
        "label": "iakoute",
        "kind": "local"
      },
      {
        "label": "саха тыла",
        "kind": "native"
      },
      {
        "label": "Yakut",
        "kind": "english"
      },
      {
        "label": "萨哈语",
        "kind": "alias"
      },
      {
        "label": "sakha",
        "kind": "alias"
      },
      {
        "label": "Jakutisch",
        "kind": "alias"
      }
    ],
    "cop": [
      {
        "label": "copte",
        "kind": "local"
      },
      {
        "label": "Coptic",
        "kind": "english"
      },
      {
        "label": "科普特语",
        "kind": "alias"
      },
      {
        "label": "copto",
        "kind": "alias"
      },
      {
        "label": "Koptisch",
        "kind": "alias"
      }
    ],
    "pli": [
      {
        "label": "pali",
        "kind": "local"
      },
      {
        "label": "巴利语",
        "kind": "alias"
      }
    ],
    "xho": [
      {
        "label": "xhosa",
        "kind": "local"
      },
      {
        "label": "IsiXhosa",
        "kind": "native"
      },
      {
        "label": "科萨语",
        "kind": "alias"
      }
    ],
    "csb": [
      {
        "label": "kachoube",
        "kind": "local"
      },
      {
        "label": "Kashubian",
        "kind": "english"
      },
      {
        "label": "卡舒比语",
        "kind": "alias"
      },
      {
        "label": "casubio",
        "kind": "alias"
      },
      {
        "label": "Kaschubisch",
        "kind": "alias"
      }
    ],
    "arn": [
      {
        "label": "mapuche",
        "kind": "local"
      },
      {
        "label": "Mapudungun",
        "kind": "english"
      },
      {
        "label": "马普切语",
        "kind": "alias"
      }
    ],
    "sin": [
      {
        "label": "cingalais",
        "kind": "local"
      },
      {
        "label": "සිංහල",
        "kind": "native"
      },
      {
        "label": "Sinhala",
        "kind": "english"
      },
      {
        "label": "僧伽罗语",
        "kind": "alias"
      },
      {
        "label": "cingalés",
        "kind": "alias"
      },
      {
        "label": "Singhalesisch",
        "kind": "alias"
      },
      {
        "label": "sinhalese",
        "kind": "alias"
      }
    ],
    "ang": [
      {
        "label": "ancien anglais",
        "kind": "local"
      },
      {
        "label": "Old English",
        "kind": "english"
      },
      {
        "label": "古英语",
        "kind": "alias"
      },
      {
        "label": "inglés antiguo",
        "kind": "alias"
      },
      {
        "label": "Altenglisch",
        "kind": "alias"
      }
    ],
    "kas": [
      {
        "label": "cachemiri",
        "kind": "local"
      },
      {
        "label": "کٲشُر",
        "kind": "native"
      },
      {
        "label": "Kashmiri",
        "kind": "english"
      },
      {
        "label": "克什米尔语",
        "kind": "alias"
      },
      {
        "label": "cachemir",
        "kind": "alias"
      },
      {
        "label": "Kaschmiri",
        "kind": "alias"
      }
    ],
    "got": [
      {
        "label": "gotique",
        "kind": "local"
      },
      {
        "label": "Gothic",
        "kind": "english"
      },
      {
        "label": "哥特语",
        "kind": "alias"
      },
      {
        "label": "gótico",
        "kind": "alias"
      },
      {
        "label": "Gotisch",
        "kind": "alias"
      }
    ],
    "egy": [
      {
        "label": "égyptien ancien",
        "kind": "local"
      },
      {
        "label": "Egyptian",
        "kind": "english"
      },
      {
        "label": "古埃及语",
        "kind": "alias"
      },
      {
        "label": "Ancient Egyptian",
        "kind": "alias"
      },
      {
        "label": "egipcio antiguo",
        "kind": "alias"
      },
      {
        "label": "Ägyptisch",
        "kind": "alias"
      }
    ],
    "rom": [
      {
        "label": "romani",
        "kind": "local"
      },
      {
        "label": "吉普赛语",
        "kind": "alias"
      },
      {
        "label": "Romany",
        "kind": "alias"
      },
      {
        "label": "romaní",
        "kind": "alias"
      }
    ],
    "snd": [
      {
        "label": "sindhi",
        "kind": "local"
      },
      {
        "label": "سنڌي",
        "kind": "native"
      },
      {
        "label": "信德语",
        "kind": "alias"
      },
      {
        "label": "sindi",
        "kind": "alias"
      }
    ],
    "cos": [
      {
        "label": "corse",
        "kind": "local"
      },
      {
        "label": "Corsican",
        "kind": "english"
      },
      {
        "label": "科西嘉语",
        "kind": "alias"
      },
      {
        "label": "corso",
        "kind": "alias"
      },
      {
        "label": "Korsisch",
        "kind": "alias"
      }
    ],
    "ceb": [
      {
        "label": "cebuano",
        "kind": "local"
      },
      {
        "label": "宿务语",
        "kind": "alias"
      }
    ],
    "nds": [
      {
        "label": "bas-allemand",
        "kind": "local"
      },
      {
        "label": "Neddersass’sch",
        "kind": "native"
      },
      {
        "label": "Low German",
        "kind": "english"
      },
      {
        "label": "低地德语",
        "kind": "alias"
      },
      {
        "label": "bajo alemán",
        "kind": "alias"
      },
      {
        "label": "Niederdeutsch",
        "kind": "alias"
      }
    ],
    "aym": [
      {
        "label": "aymara",
        "kind": "local"
      },
      {
        "label": "艾马拉语",
        "kind": "alias"
      },
      {
        "label": "aimara",
        "kind": "alias"
      }
    ],
    "scn": [
      {
        "label": "sicilien",
        "kind": "local"
      },
      {
        "label": "Sicilian",
        "kind": "english"
      },
      {
        "label": "西西里语",
        "kind": "alias"
      },
      {
        "label": "siciliano",
        "kind": "alias"
      },
      {
        "label": "Sizilianisch",
        "kind": "alias"
      }
    ],
    "ast": [
      {
        "label": "asturien",
        "kind": "local"
      },
      {
        "label": "asturianu",
        "kind": "native"
      },
      {
        "label": "Asturian",
        "kind": "english"
      },
      {
        "label": "阿斯图里亚斯语",
        "kind": "alias"
      },
      {
        "label": "asturiano",
        "kind": "alias"
      },
      {
        "label": "Asturisch",
        "kind": "alias"
      }
    ],
    "dzo": [
      {
        "label": "dzongkha",
        "kind": "local"
      },
      {
        "label": "རྫོང་ཁ",
        "kind": "native"
      },
      {
        "label": "宗卡语",
        "kind": "alias"
      }
    ],
    "tok": [
      {
        "label": "toki pona",
        "kind": "local"
      },
      {
        "label": "道本语",
        "kind": "alias"
      }
    ],
    "kal": [
      {
        "label": "groenlandais",
        "kind": "local"
      },
      {
        "label": "kalaallisut",
        "kind": "native"
      },
      {
        "label": "Greenlandic",
        "kind": "english"
      },
      {
        "label": "格陵兰语",
        "kind": "alias"
      },
      {
        "label": "groenlandés",
        "kind": "alias"
      },
      {
        "label": "Grönländisch",
        "kind": "alias"
      }
    ],
    "ava": [
      {
        "label": "avar",
        "kind": "local"
      },
      {
        "label": "阿瓦尔语",
        "kind": "alias"
      },
      {
        "label": "Avaric",
        "kind": "alias"
      },
      {
        "label": "Awarisch",
        "kind": "alias"
      }
    ],
    "sun": [
      {
        "label": "soundanais",
        "kind": "local"
      },
      {
        "label": "Basa Sunda",
        "kind": "native"
      },
      {
        "label": "Sundanese",
        "kind": "english"
      },
      {
        "label": "巽他语",
        "kind": "alias"
      },
      {
        "label": "sundanés",
        "kind": "alias"
      },
      {
        "label": "Sundanesisch",
        "kind": "alias"
      }
    ],
    "wln": [
      {
        "label": "wallon",
        "kind": "local"
      },
      {
        "label": "Walloon",
        "kind": "english"
      },
      {
        "label": "瓦隆语",
        "kind": "alias"
      },
      {
        "label": "valón",
        "kind": "alias"
      },
      {
        "label": "Wallonisch",
        "kind": "alias"
      }
    ],
    "cnr": [
      {
        "label": "monténégrin",
        "kind": "local"
      },
      {
        "label": "crnogorski",
        "kind": "native"
      },
      {
        "label": "Montenegrin",
        "kind": "english"
      },
      {
        "label": "黑山语",
        "kind": "alias"
      },
      {
        "label": "montenegrino",
        "kind": "alias"
      },
      {
        "label": "Montenegrinisch",
        "kind": "alias"
      }
    ],
    "prs": [
      {
        "label": "dari",
        "kind": "local"
      },
      {
        "label": "دری",
        "kind": "native"
      },
      {
        "label": "达里语",
        "kind": "alias"
      },
      {
        "label": "darí",
        "kind": "alias"
      }
    ],
    "nap": [
      {
        "label": "napolitain",
        "kind": "local"
      },
      {
        "label": "Neapolitan",
        "kind": "english"
      },
      {
        "label": "那不勒斯语",
        "kind": "alias"
      },
      {
        "label": "napolitano",
        "kind": "alias"
      },
      {
        "label": "Neapolitanisch",
        "kind": "alias"
      }
    ],
    "tir": [
      {
        "label": "tigrigna",
        "kind": "local"
      },
      {
        "label": "ትግርኛ",
        "kind": "native"
      },
      {
        "label": "Tigrinya",
        "kind": "english"
      },
      {
        "label": "提格利尼亚语",
        "kind": "alias"
      },
      {
        "label": "tigriña",
        "kind": "alias"
      }
    ],
    "ain": [
      {
        "label": "aïnou",
        "kind": "local"
      },
      {
        "label": "Ainu",
        "kind": "english"
      },
      {
        "label": "阿伊努语",
        "kind": "alias"
      }
    ],
    "udm": [
      {
        "label": "oudmourte",
        "kind": "local"
      },
      {
        "label": "Udmurt",
        "kind": "english"
      },
      {
        "label": "乌德穆尔特语",
        "kind": "alias"
      },
      {
        "label": "Udmurtisch",
        "kind": "alias"
      }
    ],
    "akk": [
      {
        "label": "akkadien",
        "kind": "local"
      },
      {
        "label": "Akkadian",
        "kind": "english"
      },
      {
        "label": "阿卡德语",
        "kind": "alias"
      },
      {
        "label": "acadio",
        "kind": "alias"
      },
      {
        "label": "Akkadisch",
        "kind": "alias"
      }
    ],
    "gag": [
      {
        "label": "gagaouze",
        "kind": "local"
      },
      {
        "label": "Gagauz",
        "kind": "english"
      },
      {
        "label": "加告兹语",
        "kind": "alias"
      },
      {
        "label": "gagauzo",
        "kind": "alias"
      },
      {
        "label": "Gagausisch",
        "kind": "alias"
      }
    ],
    "ibo": [
      {
        "label": "igbo",
        "kind": "local"
      },
      {
        "label": "伊博语",
        "kind": "alias"
      }
    ],
    "krl": [
      {
        "label": "carélien",
        "kind": "local"
      },
      {
        "label": "Karelian",
        "kind": "english"
      },
      {
        "label": "卡累利阿语",
        "kind": "alias"
      },
      {
        "label": "carelio",
        "kind": "alias"
      },
      {
        "label": "Karelisch",
        "kind": "alias"
      }
    ],
    "ave": [
      {
        "label": "avestique",
        "kind": "local"
      },
      {
        "label": "Avestan",
        "kind": "english"
      },
      {
        "label": "阿维斯塔语",
        "kind": "alias"
      },
      {
        "label": "avéstico",
        "kind": "alias"
      },
      {
        "label": "Avestisch",
        "kind": "alias"
      }
    ],
    "div": [
      {
        "label": "maldivien",
        "kind": "local"
      },
      {
        "label": "Dhivehi",
        "kind": "english"
      },
      {
        "label": "迪维希语",
        "kind": "alias"
      },
      {
        "label": "divehi",
        "kind": "alias"
      },
      {
        "label": "maldivian",
        "kind": "alias"
      }
    ],
    "isv": [
      {
        "label": "Interslavic",
        "kind": "english"
      }
    ],
    "tyv": [
      {
        "label": "touvain",
        "kind": "local"
      },
      {
        "label": "Tuvan",
        "kind": "english"
      },
      {
        "label": "图瓦语",
        "kind": "alias"
      },
      {
        "label": "Tuvinian",
        "kind": "alias"
      },
      {
        "label": "tuviniano",
        "kind": "alias"
      },
      {
        "label": "Tuwinisch",
        "kind": "alias"
      }
    ],
    "lmo": [
      {
        "label": "lombard",
        "kind": "local"
      },
      {
        "label": "伦巴第语",
        "kind": "alias"
      },
      {
        "label": "lombardo",
        "kind": "alias"
      },
      {
        "label": "Lombardisch",
        "kind": "alias"
      }
    ],
    "ota": [
      {
        "label": "turc ottoman",
        "kind": "local"
      },
      {
        "label": "Ottoman Turkish",
        "kind": "english"
      },
      {
        "label": "奥斯曼土耳其语",
        "kind": "alias"
      },
      {
        "label": "turco otomano",
        "kind": "alias"
      },
      {
        "label": "Osmanisch",
        "kind": "alias"
      }
    ],
    "myv": [
      {
        "label": "erzya",
        "kind": "local"
      },
      {
        "label": "厄尔兹亚语",
        "kind": "alias"
      },
      {
        "label": "Ersja-Mordwinisch",
        "kind": "alias"
      }
    ],
    "bal": [
      {
        "label": "baloutchi",
        "kind": "local"
      },
      {
        "label": "Balochi",
        "kind": "english"
      },
      {
        "label": "俾路支语",
        "kind": "alias"
      },
      {
        "label": "Baluchi",
        "kind": "alias"
      },
      {
        "label": "Belutschisch",
        "kind": "alias"
      }
    ],
    "yor": [
      {
        "label": "yoruba",
        "kind": "local"
      },
      {
        "label": "Èdè Yorùbá",
        "kind": "native"
      },
      {
        "label": "约鲁巴语",
        "kind": "alias"
      }
    ],
    "pms": [
      {
        "label": "piémontais",
        "kind": "local"
      },
      {
        "label": "Piedmontese",
        "kind": "english"
      },
      {
        "label": "Piemontesisch",
        "kind": "alias"
      }
    ],
    "ady": [
      {
        "label": "adyguéen",
        "kind": "local"
      },
      {
        "label": "Adyghe",
        "kind": "english"
      },
      {
        "label": "阿迪格语",
        "kind": "alias"
      },
      {
        "label": "adigué",
        "kind": "alias"
      },
      {
        "label": "Adygeisch",
        "kind": "alias"
      }
    ],
    "wol": [
      {
        "label": "wolof",
        "kind": "local"
      },
      {
        "label": "沃洛夫语",
        "kind": "alias"
      },
      {
        "label": "wólof",
        "kind": "alias"
      }
    ],
    "fur": [
      {
        "label": "frioulan",
        "kind": "local"
      },
      {
        "label": "furlan",
        "kind": "native"
      },
      {
        "label": "Friulian",
        "kind": "english"
      },
      {
        "label": "弗留利语",
        "kind": "alias"
      },
      {
        "label": "friulano",
        "kind": "alias"
      },
      {
        "label": "Friaulisch",
        "kind": "alias"
      }
    ],
    "smo": [
      {
        "label": "samoan",
        "kind": "local"
      },
      {
        "label": "萨摩亚语",
        "kind": "alias"
      },
      {
        "label": "samoano",
        "kind": "alias"
      },
      {
        "label": "Samoanisch",
        "kind": "alias"
      }
    ],
    "rue": [
      {
        "label": "ruthène",
        "kind": "local"
      },
      {
        "label": "Rusyn",
        "kind": "english"
      },
      {
        "label": "Russinisch",
        "kind": "alias"
      }
    ],
    "sot": [
      {
        "label": "sotho du Sud",
        "kind": "local"
      },
      {
        "label": "Sesotho",
        "kind": "native"
      },
      {
        "label": "南索托语",
        "kind": "alias"
      },
      {
        "label": "Southern Sotho",
        "kind": "alias"
      },
      {
        "label": "sotho meridional",
        "kind": "alias"
      },
      {
        "label": "Süd-Sotho",
        "kind": "alias"
      }
    ],
    "hat": [
      {
        "label": "créole haïtien",
        "kind": "local"
      },
      {
        "label": "Haitian Creole",
        "kind": "english"
      },
      {
        "label": "海地克里奥尔语",
        "kind": "alias"
      },
      {
        "label": "criollo haitiano",
        "kind": "alias"
      },
      {
        "label": "Haiti-Kreolisch",
        "kind": "alias"
      }
    ],
    "syc": [
      {
        "label": "syriaque classique",
        "kind": "local"
      },
      {
        "label": "Syriac",
        "kind": "english"
      },
      {
        "label": "古典叙利亚语",
        "kind": "alias"
      },
      {
        "label": "Classical Syriac",
        "kind": "alias"
      },
      {
        "label": "siríaco clásico",
        "kind": "alias"
      },
      {
        "label": "Altsyrisch",
        "kind": "alias"
      }
    ],
    "kom": [
      {
        "label": "komi",
        "kind": "local"
      },
      {
        "label": "科米语",
        "kind": "alias"
      }
    ],
    "kin": [
      {
        "label": "kinyarwanda",
        "kind": "local"
      },
      {
        "label": "Ikinyarwanda",
        "kind": "native"
      },
      {
        "label": "卢旺达语",
        "kind": "alias"
      }
    ],
    "hif": [
      {
        "label": "hindi fidjien",
        "kind": "local"
      },
      {
        "label": "Fiji Hindi",
        "kind": "english"
      },
      {
        "label": "Fidschi-Hindi",
        "kind": "alias"
      }
    ],
    "tpi": [
      {
        "label": "tok pisin",
        "kind": "local"
      },
      {
        "label": "托克皮辛语",
        "kind": "alias"
      },
      {
        "label": "Neumelanesisch",
        "kind": "alias"
      }
    ],
    "nav": [
      {
        "label": "navajo",
        "kind": "local"
      },
      {
        "label": "纳瓦霍语",
        "kind": "alias"
      }
    ],
    "ton": [
      {
        "label": "tongien",
        "kind": "local"
      },
      {
        "label": "lea fakatonga",
        "kind": "native"
      },
      {
        "label": "Tongan",
        "kind": "english"
      },
      {
        "label": "汤加语",
        "kind": "alias"
      },
      {
        "label": "tongano",
        "kind": "alias"
      },
      {
        "label": "Tongaisch",
        "kind": "alias"
      }
    ],
    "nob": [
      {
        "label": "norvégien bokmål",
        "kind": "local"
      },
      {
        "label": "norsk bokmål",
        "kind": "native"
      },
      {
        "label": "Bokmål",
        "kind": "english"
      },
      {
        "label": "书面挪威语",
        "kind": "alias"
      },
      {
        "label": "Norwegian Bokmål",
        "kind": "alias"
      },
      {
        "label": "noruego bokmal",
        "kind": "alias"
      },
      {
        "label": "Norwegisch (Bokmål)",
        "kind": "alias"
      }
    ],
    "nno": [
      {
        "label": "norvégien nynorsk",
        "kind": "local"
      },
      {
        "label": "norsk nynorsk",
        "kind": "native"
      },
      {
        "label": "Nynorsk",
        "kind": "english"
      },
      {
        "label": "挪威尼诺斯克语",
        "kind": "alias"
      },
      {
        "label": "Norwegian Nynorsk",
        "kind": "alias"
      },
      {
        "label": "noruego nynorsk",
        "kind": "alias"
      },
      {
        "label": "Norwegisch (Nynorsk)",
        "kind": "alias"
      }
    ],
    "kok": [
      {
        "label": "konkani",
        "kind": "local"
      },
      {
        "label": "कोंकणी",
        "kind": "native"
      },
      {
        "label": "孔卡尼语",
        "kind": "alias"
      },
      {
        "label": "konkaní",
        "kind": "alias"
      }
    ],
    "mai": [
      {
        "label": "maïthili",
        "kind": "local"
      },
      {
        "label": "मैथिली",
        "kind": "native"
      },
      {
        "label": "Maithili",
        "kind": "english"
      },
      {
        "label": "迈蒂利语",
        "kind": "alias"
      }
    ],
    "mnc": [
      {
        "label": "mandchou",
        "kind": "local"
      },
      {
        "label": "Manchu",
        "kind": "english"
      },
      {
        "label": "满语",
        "kind": "alias"
      },
      {
        "label": "manchú",
        "kind": "alias"
      },
      {
        "label": "Mandschurisch",
        "kind": "alias"
      },
      {
        "label": "滿語",
        "kind": "alias"
      }
    ],
    "liv": [
      {
        "label": "livonien",
        "kind": "local"
      },
      {
        "label": "Livonian",
        "kind": "english"
      },
      {
        "label": "Livisch",
        "kind": "alias"
      }
    ],
    "nov": [
      {
        "label": "novial",
        "kind": "local"
      }
    ],
    "tsn": [
      {
        "label": "tswana",
        "kind": "local"
      },
      {
        "label": "Setswana",
        "kind": "native"
      },
      {
        "label": "茨瓦纳语",
        "kind": "alias"
      },
      {
        "label": "setsuana",
        "kind": "alias"
      }
    ],
    "vec": [
      {
        "label": "vénitien",
        "kind": "local"
      },
      {
        "label": "veneto",
        "kind": "native"
      },
      {
        "label": "Venetian",
        "kind": "english"
      },
      {
        "label": "威尼斯语",
        "kind": "alias"
      },
      {
        "label": "veneciano",
        "kind": "alias"
      },
      {
        "label": "Venetisch",
        "kind": "alias"
      }
    ],
    "sux": [
      {
        "label": "sumérien",
        "kind": "local"
      },
      {
        "label": "Sumerian",
        "kind": "english"
      },
      {
        "label": "苏美尔语",
        "kind": "alias"
      },
      {
        "label": "sumerio",
        "kind": "alias"
      },
      {
        "label": "Sumerisch",
        "kind": "alias"
      }
    ],
    "hsb": [
      {
        "label": "haut-sorabe",
        "kind": "local"
      },
      {
        "label": "hornjoserbšćina",
        "kind": "native"
      },
      {
        "label": "Upper Sorbian",
        "kind": "english"
      },
      {
        "label": "上索布语",
        "kind": "alias"
      },
      {
        "label": "alto sorbio",
        "kind": "alias"
      },
      {
        "label": "Obersorbisch",
        "kind": "alias"
      }
    ],
    "lim": [
      {
        "label": "limbourgeois",
        "kind": "local"
      },
      {
        "label": "Limburgish language",
        "kind": "english"
      },
      {
        "label": "林堡语",
        "kind": "alias"
      },
      {
        "label": "Limburgish",
        "kind": "alias"
      },
      {
        "label": "limburgués",
        "kind": "alias"
      },
      {
        "label": "Limburgisch",
        "kind": "alias"
      }
    ],
    "tlh": [
      {
        "label": "klingon",
        "kind": "local"
      },
      {
        "label": "克林贡语",
        "kind": "alias"
      },
      {
        "label": "Klingonisch",
        "kind": "alias"
      }
    ],
    "new": [
      {
        "label": "newari",
        "kind": "local"
      },
      {
        "label": "Newar",
        "kind": "english"
      },
      {
        "label": "尼瓦尔语",
        "kind": "alias"
      },
      {
        "label": "nevarí",
        "kind": "alias"
      }
    ],
    "bua": [
      {
        "label": "bouriate",
        "kind": "local"
      },
      {
        "label": "Buryat",
        "kind": "english"
      },
      {
        "label": "布里亚特语",
        "kind": "alias"
      },
      {
        "label": "Buriat",
        "kind": "alias"
      },
      {
        "label": "buriato",
        "kind": "alias"
      },
      {
        "label": "Burjatisch",
        "kind": "alias"
      }
    ],
    "lld": [
      {
        "label": "Ladin",
        "kind": "english"
      }
    ],
    "sme": [
      {
        "label": "same du Nord",
        "kind": "local"
      },
      {
        "label": "davvisámegiella",
        "kind": "native"
      },
      {
        "label": "Northern Sami",
        "kind": "english"
      },
      {
        "label": "北方萨米语",
        "kind": "alias"
      },
      {
        "label": "sami septentrional",
        "kind": "alias"
      },
      {
        "label": "Nordsamisch",
        "kind": "alias"
      }
    ],
    "ssw": [
      {
        "label": "swati",
        "kind": "local"
      },
      {
        "label": "Swazi",
        "kind": "english"
      },
      {
        "label": "斯瓦蒂语",
        "kind": "alias"
      },
      {
        "label": "suazi",
        "kind": "alias"
      }
    ],
    "aar": [
      {
        "label": "afar",
        "kind": "local"
      },
      {
        "label": "阿法尔语",
        "kind": "alias"
      }
    ],
    "lez": [
      {
        "label": "lezghien",
        "kind": "local"
      },
      {
        "label": "Lezgian",
        "kind": "english"
      },
      {
        "label": "列兹金语",
        "kind": "alias"
      },
      {
        "label": "Lezghian",
        "kind": "alias"
      },
      {
        "label": "lezgiano",
        "kind": "alias"
      },
      {
        "label": "Lesgisch",
        "kind": "alias"
      }
    ],
    "bho": [
      {
        "label": "bhodjpouri",
        "kind": "local"
      },
      {
        "label": "भोजपुरी",
        "kind": "native"
      },
      {
        "label": "Bhojpuri",
        "kind": "english"
      },
      {
        "label": "博杰普尔语",
        "kind": "alias"
      },
      {
        "label": "bhoyapurí",
        "kind": "alias"
      },
      {
        "label": "Bhodschpuri",
        "kind": "alias"
      }
    ],
    "kaa": [
      {
        "label": "karakalpak",
        "kind": "local"
      },
      {
        "label": "卡拉卡尔帕克语",
        "kind": "alias"
      },
      {
        "label": "Kara-Kalpak",
        "kind": "alias"
      },
      {
        "label": "karakalpako",
        "kind": "alias"
      },
      {
        "label": "Karakalpakisch",
        "kind": "alias"
      }
    ],
    "dsb": [
      {
        "label": "bas-sorabe",
        "kind": "local"
      },
      {
        "label": "dolnoserbšćina",
        "kind": "native"
      },
      {
        "label": "Lower Sorbian",
        "kind": "english"
      },
      {
        "label": "下索布语",
        "kind": "alias"
      },
      {
        "label": "bajo sorbio",
        "kind": "alias"
      },
      {
        "label": "Niedersorbisch",
        "kind": "alias"
      }
    ],
    "mni": [
      {
        "label": "manipuri",
        "kind": "local"
      },
      {
        "label": "মৈতৈলোন্",
        "kind": "native"
      },
      {
        "label": "Meitei",
        "kind": "english"
      },
      {
        "label": "曼尼普尔语",
        "kind": "alias"
      },
      {
        "label": "manipurí",
        "kind": "alias"
      },
      {
        "label": "Meithei",
        "kind": "alias"
      }
    ],
    "rup": [
      {
        "label": "aroumain",
        "kind": "local"
      },
      {
        "label": "Aromanian",
        "kind": "english"
      },
      {
        "label": "阿罗马尼亚语",
        "kind": "alias"
      },
      {
        "label": "arrumano",
        "kind": "alias"
      },
      {
        "label": "Aromunisch",
        "kind": "alias"
      }
    ],
    "iku": [
      {
        "label": "inuktitut",
        "kind": "local"
      },
      {
        "label": "因纽特语",
        "kind": "alias"
      }
    ],
    "nau": [
      {
        "label": "nauruan",
        "kind": "local"
      },
      {
        "label": "瑙鲁语",
        "kind": "alias"
      },
      {
        "label": "Nauru",
        "kind": "alias"
      },
      {
        "label": "nauruano",
        "kind": "alias"
      },
      {
        "label": "Nauruisch",
        "kind": "alias"
      }
    ],
    "pap": [
      {
        "label": "papiamento",
        "kind": "local"
      },
      {
        "label": "帕皮阿门托语",
        "kind": "alias"
      }
    ],
    "bar": [
      {
        "label": "bavarois",
        "kind": "local"
      },
      {
        "label": "Bavarian",
        "kind": "english"
      },
      {
        "label": "Bairisch",
        "kind": "alias"
      }
    ],
    "run": [
      {
        "label": "roundi",
        "kind": "local"
      },
      {
        "label": "Ikirundi",
        "kind": "native"
      },
      {
        "label": "Kirundi",
        "kind": "english"
      },
      {
        "label": "隆迪语",
        "kind": "alias"
      },
      {
        "label": "Rundi",
        "kind": "alias"
      }
    ],
    "krc": [
      {
        "label": "karatchaï balkar",
        "kind": "local"
      },
      {
        "label": "Karachay-Balkar",
        "kind": "english"
      },
      {
        "label": "卡拉恰伊巴尔卡尔语",
        "kind": "alias"
      },
      {
        "label": "Karatschaiisch-Balkarisch",
        "kind": "alias"
      }
    ],
    "tet": [
      {
        "label": "tétoum",
        "kind": "local"
      },
      {
        "label": "Tetum",
        "kind": "english"
      },
      {
        "label": "德顿语",
        "kind": "alias"
      },
      {
        "label": "tetún",
        "kind": "alias"
      }
    ],
    "vep": [
      {
        "label": "vepse",
        "kind": "local"
      },
      {
        "label": "Veps",
        "kind": "english"
      },
      {
        "label": "维普森语",
        "kind": "alias"
      },
      {
        "label": "Wepsisch",
        "kind": "alias"
      }
    ],
    "non": [
      {
        "label": "vieux norrois",
        "kind": "local"
      },
      {
        "label": "Old Norse",
        "kind": "english"
      },
      {
        "label": "古诺尔斯语",
        "kind": "alias"
      },
      {
        "label": "nórdico antiguo",
        "kind": "alias"
      },
      {
        "label": "Altnordisch",
        "kind": "alias"
      }
    ],
    "nya": [
      {
        "label": "chewa",
        "kind": "local"
      },
      {
        "label": "齐切瓦语",
        "kind": "alias"
      },
      {
        "label": "Nyanja",
        "kind": "alias"
      }
    ],
    "chr": [
      {
        "label": "cherokee",
        "kind": "local"
      },
      {
        "label": "ᏣᎳᎩ",
        "kind": "native"
      },
      {
        "label": "切罗基语",
        "kind": "alias"
      },
      {
        "label": "cheroqui",
        "kind": "alias"
      }
    ],
    "wuu": [
      {
        "label": "chinois wu",
        "kind": "local"
      },
      {
        "label": "吴语",
        "kind": "native"
      },
      {
        "label": "Wu Chinese",
        "kind": "english"
      },
      {
        "label": "chino wu",
        "kind": "alias"
      },
      {
        "label": "Wu-Chinesisch",
        "kind": "alias"
      },
      {
        "label": "shanghainese",
        "kind": "alias"
      },
      {
        "label": "上海话",
        "kind": "alias"
      },
      {
        "label": "上海话方言",
        "kind": "alias"
      }
    ],
    "bam": [
      {
        "label": "bambara",
        "kind": "local"
      },
      {
        "label": "bamanakan",
        "kind": "native"
      },
      {
        "label": "班巴拉语",
        "kind": "alias"
      }
    ],
    "ful": [
      {
        "label": "peul",
        "kind": "local"
      },
      {
        "label": "Pulaar",
        "kind": "native"
      },
      {
        "label": "Fula",
        "kind": "english"
      },
      {
        "label": "富拉语",
        "kind": "alias"
      },
      {
        "label": "Ful",
        "kind": "alias"
      }
    ],
    "inh": [
      {
        "label": "ingouche",
        "kind": "local"
      },
      {
        "label": "Ingush",
        "kind": "english"
      },
      {
        "label": "印古什语",
        "kind": "alias"
      },
      {
        "label": "Inguschisch",
        "kind": "alias"
      }
    ],
    "orm": [
      {
        "label": "oromo",
        "kind": "local"
      },
      {
        "label": "Oromoo",
        "kind": "native"
      },
      {
        "label": "奥罗莫语",
        "kind": "alias"
      }
    ],
    "ban": [
      {
        "label": "balinais",
        "kind": "local"
      },
      {
        "label": "Balinese",
        "kind": "english"
      },
      {
        "label": "巴厘语",
        "kind": "alias"
      },
      {
        "label": "balinés",
        "kind": "alias"
      },
      {
        "label": "Balinesisch",
        "kind": "alias"
      }
    ],
    "fij": [
      {
        "label": "fidjien",
        "kind": "local"
      },
      {
        "label": "Fijian",
        "kind": "english"
      },
      {
        "label": "斐济语",
        "kind": "alias"
      },
      {
        "label": "fiyiano",
        "kind": "alias"
      },
      {
        "label": "Fidschi",
        "kind": "alias"
      }
    ],
    "chm": [
      {
        "label": "mari",
        "kind": "local"
      },
      {
        "label": "马里语",
        "kind": "alias"
      },
      {
        "label": "marí",
        "kind": "alias"
      }
    ],
    "mdf": [
      {
        "label": "mokcha",
        "kind": "local"
      },
      {
        "label": "Moksha",
        "kind": "english"
      },
      {
        "label": "莫克沙语",
        "kind": "alias"
      },
      {
        "label": "Mokschanisch",
        "kind": "alias"
      }
    ],
    "sna": [
      {
        "label": "shona",
        "kind": "local"
      },
      {
        "label": "chiShona",
        "kind": "native"
      },
      {
        "label": "绍纳语",
        "kind": "alias"
      }
    ],
    "lij": [
      {
        "label": "ligure",
        "kind": "local"
      },
      {
        "label": "Ligurian",
        "kind": "english"
      },
      {
        "label": "利古里亚语",
        "kind": "alias"
      },
      {
        "label": "ligur",
        "kind": "alias"
      },
      {
        "label": "Ligurisch",
        "kind": "alias"
      }
    ],
    "min": [
      {
        "label": "minangkabau",
        "kind": "local"
      },
      {
        "label": "米南佳保语",
        "kind": "alias"
      }
    ],
    "sat": [
      {
        "label": "santali",
        "kind": "local"
      },
      {
        "label": "ᱥᱟᱱᱛᱟᱲᱤ",
        "kind": "native"
      },
      {
        "label": "桑塔利语",
        "kind": "alias"
      }
    ],
    "abq": [
      {
        "label": "Abaza",
        "kind": "english"
      }
    ],
    "ewe": [
      {
        "label": "éwé",
        "kind": "local"
      },
      {
        "label": "eʋegbe",
        "kind": "native"
      },
      {
        "label": "Ewe",
        "kind": "english"
      },
      {
        "label": "埃维语",
        "kind": "alias"
      },
      {
        "label": "ewé",
        "kind": "alias"
      }
    ],
    "bis": [
      {
        "label": "bichelamar",
        "kind": "local"
      },
      {
        "label": "Bislama",
        "kind": "english"
      },
      {
        "label": "比斯拉马语",
        "kind": "alias"
      }
    ],
    "kbd": [
      {
        "label": "kabarde",
        "kind": "local"
      },
      {
        "label": "Kabardian",
        "kind": "english"
      },
      {
        "label": "卡巴尔德语",
        "kind": "alias"
      },
      {
        "label": "kabardiano",
        "kind": "alias"
      },
      {
        "label": "Kabardinisch",
        "kind": "alias"
      }
    ],
    "nrf": [
      {
        "label": "Norman",
        "kind": "english"
      }
    ],
    "fry": [
      {
        "label": "frison occidental",
        "kind": "local"
      },
      {
        "label": "Frysk",
        "kind": "native"
      },
      {
        "label": "West Frisian",
        "kind": "english"
      },
      {
        "label": "西弗里西亚语",
        "kind": "alias"
      },
      {
        "label": "Western Frisian",
        "kind": "alias"
      },
      {
        "label": "frisón occidental",
        "kind": "alias"
      },
      {
        "label": "Westfriesisch",
        "kind": "alias"
      }
    ],
    "arz": [
      {
        "label": "arabe égyptien",
        "kind": "local"
      },
      {
        "label": "Egyptian Arabic",
        "kind": "english"
      },
      {
        "label": "Ägyptisches Arabisch",
        "kind": "alias"
      }
    ],
    "vro": [
      {
        "label": "võro",
        "kind": "local"
      }
    ],
    "ilo": [
      {
        "label": "ilocano",
        "kind": "local"
      },
      {
        "label": "伊洛卡诺语",
        "kind": "alias"
      },
      {
        "label": "Iloko",
        "kind": "alias"
      },
      {
        "label": "Ilokano",
        "kind": "alias"
      }
    ],
    "lin": [
      {
        "label": "lingala",
        "kind": "local"
      },
      {
        "label": "lingála",
        "kind": "native"
      },
      {
        "label": "林加拉语",
        "kind": "alias"
      }
    ],
    "jbo": [
      {
        "label": "lojban",
        "kind": "local"
      },
      {
        "label": "逻辑语",
        "kind": "alias"
      }
    ],
    "mwl": [
      {
        "label": "mirandais",
        "kind": "local"
      },
      {
        "label": "Mirandese",
        "kind": "english"
      },
      {
        "label": "米兰德斯语",
        "kind": "alias"
      },
      {
        "label": "mirandés",
        "kind": "alias"
      },
      {
        "label": "Mirandesisch",
        "kind": "alias"
      }
    ],
    "frp": [
      {
        "label": "francoprovençal",
        "kind": "local"
      },
      {
        "label": "Arpitan language",
        "kind": "english"
      },
      {
        "label": "Arpitan",
        "kind": "alias"
      },
      {
        "label": "Frankoprovenzalisch",
        "kind": "alias"
      }
    ],
    "tso": [
      {
        "label": "tsonga",
        "kind": "local"
      },
      {
        "label": "聪加语",
        "kind": "alias"
      }
    ],
    "xal": [
      {
        "label": "kalmouk",
        "kind": "local"
      },
      {
        "label": "Kalmyk",
        "kind": "english"
      },
      {
        "label": "卡尔梅克语",
        "kind": "alias"
      },
      {
        "label": "Kalmückisch",
        "kind": "alias"
      }
    ],
    "ett": [
      {
        "label": "Etruscan",
        "kind": "english"
      }
    ],
    "tah": [
      {
        "label": "tahitien",
        "kind": "local"
      },
      {
        "label": "Tahitian",
        "kind": "english"
      },
      {
        "label": "塔希提语",
        "kind": "alias"
      },
      {
        "label": "tahitiano",
        "kind": "alias"
      },
      {
        "label": "Tahitisch",
        "kind": "alias"
      }
    ],
    "ven": [
      {
        "label": "venda",
        "kind": "local"
      },
      {
        "label": "文达语",
        "kind": "alias"
      }
    ],
    "tcy": [
      {
        "label": "toulou",
        "kind": "local"
      },
      {
        "label": "Tulu",
        "kind": "english"
      }
    ],
    "cha": [
      {
        "label": "chamorro",
        "kind": "local"
      },
      {
        "label": "查莫罗语",
        "kind": "alias"
      }
    ],
    "hak": [
      {
        "label": "hakka",
        "kind": "local"
      },
      {
        "label": "客家話",
        "kind": "native"
      },
      {
        "label": "Hakka Chinese",
        "kind": "english"
      },
      {
        "label": "客家话",
        "kind": "alias"
      },
      {
        "label": "chino hakka",
        "kind": "alias"
      },
      {
        "label": "客家语",
        "kind": "alias"
      }
    ],
    "kjh": [
      {
        "label": "Khakas",
        "kind": "english"
      }
    ],
    "ace": [
      {
        "label": "aceh",
        "kind": "local"
      },
      {
        "label": "Acehnese",
        "kind": "english"
      },
      {
        "label": "亚齐语",
        "kind": "alias"
      },
      {
        "label": "achenés",
        "kind": "alias"
      }
    ],
    "gsw": [
      {
        "label": "suisse allemand",
        "kind": "local"
      },
      {
        "label": "Schwiizertüütsch",
        "kind": "native"
      },
      {
        "label": "Swiss German",
        "kind": "english"
      },
      {
        "label": "瑞士德语",
        "kind": "alias"
      },
      {
        "label": "alemán suizo",
        "kind": "alias"
      },
      {
        "label": "Schweizerdeutsch",
        "kind": "alias"
      },
      {
        "label": "alemannic",
        "kind": "alias"
      },
      {
        "label": "alsatian",
        "kind": "alias"
      }
    ],
    "war": [
      {
        "label": "waray",
        "kind": "local"
      },
      {
        "label": "瓦瑞语",
        "kind": "alias"
      }
    ],
    "hit": [
      {
        "label": "hittite",
        "kind": "local"
      },
      {
        "label": "赫梯语",
        "kind": "alias"
      },
      {
        "label": "hitita",
        "kind": "alias"
      },
      {
        "label": "Hethitisch",
        "kind": "alias"
      }
    ],
    "mns": [
      {
        "label": "Mansi",
        "kind": "english"
      }
    ],
    "pcd": [
      {
        "label": "picard",
        "kind": "local"
      },
      {
        "label": "Picardisch",
        "kind": "alias"
      }
    ],
    "gez": [
      {
        "label": "guèze",
        "kind": "local"
      },
      {
        "label": "Ge'ez",
        "kind": "english"
      },
      {
        "label": "吉兹语",
        "kind": "alias"
      },
      {
        "label": "Geez",
        "kind": "alias"
      }
    ],
    "brx": [
      {
        "label": "bodo",
        "kind": "local"
      },
      {
        "label": "बर’",
        "kind": "native"
      },
      {
        "label": "博多语",
        "kind": "alias"
      }
    ],
    "phn": [
      {
        "label": "phénicien",
        "kind": "local"
      },
      {
        "label": "Phoenician",
        "kind": "english"
      },
      {
        "label": "腓尼基语",
        "kind": "alias"
      },
      {
        "label": "fenicio",
        "kind": "alias"
      },
      {
        "label": "Phönizisch",
        "kind": "alias"
      }
    ],
    "mah": [
      {
        "label": "marshallais",
        "kind": "local"
      },
      {
        "label": "Marshallese",
        "kind": "english"
      },
      {
        "label": "马绍尔语",
        "kind": "alias"
      },
      {
        "label": "marshalés",
        "kind": "alias"
      },
      {
        "label": "Marschallesisch",
        "kind": "alias"
      }
    ],
    "kca": [
      {
        "label": "Khanty",
        "kind": "english"
      }
    ],
    "dgo": [
      {
        "label": "dogri",
        "kind": "local"
      },
      {
        "label": "डोगरी",
        "kind": "native"
      },
      {
        "label": "多格拉语",
        "kind": "alias"
      }
    ],
    "brh": [
      {
        "label": "brahoui",
        "kind": "local"
      },
      {
        "label": "Brahui",
        "kind": "english"
      }
    ],
    "nog": [
      {
        "label": "nogaï",
        "kind": "local"
      },
      {
        "label": "Nogai",
        "kind": "english"
      },
      {
        "label": "诺盖语",
        "kind": "alias"
      }
    ],
    "ckt": [
      {
        "label": "Chukchi",
        "kind": "english"
      }
    ],
    "lbe": [
      {
        "label": "Lak",
        "kind": "english"
      }
    ],
    "mzn": [
      {
        "label": "mazandérani",
        "kind": "local"
      },
      {
        "label": "مازرونی",
        "kind": "native"
      },
      {
        "label": "Mazanderani",
        "kind": "english"
      },
      {
        "label": "马赞德兰语",
        "kind": "alias"
      },
      {
        "label": "mazandaraní",
        "kind": "alias"
      },
      {
        "label": "Masanderanisch",
        "kind": "alias"
      }
    ],
    "gil": [
      {
        "label": "gilbertin",
        "kind": "local"
      },
      {
        "label": "Gilbertese",
        "kind": "english"
      },
      {
        "label": "吉尔伯特语",
        "kind": "alias"
      },
      {
        "label": "gilbertés",
        "kind": "alias"
      },
      {
        "label": "Kiribatisch",
        "kind": "alias"
      }
    ],
    "bug": [
      {
        "label": "bugi",
        "kind": "local"
      },
      {
        "label": "Bugis",
        "kind": "english"
      },
      {
        "label": "布吉语",
        "kind": "alias"
      },
      {
        "label": "Buginese",
        "kind": "alias"
      },
      {
        "label": "buginés",
        "kind": "alias"
      },
      {
        "label": "Buginesisch",
        "kind": "alias"
      }
    ],
    "izh": [
      {
        "label": "ingrien",
        "kind": "local"
      },
      {
        "label": "Ingrian",
        "kind": "english"
      },
      {
        "label": "Ischorisch",
        "kind": "alias"
      }
    ],
    "kon": [
      {
        "label": "kikongo",
        "kind": "local"
      },
      {
        "label": "Kongo",
        "kind": "english"
      },
      {
        "label": "刚果语",
        "kind": "alias"
      },
      {
        "label": "Kongolesisch",
        "kind": "alias"
      }
    ],
    "ell": [
      {
        "label": "grec",
        "kind": "local"
      },
      {
        "label": "Ελληνικά",
        "kind": "native"
      },
      {
        "label": "Modern Greek",
        "kind": "english"
      },
      {
        "label": "希腊语",
        "kind": "alias"
      },
      {
        "label": "Greek",
        "kind": "alias"
      },
      {
        "label": "griego",
        "kind": "alias"
      },
      {
        "label": "Griechisch",
        "kind": "alias"
      }
    ],
    "chg": [
      {
        "label": "tchaghataï",
        "kind": "local"
      },
      {
        "label": "Chagatai",
        "kind": "english"
      },
      {
        "label": "察合台语",
        "kind": "alias"
      },
      {
        "label": "chagatái",
        "kind": "alias"
      },
      {
        "label": "Tschagataisch",
        "kind": "alias"
      }
    ],
    "pdc": [
      {
        "label": "pennsilfaanisch",
        "kind": "local"
      },
      {
        "label": "Pennsylvania German",
        "kind": "english"
      },
      {
        "label": "Pennsylvaniadeutsch",
        "kind": "alias"
      }
    ],
    "aka": [
      {
        "label": "akan",
        "kind": "local"
      },
      {
        "label": "阿肯语",
        "kind": "alias"
      }
    ],
    "kum": [
      {
        "label": "koumyk",
        "kind": "local"
      },
      {
        "label": "Kumyk",
        "kind": "english"
      },
      {
        "label": "库梅克语",
        "kind": "alias"
      },
      {
        "label": "Kumükisch",
        "kind": "alias"
      }
    ],
    "hmo": [
      {
        "label": "hiri motu",
        "kind": "local"
      },
      {
        "label": "希里莫图语",
        "kind": "alias"
      },
      {
        "label": "Hiri-Motu",
        "kind": "alias"
      }
    ],
    "ale": [
      {
        "label": "aléoute",
        "kind": "local"
      },
      {
        "label": "Aleut",
        "kind": "english"
      },
      {
        "label": "阿留申语",
        "kind": "alias"
      },
      {
        "label": "aleutiano",
        "kind": "alias"
      },
      {
        "label": "Aleutisch",
        "kind": "alias"
      }
    ],
    "awa": [
      {
        "label": "awadhi",
        "kind": "local"
      },
      {
        "label": "阿瓦德语",
        "kind": "alias"
      },
      {
        "label": "avadhi",
        "kind": "alias"
      }
    ],
    "dlm": [
      {
        "label": "Dalmatian",
        "kind": "english"
      }
    ],
    "her": [
      {
        "label": "héréro",
        "kind": "local"
      },
      {
        "label": "Herero",
        "kind": "english"
      },
      {
        "label": "赫雷罗语",
        "kind": "alias"
      }
    ],
    "enm": [
      {
        "label": "moyen anglais",
        "kind": "local"
      },
      {
        "label": "Middle English",
        "kind": "english"
      },
      {
        "label": "中古英语",
        "kind": "alias"
      },
      {
        "label": "inglés medio",
        "kind": "alias"
      },
      {
        "label": "Mittelenglisch",
        "kind": "alias"
      }
    ],
    "prg": [
      {
        "label": "prussien",
        "kind": "local"
      },
      {
        "label": "prūsiskan",
        "kind": "native"
      },
      {
        "label": "Old Prussian",
        "kind": "english"
      },
      {
        "label": "普鲁士语",
        "kind": "alias"
      },
      {
        "label": "Prussian",
        "kind": "alias"
      },
      {
        "label": "prusiano",
        "kind": "alias"
      },
      {
        "label": "Altpreußisch",
        "kind": "alias"
      }
    ],
    "yrk": [
      {
        "label": "Nenets",
        "kind": "english"
      }
    ],
    "qya": [
      {
        "label": "Quenya",
        "kind": "english"
      }
    ],
    "vot": [
      {
        "label": "vote",
        "kind": "local"
      },
      {
        "label": "Votic",
        "kind": "english"
      },
      {
        "label": "沃提克语",
        "kind": "alias"
      },
      {
        "label": "vótico",
        "kind": "alias"
      },
      {
        "label": "Wotisch",
        "kind": "alias"
      }
    ],
    "pau": [
      {
        "label": "palau",
        "kind": "local"
      },
      {
        "label": "Palauan",
        "kind": "english"
      },
      {
        "label": "帕劳语",
        "kind": "alias"
      },
      {
        "label": "palauano",
        "kind": "alias"
      }
    ],
    "nan": [
      {
        "label": "minnan",
        "kind": "local"
      },
      {
        "label": "閩南語",
        "kind": "native"
      },
      {
        "label": "Southern Min",
        "kind": "english"
      },
      {
        "label": "闽南语",
        "kind": "alias"
      },
      {
        "label": "Min Nan",
        "kind": "alias"
      },
      {
        "label": "hokkien",
        "kind": "alias"
      },
      {
        "label": "taiwanese hokkien",
        "kind": "alias"
      },
      {
        "label": "台语",
        "kind": "alias"
      },
      {
        "label": "臺語",
        "kind": "alias"
      },
      {
        "label": "河洛话",
        "kind": "alias"
      },
      {
        "label": "河洛話",
        "kind": "alias"
      }
    ],
    "nso": [
      {
        "label": "sotho du Nord",
        "kind": "local"
      },
      {
        "label": "Sesotho sa Leboa",
        "kind": "native"
      },
      {
        "label": "Northern Sotho",
        "kind": "english"
      },
      {
        "label": "北索托语",
        "kind": "alias"
      },
      {
        "label": "sotho septentrional",
        "kind": "alias"
      },
      {
        "label": "Nord-Sotho",
        "kind": "alias"
      }
    ],
    "sag": [
      {
        "label": "sango",
        "kind": "local"
      },
      {
        "label": "Sängö",
        "kind": "native"
      },
      {
        "label": "桑戈语",
        "kind": "alias"
      }
    ],
    "stq": [
      {
        "label": "saterlandais",
        "kind": "local"
      },
      {
        "label": "Saterland Frisian",
        "kind": "english"
      },
      {
        "label": "Saterfriesisch",
        "kind": "alias"
      }
    ],
    "yue": [
      {
        "label": "cantonais",
        "kind": "local"
      },
      {
        "label": "粵語",
        "kind": "native"
      },
      {
        "label": "Cantonese",
        "kind": "english"
      },
      {
        "label": "粤语",
        "kind": "alias"
      },
      {
        "label": "cantonés",
        "kind": "alias"
      },
      {
        "label": "Kantonesisch",
        "kind": "alias"
      },
      {
        "label": "cantonese chinese",
        "kind": "alias"
      },
      {
        "label": "guangdonghua",
        "kind": "alias"
      },
      {
        "label": "广东话",
        "kind": "alias"
      },
      {
        "label": "廣東話",
        "kind": "alias"
      },
      {
        "label": "白话",
        "kind": "alias"
      },
      {
        "label": "白話",
        "kind": "alias"
      }
    ],
    "xmf": [
      {
        "label": "mingrélien",
        "kind": "local"
      },
      {
        "label": "Mingrelian",
        "kind": "english"
      },
      {
        "label": "Mingrelisch",
        "kind": "alias"
      }
    ],
    "bjn": [
      {
        "label": "banjar",
        "kind": "local"
      },
      {
        "label": "Banjaresisch",
        "kind": "alias"
      }
    ],
    "ase": [
      {
        "label": "langue des signes américaine",
        "kind": "local"
      },
      {
        "label": "American Sign Language",
        "kind": "english"
      },
      {
        "label": "Amerikanische Gebärdensprache",
        "kind": "alias"
      }
    ],
    "kau": [
      {
        "label": "kanouri",
        "kind": "local"
      },
      {
        "label": "Kanuri",
        "kind": "english"
      },
      {
        "label": "卡努里语",
        "kind": "alias"
      }
    ],
    "nrn": [
      {
        "label": "Norn",
        "kind": "english"
      }
    ],
    "frr": [
      {
        "label": "frison septentrional",
        "kind": "local"
      },
      {
        "label": "North Frisian",
        "kind": "english"
      },
      {
        "label": "北弗里西亚语",
        "kind": "alias"
      },
      {
        "label": "Northern Frisian",
        "kind": "alias"
      },
      {
        "label": "frisón septentrional",
        "kind": "alias"
      },
      {
        "label": "Nordfriesisch",
        "kind": "alias"
      }
    ],
    "lug": [
      {
        "label": "ganda",
        "kind": "local"
      },
      {
        "label": "Luganda",
        "kind": "native"
      },
      {
        "label": "卢干达语",
        "kind": "alias"
      }
    ],
    "cre": [
      {
        "label": "cree",
        "kind": "local"
      },
      {
        "label": "克里语",
        "kind": "alias"
      }
    ],
    "gan": [
      {
        "label": "gan",
        "kind": "local"
      },
      {
        "label": "Gan Chinese",
        "kind": "english"
      },
      {
        "label": "赣语",
        "kind": "alias"
      },
      {
        "label": "chino gan",
        "kind": "alias"
      },
      {
        "label": "贛語",
        "kind": "alias"
      }
    ],
    "kik": [
      {
        "label": "kikuyu",
        "kind": "local"
      },
      {
        "label": "Gikuyu",
        "kind": "native"
      },
      {
        "label": "吉库尤语",
        "kind": "alias"
      }
    ],
    "mag": [
      {
        "label": "magahi",
        "kind": "local"
      },
      {
        "label": "摩揭陀语",
        "kind": "alias"
      },
      {
        "label": "Khotta",
        "kind": "alias"
      }
    ],
    "pox": [
      {
        "label": "Polabian",
        "kind": "english"
      }
    ],
    "zha": [
      {
        "label": "zhuang",
        "kind": "local"
      },
      {
        "label": "Vahcuengh",
        "kind": "native"
      },
      {
        "label": "壮语",
        "kind": "alias"
      },
      {
        "label": "壮文",
        "kind": "alias"
      },
      {
        "label": "壯語",
        "kind": "alias"
      }
    ],
    "bsk": [
      {
        "label": "Burushaski",
        "kind": "english"
      }
    ],
    "sva": [
      {
        "label": "Svan",
        "kind": "english"
      }
    ],
    "fro": [
      {
        "label": "ancien français",
        "kind": "local"
      },
      {
        "label": "Old French",
        "kind": "english"
      },
      {
        "label": "古法语",
        "kind": "alias"
      },
      {
        "label": "francés antiguo",
        "kind": "alias"
      },
      {
        "label": "Altfranzösisch",
        "kind": "alias"
      }
    ],
    "nbl": [
      {
        "label": "ndébélé du Sud",
        "kind": "local"
      },
      {
        "label": "Southern Ndebele",
        "kind": "english"
      },
      {
        "label": "南恩德贝勒语",
        "kind": "alias"
      },
      {
        "label": "South Ndebele",
        "kind": "alias"
      },
      {
        "label": "ndebele meridional",
        "kind": "alias"
      },
      {
        "label": "Süd-Ndebele",
        "kind": "alias"
      }
    ],
    "lzz": [
      {
        "label": "laze",
        "kind": "local"
      },
      {
        "label": "Laz",
        "kind": "english"
      },
      {
        "label": "Lasisch",
        "kind": "alias"
      }
    ],
    "tvl": [
      {
        "label": "tuvalu",
        "kind": "local"
      },
      {
        "label": "Tuvaluan",
        "kind": "english"
      },
      {
        "label": "图瓦卢语",
        "kind": "alias"
      },
      {
        "label": "tuvaluano",
        "kind": "alias"
      },
      {
        "label": "Tuvaluisch",
        "kind": "alias"
      }
    ],
    "elx": [
      {
        "label": "élamite",
        "kind": "local"
      },
      {
        "label": "Elamite",
        "kind": "english"
      },
      {
        "label": "埃兰语",
        "kind": "alias"
      },
      {
        "label": "elamita",
        "kind": "alias"
      },
      {
        "label": "Elamisch",
        "kind": "alias"
      }
    ],
    "koi": [
      {
        "label": "komi-permiak",
        "kind": "local"
      },
      {
        "label": "Komi-Permyak",
        "kind": "english"
      },
      {
        "label": "科米-彼尔米亚克语",
        "kind": "alias"
      },
      {
        "label": "komi permio",
        "kind": "alias"
      },
      {
        "label": "Komi-Permjakisch",
        "kind": "alias"
      }
    ],
    "sgs": [
      {
        "label": "samogitien",
        "kind": "local"
      },
      {
        "label": "Samogitian",
        "kind": "english"
      },
      {
        "label": "Samogitisch",
        "kind": "alias"
      }
    ],
    "sma": [
      {
        "label": "same du Sud",
        "kind": "local"
      },
      {
        "label": "Southern Sami",
        "kind": "english"
      },
      {
        "label": "南萨米语",
        "kind": "alias"
      },
      {
        "label": "sami meridional",
        "kind": "alias"
      },
      {
        "label": "Südsamisch",
        "kind": "alias"
      }
    ],
    "ext": [
      {
        "label": "estrémègne",
        "kind": "local"
      },
      {
        "label": "Extremaduran",
        "kind": "english"
      },
      {
        "label": "Extremadurisch",
        "kind": "alias"
      }
    ],
    "evn": [
      {
        "label": "Evenki",
        "kind": "english"
      }
    ],
    "kab": [
      {
        "label": "kabyle",
        "kind": "local"
      },
      {
        "label": "Taqbaylit",
        "kind": "native"
      },
      {
        "label": "卡拜尔语",
        "kind": "alias"
      },
      {
        "label": "cabileño",
        "kind": "alias"
      },
      {
        "label": "Kabylisch",
        "kind": "alias"
      }
    ],
    "rap": [
      {
        "label": "rapanui",
        "kind": "local"
      },
      {
        "label": "Rapa Nui",
        "kind": "english"
      },
      {
        "label": "拉帕努伊语",
        "kind": "alias"
      }
    ],
    "rut": [
      {
        "label": "Rutulian",
        "kind": "english"
      }
    ],
    "lzh": [
      {
        "label": "chinois littéraire",
        "kind": "local"
      },
      {
        "label": "Classical Chinese",
        "kind": "english"
      },
      {
        "label": "Literary Chinese",
        "kind": "alias"
      },
      {
        "label": "Klassisches Chinesisch",
        "kind": "alias"
      }
    ],
    "raj": [
      {
        "label": "rajasthani",
        "kind": "local"
      },
      {
        "label": "राजस्थानी",
        "kind": "native"
      },
      {
        "label": "拉贾斯坦语",
        "kind": "alias"
      }
    ],
    "srn": [
      {
        "label": "sranan tongo",
        "kind": "local"
      },
      {
        "label": "苏里南汤加语",
        "kind": "alias"
      },
      {
        "label": "Srananisch",
        "kind": "alias"
      }
    ],
    "niu": [
      {
        "label": "niuéen",
        "kind": "local"
      },
      {
        "label": "Niuean",
        "kind": "english"
      },
      {
        "label": "纽埃语",
        "kind": "alias"
      },
      {
        "label": "niueano",
        "kind": "alias"
      },
      {
        "label": "Niue",
        "kind": "alias"
      }
    ],
    "smn": [
      {
        "label": "same d’Inari",
        "kind": "local"
      },
      {
        "label": "anarâškielâ",
        "kind": "native"
      },
      {
        "label": "Inari Sami",
        "kind": "english"
      },
      {
        "label": "伊纳里萨米语",
        "kind": "alias"
      },
      {
        "label": "sami inari",
        "kind": "alias"
      },
      {
        "label": "Inari-Samisch",
        "kind": "alias"
      }
    ],
    "glk": [
      {
        "label": "gilaki",
        "kind": "local"
      }
    ],
    "peo": [
      {
        "label": "persan ancien",
        "kind": "local"
      },
      {
        "label": "Old Persian",
        "kind": "english"
      },
      {
        "label": "古波斯语",
        "kind": "alias"
      },
      {
        "label": "persa antiguo",
        "kind": "alias"
      },
      {
        "label": "Altpersisch",
        "kind": "alias"
      }
    ],
    "ryu": [
      {
        "label": "Okinawan",
        "kind": "english"
      }
    ],
    "tly": [
      {
        "label": "talysh",
        "kind": "local"
      },
      {
        "label": "Talisch",
        "kind": "alias"
      }
    ],
    "chu": [
      {
        "label": "slavon d’église",
        "kind": "local"
      },
      {
        "label": "Church Slavonic",
        "kind": "english"
      },
      {
        "label": "教会斯拉夫语",
        "kind": "alias"
      },
      {
        "label": "Church Slavic",
        "kind": "alias"
      },
      {
        "label": "eslavo eclesiástico",
        "kind": "alias"
      },
      {
        "label": "Kirchenslawisch",
        "kind": "alias"
      }
    ],
    "orv": [
      {
        "label": "Old East Slavic",
        "kind": "english"
      }
    ],
    "fon": [
      {
        "label": "fon",
        "kind": "local"
      },
      {
        "label": "丰语",
        "kind": "alias"
      }
    ],
    "pam": [
      {
        "label": "pampangan",
        "kind": "local"
      },
      {
        "label": "Kapampangan",
        "kind": "english"
      },
      {
        "label": "邦板牙语",
        "kind": "alias"
      },
      {
        "label": "Pampanga",
        "kind": "alias"
      },
      {
        "label": "Pampanggan",
        "kind": "alias"
      }
    ],
    "mad": [
      {
        "label": "madurais",
        "kind": "local"
      },
      {
        "label": "Madurese",
        "kind": "english"
      },
      {
        "label": "马都拉语",
        "kind": "alias"
      },
      {
        "label": "madurés",
        "kind": "alias"
      },
      {
        "label": "Maduresisch",
        "kind": "alias"
      }
    ],
    "fit": [
      {
        "label": "finnois tornédalien",
        "kind": "local"
      },
      {
        "label": "Meänkieli",
        "kind": "english"
      },
      {
        "label": "Tornedalen Finnish",
        "kind": "alias"
      }
    ],
    "pal": [
      {
        "label": "pahlavi",
        "kind": "local"
      },
      {
        "label": "Middle Persian",
        "kind": "english"
      },
      {
        "label": "巴拉维语",
        "kind": "alias"
      },
      {
        "label": "Mittelpersisch",
        "kind": "alias"
      }
    ],
    "hne": [
      {
        "label": "Chhattisgarhi",
        "kind": "english"
      }
    ],
    "ckb": [
      {
        "label": "sorani",
        "kind": "local"
      },
      {
        "label": "کوردیی ناوەندی",
        "kind": "native"
      },
      {
        "label": "Central Kurdish",
        "kind": "english"
      },
      {
        "label": "中库尔德语",
        "kind": "alias"
      },
      {
        "label": "kurdo sorani",
        "kind": "alias"
      },
      {
        "label": "Zentralkurdisch",
        "kind": "alias"
      }
    ],
    "bpy": [
      {
        "label": "bishnupriya",
        "kind": "local"
      },
      {
        "label": "Bishnupriya Manipuri",
        "kind": "english"
      }
    ],
    "sog": [
      {
        "label": "sogdien",
        "kind": "local"
      },
      {
        "label": "Sogdian",
        "kind": "english"
      },
      {
        "label": "粟特语",
        "kind": "alias"
      },
      {
        "label": "sogdiano",
        "kind": "alias"
      },
      {
        "label": "Sogdisch",
        "kind": "alias"
      }
    ],
    "ipk": [
      {
        "label": "inupiaq",
        "kind": "local"
      },
      {
        "label": "Iñupiaq",
        "kind": "english"
      },
      {
        "label": "伊努皮克语",
        "kind": "alias"
      },
      {
        "label": "Inupiak",
        "kind": "alias"
      }
    ],
    "mwr": [
      {
        "label": "marwarî",
        "kind": "local"
      },
      {
        "label": "Marwari",
        "kind": "english"
      },
      {
        "label": "马尔瓦里语",
        "kind": "alias"
      }
    ],
    "uga": [
      {
        "label": "ougaritique",
        "kind": "local"
      },
      {
        "label": "Ugaritic",
        "kind": "english"
      },
      {
        "label": "乌加里特语",
        "kind": "alias"
      },
      {
        "label": "ugarítico",
        "kind": "alias"
      },
      {
        "label": "Ugaritisch",
        "kind": "alias"
      }
    ],
    "fkv": [
      {
        "label": "Kven",
        "kind": "english"
      }
    ],
    "tab": [
      {
        "label": "Tabasaran",
        "kind": "english"
      }
    ],
    "jam": [
      {
        "label": "créole jamaïcain",
        "kind": "local"
      },
      {
        "label": "Jamaican Patois",
        "kind": "english"
      },
      {
        "label": "Jamaican Creole English",
        "kind": "alias"
      },
      {
        "label": "Jamaikanisch-Kreolisch",
        "kind": "alias"
      }
    ],
    "bgc": [
      {
        "label": "haryanvi",
        "kind": "local"
      },
      {
        "label": "हरियाणवी",
        "kind": "native"
      },
      {
        "label": "哈里亚纳语",
        "kind": "alias"
      }
    ],
    "nio": [
      {
        "label": "Nganasan",
        "kind": "english"
      }
    ],
    "mnw": [
      {
        "label": "Mon",
        "kind": "english"
      }
    ],
    "skr": [
      {
        "label": "Saraiki",
        "kind": "english"
      },
      {
        "label": "色莱基语",
        "kind": "alias"
      }
    ],
    "tkl": [
      {
        "label": "tokelau",
        "kind": "local"
      },
      {
        "label": "Tokelauan",
        "kind": "english"
      },
      {
        "label": "托克劳语",
        "kind": "alias"
      },
      {
        "label": "tokelauano",
        "kind": "alias"
      },
      {
        "label": "Tokelauanisch",
        "kind": "alias"
      }
    ],
    "dng": [
      {
        "label": "Dungan",
        "kind": "english"
      }
    ],
    "kmr": [
      {
        "label": "kurde",
        "kind": "local"
      },
      {
        "label": "kurdî (kurmancî)",
        "kind": "native"
      },
      {
        "label": "Northern Kurdish",
        "kind": "english"
      },
      {
        "label": "库尔曼吉语",
        "kind": "alias"
      },
      {
        "label": "kurdo",
        "kind": "alias"
      },
      {
        "label": "Kurdisch",
        "kind": "alias"
      },
      {
        "label": "kurmanji",
        "kind": "alias"
      }
    ],
    "osc": [
      {
        "label": "Oscan",
        "kind": "english"
      }
    ],
    "smj": [
      {
        "label": "same de Lule",
        "kind": "local"
      },
      {
        "label": "Lule Sami",
        "kind": "english"
      },
      {
        "label": "吕勒萨米语",
        "kind": "alias"
      },
      {
        "label": "sami lule",
        "kind": "alias"
      },
      {
        "label": "Lule-Samisch",
        "kind": "alias"
      }
    ],
    "cbk": [
      {
        "label": "Chavacano",
        "kind": "english"
      }
    ],
    "sel": [
      {
        "label": "selkoupe",
        "kind": "local"
      },
      {
        "label": "Selkup",
        "kind": "english"
      },
      {
        "label": "塞尔库普语",
        "kind": "alias"
      },
      {
        "label": "Selkupisch",
        "kind": "alias"
      }
    ],
    "tmh": [
      {
        "label": "tamacheq",
        "kind": "local"
      },
      {
        "label": "Tuareg",
        "kind": "english"
      },
      {
        "label": "塔马奇克语",
        "kind": "alias"
      },
      {
        "label": "Tamashek",
        "kind": "alias"
      },
      {
        "label": "Tamaseq",
        "kind": "alias"
      }
    ],
    "ltg": [
      {
        "label": "latgalien",
        "kind": "local"
      },
      {
        "label": "Latgalian",
        "kind": "english"
      },
      {
        "label": "Lettgallisch",
        "kind": "alias"
      }
    ],
    "ket": [
      {
        "label": "Ket",
        "kind": "english"
      }
    ],
    "sjd": [
      {
        "label": "Kildin Sami",
        "kind": "english"
      }
    ],
    "lab": [
      {
        "label": "Linear A",
        "kind": "english"
      }
    ],
    "hil": [
      {
        "label": "hiligaynon",
        "kind": "local"
      },
      {
        "label": "希利盖农语",
        "kind": "alias"
      }
    ],
    "shi": [
      {
        "label": "chleuh",
        "kind": "local"
      },
      {
        "label": "ⵜⴰⵛⵍⵃⵉⵜ",
        "kind": "native"
      },
      {
        "label": "Tashelhit",
        "kind": "english"
      },
      {
        "label": "希尔哈语",
        "kind": "alias"
      },
      {
        "label": "Tachelhit",
        "kind": "alias"
      },
      {
        "label": "Taschelhit",
        "kind": "alias"
      }
    ],
    "prv": [
      {
        "label": "Provençal",
        "kind": "english"
      }
    ],
    "gon": [
      {
        "label": "gondi",
        "kind": "local"
      },
      {
        "label": "冈德语",
        "kind": "alias"
      }
    ],
    "naq": [
      {
        "label": "nama",
        "kind": "local"
      },
      {
        "label": "Khoekhoegowab",
        "kind": "native"
      },
      {
        "label": "Khoekhoe",
        "kind": "english"
      },
      {
        "label": "纳马语",
        "kind": "alias"
      }
    ],
    "pag": [
      {
        "label": "pangasinan",
        "kind": "local"
      },
      {
        "label": "邦阿西南语",
        "kind": "alias"
      },
      {
        "label": "pangasinán",
        "kind": "alias"
      }
    ],
    "cho": [
      {
        "label": "choctaw",
        "kind": "local"
      },
      {
        "label": "乔克托语",
        "kind": "alias"
      }
    ],
    "kpy": [
      {
        "label": "Koryak",
        "kind": "english"
      }
    ],
    "ttt": [
      {
        "label": "tati caucasien",
        "kind": "local"
      },
      {
        "label": "Tat",
        "kind": "english"
      },
      {
        "label": "Muslim Tat",
        "kind": "alias"
      },
      {
        "label": "Tatisch",
        "kind": "alias"
      }
    ],
    "hbo": [
      {
        "label": "Biblical Hebrew",
        "kind": "english"
      }
    ],
    "yua": [
      {
        "label": "Yucatec Maya",
        "kind": "english"
      }
    ],
    "xpr": [
      {
        "label": "Parthian",
        "kind": "english"
      }
    ],
    "anp": [
      {
        "label": "angika",
        "kind": "local"
      },
      {
        "label": "昂加语",
        "kind": "alias"
      }
    ],
    "eve": [
      {
        "label": "Even",
        "kind": "english"
      }
    ],
    "dyu": [
      {
        "label": "dioula",
        "kind": "local"
      },
      {
        "label": "迪尤拉语",
        "kind": "alias"
      },
      {
        "label": "Dyula",
        "kind": "alias"
      },
      {
        "label": "diula",
        "kind": "alias"
      }
    ],
    "dlg": [
      {
        "label": "Dolgan",
        "kind": "english"
      }
    ],
    "goh": [
      {
        "label": "ancien haut allemand",
        "kind": "local"
      },
      {
        "label": "Old High German",
        "kind": "english"
      },
      {
        "label": "古高地德语",
        "kind": "alias"
      },
      {
        "label": "alto alemán antiguo",
        "kind": "alias"
      },
      {
        "label": "Althochdeutsch",
        "kind": "alias"
      }
    ],
    "mos": [
      {
        "label": "moré",
        "kind": "local"
      },
      {
        "label": "Mooré",
        "kind": "english"
      },
      {
        "label": "莫西语",
        "kind": "alias"
      },
      {
        "label": "Mossi",
        "kind": "alias"
      }
    ],
    "niv": [
      {
        "label": "Nivkh",
        "kind": "english"
      }
    ],
    "pnt": [
      {
        "label": "pontique",
        "kind": "local"
      },
      {
        "label": "Pontic Greek",
        "kind": "english"
      },
      {
        "label": "Pontic",
        "kind": "alias"
      },
      {
        "label": "Pontisch",
        "kind": "alias"
      }
    ],
    "uby": [
      {
        "label": "Ubykh",
        "kind": "english"
      }
    ],
    "fsl": [
      {
        "label": "French Sign Language",
        "kind": "english"
      }
    ],
    "oji": [
      {
        "label": "ojibwa",
        "kind": "local"
      },
      {
        "label": "Ojibwe",
        "kind": "english"
      },
      {
        "label": "奥吉布瓦语",
        "kind": "alias"
      }
    ],
    "bem": [
      {
        "label": "bemba",
        "kind": "local"
      },
      {
        "label": "Ichibemba",
        "kind": "native"
      },
      {
        "label": "本巴语",
        "kind": "alias"
      }
    ],
    "mnk": [
      {
        "label": "mandingue",
        "kind": "local"
      },
      {
        "label": "Mandinka",
        "kind": "english"
      },
      {
        "label": "曼丁哥语",
        "kind": "alias"
      },
      {
        "label": "Mandingo",
        "kind": "alias"
      },
      {
        "label": "Malinke",
        "kind": "alias"
      }
    ],
    "kdr": [
      {
        "label": "Karaim",
        "kind": "english"
      }
    ],
    "ary": [
      {
        "label": "arabe marocain",
        "kind": "local"
      },
      {
        "label": "Moroccan Arabic",
        "kind": "english"
      },
      {
        "label": "Marokkanisches Arabisch",
        "kind": "alias"
      }
    ],
    "sms": [
      {
        "label": "same skolt",
        "kind": "local"
      },
      {
        "label": "Skolt Sami",
        "kind": "english"
      },
      {
        "label": "斯科特萨米语",
        "kind": "alias"
      },
      {
        "label": "sami skolt",
        "kind": "alias"
      },
      {
        "label": "Skolt-Samisch",
        "kind": "alias"
      }
    ],
    "chy": [
      {
        "label": "cheyenne",
        "kind": "local"
      },
      {
        "label": "夏延语",
        "kind": "alias"
      },
      {
        "label": "cheyene",
        "kind": "alias"
      }
    ],
    "cdo": [
      {
        "label": "Eastern Min",
        "kind": "english"
      }
    ],
    "agx": [
      {
        "label": "Aghul",
        "kind": "english"
      }
    ],
    "wym": [
      {
        "label": "Wymysorys",
        "kind": "english"
      }
    ],
    "qxq": [
      {
        "label": "Qashqai",
        "kind": "english"
      }
    ],
    "xil": [
      {
        "label": "Illyrian",
        "kind": "english"
      }
    ],
    "gld": [
      {
        "label": "Nanai",
        "kind": "english"
      }
    ],
    "crs": [
      {
        "label": "créole seychellois",
        "kind": "local"
      },
      {
        "label": "Seychellois Creole",
        "kind": "english"
      },
      {
        "label": "塞舌尔克里奥尔语",
        "kind": "alias"
      },
      {
        "label": "Seselwa Creole French",
        "kind": "alias"
      },
      {
        "label": "criollo seychelense",
        "kind": "alias"
      },
      {
        "label": "Seychellenkreol",
        "kind": "alias"
      }
    ],
    "tig": [
      {
        "label": "tigré",
        "kind": "local"
      },
      {
        "label": "Tigre",
        "kind": "english"
      },
      {
        "label": "提格雷语",
        "kind": "alias"
      }
    ],
    "wbl": [
      {
        "label": "Wakhi",
        "kind": "english"
      }
    ],
    "lus": [
      {
        "label": "lushaï",
        "kind": "local"
      },
      {
        "label": "Mizo",
        "kind": "english"
      },
      {
        "label": "米佐语",
        "kind": "alias"
      },
      {
        "label": "Lushai",
        "kind": "alias"
      }
    ],
    "xcb": [
      {
        "label": "Cumbric",
        "kind": "english"
      }
    ],
    "vsn": [
      {
        "label": "Vedic Sanskrit",
        "kind": "english"
      }
    ],
    "hyw": [
      {
        "label": "Western Armenian",
        "kind": "english"
      }
    ],
    "avk": [
      {
        "label": "kotava",
        "kind": "local"
      }
    ],
    "slr": [
      {
        "label": "Salar",
        "kind": "english"
      }
    ],
    "otk": [
      {
        "label": "Old Turkic",
        "kind": "english"
      }
    ],
    "nde": [
      {
        "label": "ndébélé du Nord",
        "kind": "local"
      },
      {
        "label": "isiNdebele",
        "kind": "native"
      },
      {
        "label": "Northern Ndebele",
        "kind": "english"
      },
      {
        "label": "北恩德贝勒语",
        "kind": "alias"
      },
      {
        "label": "North Ndebele",
        "kind": "alias"
      },
      {
        "label": "ndebele septentrional",
        "kind": "alias"
      },
      {
        "label": "Nord-Ndebele",
        "kind": "alias"
      }
    ],
    "kha": [
      {
        "label": "khasi",
        "kind": "local"
      },
      {
        "label": "卡西语",
        "kind": "alias"
      }
    ],
    "twi": [
      {
        "label": "twi",
        "kind": "local"
      },
      {
        "label": "Akan",
        "kind": "native"
      },
      {
        "label": "契维语",
        "kind": "alias"
      }
    ],
    "grt": [
      {
        "label": "Garo",
        "kind": "english"
      }
    ],
    "txh": [
      {
        "label": "Thracian",
        "kind": "english"
      }
    ],
    "khw": [
      {
        "label": "khowar",
        "kind": "local"
      }
    ],
    "xbc": [
      {
        "label": "Bactrian",
        "kind": "english"
      }
    ],
    "xpi": [
      {
        "label": "Pictish",
        "kind": "english"
      }
    ],
    "mxi": [
      {
        "label": "Andalusi Romance",
        "kind": "english"
      }
    ],
    "xpu": [
      {
        "label": "Punic",
        "kind": "english"
      }
    ],
    "sgh": [
      {
        "label": "Shughni",
        "kind": "english"
      }
    ],
    "bra": [
      {
        "label": "braj",
        "kind": "local"
      },
      {
        "label": "Braj Bhasha",
        "kind": "english"
      },
      {
        "label": "布拉杰语",
        "kind": "alias"
      },
      {
        "label": "Braj-Bhakha",
        "kind": "alias"
      }
    ],
    "snk": [
      {
        "label": "soninké",
        "kind": "local"
      },
      {
        "label": "Soninke",
        "kind": "english"
      },
      {
        "label": "索宁克语",
        "kind": "alias"
      }
    ],
    "xpg": [
      {
        "label": "Phrygian",
        "kind": "english"
      }
    ],
    "sjn": [
      {
        "label": "Sindarin",
        "kind": "english"
      }
    ],
    "ruo": [
      {
        "label": "Istro-Romanian",
        "kind": "english"
      }
    ],
    "nzs": [
      {
        "label": "New Zealand Sign Language",
        "kind": "english"
      }
    ],
    "cjs": [
      {
        "label": "Shor",
        "kind": "english"
      }
    ],
    "lua": [
      {
        "label": "luba-kasaï (ciluba)",
        "kind": "local"
      },
      {
        "label": "Luba-Kasai",
        "kind": "english"
      },
      {
        "label": "卢巴-卢拉语",
        "kind": "alias"
      },
      {
        "label": "Luba-Lulua",
        "kind": "alias"
      }
    ],
    "vls": [
      {
        "label": "flamand occidental",
        "kind": "local"
      },
      {
        "label": "West Flemish",
        "kind": "english"
      },
      {
        "label": "Westflämisch",
        "kind": "alias"
      }
    ],
    "zea": [
      {
        "label": "zélandais",
        "kind": "local"
      },
      {
        "label": "Zeelandic",
        "kind": "english"
      },
      {
        "label": "Seeländisch",
        "kind": "alias"
      }
    ],
    "pfl": [
      {
        "label": "allemand palatin",
        "kind": "local"
      },
      {
        "label": "Palatinate German",
        "kind": "english"
      },
      {
        "label": "Palatine German",
        "kind": "alias"
      },
      {
        "label": "Pfälzisch",
        "kind": "alias"
      }
    ],
    "aii": [
      {
        "label": "Assyrian Neo-Aramaic",
        "kind": "english"
      }
    ],
    "bfi": [
      {
        "label": "British Sign Language",
        "kind": "english"
      }
    ],
    "osx": [
      {
        "label": "Old Saxon",
        "kind": "english"
      }
    ],
    "xhu": [
      {
        "label": "Hurrian",
        "kind": "english"
      }
    ],
    "sjt": [
      {
        "label": "Ter Sami",
        "kind": "english"
      }
    ],
    "xvn": [
      {
        "label": "Vandalic",
        "kind": "english"
      }
    ],
    "yai": [
      {
        "label": "Yaghnobi",
        "kind": "english"
      }
    ],
    "sje": [
      {
        "label": "Pite Sami",
        "kind": "english"
      }
    ],
    "shn": [
      {
        "label": "shan",
        "kind": "local"
      },
      {
        "label": "掸语",
        "kind": "alias"
      },
      {
        "label": "Schan",
        "kind": "alias"
      }
    ],
    "tli": [
      {
        "label": "tlingit",
        "kind": "local"
      },
      {
        "label": "特林吉特语",
        "kind": "alias"
      }
    ],
    "sga": [
      {
        "label": "ancien irlandais",
        "kind": "local"
      },
      {
        "label": "Old Irish",
        "kind": "english"
      },
      {
        "label": "古爱尔兰语",
        "kind": "alias"
      },
      {
        "label": "irlandés antiguo",
        "kind": "alias"
      },
      {
        "label": "Altirisch",
        "kind": "alias"
      }
    ],
    "lbj": [
      {
        "label": "Ladakhi",
        "kind": "english"
      }
    ],
    "bhb": [
      {
        "label": "Bhili",
        "kind": "english"
      }
    ],
    "rar": [
      {
        "label": "rarotongien",
        "kind": "local"
      },
      {
        "label": "Cook Islands Maori",
        "kind": "english"
      },
      {
        "label": "拉罗汤加语",
        "kind": "alias"
      },
      {
        "label": "Rarotongan",
        "kind": "alias"
      },
      {
        "label": "rarotongano",
        "kind": "alias"
      },
      {
        "label": "Rarotonganisch",
        "kind": "alias"
      }
    ],
    "tkr": [
      {
        "label": "tsakhour",
        "kind": "local"
      },
      {
        "label": "Tsakhur",
        "kind": "english"
      },
      {
        "label": "Tsachurisch",
        "kind": "alias"
      }
    ],
    "srh": [
      {
        "label": "Sarikoli",
        "kind": "english"
      }
    ],
    "uum": [
      {
        "label": "Urum",
        "kind": "english"
      }
    ],
    "sia": [
      {
        "label": "Akkala Sami",
        "kind": "english"
      }
    ],
    "ist": [
      {
        "label": "Istriot",
        "kind": "english"
      }
    ],
    "xld": [
      {
        "label": "Lydian",
        "kind": "english"
      }
    ],
    "lkt": [
      {
        "label": "lakota",
        "kind": "local"
      },
      {
        "label": "Lakȟólʼiyapi",
        "kind": "native"
      },
      {
        "label": "拉科塔语",
        "kind": "alias"
      }
    ],
    "kim": [
      {
        "label": "Tofa",
        "kind": "english"
      }
    ],
    "jrb": [
      {
        "label": "judéo-arabe",
        "kind": "local"
      },
      {
        "label": "Judeo-Arabic",
        "kind": "english"
      },
      {
        "label": "犹太阿拉伯语",
        "kind": "alias"
      },
      {
        "label": "judeo-árabe",
        "kind": "alias"
      },
      {
        "label": "Jüdisch-Arabisch",
        "kind": "alias"
      }
    ],
    "tzm": [
      {
        "label": "amazighe de l’Atlas central",
        "kind": "local"
      },
      {
        "label": "Tamaziɣt n laṭlaṣ",
        "kind": "native"
      },
      {
        "label": "Central Atlas Tamazight",
        "kind": "english"
      },
      {
        "label": "塔马齐格特语",
        "kind": "alias"
      },
      {
        "label": "tamazight del Atlas Central",
        "kind": "alias"
      },
      {
        "label": "Zentralatlas-Tamazight",
        "kind": "alias"
      }
    ],
    "arq": [
      {
        "label": "arabe algérien",
        "kind": "local"
      },
      {
        "label": "Algerian Arabic",
        "kind": "english"
      },
      {
        "label": "Algerisches Arabisch",
        "kind": "alias"
      }
    ],
    "myp": [
      {
        "label": "Pirahã",
        "kind": "english"
      }
    ],
    "mey": [
      {
        "label": "Hassaniya Arabic",
        "kind": "english"
      }
    ],
    "tsg": [
      {
        "label": "Tausug",
        "kind": "english"
      }
    ],
    "rif": [
      {
        "label": "rifain",
        "kind": "local"
      },
      {
        "label": "Tarifit",
        "kind": "english"
      },
      {
        "label": "里夫语",
        "kind": "alias"
      },
      {
        "label": "Riffian",
        "kind": "alias"
      }
    ],
    "mrj": [
      {
        "label": "mari occidental",
        "kind": "local"
      },
      {
        "label": "Hill Mari",
        "kind": "english"
      },
      {
        "label": "Western Mari",
        "kind": "alias"
      },
      {
        "label": "Bergmari",
        "kind": "alias"
      }
    ],
    "bft": [
      {
        "label": "Balti",
        "kind": "english"
      }
    ],
    "clw": [
      {
        "label": "Chulym",
        "kind": "english"
      }
    ],
    "jct": [
      {
        "label": "Krymchak",
        "kind": "english"
      }
    ],
    "udi": [
      {
        "label": "Udi",
        "kind": "english"
      }
    ],
    "sju": [
      {
        "label": "Ume Sami",
        "kind": "english"
      }
    ],
    "ruq": [
      {
        "label": "Megleno-Romanian",
        "kind": "english"
      }
    ],
    "xga": [
      {
        "label": "Galatian",
        "kind": "english"
      }
    ],
    "aib": [
      {
        "label": "Äynu",
        "kind": "english"
      }
    ],
    "ncs": [
      {
        "label": "Nicaraguan Sign Language",
        "kind": "english"
      }
    ],
    "afb": [
      {
        "label": "Gulf Arabic",
        "kind": "english"
      }
    ],
    "swg": [
      {
        "label": "Swabian",
        "kind": "english"
      }
    ],
    "eya": [
      {
        "label": "Eyak",
        "kind": "english"
      }
    ],
    "dar": [
      {
        "label": "dargwa",
        "kind": "local"
      },
      {
        "label": "达尔格瓦语",
        "kind": "alias"
      },
      {
        "label": "dargva",
        "kind": "alias"
      },
      {
        "label": "Darginisch",
        "kind": "alias"
      }
    ],
    "trp": [
      {
        "label": "Kokborok",
        "kind": "english"
      }
    ],
    "xlc": [
      {
        "label": "Lycian",
        "kind": "english"
      }
    ],
    "hoc": [
      {
        "label": "Ho",
        "kind": "english"
      }
    ],
    "pih": [
      {
        "label": "Pitkern",
        "kind": "english"
      }
    ],
    "xum": [
      {
        "label": "Umbrian",
        "kind": "english"
      }
    ],
    "din": [
      {
        "label": "dinka",
        "kind": "local"
      },
      {
        "label": "丁卡语",
        "kind": "alias"
      }
    ],
    "lif": [
      {
        "label": "Limbu",
        "kind": "english"
      }
    ],
    "lki": [
      {
        "label": "Laki",
        "kind": "english"
      }
    ],
    "ise": [
      {
        "label": "Italian Sign Language",
        "kind": "english"
      }
    ],
    "scl": [
      {
        "label": "Shina",
        "kind": "english"
      }
    ],
    "xeb": [
      {
        "label": "Eblaite",
        "kind": "english"
      }
    ],
    "xur": [
      {
        "label": "Urartian",
        "kind": "english"
      }
    ],
    "zkz": [
      {
        "label": "Khazar language",
        "kind": "english"
      }
    ],
    "gmy": [
      {
        "label": "Mycenaean Greek",
        "kind": "english"
      }
    ],
    "gmh": [
      {
        "label": "moyen haut-allemand",
        "kind": "local"
      },
      {
        "label": "Middle High German",
        "kind": "english"
      },
      {
        "label": "中古高地德语",
        "kind": "alias"
      },
      {
        "label": "alto alemán medio",
        "kind": "alias"
      },
      {
        "label": "Mittelhochdeutsch",
        "kind": "alias"
      }
    ],
    "aln": [
      {
        "label": "guègue",
        "kind": "local"
      },
      {
        "label": "Gheg",
        "kind": "english"
      },
      {
        "label": "Gheg Albanian",
        "kind": "alias"
      },
      {
        "label": "Gegisch",
        "kind": "alias"
      }
    ],
    "alt": [
      {
        "label": "altaï du Sud",
        "kind": "local"
      },
      {
        "label": "Southern Altai",
        "kind": "english"
      },
      {
        "label": "南阿尔泰语",
        "kind": "alias"
      },
      {
        "label": "altái meridional",
        "kind": "alias"
      },
      {
        "label": "Süd-Altaisch",
        "kind": "alias"
      }
    ],
    "rhg": [
      {
        "label": "rohingya",
        "kind": "local"
      },
      {
        "label": "罗兴亚语",
        "kind": "alias"
      },
      {
        "label": "rohinyá",
        "kind": "alias"
      },
      {
        "label": "Rohingyalisch",
        "kind": "alias"
      }
    ],
    "lrl": [
      {
        "label": "Achomi",
        "kind": "english"
      }
    ],
    "tum": [
      {
        "label": "tumbuka",
        "kind": "local"
      },
      {
        "label": "通布卡语",
        "kind": "alias"
      }
    ],
    "bin": [
      {
        "label": "bini",
        "kind": "local"
      },
      {
        "label": "Edo",
        "kind": "english"
      },
      {
        "label": "比尼语",
        "kind": "alias"
      }
    ],
    "bik": [
      {
        "label": "bikol",
        "kind": "local"
      },
      {
        "label": "比科尔语",
        "kind": "alias"
      },
      {
        "label": "bicol",
        "kind": "alias"
      }
    ],
    "iii": [
      {
        "label": "yi du Sichuan",
        "kind": "local"
      },
      {
        "label": "ꆈꌠꉙ",
        "kind": "native"
      },
      {
        "label": "Sichuan Yi",
        "kind": "english"
      },
      {
        "label": "凉山彝语",
        "kind": "alias"
      },
      {
        "label": "yi de Sichuán",
        "kind": "alias"
      },
      {
        "label": "Yi",
        "kind": "alias"
      },
      {
        "label": "nuosu",
        "kind": "alias"
      },
      {
        "label": "彝语",
        "kind": "alias"
      },
      {
        "label": "彝文",
        "kind": "alias"
      },
      {
        "label": "彝語",
        "kind": "alias"
      }
    ],
    "olo": [
      {
        "label": "Livvi-Karelian",
        "kind": "english"
      }
    ],
    "xsr": [
      {
        "label": "Sherpa",
        "kind": "english"
      }
    ],
    "umb": [
      {
        "label": "umbundu",
        "kind": "local"
      },
      {
        "label": "翁本杜语",
        "kind": "alias"
      }
    ],
    "acm": [
      {
        "label": "Iraqi Arabic",
        "kind": "english"
      }
    ],
    "sas": [
      {
        "label": "sasak",
        "kind": "local"
      },
      {
        "label": "萨萨克语",
        "kind": "alias"
      }
    ],
    "kua": [
      {
        "label": "kuanyama",
        "kind": "local"
      },
      {
        "label": "Kwanyama",
        "kind": "english"
      },
      {
        "label": "宽亚玛语",
        "kind": "alias"
      }
    ]
  },
  "es-ES": {
    "eng": [
      {
        "label": "inglés",
        "kind": "local"
      },
      {
        "label": "English",
        "kind": "native"
      },
      {
        "label": "英语",
        "kind": "alias"
      },
      {
        "label": "anglais",
        "kind": "alias"
      },
      {
        "label": "Englisch",
        "kind": "alias"
      },
      {
        "label": "英文",
        "kind": "alias"
      },
      {
        "label": "英語",
        "kind": "alias"
      },
      {
        "label": "american english",
        "kind": "alias"
      },
      {
        "label": "british english",
        "kind": "alias"
      }
    ],
    "deu": [
      {
        "label": "alemán",
        "kind": "local"
      },
      {
        "label": "Deutsch",
        "kind": "native"
      },
      {
        "label": "German",
        "kind": "english"
      },
      {
        "label": "德语",
        "kind": "alias"
      },
      {
        "label": "allemand",
        "kind": "alias"
      },
      {
        "label": "德文",
        "kind": "alias"
      },
      {
        "label": "德語",
        "kind": "alias"
      }
    ],
    "spa": [
      {
        "label": "español",
        "kind": "local"
      },
      {
        "label": "Spanish",
        "kind": "english"
      },
      {
        "label": "西班牙语",
        "kind": "alias"
      },
      {
        "label": "espagnol",
        "kind": "alias"
      },
      {
        "label": "Spanisch",
        "kind": "alias"
      },
      {
        "label": "西文",
        "kind": "alias"
      },
      {
        "label": "西語",
        "kind": "alias"
      },
      {
        "label": "castilian",
        "kind": "alias"
      },
      {
        "label": "castilian spanish",
        "kind": "alias"
      },
      {
        "label": "latin american spanish",
        "kind": "alias"
      },
      {
        "label": "mexican spanish",
        "kind": "alias"
      }
    ],
    "fra": [
      {
        "label": "francés",
        "kind": "local"
      },
      {
        "label": "français",
        "kind": "native"
      },
      {
        "label": "French",
        "kind": "english"
      },
      {
        "label": "法语",
        "kind": "alias"
      },
      {
        "label": "Französisch",
        "kind": "alias"
      },
      {
        "label": "法文",
        "kind": "alias"
      },
      {
        "label": "法語",
        "kind": "alias"
      }
    ],
    "rus": [
      {
        "label": "ruso",
        "kind": "local"
      },
      {
        "label": "русский",
        "kind": "native"
      },
      {
        "label": "Russian",
        "kind": "english"
      },
      {
        "label": "俄语",
        "kind": "alias"
      },
      {
        "label": "russe",
        "kind": "alias"
      },
      {
        "label": "Russisch",
        "kind": "alias"
      },
      {
        "label": "俄文",
        "kind": "alias"
      },
      {
        "label": "俄語",
        "kind": "alias"
      }
    ],
    "ara": [
      {
        "label": "árabe",
        "kind": "local"
      },
      {
        "label": "العربية",
        "kind": "native"
      },
      {
        "label": "Arabic",
        "kind": "english"
      },
      {
        "label": "阿拉伯语",
        "kind": "alias"
      },
      {
        "label": "arabe",
        "kind": "alias"
      },
      {
        "label": "Arabisch",
        "kind": "alias"
      },
      {
        "label": "阿文",
        "kind": "alias"
      },
      {
        "label": "阿语",
        "kind": "alias"
      },
      {
        "label": "阿語",
        "kind": "alias"
      },
      {
        "label": "modern standard arabic",
        "kind": "alias"
      }
    ],
    "lat": [
      {
        "label": "latín",
        "kind": "local"
      },
      {
        "label": "Latin",
        "kind": "english"
      },
      {
        "label": "拉丁语",
        "kind": "alias"
      },
      {
        "label": "Latein",
        "kind": "alias"
      }
    ],
    "ita": [
      {
        "label": "italiano",
        "kind": "local"
      },
      {
        "label": "Italian",
        "kind": "english"
      },
      {
        "label": "意大利语",
        "kind": "alias"
      },
      {
        "label": "italien",
        "kind": "alias"
      },
      {
        "label": "Italienisch",
        "kind": "alias"
      },
      {
        "label": "意文",
        "kind": "alias"
      },
      {
        "label": "意语",
        "kind": "alias"
      },
      {
        "label": "意語",
        "kind": "alias"
      }
    ],
    "jpn": [
      {
        "label": "japonés",
        "kind": "local"
      },
      {
        "label": "日本語",
        "kind": "native"
      },
      {
        "label": "Japanese",
        "kind": "english"
      },
      {
        "label": "日语",
        "kind": "alias"
      },
      {
        "label": "japonais",
        "kind": "alias"
      },
      {
        "label": "Japanisch",
        "kind": "alias"
      },
      {
        "label": "日文",
        "kind": "alias"
      },
      {
        "label": "日語",
        "kind": "alias"
      }
    ],
    "por": [
      {
        "label": "portugués",
        "kind": "local"
      },
      {
        "label": "português",
        "kind": "native"
      },
      {
        "label": "Portuguese",
        "kind": "english"
      },
      {
        "label": "葡萄牙语",
        "kind": "alias"
      },
      {
        "label": "portugais",
        "kind": "alias"
      },
      {
        "label": "Portugiesisch",
        "kind": "alias"
      },
      {
        "label": "葡文",
        "kind": "alias"
      },
      {
        "label": "葡语",
        "kind": "alias"
      },
      {
        "label": "葡語",
        "kind": "alias"
      },
      {
        "label": "brazilian portuguese",
        "kind": "alias"
      },
      {
        "label": "european portuguese",
        "kind": "alias"
      }
    ],
    "epo": [
      {
        "label": "esperanto",
        "kind": "local"
      },
      {
        "label": "世界语",
        "kind": "alias"
      },
      {
        "label": "espéranto",
        "kind": "alias"
      }
    ],
    "fas": [
      {
        "label": "persa",
        "kind": "local"
      },
      {
        "label": "فارسی",
        "kind": "native"
      },
      {
        "label": "Persian",
        "kind": "english"
      },
      {
        "label": "波斯语",
        "kind": "alias"
      },
      {
        "label": "persan",
        "kind": "alias"
      },
      {
        "label": "Persisch",
        "kind": "alias"
      },
      {
        "label": "波斯文",
        "kind": "alias"
      },
      {
        "label": "波斯語",
        "kind": "alias"
      },
      {
        "label": "法尔西",
        "kind": "alias"
      },
      {
        "label": "法爾西",
        "kind": "alias"
      },
      {
        "label": "farsi",
        "kind": "alias"
      },
      {
        "label": "persian farsi",
        "kind": "alias"
      }
    ],
    "zho": [
      {
        "label": "chino",
        "kind": "local"
      },
      {
        "label": "中文",
        "kind": "native"
      },
      {
        "label": "Chinese",
        "kind": "english"
      },
      {
        "label": "chinois",
        "kind": "alias"
      },
      {
        "label": "Chinesisch",
        "kind": "alias"
      },
      {
        "label": "汉文",
        "kind": "alias"
      },
      {
        "label": "漢文",
        "kind": "alias"
      },
      {
        "label": "华文",
        "kind": "alias"
      },
      {
        "label": "華文",
        "kind": "alias"
      }
    ],
    "heb": [
      {
        "label": "hebreo",
        "kind": "local"
      },
      {
        "label": "עברית",
        "kind": "native"
      },
      {
        "label": "Hebrew",
        "kind": "english"
      },
      {
        "label": "希伯来语",
        "kind": "alias"
      },
      {
        "label": "hébreu",
        "kind": "alias"
      },
      {
        "label": "Hebräisch",
        "kind": "alias"
      },
      {
        "label": "希伯来文",
        "kind": "alias"
      },
      {
        "label": "希伯來文",
        "kind": "alias"
      }
    ],
    "nld": [
      {
        "label": "neerlandés",
        "kind": "local"
      },
      {
        "label": "Nederlands",
        "kind": "native"
      },
      {
        "label": "Dutch",
        "kind": "english"
      },
      {
        "label": "荷兰语",
        "kind": "alias"
      },
      {
        "label": "néerlandais",
        "kind": "alias"
      },
      {
        "label": "Niederländisch",
        "kind": "alias"
      },
      {
        "label": "荷文",
        "kind": "alias"
      },
      {
        "label": "荷语",
        "kind": "alias"
      },
      {
        "label": "荷語",
        "kind": "alias"
      },
      {
        "label": "flemish",
        "kind": "alias"
      }
    ],
    "pol": [
      {
        "label": "polaco",
        "kind": "local"
      },
      {
        "label": "polski",
        "kind": "native"
      },
      {
        "label": "Polish",
        "kind": "english"
      },
      {
        "label": "波兰语",
        "kind": "alias"
      },
      {
        "label": "polonais",
        "kind": "alias"
      },
      {
        "label": "Polnisch",
        "kind": "alias"
      },
      {
        "label": "波文",
        "kind": "alias"
      },
      {
        "label": "波语",
        "kind": "alias"
      },
      {
        "label": "波語",
        "kind": "alias"
      }
    ],
    "swe": [
      {
        "label": "sueco",
        "kind": "local"
      },
      {
        "label": "svenska",
        "kind": "native"
      },
      {
        "label": "Swedish",
        "kind": "english"
      },
      {
        "label": "瑞典语",
        "kind": "alias"
      },
      {
        "label": "suédois",
        "kind": "alias"
      },
      {
        "label": "Schwedisch",
        "kind": "alias"
      }
    ],
    "tur": [
      {
        "label": "turco",
        "kind": "local"
      },
      {
        "label": "Türkçe",
        "kind": "native"
      },
      {
        "label": "Turkish",
        "kind": "english"
      },
      {
        "label": "土耳其语",
        "kind": "alias"
      },
      {
        "label": "turc",
        "kind": "alias"
      },
      {
        "label": "Türkisch",
        "kind": "alias"
      },
      {
        "label": "土文",
        "kind": "alias"
      },
      {
        "label": "土语",
        "kind": "alias"
      },
      {
        "label": "土語",
        "kind": "alias"
      }
    ],
    "ukr": [
      {
        "label": "ucraniano",
        "kind": "local"
      },
      {
        "label": "українська",
        "kind": "native"
      },
      {
        "label": "Ukrainian",
        "kind": "english"
      },
      {
        "label": "乌克兰语",
        "kind": "alias"
      },
      {
        "label": "ukrainien",
        "kind": "alias"
      },
      {
        "label": "Ukrainisch",
        "kind": "alias"
      }
    ],
    "fin": [
      {
        "label": "finés",
        "kind": "local"
      },
      {
        "label": "suomi",
        "kind": "native"
      },
      {
        "label": "Finnish",
        "kind": "english"
      },
      {
        "label": "芬兰语",
        "kind": "alias"
      },
      {
        "label": "finnois",
        "kind": "alias"
      },
      {
        "label": "Finnisch",
        "kind": "alias"
      }
    ],
    "kor": [
      {
        "label": "coreano",
        "kind": "local"
      },
      {
        "label": "한국어",
        "kind": "native"
      },
      {
        "label": "Korean",
        "kind": "english"
      },
      {
        "label": "韩语",
        "kind": "alias"
      },
      {
        "label": "coréen",
        "kind": "alias"
      },
      {
        "label": "Koreanisch",
        "kind": "alias"
      },
      {
        "label": "韩文",
        "kind": "alias"
      },
      {
        "label": "韓文",
        "kind": "alias"
      },
      {
        "label": "韩国语",
        "kind": "alias"
      },
      {
        "label": "朝鲜语",
        "kind": "alias"
      },
      {
        "label": "朝鮮文",
        "kind": "alias"
      },
      {
        "label": "韓語",
        "kind": "alias"
      }
    ],
    "san": [
      {
        "label": "sánscrito",
        "kind": "local"
      },
      {
        "label": "संस्कृत भाषा",
        "kind": "native"
      },
      {
        "label": "Sanskrit",
        "kind": "english"
      },
      {
        "label": "梵语",
        "kind": "alias"
      }
    ],
    "ces": [
      {
        "label": "checo",
        "kind": "local"
      },
      {
        "label": "čeština",
        "kind": "native"
      },
      {
        "label": "Czech",
        "kind": "english"
      },
      {
        "label": "捷克语",
        "kind": "alias"
      },
      {
        "label": "tchèque",
        "kind": "alias"
      },
      {
        "label": "Tschechisch",
        "kind": "alias"
      }
    ],
    "cat": [
      {
        "label": "catalán",
        "kind": "local"
      },
      {
        "label": "català",
        "kind": "native"
      },
      {
        "label": "Catalan",
        "kind": "english"
      },
      {
        "label": "加泰罗尼亚语",
        "kind": "alias"
      },
      {
        "label": "Katalanisch",
        "kind": "alias"
      }
    ],
    "dan": [
      {
        "label": "danés",
        "kind": "local"
      },
      {
        "label": "dansk",
        "kind": "native"
      },
      {
        "label": "Danish",
        "kind": "english"
      },
      {
        "label": "丹麦语",
        "kind": "alias"
      },
      {
        "label": "danois",
        "kind": "alias"
      },
      {
        "label": "Dänisch",
        "kind": "alias"
      }
    ],
    "ron": [
      {
        "label": "rumano",
        "kind": "local"
      },
      {
        "label": "română",
        "kind": "native"
      },
      {
        "label": "Romanian",
        "kind": "english"
      },
      {
        "label": "罗马尼亚语",
        "kind": "alias"
      },
      {
        "label": "roumain",
        "kind": "alias"
      },
      {
        "label": "Rumänisch",
        "kind": "alias"
      }
    ],
    "swa": [
      {
        "label": "suajili",
        "kind": "local"
      },
      {
        "label": "Kiswahili",
        "kind": "native"
      },
      {
        "label": "Swahili",
        "kind": "english"
      },
      {
        "label": "斯瓦希里语",
        "kind": "alias"
      },
      {
        "label": "Suaheli",
        "kind": "alias"
      }
    ],
    "hun": [
      {
        "label": "húngaro",
        "kind": "local"
      },
      {
        "label": "magyar",
        "kind": "native"
      },
      {
        "label": "Hungarian",
        "kind": "english"
      },
      {
        "label": "匈牙利语",
        "kind": "alias"
      },
      {
        "label": "hongrois",
        "kind": "alias"
      },
      {
        "label": "Ungarisch",
        "kind": "alias"
      }
    ],
    "syl": [
      {
        "label": "Sylheti",
        "kind": "english"
      }
    ],
    "hrv": [
      {
        "label": "croata",
        "kind": "local"
      },
      {
        "label": "hrvatski",
        "kind": "native"
      },
      {
        "label": "Croatian",
        "kind": "english"
      },
      {
        "label": "克罗地亚语",
        "kind": "alias"
      },
      {
        "label": "croate",
        "kind": "alias"
      },
      {
        "label": "Kroatisch",
        "kind": "alias"
      }
    ],
    "nor": [
      {
        "label": "noruego",
        "kind": "local"
      },
      {
        "label": "norsk",
        "kind": "native"
      },
      {
        "label": "Norwegian",
        "kind": "english"
      },
      {
        "label": "挪威语",
        "kind": "alias"
      },
      {
        "label": "norvégien",
        "kind": "alias"
      },
      {
        "label": "Norwegisch",
        "kind": "alias"
      }
    ],
    "ben": [
      {
        "label": "bengalí",
        "kind": "local"
      },
      {
        "label": "বাংলা",
        "kind": "native"
      },
      {
        "label": "Bangla",
        "kind": "english"
      },
      {
        "label": "孟加拉语",
        "kind": "alias"
      },
      {
        "label": "bengali",
        "kind": "alias"
      },
      {
        "label": "Bengalisch",
        "kind": "alias"
      },
      {
        "label": "孟加拉文",
        "kind": "alias"
      },
      {
        "label": "孟加拉語",
        "kind": "alias"
      }
    ],
    "aze": [
      {
        "label": "azerbaiyano",
        "kind": "local"
      },
      {
        "label": "azərbaycan",
        "kind": "native"
      },
      {
        "label": "Azerbaijani",
        "kind": "english"
      },
      {
        "label": "阿塞拜疆语",
        "kind": "alias"
      },
      {
        "label": "azerbaïdjanais",
        "kind": "alias"
      },
      {
        "label": "Aserbaidschanisch",
        "kind": "alias"
      }
    ],
    "afr": [
      {
        "label": "afrikáans",
        "kind": "local"
      },
      {
        "label": "Afrikaans",
        "kind": "native"
      },
      {
        "label": "南非荷兰语",
        "kind": "alias"
      }
    ],
    "est": [
      {
        "label": "estonio",
        "kind": "local"
      },
      {
        "label": "eesti",
        "kind": "native"
      },
      {
        "label": "Estonian",
        "kind": "english"
      },
      {
        "label": "爱沙尼亚语",
        "kind": "alias"
      },
      {
        "label": "estonien",
        "kind": "alias"
      },
      {
        "label": "Estnisch",
        "kind": "alias"
      }
    ],
    "bul": [
      {
        "label": "búlgaro",
        "kind": "local"
      },
      {
        "label": "български",
        "kind": "native"
      },
      {
        "label": "Bulgarian",
        "kind": "english"
      },
      {
        "label": "保加利亚语",
        "kind": "alias"
      },
      {
        "label": "bulgare",
        "kind": "alias"
      },
      {
        "label": "Bulgarisch",
        "kind": "alias"
      }
    ],
    "gle": [
      {
        "label": "irlandés",
        "kind": "local"
      },
      {
        "label": "Gaeilge",
        "kind": "native"
      },
      {
        "label": "Irish",
        "kind": "english"
      },
      {
        "label": "爱尔兰语",
        "kind": "alias"
      },
      {
        "label": "irlandais",
        "kind": "alias"
      },
      {
        "label": "Irisch",
        "kind": "alias"
      }
    ],
    "bel": [
      {
        "label": "bielorruso",
        "kind": "local"
      },
      {
        "label": "беларуская",
        "kind": "native"
      },
      {
        "label": "Belarusian",
        "kind": "english"
      },
      {
        "label": "白俄罗斯语",
        "kind": "alias"
      },
      {
        "label": "biélorusse",
        "kind": "alias"
      },
      {
        "label": "Belarussisch",
        "kind": "alias"
      }
    ],
    "ind": [
      {
        "label": "indonesio",
        "kind": "local"
      },
      {
        "label": "Bahasa Indonesia",
        "kind": "native"
      },
      {
        "label": "Indonesian",
        "kind": "english"
      },
      {
        "label": "印度尼西亚语",
        "kind": "alias"
      },
      {
        "label": "indonésien",
        "kind": "alias"
      },
      {
        "label": "Indonesisch",
        "kind": "alias"
      },
      {
        "label": "印尼文",
        "kind": "alias"
      },
      {
        "label": "印尼语",
        "kind": "alias"
      },
      {
        "label": "印尼語",
        "kind": "alias"
      }
    ],
    "isl": [
      {
        "label": "islandés",
        "kind": "local"
      },
      {
        "label": "íslenska",
        "kind": "native"
      },
      {
        "label": "Icelandic",
        "kind": "english"
      },
      {
        "label": "冰岛语",
        "kind": "alias"
      },
      {
        "label": "islandais",
        "kind": "alias"
      },
      {
        "label": "Isländisch",
        "kind": "alias"
      }
    ],
    "lit": [
      {
        "label": "lituano",
        "kind": "local"
      },
      {
        "label": "lietuvių",
        "kind": "native"
      },
      {
        "label": "Lithuanian",
        "kind": "english"
      },
      {
        "label": "立陶宛语",
        "kind": "alias"
      },
      {
        "label": "lituanien",
        "kind": "alias"
      },
      {
        "label": "Litauisch",
        "kind": "alias"
      }
    ],
    "ile": [
      {
        "label": "interlingue",
        "kind": "local"
      },
      {
        "label": "国际文字（E）",
        "kind": "alias"
      }
    ],
    "hye": [
      {
        "label": "armenio",
        "kind": "local"
      },
      {
        "label": "հայերեն",
        "kind": "native"
      },
      {
        "label": "Armenian",
        "kind": "english"
      },
      {
        "label": "亚美尼亚语",
        "kind": "alias"
      },
      {
        "label": "arménien",
        "kind": "alias"
      },
      {
        "label": "Armenisch",
        "kind": "alias"
      }
    ],
    "slk": [
      {
        "label": "eslovaco",
        "kind": "local"
      },
      {
        "label": "slovenčina",
        "kind": "native"
      },
      {
        "label": "Slovak",
        "kind": "english"
      },
      {
        "label": "斯洛伐克语",
        "kind": "alias"
      },
      {
        "label": "slovaque",
        "kind": "alias"
      },
      {
        "label": "Slowakisch",
        "kind": "alias"
      }
    ],
    "tam": [
      {
        "label": "tamil",
        "kind": "local"
      },
      {
        "label": "தமிழ்",
        "kind": "native"
      },
      {
        "label": "泰米尔语",
        "kind": "alias"
      },
      {
        "label": "tamoul",
        "kind": "alias"
      }
    ],
    "sqi": [
      {
        "label": "albanés",
        "kind": "local"
      },
      {
        "label": "shqip",
        "kind": "native"
      },
      {
        "label": "Albanian",
        "kind": "english"
      },
      {
        "label": "阿尔巴尼亚语",
        "kind": "alias"
      },
      {
        "label": "albanais",
        "kind": "alias"
      },
      {
        "label": "Albanisch",
        "kind": "alias"
      }
    ],
    "eus": [
      {
        "label": "euskera",
        "kind": "local"
      },
      {
        "label": "euskara",
        "kind": "native"
      },
      {
        "label": "Basque",
        "kind": "english"
      },
      {
        "label": "巴斯克语",
        "kind": "alias"
      },
      {
        "label": "Baskisch",
        "kind": "alias"
      }
    ],
    "kat": [
      {
        "label": "georgiano",
        "kind": "local"
      },
      {
        "label": "ქართული",
        "kind": "native"
      },
      {
        "label": "Georgian",
        "kind": "english"
      },
      {
        "label": "格鲁吉亚语",
        "kind": "alias"
      },
      {
        "label": "géorgien",
        "kind": "alias"
      },
      {
        "label": "Georgisch",
        "kind": "alias"
      }
    ],
    "srp": [
      {
        "label": "serbio",
        "kind": "local"
      },
      {
        "label": "српски",
        "kind": "native"
      },
      {
        "label": "Serbian",
        "kind": "english"
      },
      {
        "label": "塞尔维亚语",
        "kind": "alias"
      },
      {
        "label": "serbe",
        "kind": "alias"
      },
      {
        "label": "Serbisch",
        "kind": "alias"
      }
    ],
    "lav": [
      {
        "label": "letón",
        "kind": "local"
      },
      {
        "label": "latviešu",
        "kind": "native"
      },
      {
        "label": "Latvian",
        "kind": "english"
      },
      {
        "label": "拉脱维亚语",
        "kind": "alias"
      },
      {
        "label": "letton",
        "kind": "alias"
      },
      {
        "label": "Lettisch",
        "kind": "alias"
      }
    ],
    "tha": [
      {
        "label": "tailandés",
        "kind": "local"
      },
      {
        "label": "ไทย",
        "kind": "native"
      },
      {
        "label": "Thai",
        "kind": "english"
      },
      {
        "label": "泰语",
        "kind": "alias"
      },
      {
        "label": "thaï",
        "kind": "alias"
      },
      {
        "label": "Thailändisch",
        "kind": "alias"
      },
      {
        "label": "泰文",
        "kind": "alias"
      },
      {
        "label": "泰語",
        "kind": "alias"
      }
    ],
    "slv": [
      {
        "label": "esloveno",
        "kind": "local"
      },
      {
        "label": "slovenščina",
        "kind": "native"
      },
      {
        "label": "Slovene",
        "kind": "english"
      },
      {
        "label": "斯洛文尼亚语",
        "kind": "alias"
      },
      {
        "label": "Slovenian",
        "kind": "alias"
      },
      {
        "label": "slovène",
        "kind": "alias"
      },
      {
        "label": "Slowenisch",
        "kind": "alias"
      }
    ],
    "vie": [
      {
        "label": "vietnamita",
        "kind": "local"
      },
      {
        "label": "Tiếng Việt",
        "kind": "native"
      },
      {
        "label": "Vietnamese",
        "kind": "english"
      },
      {
        "label": "越南语",
        "kind": "alias"
      },
      {
        "label": "vietnamien",
        "kind": "alias"
      },
      {
        "label": "Vietnamesisch",
        "kind": "alias"
      },
      {
        "label": "越文",
        "kind": "alias"
      },
      {
        "label": "越語",
        "kind": "alias"
      }
    ],
    "oci": [
      {
        "label": "occitano",
        "kind": "local"
      },
      {
        "label": "occitan",
        "kind": "native"
      },
      {
        "label": "奥克语",
        "kind": "alias"
      },
      {
        "label": "Okzitanisch",
        "kind": "alias"
      }
    ],
    "kaz": [
      {
        "label": "kazajo",
        "kind": "local"
      },
      {
        "label": "қазақ тілі",
        "kind": "native"
      },
      {
        "label": "Kazakh",
        "kind": "english"
      },
      {
        "label": "哈萨克语",
        "kind": "alias"
      },
      {
        "label": "Kasachisch",
        "kind": "alias"
      },
      {
        "label": "哈薩克語",
        "kind": "alias"
      }
    ],
    "cym": [
      {
        "label": "galés",
        "kind": "local"
      },
      {
        "label": "Cymraeg",
        "kind": "native"
      },
      {
        "label": "Welsh",
        "kind": "english"
      },
      {
        "label": "威尔士语",
        "kind": "alias"
      },
      {
        "label": "gallois",
        "kind": "alias"
      },
      {
        "label": "Walisisch",
        "kind": "alias"
      }
    ],
    "msa": [
      {
        "label": "malayo",
        "kind": "local"
      },
      {
        "label": "Melayu",
        "kind": "native"
      },
      {
        "label": "Malay",
        "kind": "english"
      },
      {
        "label": "马来语",
        "kind": "alias"
      },
      {
        "label": "malais",
        "kind": "alias"
      },
      {
        "label": "Malaiisch",
        "kind": "alias"
      },
      {
        "label": "马来文",
        "kind": "alias"
      },
      {
        "label": "马来话",
        "kind": "alias"
      },
      {
        "label": "馬來文",
        "kind": "alias"
      },
      {
        "label": "馬來話",
        "kind": "alias"
      },
      {
        "label": "bahasa melayu",
        "kind": "alias"
      }
    ],
    "ina": [
      {
        "label": "interlingua",
        "kind": "local"
      },
      {
        "label": "Interlingua (International Auxiliary Language Association)",
        "kind": "english"
      },
      {
        "label": "国际语",
        "kind": "alias"
      }
    ],
    "yid": [
      {
        "label": "yidis",
        "kind": "local"
      },
      {
        "label": "ייִדיש",
        "kind": "native"
      },
      {
        "label": "Yiddish",
        "kind": "english"
      },
      {
        "label": "意第绪语",
        "kind": "alias"
      },
      {
        "label": "Jiddisch",
        "kind": "alias"
      }
    ],
    "mkd": [
      {
        "label": "macedonio",
        "kind": "local"
      },
      {
        "label": "македонски",
        "kind": "native"
      },
      {
        "label": "Macedonian",
        "kind": "english"
      },
      {
        "label": "马其顿语",
        "kind": "alias"
      },
      {
        "label": "macédonien",
        "kind": "alias"
      },
      {
        "label": "Mazedonisch",
        "kind": "alias"
      }
    ],
    "grc": [
      {
        "label": "griego antiguo",
        "kind": "local"
      },
      {
        "label": "Ancient Greek",
        "kind": "english"
      },
      {
        "label": "古希腊语",
        "kind": "alias"
      },
      {
        "label": "grec ancien",
        "kind": "alias"
      },
      {
        "label": "Altgriechisch",
        "kind": "alias"
      }
    ],
    "kur": [
      {
        "label": "kurdo",
        "kind": "local"
      },
      {
        "label": "Kurdî",
        "kind": "native"
      },
      {
        "label": "Kurdish",
        "kind": "english"
      },
      {
        "label": "库尔德语",
        "kind": "alias"
      },
      {
        "label": "kurde",
        "kind": "alias"
      },
      {
        "label": "Kurdisch",
        "kind": "alias"
      }
    ],
    "lfn": [
      {
        "label": "Lingua Franca Nova",
        "kind": "english"
      }
    ],
    "mon": [
      {
        "label": "mongol",
        "kind": "local"
      },
      {
        "label": "монгол",
        "kind": "native"
      },
      {
        "label": "Mongolian",
        "kind": "english"
      },
      {
        "label": "蒙古语",
        "kind": "alias"
      },
      {
        "label": "Mongolisch",
        "kind": "alias"
      },
      {
        "label": "蒙古文",
        "kind": "alias"
      },
      {
        "label": "蒙古語",
        "kind": "alias"
      },
      {
        "label": "蒙古話",
        "kind": "alias"
      }
    ],
    "ido": [
      {
        "label": "ido",
        "kind": "local"
      },
      {
        "label": "伊多语",
        "kind": "alias"
      }
    ],
    "glg": [
      {
        "label": "gallego",
        "kind": "local"
      },
      {
        "label": "galego",
        "kind": "native"
      },
      {
        "label": "Galician",
        "kind": "english"
      },
      {
        "label": "加利西亚语",
        "kind": "alias"
      },
      {
        "label": "galicien",
        "kind": "alias"
      },
      {
        "label": "Galicisch",
        "kind": "alias"
      }
    ],
    "tel": [
      {
        "label": "telugu",
        "kind": "local"
      },
      {
        "label": "తెలుగు",
        "kind": "native"
      },
      {
        "label": "泰卢固语",
        "kind": "alias"
      },
      {
        "label": "télougou",
        "kind": "alias"
      }
    ],
    "mlt": [
      {
        "label": "maltés",
        "kind": "local"
      },
      {
        "label": "Malti",
        "kind": "native"
      },
      {
        "label": "Maltese",
        "kind": "english"
      },
      {
        "label": "马耳他语",
        "kind": "alias"
      },
      {
        "label": "maltais",
        "kind": "alias"
      },
      {
        "label": "Maltesisch",
        "kind": "alias"
      }
    ],
    "pus": [
      {
        "label": "pastún",
        "kind": "local"
      },
      {
        "label": "پښتو",
        "kind": "native"
      },
      {
        "label": "Pashto",
        "kind": "english"
      },
      {
        "label": "普什图语",
        "kind": "alias"
      },
      {
        "label": "pachto",
        "kind": "alias"
      },
      {
        "label": "Paschtu",
        "kind": "alias"
      }
    ],
    "tat": [
      {
        "label": "tártaro",
        "kind": "local"
      },
      {
        "label": "татар",
        "kind": "native"
      },
      {
        "label": "Tatar",
        "kind": "english"
      },
      {
        "label": "鞑靼语",
        "kind": "alias"
      },
      {
        "label": "Tatarisch",
        "kind": "alias"
      }
    ],
    "pan": [
      {
        "label": "punyabí",
        "kind": "local"
      },
      {
        "label": "ਪੰਜਾਬੀ",
        "kind": "native"
      },
      {
        "label": "Punjabi",
        "kind": "english"
      },
      {
        "label": "旁遮普语",
        "kind": "alias"
      },
      {
        "label": "pendjabi",
        "kind": "alias"
      },
      {
        "label": "旁遮普文",
        "kind": "alias"
      },
      {
        "label": "旁遮普語",
        "kind": "alias"
      }
    ],
    "uzb": [
      {
        "label": "uzbeko",
        "kind": "local"
      },
      {
        "label": "o‘zbek",
        "kind": "native"
      },
      {
        "label": "Uzbek",
        "kind": "english"
      },
      {
        "label": "乌兹别克语",
        "kind": "alias"
      },
      {
        "label": "ouzbek",
        "kind": "alias"
      },
      {
        "label": "Usbekisch",
        "kind": "alias"
      }
    ],
    "ltz": [
      {
        "label": "luxemburgués",
        "kind": "local"
      },
      {
        "label": "Lëtzebuergesch",
        "kind": "native"
      },
      {
        "label": "Luxembourgish",
        "kind": "english"
      },
      {
        "label": "卢森堡语",
        "kind": "alias"
      },
      {
        "label": "luxembourgeois",
        "kind": "alias"
      },
      {
        "label": "Luxemburgisch",
        "kind": "alias"
      }
    ],
    "nep": [
      {
        "label": "nepalí",
        "kind": "local"
      },
      {
        "label": "नेपाली",
        "kind": "native"
      },
      {
        "label": "Nepali",
        "kind": "english"
      },
      {
        "label": "尼泊尔语",
        "kind": "alias"
      },
      {
        "label": "népalais",
        "kind": "alias"
      },
      {
        "label": "Nepalesisch",
        "kind": "alias"
      },
      {
        "label": "尼泊尔文",
        "kind": "alias"
      },
      {
        "label": "尼泊爾文",
        "kind": "alias"
      }
    ],
    "gla": [
      {
        "label": "gaélico escocés",
        "kind": "local"
      },
      {
        "label": "Gàidhlig",
        "kind": "native"
      },
      {
        "label": "Scottish Gaelic",
        "kind": "english"
      },
      {
        "label": "苏格兰盖尔语",
        "kind": "alias"
      },
      {
        "label": "gaélique écossais",
        "kind": "alias"
      },
      {
        "label": "Gälisch (Schottland)",
        "kind": "alias"
      }
    ],
    "bre": [
      {
        "label": "bretón",
        "kind": "local"
      },
      {
        "label": "brezhoneg",
        "kind": "native"
      },
      {
        "label": "Breton",
        "kind": "english"
      },
      {
        "label": "布列塔尼语",
        "kind": "alias"
      },
      {
        "label": "Bretonisch",
        "kind": "alias"
      }
    ],
    "cmn": [
      {
        "label": "mandarín",
        "kind": "local"
      },
      {
        "label": "普通话",
        "kind": "native"
      },
      {
        "label": "Mandarin",
        "kind": "english"
      },
      {
        "label": "中文",
        "kind": "alias"
      },
      {
        "label": "chinese",
        "kind": "alias"
      },
      {
        "label": "mandarin chinese",
        "kind": "alias"
      },
      {
        "label": "standard chinese",
        "kind": "alias"
      },
      {
        "label": "putonghua",
        "kind": "alias"
      },
      {
        "label": "guoyu",
        "kind": "alias"
      },
      {
        "label": "汉语",
        "kind": "alias"
      },
      {
        "label": "国语",
        "kind": "alias"
      },
      {
        "label": "國語",
        "kind": "alias"
      },
      {
        "label": "华语",
        "kind": "alias"
      },
      {
        "label": "華語",
        "kind": "alias"
      },
      {
        "label": "官话",
        "kind": "alias"
      },
      {
        "label": "北方话",
        "kind": "alias"
      },
      {
        "label": "北方方言",
        "kind": "alias"
      },
      {
        "label": "中文普通话",
        "kind": "alias"
      }
    ],
    "kir": [
      {
        "label": "kirguís",
        "kind": "local"
      },
      {
        "label": "кыргызча",
        "kind": "native"
      },
      {
        "label": "Kyrgyz",
        "kind": "english"
      },
      {
        "label": "吉尔吉斯语",
        "kind": "alias"
      },
      {
        "label": "kirghize",
        "kind": "alias"
      },
      {
        "label": "Kirgisisch",
        "kind": "alias"
      },
      {
        "label": "柯尔克孜语",
        "kind": "alias"
      },
      {
        "label": "柯爾克孜語",
        "kind": "alias"
      },
      {
        "label": "吉爾吉斯語",
        "kind": "alias"
      }
    ],
    "fao": [
      {
        "label": "feroés",
        "kind": "local"
      },
      {
        "label": "føroyskt",
        "kind": "native"
      },
      {
        "label": "Faroese",
        "kind": "english"
      },
      {
        "label": "法罗语",
        "kind": "alias"
      },
      {
        "label": "féroïen",
        "kind": "alias"
      },
      {
        "label": "Färöisch",
        "kind": "alias"
      }
    ],
    "amh": [
      {
        "label": "amárico",
        "kind": "local"
      },
      {
        "label": "አማርኛ",
        "kind": "native"
      },
      {
        "label": "Amharic",
        "kind": "english"
      },
      {
        "label": "阿姆哈拉语",
        "kind": "alias"
      },
      {
        "label": "amharique",
        "kind": "alias"
      },
      {
        "label": "Amharisch",
        "kind": "alias"
      },
      {
        "label": "阿姆哈拉文",
        "kind": "alias"
      },
      {
        "label": "阿姆哈拉語",
        "kind": "alias"
      }
    ],
    "kan": [
      {
        "label": "canarés",
        "kind": "local"
      },
      {
        "label": "ಕನ್ನಡ",
        "kind": "native"
      },
      {
        "label": "Kannada",
        "kind": "english"
      },
      {
        "label": "卡纳达语",
        "kind": "alias"
      }
    ],
    "mar": [
      {
        "label": "maratí",
        "kind": "local"
      },
      {
        "label": "मराठी",
        "kind": "native"
      },
      {
        "label": "Marathi",
        "kind": "english"
      },
      {
        "label": "马拉地语",
        "kind": "alias"
      }
    ],
    "tgl": [
      {
        "label": "tagalo",
        "kind": "local"
      },
      {
        "label": "Tagalog",
        "kind": "native"
      },
      {
        "label": "他加禄语",
        "kind": "alias"
      },
      {
        "label": "他加禄文",
        "kind": "alias"
      },
      {
        "label": "他加祿文",
        "kind": "alias"
      }
    ],
    "roh": [
      {
        "label": "romanche",
        "kind": "local"
      },
      {
        "label": "rumantsch",
        "kind": "native"
      },
      {
        "label": "Romansh",
        "kind": "english"
      },
      {
        "label": "罗曼什语",
        "kind": "alias"
      },
      {
        "label": "Rätoromanisch",
        "kind": "alias"
      }
    ],
    "bak": [
      {
        "label": "baskir",
        "kind": "local"
      },
      {
        "label": "Bashkir",
        "kind": "english"
      },
      {
        "label": "巴什基尔语",
        "kind": "alias"
      },
      {
        "label": "bachkir",
        "kind": "alias"
      },
      {
        "label": "Baschkirisch",
        "kind": "alias"
      }
    ],
    "mal": [
      {
        "label": "malayálam",
        "kind": "local"
      },
      {
        "label": "മലയാളം",
        "kind": "native"
      },
      {
        "label": "Malayalam",
        "kind": "english"
      },
      {
        "label": "马拉雅拉姆语",
        "kind": "alias"
      }
    ],
    "mya": [
      {
        "label": "birmano",
        "kind": "local"
      },
      {
        "label": "မြန်မာ",
        "kind": "native"
      },
      {
        "label": "Burmese",
        "kind": "english"
      },
      {
        "label": "缅甸语",
        "kind": "alias"
      },
      {
        "label": "birman",
        "kind": "alias"
      },
      {
        "label": "Birmanisch",
        "kind": "alias"
      },
      {
        "label": "缅语",
        "kind": "alias"
      },
      {
        "label": "缅文",
        "kind": "alias"
      },
      {
        "label": "緬語",
        "kind": "alias"
      },
      {
        "label": "緬文",
        "kind": "alias"
      }
    ],
    "que": [
      {
        "label": "quechua",
        "kind": "local"
      },
      {
        "label": "Runasimi",
        "kind": "native"
      },
      {
        "label": "克丘亚语",
        "kind": "alias"
      }
    ],
    "jav": [
      {
        "label": "javanés",
        "kind": "local"
      },
      {
        "label": "Jawa",
        "kind": "native"
      },
      {
        "label": "Javanese",
        "kind": "english"
      },
      {
        "label": "爪哇语",
        "kind": "alias"
      },
      {
        "label": "javanais",
        "kind": "alias"
      },
      {
        "label": "Javanisch",
        "kind": "alias"
      }
    ],
    "uig": [
      {
        "label": "uigur",
        "kind": "local"
      },
      {
        "label": "ئۇيغۇرچە",
        "kind": "native"
      },
      {
        "label": "Uyghur",
        "kind": "english"
      },
      {
        "label": "维吾尔语",
        "kind": "alias"
      },
      {
        "label": "ouïghour",
        "kind": "alias"
      },
      {
        "label": "Uigurisch",
        "kind": "alias"
      },
      {
        "label": "维语",
        "kind": "alias"
      },
      {
        "label": "維語",
        "kind": "alias"
      },
      {
        "label": "維吾爾語",
        "kind": "alias"
      }
    ],
    "mri": [
      {
        "label": "maorí",
        "kind": "local"
      },
      {
        "label": "Māori",
        "kind": "native"
      },
      {
        "label": "毛利语",
        "kind": "alias"
      },
      {
        "label": "maori",
        "kind": "alias"
      }
    ],
    "tgk": [
      {
        "label": "tayiko",
        "kind": "local"
      },
      {
        "label": "тоҷикӣ",
        "kind": "native"
      },
      {
        "label": "Tajik",
        "kind": "english"
      },
      {
        "label": "塔吉克语",
        "kind": "alias"
      },
      {
        "label": "tadjik",
        "kind": "alias"
      },
      {
        "label": "Tadschikisch",
        "kind": "alias"
      },
      {
        "label": "塔吉克語",
        "kind": "alias"
      }
    ],
    "tuk": [
      {
        "label": "turcomano",
        "kind": "local"
      },
      {
        "label": "türkmen dili",
        "kind": "native"
      },
      {
        "label": "Turkmen",
        "kind": "english"
      },
      {
        "label": "土库曼语",
        "kind": "alias"
      },
      {
        "label": "turkmène",
        "kind": "alias"
      },
      {
        "label": "Turkmenisch",
        "kind": "alias"
      }
    ],
    "abk": [
      {
        "label": "abjasio",
        "kind": "local"
      },
      {
        "label": "Abkhaz",
        "kind": "english"
      },
      {
        "label": "阿布哈西亚语",
        "kind": "alias"
      },
      {
        "label": "Abkhazian",
        "kind": "alias"
      },
      {
        "label": "abkhaze",
        "kind": "alias"
      },
      {
        "label": "Abchasisch",
        "kind": "alias"
      }
    ],
    "guj": [
      {
        "label": "guyaratí",
        "kind": "local"
      },
      {
        "label": "ગુજરાતી",
        "kind": "native"
      },
      {
        "label": "Gujarati",
        "kind": "english"
      },
      {
        "label": "古吉拉特语",
        "kind": "alias"
      },
      {
        "label": "goudjarati",
        "kind": "alias"
      }
    ],
    "szl": [
      {
        "label": "silesio",
        "kind": "local"
      },
      {
        "label": "ślōnski",
        "kind": "native"
      },
      {
        "label": "Silesian",
        "kind": "english"
      },
      {
        "label": "西里西亚语",
        "kind": "alias"
      },
      {
        "label": "silésien",
        "kind": "alias"
      },
      {
        "label": "Schlesisch (Wasserpolnisch)",
        "kind": "alias"
      }
    ],
    "khm": [
      {
        "label": "jemer",
        "kind": "local"
      },
      {
        "label": "ខ្មែរ",
        "kind": "native"
      },
      {
        "label": "Khmer",
        "kind": "english"
      },
      {
        "label": "高棉语",
        "kind": "alias"
      },
      {
        "label": "高棉文",
        "kind": "alias"
      },
      {
        "label": "柬语",
        "kind": "alias"
      },
      {
        "label": "柬語",
        "kind": "alias"
      },
      {
        "label": "柬埔寨语",
        "kind": "alias"
      },
      {
        "label": "柬埔寨語",
        "kind": "alias"
      }
    ],
    "zul": [
      {
        "label": "zulú",
        "kind": "local"
      },
      {
        "label": "isiZulu",
        "kind": "native"
      },
      {
        "label": "Zulu",
        "kind": "english"
      },
      {
        "label": "祖鲁语",
        "kind": "alias"
      },
      {
        "label": "zoulou",
        "kind": "alias"
      }
    ],
    "bod": [
      {
        "label": "tibetano",
        "kind": "local"
      },
      {
        "label": "བོད་སྐད་",
        "kind": "native"
      },
      {
        "label": "Tibetan",
        "kind": "english"
      },
      {
        "label": "藏语",
        "kind": "alias"
      },
      {
        "label": "tibétain",
        "kind": "alias"
      },
      {
        "label": "Tibetisch",
        "kind": "alias"
      },
      {
        "label": "藏文",
        "kind": "alias"
      },
      {
        "label": "藏語",
        "kind": "alias"
      },
      {
        "label": "藏話",
        "kind": "alias"
      }
    ],
    "che": [
      {
        "label": "checheno",
        "kind": "local"
      },
      {
        "label": "нохчийн",
        "kind": "native"
      },
      {
        "label": "Chechen",
        "kind": "english"
      },
      {
        "label": "车臣语",
        "kind": "alias"
      },
      {
        "label": "tchétchène",
        "kind": "alias"
      },
      {
        "label": "Tschetschenisch",
        "kind": "alias"
      }
    ],
    "zza": [
      {
        "label": "zazaki",
        "kind": "local"
      },
      {
        "label": "扎扎语",
        "kind": "alias"
      },
      {
        "label": "Zaza",
        "kind": "alias"
      }
    ],
    "asm": [
      {
        "label": "asamés",
        "kind": "local"
      },
      {
        "label": "অসমীয়া",
        "kind": "native"
      },
      {
        "label": "Assamese",
        "kind": "english"
      },
      {
        "label": "阿萨姆语",
        "kind": "alias"
      },
      {
        "label": "assamais",
        "kind": "alias"
      },
      {
        "label": "Assamesisch",
        "kind": "alias"
      }
    ],
    "cor": [
      {
        "label": "córnico",
        "kind": "local"
      },
      {
        "label": "kernewek",
        "kind": "native"
      },
      {
        "label": "Cornish",
        "kind": "english"
      },
      {
        "label": "康沃尔语",
        "kind": "alias"
      },
      {
        "label": "cornique",
        "kind": "alias"
      },
      {
        "label": "Kornisch",
        "kind": "alias"
      }
    ],
    "chv": [
      {
        "label": "chuvasio",
        "kind": "local"
      },
      {
        "label": "чӑваш",
        "kind": "native"
      },
      {
        "label": "Chuvash",
        "kind": "english"
      },
      {
        "label": "楚瓦什语",
        "kind": "alias"
      },
      {
        "label": "tchouvache",
        "kind": "alias"
      },
      {
        "label": "Tschuwaschisch",
        "kind": "alias"
      }
    ],
    "haw": [
      {
        "label": "hawaiano",
        "kind": "local"
      },
      {
        "label": "ʻŌlelo Hawaiʻi",
        "kind": "native"
      },
      {
        "label": "Hawaiian",
        "kind": "english"
      },
      {
        "label": "夏威夷语",
        "kind": "alias"
      },
      {
        "label": "hawaïen",
        "kind": "alias"
      },
      {
        "label": "Hawaiisch",
        "kind": "alias"
      }
    ],
    "sco": [
      {
        "label": "escocés",
        "kind": "local"
      },
      {
        "label": "Scots",
        "kind": "english"
      },
      {
        "label": "苏格兰语",
        "kind": "alias"
      },
      {
        "label": "écossais",
        "kind": "alias"
      },
      {
        "label": "Schottisch",
        "kind": "alias"
      }
    ],
    "vol": [
      {
        "label": "volapük",
        "kind": "local"
      },
      {
        "label": "沃拉普克语",
        "kind": "alias"
      }
    ],
    "hbs": [
      {
        "label": "serbocroata",
        "kind": "local"
      },
      {
        "label": "srpskohrvatski",
        "kind": "native"
      },
      {
        "label": "Serbo-Croatian",
        "kind": "english"
      },
      {
        "label": "塞尔维亚-克罗地亚语",
        "kind": "alias"
      },
      {
        "label": "serbo-croate",
        "kind": "alias"
      },
      {
        "label": "Serbo-Kroatisch",
        "kind": "alias"
      }
    ],
    "hau": [
      {
        "label": "hausa",
        "kind": "local"
      },
      {
        "label": "豪萨语",
        "kind": "alias"
      },
      {
        "label": "haoussa",
        "kind": "alias"
      },
      {
        "label": "Haussa",
        "kind": "alias"
      }
    ],
    "grn": [
      {
        "label": "guaraní",
        "kind": "local"
      },
      {
        "label": "Guarani",
        "kind": "english"
      },
      {
        "label": "瓜拉尼语",
        "kind": "alias"
      }
    ],
    "som": [
      {
        "label": "somalí",
        "kind": "local"
      },
      {
        "label": "Soomaali",
        "kind": "native"
      },
      {
        "label": "Somali",
        "kind": "english"
      },
      {
        "label": "索马里语",
        "kind": "alias"
      }
    ],
    "mlg": [
      {
        "label": "malgache",
        "kind": "local"
      },
      {
        "label": "Malagasy",
        "kind": "native"
      },
      {
        "label": "马拉加斯语",
        "kind": "alias"
      }
    ],
    "srd": [
      {
        "label": "sardo",
        "kind": "local"
      },
      {
        "label": "sardu",
        "kind": "native"
      },
      {
        "label": "Sardinian",
        "kind": "english"
      },
      {
        "label": "萨丁语",
        "kind": "alias"
      },
      {
        "label": "sarde",
        "kind": "alias"
      },
      {
        "label": "Sardisch",
        "kind": "alias"
      }
    ],
    "ory": [
      {
        "label": "oriya",
        "kind": "local"
      },
      {
        "label": "ଓଡ଼ିଆ",
        "kind": "native"
      },
      {
        "label": "Odia",
        "kind": "english"
      },
      {
        "label": "奥里亚语",
        "kind": "alias"
      }
    ],
    "glv": [
      {
        "label": "manés",
        "kind": "local"
      },
      {
        "label": "Gaelg",
        "kind": "native"
      },
      {
        "label": "Manx",
        "kind": "english"
      },
      {
        "label": "马恩语",
        "kind": "alias"
      },
      {
        "label": "mannois",
        "kind": "alias"
      }
    ],
    "arg": [
      {
        "label": "aragonés",
        "kind": "local"
      },
      {
        "label": "Aragonese",
        "kind": "english"
      },
      {
        "label": "阿拉贡语",
        "kind": "alias"
      },
      {
        "label": "aragonais",
        "kind": "alias"
      },
      {
        "label": "Aragonesisch",
        "kind": "alias"
      }
    ],
    "crh": [
      {
        "label": "tártaro de Crimea",
        "kind": "local"
      },
      {
        "label": "Crimean Tatar",
        "kind": "english"
      },
      {
        "label": "克里米亚鞑靼语",
        "kind": "alias"
      },
      {
        "label": "tatar de Crimée",
        "kind": "alias"
      },
      {
        "label": "Krimtatarisch",
        "kind": "alias"
      }
    ],
    "lao": [
      {
        "label": "lao",
        "kind": "local"
      },
      {
        "label": "ລາວ",
        "kind": "native"
      },
      {
        "label": "老挝语",
        "kind": "alias"
      },
      {
        "label": "Laotisch",
        "kind": "alias"
      }
    ],
    "sah": [
      {
        "label": "sakha",
        "kind": "local"
      },
      {
        "label": "саха тыла",
        "kind": "native"
      },
      {
        "label": "Yakut",
        "kind": "english"
      },
      {
        "label": "萨哈语",
        "kind": "alias"
      },
      {
        "label": "iakoute",
        "kind": "alias"
      },
      {
        "label": "Jakutisch",
        "kind": "alias"
      }
    ],
    "cop": [
      {
        "label": "copto",
        "kind": "local"
      },
      {
        "label": "Coptic",
        "kind": "english"
      },
      {
        "label": "科普特语",
        "kind": "alias"
      },
      {
        "label": "copte",
        "kind": "alias"
      },
      {
        "label": "Koptisch",
        "kind": "alias"
      }
    ],
    "pli": [
      {
        "label": "pali",
        "kind": "local"
      },
      {
        "label": "巴利语",
        "kind": "alias"
      }
    ],
    "xho": [
      {
        "label": "xhosa",
        "kind": "local"
      },
      {
        "label": "IsiXhosa",
        "kind": "native"
      },
      {
        "label": "科萨语",
        "kind": "alias"
      }
    ],
    "csb": [
      {
        "label": "casubio",
        "kind": "local"
      },
      {
        "label": "Kashubian",
        "kind": "english"
      },
      {
        "label": "卡舒比语",
        "kind": "alias"
      },
      {
        "label": "kachoube",
        "kind": "alias"
      },
      {
        "label": "Kaschubisch",
        "kind": "alias"
      }
    ],
    "arn": [
      {
        "label": "mapuche",
        "kind": "local"
      },
      {
        "label": "Mapudungun",
        "kind": "english"
      },
      {
        "label": "马普切语",
        "kind": "alias"
      }
    ],
    "sin": [
      {
        "label": "cingalés",
        "kind": "local"
      },
      {
        "label": "සිංහල",
        "kind": "native"
      },
      {
        "label": "Sinhala",
        "kind": "english"
      },
      {
        "label": "僧伽罗语",
        "kind": "alias"
      },
      {
        "label": "cingalais",
        "kind": "alias"
      },
      {
        "label": "Singhalesisch",
        "kind": "alias"
      },
      {
        "label": "sinhalese",
        "kind": "alias"
      }
    ],
    "ang": [
      {
        "label": "inglés antiguo",
        "kind": "local"
      },
      {
        "label": "Old English",
        "kind": "english"
      },
      {
        "label": "古英语",
        "kind": "alias"
      },
      {
        "label": "ancien anglais",
        "kind": "alias"
      },
      {
        "label": "Altenglisch",
        "kind": "alias"
      }
    ],
    "kas": [
      {
        "label": "cachemir",
        "kind": "local"
      },
      {
        "label": "کٲشُر",
        "kind": "native"
      },
      {
        "label": "Kashmiri",
        "kind": "english"
      },
      {
        "label": "克什米尔语",
        "kind": "alias"
      },
      {
        "label": "cachemiri",
        "kind": "alias"
      },
      {
        "label": "Kaschmiri",
        "kind": "alias"
      }
    ],
    "got": [
      {
        "label": "gótico",
        "kind": "local"
      },
      {
        "label": "Gothic",
        "kind": "english"
      },
      {
        "label": "哥特语",
        "kind": "alias"
      },
      {
        "label": "gotique",
        "kind": "alias"
      },
      {
        "label": "Gotisch",
        "kind": "alias"
      }
    ],
    "egy": [
      {
        "label": "egipcio antiguo",
        "kind": "local"
      },
      {
        "label": "Egyptian",
        "kind": "english"
      },
      {
        "label": "古埃及语",
        "kind": "alias"
      },
      {
        "label": "Ancient Egyptian",
        "kind": "alias"
      },
      {
        "label": "égyptien ancien",
        "kind": "alias"
      },
      {
        "label": "Ägyptisch",
        "kind": "alias"
      }
    ],
    "rom": [
      {
        "label": "romaní",
        "kind": "local"
      },
      {
        "label": "Romani",
        "kind": "english"
      },
      {
        "label": "吉普赛语",
        "kind": "alias"
      },
      {
        "label": "Romany",
        "kind": "alias"
      }
    ],
    "snd": [
      {
        "label": "sindi",
        "kind": "local"
      },
      {
        "label": "سنڌي",
        "kind": "native"
      },
      {
        "label": "Sindhi",
        "kind": "english"
      },
      {
        "label": "信德语",
        "kind": "alias"
      }
    ],
    "cos": [
      {
        "label": "corso",
        "kind": "local"
      },
      {
        "label": "Corsican",
        "kind": "english"
      },
      {
        "label": "科西嘉语",
        "kind": "alias"
      },
      {
        "label": "corse",
        "kind": "alias"
      },
      {
        "label": "Korsisch",
        "kind": "alias"
      }
    ],
    "ceb": [
      {
        "label": "cebuano",
        "kind": "local"
      },
      {
        "label": "宿务语",
        "kind": "alias"
      }
    ],
    "nds": [
      {
        "label": "bajo alemán",
        "kind": "local"
      },
      {
        "label": "Neddersass’sch",
        "kind": "native"
      },
      {
        "label": "Low German",
        "kind": "english"
      },
      {
        "label": "低地德语",
        "kind": "alias"
      },
      {
        "label": "bas-allemand",
        "kind": "alias"
      },
      {
        "label": "Niederdeutsch",
        "kind": "alias"
      }
    ],
    "aym": [
      {
        "label": "aimara",
        "kind": "local"
      },
      {
        "label": "Aymara",
        "kind": "english"
      },
      {
        "label": "艾马拉语",
        "kind": "alias"
      }
    ],
    "scn": [
      {
        "label": "siciliano",
        "kind": "local"
      },
      {
        "label": "Sicilian",
        "kind": "english"
      },
      {
        "label": "西西里语",
        "kind": "alias"
      },
      {
        "label": "sicilien",
        "kind": "alias"
      },
      {
        "label": "Sizilianisch",
        "kind": "alias"
      }
    ],
    "ast": [
      {
        "label": "asturiano",
        "kind": "local"
      },
      {
        "label": "asturianu",
        "kind": "native"
      },
      {
        "label": "Asturian",
        "kind": "english"
      },
      {
        "label": "阿斯图里亚斯语",
        "kind": "alias"
      },
      {
        "label": "asturien",
        "kind": "alias"
      },
      {
        "label": "Asturisch",
        "kind": "alias"
      }
    ],
    "dzo": [
      {
        "label": "dzongkha",
        "kind": "local"
      },
      {
        "label": "རྫོང་ཁ",
        "kind": "native"
      },
      {
        "label": "宗卡语",
        "kind": "alias"
      }
    ],
    "tok": [
      {
        "label": "toki pona",
        "kind": "local"
      },
      {
        "label": "道本语",
        "kind": "alias"
      }
    ],
    "kal": [
      {
        "label": "groenlandés",
        "kind": "local"
      },
      {
        "label": "kalaallisut",
        "kind": "native"
      },
      {
        "label": "Greenlandic",
        "kind": "english"
      },
      {
        "label": "格陵兰语",
        "kind": "alias"
      },
      {
        "label": "groenlandais",
        "kind": "alias"
      },
      {
        "label": "Grönländisch",
        "kind": "alias"
      }
    ],
    "ava": [
      {
        "label": "avar",
        "kind": "local"
      },
      {
        "label": "阿瓦尔语",
        "kind": "alias"
      },
      {
        "label": "Avaric",
        "kind": "alias"
      },
      {
        "label": "Awarisch",
        "kind": "alias"
      }
    ],
    "sun": [
      {
        "label": "sundanés",
        "kind": "local"
      },
      {
        "label": "Basa Sunda",
        "kind": "native"
      },
      {
        "label": "Sundanese",
        "kind": "english"
      },
      {
        "label": "巽他语",
        "kind": "alias"
      },
      {
        "label": "soundanais",
        "kind": "alias"
      },
      {
        "label": "Sundanesisch",
        "kind": "alias"
      }
    ],
    "wln": [
      {
        "label": "valón",
        "kind": "local"
      },
      {
        "label": "Walloon",
        "kind": "english"
      },
      {
        "label": "瓦隆语",
        "kind": "alias"
      },
      {
        "label": "wallon",
        "kind": "alias"
      },
      {
        "label": "Wallonisch",
        "kind": "alias"
      }
    ],
    "cnr": [
      {
        "label": "montenegrino",
        "kind": "local"
      },
      {
        "label": "crnogorski",
        "kind": "native"
      },
      {
        "label": "Montenegrin",
        "kind": "english"
      },
      {
        "label": "黑山语",
        "kind": "alias"
      },
      {
        "label": "monténégrin",
        "kind": "alias"
      },
      {
        "label": "Montenegrinisch",
        "kind": "alias"
      }
    ],
    "prs": [
      {
        "label": "darí",
        "kind": "local"
      },
      {
        "label": "دری",
        "kind": "native"
      },
      {
        "label": "Dari",
        "kind": "english"
      },
      {
        "label": "达里语",
        "kind": "alias"
      }
    ],
    "nap": [
      {
        "label": "napolitano",
        "kind": "local"
      },
      {
        "label": "Neapolitan",
        "kind": "english"
      },
      {
        "label": "那不勒斯语",
        "kind": "alias"
      },
      {
        "label": "napolitain",
        "kind": "alias"
      },
      {
        "label": "Neapolitanisch",
        "kind": "alias"
      }
    ],
    "tir": [
      {
        "label": "tigriña",
        "kind": "local"
      },
      {
        "label": "ትግርኛ",
        "kind": "native"
      },
      {
        "label": "Tigrinya",
        "kind": "english"
      },
      {
        "label": "提格利尼亚语",
        "kind": "alias"
      },
      {
        "label": "tigrigna",
        "kind": "alias"
      }
    ],
    "ain": [
      {
        "label": "ainu",
        "kind": "local"
      },
      {
        "label": "阿伊努语",
        "kind": "alias"
      },
      {
        "label": "aïnou",
        "kind": "alias"
      }
    ],
    "udm": [
      {
        "label": "udmurt",
        "kind": "local"
      },
      {
        "label": "乌德穆尔特语",
        "kind": "alias"
      },
      {
        "label": "oudmourte",
        "kind": "alias"
      },
      {
        "label": "Udmurtisch",
        "kind": "alias"
      }
    ],
    "akk": [
      {
        "label": "acadio",
        "kind": "local"
      },
      {
        "label": "Akkadian",
        "kind": "english"
      },
      {
        "label": "阿卡德语",
        "kind": "alias"
      },
      {
        "label": "akkadien",
        "kind": "alias"
      },
      {
        "label": "Akkadisch",
        "kind": "alias"
      }
    ],
    "gag": [
      {
        "label": "gagauzo",
        "kind": "local"
      },
      {
        "label": "Gagauz",
        "kind": "english"
      },
      {
        "label": "加告兹语",
        "kind": "alias"
      },
      {
        "label": "gagaouze",
        "kind": "alias"
      },
      {
        "label": "Gagausisch",
        "kind": "alias"
      }
    ],
    "ibo": [
      {
        "label": "igbo",
        "kind": "local"
      },
      {
        "label": "伊博语",
        "kind": "alias"
      }
    ],
    "krl": [
      {
        "label": "carelio",
        "kind": "local"
      },
      {
        "label": "Karelian",
        "kind": "english"
      },
      {
        "label": "卡累利阿语",
        "kind": "alias"
      },
      {
        "label": "carélien",
        "kind": "alias"
      },
      {
        "label": "Karelisch",
        "kind": "alias"
      }
    ],
    "ave": [
      {
        "label": "avéstico",
        "kind": "local"
      },
      {
        "label": "Avestan",
        "kind": "english"
      },
      {
        "label": "阿维斯塔语",
        "kind": "alias"
      },
      {
        "label": "avestique",
        "kind": "alias"
      },
      {
        "label": "Avestisch",
        "kind": "alias"
      }
    ],
    "div": [
      {
        "label": "divehi",
        "kind": "local"
      },
      {
        "label": "Dhivehi",
        "kind": "english"
      },
      {
        "label": "迪维希语",
        "kind": "alias"
      },
      {
        "label": "maldivien",
        "kind": "alias"
      },
      {
        "label": "maldivian",
        "kind": "alias"
      }
    ],
    "isv": [
      {
        "label": "Interslavic",
        "kind": "english"
      }
    ],
    "tyv": [
      {
        "label": "tuviniano",
        "kind": "local"
      },
      {
        "label": "Tuvan",
        "kind": "english"
      },
      {
        "label": "图瓦语",
        "kind": "alias"
      },
      {
        "label": "Tuvinian",
        "kind": "alias"
      },
      {
        "label": "touvain",
        "kind": "alias"
      },
      {
        "label": "Tuwinisch",
        "kind": "alias"
      }
    ],
    "lmo": [
      {
        "label": "lombardo",
        "kind": "local"
      },
      {
        "label": "Lombard",
        "kind": "native"
      },
      {
        "label": "伦巴第语",
        "kind": "alias"
      },
      {
        "label": "Lombardisch",
        "kind": "alias"
      }
    ],
    "ota": [
      {
        "label": "turco otomano",
        "kind": "local"
      },
      {
        "label": "Ottoman Turkish",
        "kind": "english"
      },
      {
        "label": "奥斯曼土耳其语",
        "kind": "alias"
      },
      {
        "label": "turc ottoman",
        "kind": "alias"
      },
      {
        "label": "Osmanisch",
        "kind": "alias"
      }
    ],
    "myv": [
      {
        "label": "erzya",
        "kind": "local"
      },
      {
        "label": "厄尔兹亚语",
        "kind": "alias"
      },
      {
        "label": "Ersja-Mordwinisch",
        "kind": "alias"
      }
    ],
    "bal": [
      {
        "label": "baluchi",
        "kind": "local"
      },
      {
        "label": "Balochi",
        "kind": "english"
      },
      {
        "label": "俾路支语",
        "kind": "alias"
      },
      {
        "label": "baloutchi",
        "kind": "alias"
      },
      {
        "label": "Belutschisch",
        "kind": "alias"
      }
    ],
    "yor": [
      {
        "label": "yoruba",
        "kind": "local"
      },
      {
        "label": "Èdè Yorùbá",
        "kind": "native"
      },
      {
        "label": "约鲁巴语",
        "kind": "alias"
      }
    ],
    "pms": [
      {
        "label": "Piedmontese",
        "kind": "english"
      },
      {
        "label": "piémontais",
        "kind": "alias"
      },
      {
        "label": "Piemontesisch",
        "kind": "alias"
      }
    ],
    "ady": [
      {
        "label": "adigué",
        "kind": "local"
      },
      {
        "label": "Adyghe",
        "kind": "english"
      },
      {
        "label": "阿迪格语",
        "kind": "alias"
      },
      {
        "label": "adyguéen",
        "kind": "alias"
      },
      {
        "label": "Adygeisch",
        "kind": "alias"
      }
    ],
    "wol": [
      {
        "label": "wólof",
        "kind": "local"
      },
      {
        "label": "Wolof",
        "kind": "native"
      },
      {
        "label": "沃洛夫语",
        "kind": "alias"
      }
    ],
    "fur": [
      {
        "label": "friulano",
        "kind": "local"
      },
      {
        "label": "furlan",
        "kind": "native"
      },
      {
        "label": "Friulian",
        "kind": "english"
      },
      {
        "label": "弗留利语",
        "kind": "alias"
      },
      {
        "label": "frioulan",
        "kind": "alias"
      },
      {
        "label": "Friaulisch",
        "kind": "alias"
      }
    ],
    "smo": [
      {
        "label": "samoano",
        "kind": "local"
      },
      {
        "label": "Samoan",
        "kind": "english"
      },
      {
        "label": "萨摩亚语",
        "kind": "alias"
      },
      {
        "label": "Samoanisch",
        "kind": "alias"
      }
    ],
    "rue": [
      {
        "label": "Rusyn",
        "kind": "english"
      },
      {
        "label": "ruthène",
        "kind": "alias"
      },
      {
        "label": "Russinisch",
        "kind": "alias"
      }
    ],
    "sot": [
      {
        "label": "sotho meridional",
        "kind": "local"
      },
      {
        "label": "Sesotho",
        "kind": "native"
      },
      {
        "label": "南索托语",
        "kind": "alias"
      },
      {
        "label": "Southern Sotho",
        "kind": "alias"
      },
      {
        "label": "sotho du Sud",
        "kind": "alias"
      },
      {
        "label": "Süd-Sotho",
        "kind": "alias"
      }
    ],
    "hat": [
      {
        "label": "criollo haitiano",
        "kind": "local"
      },
      {
        "label": "Haitian Creole",
        "kind": "english"
      },
      {
        "label": "海地克里奥尔语",
        "kind": "alias"
      },
      {
        "label": "créole haïtien",
        "kind": "alias"
      },
      {
        "label": "Haiti-Kreolisch",
        "kind": "alias"
      }
    ],
    "syc": [
      {
        "label": "siríaco clásico",
        "kind": "local"
      },
      {
        "label": "Syriac",
        "kind": "english"
      },
      {
        "label": "古典叙利亚语",
        "kind": "alias"
      },
      {
        "label": "Classical Syriac",
        "kind": "alias"
      },
      {
        "label": "syriaque classique",
        "kind": "alias"
      },
      {
        "label": "Altsyrisch",
        "kind": "alias"
      }
    ],
    "kom": [
      {
        "label": "komi",
        "kind": "local"
      },
      {
        "label": "科米语",
        "kind": "alias"
      }
    ],
    "kin": [
      {
        "label": "kinyarwanda",
        "kind": "local"
      },
      {
        "label": "Ikinyarwanda",
        "kind": "native"
      },
      {
        "label": "卢旺达语",
        "kind": "alias"
      }
    ],
    "hif": [
      {
        "label": "Fiji Hindi",
        "kind": "english"
      },
      {
        "label": "hindi fidjien",
        "kind": "alias"
      },
      {
        "label": "Fidschi-Hindi",
        "kind": "alias"
      }
    ],
    "tpi": [
      {
        "label": "tok pisin",
        "kind": "local"
      },
      {
        "label": "托克皮辛语",
        "kind": "alias"
      },
      {
        "label": "Neumelanesisch",
        "kind": "alias"
      }
    ],
    "nav": [
      {
        "label": "navajo",
        "kind": "local"
      },
      {
        "label": "纳瓦霍语",
        "kind": "alias"
      }
    ],
    "ton": [
      {
        "label": "tongano",
        "kind": "local"
      },
      {
        "label": "lea fakatonga",
        "kind": "native"
      },
      {
        "label": "Tongan",
        "kind": "english"
      },
      {
        "label": "汤加语",
        "kind": "alias"
      },
      {
        "label": "tongien",
        "kind": "alias"
      },
      {
        "label": "Tongaisch",
        "kind": "alias"
      }
    ],
    "nob": [
      {
        "label": "noruego bokmal",
        "kind": "local"
      },
      {
        "label": "norsk bokmål",
        "kind": "native"
      },
      {
        "label": "Bokmål",
        "kind": "english"
      },
      {
        "label": "书面挪威语",
        "kind": "alias"
      },
      {
        "label": "Norwegian Bokmål",
        "kind": "alias"
      },
      {
        "label": "norvégien bokmål",
        "kind": "alias"
      },
      {
        "label": "Norwegisch (Bokmål)",
        "kind": "alias"
      }
    ],
    "nno": [
      {
        "label": "noruego nynorsk",
        "kind": "local"
      },
      {
        "label": "norsk nynorsk",
        "kind": "native"
      },
      {
        "label": "Nynorsk",
        "kind": "english"
      },
      {
        "label": "挪威尼诺斯克语",
        "kind": "alias"
      },
      {
        "label": "Norwegian Nynorsk",
        "kind": "alias"
      },
      {
        "label": "norvégien nynorsk",
        "kind": "alias"
      },
      {
        "label": "Norwegisch (Nynorsk)",
        "kind": "alias"
      }
    ],
    "kok": [
      {
        "label": "konkaní",
        "kind": "local"
      },
      {
        "label": "कोंकणी",
        "kind": "native"
      },
      {
        "label": "Konkani",
        "kind": "english"
      },
      {
        "label": "孔卡尼语",
        "kind": "alias"
      }
    ],
    "mai": [
      {
        "label": "maithili",
        "kind": "local"
      },
      {
        "label": "मैथिली",
        "kind": "native"
      },
      {
        "label": "迈蒂利语",
        "kind": "alias"
      },
      {
        "label": "maïthili",
        "kind": "alias"
      }
    ],
    "mnc": [
      {
        "label": "manchú",
        "kind": "local"
      },
      {
        "label": "Manchu",
        "kind": "english"
      },
      {
        "label": "满语",
        "kind": "alias"
      },
      {
        "label": "mandchou",
        "kind": "alias"
      },
      {
        "label": "Mandschurisch",
        "kind": "alias"
      },
      {
        "label": "滿語",
        "kind": "alias"
      }
    ],
    "liv": [
      {
        "label": "Livonian",
        "kind": "english"
      },
      {
        "label": "livonien",
        "kind": "alias"
      },
      {
        "label": "Livisch",
        "kind": "alias"
      }
    ],
    "nov": [
      {
        "label": "Novial",
        "kind": "english"
      }
    ],
    "tsn": [
      {
        "label": "setsuana",
        "kind": "local"
      },
      {
        "label": "Setswana",
        "kind": "native"
      },
      {
        "label": "Tswana",
        "kind": "english"
      },
      {
        "label": "茨瓦纳语",
        "kind": "alias"
      }
    ],
    "vec": [
      {
        "label": "veneciano",
        "kind": "local"
      },
      {
        "label": "veneto",
        "kind": "native"
      },
      {
        "label": "Venetian",
        "kind": "english"
      },
      {
        "label": "威尼斯语",
        "kind": "alias"
      },
      {
        "label": "vénitien",
        "kind": "alias"
      },
      {
        "label": "Venetisch",
        "kind": "alias"
      }
    ],
    "sux": [
      {
        "label": "sumerio",
        "kind": "local"
      },
      {
        "label": "Sumerian",
        "kind": "english"
      },
      {
        "label": "苏美尔语",
        "kind": "alias"
      },
      {
        "label": "sumérien",
        "kind": "alias"
      },
      {
        "label": "Sumerisch",
        "kind": "alias"
      }
    ],
    "hsb": [
      {
        "label": "alto sorbio",
        "kind": "local"
      },
      {
        "label": "hornjoserbšćina",
        "kind": "native"
      },
      {
        "label": "Upper Sorbian",
        "kind": "english"
      },
      {
        "label": "上索布语",
        "kind": "alias"
      },
      {
        "label": "haut-sorabe",
        "kind": "alias"
      },
      {
        "label": "Obersorbisch",
        "kind": "alias"
      }
    ],
    "lim": [
      {
        "label": "limburgués",
        "kind": "local"
      },
      {
        "label": "Limburgish language",
        "kind": "english"
      },
      {
        "label": "林堡语",
        "kind": "alias"
      },
      {
        "label": "Limburgish",
        "kind": "alias"
      },
      {
        "label": "limbourgeois",
        "kind": "alias"
      },
      {
        "label": "Limburgisch",
        "kind": "alias"
      }
    ],
    "tlh": [
      {
        "label": "klingon",
        "kind": "local"
      },
      {
        "label": "克林贡语",
        "kind": "alias"
      },
      {
        "label": "Klingonisch",
        "kind": "alias"
      }
    ],
    "new": [
      {
        "label": "nevarí",
        "kind": "local"
      },
      {
        "label": "Newar",
        "kind": "english"
      },
      {
        "label": "尼瓦尔语",
        "kind": "alias"
      },
      {
        "label": "Newari",
        "kind": "alias"
      }
    ],
    "bua": [
      {
        "label": "buriato",
        "kind": "local"
      },
      {
        "label": "Buryat",
        "kind": "english"
      },
      {
        "label": "布里亚特语",
        "kind": "alias"
      },
      {
        "label": "Buriat",
        "kind": "alias"
      },
      {
        "label": "bouriate",
        "kind": "alias"
      },
      {
        "label": "Burjatisch",
        "kind": "alias"
      }
    ],
    "lld": [
      {
        "label": "Ladin",
        "kind": "english"
      }
    ],
    "sme": [
      {
        "label": "sami septentrional",
        "kind": "local"
      },
      {
        "label": "davvisámegiella",
        "kind": "native"
      },
      {
        "label": "Northern Sami",
        "kind": "english"
      },
      {
        "label": "北方萨米语",
        "kind": "alias"
      },
      {
        "label": "same du Nord",
        "kind": "alias"
      },
      {
        "label": "Nordsamisch",
        "kind": "alias"
      }
    ],
    "ssw": [
      {
        "label": "suazi",
        "kind": "local"
      },
      {
        "label": "Swazi",
        "kind": "english"
      },
      {
        "label": "斯瓦蒂语",
        "kind": "alias"
      },
      {
        "label": "Swati",
        "kind": "alias"
      }
    ],
    "aar": [
      {
        "label": "afar",
        "kind": "local"
      },
      {
        "label": "阿法尔语",
        "kind": "alias"
      }
    ],
    "lez": [
      {
        "label": "lezgiano",
        "kind": "local"
      },
      {
        "label": "Lezgian",
        "kind": "english"
      },
      {
        "label": "列兹金语",
        "kind": "alias"
      },
      {
        "label": "Lezghian",
        "kind": "alias"
      },
      {
        "label": "lezghien",
        "kind": "alias"
      },
      {
        "label": "Lesgisch",
        "kind": "alias"
      }
    ],
    "bho": [
      {
        "label": "bhoyapurí",
        "kind": "local"
      },
      {
        "label": "भोजपुरी",
        "kind": "native"
      },
      {
        "label": "Bhojpuri",
        "kind": "english"
      },
      {
        "label": "博杰普尔语",
        "kind": "alias"
      },
      {
        "label": "bhodjpouri",
        "kind": "alias"
      },
      {
        "label": "Bhodschpuri",
        "kind": "alias"
      }
    ],
    "kaa": [
      {
        "label": "karakalpako",
        "kind": "local"
      },
      {
        "label": "Karakalpak",
        "kind": "english"
      },
      {
        "label": "卡拉卡尔帕克语",
        "kind": "alias"
      },
      {
        "label": "Kara-Kalpak",
        "kind": "alias"
      },
      {
        "label": "Karakalpakisch",
        "kind": "alias"
      }
    ],
    "dsb": [
      {
        "label": "bajo sorbio",
        "kind": "local"
      },
      {
        "label": "dolnoserbšćina",
        "kind": "native"
      },
      {
        "label": "Lower Sorbian",
        "kind": "english"
      },
      {
        "label": "下索布语",
        "kind": "alias"
      },
      {
        "label": "bas-sorabe",
        "kind": "alias"
      },
      {
        "label": "Niedersorbisch",
        "kind": "alias"
      }
    ],
    "mni": [
      {
        "label": "manipurí",
        "kind": "local"
      },
      {
        "label": "মৈতৈলোন্",
        "kind": "native"
      },
      {
        "label": "Meitei",
        "kind": "english"
      },
      {
        "label": "曼尼普尔语",
        "kind": "alias"
      },
      {
        "label": "Manipuri",
        "kind": "alias"
      },
      {
        "label": "Meithei",
        "kind": "alias"
      }
    ],
    "rup": [
      {
        "label": "arrumano",
        "kind": "local"
      },
      {
        "label": "Aromanian",
        "kind": "english"
      },
      {
        "label": "阿罗马尼亚语",
        "kind": "alias"
      },
      {
        "label": "aroumain",
        "kind": "alias"
      },
      {
        "label": "Aromunisch",
        "kind": "alias"
      }
    ],
    "iku": [
      {
        "label": "inuktitut",
        "kind": "local"
      },
      {
        "label": "因纽特语",
        "kind": "alias"
      }
    ],
    "nau": [
      {
        "label": "nauruano",
        "kind": "local"
      },
      {
        "label": "Nauruan",
        "kind": "english"
      },
      {
        "label": "瑙鲁语",
        "kind": "alias"
      },
      {
        "label": "Nauru",
        "kind": "alias"
      },
      {
        "label": "Nauruisch",
        "kind": "alias"
      }
    ],
    "pap": [
      {
        "label": "papiamento",
        "kind": "local"
      },
      {
        "label": "帕皮阿门托语",
        "kind": "alias"
      }
    ],
    "bar": [
      {
        "label": "Bavarian",
        "kind": "english"
      },
      {
        "label": "bavarois",
        "kind": "alias"
      },
      {
        "label": "Bairisch",
        "kind": "alias"
      }
    ],
    "run": [
      {
        "label": "kirundi",
        "kind": "local"
      },
      {
        "label": "Ikirundi",
        "kind": "native"
      },
      {
        "label": "隆迪语",
        "kind": "alias"
      },
      {
        "label": "Rundi",
        "kind": "alias"
      },
      {
        "label": "roundi",
        "kind": "alias"
      }
    ],
    "krc": [
      {
        "label": "karachay-balkar",
        "kind": "local"
      },
      {
        "label": "卡拉恰伊巴尔卡尔语",
        "kind": "alias"
      },
      {
        "label": "karatchaï balkar",
        "kind": "alias"
      },
      {
        "label": "Karatschaiisch-Balkarisch",
        "kind": "alias"
      }
    ],
    "tet": [
      {
        "label": "tetún",
        "kind": "local"
      },
      {
        "label": "Tetum",
        "kind": "english"
      },
      {
        "label": "德顿语",
        "kind": "alias"
      },
      {
        "label": "tétoum",
        "kind": "alias"
      }
    ],
    "vep": [
      {
        "label": "Veps",
        "kind": "english"
      },
      {
        "label": "维普森语",
        "kind": "alias"
      },
      {
        "label": "vepse",
        "kind": "alias"
      },
      {
        "label": "Wepsisch",
        "kind": "alias"
      }
    ],
    "non": [
      {
        "label": "nórdico antiguo",
        "kind": "local"
      },
      {
        "label": "Old Norse",
        "kind": "english"
      },
      {
        "label": "古诺尔斯语",
        "kind": "alias"
      },
      {
        "label": "vieux norrois",
        "kind": "alias"
      },
      {
        "label": "Altnordisch",
        "kind": "alias"
      }
    ],
    "nya": [
      {
        "label": "nyanja",
        "kind": "local"
      },
      {
        "label": "Chewa",
        "kind": "english"
      },
      {
        "label": "齐切瓦语",
        "kind": "alias"
      }
    ],
    "chr": [
      {
        "label": "cheroqui",
        "kind": "local"
      },
      {
        "label": "ᏣᎳᎩ",
        "kind": "native"
      },
      {
        "label": "Cherokee",
        "kind": "english"
      },
      {
        "label": "切罗基语",
        "kind": "alias"
      }
    ],
    "wuu": [
      {
        "label": "chino wu",
        "kind": "local"
      },
      {
        "label": "吴语",
        "kind": "native"
      },
      {
        "label": "Wu Chinese",
        "kind": "english"
      },
      {
        "label": "chinois wu",
        "kind": "alias"
      },
      {
        "label": "Wu-Chinesisch",
        "kind": "alias"
      },
      {
        "label": "shanghainese",
        "kind": "alias"
      },
      {
        "label": "上海话",
        "kind": "alias"
      },
      {
        "label": "上海话方言",
        "kind": "alias"
      }
    ],
    "bam": [
      {
        "label": "bambara",
        "kind": "local"
      },
      {
        "label": "bamanakan",
        "kind": "native"
      },
      {
        "label": "班巴拉语",
        "kind": "alias"
      }
    ],
    "ful": [
      {
        "label": "fula",
        "kind": "local"
      },
      {
        "label": "Pulaar",
        "kind": "native"
      },
      {
        "label": "富拉语",
        "kind": "alias"
      },
      {
        "label": "peul",
        "kind": "alias"
      },
      {
        "label": "Ful",
        "kind": "alias"
      }
    ],
    "inh": [
      {
        "label": "ingush",
        "kind": "local"
      },
      {
        "label": "印古什语",
        "kind": "alias"
      },
      {
        "label": "ingouche",
        "kind": "alias"
      },
      {
        "label": "Inguschisch",
        "kind": "alias"
      }
    ],
    "orm": [
      {
        "label": "oromo",
        "kind": "local"
      },
      {
        "label": "Oromoo",
        "kind": "native"
      },
      {
        "label": "奥罗莫语",
        "kind": "alias"
      }
    ],
    "ban": [
      {
        "label": "balinés",
        "kind": "local"
      },
      {
        "label": "Balinese",
        "kind": "english"
      },
      {
        "label": "巴厘语",
        "kind": "alias"
      },
      {
        "label": "balinais",
        "kind": "alias"
      },
      {
        "label": "Balinesisch",
        "kind": "alias"
      }
    ],
    "fij": [
      {
        "label": "fiyiano",
        "kind": "local"
      },
      {
        "label": "Fijian",
        "kind": "english"
      },
      {
        "label": "斐济语",
        "kind": "alias"
      },
      {
        "label": "fidjien",
        "kind": "alias"
      },
      {
        "label": "Fidschi",
        "kind": "alias"
      }
    ],
    "chm": [
      {
        "label": "marí",
        "kind": "local"
      },
      {
        "label": "Mari",
        "kind": "english"
      },
      {
        "label": "马里语",
        "kind": "alias"
      }
    ],
    "mdf": [
      {
        "label": "moksha",
        "kind": "local"
      },
      {
        "label": "莫克沙语",
        "kind": "alias"
      },
      {
        "label": "mokcha",
        "kind": "alias"
      },
      {
        "label": "Mokschanisch",
        "kind": "alias"
      }
    ],
    "sna": [
      {
        "label": "shona",
        "kind": "local"
      },
      {
        "label": "chiShona",
        "kind": "native"
      },
      {
        "label": "绍纳语",
        "kind": "alias"
      }
    ],
    "lij": [
      {
        "label": "ligur",
        "kind": "local"
      },
      {
        "label": "ligure",
        "kind": "native"
      },
      {
        "label": "Ligurian",
        "kind": "english"
      },
      {
        "label": "利古里亚语",
        "kind": "alias"
      },
      {
        "label": "Ligurisch",
        "kind": "alias"
      }
    ],
    "min": [
      {
        "label": "minangkabau",
        "kind": "local"
      },
      {
        "label": "米南佳保语",
        "kind": "alias"
      }
    ],
    "sat": [
      {
        "label": "santali",
        "kind": "local"
      },
      {
        "label": "ᱥᱟᱱᱛᱟᱲᱤ",
        "kind": "native"
      },
      {
        "label": "桑塔利语",
        "kind": "alias"
      }
    ],
    "abq": [
      {
        "label": "Abaza",
        "kind": "english"
      }
    ],
    "ewe": [
      {
        "label": "ewé",
        "kind": "local"
      },
      {
        "label": "eʋegbe",
        "kind": "native"
      },
      {
        "label": "Ewe",
        "kind": "english"
      },
      {
        "label": "埃维语",
        "kind": "alias"
      },
      {
        "label": "éwé",
        "kind": "alias"
      }
    ],
    "bis": [
      {
        "label": "bislama",
        "kind": "local"
      },
      {
        "label": "比斯拉马语",
        "kind": "alias"
      },
      {
        "label": "bichelamar",
        "kind": "alias"
      }
    ],
    "kbd": [
      {
        "label": "kabardiano",
        "kind": "local"
      },
      {
        "label": "Kabardian",
        "kind": "english"
      },
      {
        "label": "卡巴尔德语",
        "kind": "alias"
      },
      {
        "label": "kabarde",
        "kind": "alias"
      },
      {
        "label": "Kabardinisch",
        "kind": "alias"
      }
    ],
    "nrf": [
      {
        "label": "Norman",
        "kind": "english"
      }
    ],
    "fry": [
      {
        "label": "frisón occidental",
        "kind": "local"
      },
      {
        "label": "Frysk",
        "kind": "native"
      },
      {
        "label": "West Frisian",
        "kind": "english"
      },
      {
        "label": "西弗里西亚语",
        "kind": "alias"
      },
      {
        "label": "Western Frisian",
        "kind": "alias"
      },
      {
        "label": "frison occidental",
        "kind": "alias"
      },
      {
        "label": "Westfriesisch",
        "kind": "alias"
      }
    ],
    "arz": [
      {
        "label": "Egyptian Arabic",
        "kind": "english"
      },
      {
        "label": "arabe égyptien",
        "kind": "alias"
      },
      {
        "label": "Ägyptisches Arabisch",
        "kind": "alias"
      }
    ],
    "vro": [
      {
        "label": "Võro",
        "kind": "english"
      }
    ],
    "ilo": [
      {
        "label": "ilocano",
        "kind": "local"
      },
      {
        "label": "伊洛卡诺语",
        "kind": "alias"
      },
      {
        "label": "Iloko",
        "kind": "alias"
      },
      {
        "label": "Ilokano",
        "kind": "alias"
      }
    ],
    "lin": [
      {
        "label": "lingala",
        "kind": "local"
      },
      {
        "label": "lingála",
        "kind": "native"
      },
      {
        "label": "林加拉语",
        "kind": "alias"
      }
    ],
    "jbo": [
      {
        "label": "lojban",
        "kind": "local"
      },
      {
        "label": "逻辑语",
        "kind": "alias"
      }
    ],
    "mwl": [
      {
        "label": "mirandés",
        "kind": "local"
      },
      {
        "label": "Mirandese",
        "kind": "english"
      },
      {
        "label": "米兰德斯语",
        "kind": "alias"
      },
      {
        "label": "mirandais",
        "kind": "alias"
      },
      {
        "label": "Mirandesisch",
        "kind": "alias"
      }
    ],
    "frp": [
      {
        "label": "Arpitan language",
        "kind": "english"
      },
      {
        "label": "Arpitan",
        "kind": "alias"
      },
      {
        "label": "francoprovençal",
        "kind": "alias"
      },
      {
        "label": "Frankoprovenzalisch",
        "kind": "alias"
      }
    ],
    "tso": [
      {
        "label": "tsonga",
        "kind": "local"
      },
      {
        "label": "聪加语",
        "kind": "alias"
      }
    ],
    "xal": [
      {
        "label": "kalmyk",
        "kind": "local"
      },
      {
        "label": "卡尔梅克语",
        "kind": "alias"
      },
      {
        "label": "kalmouk",
        "kind": "alias"
      },
      {
        "label": "Kalmückisch",
        "kind": "alias"
      }
    ],
    "ett": [
      {
        "label": "Etruscan",
        "kind": "english"
      }
    ],
    "tah": [
      {
        "label": "tahitiano",
        "kind": "local"
      },
      {
        "label": "Tahitian",
        "kind": "english"
      },
      {
        "label": "塔希提语",
        "kind": "alias"
      },
      {
        "label": "tahitien",
        "kind": "alias"
      },
      {
        "label": "Tahitisch",
        "kind": "alias"
      }
    ],
    "ven": [
      {
        "label": "venda",
        "kind": "local"
      },
      {
        "label": "文达语",
        "kind": "alias"
      }
    ],
    "tcy": [
      {
        "label": "Tulu",
        "kind": "english"
      },
      {
        "label": "toulou",
        "kind": "alias"
      }
    ],
    "cha": [
      {
        "label": "chamorro",
        "kind": "local"
      },
      {
        "label": "查莫罗语",
        "kind": "alias"
      }
    ],
    "hak": [
      {
        "label": "chino hakka",
        "kind": "local"
      },
      {
        "label": "客家話",
        "kind": "native"
      },
      {
        "label": "Hakka Chinese",
        "kind": "english"
      },
      {
        "label": "客家话",
        "kind": "alias"
      },
      {
        "label": "hakka",
        "kind": "alias"
      },
      {
        "label": "客家语",
        "kind": "alias"
      }
    ],
    "kjh": [
      {
        "label": "Khakas",
        "kind": "english"
      }
    ],
    "ace": [
      {
        "label": "achenés",
        "kind": "local"
      },
      {
        "label": "Acehnese",
        "kind": "english"
      },
      {
        "label": "亚齐语",
        "kind": "alias"
      },
      {
        "label": "aceh",
        "kind": "alias"
      }
    ],
    "gsw": [
      {
        "label": "alemán suizo",
        "kind": "local"
      },
      {
        "label": "Schwiizertüütsch",
        "kind": "native"
      },
      {
        "label": "Swiss German",
        "kind": "english"
      },
      {
        "label": "瑞士德语",
        "kind": "alias"
      },
      {
        "label": "suisse allemand",
        "kind": "alias"
      },
      {
        "label": "Schweizerdeutsch",
        "kind": "alias"
      },
      {
        "label": "alemannic",
        "kind": "alias"
      },
      {
        "label": "alsatian",
        "kind": "alias"
      }
    ],
    "war": [
      {
        "label": "waray",
        "kind": "local"
      },
      {
        "label": "瓦瑞语",
        "kind": "alias"
      }
    ],
    "hit": [
      {
        "label": "hitita",
        "kind": "local"
      },
      {
        "label": "Hittite",
        "kind": "english"
      },
      {
        "label": "赫梯语",
        "kind": "alias"
      },
      {
        "label": "Hethitisch",
        "kind": "alias"
      }
    ],
    "mns": [
      {
        "label": "Mansi",
        "kind": "english"
      }
    ],
    "pcd": [
      {
        "label": "Picard",
        "kind": "english"
      },
      {
        "label": "Picardisch",
        "kind": "alias"
      }
    ],
    "gez": [
      {
        "label": "geez",
        "kind": "local"
      },
      {
        "label": "Ge'ez",
        "kind": "english"
      },
      {
        "label": "吉兹语",
        "kind": "alias"
      },
      {
        "label": "guèze",
        "kind": "alias"
      }
    ],
    "brx": [
      {
        "label": "bodo",
        "kind": "local"
      },
      {
        "label": "बर’",
        "kind": "native"
      },
      {
        "label": "博多语",
        "kind": "alias"
      }
    ],
    "phn": [
      {
        "label": "fenicio",
        "kind": "local"
      },
      {
        "label": "Phoenician",
        "kind": "english"
      },
      {
        "label": "腓尼基语",
        "kind": "alias"
      },
      {
        "label": "phénicien",
        "kind": "alias"
      },
      {
        "label": "Phönizisch",
        "kind": "alias"
      }
    ],
    "mah": [
      {
        "label": "marshalés",
        "kind": "local"
      },
      {
        "label": "Marshallese",
        "kind": "english"
      },
      {
        "label": "马绍尔语",
        "kind": "alias"
      },
      {
        "label": "marshallais",
        "kind": "alias"
      },
      {
        "label": "Marschallesisch",
        "kind": "alias"
      }
    ],
    "kca": [
      {
        "label": "Khanty",
        "kind": "english"
      }
    ],
    "dgo": [
      {
        "label": "dogri",
        "kind": "local"
      },
      {
        "label": "डोगरी",
        "kind": "native"
      },
      {
        "label": "多格拉语",
        "kind": "alias"
      }
    ],
    "brh": [
      {
        "label": "Brahui",
        "kind": "english"
      },
      {
        "label": "brahoui",
        "kind": "alias"
      }
    ],
    "nog": [
      {
        "label": "nogai",
        "kind": "local"
      },
      {
        "label": "诺盖语",
        "kind": "alias"
      },
      {
        "label": "nogaï",
        "kind": "alias"
      }
    ],
    "ckt": [
      {
        "label": "Chukchi",
        "kind": "english"
      }
    ],
    "lbe": [
      {
        "label": "Lak",
        "kind": "english"
      }
    ],
    "mzn": [
      {
        "label": "mazandaraní",
        "kind": "local"
      },
      {
        "label": "مازرونی",
        "kind": "native"
      },
      {
        "label": "Mazanderani",
        "kind": "english"
      },
      {
        "label": "马赞德兰语",
        "kind": "alias"
      },
      {
        "label": "mazandérani",
        "kind": "alias"
      },
      {
        "label": "Masanderanisch",
        "kind": "alias"
      }
    ],
    "gil": [
      {
        "label": "gilbertés",
        "kind": "local"
      },
      {
        "label": "Gilbertese",
        "kind": "english"
      },
      {
        "label": "吉尔伯特语",
        "kind": "alias"
      },
      {
        "label": "gilbertin",
        "kind": "alias"
      },
      {
        "label": "Kiribatisch",
        "kind": "alias"
      }
    ],
    "bug": [
      {
        "label": "buginés",
        "kind": "local"
      },
      {
        "label": "Bugis",
        "kind": "english"
      },
      {
        "label": "布吉语",
        "kind": "alias"
      },
      {
        "label": "Buginese",
        "kind": "alias"
      },
      {
        "label": "bugi",
        "kind": "alias"
      },
      {
        "label": "Buginesisch",
        "kind": "alias"
      }
    ],
    "izh": [
      {
        "label": "Ingrian",
        "kind": "english"
      },
      {
        "label": "ingrien",
        "kind": "alias"
      },
      {
        "label": "Ischorisch",
        "kind": "alias"
      }
    ],
    "kon": [
      {
        "label": "kongo",
        "kind": "local"
      },
      {
        "label": "刚果语",
        "kind": "alias"
      },
      {
        "label": "kikongo",
        "kind": "alias"
      },
      {
        "label": "Kongolesisch",
        "kind": "alias"
      }
    ],
    "ell": [
      {
        "label": "griego",
        "kind": "local"
      },
      {
        "label": "Ελληνικά",
        "kind": "native"
      },
      {
        "label": "Modern Greek",
        "kind": "english"
      },
      {
        "label": "希腊语",
        "kind": "alias"
      },
      {
        "label": "Greek",
        "kind": "alias"
      },
      {
        "label": "grec",
        "kind": "alias"
      },
      {
        "label": "Griechisch",
        "kind": "alias"
      }
    ],
    "chg": [
      {
        "label": "chagatái",
        "kind": "local"
      },
      {
        "label": "Chagatai",
        "kind": "english"
      },
      {
        "label": "察合台语",
        "kind": "alias"
      },
      {
        "label": "tchaghataï",
        "kind": "alias"
      },
      {
        "label": "Tschagataisch",
        "kind": "alias"
      }
    ],
    "pdc": [
      {
        "label": "Pennsylvania German",
        "kind": "english"
      },
      {
        "label": "pennsilfaanisch",
        "kind": "alias"
      },
      {
        "label": "Pennsylvaniadeutsch",
        "kind": "alias"
      }
    ],
    "aka": [
      {
        "label": "akan",
        "kind": "local"
      },
      {
        "label": "阿肯语",
        "kind": "alias"
      }
    ],
    "kum": [
      {
        "label": "kumyk",
        "kind": "local"
      },
      {
        "label": "库梅克语",
        "kind": "alias"
      },
      {
        "label": "koumyk",
        "kind": "alias"
      },
      {
        "label": "Kumükisch",
        "kind": "alias"
      }
    ],
    "hmo": [
      {
        "label": "hiri motu",
        "kind": "local"
      },
      {
        "label": "希里莫图语",
        "kind": "alias"
      },
      {
        "label": "Hiri-Motu",
        "kind": "alias"
      }
    ],
    "ale": [
      {
        "label": "aleutiano",
        "kind": "local"
      },
      {
        "label": "Aleut",
        "kind": "english"
      },
      {
        "label": "阿留申语",
        "kind": "alias"
      },
      {
        "label": "aléoute",
        "kind": "alias"
      },
      {
        "label": "Aleutisch",
        "kind": "alias"
      }
    ],
    "awa": [
      {
        "label": "avadhi",
        "kind": "local"
      },
      {
        "label": "Awadhi",
        "kind": "english"
      },
      {
        "label": "阿瓦德语",
        "kind": "alias"
      }
    ],
    "dlm": [
      {
        "label": "Dalmatian",
        "kind": "english"
      }
    ],
    "her": [
      {
        "label": "herero",
        "kind": "local"
      },
      {
        "label": "赫雷罗语",
        "kind": "alias"
      },
      {
        "label": "héréro",
        "kind": "alias"
      }
    ],
    "enm": [
      {
        "label": "inglés medio",
        "kind": "local"
      },
      {
        "label": "Middle English",
        "kind": "english"
      },
      {
        "label": "中古英语",
        "kind": "alias"
      },
      {
        "label": "moyen anglais",
        "kind": "alias"
      },
      {
        "label": "Mittelenglisch",
        "kind": "alias"
      }
    ],
    "prg": [
      {
        "label": "prusiano",
        "kind": "local"
      },
      {
        "label": "prūsiskan",
        "kind": "native"
      },
      {
        "label": "Old Prussian",
        "kind": "english"
      },
      {
        "label": "普鲁士语",
        "kind": "alias"
      },
      {
        "label": "Prussian",
        "kind": "alias"
      },
      {
        "label": "prussien",
        "kind": "alias"
      },
      {
        "label": "Altpreußisch",
        "kind": "alias"
      }
    ],
    "yrk": [
      {
        "label": "Nenets",
        "kind": "english"
      }
    ],
    "qya": [
      {
        "label": "Quenya",
        "kind": "english"
      }
    ],
    "vot": [
      {
        "label": "vótico",
        "kind": "local"
      },
      {
        "label": "Votic",
        "kind": "english"
      },
      {
        "label": "沃提克语",
        "kind": "alias"
      },
      {
        "label": "vote",
        "kind": "alias"
      },
      {
        "label": "Wotisch",
        "kind": "alias"
      }
    ],
    "pau": [
      {
        "label": "palauano",
        "kind": "local"
      },
      {
        "label": "Palauan",
        "kind": "english"
      },
      {
        "label": "帕劳语",
        "kind": "alias"
      },
      {
        "label": "palau",
        "kind": "alias"
      }
    ],
    "nan": [
      {
        "label": "minnan",
        "kind": "local"
      },
      {
        "label": "閩南語",
        "kind": "native"
      },
      {
        "label": "Southern Min",
        "kind": "english"
      },
      {
        "label": "闽南语",
        "kind": "alias"
      },
      {
        "label": "Min Nan",
        "kind": "alias"
      },
      {
        "label": "hokkien",
        "kind": "alias"
      },
      {
        "label": "taiwanese hokkien",
        "kind": "alias"
      },
      {
        "label": "台语",
        "kind": "alias"
      },
      {
        "label": "臺語",
        "kind": "alias"
      },
      {
        "label": "河洛话",
        "kind": "alias"
      },
      {
        "label": "河洛話",
        "kind": "alias"
      }
    ],
    "nso": [
      {
        "label": "sotho septentrional",
        "kind": "local"
      },
      {
        "label": "Sesotho sa Leboa",
        "kind": "native"
      },
      {
        "label": "Northern Sotho",
        "kind": "english"
      },
      {
        "label": "北索托语",
        "kind": "alias"
      },
      {
        "label": "sotho du Nord",
        "kind": "alias"
      },
      {
        "label": "Nord-Sotho",
        "kind": "alias"
      }
    ],
    "sag": [
      {
        "label": "sango",
        "kind": "local"
      },
      {
        "label": "Sängö",
        "kind": "native"
      },
      {
        "label": "桑戈语",
        "kind": "alias"
      }
    ],
    "stq": [
      {
        "label": "Saterland Frisian",
        "kind": "english"
      },
      {
        "label": "saterlandais",
        "kind": "alias"
      },
      {
        "label": "Saterfriesisch",
        "kind": "alias"
      }
    ],
    "yue": [
      {
        "label": "cantonés",
        "kind": "local"
      },
      {
        "label": "粵語",
        "kind": "native"
      },
      {
        "label": "Cantonese",
        "kind": "english"
      },
      {
        "label": "粤语",
        "kind": "alias"
      },
      {
        "label": "cantonais",
        "kind": "alias"
      },
      {
        "label": "Kantonesisch",
        "kind": "alias"
      },
      {
        "label": "cantonese chinese",
        "kind": "alias"
      },
      {
        "label": "guangdonghua",
        "kind": "alias"
      },
      {
        "label": "广东话",
        "kind": "alias"
      },
      {
        "label": "廣東話",
        "kind": "alias"
      },
      {
        "label": "白话",
        "kind": "alias"
      },
      {
        "label": "白話",
        "kind": "alias"
      }
    ],
    "xmf": [
      {
        "label": "Mingrelian",
        "kind": "english"
      },
      {
        "label": "mingrélien",
        "kind": "alias"
      },
      {
        "label": "Mingrelisch",
        "kind": "alias"
      }
    ],
    "bjn": [
      {
        "label": "Banjar",
        "kind": "english"
      },
      {
        "label": "Banjaresisch",
        "kind": "alias"
      }
    ],
    "ase": [
      {
        "label": "American Sign Language",
        "kind": "english"
      },
      {
        "label": "langue des signes américaine",
        "kind": "alias"
      },
      {
        "label": "Amerikanische Gebärdensprache",
        "kind": "alias"
      }
    ],
    "kau": [
      {
        "label": "kanuri",
        "kind": "local"
      },
      {
        "label": "卡努里语",
        "kind": "alias"
      },
      {
        "label": "kanouri",
        "kind": "alias"
      }
    ],
    "nrn": [
      {
        "label": "Norn",
        "kind": "english"
      }
    ],
    "frr": [
      {
        "label": "frisón septentrional",
        "kind": "local"
      },
      {
        "label": "North Frisian",
        "kind": "english"
      },
      {
        "label": "北弗里西亚语",
        "kind": "alias"
      },
      {
        "label": "Northern Frisian",
        "kind": "alias"
      },
      {
        "label": "frison septentrional",
        "kind": "alias"
      },
      {
        "label": "Nordfriesisch",
        "kind": "alias"
      }
    ],
    "lug": [
      {
        "label": "ganda",
        "kind": "local"
      },
      {
        "label": "Luganda",
        "kind": "native"
      },
      {
        "label": "卢干达语",
        "kind": "alias"
      }
    ],
    "cre": [
      {
        "label": "cree",
        "kind": "local"
      },
      {
        "label": "克里语",
        "kind": "alias"
      }
    ],
    "gan": [
      {
        "label": "chino gan",
        "kind": "local"
      },
      {
        "label": "Gan Chinese",
        "kind": "english"
      },
      {
        "label": "赣语",
        "kind": "alias"
      },
      {
        "label": "gan",
        "kind": "alias"
      },
      {
        "label": "贛語",
        "kind": "alias"
      }
    ],
    "kik": [
      {
        "label": "kikuyu",
        "kind": "local"
      },
      {
        "label": "Gikuyu",
        "kind": "native"
      },
      {
        "label": "吉库尤语",
        "kind": "alias"
      }
    ],
    "mag": [
      {
        "label": "magahi",
        "kind": "local"
      },
      {
        "label": "摩揭陀语",
        "kind": "alias"
      },
      {
        "label": "Khotta",
        "kind": "alias"
      }
    ],
    "pox": [
      {
        "label": "Polabian",
        "kind": "english"
      }
    ],
    "zha": [
      {
        "label": "zhuang",
        "kind": "local"
      },
      {
        "label": "Vahcuengh",
        "kind": "native"
      },
      {
        "label": "壮语",
        "kind": "alias"
      },
      {
        "label": "壮文",
        "kind": "alias"
      },
      {
        "label": "壯語",
        "kind": "alias"
      }
    ],
    "bsk": [
      {
        "label": "Burushaski",
        "kind": "english"
      }
    ],
    "sva": [
      {
        "label": "Svan",
        "kind": "english"
      }
    ],
    "fro": [
      {
        "label": "francés antiguo",
        "kind": "local"
      },
      {
        "label": "Old French",
        "kind": "english"
      },
      {
        "label": "古法语",
        "kind": "alias"
      },
      {
        "label": "ancien français",
        "kind": "alias"
      },
      {
        "label": "Altfranzösisch",
        "kind": "alias"
      }
    ],
    "nbl": [
      {
        "label": "ndebele meridional",
        "kind": "local"
      },
      {
        "label": "Southern Ndebele",
        "kind": "english"
      },
      {
        "label": "南恩德贝勒语",
        "kind": "alias"
      },
      {
        "label": "South Ndebele",
        "kind": "alias"
      },
      {
        "label": "ndébélé du Sud",
        "kind": "alias"
      },
      {
        "label": "Süd-Ndebele",
        "kind": "alias"
      }
    ],
    "lzz": [
      {
        "label": "Laz",
        "kind": "english"
      },
      {
        "label": "laze",
        "kind": "alias"
      },
      {
        "label": "Lasisch",
        "kind": "alias"
      }
    ],
    "tvl": [
      {
        "label": "tuvaluano",
        "kind": "local"
      },
      {
        "label": "Tuvaluan",
        "kind": "english"
      },
      {
        "label": "图瓦卢语",
        "kind": "alias"
      },
      {
        "label": "Tuvalu",
        "kind": "alias"
      },
      {
        "label": "Tuvaluisch",
        "kind": "alias"
      }
    ],
    "elx": [
      {
        "label": "elamita",
        "kind": "local"
      },
      {
        "label": "Elamite",
        "kind": "english"
      },
      {
        "label": "埃兰语",
        "kind": "alias"
      },
      {
        "label": "élamite",
        "kind": "alias"
      },
      {
        "label": "Elamisch",
        "kind": "alias"
      }
    ],
    "koi": [
      {
        "label": "komi permio",
        "kind": "local"
      },
      {
        "label": "Komi-Permyak",
        "kind": "english"
      },
      {
        "label": "科米-彼尔米亚克语",
        "kind": "alias"
      },
      {
        "label": "komi-permiak",
        "kind": "alias"
      },
      {
        "label": "Komi-Permjakisch",
        "kind": "alias"
      }
    ],
    "sgs": [
      {
        "label": "Samogitian",
        "kind": "english"
      },
      {
        "label": "samogitien",
        "kind": "alias"
      },
      {
        "label": "Samogitisch",
        "kind": "alias"
      }
    ],
    "sma": [
      {
        "label": "sami meridional",
        "kind": "local"
      },
      {
        "label": "Southern Sami",
        "kind": "english"
      },
      {
        "label": "南萨米语",
        "kind": "alias"
      },
      {
        "label": "same du Sud",
        "kind": "alias"
      },
      {
        "label": "Südsamisch",
        "kind": "alias"
      }
    ],
    "ext": [
      {
        "label": "Extremaduran",
        "kind": "english"
      },
      {
        "label": "estrémègne",
        "kind": "alias"
      },
      {
        "label": "Extremadurisch",
        "kind": "alias"
      }
    ],
    "evn": [
      {
        "label": "Evenki",
        "kind": "english"
      }
    ],
    "kab": [
      {
        "label": "cabileño",
        "kind": "local"
      },
      {
        "label": "Taqbaylit",
        "kind": "native"
      },
      {
        "label": "Kabyle",
        "kind": "english"
      },
      {
        "label": "卡拜尔语",
        "kind": "alias"
      },
      {
        "label": "Kabylisch",
        "kind": "alias"
      }
    ],
    "rap": [
      {
        "label": "rapanui",
        "kind": "local"
      },
      {
        "label": "Rapa Nui",
        "kind": "english"
      },
      {
        "label": "拉帕努伊语",
        "kind": "alias"
      }
    ],
    "rut": [
      {
        "label": "Rutulian",
        "kind": "english"
      }
    ],
    "lzh": [
      {
        "label": "Classical Chinese",
        "kind": "english"
      },
      {
        "label": "Literary Chinese",
        "kind": "alias"
      },
      {
        "label": "chinois littéraire",
        "kind": "alias"
      },
      {
        "label": "Klassisches Chinesisch",
        "kind": "alias"
      }
    ],
    "raj": [
      {
        "label": "rajasthani",
        "kind": "local"
      },
      {
        "label": "राजस्थानी",
        "kind": "native"
      },
      {
        "label": "拉贾斯坦语",
        "kind": "alias"
      }
    ],
    "srn": [
      {
        "label": "sranan tongo",
        "kind": "local"
      },
      {
        "label": "苏里南汤加语",
        "kind": "alias"
      },
      {
        "label": "Srananisch",
        "kind": "alias"
      }
    ],
    "niu": [
      {
        "label": "niueano",
        "kind": "local"
      },
      {
        "label": "Niuean",
        "kind": "english"
      },
      {
        "label": "纽埃语",
        "kind": "alias"
      },
      {
        "label": "niuéen",
        "kind": "alias"
      },
      {
        "label": "Niue",
        "kind": "alias"
      }
    ],
    "smn": [
      {
        "label": "sami inari",
        "kind": "local"
      },
      {
        "label": "anarâškielâ",
        "kind": "native"
      },
      {
        "label": "Inari Sami",
        "kind": "english"
      },
      {
        "label": "伊纳里萨米语",
        "kind": "alias"
      },
      {
        "label": "same d’Inari",
        "kind": "alias"
      },
      {
        "label": "Inari-Samisch",
        "kind": "alias"
      }
    ],
    "glk": [
      {
        "label": "Gilaki",
        "kind": "english"
      }
    ],
    "peo": [
      {
        "label": "persa antiguo",
        "kind": "local"
      },
      {
        "label": "Old Persian",
        "kind": "english"
      },
      {
        "label": "古波斯语",
        "kind": "alias"
      },
      {
        "label": "persan ancien",
        "kind": "alias"
      },
      {
        "label": "Altpersisch",
        "kind": "alias"
      }
    ],
    "ryu": [
      {
        "label": "Okinawan",
        "kind": "english"
      }
    ],
    "tly": [
      {
        "label": "Talysh",
        "kind": "english"
      },
      {
        "label": "Talisch",
        "kind": "alias"
      }
    ],
    "chu": [
      {
        "label": "eslavo eclesiástico",
        "kind": "local"
      },
      {
        "label": "Church Slavonic",
        "kind": "english"
      },
      {
        "label": "教会斯拉夫语",
        "kind": "alias"
      },
      {
        "label": "Church Slavic",
        "kind": "alias"
      },
      {
        "label": "slavon d’église",
        "kind": "alias"
      },
      {
        "label": "Kirchenslawisch",
        "kind": "alias"
      }
    ],
    "orv": [
      {
        "label": "Old East Slavic",
        "kind": "english"
      }
    ],
    "fon": [
      {
        "label": "fon",
        "kind": "local"
      },
      {
        "label": "丰语",
        "kind": "alias"
      }
    ],
    "pam": [
      {
        "label": "pampanga",
        "kind": "local"
      },
      {
        "label": "Kapampangan",
        "kind": "english"
      },
      {
        "label": "邦板牙语",
        "kind": "alias"
      },
      {
        "label": "pampangan",
        "kind": "alias"
      },
      {
        "label": "Pampanggan",
        "kind": "alias"
      }
    ],
    "mad": [
      {
        "label": "madurés",
        "kind": "local"
      },
      {
        "label": "Madurese",
        "kind": "english"
      },
      {
        "label": "马都拉语",
        "kind": "alias"
      },
      {
        "label": "madurais",
        "kind": "alias"
      },
      {
        "label": "Maduresisch",
        "kind": "alias"
      }
    ],
    "fit": [
      {
        "label": "Meänkieli",
        "kind": "english"
      },
      {
        "label": "Tornedalen Finnish",
        "kind": "alias"
      },
      {
        "label": "finnois tornédalien",
        "kind": "alias"
      }
    ],
    "pal": [
      {
        "label": "pahlavi",
        "kind": "local"
      },
      {
        "label": "Middle Persian",
        "kind": "english"
      },
      {
        "label": "巴拉维语",
        "kind": "alias"
      },
      {
        "label": "Mittelpersisch",
        "kind": "alias"
      }
    ],
    "hne": [
      {
        "label": "Chhattisgarhi",
        "kind": "english"
      }
    ],
    "ckb": [
      {
        "label": "kurdo sorani",
        "kind": "local"
      },
      {
        "label": "کوردیی ناوەندی",
        "kind": "native"
      },
      {
        "label": "Central Kurdish",
        "kind": "english"
      },
      {
        "label": "中库尔德语",
        "kind": "alias"
      },
      {
        "label": "sorani",
        "kind": "alias"
      },
      {
        "label": "Zentralkurdisch",
        "kind": "alias"
      }
    ],
    "bpy": [
      {
        "label": "Bishnupriya Manipuri",
        "kind": "english"
      },
      {
        "label": "Bishnupriya",
        "kind": "alias"
      }
    ],
    "sog": [
      {
        "label": "sogdiano",
        "kind": "local"
      },
      {
        "label": "Sogdian",
        "kind": "english"
      },
      {
        "label": "粟特语",
        "kind": "alias"
      },
      {
        "label": "Sogdien",
        "kind": "alias"
      },
      {
        "label": "Sogdisch",
        "kind": "alias"
      }
    ],
    "ipk": [
      {
        "label": "inupiaq",
        "kind": "local"
      },
      {
        "label": "Iñupiaq",
        "kind": "english"
      },
      {
        "label": "伊努皮克语",
        "kind": "alias"
      },
      {
        "label": "Inupiak",
        "kind": "alias"
      }
    ],
    "mwr": [
      {
        "label": "marwari",
        "kind": "local"
      },
      {
        "label": "马尔瓦里语",
        "kind": "alias"
      },
      {
        "label": "marwarî",
        "kind": "alias"
      }
    ],
    "uga": [
      {
        "label": "ugarítico",
        "kind": "local"
      },
      {
        "label": "Ugaritic",
        "kind": "english"
      },
      {
        "label": "乌加里特语",
        "kind": "alias"
      },
      {
        "label": "ougaritique",
        "kind": "alias"
      },
      {
        "label": "Ugaritisch",
        "kind": "alias"
      }
    ],
    "fkv": [
      {
        "label": "Kven",
        "kind": "english"
      }
    ],
    "tab": [
      {
        "label": "Tabasaran",
        "kind": "english"
      }
    ],
    "jam": [
      {
        "label": "Jamaican Patois",
        "kind": "english"
      },
      {
        "label": "Jamaican Creole English",
        "kind": "alias"
      },
      {
        "label": "créole jamaïcain",
        "kind": "alias"
      },
      {
        "label": "Jamaikanisch-Kreolisch",
        "kind": "alias"
      }
    ],
    "bgc": [
      {
        "label": "haryanvi",
        "kind": "local"
      },
      {
        "label": "हरियाणवी",
        "kind": "native"
      },
      {
        "label": "哈里亚纳语",
        "kind": "alias"
      }
    ],
    "nio": [
      {
        "label": "Nganasan",
        "kind": "english"
      }
    ],
    "mnw": [
      {
        "label": "Mon",
        "kind": "english"
      }
    ],
    "skr": [
      {
        "label": "Saraiki",
        "kind": "english"
      },
      {
        "label": "色莱基语",
        "kind": "alias"
      }
    ],
    "tkl": [
      {
        "label": "tokelauano",
        "kind": "local"
      },
      {
        "label": "Tokelauan",
        "kind": "english"
      },
      {
        "label": "托克劳语",
        "kind": "alias"
      },
      {
        "label": "tokelau",
        "kind": "alias"
      },
      {
        "label": "Tokelauanisch",
        "kind": "alias"
      }
    ],
    "dng": [
      {
        "label": "Dungan",
        "kind": "english"
      }
    ],
    "kmr": [
      {
        "label": "kurdo",
        "kind": "local"
      },
      {
        "label": "kurdî (kurmancî)",
        "kind": "native"
      },
      {
        "label": "Northern Kurdish",
        "kind": "english"
      },
      {
        "label": "库尔曼吉语",
        "kind": "alias"
      },
      {
        "label": "kurde",
        "kind": "alias"
      },
      {
        "label": "Kurdisch",
        "kind": "alias"
      },
      {
        "label": "kurmanji",
        "kind": "alias"
      }
    ],
    "osc": [
      {
        "label": "Oscan",
        "kind": "english"
      }
    ],
    "smj": [
      {
        "label": "sami lule",
        "kind": "local"
      },
      {
        "label": "Lule Sami",
        "kind": "english"
      },
      {
        "label": "吕勒萨米语",
        "kind": "alias"
      },
      {
        "label": "same de Lule",
        "kind": "alias"
      },
      {
        "label": "Lule-Samisch",
        "kind": "alias"
      }
    ],
    "cbk": [
      {
        "label": "Chavacano",
        "kind": "english"
      }
    ],
    "sel": [
      {
        "label": "selkup",
        "kind": "local"
      },
      {
        "label": "塞尔库普语",
        "kind": "alias"
      },
      {
        "label": "selkoupe",
        "kind": "alias"
      },
      {
        "label": "Selkupisch",
        "kind": "alias"
      }
    ],
    "tmh": [
      {
        "label": "tamashek",
        "kind": "local"
      },
      {
        "label": "Tuareg",
        "kind": "english"
      },
      {
        "label": "塔马奇克语",
        "kind": "alias"
      },
      {
        "label": "tamacheq",
        "kind": "alias"
      },
      {
        "label": "Tamaseq",
        "kind": "alias"
      }
    ],
    "ltg": [
      {
        "label": "Latgalian",
        "kind": "english"
      },
      {
        "label": "latgalien",
        "kind": "alias"
      },
      {
        "label": "Lettgallisch",
        "kind": "alias"
      }
    ],
    "ket": [
      {
        "label": "Ket",
        "kind": "english"
      }
    ],
    "sjd": [
      {
        "label": "Kildin Sami",
        "kind": "english"
      }
    ],
    "lab": [
      {
        "label": "Linear A",
        "kind": "english"
      }
    ],
    "hil": [
      {
        "label": "hiligaynon",
        "kind": "local"
      },
      {
        "label": "希利盖农语",
        "kind": "alias"
      }
    ],
    "shi": [
      {
        "label": "tashelhit",
        "kind": "local"
      },
      {
        "label": "ⵜⴰⵛⵍⵃⵉⵜ",
        "kind": "native"
      },
      {
        "label": "希尔哈语",
        "kind": "alias"
      },
      {
        "label": "Tachelhit",
        "kind": "alias"
      },
      {
        "label": "chleuh",
        "kind": "alias"
      },
      {
        "label": "Taschelhit",
        "kind": "alias"
      }
    ],
    "prv": [
      {
        "label": "Provençal",
        "kind": "english"
      }
    ],
    "gon": [
      {
        "label": "gondi",
        "kind": "local"
      },
      {
        "label": "冈德语",
        "kind": "alias"
      }
    ],
    "naq": [
      {
        "label": "nama",
        "kind": "local"
      },
      {
        "label": "Khoekhoegowab",
        "kind": "native"
      },
      {
        "label": "Khoekhoe",
        "kind": "english"
      },
      {
        "label": "纳马语",
        "kind": "alias"
      }
    ],
    "pag": [
      {
        "label": "pangasinán",
        "kind": "local"
      },
      {
        "label": "Pangasinan",
        "kind": "english"
      },
      {
        "label": "邦阿西南语",
        "kind": "alias"
      }
    ],
    "cho": [
      {
        "label": "choctaw",
        "kind": "local"
      },
      {
        "label": "乔克托语",
        "kind": "alias"
      }
    ],
    "kpy": [
      {
        "label": "Koryak",
        "kind": "english"
      }
    ],
    "ttt": [
      {
        "label": "Tat",
        "kind": "english"
      },
      {
        "label": "Muslim Tat",
        "kind": "alias"
      },
      {
        "label": "tati caucasien",
        "kind": "alias"
      },
      {
        "label": "Tatisch",
        "kind": "alias"
      }
    ],
    "hbo": [
      {
        "label": "Biblical Hebrew",
        "kind": "english"
      }
    ],
    "yua": [
      {
        "label": "Yucatec Maya",
        "kind": "english"
      }
    ],
    "xpr": [
      {
        "label": "Parthian",
        "kind": "english"
      }
    ],
    "anp": [
      {
        "label": "angika",
        "kind": "local"
      },
      {
        "label": "昂加语",
        "kind": "alias"
      }
    ],
    "eve": [
      {
        "label": "Even",
        "kind": "english"
      }
    ],
    "dyu": [
      {
        "label": "diula",
        "kind": "local"
      },
      {
        "label": "Dioula",
        "kind": "english"
      },
      {
        "label": "迪尤拉语",
        "kind": "alias"
      },
      {
        "label": "Dyula",
        "kind": "alias"
      }
    ],
    "dlg": [
      {
        "label": "Dolgan",
        "kind": "english"
      }
    ],
    "goh": [
      {
        "label": "alto alemán antiguo",
        "kind": "local"
      },
      {
        "label": "Old High German",
        "kind": "english"
      },
      {
        "label": "古高地德语",
        "kind": "alias"
      },
      {
        "label": "ancien haut allemand",
        "kind": "alias"
      },
      {
        "label": "Althochdeutsch",
        "kind": "alias"
      }
    ],
    "mos": [
      {
        "label": "mossi",
        "kind": "local"
      },
      {
        "label": "Mooré",
        "kind": "english"
      },
      {
        "label": "莫西语",
        "kind": "alias"
      },
      {
        "label": "moré",
        "kind": "alias"
      }
    ],
    "niv": [
      {
        "label": "Nivkh",
        "kind": "english"
      }
    ],
    "pnt": [
      {
        "label": "Pontic Greek",
        "kind": "english"
      },
      {
        "label": "Pontic",
        "kind": "alias"
      },
      {
        "label": "pontique",
        "kind": "alias"
      },
      {
        "label": "Pontisch",
        "kind": "alias"
      }
    ],
    "uby": [
      {
        "label": "Ubykh",
        "kind": "english"
      }
    ],
    "fsl": [
      {
        "label": "French Sign Language",
        "kind": "english"
      }
    ],
    "oji": [
      {
        "label": "ojibwa",
        "kind": "local"
      },
      {
        "label": "Ojibwe",
        "kind": "english"
      },
      {
        "label": "奥吉布瓦语",
        "kind": "alias"
      }
    ],
    "bem": [
      {
        "label": "bemba",
        "kind": "local"
      },
      {
        "label": "Ichibemba",
        "kind": "native"
      },
      {
        "label": "本巴语",
        "kind": "alias"
      }
    ],
    "mnk": [
      {
        "label": "mandingo",
        "kind": "local"
      },
      {
        "label": "Mandinka",
        "kind": "english"
      },
      {
        "label": "曼丁哥语",
        "kind": "alias"
      },
      {
        "label": "mandingue",
        "kind": "alias"
      },
      {
        "label": "Malinke",
        "kind": "alias"
      }
    ],
    "kdr": [
      {
        "label": "Karaim",
        "kind": "english"
      }
    ],
    "ary": [
      {
        "label": "Moroccan Arabic",
        "kind": "english"
      },
      {
        "label": "arabe marocain",
        "kind": "alias"
      },
      {
        "label": "Marokkanisches Arabisch",
        "kind": "alias"
      }
    ],
    "sms": [
      {
        "label": "sami skolt",
        "kind": "local"
      },
      {
        "label": "Skolt Sami",
        "kind": "english"
      },
      {
        "label": "斯科特萨米语",
        "kind": "alias"
      },
      {
        "label": "same skolt",
        "kind": "alias"
      },
      {
        "label": "Skolt-Samisch",
        "kind": "alias"
      }
    ],
    "chy": [
      {
        "label": "cheyene",
        "kind": "local"
      },
      {
        "label": "Cheyenne",
        "kind": "english"
      },
      {
        "label": "夏延语",
        "kind": "alias"
      }
    ],
    "cdo": [
      {
        "label": "Eastern Min",
        "kind": "english"
      }
    ],
    "agx": [
      {
        "label": "Aghul",
        "kind": "english"
      }
    ],
    "wym": [
      {
        "label": "Wymysorys",
        "kind": "english"
      }
    ],
    "qxq": [
      {
        "label": "Qashqai",
        "kind": "english"
      }
    ],
    "xil": [
      {
        "label": "Illyrian",
        "kind": "english"
      }
    ],
    "gld": [
      {
        "label": "Nanai",
        "kind": "english"
      }
    ],
    "crs": [
      {
        "label": "criollo seychelense",
        "kind": "local"
      },
      {
        "label": "Seychellois Creole",
        "kind": "english"
      },
      {
        "label": "塞舌尔克里奥尔语",
        "kind": "alias"
      },
      {
        "label": "Seselwa Creole French",
        "kind": "alias"
      },
      {
        "label": "créole seychellois",
        "kind": "alias"
      },
      {
        "label": "Seychellenkreol",
        "kind": "alias"
      }
    ],
    "tig": [
      {
        "label": "tigré",
        "kind": "local"
      },
      {
        "label": "Tigre",
        "kind": "english"
      },
      {
        "label": "提格雷语",
        "kind": "alias"
      }
    ],
    "wbl": [
      {
        "label": "Wakhi",
        "kind": "english"
      }
    ],
    "lus": [
      {
        "label": "mizo",
        "kind": "local"
      },
      {
        "label": "米佐语",
        "kind": "alias"
      },
      {
        "label": "lushaï",
        "kind": "alias"
      },
      {
        "label": "Lushai",
        "kind": "alias"
      }
    ],
    "xcb": [
      {
        "label": "Cumbric",
        "kind": "english"
      }
    ],
    "vsn": [
      {
        "label": "Vedic Sanskrit",
        "kind": "english"
      }
    ],
    "hyw": [
      {
        "label": "Western Armenian",
        "kind": "english"
      }
    ],
    "avk": [
      {
        "label": "Kotava",
        "kind": "english"
      }
    ],
    "slr": [
      {
        "label": "Salar",
        "kind": "english"
      }
    ],
    "otk": [
      {
        "label": "Old Turkic",
        "kind": "english"
      }
    ],
    "nde": [
      {
        "label": "ndebele septentrional",
        "kind": "local"
      },
      {
        "label": "isiNdebele",
        "kind": "native"
      },
      {
        "label": "Northern Ndebele",
        "kind": "english"
      },
      {
        "label": "北恩德贝勒语",
        "kind": "alias"
      },
      {
        "label": "North Ndebele",
        "kind": "alias"
      },
      {
        "label": "ndébélé du Nord",
        "kind": "alias"
      },
      {
        "label": "Nord-Ndebele",
        "kind": "alias"
      }
    ],
    "kha": [
      {
        "label": "khasi",
        "kind": "local"
      },
      {
        "label": "卡西语",
        "kind": "alias"
      }
    ],
    "twi": [
      {
        "label": "twi",
        "kind": "local"
      },
      {
        "label": "Akan",
        "kind": "native"
      },
      {
        "label": "契维语",
        "kind": "alias"
      }
    ],
    "grt": [
      {
        "label": "Garo",
        "kind": "english"
      }
    ],
    "txh": [
      {
        "label": "Thracian",
        "kind": "english"
      }
    ],
    "khw": [
      {
        "label": "Khowar",
        "kind": "english"
      }
    ],
    "xbc": [
      {
        "label": "Bactrian",
        "kind": "english"
      }
    ],
    "xpi": [
      {
        "label": "Pictish",
        "kind": "english"
      }
    ],
    "mxi": [
      {
        "label": "Andalusi Romance",
        "kind": "english"
      }
    ],
    "xpu": [
      {
        "label": "Punic",
        "kind": "english"
      }
    ],
    "sgh": [
      {
        "label": "Shughni",
        "kind": "english"
      }
    ],
    "bra": [
      {
        "label": "braj",
        "kind": "local"
      },
      {
        "label": "Braj Bhasha",
        "kind": "english"
      },
      {
        "label": "布拉杰语",
        "kind": "alias"
      },
      {
        "label": "Braj-Bhakha",
        "kind": "alias"
      }
    ],
    "snk": [
      {
        "label": "soninké",
        "kind": "local"
      },
      {
        "label": "Soninke",
        "kind": "english"
      },
      {
        "label": "索宁克语",
        "kind": "alias"
      }
    ],
    "xpg": [
      {
        "label": "Phrygian",
        "kind": "english"
      }
    ],
    "sjn": [
      {
        "label": "Sindarin",
        "kind": "english"
      }
    ],
    "ruo": [
      {
        "label": "Istro-Romanian",
        "kind": "english"
      }
    ],
    "nzs": [
      {
        "label": "New Zealand Sign Language",
        "kind": "english"
      }
    ],
    "cjs": [
      {
        "label": "Shor",
        "kind": "english"
      }
    ],
    "lua": [
      {
        "label": "luba-lulua",
        "kind": "local"
      },
      {
        "label": "Luba-Kasai",
        "kind": "english"
      },
      {
        "label": "卢巴-卢拉语",
        "kind": "alias"
      },
      {
        "label": "luba-kasaï (ciluba)",
        "kind": "alias"
      }
    ],
    "vls": [
      {
        "label": "West Flemish",
        "kind": "english"
      },
      {
        "label": "flamand occidental",
        "kind": "alias"
      },
      {
        "label": "Westflämisch",
        "kind": "alias"
      }
    ],
    "zea": [
      {
        "label": "Zeelandic",
        "kind": "english"
      },
      {
        "label": "zélandais",
        "kind": "alias"
      },
      {
        "label": "Seeländisch",
        "kind": "alias"
      }
    ],
    "pfl": [
      {
        "label": "Palatinate German",
        "kind": "english"
      },
      {
        "label": "Palatine German",
        "kind": "alias"
      },
      {
        "label": "allemand palatin",
        "kind": "alias"
      },
      {
        "label": "Pfälzisch",
        "kind": "alias"
      }
    ],
    "aii": [
      {
        "label": "Assyrian Neo-Aramaic",
        "kind": "english"
      }
    ],
    "bfi": [
      {
        "label": "British Sign Language",
        "kind": "english"
      }
    ],
    "osx": [
      {
        "label": "Old Saxon",
        "kind": "english"
      }
    ],
    "xhu": [
      {
        "label": "Hurrian",
        "kind": "english"
      }
    ],
    "sjt": [
      {
        "label": "Ter Sami",
        "kind": "english"
      }
    ],
    "xvn": [
      {
        "label": "Vandalic",
        "kind": "english"
      }
    ],
    "yai": [
      {
        "label": "Yaghnobi",
        "kind": "english"
      }
    ],
    "sje": [
      {
        "label": "Pite Sami",
        "kind": "english"
      }
    ],
    "shn": [
      {
        "label": "shan",
        "kind": "local"
      },
      {
        "label": "掸语",
        "kind": "alias"
      },
      {
        "label": "Schan",
        "kind": "alias"
      }
    ],
    "tli": [
      {
        "label": "tlingit",
        "kind": "local"
      },
      {
        "label": "特林吉特语",
        "kind": "alias"
      }
    ],
    "sga": [
      {
        "label": "irlandés antiguo",
        "kind": "local"
      },
      {
        "label": "Old Irish",
        "kind": "english"
      },
      {
        "label": "古爱尔兰语",
        "kind": "alias"
      },
      {
        "label": "ancien irlandais",
        "kind": "alias"
      },
      {
        "label": "Altirisch",
        "kind": "alias"
      }
    ],
    "lbj": [
      {
        "label": "Ladakhi",
        "kind": "english"
      }
    ],
    "bhb": [
      {
        "label": "Bhili",
        "kind": "english"
      }
    ],
    "rar": [
      {
        "label": "rarotongano",
        "kind": "local"
      },
      {
        "label": "Cook Islands Maori",
        "kind": "english"
      },
      {
        "label": "拉罗汤加语",
        "kind": "alias"
      },
      {
        "label": "Rarotongan",
        "kind": "alias"
      },
      {
        "label": "rarotongien",
        "kind": "alias"
      },
      {
        "label": "Rarotonganisch",
        "kind": "alias"
      }
    ],
    "tkr": [
      {
        "label": "Tsakhur",
        "kind": "english"
      },
      {
        "label": "tsakhour",
        "kind": "alias"
      },
      {
        "label": "Tsachurisch",
        "kind": "alias"
      }
    ],
    "srh": [
      {
        "label": "Sarikoli",
        "kind": "english"
      }
    ],
    "uum": [
      {
        "label": "Urum",
        "kind": "english"
      }
    ],
    "sia": [
      {
        "label": "Akkala Sami",
        "kind": "english"
      }
    ],
    "ist": [
      {
        "label": "Istriot",
        "kind": "english"
      }
    ],
    "xld": [
      {
        "label": "Lydian",
        "kind": "english"
      }
    ],
    "lkt": [
      {
        "label": "lakota",
        "kind": "local"
      },
      {
        "label": "Lakȟólʼiyapi",
        "kind": "native"
      },
      {
        "label": "拉科塔语",
        "kind": "alias"
      }
    ],
    "kim": [
      {
        "label": "Tofa",
        "kind": "english"
      }
    ],
    "jrb": [
      {
        "label": "judeo-árabe",
        "kind": "local"
      },
      {
        "label": "Judeo-Arabic",
        "kind": "english"
      },
      {
        "label": "犹太阿拉伯语",
        "kind": "alias"
      },
      {
        "label": "judéo-arabe",
        "kind": "alias"
      },
      {
        "label": "Jüdisch-Arabisch",
        "kind": "alias"
      }
    ],
    "tzm": [
      {
        "label": "tamazight del Atlas Central",
        "kind": "local"
      },
      {
        "label": "Tamaziɣt n laṭlaṣ",
        "kind": "native"
      },
      {
        "label": "Central Atlas Tamazight",
        "kind": "english"
      },
      {
        "label": "塔马齐格特语",
        "kind": "alias"
      },
      {
        "label": "amazighe de l’Atlas central",
        "kind": "alias"
      },
      {
        "label": "Zentralatlas-Tamazight",
        "kind": "alias"
      }
    ],
    "arq": [
      {
        "label": "Algerian Arabic",
        "kind": "english"
      },
      {
        "label": "arabe algérien",
        "kind": "alias"
      },
      {
        "label": "Algerisches Arabisch",
        "kind": "alias"
      }
    ],
    "myp": [
      {
        "label": "Pirahã",
        "kind": "english"
      }
    ],
    "mey": [
      {
        "label": "Hassaniya Arabic",
        "kind": "english"
      }
    ],
    "tsg": [
      {
        "label": "Tausug",
        "kind": "english"
      }
    ],
    "rif": [
      {
        "label": "Tarifit",
        "kind": "english"
      },
      {
        "label": "里夫语",
        "kind": "alias"
      },
      {
        "label": "Riffian",
        "kind": "alias"
      },
      {
        "label": "rifain",
        "kind": "alias"
      }
    ],
    "mrj": [
      {
        "label": "Hill Mari",
        "kind": "english"
      },
      {
        "label": "Western Mari",
        "kind": "alias"
      },
      {
        "label": "mari occidental",
        "kind": "alias"
      },
      {
        "label": "Bergmari",
        "kind": "alias"
      }
    ],
    "bft": [
      {
        "label": "Balti",
        "kind": "english"
      }
    ],
    "clw": [
      {
        "label": "Chulym",
        "kind": "english"
      }
    ],
    "jct": [
      {
        "label": "Krymchak",
        "kind": "english"
      }
    ],
    "udi": [
      {
        "label": "Udi",
        "kind": "english"
      }
    ],
    "sju": [
      {
        "label": "Ume Sami",
        "kind": "english"
      }
    ],
    "ruq": [
      {
        "label": "Megleno-Romanian",
        "kind": "english"
      }
    ],
    "xga": [
      {
        "label": "Galatian",
        "kind": "english"
      }
    ],
    "aib": [
      {
        "label": "Äynu",
        "kind": "english"
      }
    ],
    "ncs": [
      {
        "label": "Nicaraguan Sign Language",
        "kind": "english"
      }
    ],
    "afb": [
      {
        "label": "Gulf Arabic",
        "kind": "english"
      }
    ],
    "swg": [
      {
        "label": "Swabian",
        "kind": "english"
      }
    ],
    "eya": [
      {
        "label": "Eyak",
        "kind": "english"
      }
    ],
    "dar": [
      {
        "label": "dargva",
        "kind": "local"
      },
      {
        "label": "Dargwa",
        "kind": "english"
      },
      {
        "label": "达尔格瓦语",
        "kind": "alias"
      },
      {
        "label": "Darginisch",
        "kind": "alias"
      }
    ],
    "trp": [
      {
        "label": "Kokborok",
        "kind": "english"
      }
    ],
    "xlc": [
      {
        "label": "Lycian",
        "kind": "english"
      }
    ],
    "hoc": [
      {
        "label": "Ho",
        "kind": "english"
      }
    ],
    "pih": [
      {
        "label": "Pitkern",
        "kind": "english"
      }
    ],
    "xum": [
      {
        "label": "Umbrian",
        "kind": "english"
      }
    ],
    "din": [
      {
        "label": "dinka",
        "kind": "local"
      },
      {
        "label": "丁卡语",
        "kind": "alias"
      }
    ],
    "lif": [
      {
        "label": "Limbu",
        "kind": "english"
      }
    ],
    "lki": [
      {
        "label": "Laki",
        "kind": "english"
      }
    ],
    "ise": [
      {
        "label": "Italian Sign Language",
        "kind": "english"
      }
    ],
    "scl": [
      {
        "label": "Shina",
        "kind": "english"
      }
    ],
    "xeb": [
      {
        "label": "Eblaite",
        "kind": "english"
      }
    ],
    "xur": [
      {
        "label": "Urartian",
        "kind": "english"
      }
    ],
    "zkz": [
      {
        "label": "Khazar language",
        "kind": "english"
      }
    ],
    "gmy": [
      {
        "label": "Mycenaean Greek",
        "kind": "english"
      }
    ],
    "gmh": [
      {
        "label": "alto alemán medio",
        "kind": "local"
      },
      {
        "label": "Middle High German",
        "kind": "english"
      },
      {
        "label": "中古高地德语",
        "kind": "alias"
      },
      {
        "label": "moyen haut-allemand",
        "kind": "alias"
      },
      {
        "label": "Mittelhochdeutsch",
        "kind": "alias"
      }
    ],
    "aln": [
      {
        "label": "Gheg",
        "kind": "english"
      },
      {
        "label": "Gheg Albanian",
        "kind": "alias"
      },
      {
        "label": "guègue",
        "kind": "alias"
      },
      {
        "label": "Gegisch",
        "kind": "alias"
      }
    ],
    "alt": [
      {
        "label": "altái meridional",
        "kind": "local"
      },
      {
        "label": "Southern Altai",
        "kind": "english"
      },
      {
        "label": "南阿尔泰语",
        "kind": "alias"
      },
      {
        "label": "altaï du Sud",
        "kind": "alias"
      },
      {
        "label": "Süd-Altaisch",
        "kind": "alias"
      }
    ],
    "rhg": [
      {
        "label": "rohinyá",
        "kind": "local"
      },
      {
        "label": "Rohingya",
        "kind": "english"
      },
      {
        "label": "罗兴亚语",
        "kind": "alias"
      },
      {
        "label": "Rohingyalisch",
        "kind": "alias"
      }
    ],
    "lrl": [
      {
        "label": "Achomi",
        "kind": "english"
      }
    ],
    "tum": [
      {
        "label": "tumbuka",
        "kind": "local"
      },
      {
        "label": "通布卡语",
        "kind": "alias"
      }
    ],
    "bin": [
      {
        "label": "bini",
        "kind": "local"
      },
      {
        "label": "Edo",
        "kind": "english"
      },
      {
        "label": "比尼语",
        "kind": "alias"
      }
    ],
    "bik": [
      {
        "label": "bicol",
        "kind": "local"
      },
      {
        "label": "Bikol",
        "kind": "english"
      },
      {
        "label": "比科尔语",
        "kind": "alias"
      }
    ],
    "iii": [
      {
        "label": "yi de Sichuán",
        "kind": "local"
      },
      {
        "label": "ꆈꌠꉙ",
        "kind": "native"
      },
      {
        "label": "Sichuan Yi",
        "kind": "english"
      },
      {
        "label": "凉山彝语",
        "kind": "alias"
      },
      {
        "label": "yi du Sichuan",
        "kind": "alias"
      },
      {
        "label": "Yi",
        "kind": "alias"
      },
      {
        "label": "nuosu",
        "kind": "alias"
      },
      {
        "label": "彝语",
        "kind": "alias"
      },
      {
        "label": "彝文",
        "kind": "alias"
      },
      {
        "label": "彝語",
        "kind": "alias"
      }
    ],
    "olo": [
      {
        "label": "Livvi-Karelian",
        "kind": "english"
      }
    ],
    "xsr": [
      {
        "label": "Sherpa",
        "kind": "english"
      }
    ],
    "umb": [
      {
        "label": "umbundu",
        "kind": "local"
      },
      {
        "label": "翁本杜语",
        "kind": "alias"
      }
    ],
    "acm": [
      {
        "label": "Iraqi Arabic",
        "kind": "english"
      }
    ],
    "sas": [
      {
        "label": "sasak",
        "kind": "local"
      },
      {
        "label": "萨萨克语",
        "kind": "alias"
      }
    ],
    "kua": [
      {
        "label": "kuanyama",
        "kind": "local"
      },
      {
        "label": "Kwanyama",
        "kind": "english"
      },
      {
        "label": "宽亚玛语",
        "kind": "alias"
      }
    ]
  },
  "de-DE": {
    "eng": [
      {
        "label": "Englisch",
        "kind": "local"
      },
      {
        "label": "English",
        "kind": "native"
      },
      {
        "label": "英语",
        "kind": "alias"
      },
      {
        "label": "anglais",
        "kind": "alias"
      },
      {
        "label": "inglés",
        "kind": "alias"
      },
      {
        "label": "英文",
        "kind": "alias"
      },
      {
        "label": "英語",
        "kind": "alias"
      },
      {
        "label": "american english",
        "kind": "alias"
      },
      {
        "label": "british english",
        "kind": "alias"
      }
    ],
    "deu": [
      {
        "label": "Deutsch",
        "kind": "local"
      },
      {
        "label": "German",
        "kind": "english"
      },
      {
        "label": "德语",
        "kind": "alias"
      },
      {
        "label": "allemand",
        "kind": "alias"
      },
      {
        "label": "alemán",
        "kind": "alias"
      },
      {
        "label": "德文",
        "kind": "alias"
      },
      {
        "label": "德語",
        "kind": "alias"
      }
    ],
    "spa": [
      {
        "label": "Spanisch",
        "kind": "local"
      },
      {
        "label": "español",
        "kind": "native"
      },
      {
        "label": "Spanish",
        "kind": "english"
      },
      {
        "label": "西班牙语",
        "kind": "alias"
      },
      {
        "label": "espagnol",
        "kind": "alias"
      },
      {
        "label": "西文",
        "kind": "alias"
      },
      {
        "label": "西語",
        "kind": "alias"
      },
      {
        "label": "castilian",
        "kind": "alias"
      },
      {
        "label": "castilian spanish",
        "kind": "alias"
      },
      {
        "label": "latin american spanish",
        "kind": "alias"
      },
      {
        "label": "mexican spanish",
        "kind": "alias"
      }
    ],
    "fra": [
      {
        "label": "Französisch",
        "kind": "local"
      },
      {
        "label": "français",
        "kind": "native"
      },
      {
        "label": "French",
        "kind": "english"
      },
      {
        "label": "法语",
        "kind": "alias"
      },
      {
        "label": "francés",
        "kind": "alias"
      },
      {
        "label": "法文",
        "kind": "alias"
      },
      {
        "label": "法語",
        "kind": "alias"
      }
    ],
    "rus": [
      {
        "label": "Russisch",
        "kind": "local"
      },
      {
        "label": "русский",
        "kind": "native"
      },
      {
        "label": "Russian",
        "kind": "english"
      },
      {
        "label": "俄语",
        "kind": "alias"
      },
      {
        "label": "russe",
        "kind": "alias"
      },
      {
        "label": "ruso",
        "kind": "alias"
      },
      {
        "label": "俄文",
        "kind": "alias"
      },
      {
        "label": "俄語",
        "kind": "alias"
      }
    ],
    "ara": [
      {
        "label": "Arabisch",
        "kind": "local"
      },
      {
        "label": "العربية",
        "kind": "native"
      },
      {
        "label": "Arabic",
        "kind": "english"
      },
      {
        "label": "阿拉伯语",
        "kind": "alias"
      },
      {
        "label": "arabe",
        "kind": "alias"
      },
      {
        "label": "árabe",
        "kind": "alias"
      },
      {
        "label": "阿文",
        "kind": "alias"
      },
      {
        "label": "阿语",
        "kind": "alias"
      },
      {
        "label": "阿語",
        "kind": "alias"
      },
      {
        "label": "modern standard arabic",
        "kind": "alias"
      }
    ],
    "lat": [
      {
        "label": "Latein",
        "kind": "local"
      },
      {
        "label": "Latin",
        "kind": "english"
      },
      {
        "label": "拉丁语",
        "kind": "alias"
      },
      {
        "label": "latín",
        "kind": "alias"
      }
    ],
    "ita": [
      {
        "label": "Italienisch",
        "kind": "local"
      },
      {
        "label": "italiano",
        "kind": "native"
      },
      {
        "label": "Italian",
        "kind": "english"
      },
      {
        "label": "意大利语",
        "kind": "alias"
      },
      {
        "label": "italien",
        "kind": "alias"
      },
      {
        "label": "意文",
        "kind": "alias"
      },
      {
        "label": "意语",
        "kind": "alias"
      },
      {
        "label": "意語",
        "kind": "alias"
      }
    ],
    "jpn": [
      {
        "label": "Japanisch",
        "kind": "local"
      },
      {
        "label": "日本語",
        "kind": "native"
      },
      {
        "label": "Japanese",
        "kind": "english"
      },
      {
        "label": "日语",
        "kind": "alias"
      },
      {
        "label": "japonais",
        "kind": "alias"
      },
      {
        "label": "japonés",
        "kind": "alias"
      },
      {
        "label": "日文",
        "kind": "alias"
      },
      {
        "label": "日語",
        "kind": "alias"
      }
    ],
    "por": [
      {
        "label": "Portugiesisch",
        "kind": "local"
      },
      {
        "label": "português",
        "kind": "native"
      },
      {
        "label": "Portuguese",
        "kind": "english"
      },
      {
        "label": "葡萄牙语",
        "kind": "alias"
      },
      {
        "label": "portugais",
        "kind": "alias"
      },
      {
        "label": "portugués",
        "kind": "alias"
      },
      {
        "label": "葡文",
        "kind": "alias"
      },
      {
        "label": "葡语",
        "kind": "alias"
      },
      {
        "label": "葡語",
        "kind": "alias"
      },
      {
        "label": "brazilian portuguese",
        "kind": "alias"
      },
      {
        "label": "european portuguese",
        "kind": "alias"
      }
    ],
    "epo": [
      {
        "label": "Esperanto",
        "kind": "local"
      },
      {
        "label": "世界语",
        "kind": "alias"
      },
      {
        "label": "espéranto",
        "kind": "alias"
      }
    ],
    "fas": [
      {
        "label": "Persisch",
        "kind": "local"
      },
      {
        "label": "فارسی",
        "kind": "native"
      },
      {
        "label": "Persian",
        "kind": "english"
      },
      {
        "label": "波斯语",
        "kind": "alias"
      },
      {
        "label": "persan",
        "kind": "alias"
      },
      {
        "label": "persa",
        "kind": "alias"
      },
      {
        "label": "波斯文",
        "kind": "alias"
      },
      {
        "label": "波斯語",
        "kind": "alias"
      },
      {
        "label": "法尔西",
        "kind": "alias"
      },
      {
        "label": "法爾西",
        "kind": "alias"
      },
      {
        "label": "farsi",
        "kind": "alias"
      },
      {
        "label": "persian farsi",
        "kind": "alias"
      }
    ],
    "zho": [
      {
        "label": "Chinesisch",
        "kind": "local"
      },
      {
        "label": "中文",
        "kind": "native"
      },
      {
        "label": "Chinese",
        "kind": "english"
      },
      {
        "label": "chinois",
        "kind": "alias"
      },
      {
        "label": "chino",
        "kind": "alias"
      },
      {
        "label": "汉文",
        "kind": "alias"
      },
      {
        "label": "漢文",
        "kind": "alias"
      },
      {
        "label": "华文",
        "kind": "alias"
      },
      {
        "label": "華文",
        "kind": "alias"
      }
    ],
    "heb": [
      {
        "label": "Hebräisch",
        "kind": "local"
      },
      {
        "label": "עברית",
        "kind": "native"
      },
      {
        "label": "Hebrew",
        "kind": "english"
      },
      {
        "label": "希伯来语",
        "kind": "alias"
      },
      {
        "label": "hébreu",
        "kind": "alias"
      },
      {
        "label": "hebreo",
        "kind": "alias"
      },
      {
        "label": "希伯来文",
        "kind": "alias"
      },
      {
        "label": "希伯來文",
        "kind": "alias"
      }
    ],
    "nld": [
      {
        "label": "Niederländisch",
        "kind": "local"
      },
      {
        "label": "Nederlands",
        "kind": "native"
      },
      {
        "label": "Dutch",
        "kind": "english"
      },
      {
        "label": "荷兰语",
        "kind": "alias"
      },
      {
        "label": "néerlandais",
        "kind": "alias"
      },
      {
        "label": "neerlandés",
        "kind": "alias"
      },
      {
        "label": "荷文",
        "kind": "alias"
      },
      {
        "label": "荷语",
        "kind": "alias"
      },
      {
        "label": "荷語",
        "kind": "alias"
      },
      {
        "label": "flemish",
        "kind": "alias"
      }
    ],
    "pol": [
      {
        "label": "Polnisch",
        "kind": "local"
      },
      {
        "label": "polski",
        "kind": "native"
      },
      {
        "label": "Polish",
        "kind": "english"
      },
      {
        "label": "波兰语",
        "kind": "alias"
      },
      {
        "label": "polonais",
        "kind": "alias"
      },
      {
        "label": "polaco",
        "kind": "alias"
      },
      {
        "label": "波文",
        "kind": "alias"
      },
      {
        "label": "波语",
        "kind": "alias"
      },
      {
        "label": "波語",
        "kind": "alias"
      }
    ],
    "swe": [
      {
        "label": "Schwedisch",
        "kind": "local"
      },
      {
        "label": "svenska",
        "kind": "native"
      },
      {
        "label": "Swedish",
        "kind": "english"
      },
      {
        "label": "瑞典语",
        "kind": "alias"
      },
      {
        "label": "suédois",
        "kind": "alias"
      },
      {
        "label": "sueco",
        "kind": "alias"
      }
    ],
    "tur": [
      {
        "label": "Türkisch",
        "kind": "local"
      },
      {
        "label": "Türkçe",
        "kind": "native"
      },
      {
        "label": "Turkish",
        "kind": "english"
      },
      {
        "label": "土耳其语",
        "kind": "alias"
      },
      {
        "label": "turc",
        "kind": "alias"
      },
      {
        "label": "turco",
        "kind": "alias"
      },
      {
        "label": "土文",
        "kind": "alias"
      },
      {
        "label": "土语",
        "kind": "alias"
      },
      {
        "label": "土語",
        "kind": "alias"
      }
    ],
    "ukr": [
      {
        "label": "Ukrainisch",
        "kind": "local"
      },
      {
        "label": "українська",
        "kind": "native"
      },
      {
        "label": "Ukrainian",
        "kind": "english"
      },
      {
        "label": "乌克兰语",
        "kind": "alias"
      },
      {
        "label": "ukrainien",
        "kind": "alias"
      },
      {
        "label": "ucraniano",
        "kind": "alias"
      }
    ],
    "fin": [
      {
        "label": "Finnisch",
        "kind": "local"
      },
      {
        "label": "suomi",
        "kind": "native"
      },
      {
        "label": "Finnish",
        "kind": "english"
      },
      {
        "label": "芬兰语",
        "kind": "alias"
      },
      {
        "label": "finnois",
        "kind": "alias"
      },
      {
        "label": "finés",
        "kind": "alias"
      }
    ],
    "kor": [
      {
        "label": "Koreanisch",
        "kind": "local"
      },
      {
        "label": "한국어",
        "kind": "native"
      },
      {
        "label": "Korean",
        "kind": "english"
      },
      {
        "label": "韩语",
        "kind": "alias"
      },
      {
        "label": "coréen",
        "kind": "alias"
      },
      {
        "label": "coreano",
        "kind": "alias"
      },
      {
        "label": "韩文",
        "kind": "alias"
      },
      {
        "label": "韓文",
        "kind": "alias"
      },
      {
        "label": "韩国语",
        "kind": "alias"
      },
      {
        "label": "朝鲜语",
        "kind": "alias"
      },
      {
        "label": "朝鮮文",
        "kind": "alias"
      },
      {
        "label": "韓語",
        "kind": "alias"
      }
    ],
    "san": [
      {
        "label": "Sanskrit",
        "kind": "local"
      },
      {
        "label": "संस्कृत भाषा",
        "kind": "native"
      },
      {
        "label": "梵语",
        "kind": "alias"
      },
      {
        "label": "sánscrito",
        "kind": "alias"
      }
    ],
    "ces": [
      {
        "label": "Tschechisch",
        "kind": "local"
      },
      {
        "label": "čeština",
        "kind": "native"
      },
      {
        "label": "Czech",
        "kind": "english"
      },
      {
        "label": "捷克语",
        "kind": "alias"
      },
      {
        "label": "tchèque",
        "kind": "alias"
      },
      {
        "label": "checo",
        "kind": "alias"
      }
    ],
    "cat": [
      {
        "label": "Katalanisch",
        "kind": "local"
      },
      {
        "label": "català",
        "kind": "native"
      },
      {
        "label": "Catalan",
        "kind": "english"
      },
      {
        "label": "加泰罗尼亚语",
        "kind": "alias"
      },
      {
        "label": "catalán",
        "kind": "alias"
      }
    ],
    "dan": [
      {
        "label": "Dänisch",
        "kind": "local"
      },
      {
        "label": "dansk",
        "kind": "native"
      },
      {
        "label": "Danish",
        "kind": "english"
      },
      {
        "label": "丹麦语",
        "kind": "alias"
      },
      {
        "label": "danois",
        "kind": "alias"
      },
      {
        "label": "danés",
        "kind": "alias"
      }
    ],
    "ron": [
      {
        "label": "Rumänisch",
        "kind": "local"
      },
      {
        "label": "română",
        "kind": "native"
      },
      {
        "label": "Romanian",
        "kind": "english"
      },
      {
        "label": "罗马尼亚语",
        "kind": "alias"
      },
      {
        "label": "roumain",
        "kind": "alias"
      },
      {
        "label": "rumano",
        "kind": "alias"
      }
    ],
    "swa": [
      {
        "label": "Suaheli",
        "kind": "local"
      },
      {
        "label": "Kiswahili",
        "kind": "native"
      },
      {
        "label": "Swahili",
        "kind": "english"
      },
      {
        "label": "斯瓦希里语",
        "kind": "alias"
      },
      {
        "label": "suajili",
        "kind": "alias"
      }
    ],
    "hun": [
      {
        "label": "Ungarisch",
        "kind": "local"
      },
      {
        "label": "magyar",
        "kind": "native"
      },
      {
        "label": "Hungarian",
        "kind": "english"
      },
      {
        "label": "匈牙利语",
        "kind": "alias"
      },
      {
        "label": "hongrois",
        "kind": "alias"
      },
      {
        "label": "húngaro",
        "kind": "alias"
      }
    ],
    "syl": [
      {
        "label": "Sylheti",
        "kind": "english"
      }
    ],
    "hrv": [
      {
        "label": "Kroatisch",
        "kind": "local"
      },
      {
        "label": "hrvatski",
        "kind": "native"
      },
      {
        "label": "Croatian",
        "kind": "english"
      },
      {
        "label": "克罗地亚语",
        "kind": "alias"
      },
      {
        "label": "croate",
        "kind": "alias"
      },
      {
        "label": "croata",
        "kind": "alias"
      }
    ],
    "nor": [
      {
        "label": "Norwegisch",
        "kind": "local"
      },
      {
        "label": "norsk",
        "kind": "native"
      },
      {
        "label": "Norwegian",
        "kind": "english"
      },
      {
        "label": "挪威语",
        "kind": "alias"
      },
      {
        "label": "norvégien",
        "kind": "alias"
      },
      {
        "label": "noruego",
        "kind": "alias"
      }
    ],
    "ben": [
      {
        "label": "Bengalisch",
        "kind": "local"
      },
      {
        "label": "বাংলা",
        "kind": "native"
      },
      {
        "label": "Bangla",
        "kind": "english"
      },
      {
        "label": "孟加拉语",
        "kind": "alias"
      },
      {
        "label": "bengali",
        "kind": "alias"
      },
      {
        "label": "bengalí",
        "kind": "alias"
      },
      {
        "label": "孟加拉文",
        "kind": "alias"
      },
      {
        "label": "孟加拉語",
        "kind": "alias"
      }
    ],
    "aze": [
      {
        "label": "Aserbaidschanisch",
        "kind": "local"
      },
      {
        "label": "azərbaycan",
        "kind": "native"
      },
      {
        "label": "Azerbaijani",
        "kind": "english"
      },
      {
        "label": "阿塞拜疆语",
        "kind": "alias"
      },
      {
        "label": "azerbaïdjanais",
        "kind": "alias"
      },
      {
        "label": "azerbaiyano",
        "kind": "alias"
      }
    ],
    "afr": [
      {
        "label": "Afrikaans",
        "kind": "local"
      },
      {
        "label": "南非荷兰语",
        "kind": "alias"
      },
      {
        "label": "afrikáans",
        "kind": "alias"
      }
    ],
    "est": [
      {
        "label": "Estnisch",
        "kind": "local"
      },
      {
        "label": "eesti",
        "kind": "native"
      },
      {
        "label": "Estonian",
        "kind": "english"
      },
      {
        "label": "爱沙尼亚语",
        "kind": "alias"
      },
      {
        "label": "estonien",
        "kind": "alias"
      },
      {
        "label": "estonio",
        "kind": "alias"
      }
    ],
    "bul": [
      {
        "label": "Bulgarisch",
        "kind": "local"
      },
      {
        "label": "български",
        "kind": "native"
      },
      {
        "label": "Bulgarian",
        "kind": "english"
      },
      {
        "label": "保加利亚语",
        "kind": "alias"
      },
      {
        "label": "bulgare",
        "kind": "alias"
      },
      {
        "label": "búlgaro",
        "kind": "alias"
      }
    ],
    "gle": [
      {
        "label": "Irisch",
        "kind": "local"
      },
      {
        "label": "Gaeilge",
        "kind": "native"
      },
      {
        "label": "Irish",
        "kind": "english"
      },
      {
        "label": "爱尔兰语",
        "kind": "alias"
      },
      {
        "label": "irlandais",
        "kind": "alias"
      },
      {
        "label": "irlandés",
        "kind": "alias"
      }
    ],
    "bel": [
      {
        "label": "Belarussisch",
        "kind": "local"
      },
      {
        "label": "беларуская",
        "kind": "native"
      },
      {
        "label": "Belarusian",
        "kind": "english"
      },
      {
        "label": "白俄罗斯语",
        "kind": "alias"
      },
      {
        "label": "biélorusse",
        "kind": "alias"
      },
      {
        "label": "bielorruso",
        "kind": "alias"
      }
    ],
    "ind": [
      {
        "label": "Indonesisch",
        "kind": "local"
      },
      {
        "label": "Bahasa Indonesia",
        "kind": "native"
      },
      {
        "label": "Indonesian",
        "kind": "english"
      },
      {
        "label": "印度尼西亚语",
        "kind": "alias"
      },
      {
        "label": "indonésien",
        "kind": "alias"
      },
      {
        "label": "indonesio",
        "kind": "alias"
      },
      {
        "label": "印尼文",
        "kind": "alias"
      },
      {
        "label": "印尼语",
        "kind": "alias"
      },
      {
        "label": "印尼語",
        "kind": "alias"
      }
    ],
    "isl": [
      {
        "label": "Isländisch",
        "kind": "local"
      },
      {
        "label": "íslenska",
        "kind": "native"
      },
      {
        "label": "Icelandic",
        "kind": "english"
      },
      {
        "label": "冰岛语",
        "kind": "alias"
      },
      {
        "label": "islandais",
        "kind": "alias"
      },
      {
        "label": "islandés",
        "kind": "alias"
      }
    ],
    "lit": [
      {
        "label": "Litauisch",
        "kind": "local"
      },
      {
        "label": "lietuvių",
        "kind": "native"
      },
      {
        "label": "Lithuanian",
        "kind": "english"
      },
      {
        "label": "立陶宛语",
        "kind": "alias"
      },
      {
        "label": "lituanien",
        "kind": "alias"
      },
      {
        "label": "lituano",
        "kind": "alias"
      }
    ],
    "ile": [
      {
        "label": "Interlingue",
        "kind": "local"
      },
      {
        "label": "国际文字（E）",
        "kind": "alias"
      }
    ],
    "hye": [
      {
        "label": "Armenisch",
        "kind": "local"
      },
      {
        "label": "հայերեն",
        "kind": "native"
      },
      {
        "label": "Armenian",
        "kind": "english"
      },
      {
        "label": "亚美尼亚语",
        "kind": "alias"
      },
      {
        "label": "arménien",
        "kind": "alias"
      },
      {
        "label": "armenio",
        "kind": "alias"
      }
    ],
    "slk": [
      {
        "label": "Slowakisch",
        "kind": "local"
      },
      {
        "label": "slovenčina",
        "kind": "native"
      },
      {
        "label": "Slovak",
        "kind": "english"
      },
      {
        "label": "斯洛伐克语",
        "kind": "alias"
      },
      {
        "label": "slovaque",
        "kind": "alias"
      },
      {
        "label": "eslovaco",
        "kind": "alias"
      }
    ],
    "tam": [
      {
        "label": "Tamil",
        "kind": "local"
      },
      {
        "label": "தமிழ்",
        "kind": "native"
      },
      {
        "label": "泰米尔语",
        "kind": "alias"
      },
      {
        "label": "tamoul",
        "kind": "alias"
      }
    ],
    "sqi": [
      {
        "label": "Albanisch",
        "kind": "local"
      },
      {
        "label": "shqip",
        "kind": "native"
      },
      {
        "label": "Albanian",
        "kind": "english"
      },
      {
        "label": "阿尔巴尼亚语",
        "kind": "alias"
      },
      {
        "label": "albanais",
        "kind": "alias"
      },
      {
        "label": "albanés",
        "kind": "alias"
      }
    ],
    "eus": [
      {
        "label": "Baskisch",
        "kind": "local"
      },
      {
        "label": "euskara",
        "kind": "native"
      },
      {
        "label": "Basque",
        "kind": "english"
      },
      {
        "label": "巴斯克语",
        "kind": "alias"
      },
      {
        "label": "euskera",
        "kind": "alias"
      }
    ],
    "kat": [
      {
        "label": "Georgisch",
        "kind": "local"
      },
      {
        "label": "ქართული",
        "kind": "native"
      },
      {
        "label": "Georgian",
        "kind": "english"
      },
      {
        "label": "格鲁吉亚语",
        "kind": "alias"
      },
      {
        "label": "géorgien",
        "kind": "alias"
      },
      {
        "label": "georgiano",
        "kind": "alias"
      }
    ],
    "srp": [
      {
        "label": "Serbisch",
        "kind": "local"
      },
      {
        "label": "српски",
        "kind": "native"
      },
      {
        "label": "Serbian",
        "kind": "english"
      },
      {
        "label": "塞尔维亚语",
        "kind": "alias"
      },
      {
        "label": "serbe",
        "kind": "alias"
      },
      {
        "label": "serbio",
        "kind": "alias"
      }
    ],
    "lav": [
      {
        "label": "Lettisch",
        "kind": "local"
      },
      {
        "label": "latviešu",
        "kind": "native"
      },
      {
        "label": "Latvian",
        "kind": "english"
      },
      {
        "label": "拉脱维亚语",
        "kind": "alias"
      },
      {
        "label": "letton",
        "kind": "alias"
      },
      {
        "label": "letón",
        "kind": "alias"
      }
    ],
    "tha": [
      {
        "label": "Thailändisch",
        "kind": "local"
      },
      {
        "label": "ไทย",
        "kind": "native"
      },
      {
        "label": "Thai",
        "kind": "english"
      },
      {
        "label": "泰语",
        "kind": "alias"
      },
      {
        "label": "thaï",
        "kind": "alias"
      },
      {
        "label": "tailandés",
        "kind": "alias"
      },
      {
        "label": "泰文",
        "kind": "alias"
      },
      {
        "label": "泰語",
        "kind": "alias"
      }
    ],
    "slv": [
      {
        "label": "Slowenisch",
        "kind": "local"
      },
      {
        "label": "slovenščina",
        "kind": "native"
      },
      {
        "label": "Slovene",
        "kind": "english"
      },
      {
        "label": "斯洛文尼亚语",
        "kind": "alias"
      },
      {
        "label": "Slovenian",
        "kind": "alias"
      },
      {
        "label": "slovène",
        "kind": "alias"
      },
      {
        "label": "esloveno",
        "kind": "alias"
      }
    ],
    "vie": [
      {
        "label": "Vietnamesisch",
        "kind": "local"
      },
      {
        "label": "Tiếng Việt",
        "kind": "native"
      },
      {
        "label": "Vietnamese",
        "kind": "english"
      },
      {
        "label": "越南语",
        "kind": "alias"
      },
      {
        "label": "vietnamien",
        "kind": "alias"
      },
      {
        "label": "vietnamita",
        "kind": "alias"
      },
      {
        "label": "越文",
        "kind": "alias"
      },
      {
        "label": "越語",
        "kind": "alias"
      }
    ],
    "oci": [
      {
        "label": "Okzitanisch",
        "kind": "local"
      },
      {
        "label": "occitan",
        "kind": "native"
      },
      {
        "label": "奥克语",
        "kind": "alias"
      },
      {
        "label": "occitano",
        "kind": "alias"
      }
    ],
    "kaz": [
      {
        "label": "Kasachisch",
        "kind": "local"
      },
      {
        "label": "қазақ тілі",
        "kind": "native"
      },
      {
        "label": "Kazakh",
        "kind": "english"
      },
      {
        "label": "哈萨克语",
        "kind": "alias"
      },
      {
        "label": "kazajo",
        "kind": "alias"
      },
      {
        "label": "哈薩克語",
        "kind": "alias"
      }
    ],
    "cym": [
      {
        "label": "Walisisch",
        "kind": "local"
      },
      {
        "label": "Cymraeg",
        "kind": "native"
      },
      {
        "label": "Welsh",
        "kind": "english"
      },
      {
        "label": "威尔士语",
        "kind": "alias"
      },
      {
        "label": "gallois",
        "kind": "alias"
      },
      {
        "label": "galés",
        "kind": "alias"
      }
    ],
    "msa": [
      {
        "label": "Malaiisch",
        "kind": "local"
      },
      {
        "label": "Melayu",
        "kind": "native"
      },
      {
        "label": "Malay",
        "kind": "english"
      },
      {
        "label": "马来语",
        "kind": "alias"
      },
      {
        "label": "malais",
        "kind": "alias"
      },
      {
        "label": "malayo",
        "kind": "alias"
      },
      {
        "label": "马来文",
        "kind": "alias"
      },
      {
        "label": "马来话",
        "kind": "alias"
      },
      {
        "label": "馬來文",
        "kind": "alias"
      },
      {
        "label": "馬來話",
        "kind": "alias"
      },
      {
        "label": "bahasa melayu",
        "kind": "alias"
      }
    ],
    "ina": [
      {
        "label": "Interlingua",
        "kind": "local"
      },
      {
        "label": "Interlingua (International Auxiliary Language Association)",
        "kind": "english"
      },
      {
        "label": "国际语",
        "kind": "alias"
      }
    ],
    "yid": [
      {
        "label": "Jiddisch",
        "kind": "local"
      },
      {
        "label": "ייִדיש",
        "kind": "native"
      },
      {
        "label": "Yiddish",
        "kind": "english"
      },
      {
        "label": "意第绪语",
        "kind": "alias"
      },
      {
        "label": "yidis",
        "kind": "alias"
      }
    ],
    "mkd": [
      {
        "label": "Mazedonisch",
        "kind": "local"
      },
      {
        "label": "македонски",
        "kind": "native"
      },
      {
        "label": "Macedonian",
        "kind": "english"
      },
      {
        "label": "马其顿语",
        "kind": "alias"
      },
      {
        "label": "macédonien",
        "kind": "alias"
      },
      {
        "label": "macedonio",
        "kind": "alias"
      }
    ],
    "grc": [
      {
        "label": "Altgriechisch",
        "kind": "local"
      },
      {
        "label": "Ancient Greek",
        "kind": "english"
      },
      {
        "label": "古希腊语",
        "kind": "alias"
      },
      {
        "label": "grec ancien",
        "kind": "alias"
      },
      {
        "label": "griego antiguo",
        "kind": "alias"
      }
    ],
    "kur": [
      {
        "label": "Kurdisch",
        "kind": "local"
      },
      {
        "label": "Kurdî",
        "kind": "native"
      },
      {
        "label": "Kurdish",
        "kind": "english"
      },
      {
        "label": "库尔德语",
        "kind": "alias"
      },
      {
        "label": "kurde",
        "kind": "alias"
      },
      {
        "label": "kurdo",
        "kind": "alias"
      }
    ],
    "lfn": [
      {
        "label": "Lingua Franca Nova",
        "kind": "local"
      }
    ],
    "mon": [
      {
        "label": "Mongolisch",
        "kind": "local"
      },
      {
        "label": "монгол",
        "kind": "native"
      },
      {
        "label": "Mongolian",
        "kind": "english"
      },
      {
        "label": "蒙古语",
        "kind": "alias"
      },
      {
        "label": "mongol",
        "kind": "alias"
      },
      {
        "label": "蒙古文",
        "kind": "alias"
      },
      {
        "label": "蒙古語",
        "kind": "alias"
      },
      {
        "label": "蒙古話",
        "kind": "alias"
      }
    ],
    "ido": [
      {
        "label": "Ido",
        "kind": "local"
      },
      {
        "label": "伊多语",
        "kind": "alias"
      }
    ],
    "glg": [
      {
        "label": "Galicisch",
        "kind": "local"
      },
      {
        "label": "galego",
        "kind": "native"
      },
      {
        "label": "Galician",
        "kind": "english"
      },
      {
        "label": "加利西亚语",
        "kind": "alias"
      },
      {
        "label": "galicien",
        "kind": "alias"
      },
      {
        "label": "gallego",
        "kind": "alias"
      }
    ],
    "tel": [
      {
        "label": "Telugu",
        "kind": "local"
      },
      {
        "label": "తెలుగు",
        "kind": "native"
      },
      {
        "label": "泰卢固语",
        "kind": "alias"
      },
      {
        "label": "télougou",
        "kind": "alias"
      }
    ],
    "mlt": [
      {
        "label": "Maltesisch",
        "kind": "local"
      },
      {
        "label": "Malti",
        "kind": "native"
      },
      {
        "label": "Maltese",
        "kind": "english"
      },
      {
        "label": "马耳他语",
        "kind": "alias"
      },
      {
        "label": "maltais",
        "kind": "alias"
      },
      {
        "label": "maltés",
        "kind": "alias"
      }
    ],
    "pus": [
      {
        "label": "Paschtu",
        "kind": "local"
      },
      {
        "label": "پښتو",
        "kind": "native"
      },
      {
        "label": "Pashto",
        "kind": "english"
      },
      {
        "label": "普什图语",
        "kind": "alias"
      },
      {
        "label": "pachto",
        "kind": "alias"
      },
      {
        "label": "pastún",
        "kind": "alias"
      }
    ],
    "tat": [
      {
        "label": "Tatarisch",
        "kind": "local"
      },
      {
        "label": "татар",
        "kind": "native"
      },
      {
        "label": "Tatar",
        "kind": "english"
      },
      {
        "label": "鞑靼语",
        "kind": "alias"
      },
      {
        "label": "tártaro",
        "kind": "alias"
      }
    ],
    "pan": [
      {
        "label": "Punjabi",
        "kind": "local"
      },
      {
        "label": "ਪੰਜਾਬੀ",
        "kind": "native"
      },
      {
        "label": "旁遮普语",
        "kind": "alias"
      },
      {
        "label": "pendjabi",
        "kind": "alias"
      },
      {
        "label": "punyabí",
        "kind": "alias"
      },
      {
        "label": "旁遮普文",
        "kind": "alias"
      },
      {
        "label": "旁遮普語",
        "kind": "alias"
      }
    ],
    "uzb": [
      {
        "label": "Usbekisch",
        "kind": "local"
      },
      {
        "label": "o‘zbek",
        "kind": "native"
      },
      {
        "label": "Uzbek",
        "kind": "english"
      },
      {
        "label": "乌兹别克语",
        "kind": "alias"
      },
      {
        "label": "ouzbek",
        "kind": "alias"
      },
      {
        "label": "uzbeko",
        "kind": "alias"
      }
    ],
    "ltz": [
      {
        "label": "Luxemburgisch",
        "kind": "local"
      },
      {
        "label": "Lëtzebuergesch",
        "kind": "native"
      },
      {
        "label": "Luxembourgish",
        "kind": "english"
      },
      {
        "label": "卢森堡语",
        "kind": "alias"
      },
      {
        "label": "luxembourgeois",
        "kind": "alias"
      },
      {
        "label": "luxemburgués",
        "kind": "alias"
      }
    ],
    "nep": [
      {
        "label": "Nepalesisch",
        "kind": "local"
      },
      {
        "label": "नेपाली",
        "kind": "native"
      },
      {
        "label": "Nepali",
        "kind": "english"
      },
      {
        "label": "尼泊尔语",
        "kind": "alias"
      },
      {
        "label": "népalais",
        "kind": "alias"
      },
      {
        "label": "nepalí",
        "kind": "alias"
      },
      {
        "label": "尼泊尔文",
        "kind": "alias"
      },
      {
        "label": "尼泊爾文",
        "kind": "alias"
      }
    ],
    "gla": [
      {
        "label": "Gälisch (Schottland)",
        "kind": "local"
      },
      {
        "label": "Gàidhlig",
        "kind": "native"
      },
      {
        "label": "Scottish Gaelic",
        "kind": "english"
      },
      {
        "label": "苏格兰盖尔语",
        "kind": "alias"
      },
      {
        "label": "gaélique écossais",
        "kind": "alias"
      },
      {
        "label": "gaélico escocés",
        "kind": "alias"
      }
    ],
    "bre": [
      {
        "label": "Bretonisch",
        "kind": "local"
      },
      {
        "label": "brezhoneg",
        "kind": "native"
      },
      {
        "label": "Breton",
        "kind": "english"
      },
      {
        "label": "布列塔尼语",
        "kind": "alias"
      },
      {
        "label": "bretón",
        "kind": "alias"
      }
    ],
    "cmn": [
      {
        "label": "Mandarin",
        "kind": "local"
      },
      {
        "label": "普通话",
        "kind": "native"
      },
      {
        "label": "mandarín",
        "kind": "alias"
      },
      {
        "label": "中文",
        "kind": "alias"
      },
      {
        "label": "chinese",
        "kind": "alias"
      },
      {
        "label": "mandarin chinese",
        "kind": "alias"
      },
      {
        "label": "standard chinese",
        "kind": "alias"
      },
      {
        "label": "putonghua",
        "kind": "alias"
      },
      {
        "label": "guoyu",
        "kind": "alias"
      },
      {
        "label": "汉语",
        "kind": "alias"
      },
      {
        "label": "国语",
        "kind": "alias"
      },
      {
        "label": "國語",
        "kind": "alias"
      },
      {
        "label": "华语",
        "kind": "alias"
      },
      {
        "label": "華語",
        "kind": "alias"
      },
      {
        "label": "官话",
        "kind": "alias"
      },
      {
        "label": "北方话",
        "kind": "alias"
      },
      {
        "label": "北方方言",
        "kind": "alias"
      },
      {
        "label": "中文普通话",
        "kind": "alias"
      }
    ],
    "kir": [
      {
        "label": "Kirgisisch",
        "kind": "local"
      },
      {
        "label": "кыргызча",
        "kind": "native"
      },
      {
        "label": "Kyrgyz",
        "kind": "english"
      },
      {
        "label": "吉尔吉斯语",
        "kind": "alias"
      },
      {
        "label": "kirghize",
        "kind": "alias"
      },
      {
        "label": "kirguís",
        "kind": "alias"
      },
      {
        "label": "柯尔克孜语",
        "kind": "alias"
      },
      {
        "label": "柯爾克孜語",
        "kind": "alias"
      },
      {
        "label": "吉爾吉斯語",
        "kind": "alias"
      }
    ],
    "fao": [
      {
        "label": "Färöisch",
        "kind": "local"
      },
      {
        "label": "føroyskt",
        "kind": "native"
      },
      {
        "label": "Faroese",
        "kind": "english"
      },
      {
        "label": "法罗语",
        "kind": "alias"
      },
      {
        "label": "féroïen",
        "kind": "alias"
      },
      {
        "label": "feroés",
        "kind": "alias"
      }
    ],
    "amh": [
      {
        "label": "Amharisch",
        "kind": "local"
      },
      {
        "label": "አማርኛ",
        "kind": "native"
      },
      {
        "label": "Amharic",
        "kind": "english"
      },
      {
        "label": "阿姆哈拉语",
        "kind": "alias"
      },
      {
        "label": "amharique",
        "kind": "alias"
      },
      {
        "label": "amárico",
        "kind": "alias"
      },
      {
        "label": "阿姆哈拉文",
        "kind": "alias"
      },
      {
        "label": "阿姆哈拉語",
        "kind": "alias"
      }
    ],
    "kan": [
      {
        "label": "Kannada",
        "kind": "local"
      },
      {
        "label": "ಕನ್ನಡ",
        "kind": "native"
      },
      {
        "label": "卡纳达语",
        "kind": "alias"
      },
      {
        "label": "canarés",
        "kind": "alias"
      }
    ],
    "mar": [
      {
        "label": "Marathi",
        "kind": "local"
      },
      {
        "label": "मराठी",
        "kind": "native"
      },
      {
        "label": "马拉地语",
        "kind": "alias"
      },
      {
        "label": "maratí",
        "kind": "alias"
      }
    ],
    "tgl": [
      {
        "label": "Tagalog",
        "kind": "local"
      },
      {
        "label": "他加禄语",
        "kind": "alias"
      },
      {
        "label": "tagalo",
        "kind": "alias"
      },
      {
        "label": "他加禄文",
        "kind": "alias"
      },
      {
        "label": "他加祿文",
        "kind": "alias"
      }
    ],
    "roh": [
      {
        "label": "Rätoromanisch",
        "kind": "local"
      },
      {
        "label": "rumantsch",
        "kind": "native"
      },
      {
        "label": "Romansh",
        "kind": "english"
      },
      {
        "label": "罗曼什语",
        "kind": "alias"
      },
      {
        "label": "romanche",
        "kind": "alias"
      }
    ],
    "bak": [
      {
        "label": "Baschkirisch",
        "kind": "local"
      },
      {
        "label": "Bashkir",
        "kind": "english"
      },
      {
        "label": "巴什基尔语",
        "kind": "alias"
      },
      {
        "label": "bachkir",
        "kind": "alias"
      },
      {
        "label": "baskir",
        "kind": "alias"
      }
    ],
    "mal": [
      {
        "label": "Malayalam",
        "kind": "local"
      },
      {
        "label": "മലയാളം",
        "kind": "native"
      },
      {
        "label": "马拉雅拉姆语",
        "kind": "alias"
      },
      {
        "label": "malayálam",
        "kind": "alias"
      }
    ],
    "mya": [
      {
        "label": "Birmanisch",
        "kind": "local"
      },
      {
        "label": "မြန်မာ",
        "kind": "native"
      },
      {
        "label": "Burmese",
        "kind": "english"
      },
      {
        "label": "缅甸语",
        "kind": "alias"
      },
      {
        "label": "birman",
        "kind": "alias"
      },
      {
        "label": "birmano",
        "kind": "alias"
      },
      {
        "label": "缅语",
        "kind": "alias"
      },
      {
        "label": "缅文",
        "kind": "alias"
      },
      {
        "label": "緬語",
        "kind": "alias"
      },
      {
        "label": "緬文",
        "kind": "alias"
      }
    ],
    "que": [
      {
        "label": "Quechua",
        "kind": "local"
      },
      {
        "label": "Runasimi",
        "kind": "native"
      },
      {
        "label": "克丘亚语",
        "kind": "alias"
      }
    ],
    "jav": [
      {
        "label": "Javanisch",
        "kind": "local"
      },
      {
        "label": "Jawa",
        "kind": "native"
      },
      {
        "label": "Javanese",
        "kind": "english"
      },
      {
        "label": "爪哇语",
        "kind": "alias"
      },
      {
        "label": "javanais",
        "kind": "alias"
      },
      {
        "label": "javanés",
        "kind": "alias"
      }
    ],
    "uig": [
      {
        "label": "Uigurisch",
        "kind": "local"
      },
      {
        "label": "ئۇيغۇرچە",
        "kind": "native"
      },
      {
        "label": "Uyghur",
        "kind": "english"
      },
      {
        "label": "维吾尔语",
        "kind": "alias"
      },
      {
        "label": "ouïghour",
        "kind": "alias"
      },
      {
        "label": "uigur",
        "kind": "alias"
      },
      {
        "label": "维语",
        "kind": "alias"
      },
      {
        "label": "維語",
        "kind": "alias"
      },
      {
        "label": "維吾爾語",
        "kind": "alias"
      }
    ],
    "mri": [
      {
        "label": "Māori",
        "kind": "local"
      },
      {
        "label": "毛利语",
        "kind": "alias"
      },
      {
        "label": "maori",
        "kind": "alias"
      },
      {
        "label": "maorí",
        "kind": "alias"
      }
    ],
    "tgk": [
      {
        "label": "Tadschikisch",
        "kind": "local"
      },
      {
        "label": "тоҷикӣ",
        "kind": "native"
      },
      {
        "label": "Tajik",
        "kind": "english"
      },
      {
        "label": "塔吉克语",
        "kind": "alias"
      },
      {
        "label": "tadjik",
        "kind": "alias"
      },
      {
        "label": "tayiko",
        "kind": "alias"
      },
      {
        "label": "塔吉克語",
        "kind": "alias"
      }
    ],
    "tuk": [
      {
        "label": "Turkmenisch",
        "kind": "local"
      },
      {
        "label": "türkmen dili",
        "kind": "native"
      },
      {
        "label": "Turkmen",
        "kind": "english"
      },
      {
        "label": "土库曼语",
        "kind": "alias"
      },
      {
        "label": "turkmène",
        "kind": "alias"
      },
      {
        "label": "turcomano",
        "kind": "alias"
      }
    ],
    "abk": [
      {
        "label": "Abchasisch",
        "kind": "local"
      },
      {
        "label": "Abkhaz",
        "kind": "english"
      },
      {
        "label": "阿布哈西亚语",
        "kind": "alias"
      },
      {
        "label": "Abkhazian",
        "kind": "alias"
      },
      {
        "label": "abkhaze",
        "kind": "alias"
      },
      {
        "label": "abjasio",
        "kind": "alias"
      }
    ],
    "guj": [
      {
        "label": "Gujarati",
        "kind": "local"
      },
      {
        "label": "ગુજરાતી",
        "kind": "native"
      },
      {
        "label": "古吉拉特语",
        "kind": "alias"
      },
      {
        "label": "goudjarati",
        "kind": "alias"
      },
      {
        "label": "guyaratí",
        "kind": "alias"
      }
    ],
    "szl": [
      {
        "label": "Schlesisch (Wasserpolnisch)",
        "kind": "local"
      },
      {
        "label": "ślōnski",
        "kind": "native"
      },
      {
        "label": "Silesian",
        "kind": "english"
      },
      {
        "label": "西里西亚语",
        "kind": "alias"
      },
      {
        "label": "silésien",
        "kind": "alias"
      },
      {
        "label": "silesio",
        "kind": "alias"
      }
    ],
    "khm": [
      {
        "label": "Khmer",
        "kind": "local"
      },
      {
        "label": "ខ្មែរ",
        "kind": "native"
      },
      {
        "label": "高棉语",
        "kind": "alias"
      },
      {
        "label": "jemer",
        "kind": "alias"
      },
      {
        "label": "高棉文",
        "kind": "alias"
      },
      {
        "label": "柬语",
        "kind": "alias"
      },
      {
        "label": "柬語",
        "kind": "alias"
      },
      {
        "label": "柬埔寨语",
        "kind": "alias"
      },
      {
        "label": "柬埔寨語",
        "kind": "alias"
      }
    ],
    "zul": [
      {
        "label": "Zulu",
        "kind": "local"
      },
      {
        "label": "isiZulu",
        "kind": "native"
      },
      {
        "label": "祖鲁语",
        "kind": "alias"
      },
      {
        "label": "zoulou",
        "kind": "alias"
      },
      {
        "label": "zulú",
        "kind": "alias"
      }
    ],
    "bod": [
      {
        "label": "Tibetisch",
        "kind": "local"
      },
      {
        "label": "བོད་སྐད་",
        "kind": "native"
      },
      {
        "label": "Tibetan",
        "kind": "english"
      },
      {
        "label": "藏语",
        "kind": "alias"
      },
      {
        "label": "tibétain",
        "kind": "alias"
      },
      {
        "label": "tibetano",
        "kind": "alias"
      },
      {
        "label": "藏文",
        "kind": "alias"
      },
      {
        "label": "藏語",
        "kind": "alias"
      },
      {
        "label": "藏話",
        "kind": "alias"
      }
    ],
    "che": [
      {
        "label": "Tschetschenisch",
        "kind": "local"
      },
      {
        "label": "нохчийн",
        "kind": "native"
      },
      {
        "label": "Chechen",
        "kind": "english"
      },
      {
        "label": "车臣语",
        "kind": "alias"
      },
      {
        "label": "tchétchène",
        "kind": "alias"
      },
      {
        "label": "checheno",
        "kind": "alias"
      }
    ],
    "zza": [
      {
        "label": "Zaza",
        "kind": "local"
      },
      {
        "label": "Zazaki",
        "kind": "english"
      },
      {
        "label": "扎扎语",
        "kind": "alias"
      }
    ],
    "asm": [
      {
        "label": "Assamesisch",
        "kind": "local"
      },
      {
        "label": "অসমীয়া",
        "kind": "native"
      },
      {
        "label": "Assamese",
        "kind": "english"
      },
      {
        "label": "阿萨姆语",
        "kind": "alias"
      },
      {
        "label": "assamais",
        "kind": "alias"
      },
      {
        "label": "asamés",
        "kind": "alias"
      }
    ],
    "cor": [
      {
        "label": "Kornisch",
        "kind": "local"
      },
      {
        "label": "kernewek",
        "kind": "native"
      },
      {
        "label": "Cornish",
        "kind": "english"
      },
      {
        "label": "康沃尔语",
        "kind": "alias"
      },
      {
        "label": "cornique",
        "kind": "alias"
      },
      {
        "label": "córnico",
        "kind": "alias"
      }
    ],
    "chv": [
      {
        "label": "Tschuwaschisch",
        "kind": "local"
      },
      {
        "label": "чӑваш",
        "kind": "native"
      },
      {
        "label": "Chuvash",
        "kind": "english"
      },
      {
        "label": "楚瓦什语",
        "kind": "alias"
      },
      {
        "label": "tchouvache",
        "kind": "alias"
      },
      {
        "label": "chuvasio",
        "kind": "alias"
      }
    ],
    "haw": [
      {
        "label": "Hawaiisch",
        "kind": "local"
      },
      {
        "label": "ʻŌlelo Hawaiʻi",
        "kind": "native"
      },
      {
        "label": "Hawaiian",
        "kind": "english"
      },
      {
        "label": "夏威夷语",
        "kind": "alias"
      },
      {
        "label": "hawaïen",
        "kind": "alias"
      },
      {
        "label": "hawaiano",
        "kind": "alias"
      }
    ],
    "sco": [
      {
        "label": "Schottisch",
        "kind": "local"
      },
      {
        "label": "Scots",
        "kind": "english"
      },
      {
        "label": "苏格兰语",
        "kind": "alias"
      },
      {
        "label": "écossais",
        "kind": "alias"
      },
      {
        "label": "escocés",
        "kind": "alias"
      }
    ],
    "vol": [
      {
        "label": "Volapük",
        "kind": "local"
      },
      {
        "label": "沃拉普克语",
        "kind": "alias"
      }
    ],
    "hbs": [
      {
        "label": "Serbo-Kroatisch",
        "kind": "local"
      },
      {
        "label": "srpskohrvatski",
        "kind": "native"
      },
      {
        "label": "Serbo-Croatian",
        "kind": "english"
      },
      {
        "label": "塞尔维亚-克罗地亚语",
        "kind": "alias"
      },
      {
        "label": "serbo-croate",
        "kind": "alias"
      },
      {
        "label": "serbocroata",
        "kind": "alias"
      }
    ],
    "hau": [
      {
        "label": "Haussa",
        "kind": "local"
      },
      {
        "label": "Hausa",
        "kind": "native"
      },
      {
        "label": "豪萨语",
        "kind": "alias"
      },
      {
        "label": "haoussa",
        "kind": "alias"
      }
    ],
    "grn": [
      {
        "label": "Guaraní",
        "kind": "local"
      },
      {
        "label": "Guarani",
        "kind": "english"
      },
      {
        "label": "瓜拉尼语",
        "kind": "alias"
      }
    ],
    "som": [
      {
        "label": "Somali",
        "kind": "local"
      },
      {
        "label": "Soomaali",
        "kind": "native"
      },
      {
        "label": "索马里语",
        "kind": "alias"
      },
      {
        "label": "somalí",
        "kind": "alias"
      }
    ],
    "mlg": [
      {
        "label": "Malagasy",
        "kind": "local"
      },
      {
        "label": "马拉加斯语",
        "kind": "alias"
      },
      {
        "label": "malgache",
        "kind": "alias"
      }
    ],
    "srd": [
      {
        "label": "Sardisch",
        "kind": "local"
      },
      {
        "label": "sardu",
        "kind": "native"
      },
      {
        "label": "Sardinian",
        "kind": "english"
      },
      {
        "label": "萨丁语",
        "kind": "alias"
      },
      {
        "label": "sarde",
        "kind": "alias"
      },
      {
        "label": "sardo",
        "kind": "alias"
      }
    ],
    "ory": [
      {
        "label": "Oriya",
        "kind": "local"
      },
      {
        "label": "ଓଡ଼ିଆ",
        "kind": "native"
      },
      {
        "label": "Odia",
        "kind": "english"
      },
      {
        "label": "奥里亚语",
        "kind": "alias"
      }
    ],
    "glv": [
      {
        "label": "Manx",
        "kind": "local"
      },
      {
        "label": "Gaelg",
        "kind": "native"
      },
      {
        "label": "马恩语",
        "kind": "alias"
      },
      {
        "label": "mannois",
        "kind": "alias"
      },
      {
        "label": "manés",
        "kind": "alias"
      }
    ],
    "arg": [
      {
        "label": "Aragonesisch",
        "kind": "local"
      },
      {
        "label": "Aragonese",
        "kind": "english"
      },
      {
        "label": "阿拉贡语",
        "kind": "alias"
      },
      {
        "label": "aragonais",
        "kind": "alias"
      },
      {
        "label": "aragonés",
        "kind": "alias"
      }
    ],
    "crh": [
      {
        "label": "Krimtatarisch",
        "kind": "local"
      },
      {
        "label": "Crimean Tatar",
        "kind": "english"
      },
      {
        "label": "克里米亚鞑靼语",
        "kind": "alias"
      },
      {
        "label": "tatar de Crimée",
        "kind": "alias"
      },
      {
        "label": "tártaro de Crimea",
        "kind": "alias"
      }
    ],
    "lao": [
      {
        "label": "Laotisch",
        "kind": "local"
      },
      {
        "label": "ລາວ",
        "kind": "native"
      },
      {
        "label": "Lao",
        "kind": "english"
      },
      {
        "label": "老挝语",
        "kind": "alias"
      }
    ],
    "sah": [
      {
        "label": "Jakutisch",
        "kind": "local"
      },
      {
        "label": "саха тыла",
        "kind": "native"
      },
      {
        "label": "Yakut",
        "kind": "english"
      },
      {
        "label": "萨哈语",
        "kind": "alias"
      },
      {
        "label": "iakoute",
        "kind": "alias"
      },
      {
        "label": "sakha",
        "kind": "alias"
      }
    ],
    "cop": [
      {
        "label": "Koptisch",
        "kind": "local"
      },
      {
        "label": "Coptic",
        "kind": "english"
      },
      {
        "label": "科普特语",
        "kind": "alias"
      },
      {
        "label": "copte",
        "kind": "alias"
      },
      {
        "label": "copto",
        "kind": "alias"
      }
    ],
    "pli": [
      {
        "label": "Pali",
        "kind": "local"
      },
      {
        "label": "巴利语",
        "kind": "alias"
      }
    ],
    "xho": [
      {
        "label": "Xhosa",
        "kind": "local"
      },
      {
        "label": "IsiXhosa",
        "kind": "native"
      },
      {
        "label": "科萨语",
        "kind": "alias"
      }
    ],
    "csb": [
      {
        "label": "Kaschubisch",
        "kind": "local"
      },
      {
        "label": "Kashubian",
        "kind": "english"
      },
      {
        "label": "卡舒比语",
        "kind": "alias"
      },
      {
        "label": "kachoube",
        "kind": "alias"
      },
      {
        "label": "casubio",
        "kind": "alias"
      }
    ],
    "arn": [
      {
        "label": "Mapudungun",
        "kind": "local"
      },
      {
        "label": "马普切语",
        "kind": "alias"
      },
      {
        "label": "Mapuche",
        "kind": "alias"
      }
    ],
    "sin": [
      {
        "label": "Singhalesisch",
        "kind": "local"
      },
      {
        "label": "සිංහල",
        "kind": "native"
      },
      {
        "label": "Sinhala",
        "kind": "english"
      },
      {
        "label": "僧伽罗语",
        "kind": "alias"
      },
      {
        "label": "cingalais",
        "kind": "alias"
      },
      {
        "label": "cingalés",
        "kind": "alias"
      },
      {
        "label": "sinhalese",
        "kind": "alias"
      }
    ],
    "ang": [
      {
        "label": "Altenglisch",
        "kind": "local"
      },
      {
        "label": "Old English",
        "kind": "english"
      },
      {
        "label": "古英语",
        "kind": "alias"
      },
      {
        "label": "ancien anglais",
        "kind": "alias"
      },
      {
        "label": "inglés antiguo",
        "kind": "alias"
      }
    ],
    "kas": [
      {
        "label": "Kaschmiri",
        "kind": "local"
      },
      {
        "label": "کٲشُر",
        "kind": "native"
      },
      {
        "label": "Kashmiri",
        "kind": "english"
      },
      {
        "label": "克什米尔语",
        "kind": "alias"
      },
      {
        "label": "cachemiri",
        "kind": "alias"
      },
      {
        "label": "cachemir",
        "kind": "alias"
      }
    ],
    "got": [
      {
        "label": "Gotisch",
        "kind": "local"
      },
      {
        "label": "Gothic",
        "kind": "english"
      },
      {
        "label": "哥特语",
        "kind": "alias"
      },
      {
        "label": "gotique",
        "kind": "alias"
      },
      {
        "label": "gótico",
        "kind": "alias"
      }
    ],
    "egy": [
      {
        "label": "Ägyptisch",
        "kind": "local"
      },
      {
        "label": "Egyptian",
        "kind": "english"
      },
      {
        "label": "古埃及语",
        "kind": "alias"
      },
      {
        "label": "Ancient Egyptian",
        "kind": "alias"
      },
      {
        "label": "égyptien ancien",
        "kind": "alias"
      },
      {
        "label": "egipcio antiguo",
        "kind": "alias"
      }
    ],
    "rom": [
      {
        "label": "Romani",
        "kind": "local"
      },
      {
        "label": "吉普赛语",
        "kind": "alias"
      },
      {
        "label": "Romany",
        "kind": "alias"
      },
      {
        "label": "romaní",
        "kind": "alias"
      }
    ],
    "snd": [
      {
        "label": "Sindhi",
        "kind": "local"
      },
      {
        "label": "سنڌي",
        "kind": "native"
      },
      {
        "label": "信德语",
        "kind": "alias"
      },
      {
        "label": "sindi",
        "kind": "alias"
      }
    ],
    "cos": [
      {
        "label": "Korsisch",
        "kind": "local"
      },
      {
        "label": "Corsican",
        "kind": "english"
      },
      {
        "label": "科西嘉语",
        "kind": "alias"
      },
      {
        "label": "corse",
        "kind": "alias"
      },
      {
        "label": "corso",
        "kind": "alias"
      }
    ],
    "ceb": [
      {
        "label": "Cebuano",
        "kind": "local"
      },
      {
        "label": "宿务语",
        "kind": "alias"
      }
    ],
    "nds": [
      {
        "label": "Niederdeutsch",
        "kind": "local"
      },
      {
        "label": "Neddersass’sch",
        "kind": "native"
      },
      {
        "label": "Low German",
        "kind": "english"
      },
      {
        "label": "低地德语",
        "kind": "alias"
      },
      {
        "label": "bas-allemand",
        "kind": "alias"
      },
      {
        "label": "bajo alemán",
        "kind": "alias"
      }
    ],
    "aym": [
      {
        "label": "Aymara",
        "kind": "local"
      },
      {
        "label": "艾马拉语",
        "kind": "alias"
      },
      {
        "label": "aimara",
        "kind": "alias"
      }
    ],
    "scn": [
      {
        "label": "Sizilianisch",
        "kind": "local"
      },
      {
        "label": "Sicilian",
        "kind": "english"
      },
      {
        "label": "西西里语",
        "kind": "alias"
      },
      {
        "label": "sicilien",
        "kind": "alias"
      },
      {
        "label": "siciliano",
        "kind": "alias"
      }
    ],
    "ast": [
      {
        "label": "Asturisch",
        "kind": "local"
      },
      {
        "label": "asturianu",
        "kind": "native"
      },
      {
        "label": "Asturian",
        "kind": "english"
      },
      {
        "label": "阿斯图里亚斯语",
        "kind": "alias"
      },
      {
        "label": "asturien",
        "kind": "alias"
      },
      {
        "label": "asturiano",
        "kind": "alias"
      }
    ],
    "dzo": [
      {
        "label": "Dzongkha",
        "kind": "local"
      },
      {
        "label": "རྫོང་ཁ",
        "kind": "native"
      },
      {
        "label": "宗卡语",
        "kind": "alias"
      }
    ],
    "tok": [
      {
        "label": "Toki Pona",
        "kind": "local"
      },
      {
        "label": "道本语",
        "kind": "alias"
      }
    ],
    "kal": [
      {
        "label": "Grönländisch",
        "kind": "local"
      },
      {
        "label": "kalaallisut",
        "kind": "native"
      },
      {
        "label": "Greenlandic",
        "kind": "english"
      },
      {
        "label": "格陵兰语",
        "kind": "alias"
      },
      {
        "label": "groenlandais",
        "kind": "alias"
      },
      {
        "label": "groenlandés",
        "kind": "alias"
      }
    ],
    "ava": [
      {
        "label": "Awarisch",
        "kind": "local"
      },
      {
        "label": "Avar",
        "kind": "english"
      },
      {
        "label": "阿瓦尔语",
        "kind": "alias"
      },
      {
        "label": "Avaric",
        "kind": "alias"
      }
    ],
    "sun": [
      {
        "label": "Sundanesisch",
        "kind": "local"
      },
      {
        "label": "Basa Sunda",
        "kind": "native"
      },
      {
        "label": "Sundanese",
        "kind": "english"
      },
      {
        "label": "巽他语",
        "kind": "alias"
      },
      {
        "label": "soundanais",
        "kind": "alias"
      },
      {
        "label": "sundanés",
        "kind": "alias"
      }
    ],
    "wln": [
      {
        "label": "Wallonisch",
        "kind": "local"
      },
      {
        "label": "Walloon",
        "kind": "english"
      },
      {
        "label": "瓦隆语",
        "kind": "alias"
      },
      {
        "label": "wallon",
        "kind": "alias"
      },
      {
        "label": "valón",
        "kind": "alias"
      }
    ],
    "cnr": [
      {
        "label": "Montenegrinisch",
        "kind": "local"
      },
      {
        "label": "crnogorski",
        "kind": "native"
      },
      {
        "label": "Montenegrin",
        "kind": "english"
      },
      {
        "label": "黑山语",
        "kind": "alias"
      },
      {
        "label": "monténégrin",
        "kind": "alias"
      },
      {
        "label": "montenegrino",
        "kind": "alias"
      }
    ],
    "prs": [
      {
        "label": "Dari",
        "kind": "local"
      },
      {
        "label": "دری",
        "kind": "native"
      },
      {
        "label": "达里语",
        "kind": "alias"
      },
      {
        "label": "darí",
        "kind": "alias"
      }
    ],
    "nap": [
      {
        "label": "Neapolitanisch",
        "kind": "local"
      },
      {
        "label": "Neapolitan",
        "kind": "english"
      },
      {
        "label": "那不勒斯语",
        "kind": "alias"
      },
      {
        "label": "napolitain",
        "kind": "alias"
      },
      {
        "label": "napolitano",
        "kind": "alias"
      }
    ],
    "tir": [
      {
        "label": "Tigrinya",
        "kind": "local"
      },
      {
        "label": "ትግርኛ",
        "kind": "native"
      },
      {
        "label": "提格利尼亚语",
        "kind": "alias"
      },
      {
        "label": "tigrigna",
        "kind": "alias"
      },
      {
        "label": "tigriña",
        "kind": "alias"
      }
    ],
    "ain": [
      {
        "label": "Ainu",
        "kind": "local"
      },
      {
        "label": "阿伊努语",
        "kind": "alias"
      },
      {
        "label": "aïnou",
        "kind": "alias"
      }
    ],
    "udm": [
      {
        "label": "Udmurtisch",
        "kind": "local"
      },
      {
        "label": "Udmurt",
        "kind": "english"
      },
      {
        "label": "乌德穆尔特语",
        "kind": "alias"
      },
      {
        "label": "oudmourte",
        "kind": "alias"
      }
    ],
    "akk": [
      {
        "label": "Akkadisch",
        "kind": "local"
      },
      {
        "label": "Akkadian",
        "kind": "english"
      },
      {
        "label": "阿卡德语",
        "kind": "alias"
      },
      {
        "label": "akkadien",
        "kind": "alias"
      },
      {
        "label": "acadio",
        "kind": "alias"
      }
    ],
    "gag": [
      {
        "label": "Gagausisch",
        "kind": "local"
      },
      {
        "label": "Gagauz",
        "kind": "english"
      },
      {
        "label": "加告兹语",
        "kind": "alias"
      },
      {
        "label": "gagaouze",
        "kind": "alias"
      },
      {
        "label": "gagauzo",
        "kind": "alias"
      }
    ],
    "ibo": [
      {
        "label": "Igbo",
        "kind": "local"
      },
      {
        "label": "伊博语",
        "kind": "alias"
      }
    ],
    "krl": [
      {
        "label": "Karelisch",
        "kind": "local"
      },
      {
        "label": "Karelian",
        "kind": "english"
      },
      {
        "label": "卡累利阿语",
        "kind": "alias"
      },
      {
        "label": "carélien",
        "kind": "alias"
      },
      {
        "label": "carelio",
        "kind": "alias"
      }
    ],
    "ave": [
      {
        "label": "Avestisch",
        "kind": "local"
      },
      {
        "label": "Avestan",
        "kind": "english"
      },
      {
        "label": "阿维斯塔语",
        "kind": "alias"
      },
      {
        "label": "avestique",
        "kind": "alias"
      },
      {
        "label": "avéstico",
        "kind": "alias"
      }
    ],
    "div": [
      {
        "label": "Dhivehi",
        "kind": "local"
      },
      {
        "label": "迪维希语",
        "kind": "alias"
      },
      {
        "label": "maldivien",
        "kind": "alias"
      },
      {
        "label": "divehi",
        "kind": "alias"
      },
      {
        "label": "maldivian",
        "kind": "alias"
      }
    ],
    "isv": [
      {
        "label": "Interslavic",
        "kind": "english"
      }
    ],
    "tyv": [
      {
        "label": "Tuwinisch",
        "kind": "local"
      },
      {
        "label": "Tuvan",
        "kind": "english"
      },
      {
        "label": "图瓦语",
        "kind": "alias"
      },
      {
        "label": "Tuvinian",
        "kind": "alias"
      },
      {
        "label": "touvain",
        "kind": "alias"
      },
      {
        "label": "tuviniano",
        "kind": "alias"
      }
    ],
    "lmo": [
      {
        "label": "Lombardisch",
        "kind": "local"
      },
      {
        "label": "Lombard",
        "kind": "native"
      },
      {
        "label": "伦巴第语",
        "kind": "alias"
      },
      {
        "label": "lombardo",
        "kind": "alias"
      }
    ],
    "ota": [
      {
        "label": "Osmanisch",
        "kind": "local"
      },
      {
        "label": "Ottoman Turkish",
        "kind": "english"
      },
      {
        "label": "奥斯曼土耳其语",
        "kind": "alias"
      },
      {
        "label": "turc ottoman",
        "kind": "alias"
      },
      {
        "label": "turco otomano",
        "kind": "alias"
      }
    ],
    "myv": [
      {
        "label": "Ersja-Mordwinisch",
        "kind": "local"
      },
      {
        "label": "Erzya",
        "kind": "english"
      },
      {
        "label": "厄尔兹亚语",
        "kind": "alias"
      }
    ],
    "bal": [
      {
        "label": "Belutschisch",
        "kind": "local"
      },
      {
        "label": "Balochi",
        "kind": "english"
      },
      {
        "label": "俾路支语",
        "kind": "alias"
      },
      {
        "label": "Baluchi",
        "kind": "alias"
      },
      {
        "label": "baloutchi",
        "kind": "alias"
      }
    ],
    "yor": [
      {
        "label": "Yoruba",
        "kind": "local"
      },
      {
        "label": "Èdè Yorùbá",
        "kind": "native"
      },
      {
        "label": "约鲁巴语",
        "kind": "alias"
      }
    ],
    "pms": [
      {
        "label": "Piemontesisch",
        "kind": "local"
      },
      {
        "label": "Piedmontese",
        "kind": "english"
      },
      {
        "label": "piémontais",
        "kind": "alias"
      }
    ],
    "ady": [
      {
        "label": "Adygeisch",
        "kind": "local"
      },
      {
        "label": "Adyghe",
        "kind": "english"
      },
      {
        "label": "阿迪格语",
        "kind": "alias"
      },
      {
        "label": "adyguéen",
        "kind": "alias"
      },
      {
        "label": "adigué",
        "kind": "alias"
      }
    ],
    "wol": [
      {
        "label": "Wolof",
        "kind": "local"
      },
      {
        "label": "沃洛夫语",
        "kind": "alias"
      },
      {
        "label": "wólof",
        "kind": "alias"
      }
    ],
    "fur": [
      {
        "label": "Friaulisch",
        "kind": "local"
      },
      {
        "label": "furlan",
        "kind": "native"
      },
      {
        "label": "Friulian",
        "kind": "english"
      },
      {
        "label": "弗留利语",
        "kind": "alias"
      },
      {
        "label": "frioulan",
        "kind": "alias"
      },
      {
        "label": "friulano",
        "kind": "alias"
      }
    ],
    "smo": [
      {
        "label": "Samoanisch",
        "kind": "local"
      },
      {
        "label": "Samoan",
        "kind": "english"
      },
      {
        "label": "萨摩亚语",
        "kind": "alias"
      },
      {
        "label": "samoano",
        "kind": "alias"
      }
    ],
    "rue": [
      {
        "label": "Russinisch",
        "kind": "local"
      },
      {
        "label": "Rusyn",
        "kind": "english"
      },
      {
        "label": "ruthène",
        "kind": "alias"
      }
    ],
    "sot": [
      {
        "label": "Süd-Sotho",
        "kind": "local"
      },
      {
        "label": "Sesotho",
        "kind": "native"
      },
      {
        "label": "南索托语",
        "kind": "alias"
      },
      {
        "label": "Southern Sotho",
        "kind": "alias"
      },
      {
        "label": "sotho du Sud",
        "kind": "alias"
      },
      {
        "label": "sotho meridional",
        "kind": "alias"
      }
    ],
    "hat": [
      {
        "label": "Haiti-Kreolisch",
        "kind": "local"
      },
      {
        "label": "Haitian Creole",
        "kind": "english"
      },
      {
        "label": "海地克里奥尔语",
        "kind": "alias"
      },
      {
        "label": "créole haïtien",
        "kind": "alias"
      },
      {
        "label": "criollo haitiano",
        "kind": "alias"
      }
    ],
    "syc": [
      {
        "label": "Altsyrisch",
        "kind": "local"
      },
      {
        "label": "Syriac",
        "kind": "english"
      },
      {
        "label": "古典叙利亚语",
        "kind": "alias"
      },
      {
        "label": "Classical Syriac",
        "kind": "alias"
      },
      {
        "label": "syriaque classique",
        "kind": "alias"
      },
      {
        "label": "siríaco clásico",
        "kind": "alias"
      }
    ],
    "kom": [
      {
        "label": "Komi",
        "kind": "local"
      },
      {
        "label": "科米语",
        "kind": "alias"
      }
    ],
    "kin": [
      {
        "label": "Kinyarwanda",
        "kind": "local"
      },
      {
        "label": "Ikinyarwanda",
        "kind": "native"
      },
      {
        "label": "卢旺达语",
        "kind": "alias"
      }
    ],
    "hif": [
      {
        "label": "Fidschi-Hindi",
        "kind": "local"
      },
      {
        "label": "Fiji Hindi",
        "kind": "english"
      },
      {
        "label": "hindi fidjien",
        "kind": "alias"
      }
    ],
    "tpi": [
      {
        "label": "Neumelanesisch",
        "kind": "local"
      },
      {
        "label": "Tok Pisin",
        "kind": "english"
      },
      {
        "label": "托克皮辛语",
        "kind": "alias"
      }
    ],
    "nav": [
      {
        "label": "Navajo",
        "kind": "local"
      },
      {
        "label": "纳瓦霍语",
        "kind": "alias"
      }
    ],
    "ton": [
      {
        "label": "Tongaisch",
        "kind": "local"
      },
      {
        "label": "lea fakatonga",
        "kind": "native"
      },
      {
        "label": "Tongan",
        "kind": "english"
      },
      {
        "label": "汤加语",
        "kind": "alias"
      },
      {
        "label": "tongien",
        "kind": "alias"
      },
      {
        "label": "tongano",
        "kind": "alias"
      }
    ],
    "nob": [
      {
        "label": "Norwegisch (Bokmål)",
        "kind": "local"
      },
      {
        "label": "norsk bokmål",
        "kind": "native"
      },
      {
        "label": "Bokmål",
        "kind": "english"
      },
      {
        "label": "书面挪威语",
        "kind": "alias"
      },
      {
        "label": "Norwegian Bokmål",
        "kind": "alias"
      },
      {
        "label": "norvégien bokmål",
        "kind": "alias"
      },
      {
        "label": "noruego bokmal",
        "kind": "alias"
      }
    ],
    "nno": [
      {
        "label": "Norwegisch (Nynorsk)",
        "kind": "local"
      },
      {
        "label": "norsk nynorsk",
        "kind": "native"
      },
      {
        "label": "Nynorsk",
        "kind": "english"
      },
      {
        "label": "挪威尼诺斯克语",
        "kind": "alias"
      },
      {
        "label": "Norwegian Nynorsk",
        "kind": "alias"
      },
      {
        "label": "norvégien nynorsk",
        "kind": "alias"
      },
      {
        "label": "noruego nynorsk",
        "kind": "alias"
      }
    ],
    "kok": [
      {
        "label": "Konkani",
        "kind": "local"
      },
      {
        "label": "कोंकणी",
        "kind": "native"
      },
      {
        "label": "孔卡尼语",
        "kind": "alias"
      },
      {
        "label": "konkaní",
        "kind": "alias"
      }
    ],
    "mai": [
      {
        "label": "Maithili",
        "kind": "local"
      },
      {
        "label": "मैथिली",
        "kind": "native"
      },
      {
        "label": "迈蒂利语",
        "kind": "alias"
      },
      {
        "label": "maïthili",
        "kind": "alias"
      }
    ],
    "mnc": [
      {
        "label": "Mandschurisch",
        "kind": "local"
      },
      {
        "label": "Manchu",
        "kind": "english"
      },
      {
        "label": "满语",
        "kind": "alias"
      },
      {
        "label": "mandchou",
        "kind": "alias"
      },
      {
        "label": "manchú",
        "kind": "alias"
      },
      {
        "label": "滿語",
        "kind": "alias"
      }
    ],
    "liv": [
      {
        "label": "Livisch",
        "kind": "local"
      },
      {
        "label": "Livonian",
        "kind": "english"
      },
      {
        "label": "livonien",
        "kind": "alias"
      }
    ],
    "nov": [
      {
        "label": "Novial",
        "kind": "local"
      }
    ],
    "tsn": [
      {
        "label": "Tswana",
        "kind": "local"
      },
      {
        "label": "Setswana",
        "kind": "native"
      },
      {
        "label": "茨瓦纳语",
        "kind": "alias"
      },
      {
        "label": "setsuana",
        "kind": "alias"
      }
    ],
    "vec": [
      {
        "label": "Venetisch",
        "kind": "local"
      },
      {
        "label": "veneto",
        "kind": "native"
      },
      {
        "label": "Venetian",
        "kind": "english"
      },
      {
        "label": "威尼斯语",
        "kind": "alias"
      },
      {
        "label": "vénitien",
        "kind": "alias"
      },
      {
        "label": "veneciano",
        "kind": "alias"
      }
    ],
    "sux": [
      {
        "label": "Sumerisch",
        "kind": "local"
      },
      {
        "label": "Sumerian",
        "kind": "english"
      },
      {
        "label": "苏美尔语",
        "kind": "alias"
      },
      {
        "label": "sumérien",
        "kind": "alias"
      },
      {
        "label": "sumerio",
        "kind": "alias"
      }
    ],
    "hsb": [
      {
        "label": "Obersorbisch",
        "kind": "local"
      },
      {
        "label": "hornjoserbšćina",
        "kind": "native"
      },
      {
        "label": "Upper Sorbian",
        "kind": "english"
      },
      {
        "label": "上索布语",
        "kind": "alias"
      },
      {
        "label": "haut-sorabe",
        "kind": "alias"
      },
      {
        "label": "alto sorbio",
        "kind": "alias"
      }
    ],
    "lim": [
      {
        "label": "Limburgisch",
        "kind": "local"
      },
      {
        "label": "Limburgish language",
        "kind": "english"
      },
      {
        "label": "林堡语",
        "kind": "alias"
      },
      {
        "label": "Limburgish",
        "kind": "alias"
      },
      {
        "label": "limbourgeois",
        "kind": "alias"
      },
      {
        "label": "limburgués",
        "kind": "alias"
      }
    ],
    "tlh": [
      {
        "label": "Klingonisch",
        "kind": "local"
      },
      {
        "label": "Klingon",
        "kind": "english"
      },
      {
        "label": "克林贡语",
        "kind": "alias"
      }
    ],
    "new": [
      {
        "label": "Newari",
        "kind": "local"
      },
      {
        "label": "Newar",
        "kind": "english"
      },
      {
        "label": "尼瓦尔语",
        "kind": "alias"
      },
      {
        "label": "nevarí",
        "kind": "alias"
      }
    ],
    "bua": [
      {
        "label": "Burjatisch",
        "kind": "local"
      },
      {
        "label": "Buryat",
        "kind": "english"
      },
      {
        "label": "布里亚特语",
        "kind": "alias"
      },
      {
        "label": "Buriat",
        "kind": "alias"
      },
      {
        "label": "bouriate",
        "kind": "alias"
      },
      {
        "label": "buriato",
        "kind": "alias"
      }
    ],
    "lld": [
      {
        "label": "Ladin",
        "kind": "english"
      }
    ],
    "sme": [
      {
        "label": "Nordsamisch",
        "kind": "local"
      },
      {
        "label": "davvisámegiella",
        "kind": "native"
      },
      {
        "label": "Northern Sami",
        "kind": "english"
      },
      {
        "label": "北方萨米语",
        "kind": "alias"
      },
      {
        "label": "same du Nord",
        "kind": "alias"
      },
      {
        "label": "sami septentrional",
        "kind": "alias"
      }
    ],
    "ssw": [
      {
        "label": "Swazi",
        "kind": "local"
      },
      {
        "label": "斯瓦蒂语",
        "kind": "alias"
      },
      {
        "label": "Swati",
        "kind": "alias"
      },
      {
        "label": "suazi",
        "kind": "alias"
      }
    ],
    "aar": [
      {
        "label": "Afar",
        "kind": "local"
      },
      {
        "label": "阿法尔语",
        "kind": "alias"
      }
    ],
    "lez": [
      {
        "label": "Lesgisch",
        "kind": "local"
      },
      {
        "label": "Lezgian",
        "kind": "english"
      },
      {
        "label": "列兹金语",
        "kind": "alias"
      },
      {
        "label": "Lezghian",
        "kind": "alias"
      },
      {
        "label": "lezghien",
        "kind": "alias"
      },
      {
        "label": "lezgiano",
        "kind": "alias"
      }
    ],
    "bho": [
      {
        "label": "Bhodschpuri",
        "kind": "local"
      },
      {
        "label": "भोजपुरी",
        "kind": "native"
      },
      {
        "label": "Bhojpuri",
        "kind": "english"
      },
      {
        "label": "博杰普尔语",
        "kind": "alias"
      },
      {
        "label": "bhodjpouri",
        "kind": "alias"
      },
      {
        "label": "bhoyapurí",
        "kind": "alias"
      }
    ],
    "kaa": [
      {
        "label": "Karakalpakisch",
        "kind": "local"
      },
      {
        "label": "Karakalpak",
        "kind": "english"
      },
      {
        "label": "卡拉卡尔帕克语",
        "kind": "alias"
      },
      {
        "label": "Kara-Kalpak",
        "kind": "alias"
      },
      {
        "label": "karakalpako",
        "kind": "alias"
      }
    ],
    "dsb": [
      {
        "label": "Niedersorbisch",
        "kind": "local"
      },
      {
        "label": "dolnoserbšćina",
        "kind": "native"
      },
      {
        "label": "Lower Sorbian",
        "kind": "english"
      },
      {
        "label": "下索布语",
        "kind": "alias"
      },
      {
        "label": "bas-sorabe",
        "kind": "alias"
      },
      {
        "label": "bajo sorbio",
        "kind": "alias"
      }
    ],
    "mni": [
      {
        "label": "Meithei",
        "kind": "local"
      },
      {
        "label": "মৈতৈলোন্",
        "kind": "native"
      },
      {
        "label": "Meitei",
        "kind": "english"
      },
      {
        "label": "曼尼普尔语",
        "kind": "alias"
      },
      {
        "label": "Manipuri",
        "kind": "alias"
      },
      {
        "label": "manipurí",
        "kind": "alias"
      }
    ],
    "rup": [
      {
        "label": "Aromunisch",
        "kind": "local"
      },
      {
        "label": "Aromanian",
        "kind": "english"
      },
      {
        "label": "阿罗马尼亚语",
        "kind": "alias"
      },
      {
        "label": "aroumain",
        "kind": "alias"
      },
      {
        "label": "arrumano",
        "kind": "alias"
      }
    ],
    "iku": [
      {
        "label": "Inuktitut",
        "kind": "local"
      },
      {
        "label": "因纽特语",
        "kind": "alias"
      }
    ],
    "nau": [
      {
        "label": "Nauruisch",
        "kind": "local"
      },
      {
        "label": "Nauruan",
        "kind": "english"
      },
      {
        "label": "瑙鲁语",
        "kind": "alias"
      },
      {
        "label": "Nauru",
        "kind": "alias"
      },
      {
        "label": "nauruano",
        "kind": "alias"
      }
    ],
    "pap": [
      {
        "label": "Papiamento",
        "kind": "local"
      },
      {
        "label": "帕皮阿门托语",
        "kind": "alias"
      }
    ],
    "bar": [
      {
        "label": "Bairisch",
        "kind": "local"
      },
      {
        "label": "Bavarian",
        "kind": "english"
      },
      {
        "label": "bavarois",
        "kind": "alias"
      }
    ],
    "run": [
      {
        "label": "Rundi",
        "kind": "local"
      },
      {
        "label": "Ikirundi",
        "kind": "native"
      },
      {
        "label": "Kirundi",
        "kind": "english"
      },
      {
        "label": "隆迪语",
        "kind": "alias"
      },
      {
        "label": "roundi",
        "kind": "alias"
      }
    ],
    "krc": [
      {
        "label": "Karatschaiisch-Balkarisch",
        "kind": "local"
      },
      {
        "label": "Karachay-Balkar",
        "kind": "english"
      },
      {
        "label": "卡拉恰伊巴尔卡尔语",
        "kind": "alias"
      },
      {
        "label": "karatchaï balkar",
        "kind": "alias"
      }
    ],
    "tet": [
      {
        "label": "Tetum",
        "kind": "local"
      },
      {
        "label": "德顿语",
        "kind": "alias"
      },
      {
        "label": "tétoum",
        "kind": "alias"
      },
      {
        "label": "tetún",
        "kind": "alias"
      }
    ],
    "vep": [
      {
        "label": "Wepsisch",
        "kind": "local"
      },
      {
        "label": "Veps",
        "kind": "english"
      },
      {
        "label": "维普森语",
        "kind": "alias"
      },
      {
        "label": "vepse",
        "kind": "alias"
      }
    ],
    "non": [
      {
        "label": "Altnordisch",
        "kind": "local"
      },
      {
        "label": "Old Norse",
        "kind": "english"
      },
      {
        "label": "古诺尔斯语",
        "kind": "alias"
      },
      {
        "label": "vieux norrois",
        "kind": "alias"
      },
      {
        "label": "nórdico antiguo",
        "kind": "alias"
      }
    ],
    "nya": [
      {
        "label": "Nyanja",
        "kind": "local"
      },
      {
        "label": "Chewa",
        "kind": "english"
      },
      {
        "label": "齐切瓦语",
        "kind": "alias"
      }
    ],
    "chr": [
      {
        "label": "Cherokee",
        "kind": "local"
      },
      {
        "label": "ᏣᎳᎩ",
        "kind": "native"
      },
      {
        "label": "切罗基语",
        "kind": "alias"
      },
      {
        "label": "cheroqui",
        "kind": "alias"
      }
    ],
    "wuu": [
      {
        "label": "Wu-Chinesisch",
        "kind": "local"
      },
      {
        "label": "吴语",
        "kind": "native"
      },
      {
        "label": "Wu Chinese",
        "kind": "english"
      },
      {
        "label": "chinois wu",
        "kind": "alias"
      },
      {
        "label": "chino wu",
        "kind": "alias"
      },
      {
        "label": "shanghainese",
        "kind": "alias"
      },
      {
        "label": "上海话",
        "kind": "alias"
      },
      {
        "label": "上海话方言",
        "kind": "alias"
      }
    ],
    "bam": [
      {
        "label": "Bambara",
        "kind": "local"
      },
      {
        "label": "bamanakan",
        "kind": "native"
      },
      {
        "label": "班巴拉语",
        "kind": "alias"
      }
    ],
    "ful": [
      {
        "label": "Ful",
        "kind": "local"
      },
      {
        "label": "Pulaar",
        "kind": "native"
      },
      {
        "label": "Fula",
        "kind": "english"
      },
      {
        "label": "富拉语",
        "kind": "alias"
      },
      {
        "label": "peul",
        "kind": "alias"
      }
    ],
    "inh": [
      {
        "label": "Inguschisch",
        "kind": "local"
      },
      {
        "label": "Ingush",
        "kind": "english"
      },
      {
        "label": "印古什语",
        "kind": "alias"
      },
      {
        "label": "ingouche",
        "kind": "alias"
      }
    ],
    "orm": [
      {
        "label": "Oromo",
        "kind": "local"
      },
      {
        "label": "Oromoo",
        "kind": "native"
      },
      {
        "label": "奥罗莫语",
        "kind": "alias"
      }
    ],
    "ban": [
      {
        "label": "Balinesisch",
        "kind": "local"
      },
      {
        "label": "Balinese",
        "kind": "english"
      },
      {
        "label": "巴厘语",
        "kind": "alias"
      },
      {
        "label": "balinais",
        "kind": "alias"
      },
      {
        "label": "balinés",
        "kind": "alias"
      }
    ],
    "fij": [
      {
        "label": "Fidschi",
        "kind": "local"
      },
      {
        "label": "Fijian",
        "kind": "english"
      },
      {
        "label": "斐济语",
        "kind": "alias"
      },
      {
        "label": "fidjien",
        "kind": "alias"
      },
      {
        "label": "fiyiano",
        "kind": "alias"
      }
    ],
    "chm": [
      {
        "label": "Mari",
        "kind": "local"
      },
      {
        "label": "马里语",
        "kind": "alias"
      },
      {
        "label": "marí",
        "kind": "alias"
      }
    ],
    "mdf": [
      {
        "label": "Mokschanisch",
        "kind": "local"
      },
      {
        "label": "Moksha",
        "kind": "english"
      },
      {
        "label": "莫克沙语",
        "kind": "alias"
      },
      {
        "label": "mokcha",
        "kind": "alias"
      }
    ],
    "sna": [
      {
        "label": "Shona",
        "kind": "local"
      },
      {
        "label": "chiShona",
        "kind": "native"
      },
      {
        "label": "绍纳语",
        "kind": "alias"
      }
    ],
    "lij": [
      {
        "label": "Ligurisch",
        "kind": "local"
      },
      {
        "label": "ligure",
        "kind": "native"
      },
      {
        "label": "Ligurian",
        "kind": "english"
      },
      {
        "label": "利古里亚语",
        "kind": "alias"
      },
      {
        "label": "ligur",
        "kind": "alias"
      }
    ],
    "min": [
      {
        "label": "Minangkabau",
        "kind": "local"
      },
      {
        "label": "米南佳保语",
        "kind": "alias"
      }
    ],
    "sat": [
      {
        "label": "Santali",
        "kind": "local"
      },
      {
        "label": "ᱥᱟᱱᱛᱟᱲᱤ",
        "kind": "native"
      },
      {
        "label": "桑塔利语",
        "kind": "alias"
      }
    ],
    "abq": [
      {
        "label": "Abaza",
        "kind": "english"
      }
    ],
    "ewe": [
      {
        "label": "Ewe",
        "kind": "local"
      },
      {
        "label": "eʋegbe",
        "kind": "native"
      },
      {
        "label": "埃维语",
        "kind": "alias"
      },
      {
        "label": "éwé",
        "kind": "alias"
      },
      {
        "label": "ewé",
        "kind": "alias"
      }
    ],
    "bis": [
      {
        "label": "Bislama",
        "kind": "local"
      },
      {
        "label": "比斯拉马语",
        "kind": "alias"
      },
      {
        "label": "bichelamar",
        "kind": "alias"
      }
    ],
    "kbd": [
      {
        "label": "Kabardinisch",
        "kind": "local"
      },
      {
        "label": "Kabardian",
        "kind": "english"
      },
      {
        "label": "卡巴尔德语",
        "kind": "alias"
      },
      {
        "label": "kabarde",
        "kind": "alias"
      },
      {
        "label": "kabardiano",
        "kind": "alias"
      }
    ],
    "nrf": [
      {
        "label": "Norman",
        "kind": "english"
      }
    ],
    "fry": [
      {
        "label": "Westfriesisch",
        "kind": "local"
      },
      {
        "label": "Frysk",
        "kind": "native"
      },
      {
        "label": "West Frisian",
        "kind": "english"
      },
      {
        "label": "西弗里西亚语",
        "kind": "alias"
      },
      {
        "label": "Western Frisian",
        "kind": "alias"
      },
      {
        "label": "frison occidental",
        "kind": "alias"
      },
      {
        "label": "frisón occidental",
        "kind": "alias"
      }
    ],
    "arz": [
      {
        "label": "Ägyptisches Arabisch",
        "kind": "local"
      },
      {
        "label": "Egyptian Arabic",
        "kind": "english"
      },
      {
        "label": "arabe égyptien",
        "kind": "alias"
      }
    ],
    "vro": [
      {
        "label": "Võro",
        "kind": "local"
      }
    ],
    "ilo": [
      {
        "label": "Ilokano",
        "kind": "local"
      },
      {
        "label": "Ilocano",
        "kind": "english"
      },
      {
        "label": "伊洛卡诺语",
        "kind": "alias"
      },
      {
        "label": "Iloko",
        "kind": "alias"
      }
    ],
    "lin": [
      {
        "label": "Lingala",
        "kind": "local"
      },
      {
        "label": "lingála",
        "kind": "native"
      },
      {
        "label": "林加拉语",
        "kind": "alias"
      }
    ],
    "jbo": [
      {
        "label": "Lojban",
        "kind": "local"
      },
      {
        "label": "逻辑语",
        "kind": "alias"
      }
    ],
    "mwl": [
      {
        "label": "Mirandesisch",
        "kind": "local"
      },
      {
        "label": "Mirandese",
        "kind": "english"
      },
      {
        "label": "米兰德斯语",
        "kind": "alias"
      },
      {
        "label": "mirandais",
        "kind": "alias"
      },
      {
        "label": "mirandés",
        "kind": "alias"
      }
    ],
    "frp": [
      {
        "label": "Frankoprovenzalisch",
        "kind": "local"
      },
      {
        "label": "Arpitan language",
        "kind": "english"
      },
      {
        "label": "Arpitan",
        "kind": "alias"
      },
      {
        "label": "francoprovençal",
        "kind": "alias"
      }
    ],
    "tso": [
      {
        "label": "Tsonga",
        "kind": "local"
      },
      {
        "label": "聪加语",
        "kind": "alias"
      }
    ],
    "xal": [
      {
        "label": "Kalmückisch",
        "kind": "local"
      },
      {
        "label": "Kalmyk",
        "kind": "english"
      },
      {
        "label": "卡尔梅克语",
        "kind": "alias"
      },
      {
        "label": "kalmouk",
        "kind": "alias"
      }
    ],
    "ett": [
      {
        "label": "Etruscan",
        "kind": "english"
      }
    ],
    "tah": [
      {
        "label": "Tahitisch",
        "kind": "local"
      },
      {
        "label": "Tahitian",
        "kind": "english"
      },
      {
        "label": "塔希提语",
        "kind": "alias"
      },
      {
        "label": "tahitien",
        "kind": "alias"
      },
      {
        "label": "tahitiano",
        "kind": "alias"
      }
    ],
    "ven": [
      {
        "label": "Venda",
        "kind": "local"
      },
      {
        "label": "文达语",
        "kind": "alias"
      }
    ],
    "tcy": [
      {
        "label": "Tulu",
        "kind": "local"
      },
      {
        "label": "toulou",
        "kind": "alias"
      }
    ],
    "cha": [
      {
        "label": "Chamorro",
        "kind": "local"
      },
      {
        "label": "查莫罗语",
        "kind": "alias"
      }
    ],
    "hak": [
      {
        "label": "Hakka",
        "kind": "local"
      },
      {
        "label": "客家話",
        "kind": "native"
      },
      {
        "label": "Hakka Chinese",
        "kind": "english"
      },
      {
        "label": "客家话",
        "kind": "alias"
      },
      {
        "label": "chino hakka",
        "kind": "alias"
      },
      {
        "label": "客家语",
        "kind": "alias"
      }
    ],
    "kjh": [
      {
        "label": "Khakas",
        "kind": "english"
      }
    ],
    "ace": [
      {
        "label": "Aceh",
        "kind": "local"
      },
      {
        "label": "Acehnese",
        "kind": "english"
      },
      {
        "label": "亚齐语",
        "kind": "alias"
      },
      {
        "label": "achenés",
        "kind": "alias"
      }
    ],
    "gsw": [
      {
        "label": "Schweizerdeutsch",
        "kind": "local"
      },
      {
        "label": "Schwiizertüütsch",
        "kind": "native"
      },
      {
        "label": "Swiss German",
        "kind": "english"
      },
      {
        "label": "瑞士德语",
        "kind": "alias"
      },
      {
        "label": "suisse allemand",
        "kind": "alias"
      },
      {
        "label": "alemán suizo",
        "kind": "alias"
      },
      {
        "label": "alemannic",
        "kind": "alias"
      },
      {
        "label": "alsatian",
        "kind": "alias"
      }
    ],
    "war": [
      {
        "label": "Waray",
        "kind": "local"
      },
      {
        "label": "瓦瑞语",
        "kind": "alias"
      }
    ],
    "hit": [
      {
        "label": "Hethitisch",
        "kind": "local"
      },
      {
        "label": "Hittite",
        "kind": "english"
      },
      {
        "label": "赫梯语",
        "kind": "alias"
      },
      {
        "label": "hitita",
        "kind": "alias"
      }
    ],
    "mns": [
      {
        "label": "Mansi",
        "kind": "english"
      }
    ],
    "pcd": [
      {
        "label": "Picardisch",
        "kind": "local"
      },
      {
        "label": "Picard",
        "kind": "english"
      }
    ],
    "gez": [
      {
        "label": "Geez",
        "kind": "local"
      },
      {
        "label": "Ge'ez",
        "kind": "english"
      },
      {
        "label": "吉兹语",
        "kind": "alias"
      },
      {
        "label": "guèze",
        "kind": "alias"
      }
    ],
    "brx": [
      {
        "label": "Bodo",
        "kind": "local"
      },
      {
        "label": "बर’",
        "kind": "native"
      },
      {
        "label": "博多语",
        "kind": "alias"
      }
    ],
    "phn": [
      {
        "label": "Phönizisch",
        "kind": "local"
      },
      {
        "label": "Phoenician",
        "kind": "english"
      },
      {
        "label": "腓尼基语",
        "kind": "alias"
      },
      {
        "label": "phénicien",
        "kind": "alias"
      },
      {
        "label": "fenicio",
        "kind": "alias"
      }
    ],
    "mah": [
      {
        "label": "Marschallesisch",
        "kind": "local"
      },
      {
        "label": "Marshallese",
        "kind": "english"
      },
      {
        "label": "马绍尔语",
        "kind": "alias"
      },
      {
        "label": "marshallais",
        "kind": "alias"
      },
      {
        "label": "marshalés",
        "kind": "alias"
      }
    ],
    "kca": [
      {
        "label": "Khanty",
        "kind": "english"
      }
    ],
    "dgo": [
      {
        "label": "Dogri",
        "kind": "local"
      },
      {
        "label": "डोगरी",
        "kind": "native"
      },
      {
        "label": "多格拉语",
        "kind": "alias"
      }
    ],
    "brh": [
      {
        "label": "Brahui",
        "kind": "local"
      },
      {
        "label": "brahoui",
        "kind": "alias"
      }
    ],
    "nog": [
      {
        "label": "Nogai",
        "kind": "local"
      },
      {
        "label": "诺盖语",
        "kind": "alias"
      },
      {
        "label": "nogaï",
        "kind": "alias"
      }
    ],
    "ckt": [
      {
        "label": "Chukchi",
        "kind": "english"
      }
    ],
    "lbe": [
      {
        "label": "Lak",
        "kind": "english"
      }
    ],
    "mzn": [
      {
        "label": "Masanderanisch",
        "kind": "local"
      },
      {
        "label": "مازرونی",
        "kind": "native"
      },
      {
        "label": "Mazanderani",
        "kind": "english"
      },
      {
        "label": "马赞德兰语",
        "kind": "alias"
      },
      {
        "label": "mazandérani",
        "kind": "alias"
      },
      {
        "label": "mazandaraní",
        "kind": "alias"
      }
    ],
    "gil": [
      {
        "label": "Kiribatisch",
        "kind": "local"
      },
      {
        "label": "Gilbertese",
        "kind": "english"
      },
      {
        "label": "吉尔伯特语",
        "kind": "alias"
      },
      {
        "label": "gilbertin",
        "kind": "alias"
      },
      {
        "label": "gilbertés",
        "kind": "alias"
      }
    ],
    "bug": [
      {
        "label": "Buginesisch",
        "kind": "local"
      },
      {
        "label": "Bugis",
        "kind": "english"
      },
      {
        "label": "布吉语",
        "kind": "alias"
      },
      {
        "label": "Buginese",
        "kind": "alias"
      },
      {
        "label": "bugi",
        "kind": "alias"
      },
      {
        "label": "buginés",
        "kind": "alias"
      }
    ],
    "izh": [
      {
        "label": "Ischorisch",
        "kind": "local"
      },
      {
        "label": "Ingrian",
        "kind": "english"
      },
      {
        "label": "ingrien",
        "kind": "alias"
      }
    ],
    "kon": [
      {
        "label": "Kongolesisch",
        "kind": "local"
      },
      {
        "label": "Kongo",
        "kind": "english"
      },
      {
        "label": "刚果语",
        "kind": "alias"
      },
      {
        "label": "kikongo",
        "kind": "alias"
      }
    ],
    "ell": [
      {
        "label": "Griechisch",
        "kind": "local"
      },
      {
        "label": "Ελληνικά",
        "kind": "native"
      },
      {
        "label": "Modern Greek",
        "kind": "english"
      },
      {
        "label": "希腊语",
        "kind": "alias"
      },
      {
        "label": "Greek",
        "kind": "alias"
      },
      {
        "label": "grec",
        "kind": "alias"
      },
      {
        "label": "griego",
        "kind": "alias"
      }
    ],
    "chg": [
      {
        "label": "Tschagataisch",
        "kind": "local"
      },
      {
        "label": "Chagatai",
        "kind": "english"
      },
      {
        "label": "察合台语",
        "kind": "alias"
      },
      {
        "label": "tchaghataï",
        "kind": "alias"
      },
      {
        "label": "chagatái",
        "kind": "alias"
      }
    ],
    "pdc": [
      {
        "label": "Pennsylvaniadeutsch",
        "kind": "local"
      },
      {
        "label": "Pennsylvania German",
        "kind": "english"
      },
      {
        "label": "pennsilfaanisch",
        "kind": "alias"
      }
    ],
    "aka": [
      {
        "label": "Akan",
        "kind": "local"
      },
      {
        "label": "阿肯语",
        "kind": "alias"
      }
    ],
    "kum": [
      {
        "label": "Kumükisch",
        "kind": "local"
      },
      {
        "label": "Kumyk",
        "kind": "english"
      },
      {
        "label": "库梅克语",
        "kind": "alias"
      },
      {
        "label": "koumyk",
        "kind": "alias"
      }
    ],
    "hmo": [
      {
        "label": "Hiri-Motu",
        "kind": "local"
      },
      {
        "label": "Hiri Motu",
        "kind": "english"
      },
      {
        "label": "希里莫图语",
        "kind": "alias"
      }
    ],
    "ale": [
      {
        "label": "Aleutisch",
        "kind": "local"
      },
      {
        "label": "Aleut",
        "kind": "english"
      },
      {
        "label": "阿留申语",
        "kind": "alias"
      },
      {
        "label": "aléoute",
        "kind": "alias"
      },
      {
        "label": "aleutiano",
        "kind": "alias"
      }
    ],
    "awa": [
      {
        "label": "Awadhi",
        "kind": "local"
      },
      {
        "label": "阿瓦德语",
        "kind": "alias"
      },
      {
        "label": "avadhi",
        "kind": "alias"
      }
    ],
    "dlm": [
      {
        "label": "Dalmatian",
        "kind": "english"
      }
    ],
    "her": [
      {
        "label": "Herero",
        "kind": "local"
      },
      {
        "label": "赫雷罗语",
        "kind": "alias"
      },
      {
        "label": "héréro",
        "kind": "alias"
      }
    ],
    "enm": [
      {
        "label": "Mittelenglisch",
        "kind": "local"
      },
      {
        "label": "Middle English",
        "kind": "english"
      },
      {
        "label": "中古英语",
        "kind": "alias"
      },
      {
        "label": "moyen anglais",
        "kind": "alias"
      },
      {
        "label": "inglés medio",
        "kind": "alias"
      }
    ],
    "prg": [
      {
        "label": "Altpreußisch",
        "kind": "local"
      },
      {
        "label": "prūsiskan",
        "kind": "native"
      },
      {
        "label": "Old Prussian",
        "kind": "english"
      },
      {
        "label": "普鲁士语",
        "kind": "alias"
      },
      {
        "label": "Prussian",
        "kind": "alias"
      },
      {
        "label": "prussien",
        "kind": "alias"
      },
      {
        "label": "prusiano",
        "kind": "alias"
      }
    ],
    "yrk": [
      {
        "label": "Nenets",
        "kind": "english"
      }
    ],
    "qya": [
      {
        "label": "Quenya",
        "kind": "english"
      }
    ],
    "vot": [
      {
        "label": "Wotisch",
        "kind": "local"
      },
      {
        "label": "Votic",
        "kind": "english"
      },
      {
        "label": "沃提克语",
        "kind": "alias"
      },
      {
        "label": "vote",
        "kind": "alias"
      },
      {
        "label": "vótico",
        "kind": "alias"
      }
    ],
    "pau": [
      {
        "label": "Palau",
        "kind": "local"
      },
      {
        "label": "Palauan",
        "kind": "english"
      },
      {
        "label": "帕劳语",
        "kind": "alias"
      },
      {
        "label": "palauano",
        "kind": "alias"
      }
    ],
    "nan": [
      {
        "label": "Min Nan",
        "kind": "local"
      },
      {
        "label": "閩南語",
        "kind": "native"
      },
      {
        "label": "Southern Min",
        "kind": "english"
      },
      {
        "label": "闽南语",
        "kind": "alias"
      },
      {
        "label": "minnan",
        "kind": "alias"
      },
      {
        "label": "hokkien",
        "kind": "alias"
      },
      {
        "label": "taiwanese hokkien",
        "kind": "alias"
      },
      {
        "label": "台语",
        "kind": "alias"
      },
      {
        "label": "臺語",
        "kind": "alias"
      },
      {
        "label": "河洛话",
        "kind": "alias"
      },
      {
        "label": "河洛話",
        "kind": "alias"
      }
    ],
    "nso": [
      {
        "label": "Nord-Sotho",
        "kind": "local"
      },
      {
        "label": "Sesotho sa Leboa",
        "kind": "native"
      },
      {
        "label": "Northern Sotho",
        "kind": "english"
      },
      {
        "label": "北索托语",
        "kind": "alias"
      },
      {
        "label": "sotho du Nord",
        "kind": "alias"
      },
      {
        "label": "sotho septentrional",
        "kind": "alias"
      }
    ],
    "sag": [
      {
        "label": "Sango",
        "kind": "local"
      },
      {
        "label": "Sängö",
        "kind": "native"
      },
      {
        "label": "桑戈语",
        "kind": "alias"
      }
    ],
    "stq": [
      {
        "label": "Saterfriesisch",
        "kind": "local"
      },
      {
        "label": "Saterland Frisian",
        "kind": "english"
      },
      {
        "label": "saterlandais",
        "kind": "alias"
      }
    ],
    "yue": [
      {
        "label": "Kantonesisch",
        "kind": "local"
      },
      {
        "label": "粵語",
        "kind": "native"
      },
      {
        "label": "Cantonese",
        "kind": "english"
      },
      {
        "label": "粤语",
        "kind": "alias"
      },
      {
        "label": "cantonais",
        "kind": "alias"
      },
      {
        "label": "cantonés",
        "kind": "alias"
      },
      {
        "label": "cantonese chinese",
        "kind": "alias"
      },
      {
        "label": "guangdonghua",
        "kind": "alias"
      },
      {
        "label": "广东话",
        "kind": "alias"
      },
      {
        "label": "廣東話",
        "kind": "alias"
      },
      {
        "label": "白话",
        "kind": "alias"
      },
      {
        "label": "白話",
        "kind": "alias"
      }
    ],
    "xmf": [
      {
        "label": "Mingrelisch",
        "kind": "local"
      },
      {
        "label": "Mingrelian",
        "kind": "english"
      },
      {
        "label": "mingrélien",
        "kind": "alias"
      }
    ],
    "bjn": [
      {
        "label": "Banjaresisch",
        "kind": "local"
      },
      {
        "label": "Banjar",
        "kind": "english"
      }
    ],
    "ase": [
      {
        "label": "Amerikanische Gebärdensprache",
        "kind": "local"
      },
      {
        "label": "American Sign Language",
        "kind": "english"
      },
      {
        "label": "langue des signes américaine",
        "kind": "alias"
      }
    ],
    "kau": [
      {
        "label": "Kanuri",
        "kind": "local"
      },
      {
        "label": "卡努里语",
        "kind": "alias"
      },
      {
        "label": "kanouri",
        "kind": "alias"
      }
    ],
    "nrn": [
      {
        "label": "Norn",
        "kind": "english"
      }
    ],
    "frr": [
      {
        "label": "Nordfriesisch",
        "kind": "local"
      },
      {
        "label": "North Frisian",
        "kind": "english"
      },
      {
        "label": "北弗里西亚语",
        "kind": "alias"
      },
      {
        "label": "Northern Frisian",
        "kind": "alias"
      },
      {
        "label": "frison septentrional",
        "kind": "alias"
      },
      {
        "label": "frisón septentrional",
        "kind": "alias"
      }
    ],
    "lug": [
      {
        "label": "Ganda",
        "kind": "local"
      },
      {
        "label": "Luganda",
        "kind": "native"
      },
      {
        "label": "卢干达语",
        "kind": "alias"
      }
    ],
    "cre": [
      {
        "label": "Cree",
        "kind": "local"
      },
      {
        "label": "克里语",
        "kind": "alias"
      }
    ],
    "gan": [
      {
        "label": "Gan",
        "kind": "local"
      },
      {
        "label": "Gan Chinese",
        "kind": "english"
      },
      {
        "label": "赣语",
        "kind": "alias"
      },
      {
        "label": "chino gan",
        "kind": "alias"
      },
      {
        "label": "贛語",
        "kind": "alias"
      }
    ],
    "kik": [
      {
        "label": "Kikuyu",
        "kind": "local"
      },
      {
        "label": "Gikuyu",
        "kind": "native"
      },
      {
        "label": "吉库尤语",
        "kind": "alias"
      }
    ],
    "mag": [
      {
        "label": "Khotta",
        "kind": "local"
      },
      {
        "label": "Magahi",
        "kind": "english"
      },
      {
        "label": "摩揭陀语",
        "kind": "alias"
      }
    ],
    "pox": [
      {
        "label": "Polabian",
        "kind": "english"
      }
    ],
    "zha": [
      {
        "label": "Zhuang",
        "kind": "local"
      },
      {
        "label": "Vahcuengh",
        "kind": "native"
      },
      {
        "label": "壮语",
        "kind": "alias"
      },
      {
        "label": "壮文",
        "kind": "alias"
      },
      {
        "label": "壯語",
        "kind": "alias"
      }
    ],
    "bsk": [
      {
        "label": "Burushaski",
        "kind": "english"
      }
    ],
    "sva": [
      {
        "label": "Svan",
        "kind": "english"
      }
    ],
    "fro": [
      {
        "label": "Altfranzösisch",
        "kind": "local"
      },
      {
        "label": "Old French",
        "kind": "english"
      },
      {
        "label": "古法语",
        "kind": "alias"
      },
      {
        "label": "ancien français",
        "kind": "alias"
      },
      {
        "label": "francés antiguo",
        "kind": "alias"
      }
    ],
    "nbl": [
      {
        "label": "Süd-Ndebele",
        "kind": "local"
      },
      {
        "label": "Southern Ndebele",
        "kind": "english"
      },
      {
        "label": "南恩德贝勒语",
        "kind": "alias"
      },
      {
        "label": "South Ndebele",
        "kind": "alias"
      },
      {
        "label": "ndébélé du Sud",
        "kind": "alias"
      },
      {
        "label": "ndebele meridional",
        "kind": "alias"
      }
    ],
    "lzz": [
      {
        "label": "Lasisch",
        "kind": "local"
      },
      {
        "label": "Laz",
        "kind": "english"
      },
      {
        "label": "laze",
        "kind": "alias"
      }
    ],
    "tvl": [
      {
        "label": "Tuvaluisch",
        "kind": "local"
      },
      {
        "label": "Tuvaluan",
        "kind": "english"
      },
      {
        "label": "图瓦卢语",
        "kind": "alias"
      },
      {
        "label": "Tuvalu",
        "kind": "alias"
      },
      {
        "label": "tuvaluano",
        "kind": "alias"
      }
    ],
    "elx": [
      {
        "label": "Elamisch",
        "kind": "local"
      },
      {
        "label": "Elamite",
        "kind": "english"
      },
      {
        "label": "埃兰语",
        "kind": "alias"
      },
      {
        "label": "élamite",
        "kind": "alias"
      },
      {
        "label": "elamita",
        "kind": "alias"
      }
    ],
    "koi": [
      {
        "label": "Komi-Permjakisch",
        "kind": "local"
      },
      {
        "label": "Komi-Permyak",
        "kind": "english"
      },
      {
        "label": "科米-彼尔米亚克语",
        "kind": "alias"
      },
      {
        "label": "komi-permiak",
        "kind": "alias"
      },
      {
        "label": "komi permio",
        "kind": "alias"
      }
    ],
    "sgs": [
      {
        "label": "Samogitisch",
        "kind": "local"
      },
      {
        "label": "Samogitian",
        "kind": "english"
      },
      {
        "label": "samogitien",
        "kind": "alias"
      }
    ],
    "sma": [
      {
        "label": "Südsamisch",
        "kind": "local"
      },
      {
        "label": "Southern Sami",
        "kind": "english"
      },
      {
        "label": "南萨米语",
        "kind": "alias"
      },
      {
        "label": "same du Sud",
        "kind": "alias"
      },
      {
        "label": "sami meridional",
        "kind": "alias"
      }
    ],
    "ext": [
      {
        "label": "Extremadurisch",
        "kind": "local"
      },
      {
        "label": "Extremaduran",
        "kind": "english"
      },
      {
        "label": "estrémègne",
        "kind": "alias"
      }
    ],
    "evn": [
      {
        "label": "Evenki",
        "kind": "english"
      }
    ],
    "kab": [
      {
        "label": "Kabylisch",
        "kind": "local"
      },
      {
        "label": "Taqbaylit",
        "kind": "native"
      },
      {
        "label": "Kabyle",
        "kind": "english"
      },
      {
        "label": "卡拜尔语",
        "kind": "alias"
      },
      {
        "label": "cabileño",
        "kind": "alias"
      }
    ],
    "rap": [
      {
        "label": "Rapanui",
        "kind": "local"
      },
      {
        "label": "Rapa Nui",
        "kind": "english"
      },
      {
        "label": "拉帕努伊语",
        "kind": "alias"
      }
    ],
    "rut": [
      {
        "label": "Rutulian",
        "kind": "english"
      }
    ],
    "lzh": [
      {
        "label": "Klassisches Chinesisch",
        "kind": "local"
      },
      {
        "label": "Classical Chinese",
        "kind": "english"
      },
      {
        "label": "Literary Chinese",
        "kind": "alias"
      },
      {
        "label": "chinois littéraire",
        "kind": "alias"
      }
    ],
    "raj": [
      {
        "label": "Rajasthani",
        "kind": "local"
      },
      {
        "label": "राजस्थानी",
        "kind": "native"
      },
      {
        "label": "拉贾斯坦语",
        "kind": "alias"
      }
    ],
    "srn": [
      {
        "label": "Srananisch",
        "kind": "local"
      },
      {
        "label": "Sranan Tongo",
        "kind": "english"
      },
      {
        "label": "苏里南汤加语",
        "kind": "alias"
      }
    ],
    "niu": [
      {
        "label": "Niue",
        "kind": "local"
      },
      {
        "label": "Niuean",
        "kind": "english"
      },
      {
        "label": "纽埃语",
        "kind": "alias"
      },
      {
        "label": "niuéen",
        "kind": "alias"
      },
      {
        "label": "niueano",
        "kind": "alias"
      }
    ],
    "smn": [
      {
        "label": "Inari-Samisch",
        "kind": "local"
      },
      {
        "label": "anarâškielâ",
        "kind": "native"
      },
      {
        "label": "Inari Sami",
        "kind": "english"
      },
      {
        "label": "伊纳里萨米语",
        "kind": "alias"
      },
      {
        "label": "same d’Inari",
        "kind": "alias"
      },
      {
        "label": "sami inari",
        "kind": "alias"
      }
    ],
    "glk": [
      {
        "label": "Gilaki",
        "kind": "local"
      }
    ],
    "peo": [
      {
        "label": "Altpersisch",
        "kind": "local"
      },
      {
        "label": "Old Persian",
        "kind": "english"
      },
      {
        "label": "古波斯语",
        "kind": "alias"
      },
      {
        "label": "persan ancien",
        "kind": "alias"
      },
      {
        "label": "persa antiguo",
        "kind": "alias"
      }
    ],
    "ryu": [
      {
        "label": "Okinawan",
        "kind": "english"
      }
    ],
    "tly": [
      {
        "label": "Talisch",
        "kind": "local"
      },
      {
        "label": "Talysh",
        "kind": "english"
      }
    ],
    "chu": [
      {
        "label": "Kirchenslawisch",
        "kind": "local"
      },
      {
        "label": "Church Slavonic",
        "kind": "english"
      },
      {
        "label": "教会斯拉夫语",
        "kind": "alias"
      },
      {
        "label": "Church Slavic",
        "kind": "alias"
      },
      {
        "label": "slavon d’église",
        "kind": "alias"
      },
      {
        "label": "eslavo eclesiástico",
        "kind": "alias"
      }
    ],
    "orv": [
      {
        "label": "Old East Slavic",
        "kind": "english"
      }
    ],
    "fon": [
      {
        "label": "Fon",
        "kind": "local"
      },
      {
        "label": "丰语",
        "kind": "alias"
      }
    ],
    "pam": [
      {
        "label": "Pampanggan",
        "kind": "local"
      },
      {
        "label": "Kapampangan",
        "kind": "english"
      },
      {
        "label": "邦板牙语",
        "kind": "alias"
      },
      {
        "label": "Pampanga",
        "kind": "alias"
      },
      {
        "label": "pampangan",
        "kind": "alias"
      }
    ],
    "mad": [
      {
        "label": "Maduresisch",
        "kind": "local"
      },
      {
        "label": "Madurese",
        "kind": "english"
      },
      {
        "label": "马都拉语",
        "kind": "alias"
      },
      {
        "label": "madurais",
        "kind": "alias"
      },
      {
        "label": "madurés",
        "kind": "alias"
      }
    ],
    "fit": [
      {
        "label": "Meänkieli",
        "kind": "local"
      },
      {
        "label": "Tornedalen Finnish",
        "kind": "alias"
      },
      {
        "label": "finnois tornédalien",
        "kind": "alias"
      }
    ],
    "pal": [
      {
        "label": "Mittelpersisch",
        "kind": "local"
      },
      {
        "label": "Middle Persian",
        "kind": "english"
      },
      {
        "label": "巴拉维语",
        "kind": "alias"
      },
      {
        "label": "Pahlavi",
        "kind": "alias"
      }
    ],
    "hne": [
      {
        "label": "Chhattisgarhi",
        "kind": "english"
      }
    ],
    "ckb": [
      {
        "label": "Zentralkurdisch",
        "kind": "local"
      },
      {
        "label": "کوردیی ناوەندی",
        "kind": "native"
      },
      {
        "label": "Central Kurdish",
        "kind": "english"
      },
      {
        "label": "中库尔德语",
        "kind": "alias"
      },
      {
        "label": "sorani",
        "kind": "alias"
      },
      {
        "label": "kurdo sorani",
        "kind": "alias"
      }
    ],
    "bpy": [
      {
        "label": "Bishnupriya",
        "kind": "local"
      },
      {
        "label": "Bishnupriya Manipuri",
        "kind": "english"
      }
    ],
    "sog": [
      {
        "label": "Sogdisch",
        "kind": "local"
      },
      {
        "label": "Sogdian",
        "kind": "english"
      },
      {
        "label": "粟特语",
        "kind": "alias"
      },
      {
        "label": "Sogdien",
        "kind": "alias"
      },
      {
        "label": "sogdiano",
        "kind": "alias"
      }
    ],
    "ipk": [
      {
        "label": "Inupiak",
        "kind": "local"
      },
      {
        "label": "Iñupiaq",
        "kind": "english"
      },
      {
        "label": "伊努皮克语",
        "kind": "alias"
      },
      {
        "label": "Inupiaq",
        "kind": "alias"
      }
    ],
    "mwr": [
      {
        "label": "Marwari",
        "kind": "local"
      },
      {
        "label": "马尔瓦里语",
        "kind": "alias"
      },
      {
        "label": "marwarî",
        "kind": "alias"
      }
    ],
    "uga": [
      {
        "label": "Ugaritisch",
        "kind": "local"
      },
      {
        "label": "Ugaritic",
        "kind": "english"
      },
      {
        "label": "乌加里特语",
        "kind": "alias"
      },
      {
        "label": "ougaritique",
        "kind": "alias"
      },
      {
        "label": "ugarítico",
        "kind": "alias"
      }
    ],
    "fkv": [
      {
        "label": "Kven",
        "kind": "english"
      }
    ],
    "tab": [
      {
        "label": "Tabasaran",
        "kind": "english"
      }
    ],
    "jam": [
      {
        "label": "Jamaikanisch-Kreolisch",
        "kind": "local"
      },
      {
        "label": "Jamaican Patois",
        "kind": "english"
      },
      {
        "label": "Jamaican Creole English",
        "kind": "alias"
      },
      {
        "label": "créole jamaïcain",
        "kind": "alias"
      }
    ],
    "bgc": [
      {
        "label": "Haryanvi",
        "kind": "local"
      },
      {
        "label": "हरियाणवी",
        "kind": "native"
      },
      {
        "label": "哈里亚纳语",
        "kind": "alias"
      }
    ],
    "nio": [
      {
        "label": "Nganasan",
        "kind": "english"
      }
    ],
    "mnw": [
      {
        "label": "Mon",
        "kind": "english"
      }
    ],
    "skr": [
      {
        "label": "Saraiki",
        "kind": "english"
      },
      {
        "label": "色莱基语",
        "kind": "alias"
      }
    ],
    "tkl": [
      {
        "label": "Tokelauanisch",
        "kind": "local"
      },
      {
        "label": "Tokelauan",
        "kind": "english"
      },
      {
        "label": "托克劳语",
        "kind": "alias"
      },
      {
        "label": "tokelau",
        "kind": "alias"
      },
      {
        "label": "tokelauano",
        "kind": "alias"
      }
    ],
    "dng": [
      {
        "label": "Dungan",
        "kind": "english"
      }
    ],
    "kmr": [
      {
        "label": "Kurdisch",
        "kind": "local"
      },
      {
        "label": "kurdî (kurmancî)",
        "kind": "native"
      },
      {
        "label": "Northern Kurdish",
        "kind": "english"
      },
      {
        "label": "库尔曼吉语",
        "kind": "alias"
      },
      {
        "label": "kurde",
        "kind": "alias"
      },
      {
        "label": "kurdo",
        "kind": "alias"
      },
      {
        "label": "kurmanji",
        "kind": "alias"
      }
    ],
    "osc": [
      {
        "label": "Oscan",
        "kind": "english"
      }
    ],
    "smj": [
      {
        "label": "Lule-Samisch",
        "kind": "local"
      },
      {
        "label": "Lule Sami",
        "kind": "english"
      },
      {
        "label": "吕勒萨米语",
        "kind": "alias"
      },
      {
        "label": "same de Lule",
        "kind": "alias"
      },
      {
        "label": "sami lule",
        "kind": "alias"
      }
    ],
    "cbk": [
      {
        "label": "Chavacano",
        "kind": "english"
      }
    ],
    "sel": [
      {
        "label": "Selkupisch",
        "kind": "local"
      },
      {
        "label": "Selkup",
        "kind": "english"
      },
      {
        "label": "塞尔库普语",
        "kind": "alias"
      },
      {
        "label": "selkoupe",
        "kind": "alias"
      }
    ],
    "tmh": [
      {
        "label": "Tamaseq",
        "kind": "local"
      },
      {
        "label": "Tuareg",
        "kind": "english"
      },
      {
        "label": "塔马奇克语",
        "kind": "alias"
      },
      {
        "label": "Tamashek",
        "kind": "alias"
      },
      {
        "label": "tamacheq",
        "kind": "alias"
      }
    ],
    "ltg": [
      {
        "label": "Lettgallisch",
        "kind": "local"
      },
      {
        "label": "Latgalian",
        "kind": "english"
      },
      {
        "label": "latgalien",
        "kind": "alias"
      }
    ],
    "ket": [
      {
        "label": "Ket",
        "kind": "english"
      }
    ],
    "sjd": [
      {
        "label": "Kildin Sami",
        "kind": "english"
      }
    ],
    "lab": [
      {
        "label": "Linear A",
        "kind": "english"
      }
    ],
    "hil": [
      {
        "label": "Hiligaynon",
        "kind": "local"
      },
      {
        "label": "希利盖农语",
        "kind": "alias"
      }
    ],
    "shi": [
      {
        "label": "Taschelhit",
        "kind": "local"
      },
      {
        "label": "ⵜⴰⵛⵍⵃⵉⵜ",
        "kind": "native"
      },
      {
        "label": "Tashelhit",
        "kind": "english"
      },
      {
        "label": "希尔哈语",
        "kind": "alias"
      },
      {
        "label": "Tachelhit",
        "kind": "alias"
      },
      {
        "label": "chleuh",
        "kind": "alias"
      }
    ],
    "prv": [
      {
        "label": "Provençal",
        "kind": "english"
      }
    ],
    "gon": [
      {
        "label": "Gondi",
        "kind": "local"
      },
      {
        "label": "冈德语",
        "kind": "alias"
      }
    ],
    "naq": [
      {
        "label": "Nama",
        "kind": "local"
      },
      {
        "label": "Khoekhoegowab",
        "kind": "native"
      },
      {
        "label": "Khoekhoe",
        "kind": "english"
      },
      {
        "label": "纳马语",
        "kind": "alias"
      }
    ],
    "pag": [
      {
        "label": "Pangasinan",
        "kind": "local"
      },
      {
        "label": "邦阿西南语",
        "kind": "alias"
      },
      {
        "label": "pangasinán",
        "kind": "alias"
      }
    ],
    "cho": [
      {
        "label": "Choctaw",
        "kind": "local"
      },
      {
        "label": "乔克托语",
        "kind": "alias"
      }
    ],
    "kpy": [
      {
        "label": "Koryak",
        "kind": "english"
      }
    ],
    "ttt": [
      {
        "label": "Tatisch",
        "kind": "local"
      },
      {
        "label": "Tat",
        "kind": "english"
      },
      {
        "label": "Muslim Tat",
        "kind": "alias"
      },
      {
        "label": "tati caucasien",
        "kind": "alias"
      }
    ],
    "hbo": [
      {
        "label": "Biblical Hebrew",
        "kind": "english"
      }
    ],
    "yua": [
      {
        "label": "Yucatec Maya",
        "kind": "english"
      }
    ],
    "xpr": [
      {
        "label": "Parthian",
        "kind": "english"
      }
    ],
    "anp": [
      {
        "label": "Angika",
        "kind": "local"
      },
      {
        "label": "昂加语",
        "kind": "alias"
      }
    ],
    "eve": [
      {
        "label": "Even",
        "kind": "english"
      }
    ],
    "dyu": [
      {
        "label": "Dyula",
        "kind": "local"
      },
      {
        "label": "Dioula",
        "kind": "english"
      },
      {
        "label": "迪尤拉语",
        "kind": "alias"
      },
      {
        "label": "diula",
        "kind": "alias"
      }
    ],
    "dlg": [
      {
        "label": "Dolgan",
        "kind": "english"
      }
    ],
    "goh": [
      {
        "label": "Althochdeutsch",
        "kind": "local"
      },
      {
        "label": "Old High German",
        "kind": "english"
      },
      {
        "label": "古高地德语",
        "kind": "alias"
      },
      {
        "label": "ancien haut allemand",
        "kind": "alias"
      },
      {
        "label": "alto alemán antiguo",
        "kind": "alias"
      }
    ],
    "mos": [
      {
        "label": "Mossi",
        "kind": "local"
      },
      {
        "label": "Mooré",
        "kind": "english"
      },
      {
        "label": "莫西语",
        "kind": "alias"
      },
      {
        "label": "moré",
        "kind": "alias"
      }
    ],
    "niv": [
      {
        "label": "Nivkh",
        "kind": "english"
      }
    ],
    "pnt": [
      {
        "label": "Pontisch",
        "kind": "local"
      },
      {
        "label": "Pontic Greek",
        "kind": "english"
      },
      {
        "label": "Pontic",
        "kind": "alias"
      },
      {
        "label": "pontique",
        "kind": "alias"
      }
    ],
    "uby": [
      {
        "label": "Ubykh",
        "kind": "english"
      }
    ],
    "fsl": [
      {
        "label": "French Sign Language",
        "kind": "english"
      }
    ],
    "oji": [
      {
        "label": "Ojibwa",
        "kind": "local"
      },
      {
        "label": "Ojibwe",
        "kind": "english"
      },
      {
        "label": "奥吉布瓦语",
        "kind": "alias"
      }
    ],
    "bem": [
      {
        "label": "Bemba",
        "kind": "local"
      },
      {
        "label": "Ichibemba",
        "kind": "native"
      },
      {
        "label": "本巴语",
        "kind": "alias"
      }
    ],
    "mnk": [
      {
        "label": "Malinke",
        "kind": "local"
      },
      {
        "label": "Mandinka",
        "kind": "english"
      },
      {
        "label": "曼丁哥语",
        "kind": "alias"
      },
      {
        "label": "Mandingo",
        "kind": "alias"
      },
      {
        "label": "mandingue",
        "kind": "alias"
      }
    ],
    "kdr": [
      {
        "label": "Karaim",
        "kind": "english"
      }
    ],
    "ary": [
      {
        "label": "Marokkanisches Arabisch",
        "kind": "local"
      },
      {
        "label": "Moroccan Arabic",
        "kind": "english"
      },
      {
        "label": "arabe marocain",
        "kind": "alias"
      }
    ],
    "sms": [
      {
        "label": "Skolt-Samisch",
        "kind": "local"
      },
      {
        "label": "Skolt Sami",
        "kind": "english"
      },
      {
        "label": "斯科特萨米语",
        "kind": "alias"
      },
      {
        "label": "same skolt",
        "kind": "alias"
      },
      {
        "label": "sami skolt",
        "kind": "alias"
      }
    ],
    "chy": [
      {
        "label": "Cheyenne",
        "kind": "local"
      },
      {
        "label": "夏延语",
        "kind": "alias"
      },
      {
        "label": "cheyene",
        "kind": "alias"
      }
    ],
    "cdo": [
      {
        "label": "Eastern Min",
        "kind": "english"
      }
    ],
    "agx": [
      {
        "label": "Aghul",
        "kind": "english"
      }
    ],
    "wym": [
      {
        "label": "Wymysorys",
        "kind": "english"
      }
    ],
    "qxq": [
      {
        "label": "Qashqai",
        "kind": "english"
      }
    ],
    "xil": [
      {
        "label": "Illyrian",
        "kind": "english"
      }
    ],
    "gld": [
      {
        "label": "Nanai",
        "kind": "english"
      }
    ],
    "crs": [
      {
        "label": "Seychellenkreol",
        "kind": "local"
      },
      {
        "label": "Seychellois Creole",
        "kind": "english"
      },
      {
        "label": "塞舌尔克里奥尔语",
        "kind": "alias"
      },
      {
        "label": "Seselwa Creole French",
        "kind": "alias"
      },
      {
        "label": "créole seychellois",
        "kind": "alias"
      },
      {
        "label": "criollo seychelense",
        "kind": "alias"
      }
    ],
    "tig": [
      {
        "label": "Tigre",
        "kind": "local"
      },
      {
        "label": "提格雷语",
        "kind": "alias"
      },
      {
        "label": "tigré",
        "kind": "alias"
      }
    ],
    "wbl": [
      {
        "label": "Wakhi",
        "kind": "english"
      }
    ],
    "lus": [
      {
        "label": "Lushai",
        "kind": "local"
      },
      {
        "label": "Mizo",
        "kind": "english"
      },
      {
        "label": "米佐语",
        "kind": "alias"
      },
      {
        "label": "lushaï",
        "kind": "alias"
      }
    ],
    "xcb": [
      {
        "label": "Cumbric",
        "kind": "english"
      }
    ],
    "vsn": [
      {
        "label": "Vedic Sanskrit",
        "kind": "english"
      }
    ],
    "hyw": [
      {
        "label": "Western Armenian",
        "kind": "english"
      }
    ],
    "avk": [
      {
        "label": "Kotava",
        "kind": "local"
      }
    ],
    "slr": [
      {
        "label": "Salar",
        "kind": "english"
      }
    ],
    "otk": [
      {
        "label": "Old Turkic",
        "kind": "english"
      }
    ],
    "nde": [
      {
        "label": "Nord-Ndebele",
        "kind": "local"
      },
      {
        "label": "isiNdebele",
        "kind": "native"
      },
      {
        "label": "Northern Ndebele",
        "kind": "english"
      },
      {
        "label": "北恩德贝勒语",
        "kind": "alias"
      },
      {
        "label": "North Ndebele",
        "kind": "alias"
      },
      {
        "label": "ndébélé du Nord",
        "kind": "alias"
      },
      {
        "label": "ndebele septentrional",
        "kind": "alias"
      }
    ],
    "kha": [
      {
        "label": "Khasi",
        "kind": "local"
      },
      {
        "label": "卡西语",
        "kind": "alias"
      }
    ],
    "twi": [
      {
        "label": "Twi",
        "kind": "local"
      },
      {
        "label": "Akan",
        "kind": "native"
      },
      {
        "label": "契维语",
        "kind": "alias"
      }
    ],
    "grt": [
      {
        "label": "Garo",
        "kind": "english"
      }
    ],
    "txh": [
      {
        "label": "Thracian",
        "kind": "english"
      }
    ],
    "khw": [
      {
        "label": "Khowar",
        "kind": "local"
      }
    ],
    "xbc": [
      {
        "label": "Bactrian",
        "kind": "english"
      }
    ],
    "xpi": [
      {
        "label": "Pictish",
        "kind": "english"
      }
    ],
    "mxi": [
      {
        "label": "Andalusi Romance",
        "kind": "english"
      }
    ],
    "xpu": [
      {
        "label": "Punic",
        "kind": "english"
      }
    ],
    "sgh": [
      {
        "label": "Shughni",
        "kind": "english"
      }
    ],
    "bra": [
      {
        "label": "Braj-Bhakha",
        "kind": "local"
      },
      {
        "label": "Braj Bhasha",
        "kind": "english"
      },
      {
        "label": "布拉杰语",
        "kind": "alias"
      },
      {
        "label": "Braj",
        "kind": "alias"
      }
    ],
    "snk": [
      {
        "label": "Soninke",
        "kind": "local"
      },
      {
        "label": "索宁克语",
        "kind": "alias"
      },
      {
        "label": "soninké",
        "kind": "alias"
      }
    ],
    "xpg": [
      {
        "label": "Phrygian",
        "kind": "english"
      }
    ],
    "sjn": [
      {
        "label": "Sindarin",
        "kind": "english"
      }
    ],
    "ruo": [
      {
        "label": "Istro-Romanian",
        "kind": "english"
      }
    ],
    "nzs": [
      {
        "label": "New Zealand Sign Language",
        "kind": "english"
      }
    ],
    "cjs": [
      {
        "label": "Shor",
        "kind": "english"
      }
    ],
    "lua": [
      {
        "label": "Luba-Lulua",
        "kind": "local"
      },
      {
        "label": "Luba-Kasai",
        "kind": "english"
      },
      {
        "label": "卢巴-卢拉语",
        "kind": "alias"
      },
      {
        "label": "luba-kasaï (ciluba)",
        "kind": "alias"
      }
    ],
    "vls": [
      {
        "label": "Westflämisch",
        "kind": "local"
      },
      {
        "label": "West Flemish",
        "kind": "english"
      },
      {
        "label": "flamand occidental",
        "kind": "alias"
      }
    ],
    "zea": [
      {
        "label": "Seeländisch",
        "kind": "local"
      },
      {
        "label": "Zeelandic",
        "kind": "english"
      },
      {
        "label": "zélandais",
        "kind": "alias"
      }
    ],
    "pfl": [
      {
        "label": "Pfälzisch",
        "kind": "local"
      },
      {
        "label": "Palatinate German",
        "kind": "english"
      },
      {
        "label": "Palatine German",
        "kind": "alias"
      },
      {
        "label": "allemand palatin",
        "kind": "alias"
      }
    ],
    "aii": [
      {
        "label": "Assyrian Neo-Aramaic",
        "kind": "english"
      }
    ],
    "bfi": [
      {
        "label": "British Sign Language",
        "kind": "english"
      }
    ],
    "osx": [
      {
        "label": "Old Saxon",
        "kind": "english"
      }
    ],
    "xhu": [
      {
        "label": "Hurrian",
        "kind": "english"
      }
    ],
    "sjt": [
      {
        "label": "Ter Sami",
        "kind": "english"
      }
    ],
    "xvn": [
      {
        "label": "Vandalic",
        "kind": "english"
      }
    ],
    "yai": [
      {
        "label": "Yaghnobi",
        "kind": "english"
      }
    ],
    "sje": [
      {
        "label": "Pite Sami",
        "kind": "english"
      }
    ],
    "shn": [
      {
        "label": "Schan",
        "kind": "local"
      },
      {
        "label": "Shan",
        "kind": "english"
      },
      {
        "label": "掸语",
        "kind": "alias"
      }
    ],
    "tli": [
      {
        "label": "Tlingit",
        "kind": "local"
      },
      {
        "label": "特林吉特语",
        "kind": "alias"
      }
    ],
    "sga": [
      {
        "label": "Altirisch",
        "kind": "local"
      },
      {
        "label": "Old Irish",
        "kind": "english"
      },
      {
        "label": "古爱尔兰语",
        "kind": "alias"
      },
      {
        "label": "ancien irlandais",
        "kind": "alias"
      },
      {
        "label": "irlandés antiguo",
        "kind": "alias"
      }
    ],
    "lbj": [
      {
        "label": "Ladakhi",
        "kind": "english"
      }
    ],
    "bhb": [
      {
        "label": "Bhili",
        "kind": "english"
      }
    ],
    "rar": [
      {
        "label": "Rarotonganisch",
        "kind": "local"
      },
      {
        "label": "Cook Islands Maori",
        "kind": "english"
      },
      {
        "label": "拉罗汤加语",
        "kind": "alias"
      },
      {
        "label": "Rarotongan",
        "kind": "alias"
      },
      {
        "label": "rarotongien",
        "kind": "alias"
      },
      {
        "label": "rarotongano",
        "kind": "alias"
      }
    ],
    "tkr": [
      {
        "label": "Tsachurisch",
        "kind": "local"
      },
      {
        "label": "Tsakhur",
        "kind": "english"
      },
      {
        "label": "tsakhour",
        "kind": "alias"
      }
    ],
    "srh": [
      {
        "label": "Sarikoli",
        "kind": "english"
      }
    ],
    "uum": [
      {
        "label": "Urum",
        "kind": "english"
      }
    ],
    "sia": [
      {
        "label": "Akkala Sami",
        "kind": "english"
      }
    ],
    "ist": [
      {
        "label": "Istriot",
        "kind": "english"
      }
    ],
    "xld": [
      {
        "label": "Lydian",
        "kind": "english"
      }
    ],
    "lkt": [
      {
        "label": "Lakota",
        "kind": "local"
      },
      {
        "label": "Lakȟólʼiyapi",
        "kind": "native"
      },
      {
        "label": "拉科塔语",
        "kind": "alias"
      }
    ],
    "kim": [
      {
        "label": "Tofa",
        "kind": "english"
      }
    ],
    "jrb": [
      {
        "label": "Jüdisch-Arabisch",
        "kind": "local"
      },
      {
        "label": "Judeo-Arabic",
        "kind": "english"
      },
      {
        "label": "犹太阿拉伯语",
        "kind": "alias"
      },
      {
        "label": "judéo-arabe",
        "kind": "alias"
      },
      {
        "label": "judeo-árabe",
        "kind": "alias"
      }
    ],
    "tzm": [
      {
        "label": "Zentralatlas-Tamazight",
        "kind": "local"
      },
      {
        "label": "Tamaziɣt n laṭlaṣ",
        "kind": "native"
      },
      {
        "label": "Central Atlas Tamazight",
        "kind": "english"
      },
      {
        "label": "塔马齐格特语",
        "kind": "alias"
      },
      {
        "label": "amazighe de l’Atlas central",
        "kind": "alias"
      },
      {
        "label": "tamazight del Atlas Central",
        "kind": "alias"
      }
    ],
    "arq": [
      {
        "label": "Algerisches Arabisch",
        "kind": "local"
      },
      {
        "label": "Algerian Arabic",
        "kind": "english"
      },
      {
        "label": "arabe algérien",
        "kind": "alias"
      }
    ],
    "myp": [
      {
        "label": "Pirahã",
        "kind": "english"
      }
    ],
    "mey": [
      {
        "label": "Hassaniya Arabic",
        "kind": "english"
      }
    ],
    "tsg": [
      {
        "label": "Tausug",
        "kind": "english"
      }
    ],
    "rif": [
      {
        "label": "Tarifit",
        "kind": "local"
      },
      {
        "label": "里夫语",
        "kind": "alias"
      },
      {
        "label": "Riffian",
        "kind": "alias"
      },
      {
        "label": "rifain",
        "kind": "alias"
      }
    ],
    "mrj": [
      {
        "label": "Bergmari",
        "kind": "local"
      },
      {
        "label": "Hill Mari",
        "kind": "english"
      },
      {
        "label": "Western Mari",
        "kind": "alias"
      },
      {
        "label": "mari occidental",
        "kind": "alias"
      }
    ],
    "bft": [
      {
        "label": "Balti",
        "kind": "english"
      }
    ],
    "clw": [
      {
        "label": "Chulym",
        "kind": "english"
      }
    ],
    "jct": [
      {
        "label": "Krymchak",
        "kind": "english"
      }
    ],
    "udi": [
      {
        "label": "Udi",
        "kind": "english"
      }
    ],
    "sju": [
      {
        "label": "Ume Sami",
        "kind": "english"
      }
    ],
    "ruq": [
      {
        "label": "Megleno-Romanian",
        "kind": "english"
      }
    ],
    "xga": [
      {
        "label": "Galatian",
        "kind": "english"
      }
    ],
    "aib": [
      {
        "label": "Äynu",
        "kind": "english"
      }
    ],
    "ncs": [
      {
        "label": "Nicaraguan Sign Language",
        "kind": "english"
      }
    ],
    "afb": [
      {
        "label": "Gulf Arabic",
        "kind": "english"
      }
    ],
    "swg": [
      {
        "label": "Swabian",
        "kind": "english"
      }
    ],
    "eya": [
      {
        "label": "Eyak",
        "kind": "english"
      }
    ],
    "dar": [
      {
        "label": "Darginisch",
        "kind": "local"
      },
      {
        "label": "Dargwa",
        "kind": "english"
      },
      {
        "label": "达尔格瓦语",
        "kind": "alias"
      },
      {
        "label": "dargva",
        "kind": "alias"
      }
    ],
    "trp": [
      {
        "label": "Kokborok",
        "kind": "english"
      }
    ],
    "xlc": [
      {
        "label": "Lycian",
        "kind": "english"
      }
    ],
    "hoc": [
      {
        "label": "Ho",
        "kind": "english"
      }
    ],
    "pih": [
      {
        "label": "Pitkern",
        "kind": "english"
      }
    ],
    "xum": [
      {
        "label": "Umbrian",
        "kind": "english"
      }
    ],
    "din": [
      {
        "label": "Dinka",
        "kind": "local"
      },
      {
        "label": "丁卡语",
        "kind": "alias"
      }
    ],
    "lif": [
      {
        "label": "Limbu",
        "kind": "english"
      }
    ],
    "lki": [
      {
        "label": "Laki",
        "kind": "english"
      }
    ],
    "ise": [
      {
        "label": "Italian Sign Language",
        "kind": "english"
      }
    ],
    "scl": [
      {
        "label": "Shina",
        "kind": "english"
      }
    ],
    "xeb": [
      {
        "label": "Eblaite",
        "kind": "english"
      }
    ],
    "xur": [
      {
        "label": "Urartian",
        "kind": "english"
      }
    ],
    "zkz": [
      {
        "label": "Khazar language",
        "kind": "english"
      }
    ],
    "gmy": [
      {
        "label": "Mycenaean Greek",
        "kind": "english"
      }
    ],
    "gmh": [
      {
        "label": "Mittelhochdeutsch",
        "kind": "local"
      },
      {
        "label": "Middle High German",
        "kind": "english"
      },
      {
        "label": "中古高地德语",
        "kind": "alias"
      },
      {
        "label": "moyen haut-allemand",
        "kind": "alias"
      },
      {
        "label": "alto alemán medio",
        "kind": "alias"
      }
    ],
    "aln": [
      {
        "label": "Gegisch",
        "kind": "local"
      },
      {
        "label": "Gheg",
        "kind": "english"
      },
      {
        "label": "Gheg Albanian",
        "kind": "alias"
      },
      {
        "label": "guègue",
        "kind": "alias"
      }
    ],
    "alt": [
      {
        "label": "Süd-Altaisch",
        "kind": "local"
      },
      {
        "label": "Southern Altai",
        "kind": "english"
      },
      {
        "label": "南阿尔泰语",
        "kind": "alias"
      },
      {
        "label": "altaï du Sud",
        "kind": "alias"
      },
      {
        "label": "altái meridional",
        "kind": "alias"
      }
    ],
    "rhg": [
      {
        "label": "Rohingyalisch",
        "kind": "local"
      },
      {
        "label": "Rohingya",
        "kind": "english"
      },
      {
        "label": "罗兴亚语",
        "kind": "alias"
      },
      {
        "label": "rohinyá",
        "kind": "alias"
      }
    ],
    "lrl": [
      {
        "label": "Achomi",
        "kind": "english"
      }
    ],
    "tum": [
      {
        "label": "Tumbuka",
        "kind": "local"
      },
      {
        "label": "通布卡语",
        "kind": "alias"
      }
    ],
    "bin": [
      {
        "label": "Bini",
        "kind": "local"
      },
      {
        "label": "Edo",
        "kind": "english"
      },
      {
        "label": "比尼语",
        "kind": "alias"
      }
    ],
    "bik": [
      {
        "label": "Bikol",
        "kind": "local"
      },
      {
        "label": "比科尔语",
        "kind": "alias"
      },
      {
        "label": "bicol",
        "kind": "alias"
      }
    ],
    "iii": [
      {
        "label": "Yi",
        "kind": "local"
      },
      {
        "label": "ꆈꌠꉙ",
        "kind": "native"
      },
      {
        "label": "Sichuan Yi",
        "kind": "english"
      },
      {
        "label": "凉山彝语",
        "kind": "alias"
      },
      {
        "label": "yi du Sichuan",
        "kind": "alias"
      },
      {
        "label": "yi de Sichuán",
        "kind": "alias"
      },
      {
        "label": "nuosu",
        "kind": "alias"
      },
      {
        "label": "彝语",
        "kind": "alias"
      },
      {
        "label": "彝文",
        "kind": "alias"
      },
      {
        "label": "彝語",
        "kind": "alias"
      }
    ],
    "olo": [
      {
        "label": "Livvi-Karelian",
        "kind": "english"
      }
    ],
    "xsr": [
      {
        "label": "Sherpa",
        "kind": "english"
      }
    ],
    "umb": [
      {
        "label": "Umbundu",
        "kind": "local"
      },
      {
        "label": "翁本杜语",
        "kind": "alias"
      }
    ],
    "acm": [
      {
        "label": "Iraqi Arabic",
        "kind": "english"
      }
    ],
    "sas": [
      {
        "label": "Sasak",
        "kind": "local"
      },
      {
        "label": "萨萨克语",
        "kind": "alias"
      }
    ],
    "kua": [
      {
        "label": "Kwanyama",
        "kind": "local"
      },
      {
        "label": "宽亚玛语",
        "kind": "alias"
      },
      {
        "label": "Kuanyama",
        "kind": "alias"
      }
    ]
  }
};

export const GENERATED_LANGUAGE_ALIAS_TO_CODE: LanguageAliasToCodeRecord = 
{
  "英文": "eng",
  "英語": "eng",
  "中文": "cmn",
  "日文": "jpn",
  "日語": "jpn",
  "韩文": "kor",
  "韓文": "kor",
  "法文": "fra",
  "法語": "fra",
  "德文": "deu",
  "德語": "deu",
  "西文": "spa",
  "西語": "spa",
  "俄文": "rus",
  "俄語": "rus",
  "泰文": "tha",
  "泰語": "tha",
  "越文": "vie",
  "越語": "vie",
  "葡文": "por",
  "葡语": "por",
  "葡語": "por",
  "意文": "ita",
  "意语": "ita",
  "意語": "ita",
  "阿文": "ara",
  "阿语": "ara",
  "阿語": "ara",
  "土文": "tur",
  "土语": "tur",
  "土語": "tur",
  "荷文": "nld",
  "荷语": "nld",
  "荷語": "nld",
  "波文": "pol",
  "波语": "pol",
  "波語": "pol",
  "印地文": "hin",
  "印地語": "hin",
  "印尼文": "ind",
  "印尼语": "ind",
  "印尼語": "ind",
  "马来文": "msa",
  "马来话": "msa",
  "馬來文": "msa",
  "馬來話": "msa",
  "波斯文": "fas",
  "波斯語": "fas",
  "法尔西": "fas",
  "法爾西": "fas",
  "希伯来文": "heb",
  "希伯來文": "heb",
  "缅语": "mya",
  "缅文": "mya",
  "緬語": "mya",
  "緬文": "mya",
  "高棉文": "khm",
  "柬语": "khm",
  "柬語": "khm",
  "柬埔寨语": "khm",
  "柬埔寨語": "khm",
  "尼泊尔文": "nep",
  "尼泊爾文": "nep",
  "孟加拉文": "ben",
  "孟加拉語": "ben",
  "乌尔都文": "urd",
  "烏爾都文": "urd",
  "旁遮普文": "pan",
  "旁遮普語": "pan",
  "他加禄文": "tgl",
  "他加祿文": "tgl",
  "阿姆哈拉文": "amh",
  "阿姆哈拉語": "amh",
  "english": "eng",
  "american english": "eng",
  "british english": "eng",
  "chinese": "cmn",
  "mandarin": "cmn",
  "mandarin chinese": "cmn",
  "standard chinese": "cmn",
  "putonghua": "cmn",
  "guoyu": "cmn",
  "central kurdish": "ckb",
  "sorani": "ckb",
  "northern kurdish": "kmr",
  "kurmanji": "kmr",
  "cantonese": "yue",
  "cantonese chinese": "yue",
  "guangdonghua": "yue",
  "japanese": "jpn",
  "korean": "kor",
  "french": "fra",
  "german": "deu",
  "deutsch": "deu",
  "spanish": "spa",
  "castilian": "spa",
  "castilian spanish": "spa",
  "latin american spanish": "spa",
  "mexican spanish": "spa",
  "portuguese": "por",
  "brazilian portuguese": "por",
  "european portuguese": "por",
  "italian": "ita",
  "russian": "rus",
  "arabic": "ara",
  "modern standard arabic": "ara",
  "thai": "tha",
  "vietnamese": "vie",
  "indonesian": "ind",
  "bahasa indonesia": "ind",
  "hindi": "hin",
  "turkish": "tur",
  "dutch": "nld",
  "flemish": "nld",
  "polish": "pol",
  "hebrew": "heb",
  "swahili": "swa",
  "malay": "msa",
  "bahasa melayu": "msa",
  "burmese": "mya",
  "khmer": "khm",
  "tibetan": "bod",
  "nepali": "nep",
  "bengali": "ben",
  "bangla": "ben",
  "tamil": "tam",
  "urdu": "urd",
  "tagalog": "tgl",
  "amharic": "amh",
  "farsi": "fas",
  "persian farsi": "fas",
  "sinhalese": "sin",
  "shanghainese": "wuu",
  "wu chinese": "wuu",
  "hokkien": "nan",
  "taiwanese hokkien": "nan",
  "minnan": "nan",
  "swiss german": "gsw",
  "alemannic": "gsw",
  "alsatian": "gsw",
  "sichuan yi": "iii",
  "nuosu": "iii",
  "dhivehi": "div",
  "divehi": "div",
  "maldivian": "div",
  "hakka": "hak",
  "hakka chinese": "hak",
  "gan chinese": "gan",
  "xiang chinese": "hsn",
  "jin chinese": "cjy",
  "韩国语": "kor",
  "朝鲜语": "kor",
  "朝鮮文": "kor",
  "韓語": "kor",
  "汉语": "cmn",
  "国语": "cmn",
  "國語": "cmn",
  "华语": "cmn",
  "華語": "cmn",
  "汉文": "zho",
  "漢文": "zho",
  "华文": "zho",
  "華文": "zho",
  "普通话": "cmn",
  "官话": "cmn",
  "北方话": "cmn",
  "北方方言": "cmn",
  "中文普通话": "cmn",
  "粤语": "yue",
  "广东话": "yue",
  "廣東話": "yue",
  "白话": "yue",
  "白話": "yue",
  "吴语": "wuu",
  "上海话": "wuu",
  "上海话方言": "wuu",
  "闽南语": "nan",
  "閩南語": "nan",
  "台语": "nan",
  "臺語": "nan",
  "河洛话": "nan",
  "河洛話": "nan",
  "客家语": "hak",
  "客家話": "hak",
  "客家话": "hak",
  "赣语": "gan",
  "贛語": "gan",
  "晋语": "cjy",
  "晉語": "cjy",
  "湘语": "hsn",
  "湘語": "hsn",
  "藏语": "bod",
  "藏文": "bod",
  "藏語": "bod",
  "藏話": "bod",
  "维语": "uig",
  "維語": "uig",
  "维吾尔语": "uig",
  "維吾爾語": "uig",
  "蒙古语": "mon",
  "蒙古文": "mon",
  "蒙古語": "mon",
  "蒙古話": "mon",
  "壮语": "zha",
  "壮文": "zha",
  "壯語": "zha",
  "哈萨克语": "kaz",
  "哈薩克語": "kaz",
  "柯尔克孜语": "kir",
  "柯爾克孜語": "kir",
  "吉尔吉斯语": "kir",
  "吉爾吉斯語": "kir",
  "塔吉克语": "tgk",
  "塔吉克語": "tgk",
  "锡伯语": "sjo",
  "錫伯語": "sjo",
  "满语": "mnc",
  "滿語": "mnc",
  "彝语": "iii",
  "彝文": "iii",
  "彝語": "iii",
  "苗语": "hmn",
  "苗語": "hmn",
  "傈僳语": "lis",
  "傈僳語": "lis",
  "拉祜语": "lhu",
  "拉祜語": "lhu"
};

export const GENERATED_LANGUAGE_ALIASES_BY_CODE: LanguageAliasesByCodeRecord = 
{
  "eng": [
    "英文",
    "英語",
    "english",
    "american english",
    "british english"
  ],
  "cmn": [
    "中文",
    "chinese",
    "mandarin",
    "mandarin chinese",
    "standard chinese",
    "putonghua",
    "guoyu",
    "汉语",
    "国语",
    "國語",
    "华语",
    "華語",
    "普通话",
    "官话",
    "北方话",
    "北方方言",
    "中文普通话"
  ],
  "jpn": [
    "日文",
    "日語",
    "japanese"
  ],
  "kor": [
    "韩文",
    "韓文",
    "korean",
    "韩国语",
    "朝鲜语",
    "朝鮮文",
    "韓語"
  ],
  "fra": [
    "法文",
    "法語",
    "french"
  ],
  "deu": [
    "德文",
    "德語",
    "german",
    "deutsch"
  ],
  "spa": [
    "西文",
    "西語",
    "spanish",
    "castilian",
    "castilian spanish",
    "latin american spanish",
    "mexican spanish"
  ],
  "rus": [
    "俄文",
    "俄語",
    "russian"
  ],
  "tha": [
    "泰文",
    "泰語",
    "thai"
  ],
  "vie": [
    "越文",
    "越語",
    "vietnamese"
  ],
  "por": [
    "葡文",
    "葡语",
    "葡語",
    "portuguese",
    "brazilian portuguese",
    "european portuguese"
  ],
  "ita": [
    "意文",
    "意语",
    "意語",
    "italian"
  ],
  "ara": [
    "阿文",
    "阿语",
    "阿語",
    "arabic",
    "modern standard arabic"
  ],
  "tur": [
    "土文",
    "土语",
    "土語",
    "turkish"
  ],
  "nld": [
    "荷文",
    "荷语",
    "荷語",
    "dutch",
    "flemish"
  ],
  "pol": [
    "波文",
    "波语",
    "波語",
    "polish"
  ],
  "hin": [
    "印地文",
    "印地語",
    "hindi"
  ],
  "ind": [
    "印尼文",
    "印尼语",
    "印尼語",
    "indonesian",
    "bahasa indonesia"
  ],
  "msa": [
    "马来文",
    "马来话",
    "馬來文",
    "馬來話",
    "malay",
    "bahasa melayu"
  ],
  "fas": [
    "波斯文",
    "波斯語",
    "法尔西",
    "法爾西",
    "farsi",
    "persian farsi"
  ],
  "heb": [
    "希伯来文",
    "希伯來文",
    "hebrew"
  ],
  "mya": [
    "缅语",
    "缅文",
    "緬語",
    "緬文",
    "burmese"
  ],
  "khm": [
    "高棉文",
    "柬语",
    "柬語",
    "柬埔寨语",
    "柬埔寨語",
    "khmer"
  ],
  "nep": [
    "尼泊尔文",
    "尼泊爾文",
    "nepali"
  ],
  "ben": [
    "孟加拉文",
    "孟加拉語",
    "bengali",
    "bangla"
  ],
  "urd": [
    "乌尔都文",
    "烏爾都文",
    "urdu"
  ],
  "pan": [
    "旁遮普文",
    "旁遮普語"
  ],
  "tgl": [
    "他加禄文",
    "他加祿文",
    "tagalog"
  ],
  "amh": [
    "阿姆哈拉文",
    "阿姆哈拉語",
    "amharic"
  ],
  "ckb": [
    "central kurdish",
    "sorani"
  ],
  "kmr": [
    "northern kurdish",
    "kurmanji"
  ],
  "yue": [
    "cantonese",
    "cantonese chinese",
    "guangdonghua",
    "粤语",
    "广东话",
    "廣東話",
    "白话",
    "白話"
  ],
  "swa": [
    "swahili"
  ],
  "bod": [
    "tibetan",
    "藏语",
    "藏文",
    "藏語",
    "藏話"
  ],
  "tam": [
    "tamil"
  ],
  "sin": [
    "sinhalese"
  ],
  "wuu": [
    "shanghainese",
    "wu chinese",
    "吴语",
    "上海话",
    "上海话方言"
  ],
  "nan": [
    "hokkien",
    "taiwanese hokkien",
    "minnan",
    "闽南语",
    "閩南語",
    "台语",
    "臺語",
    "河洛话",
    "河洛話"
  ],
  "gsw": [
    "swiss german",
    "alemannic",
    "alsatian"
  ],
  "iii": [
    "sichuan yi",
    "nuosu",
    "彝语",
    "彝文",
    "彝語"
  ],
  "div": [
    "dhivehi",
    "divehi",
    "maldivian"
  ],
  "hak": [
    "hakka",
    "hakka chinese",
    "客家语",
    "客家話",
    "客家话"
  ],
  "gan": [
    "gan chinese",
    "赣语",
    "贛語"
  ],
  "hsn": [
    "xiang chinese",
    "湘语",
    "湘語"
  ],
  "cjy": [
    "jin chinese",
    "晋语",
    "晉語"
  ],
  "zho": [
    "汉文",
    "漢文",
    "华文",
    "華文"
  ],
  "uig": [
    "维语",
    "維語",
    "维吾尔语",
    "維吾爾語"
  ],
  "mon": [
    "蒙古语",
    "蒙古文",
    "蒙古語",
    "蒙古話"
  ],
  "zha": [
    "壮语",
    "壮文",
    "壯語"
  ],
  "kaz": [
    "哈萨克语",
    "哈薩克語"
  ],
  "kir": [
    "柯尔克孜语",
    "柯爾克孜語",
    "吉尔吉斯语",
    "吉爾吉斯語"
  ],
  "tgk": [
    "塔吉克语",
    "塔吉克語"
  ],
  "sjo": [
    "锡伯语",
    "錫伯語"
  ],
  "mnc": [
    "满语",
    "滿語"
  ],
  "hmn": [
    "苗语",
    "苗語"
  ],
  "lis": [
    "傈僳语",
    "傈僳語"
  ],
  "lhu": [
    "拉祜语",
    "拉祜語"
  ]
};
