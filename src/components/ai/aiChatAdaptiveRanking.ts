import type { AiAdaptiveInputProfile } from '../../ai/chat/chatDomain.types';
import type { PromptTemplateItem } from './aiChatCardUtils';

interface RankableTextItem {
  key: string;
  label: string;
  searchText?: string;
}

const INTENT_HINTS: Record<NonNullable<AiAdaptiveInputProfile['dominantIntent']>, string[]> = {
  translation: ['翻译', '译文', '术语', 'translation', 'terminology', 'review'],
  transcription: ['转写', '听写', '分段', 'transcription', 'segment'],
  gloss: ['gloss', '词性', 'pos', '术语', '词法'],
  review: ['审校', '复核', '风险', 'review', 'audit', 'check'],
  summary: ['总结', '摘要', 'summary', 'overview', 'balanced'],
  explain: ['解释', '说明', 'explain', 'why'],
  compare: ['对比', '比较', '差异', 'compare', 'balanced', 'review'],
  steps: ['步骤', '下一步', 'plan', 'step'],
  qa: ['问答', '问题', 'qa', 'question', 'answer'],
};

const STYLE_HINTS: Record<NonNullable<AiAdaptiveInputProfile['preferredResponseStyle']>, string[]> = {
  analysis: ['分析', '审校', 'review', 'risk', 'balanced'],
  direct_edit: ['润色', '改写', '补全', 'rewrite', 'draft', 'terminology'],
  concise: ['总结', '摘要', 'summary', 'qa'],
  detailed: ['详细', '依据', 'review', 'balanced', 'terminology'],
  step_by_step: ['步骤', '下一步', 'plan', 'review'],
};

function normalize(text: string): string {
  return text.toLowerCase();
}

function scoreText(text: string, profile: AiAdaptiveInputProfile | undefined): number {
  if (!profile) return 0;
  const haystack = normalize(text);
  let score = 0;

  if (profile.dominantIntent) {
    for (const hint of INTENT_HINTS[profile.dominantIntent]) {
      if (haystack.includes(normalize(hint))) score += 4;
    }
  }

  if (profile.preferredResponseStyle) {
    for (const hint of STYLE_HINTS[profile.preferredResponseStyle]) {
      if (haystack.includes(normalize(hint))) score += 2;
    }
  }

  for (const keyword of profile.topKeywords ?? []) {
    if (haystack.includes(normalize(keyword))) score += 3;
  }

  const lastPrompt = profile.lastPromptExcerpt?.trim();
  if (lastPrompt) {
    const promptTokens = lastPrompt
      .toLowerCase()
      .split(/[\s,.;:!?，。；：、/]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2);
    for (const token of promptTokens) {
      if (haystack.includes(token)) score += 1;
    }
  }

  return score;
}

function stableSortByAdaptiveScore<T extends RankableTextItem>(
  items: T[],
  profile: AiAdaptiveInputProfile | undefined,
): T[] {
  return items
    .map((item, index) => ({
      item,
      index,
      score: scoreText(`${item.label} ${item.searchText ?? ''}`, profile),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item);
}

export function rankPromptTemplatesByAdaptiveProfile(
  templates: PromptTemplateItem[],
  profile: AiAdaptiveInputProfile | undefined,
): PromptTemplateItem[] {
  return stableSortByAdaptiveScore(
    templates.map((item) => ({
      ...item,
      key: item.id,
      label: item.title,
      searchText: item.content,
    })),
    profile,
  ).map(({ key: _key, label: _label, searchText: _searchText, ...item }) => item);
}

export function rankCandidateLabelsByAdaptiveProfile<T extends { key: string; label: string }>(
  candidates: T[],
  profile: AiAdaptiveInputProfile | undefined,
): T[] {
  return stableSortByAdaptiveScore(candidates, profile);
}
