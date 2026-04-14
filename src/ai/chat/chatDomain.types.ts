/**
 * AI 聊天领域类型（事实源）
 * hooks/useAiChat.types.ts 仅再导出本文件，避免 ai/chat 反向依赖 hooks。
 */

import type { AiMessageCitation } from '../../db';
import type { EmbeddingSearchService } from '../embeddings/EmbeddingSearchService';
import type { AiToolFeedbackStyle } from '../providers/providerCatalog';
import type { VoiceActionToolName } from '../voice/VoiceActionTools';

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
  step?: number;
  maxSteps?: number;
  updatedAt: string;
}

/**
 * 交互指标统计 | Interaction metrics counters
 * 供 UI 仪表盘和 CI 护栏消费。
 */
export interface AiInteractionMetrics {
  turnCount: number;
  successCount: number;
  failureCount: number;
  clarifyCount: number;
  explainFallbackCount: number;
  cancelCount: number;
  recoveryCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  currentTurnTokens: number;
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

export interface AiSessionMemoryProjectFact {
  fact: string;
  source: 'user' | 'inferred';
  createdAt: string;
}

export interface AiSessionMemoryPreferences {
  lastLanguage?: string;
  lastToolName?: AiChatToolName;
  lastLayerId?: string;
  adaptiveInputProfile?: AiAdaptiveInputProfile;
  preferredResponseStyle?: 'concise' | 'detailed';
}

export interface AiSessionMemorySummaryEntry {
  id: string;
  summary: string;
  coveredTurnCount: number;
  createdAt: string;
  similarityScore?: number;
  qualityWarning?: boolean;
}

export interface AiSessionMemorySummaryQualityWarning {
  similarity: number;
  threshold: number;
  generatedAt: string;
  coveredTurnCount: number;
}

export interface AiSessionMemory {
  conversationSummary?: string;
  summaryTurnCount?: number;
  summaryChain?: AiSessionMemorySummaryEntry[];
  summaryQualityWarning?: AiSessionMemorySummaryQualityWarning;
  pinnedMessageIds?: string[];
  preferences?: AiSessionMemoryPreferences;
  projectFacts?: AiSessionMemoryProjectFact[];
  lastLanguage?: string;
  lastToolName?: AiChatToolName;
  lastLayerId?: string;
  adaptiveInputProfile?: AiAdaptiveInputProfile;
  recommendationTelemetry?: AiRecommendationTelemetry;
}

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

export interface AiChatToolCall {
  name: AiChatToolName;
  arguments: Record<string, unknown>;
  requestId?: string;
}

export interface AiChatToolResult {
  ok: boolean;
  message: string;
}

export interface PendingAiToolCall {
  call: AiChatToolCall;
  executionCall?: AiChatToolCall;
  assistantMessageId: string;
  riskSummary?: string;
  impactPreview?: string[];
  previewContract?: PreviewContract;
  requestId?: string;
  auditContext?: ToolAuditContext;
}

export interface PreviewContract {
  affectedCount: number;
  affectedIds: string[];
  reversible: boolean;
  cascadeTypes?: string[];
}

export interface AiToolRiskCheckResult {
  requiresConfirmation: boolean;
  riskSummary?: string;
  impactPreview?: string[];
}

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
  acousticSummary?: unknown;
  waveformAnalysis?: {
    lowConfidenceCount?: number;
    overlapCount?: number;
    gapCount?: number;
    maxGapSeconds?: number;
    hotZones?: {
      startTime: number;
      endTime: number;
      signalCount: number;
      breakdown: { lowConfidence: number; overlap: number; gap: number };
      severity: number;
    }[];
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

export interface UseAiChatOptions {
  onToolCall?: (call: AiChatToolCall) => Promise<AiChatToolResult> | AiChatToolResult;
  onToolRiskCheck?: (call: AiChatToolCall) => Promise<AiToolRiskCheckResult | null | undefined> | AiToolRiskCheckResult | null | undefined;
  preparePendingToolCall?: (call: AiChatToolCall) => Promise<AiChatToolCall | null | undefined> | AiChatToolCall | null | undefined;
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
