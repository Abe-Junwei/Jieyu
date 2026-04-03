import { t, tf, type Locale } from '.';
import type { RecommendedPlaceholderInput } from './aiChatCardMessages';

export interface AiChatHybridFallbackInput extends RecommendedPlaceholderInput {
  primarySuggestion: string;
}

export interface AiChatHybridMessages {
  sectionTitle: string;
  localBadge: string;
  aiBadge: string;
  refreshing: string;
  recommendationButtonLabel: (label: string) => string;
  buildFallbackRecommendations: (input: AiChatHybridFallbackInput) => string[];
}

function clipText(text: string | null | undefined, max = 18): string {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.length <= max ? normalized : `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function buildFallbackRecommendations(locale: Locale, input: AiChatHybridFallbackInput): string[] {
  const excerpt = clipText(input.selectedText);
  const focus = excerpt
    ? (locale === 'zh-CN' ? `当前内容「${excerpt}」` : `the current content "${excerpt}"`)
    : input.rowNumber
      ? (locale === 'zh-CN' ? `第 ${input.rowNumber} 行` : `row ${input.rowNumber}`)
      : locale === 'zh-CN' ? '当前内容' : 'the current context';
  const keywordHint = input.adaptiveKeywords?.slice(0, 2).join(' / ');

  const suggestions = [
    input.primarySuggestion,
    input.selectedLayerType === 'translation'
      ? tf(locale, 'ai.chat.hybrid.fallback.reviewTranslation', { focus })
      : input.selectedLayerType === 'transcription'
        ? tf(locale, 'ai.chat.hybrid.fallback.reviewTranscription', { focus })
        : input.adaptiveIntent === 'compare'
          ? tf(locale, 'ai.chat.hybrid.fallback.compare', { focus })
          : input.adaptiveIntent === 'summary'
            ? tf(locale, 'ai.chat.hybrid.fallback.summary', { focus })
            : t(locale, 'ai.chat.hybrid.fallback.nextPriority'),
    input.adaptiveResponseStyle === 'step_by_step'
      ? tf(locale, 'ai.chat.hybrid.fallback.stepByStep', { focus })
      : input.adaptiveIntent === 'gloss'
        ? tf(locale, 'ai.chat.hybrid.fallback.gloss', { focus })
        : keywordHint
          ? tf(locale, 'ai.chat.hybrid.fallback.keywordPrompts', { keywords: keywordHint })
          : t(locale, 'ai.chat.hybrid.fallback.historyPrompts'),
  ];

  return [...new Set(suggestions.map((item) => item.trim()).filter(Boolean))].slice(0, 3);
}

export function getAiChatHybridMessages(isZh: boolean): AiChatHybridMessages {
  const locale: Locale = isZh ? 'zh-CN' : 'en-US';
  if (isZh) {
    return {
      sectionTitle: t(locale, 'ai.chat.hybrid.sectionTitle'),
      localBadge: t(locale, 'ai.chat.hybrid.badge.local'),
      aiBadge: t(locale, 'ai.chat.hybrid.badge.ai'),
      refreshing: t(locale, 'ai.chat.hybrid.badge.refreshing'),
      recommendationButtonLabel: (label) => tf(locale, 'ai.chat.hybrid.recommendationButton', { label }),
      buildFallbackRecommendations: (input) => buildFallbackRecommendations(locale, input),
    };
  }

  return {
    sectionTitle: t(locale, 'ai.chat.hybrid.sectionTitle'),
    localBadge: t(locale, 'ai.chat.hybrid.badge.local'),
    aiBadge: t(locale, 'ai.chat.hybrid.badge.ai'),
    refreshing: t(locale, 'ai.chat.hybrid.badge.refreshing'),
    recommendationButtonLabel: (label) => tf(locale, 'ai.chat.hybrid.recommendationButton', { label }),
    buildFallbackRecommendations: (input) => buildFallbackRecommendations(locale, input),
  };
}
