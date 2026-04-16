export interface SearchableItem {
  unitId: string;
  layerId?: string;
  layerKind?: 'transcription' | 'translation' | 'gloss';
  languageId?: string;
  orthographyId?: string;
  text: string;
}

export interface SearchReplaceOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  regexMode: boolean;
}

export type PatternAnalysis = {
  pattern: RegExp | null;
  error?: string;
  warning?: string;
};

export interface ReplacePlanItem {
  unitId: string;
  layerId: string | undefined;
  oldText: string;
  newText: string;
}

export interface SearchMatch {
  unitId: string;
  layerId: string | undefined;
  languageId?: string;
  orthographyId?: string;
  text: string;
  matchStart: number;
  matchEnd: number;
}

function escapeRegex(query: string): string {
  return query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasHighRiskRegexShape(query: string): boolean {
  // Heuristic: nested quantifiers like (.+)+, (.*)* can cause catastrophic backtracking.
  return /\((?:[^()]|\([^)]*\))*[+*][^)]*\)[+*]/.test(query);
}

export function analyzeSearchPattern(query: string, options: SearchReplaceOptions): PatternAnalysis {
  if (!query) return { pattern: null };

  if (options.regexMode && query.length > 120) {
    return {
      pattern: null,
      warning: '\u6b63\u5219\u8868\u8fbe\u5f0f\u8fc7\u957f\uff0c\u5df2\u8df3\u8fc7\u6267\u884c\u4ee5\u907f\u514d\u5361\u987f\u3002',
    };
  }

  if (options.regexMode && hasHighRiskRegexShape(query)) {
    return {
      pattern: null,
      warning: '\u68c0\u6d4b\u5230\u9ad8\u98ce\u9669\u6b63\u5219\uff08\u5d4c\u5957\u91cf\u8bcd\uff09\uff0c\u5df2\u8df3\u8fc7\u6267\u884c\u3002',
    };
  }

  const base = options.regexMode ? query : escapeRegex(query);
  const body = options.wholeWord ? `\\b(?:${base})\\b` : base;
  const flags = options.caseSensitive ? 'g' : 'gi';

  try {
    return { pattern: new RegExp(body, flags) };
  } catch (err) {
    console.error('[Jieyu] searchReplaceUtils: invalid regex pattern', { body, flags, err });
    return {
      pattern: null,
      error: '\u6b63\u5219\u8868\u8fbe\u5f0f\u65e0\u6548\uff0c\u8bf7\u68c0\u67e5\u8bed\u6cd5\u3002',
    };
  }
}

function buildPattern(query: string, options: SearchReplaceOptions): RegExp | null {
  return analyzeSearchPattern(query, options).pattern;
}

export function findSearchMatches(
  items: SearchableItem[],
  query: string,
  options: SearchReplaceOptions,
): SearchMatch[] {
  const pattern = buildPattern(query, options);
  if (!pattern) return [];

  const matches: SearchMatch[] = [];
  for (const item of items) {
    const source = item.text;
    pattern.lastIndex = 0;
    let found = pattern.exec(source);
    while (found) {
      const full = found[0] ?? '';
      if (full.length === 0) {
        pattern.lastIndex += 1;
      } else {
        matches.push({
          unitId: item.unitId,
          layerId: item.layerId ?? undefined,
          ...(item.languageId ? { languageId: item.languageId } : {}),
          ...(item.orthographyId ? { orthographyId: item.orthographyId } : {}),
          text: source,
          matchStart: found.index,
          matchEnd: found.index + full.length,
        });
      }
      found = pattern.exec(source);
    }
  }

  return matches;
}

export function replaceAllInItems(
  items: SearchableItem[],
  query: string,
  replaceText: string,
  options: SearchReplaceOptions,
): ReplacePlanItem[] {
  const pattern = buildPattern(query, options);
  if (!pattern) return [];

  const updates: ReplacePlanItem[] = [];
  for (const item of items) {
    pattern.lastIndex = 0;
    const newText = item.text.replace(pattern, replaceText);
    if (newText !== item.text) {
      updates.push({
        unitId: item.unitId,
        layerId: item.layerId ?? undefined,
        oldText: item.text,
        newText,
      });
    }
  }
  return updates;
}

export function buildReplacePlan(
  items: SearchableItem[],
  query: string,
  replaceText: string,
  options: SearchReplaceOptions,
): ReplacePlanItem[] {
  return replaceAllInItems(items, query, replaceText, options);
}
