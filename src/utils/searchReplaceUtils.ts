export interface SearchableItem {
  utteranceId: string;
  layerId?: string;
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
  utteranceId: string;
  layerId: string | undefined;
  oldText: string;
  newText: string;
}

export interface SearchMatch {
  utteranceId: string;
  layerId: string | undefined;
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
      warning: '正则表达式过长，已跳过执行以避免卡顿。',
    };
  }

  if (options.regexMode && hasHighRiskRegexShape(query)) {
    return {
      pattern: null,
      warning: '检测到高风险正则（嵌套量词），已跳过执行。',
    };
  }

  const base = options.regexMode ? query : escapeRegex(query);
  const body = options.wholeWord ? `\\b(?:${base})\\b` : base;
  const flags = options.caseSensitive ? 'g' : 'gi';

  try {
    return { pattern: new RegExp(body, flags) };
  } catch {
    return {
      pattern: null,
      error: '正则表达式无效，请检查语法。',
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
          utteranceId: item.utteranceId,
          layerId: item.layerId ?? undefined,
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
        utteranceId: item.utteranceId,
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
