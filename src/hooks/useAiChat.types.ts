/**
 * useAiChat - Types Module
 * 提取自 useAiChat.ts 的所有类型定义
 */

import type { AiMessageCitation } from '../db';
import type { EmbeddingSearchService } from '../ai/embeddings/EmbeddingSearchService';
import type { AiToolFeedbackStyle } from '../ai/providers/providerCatalog';
import type { VoiceActionToolName } from '../ai/voice/VoiceActionTools';

// ── Core Types ─────────────────────────────────────────────────────────────────

export interface UiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status?: 'streaming' | 'done' | 'error' | 'aborted';
  error?: string;
  citations?: AiMessageCitation[];
  generationSource?: 'llm' | 'local';
  generationModel?: string;
  /** 推理内容（reasoning_content），如 DeepSeek 的思考过程 */
  reasoningContent?: string;
  /** 思考中状态：provider正在处理但尚未发出任何内容delta。
   * 用于非reasoning_content型provider（Anthropic/Gemini/Ollama）的UX反馈。
   * 有reasoningContent时不显示thinking状态。 */
  thinking?: boolean;
}

export type AiConnectionTestStatus = 'idle' | 'testing' | 'success' | 'error';
export type AiToolDecisionMode = 'enabled' | 'gray' | 'rollback';

export interface AiClarifyCandidate {
  key: string;
  label: string;
  argsPatch: Record<string, unknown>;
}

export interface AiTaskSession {
  id: string;
  status: 'idle' | 'waiting_clarify' | 'waiting_confirm' | 'executing' | 'explaining';
  toolName?: AiChatToolName;
  clarifyReason?: ToolPlannerClarifyReason;
  candidates?: AiClarifyCandidate[];
  updatedAt: string;
}

/**
 * 交互指标统计 | Interaction metrics counters
 * 供 UI 仪表盘和 CI 护栏消费。
 */
export interface AiInteractionMetrics {
  /** 用户发送总轮次 | Total user turns */
  turnCount: number;
  /** 执行成功次数 | Successful tool executions */
  successCount: number;
  /** 执行失败次数 | Failed tool executions */
  failureCount: number;
  /** 目标澄清次数 | Target clarification rounds */
  clarifyCount: number;
  /** 意图不明确而回退为解释的次数 | Intent ambiguous fallbacks */
  explainFallbackCount: number;
  /** 用户取消确认次数 | User-cancelled confirmations */
  cancelCount: number;
  /** 失败后恢复（重试成功）次数 | Recovery-after-failure count */
  recoveryCount: number;
}

export type AiAdaptiveIntent =
  | 'translation'
  | 'transcription'
  | 'gloss'
  | 'review'
  | 'summary'
  | 'explain'
  | 'compare'
  | 'steps'
  | 'qa';

export type AiAdaptiveResponseStyle =
  | 'analysis'
  | 'direct_edit'
  | 'concise'
  | 'detailed'
  | 'step_by_step';

export interface AiAdaptiveInputProfile {
  recentPrompts?: string[];
  dominantIntent?: AiAdaptiveIntent;
  preferredResponseStyle?: AiAdaptiveResponseStyle;
  topKeywords?: string[];
  lastPromptExcerpt?: string;
  updatedAt?: string;
}

export type AiRecommendationSource = 'fallback' | 'llm';
export type AiRecommendationEventType = 'shown' | 'accepted_exact' | 'accepted_edited';

export interface AiRecommendationEvent {
  type: AiRecommendationEventType;
  source: AiRecommendationSource;
  prompt: string;
  signature: string;
  timestamp: string;
}

export interface AiRecommendationTelemetry {
  shownCount?: number;
  fallbackShownCount?: number;
  llmShownCount?: number;
  acceptedExactCount?: number;
  acceptedEditedCount?: number;
  lastShownAt?: string;
  lastAcceptedAt?: string;
  lastShownPrompt?: string;
  lastAcceptedPrompt?: string;
  recentEvents?: AiRecommendationEvent[];
}

/**
 * 会话级短期偏好记忆 | Session-scoped short-term preference memory
 * 在一次对话中累积用户偏好，用于候选排序 & 默认值预填。
 */
export interface AiSessionMemory {
  /** 最近一次成功使用的语言代码 | Last language code used successfully */
  lastLanguage?: string;
  /** 最近一次执行的工具名 | Last tool name executed */
  lastToolName?: AiChatToolName;
  /** 最近一次选中的层 ID | Last layer ID selected */
  lastLayerId?: string;
  /** 历史输入画像 | Adaptive profile inferred from prior prompts */
  adaptiveInputProfile?: AiAdaptiveInputProfile;
  /** 推荐曝光/采纳遥测 | Recommendation exposure/adoption telemetry */
  recommendationTelemetry?: AiRecommendationTelemetry;
}

// ── Tool Types ──────────────────────────────────────────────────────────────────

export type ToolPlannerClarifyReason =
  | 'missing-utterance-target'
  | 'missing-split-position'
  | 'missing-translation-layer-target'
  | 'missing-layer-link-target'
  | 'missing-layer-target'
  | 'missing-language-target';

type ToolPlannerDecision = 'resolved' | 'clarify';

interface ToolIntentAssessment {
  decision: 'execute' | 'clarify' | 'ignore' | 'cancel';
  score: number;
  hasExecutionCue: boolean;
  hasActionVerb: boolean;
  hasActionTarget: boolean;
  hasExplicitId: boolean;
  hasMetaQuestion: boolean;
  hasTechnicalDiscussion: boolean;
}

export interface ToolAuditContext {
  userText: string;
  providerId: string;
  model: string;
  toolDecisionMode: AiToolDecisionMode;
  toolFeedbackStyle: AiToolFeedbackStyle;
  plannerDecision?: ToolPlannerDecision;
  plannerReason?: ToolPlannerClarifyReason;
  intentAssessment?: ToolIntentAssessment;
}

export type AiChatToolName =
  | 'create_transcription_segment'
  | 'split_transcription_segment'
  | 'merge_transcription_segments'
  | 'delete_transcription_segment'
  | 'clear_translation_segment'
  | 'set_transcription_text'
  | 'set_translation_text'
  | 'create_transcription_layer'
  | 'create_translation_layer'
  | 'delete_layer'
  | 'link_translation_layer'
  | 'unlink_translation_layer'
  | 'auto_gloss_utterance'
  | 'set_token_pos'
  | 'set_token_gloss'
  | VoiceActionToolName;

/**
 * 工具调用结构，支持幂等性指纹 | Tool call structure with idempotency fingerprint
 */
export interface AiChatToolCall {
  name: AiChatToolName;
  arguments: Record<string, unknown>;
  /** 幂等性指纹，自动生成 | Idempotency fingerprint, auto-generated */
  requestId?: string;
}

export interface AiChatToolResult {
  ok: boolean;
  message: string;
}

/**
 * 待确认高风险工具调用，带幂等指纹 | Pending high-risk tool call with idempotency fingerprint
 */
export interface PendingAiToolCall {
  call: AiChatToolCall;
  executionCall?: AiChatToolCall;
  assistantMessageId: string;
  riskSummary?: string;
  impactPreview?: string[];
  /** 结构化预演合同 | Structured preview of affected entities */
  previewContract?: PreviewContract;
  /** 幂等性指纹，便于回放/去重 | Idempotency fingerprint for replay/dedup */
  requestId?: string;
  auditContext?: ToolAuditContext;
}

/**
 * 执行预演合同 | Execution preview contract
 * 为高风险操作提供受影响实体的结构化描述，供 UI 展示预览。
 */
export interface PreviewContract {
  /** 受影响实体数量 | Number of entities that will be affected */
  affectedCount: number;
  /** 受影响实体 ID 列表（截取前 5 条）| Affected entity IDs (first 5) */
  affectedIds: string[];
  /** 操作是否可撤销 | Whether the operation is reversible */
  reversible: boolean;
  /** 级联影响的其他实体类型 | Other entity types affected by cascading */
  cascadeTypes?: string[];
}

export interface AiToolRiskCheckResult {
  requiresConfirmation: boolean;
  riskSummary?: string;
  impactPreview?: string[];
}

// ── Context Types ──────────────────────────────────────────────────────────────

export type AiSystemPersonaKey = 'transcription' | 'glossing' | 'review';

export interface AiShortTermContext {
  page?: string;
  activeUtteranceUnitId?: string;
  activeSegmentUnitId?: string;
  selectedUnitKind?: 'utterance' | 'segment';
  selectedUnitIds?: string[];
  selectedUtteranceStartSec?: number;
  selectedUtteranceEndSec?: number;
  selectedLayerId?: string;
  selectedLayerType?: 'transcription' | 'translation';
  selectedTranslationLayerId?: string;
  selectedTranscriptionLayerId?: string;
  selectedText?: string;
  selectionTimeRange?: string;
  audioTimeSec?: number;
  recentEdits?: string[];
}

export interface AiLongTermContext {
  projectStats?: {
    utteranceCount?: number;
    translationLayerCount?: number;
    aiConfidenceAvg?: number | null;
  };
  waveformAnalysis?: {
    lowConfidenceCount?: number;
    overlapCount?: number;
    gapCount?: number;
    maxGapSeconds?: number;
    /** 风险热区（按严重度降序）| Risk hot-zones sorted by severity */
    hotZones?: {
      startTime: number;
      endTime: number;
      signalCount: number;
      breakdown: { lowConfidence: number; overlap: number; gap: number };
      severity: number;
    }[];
    /** 时间分布四分位 | Temporal quartile distribution */
    temporalDistribution?: {
      durationSec: number;
      quartileRatios: [number, number, number, number];
    };
    selectionLowConfidenceCount?: number;
    selectionOverlapCount?: number;
    selectionGapCount?: number;
    activeSignals?: string[];
  };
  observerStage?: string;
  topLexemes?: string[];
  recommendations?: string[];
}

export interface AiPromptContext {
  shortTerm?: AiShortTermContext;
  longTerm?: AiLongTermContext;
}

export interface AiContextDebugSnapshot {
  enabled: boolean;
  persona: AiSystemPersonaKey;
  historyChars: number;
  historyCount: number;
  contextChars: number;
  historyCharBudget: number;
  maxContextChars: number;
  contextPreview: string;
}

// ── Options Type ───────────────────────────────────────────────────────────────

export interface UseAiChatOptions {
  onToolCall?: (call: AiChatToolCall) => Promise<AiChatToolResult> | AiChatToolResult;
  onToolRiskCheck?: (call: AiChatToolCall) => Promise<AiToolRiskCheckResult | null | undefined> | AiToolRiskCheckResult | null | undefined;
  preparePendingToolCall?: (call: AiChatToolCall) => Promise<AiChatToolCall | null | undefined> | AiChatToolCall | null | undefined;
  /** Called when an assistant message completes streaming (after all content is received). */
  onMessageComplete?: (assistantMessageId: string, content: string) => void;
  systemPersonaKey?: AiSystemPersonaKey;
  getContext?: () => AiPromptContext | null;
  maxContextChars?: number;
  historyCharBudget?: number;
  allowDestructiveToolCalls?: boolean;
  streamPersistIntervalMs?: number;
  firstChunkTimeoutMs?: number;
  autoProbeIntervalMs?: number;
  autoConnectionProbeEnabled?: boolean;
  embeddingSearchService?: EmbeddingSearchService;
}
