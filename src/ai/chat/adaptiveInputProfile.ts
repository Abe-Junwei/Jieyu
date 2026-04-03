import type {
  AiAdaptiveInputProfile,
  AiAdaptiveIntent,
  AiAdaptiveResponseStyle,
  AiSessionMemory,
  UiChatMessage,
} from '../../hooks/useAiChat.types';

const MAX_RECENT_PROMPTS = 20;
const MAX_KEYWORDS = 5;

const EN_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'into', 'please', 'current', 'segment',
  'utterance', 'layer', 'need', 'show', 'tell', 'help', 'make', 'more', 'what', 'which', 'when',
  'where', 'your', 'about', 'have', 'been', 'should', 'would', 'could', 'review', 'check',
]);

const ZH_STOPWORDS = new Set([
  '当前', '这个', '这条', '一下', '一下子', '我们', '你帮我', '帮我', '请', '并且', '以及', '然后', '继续',
  '内容', '问题', '现在', '这里', '那个', '这些', '那些', '是否', '可以', '需要', '一个', '一些',
]);

function normalizePrompt(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function clipPrompt(text: string, max = 24): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function collectMatches(text: string, pattern: RegExp): number {
  const matches = text.match(pattern);
  return matches?.length ?? 0;
}

function scoreIntent(text: string): Record<AiAdaptiveIntent, number> {
  const lower = text.toLowerCase();
  return {
    translation: collectMatches(text, /翻译|译文|意译|直译/gi) + collectMatches(lower, /\btranslate|translation|rewrite\b/g),
    transcription: collectMatches(text, /转写|听写|切分|分段|断句/gi) + collectMatches(lower, /\btranscrib|segment|segmentation\b/g),
    gloss: collectMatches(text, /gloss|词性|词法|词汇|语素|标注|pos/gi),
    review: collectMatches(text, /复核|检查|审校|风险|校对|核对/gi) + collectMatches(lower, /\breview|audit|verify|risk\b/g),
    summary: collectMatches(text, /总结|摘要|概述|归纳/gi) + collectMatches(lower, /\bsummar|overview|tl;dr\b/g),
    explain: collectMatches(text, /解释|说明|为什么|原因/gi) + collectMatches(lower, /\bexplain|why|reason\b/g),
    compare: collectMatches(text, /对比|比较|差异|区别/gi) + collectMatches(lower, /\bcompare|difference\b/g),
    steps: collectMatches(text, /步骤|流程|下一步|计划|todo/gi) + collectMatches(lower, /\bnext step|steps|plan|todo\b/g),
    qa: collectMatches(text, /问答|回答|问题/gi) + collectMatches(lower, /\bquestion|answer|ask\b/g),
  };
}

function scoreResponseStyle(text: string): Record<AiAdaptiveResponseStyle, number> {
  const lower = text.toLowerCase();
  return {
    analysis: collectMatches(text, /分析|评估|先不要改|先别改|仅分析/gi) + collectMatches(lower, /\banaly|assess|do not edit\b/g),
    direct_edit: collectMatches(text, /直接改|帮我改|改写|润色|补全|生成/gi) + collectMatches(lower, /\bedit|rewrite|fix|draft|generate\b/g),
    concise: collectMatches(text, /简短|一句话|简洁|精炼/gi) + collectMatches(lower, /\bbrief|concise|short\b/g),
    detailed: collectMatches(text, /详细|展开|尽量全|完整说明/gi) + collectMatches(lower, /\bdetailed|thorough|full\b/g),
    step_by_step: collectMatches(text, /分步骤|逐步|一步一步/gi) + collectMatches(lower, /\bstep by step|step-by-step\b/g),
  };
}

function pickWinner<T extends string>(scores: Record<T, number>): T | undefined {
  const ordered = (Object.entries(scores) as Array<[T, number]>)
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1]);
  return ordered[0]?.[0];
}

function extractKeywordsFromPrompt(text: string): string[] {
  const normalized = normalizePrompt(text);
  const zhTokens = normalized.match(/[\u4e00-\u9fff]{2,}/g) ?? [];
  const enTokens = normalized.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) ?? [];
  const tokens = [...zhTokens, ...enTokens]
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !EN_STOPWORDS.has(token) && !ZH_STOPWORDS.has(token));
  return [...new Set(tokens)];
}

function deriveTopKeywords(prompts: string[]): string[] {
  const counts = new Map<string, number>();
  for (const prompt of prompts) {
    for (const keyword of extractKeywordsFromPrompt(prompt)) {
      counts.set(keyword, (counts.get(keyword) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_KEYWORDS)
    .map(([keyword]) => keyword);
}

function analyzePrompts(prompts: string[]): AiAdaptiveInputProfile {
  const normalizedPrompts = prompts
    .map(normalizePrompt)
    .filter(Boolean)
    .slice(-MAX_RECENT_PROMPTS);

  if (normalizedPrompts.length === 0) return {};

  const intentTotals: Record<AiAdaptiveIntent, number> = {
    translation: 0,
    transcription: 0,
    gloss: 0,
    review: 0,
    summary: 0,
    explain: 0,
    compare: 0,
    steps: 0,
    qa: 0,
  };
  const styleTotals: Record<AiAdaptiveResponseStyle, number> = {
    analysis: 0,
    direct_edit: 0,
    concise: 0,
    detailed: 0,
    step_by_step: 0,
  };

  for (const prompt of normalizedPrompts) {
    const intentScores = scoreIntent(prompt);
    const styleScores = scoreResponseStyle(prompt);
    for (const intent of Object.keys(intentTotals) as AiAdaptiveIntent[]) {
      intentTotals[intent] += intentScores[intent];
    }
    for (const style of Object.keys(styleTotals) as AiAdaptiveResponseStyle[]) {
      styleTotals[style] += styleScores[style];
    }
  }

  const lastPrompt = normalizedPrompts[normalizedPrompts.length - 1] ?? '';
  const dominantIntent = pickWinner(intentTotals);
  const preferredResponseStyle = pickWinner(styleTotals);
  return {
    recentPrompts: normalizedPrompts,
    ...(dominantIntent !== undefined ? { dominantIntent } : {}),
    ...(preferredResponseStyle !== undefined ? { preferredResponseStyle } : {}),
    topKeywords: deriveTopKeywords(normalizedPrompts),
    lastPromptExcerpt: clipPrompt(lastPrompt),
    updatedAt: new Date().toISOString(),
  };
}

export function updateAdaptiveInputProfile(
  previous: AiAdaptiveInputProfile | undefined,
  prompt: string,
): AiAdaptiveInputProfile {
  const normalizedPrompt = normalizePrompt(prompt);
  const promptHistory = [...(previous?.recentPrompts ?? []), normalizedPrompt]
    .filter(Boolean)
    .slice(-MAX_RECENT_PROMPTS);
  return analyzePrompts(promptHistory);
}

export function updateSessionMemoryWithPrompt(memory: AiSessionMemory, prompt: string): AiSessionMemory {
  return {
    ...memory,
    adaptiveInputProfile: updateAdaptiveInputProfile(memory.adaptiveInputProfile, prompt),
  };
}

export function deriveAdaptiveProfileFromMessages(messages: UiChatMessage[]): AiAdaptiveInputProfile {
  const userPrompts = messages
    .filter((message) => message.role === 'user')
    .map((message) => message.content)
    .filter(Boolean)
    .slice(-MAX_RECENT_PROMPTS);
  return analyzePrompts(userPrompts);
}

export function mergeAdaptiveProfiles(
  primary: AiAdaptiveInputProfile | undefined,
  secondary: AiAdaptiveInputProfile | undefined,
): AiAdaptiveInputProfile | undefined {
  const prompts = [
    ...(secondary?.recentPrompts ?? []),
    ...(primary?.recentPrompts ?? []),
  ].filter(Boolean).slice(-MAX_RECENT_PROMPTS);
  if (prompts.length === 0) return primary ?? secondary;
  return analyzePrompts(prompts);
}
