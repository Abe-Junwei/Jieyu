/**
 * HybridIntentResolver — 混合意图解析器
 * Hybrid intent resolver: lightweight LLM-assisted structured intent parsing.
 *
 * 只在规则路由置信度不足或表达歧义时介入；输出结构化结果而非自由文本。
 * Only activated when rule-based routing has low confidence or ambiguous expression;
 * outputs structured result, not free-form text.
 *
 * 设计原则 | Design principles:
 * 1. 极短上下文 — 只送用户当前一句 + 极简状态摘要 | Minimal context
 * 2. 结构化 JSON 输出 — 禁止长篇推理 | Structured JSON output only
 * 3. 会话缓存 — 相同/近似句短期复用 | Session cache with TTL
 * 4. 门控 — 绝大多数明确请求零额外成本 | Gate: most clear requests cost nothing extra
 */

import type { LLMProvider, ChatMessage, ChatRequestOptions } from '../ai/providers/LLMProvider';
import { createLogger } from '../observability/logger';
import { recordMetric, createMetricTags, isKnownMetricId } from '../observability/metrics';

const log = createLogger('HybridIntentResolver');

// ── 类型 | Types ───────────────────────────────────────────────────────────

/**
 * 解析后的结构化意图 | Structured intent output
 */
export type HybridIntentScope = 'current_scope' | 'current_track' | 'project';

export interface HybridIntentResult {
  /** 用户意图类别 | User intent category */
  intent: 'action' | 'query' | 'edit' | 'delete' | 'navigate' | 'chat' | 'unclear';
  /** 动作名称或工具名称 | Action or tool name */
  action?: string;
  /** 作用范围 | Target scope */
  scope?: HybridIntentScope;
  /** 目标描述 | Target description (e.g. "current segment", "all segments", "第3个") */
  target?: string;
  /** 置信度 0-1 | Confidence */
  confidence: number;
  /** 是否需要追问 | Whether clarification is needed */
  needsClarification: boolean;
  /** 追问建议 | Suggested clarification question */
  clarificationQuestion?: string;
  /** 解析路径 | Which methodology was used */
  methodology: 'rule' | 'hybrid' | 'cache';
}

/**
 * 解析输入 | Input to the resolver
 */
export interface HybridResolverInput {
  /** 用户原文 | User text */
  userText: string;
  /** 当前模式 | Current mode */
  mode: 'command' | 'dictation' | 'analysis' | 'chat';
  /** 当前媒体 ID | Current media ID */
  currentMediaId?: string;
  /** 当前层 ID | Current layer ID */
  currentLayerId?: string;
  /** 当前范围语段数 | Unit count in current scope */
  currentScopeUnitCount?: number;
  /** 项目总语段数 | Total units in project */
  projectUnitCount?: number;
}

/**
 * Provider 工厂 | Factory for creating an LLM provider for intent resolution
 */
export type HybridResolverProviderFactory = () => LLMProvider | null;

/**
 * 解析器配置 | Resolver configuration
 */
export interface HybridResolverConfig {
  /** 启用开关 | Enable flag (default: true) */
  enabled?: boolean;
  /** 缓存 TTL（毫秒）| Cache TTL in ms (default: 60_000 = 1min) */
  cacheTtlMs?: number;
  /** 最大缓存条目 | Max cache entries (default: 32) */
  maxCacheEntries?: number;
  /** 模型 temperature | Model temperature (default: 0) */
  temperature?: number;
  /** 最大输出 token | Max output tokens (default: 120) */
  maxTokens?: number;
  /** 超时毫秒 | Timeout in ms (default: 3000) */
  timeoutMs?: number;
}

// ── 门控 | Gate conditions ─────────────────────────────────────────────────

/**
 * 判断是否应触发混合解析 | Check whether hybrid resolution should be triggered.
 *
 * 触发条件（任一即可）:
 * 1. 规则未命中 — intent 落入 chat/unclear
 * 2. 模糊命中且置信度低 — fromFuzzy && confidence < threshold
 * 3. 表达中有范围歧义词 — 含有"这里/这个/当前/全部"等
 */
export function shouldTriggerHybridResolution(
  ruleConfidence: number,
  ruleMatched: boolean,
  fromFuzzy: boolean,
  userText: string,
): boolean {
  // 规则没命中 — 直接触发
  // Rule didn't match — trigger
  if (!ruleMatched) return true;

  // 模糊命中但置信度低 — 触发
  // Fuzzy match with low confidence — trigger
  if (fromFuzzy && ruleConfidence < 0.55) return true;

  // 含范围歧义词但命中的是模糊规则 — 触发
  // Contains scope-ambiguous terms alongside a fuzzy match — trigger
  if (fromFuzzy && SCOPE_AMBIGUITY_RE.test(userText)) return true;

  return false;
}

const SCOPE_AMBIGUITY_RE = /这里|这个|当前|全部|所有|整个|this|current|all|every|whole/i;

// ── 缓存 | Cache ──────────────────────────────────────────────────────────

interface CacheEntry {
  result: HybridIntentResult;
  expiresAt: number;
}

function normalizeForCache(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[。！？，、,.!?\s]+/g, ' ')
    .replace(/\s+/g, ' ');
}

class IntentCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(maxSize = 32, ttlMs = 60_000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  get(text: string): HybridIntentResult | null {
    const key = normalizeForCache(text);
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.entries.delete(key);
      return null;
    }
    return { ...entry.result, methodology: 'cache' };
  }

  set(text: string, result: HybridIntentResult): void {
    const key = normalizeForCache(text);
    // LRU 淘汰 | LRU eviction
    if (this.entries.size >= this.maxSize) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, {
      result,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  clear(): void {
    this.entries.clear();
  }
}

// ── 系统提示 | System prompt ──────────────────────────────────────────────

const SYSTEM_PROMPT = [
  '你是解语意图解析器。将用户语音/文字输入解析为单个 JSON 对象。',
  '仅返回 JSON，不要返回额外文字。',
  '',
  '返回格式：',
  '{',
  '  "intent": "action|query|edit|delete|navigate|chat|unclear",',
  '  "action": "具体动作名(可选)",',
  '  "scope": "current_scope|current_track|project(可选)",',
  '  "target": "目标描述(可选)",',
  '  "confidence": 0.0-1.0,',
  '  "needsClarification": true/false,',
  '  "clarificationQuestion": "追问建议(可选)"',
  '}',
  '',
  '意图分类规则：',
  '- action: 播放、暂停、撤销、重做等 UI 操作',
  '- query: 列出、搜索、查看、统计、有几个等查询',
  '- edit: 修改文本、设置翻译、标注等编辑',
  '- delete: 删除语段、删除层等删除操作',
  '- navigate: 跳到、上一个、下一个等导航',
  '- chat: 闲聊、提问、讨论',
  '- unclear: 无法确定意图',
  '',
  '范围判断：',
  '- "这里/这个/当前语段/当前层/selected" → current_scope',
  '- "当前音频/这条音频/this track/current audio" → current_track',
  '- "全部/所有/整个项目/all/project/全局" → project',
  '- 未提及范围时，编辑/删除/导航默认 current_scope，查询默认 current_scope',
  '',
  '当无法确定时设 needsClarification=true 并给出追问建议。',
].join('\n');

function buildUserPrompt(input: HybridResolverInput): string {
  const parts = [`mode=${input.mode}`, `text=${input.userText}`];
  if (input.currentScopeUnitCount !== undefined) {
    parts.push(`currentScopeUnits=${input.currentScopeUnitCount}`);
  }
  if (input.projectUnitCount !== undefined) {
    parts.push(`projectUnits=${input.projectUnitCount}`);
  }
  if (input.currentMediaId) {
    parts.push(`mediaId=${input.currentMediaId}`);
  }
  return parts.join('\n');
}

// ── 解析 | Parsing ────────────────────────────────────────────────────────

const VALID_INTENTS = new Set(['action', 'query', 'edit', 'delete', 'navigate', 'chat', 'unclear']);
const VALID_SCOPES = new Set(['current_scope', 'current_track', 'project']);

function parseHybridResult(responseText: string): HybridIntentResult | null {
  const firstBrace = responseText.indexOf('{');
  const lastBrace = responseText.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace <= firstBrace) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText.slice(firstBrace, lastBrace + 1));
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const data = parsed as Record<string, unknown>;

  const intent = typeof data.intent === 'string' && VALID_INTENTS.has(data.intent)
    ? (data.intent as HybridIntentResult['intent'])
    : 'unclear';

  const scope = typeof data.scope === 'string' && VALID_SCOPES.has(data.scope)
    ? (data.scope as HybridIntentScope)
    : undefined;

  const confidence = typeof data.confidence === 'number' && Number.isFinite(data.confidence)
    ? Math.min(1, Math.max(0, data.confidence))
    : 0.5;

  const needsClarification = data.needsClarification === true
    || (intent === 'unclear' && confidence < 0.5);

  return {
    intent,
    ...(typeof data.action === 'string' && data.action.trim() ? { action: data.action.trim() } : {}),
    ...(scope ? { scope } : {}),
    ...(typeof data.target === 'string' && data.target.trim() ? { target: data.target.trim() } : {}),
    confidence,
    needsClarification,
    ...(typeof data.clarificationQuestion === 'string' && data.clarificationQuestion.trim()
      ? { clarificationQuestion: data.clarificationQuestion.trim() }
      : {}),
    methodology: 'hybrid' as const,
  };
}

// ── 主类 | Main class ─────────────────────────────────────────────────────

export class HybridIntentResolver {
  private readonly cache: IntentCache;
  private readonly config: Required<HybridResolverConfig>;
  private readonly providerFactory: HybridResolverProviderFactory;

  constructor(
    providerFactory: HybridResolverProviderFactory,
    config?: HybridResolverConfig,
  ) {
    this.providerFactory = providerFactory;
    this.config = {
      enabled: config?.enabled ?? true,
      cacheTtlMs: config?.cacheTtlMs ?? 60_000,
      maxCacheEntries: config?.maxCacheEntries ?? 32,
      temperature: config?.temperature ?? 0,
      maxTokens: config?.maxTokens ?? 120,
      timeoutMs: config?.timeoutMs ?? 3000,
    };
    this.cache = new IntentCache(this.config.maxCacheEntries, this.config.cacheTtlMs);
  }

  /**
   * 解析用户意图 | Resolve user intent via lightweight LLM pass.
   *
   * 返回结构化结果；若禁用、超时或解析失败则返回 null。
   * Returns structured result, or null if disabled/timeout/parse failure.
   */
  async resolve(input: HybridResolverInput): Promise<HybridIntentResult | null> {
    if (!this.config.enabled) return null;

    const text = input.userText.trim();
    if (!text) return null;

    // 缓存命中 | Cache hit
    const cached = this.cache.get(text);
    if (cached) {
      log.debug('cache hit', { text: text.slice(0, 40) });
      return cached;
    }

    // 创建 provider | Create provider
    const provider = this.providerFactory();
    if (!provider) {
      log.warn('no provider available for hybrid resolution');
      return null;
    }

    const startMs = Date.now();
    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), this.config.timeoutMs);

    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(input) },
      ];

      const options: ChatRequestOptions = {
        temperature: this.config.temperature,
        maxTokens: this.config.maxTokens,
        signal: abortController.signal,
      };

      // 用 Promise.race 确保超时能中断流式迭代
      // Race against abort to ensure timeout interrupts streaming iteration
      const abortPromise = new Promise<never>((_, reject) => {
        const handler = () => reject(new DOMException('Aborted', 'AbortError'));
        if (abortController.signal.aborted) { handler(); return; }
        abortController.signal.addEventListener('abort', handler, { once: true });
      });

      let response = '';
      const streamTask = (async () => {
        for await (const chunk of provider.chat(messages, options)) {
          if (chunk.error) {
            log.warn('provider streaming error', { error: chunk.error });
            return null;
          }
          response += chunk.delta;
          if (chunk.done) break;
        }
        return response;
      })();

      const streamResult = await Promise.race([streamTask, abortPromise]);
      if (streamResult === null) return null;

      const result = parseHybridResult(streamResult);
      if (!result) {
        log.warn('failed to parse hybrid result', { response: streamResult.slice(0, 200) });
        return null;
      }

      // 缓存结果 | Cache result
      this.cache.set(text, result);

      // 记录指标 | Record metrics
      const elapsedMs = Date.now() - startMs;
      this.recordMetricSafe('ai.hybrid_intent_resolved', 1, {
        methodology: 'hybrid',
        intent: result.intent,
        elapsedMs,
        needsClarification: result.needsClarification,
      });

      log.debug('resolved', {
        text: text.slice(0, 40),
        intent: result.intent,
        scope: result.scope,
        confidence: result.confidence,
        elapsedMs,
      });

      return result;
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        log.warn('hybrid resolution timed out', { timeoutMs: this.config.timeoutMs });
        this.recordMetricSafe('ai.hybrid_intent_timeout', 1, {});
      } else {
        log.warn('hybrid resolution failed', { error: (err as Error).message });
      }
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * 清除缓存 | Clear the intent cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  private recordMetricSafe(id: string, value: number, tags: Record<string, unknown>): void {
    if (!isKnownMetricId(id)) return;
    recordMetric({
      id,
      value,
      tags: createMetricTags('HybridIntentResolver', tags as Record<string, string | number | boolean>),
    });
  }
}

// ── 导出工具函数 | Exported utility ───────────────────────────────────────

/** 将 hybrid 结果转为 chat 层 scope | Convert hybrid scope to chat layer scope */
export function hybridScopeToLocalUnitScope(
  scope: HybridIntentScope | undefined,
): 'project' | 'current_track' | 'current_scope' | undefined {
  if (!scope) return undefined;
  // 直接映射 — 两侧值名一致 | Direct mapping — names match
  return scope;
}
