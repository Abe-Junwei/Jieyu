const DICTIONARY_PRIMARY = new Set(['zh', 'zho', 'cmn', 'chi', 'ja', 'jpn', 'th', 'tha']);

function primaryLanguage(languageId: string | undefined): string {
  return (languageId ?? '').trim().toLowerCase().split('-')[0] ?? '';
}

/** Locale passed to Intl.Segmenter. Unlisted languages stay `und`. */
export function annotationSegmenterLocale(languageId: string | undefined): string {
  const primary = primaryLanguage(languageId);
  if (primary === 'zh' || primary === 'zho' || primary === 'cmn' || primary === 'chi') return 'zh';
  if (primary === 'ja' || primary === 'jpn') return 'ja';
  if (primary === 'th' || primary === 'tha') return 'th';
  return 'und';
}

export function annotationUsesDictionaryTokenization(languageId: string | undefined): boolean {
  return DICTIONARY_PRIMARY.has(primaryLanguage(languageId));
}
