import { createAiChatProvider, type AiChatSettings } from '../ai/providers/providerCatalog';
import type { ChatMessage } from '../ai/providers/LLMProvider';
import type { Locale } from '../i18n';
import type { AiChatHybridFallbackInput } from '../i18n/aiChatHybridMessages';
import type { AiAdaptiveIntent, AiAdaptiveResponseStyle, AiConnectionTestStatus, AiRecommendationSource, AiRecommendationTelemetry } from '../ai/chat/chatDomain.types';
import { AI_HYBRID_RECOMMENDATION_CONFIG, createAiHybridRecommendationConfig, type AiHybridRecommendationConfigPatch, type AiHybridRecommendationServiceConfig } from './AiHybridRecommendationConfig';

export interface AiHybridRecommendation {
  id: string;
  label: string;
  prompt: string;
  source: AiRecommendationSource;
}

type AiHybridRecommendationFallbackContext = Omit<AiChatHybridFallbackInput, 'fallback'>;

export interface AiHybridRecommendationInput extends AiHybridRecommendationFallbackContext {
  locale: Locale;
  enabled: boolean;
  composerIdle: boolean;
  aiChatSettings?: AiChatSettings | undefined;
  connectionTestStatus?: AiConnectionTestStatus;
  recommendationTelemetry?: AiRecommendationTelemetry | undefined;
  adaptiveIntent?: AiAdaptiveIntent;
  adaptiveResponseStyle?: AiAdaptiveResponseStyle;
}

interface AiHybridRecommendationCacheEntry {
  items: AiHybridRecommendation[];
  createdAt: number;
}

interface AiHybridRecommendationPreparedState {
  displaySignature: string;
  refinementSignature: string;
  remoteEligibilitySignature: string;
  fallbackItems: AiHybridRecommendation[];
  cachedItems: AiHybridRecommendation[] | null;
  shouldUseRemote: boolean;
  llmCooldownActive: boolean;
  requestDebounceMs: number;
}

interface AiHybridRecommendationDependencies {
  createProvider: typeof createAiChatProvider;
  now: () => number;
}

function compactText(text: string | null | undefined, max = 80): string {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.length <= max ? normalized : `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function normalizePromptText(text: string | null | undefined): string {
  return String(text ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function sanitizeRecommendationPrompt(prompt: string, locale: Locale): string {
  let normalized = prompt.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';

  if (locale === 'zh-CN') {
    normalized = normalized
      .replace(/^(?:问|问题)\s*[:：]\s*/u, '')
      .replace(/([\p{Script=Han}])\s+(?=[\p{Script=Han}])/gu, '$1')
      .replace(/\s+([，。！？；：、])/gu, '$1')
      .replace(/([（《〈【「『])\s+/gu, '$1')
      .replace(/\s+([）》〉】」』])/gu, '$1');
  }

  return normalized;
}

function extractJsonCandidate(text: string): string | null {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i) ?? text.match(/```\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) return text.slice(firstBrace, lastBrace + 1).trim();

  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');
  if (firstBracket >= 0 && lastBracket > firstBracket) return text.slice(firstBracket, lastBracket + 1).trim();

  return null;
}

export class AiHybridRecommendationService {
  private readonly config: AiHybridRecommendationServiceConfig;

  private readonly dependencies: AiHybridRecommendationDependencies;

  private readonly cache = new Map<string, AiHybridRecommendationCacheEntry>();

  private readonly remoteRequestTimestamps: number[] = [];

  constructor(
    config?: AiHybridRecommendationConfigPatch,
    dependencies?: Partial<AiHybridRecommendationDependencies>,
  ) {
    this.config = createAiHybridRecommendationConfig(config);
    this.dependencies = {
      createProvider: dependencies?.createProvider ?? createAiChatProvider,
      now: dependencies?.now ?? (() => Date.now()),
    };
  }

  clear(): void {
    this.cache.clear();
    this.remoteRequestTimestamps.length = 0;
  }

  prepareRecommendationState(
    input: AiHybridRecommendationInput,
    fallbackPrompts: string[],
  ): AiHybridRecommendationPreparedState {
    const llmCooldownActive = this.isRemoteCooldownActive(input.recommendationTelemetry);
    const fallbackItems = this.buildRecommendationItems(
      fallbackPrompts,
      'fallback',
      input.locale,
      input.recommendationTelemetry,
    ).slice(0, 1);
    const refinementSignature = this.buildRefinementSignature(input);
    const cachedItems = llmCooldownActive ? null : this.getCachedRecommendations(refinementSignature);

    return {
      displaySignature: JSON.stringify({
        locale: input.locale,
        page: input.page ?? null,
        stage: input.observerStage ?? null,
        task: input.aiCurrentTask ?? null,
        row: input.rowNumber ?? null,
        layer: input.selectedLayerType ?? null,
        text: compactText(input.selectedText, 64),
        primarySuggestion: input.primarySuggestion,
        fallbackItems: fallbackItems.map((item) => item.prompt),
      }),
      refinementSignature,
      remoteEligibilitySignature: JSON.stringify({
        enabled: input.enabled,
        composerIdle: input.composerIdle,
        providerKind: input.aiChatSettings?.providerKind ?? 'mock',
        model: input.aiChatSettings?.model ?? '',
        connectionTestStatus: input.connectionTestStatus ?? 'idle',
        llmCooldown: llmCooldownActive,
      }),
      fallbackItems,
      cachedItems,
      shouldUseRemote: this.shouldUseRemoteRefinement(input),
      llmCooldownActive,
      requestDebounceMs: this.config.requestDebounceMs,
    };
  }

  buildRefinementSignature(input: AiHybridRecommendationInput): string {
    const tracked = this.config.significance.trackedReasons;
    const snapshot: Record<string, unknown> = {};

    if (tracked.locale) snapshot.locale = input.locale;
    if (tracked.page) snapshot.page = input.page ?? null;
    if (tracked.observerStage) snapshot.stage = input.observerStage ?? null;
    if (tracked.task) snapshot.task = input.aiCurrentTask ?? null;
    if (tracked.rowBucket) {
      snapshot.rowBucket = input.rowNumber != null
        ? Math.floor(input.rowNumber / Math.max(1, this.config.significance.rowBucketSize))
        : null;
    }
    if (tracked.selectedUnitKind) snapshot.unit = input.selectedUnitKind ?? null;
    if (tracked.selectedLayerType) snapshot.layer = input.selectedLayerType ?? null;
    if (tracked.selectedTimeRangeLabel) snapshot.range = input.selectedTimeRangeLabel ?? null;
    if (tracked.selectedText) {
      snapshot.text = compactText(input.selectedText, this.config.significance.selectedTextMaxLength);
    }
    if (tracked.lastToolName) snapshot.lastToolName = input.lastToolName ?? null;
    if (tracked.preferredMode) snapshot.preferredMode = input.preferredMode ?? null;
    if (tracked.confirmationThreshold) snapshot.confirmationThreshold = input.confirmationThreshold ?? null;
    if (tracked.adaptiveIntent) snapshot.adaptiveIntent = input.adaptiveIntent ?? null;
    if (tracked.adaptiveResponseStyle) snapshot.adaptiveResponseStyle = input.adaptiveResponseStyle ?? null;
    if (tracked.adaptiveKeywords) {
      snapshot.adaptiveKeywords = input.adaptiveKeywords?.slice(0, this.config.significance.adaptiveKeywordLimit) ?? [];
    }
    if (tracked.providerKind) snapshot.providerKind = input.aiChatSettings?.providerKind ?? 'mock';
    if (tracked.model) snapshot.model = input.aiChatSettings?.model ?? '';
    if (tracked.lastAcceptedPrompt) {
      snapshot.lastAcceptedPrompt = compactText(
        input.recommendationTelemetry?.lastAcceptedPrompt,
        this.config.significance.acceptedPromptMaxLength,
      );
    }

    return JSON.stringify(snapshot);
  }

  buildRecommendationItems(
    prompts: string[],
    source: AiRecommendationSource,
    locale: Locale,
    telemetry?: AiRecommendationTelemetry,
  ): AiHybridRecommendation[] {
    const uniquePrompts = [
      ...new Set(prompts.map((item) => sanitizeRecommendationPrompt(item, locale)).filter(Boolean)),
    ];
    const scored = uniquePrompts.map((prompt, index) => {
      const promptStats = this.collectPromptStats(prompt, source, telemetry);
      const repeatedIgnores = Math.max(0, promptStats.shownCount - promptStats.acceptedCount);
      const suppressionPenalty = Math.max(0, repeatedIgnores - 1) * this.config.suppression.repeatedIgnorePenalty;
      const shouldApplyRepeatPenalty = promptStats.wasLastShownWithoutAcceptance && promptStats.shownCount >= 2;
      const score = 100 - (index * 5)
        + (promptStats.acceptedExactCount * this.config.suppression.exactAcceptanceBoost)
        + (promptStats.acceptedEditedCount * this.config.suppression.editedAcceptanceBoost)
        - suppressionPenalty
        - (shouldApplyRepeatPenalty ? this.config.suppression.repeatPenalty : 0);

      return {
        prompt,
        source,
        score,
        suppressed: repeatedIgnores >= this.config.suppression.suppressAfterRepeatedIgnores,
      };
    });

    const ranked = (scored.some((item) => !item.suppressed)
      ? scored.filter((item) => !item.suppressed)
      : scored)
      .sort((left, right) => right.score - left.score)
      .map((item, index) => ({
        id: `${source}-${index}-${item.prompt}`,
        label: item.prompt,
        prompt: item.prompt,
        source,
      }));

    return ranked.slice(0, 3);
  }

  getCachedRecommendations(signature: string): AiHybridRecommendation[] | null {
    const cached = this.cache.get(signature);
    if (!cached) return null;
    if ((this.dependencies.now() - cached.createdAt) >= this.config.cacheTtlMs) {
      this.cache.delete(signature);
      return null;
    }
    return cached.items;
  }

  setCachedRecommendations(signature: string, items: AiHybridRecommendation[]): void {
    this.cache.set(signature, {
      items,
      createdAt: this.dependencies.now(),
    });
  }

  shouldUseRemoteRefinement(input: AiHybridRecommendationInput): boolean {
    if (!input.enabled || !input.composerIdle || !input.aiChatSettings) return false;
    if (input.aiChatSettings.providerKind === 'mock') return false;
    if (input.connectionTestStatus === 'error' || input.connectionTestStatus === 'testing') return false;
    if (input.aiChatSettings.providerKind !== 'ollama'
      && input.aiChatSettings.providerKind !== 'webllm'
      && input.connectionTestStatus !== 'success') return false;
    if (this.isRemoteCooldownActive(input.recommendationTelemetry)) return false;
    return true;
  }

  consumeRemoteBudget(): boolean {
    const now = this.dependencies.now();
    while (
      this.remoteRequestTimestamps.length > 0
      && now - this.remoteRequestTimestamps[0]! > this.config.remoteBudgetWindowMs
    ) {
      this.remoteRequestTimestamps.shift();
    }
    if (this.remoteRequestTimestamps.length >= this.config.maxRemoteRequestsPerWindow) {
      return false;
    }
    this.remoteRequestTimestamps.push(now);
    return true;
  }

  async requestRemoteRecommendations(
    input: AiHybridRecommendationInput,
    fallbackItems: AiHybridRecommendation[],
    signal: AbortSignal,
  ): Promise<AiHybridRecommendation[] | null> {
    if (!input.aiChatSettings) return null;

    const provider = this.dependencies.createProvider(input.aiChatSettings);
    const messages: ChatMessage[] = [
      { role: 'system', content: this.buildSystemPrompt(input.locale) },
      { role: 'user', content: this.buildUserPrompt(input, fallbackItems.map((item) => item.prompt)) },
    ];

    let rawResponse = '';
    for await (const chunk of provider.chat(messages, {
      model: input.aiChatSettings.model,
      temperature: 0.25,
      maxTokens: 220,
      signal,
    })) {
      if (chunk.error) {
        if (chunk.error === 'aborted') return null;
        throw new Error(chunk.error);
      }
      rawResponse += chunk.delta;
    }

    const prompts = this.parseLlmRecommendationText(rawResponse);
    if (prompts.length === 0) return null;
    const items = this.buildRecommendationItems(prompts, 'llm', input.locale, input.recommendationTelemetry).slice(0, 1);
    return items.length > 0 ? items : null;
  }

  parseLlmRecommendationText(responseText: string): string[] {
    const candidate = extractJsonCandidate(responseText);
    if (!candidate) return [];

    try {
      const parsed: unknown = JSON.parse(candidate);
      const suggestions = Array.isArray(parsed)
        ? parsed
        : (parsed && typeof parsed === 'object' && Array.isArray((parsed as { suggestions?: unknown[] }).suggestions)
          ? (parsed as { suggestions: unknown[] }).suggestions
          : []);

      return suggestions.flatMap((item) => {
        if (typeof item === 'string') return [item.trim()];
        if (!item || typeof item !== 'object') return [];
        const record = item as { label?: unknown; prompt?: unknown };
        const prompt = typeof record.prompt === 'string'
          ? record.prompt.trim()
          : typeof record.label === 'string'
            ? record.label.trim()
            : '';
        return prompt ? [prompt] : [];
      }).filter(Boolean);
    } catch (e) {
      console.warn('Failed to collect recommendation prompts', e);
      return [];
    }
  }

  private collectPromptStats(
    prompt: string,
    source: AiRecommendationSource,
    telemetry?: AiRecommendationTelemetry,
  ): {
    shownCount: number;
    acceptedCount: number;
    acceptedExactCount: number;
    acceptedEditedCount: number;
    wasLastShownWithoutAcceptance: boolean;
  } {
    const normalizedPrompt = normalizePromptText(prompt);
    const recentEvents = this.getRecentEvents(telemetry, this.config.suppression.telemetryWindowMs);
    let shownCount = 0;
    let acceptedExactCount = 0;
    let acceptedEditedCount = 0;

    for (const event of recentEvents) {
      if (event.source !== source) continue;
      if (normalizePromptText(event.prompt) !== normalizedPrompt) continue;
      if (event.type === 'shown') {
        shownCount += 1;
      } else if (event.type === 'accepted_exact') {
        acceptedExactCount += 1;
      } else if (event.type === 'accepted_edited') {
        acceptedEditedCount += 1;
      }
    }

    const acceptedCount = acceptedExactCount + acceptedEditedCount;
    const wasLastShownPrompt = normalizePromptText(telemetry?.lastShownPrompt) === normalizedPrompt;
    const wasLastAcceptedPrompt = normalizePromptText(telemetry?.lastAcceptedPrompt) === normalizedPrompt;

    return {
      shownCount,
      acceptedCount,
      acceptedExactCount,
      acceptedEditedCount,
      wasLastShownWithoutAcceptance: wasLastShownPrompt && !wasLastAcceptedPrompt,
    };
  }

  private getRecentEvents(telemetry: AiRecommendationTelemetry | undefined, windowMs: number) {
    const now = this.dependencies.now();
    return (telemetry?.recentEvents ?? []).filter((event) => {
      const timestamp = Date.parse(event.timestamp);
      if (!Number.isFinite(timestamp)) return true;
      return (now - timestamp) <= windowMs;
    });
  }

  private isRemoteCooldownActive(telemetry?: AiRecommendationTelemetry): boolean {
    const recentEvents = this.getRecentEvents(telemetry, this.config.suppression.llmCooldownWindowMs);
    let consecutiveIgnoredLlmShows = 0;

    for (let index = recentEvents.length - 1; index >= 0; index -= 1) {
      const event = recentEvents[index];
      if (!event) continue;
      if (event.type === 'accepted_exact' || event.type === 'accepted_edited') break;
      if (event.type === 'shown' && event.source === 'llm') {
        consecutiveIgnoredLlmShows += 1;
      }
    }

    return consecutiveIgnoredLlmShows >= this.config.suppression.llmCooldownAfterConsecutiveIgnores;
  }

  private buildSystemPrompt(locale: Locale): string {
    if (locale === 'zh-CN') {
      return [
        '你是解语的 AI 聊天推荐器。',
        '目标：基于当前页面、选区、任务阶段、完成进度、用户历史输入偏好，生成 1 条可直接发送给 AI 的下一句推荐。',
        '只返回 JSON，不要解释，不要 Markdown。',
        '返回格式：{"suggestions":[{"label":"...","prompt":"..."}]}。',
        'label 和 prompt 都必须是简体中文。',
        '建议要具体、可执行，避免空泛表述。',
        '优先贴合当前上下文，不要脱离当前页面和选区。',
        'label 与 prompt 中不得出现内部工具名、API 名或 snake_case；用用户会点的自然说法。',
        '避免公文腔与空洞开场；像真人会发的一行问句，短而具体。',
      ].join('\n');
    }

    return [
      'You are Jieyu\'s AI chat recommendation engine.',
      'Generate exactly one next prompt the user can send right now.',
      'Use the current page, selection, task stage, completion progress, and prior prompt habits.',
      'Return JSON only. No markdown. No explanation.',
      'Format: {"suggestions":[{"label":"...","prompt":"..."}]}.',
      'All labels and prompts must be in English.',
      'Keep the suggestion concrete and actionable.',
      'Do not put internal tool names, API identifiers, or snake_case in label or prompt — write what a human would tap to send.',
      'Avoid corporate filler and empty openers; one short, concrete line a real user would send.',
    ].join('\n');
  }

  private buildUserPrompt(
    input: AiHybridRecommendationInput,
    fallbackPrompts: string[],
  ): string {
    const lines = [
      `page=${input.page ?? 'other'}`,
      `observerStage=${input.observerStage ?? 'unknown'}`,
      `currentTask=${input.aiCurrentTask ?? 'unknown'}`,
      `selectedUnitKind=${input.selectedUnitKind ?? 'none'}`,
      `selectedLayerType=${input.selectedLayerType ?? 'none'}`,
      `rowNumber=${input.rowNumber ?? 'none'}`,
      `selectedTimeRange=${input.selectedTimeRangeLabel ?? 'none'}`,
      `selectedText=${compactText(input.selectedText, 120) || 'none'}`,
      `annotationStatus=${input.annotationStatus ?? 'none'}`,
      `confidence=${input.confidence ?? 'none'}`,
      `lexemeCount=${input.lexemeCount ?? 0}`,
      `lastToolName=${input.lastToolName ?? 'none'}`,
      `preferredMode=${input.preferredMode ?? 'none'}`,
      `confirmationThreshold=${input.confirmationThreshold ?? 'none'}`,
      `dominantIntent=${this.buildIntentLabel(input.adaptiveIntent, input.locale)}`,
      `preferredResponseStyle=${this.buildStyleLabel(input.adaptiveResponseStyle, input.locale)}`,
      `topKeywords=${(input.adaptiveKeywords ?? []).slice(0, 4).join(', ') || 'none'}`,
      `lastPromptExcerpt=${compactText(input.adaptiveLastPromptExcerpt, 60) || 'none'}`,
      `lastAcceptedRecommendation=${compactText(input.recommendationTelemetry?.lastAcceptedPrompt, 60) || 'none'}`,
      `fallbackSuggestions=${fallbackPrompts.join(' || ')}`,
    ];

    if (input.locale === 'zh-CN') {
      return [
        '请在保留 fallbackSuggestions 核心意图的前提下，把建议改得更贴合上下文、更可直接发送。',
        '不要重复 fallbackSuggestions 原文。',
        '优先推荐“下一句我该怎么问”。',
        ...lines,
      ].join('\n');
    }

    return [
      'Refine the fallbackSuggestions into sharper, more context-specific next prompts.',
      'Do not repeat the fallbackSuggestions verbatim.',
      'Prioritize what the user should ask next.',
      ...lines,
    ].join('\n');
  }

  private buildIntentLabel(intent: AiAdaptiveIntent | undefined, locale: Locale): string {
    if (!intent) return locale === 'zh-CN' ? '未指定' : 'unspecified';

    const zhMap: Record<AiAdaptiveIntent, string> = {
      translation: '翻译',
      transcription: '转写',
      gloss: 'gloss/POS',
      review: '复核',
      summary: '总结',
      explain: '解释',
      compare: '对比',
      steps: '步骤规划',
      qa: '问答',
    };
    const enMap: Record<AiAdaptiveIntent, string> = {
      translation: 'translation',
      transcription: 'transcription',
      gloss: 'gloss/POS',
      review: 'review',
      summary: 'summary',
      explain: 'explanation',
      compare: 'comparison',
      steps: 'step planning',
      qa: 'Q&A',
    };

    return locale === 'zh-CN' ? zhMap[intent] : enMap[intent];
  }

  private buildStyleLabel(style: AiAdaptiveResponseStyle | undefined, locale: Locale): string {
    if (!style) return locale === 'zh-CN' ? '未指定' : 'unspecified';

    const zhMap: Record<AiAdaptiveResponseStyle, string> = {
      analysis: '先分析',
      direct_edit: '直接改',
      concise: '简洁',
      detailed: '详细',
      step_by_step: '分步骤',
    };
    const enMap: Record<AiAdaptiveResponseStyle, string> = {
      analysis: 'analysis first',
      direct_edit: 'direct edit',
      concise: 'concise',
      detailed: 'detailed',
      step_by_step: 'step by step',
    };

    return locale === 'zh-CN' ? zhMap[style] : enMap[style];
  }
}

export const aiHybridRecommendationService = new AiHybridRecommendationService(AI_HYBRID_RECOMMENDATION_CONFIG);
