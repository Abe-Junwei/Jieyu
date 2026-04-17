/**
 * AI 聊天领域类型（事实源）
 * hooks/useAiChat.types.ts 仅再导出本文件，避免 ai/chat 反向依赖 hooks。
 */

import type { AiMessageCitation } from '../../db';
import type { EmbeddingSearchService } from '../embeddings/EmbeddingSearchService';
import type { AiToolFeedbackStyle } from '../providers/providerCatalog';
import type { VoiceActionToolName } from '../voice/VoiceActionTools';
import type { TimelineUnitView } from '../../hooks/timelineUnitView';

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

export type LocalToolClarificationReason =
  | 'metric_ambiguous'
  | 'scope_ambiguous'
  | 'query_ambiguous'
  | 'target_ambiguous'
  | 'action_ambiguous';

export type AiTaskClarifyReason = ToolPlannerClarifyReason | LocalToolClarificationReason;

export type AiTaskTracePhase = 'clarify' | 'local_tool' | 'tool_decision' | 'answer';

export interface AiTaskTraceEntry {
  phase: AiTaskTracePhase;
  stepNumber: number;
  timestamp: string;
  toolName?: string;
  requestId?: string;
  outcome?: 'done' | 'error' | 'clarify';
  durationMs?: number;
  errorTaxonomy?: string;
}

export interface AiTaskSession {
  id: string;
  status: 'idle' | 'waiting_clarify' | 'waiting_confirm' | 'executing' | 'explaining';
  toolName?: AiChatToolName;
  clarifyReason?: AiTaskClarifyReason;
  candidates?: AiClarifyCandidate[];
  step?: number;
  maxSteps?: number;
  trace?: AiTaskTraceEntry[];
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

export interface AiSessionMemoryPendingAgentLoopCheckpoint {
  kind: 'token_budget_warning';
  originalUserText: string;
  continuationInput: string;
  step: number;
  estimatedRemainingTokens?: number;
  createdAt: string;
}

export type LocalToolIntent =
  | 'unit.list'
  | 'unit.search'
  | 'unit.detail'
  | 'stats.get';

export type LocalUnitScope =
  | 'project'
  | 'current_track'
  | 'current_scope';

export type LocalToolMetric =
  | 'unit_count'
  | 'speaker_count'
  | 'translation_layer_count'
  | 'ai_confidence_avg'
  | 'untranscribed_count'
  | 'missing_speaker_count';

export type LocalToolMetricCategory =
  | 'total'
  | 'gap';

export type LocalToolQuestionKind =
  | 'count'
  | 'list'
  | 'search'
  | 'detail';

export type LocalToolDomain =
  | 'units'
  | 'project_stats';

export interface AiSessionMemoryLocalSemanticFrame {
  domain?: LocalToolDomain;
  questionKind?: LocalToolQuestionKind;
  metric?: LocalToolMetric;
  metricCategory?: LocalToolMetricCategory;
  scope?: LocalUnitScope;
  isQualityGapQuestion?: boolean;
  source?: 'user' | 'inferred' | 'tool';
  updatedAt: string;
}

export interface AiSessionMemoryLocalToolState {
  lastIntent?: LocalToolIntent;
  lastQuery?: string;
  lastResultUnitIds?: string[];
  lastScope?: LocalUnitScope;
  lastFrame?: AiSessionMemoryLocalSemanticFrame;
  updatedAt: string;
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
  localToolState?: AiSessionMemoryLocalToolState;
  pendingAgentLoopCheckpoint?: AiSessionMemoryPendingAgentLoopCheckpoint;
}

export type ToolPlannerClarifyReason =
  | 'missing-unit-target'
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
  | 'auto_gloss_unit'
  | 'set_token_pos'
  | 'set_token_gloss'
  | 'propose_changes'
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
  /** When `call.name === 'propose_changes'`, child tools to run after the user confirms (preview-only parent). */
  proposedChildCalls?: ReadonlyArray<AiChatToolCall>;
  assistantMessageId: string;
  riskSummary?: string;
  impactPreview?: string[];
  previewContract?: PreviewContract;
  requestId?: string;
  auditContext?: ToolAuditContext;
  /** Timeline read-model epoch when the pending destructive tool was captured (for stale confirmation guard). */
  readModelEpochCaptured?: number;
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
  activeUnitId?: string;
  activeSegmentUnitId?: string;
  selectedUnitKind?: 'unit' | 'segment';
  selectedUnitIds?: string[];
  /** Full selection cardinality; `selectedUnitIds` may be capped for prompt size. */
  selectedUnitCount?: number;
  selectedUnitStartSec?: number;
  selectedUnitEndSec?: number;
  selectedLayerId?: string;
  selectedLayerType?: 'transcription' | 'translation';
  selectedTranslationLayerId?: string;
  selectedTranscriptionLayerId?: string;
  currentMediaId?: string;
  selectedText?: string;
  selectionTimeRange?: string;
  audioTimeSec?: number;
  /** Project-wide unit count (same source as projectStats.unitCount). */
  projectUnitCount?: number;
  /** Current media unit count for waveform/timeline analysis rows. */
  currentMediaUnitCount?: number;
  /** Current AI operation scope unit count (active layer + current media). */
  currentScopeUnitCount?: number;
  /** Timeline digest on current media (unit or segment). */
  unitTimeline?: string;
  /** Hierarchical project/media/unit/layer snapshot for AI grounding. */
  worldModelSnapshot?: string;
  /** Monotonic epoch from `useTimelineUnitViewIndex` / timeline read model; used for destructive tool confirmation. */
  timelineReadModelEpoch?: number;
  /** False means segment-backed unit index may still be loading; empty unit lists are not authoritative yet. */
  unitIndexComplete?: boolean;
  /** Full-project unit snapshot for local list/search/detail tools (not serialized into prompt text). */
  localUnitIndex?: ReadonlyArray<TimelineUnitView>;
  recentEdits?: string[];
  recentActions?: string[];
  /** Tier-2 rolling conversation digest from session memory (not a substitute for [CONTEXT] counts). */
  sessionMemoryDigest?: string;
}

export interface AiLongTermContext {
  projectStats?: {
    unitCount?: number;
    speakerCount?: number;
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

/**
 * System field attached to successful local context tool JSON results (`_readModel`).
 * Not user/annotation data; used for staleness checks and debugging.
 */
export interface AiLocalToolReadModelMeta {
  /** Monotonic epoch from timeline read model when the tool ran (JIT context). */
  timelineReadModelEpoch?: number;
  /** False when segment-backed unit index may still be loading. */
  unitIndexComplete: boolean;
  /** Client clock when the snapshot was taken (ms since epoch). */
  capturedAtMs: number;
  /** `localUnitIndex` row count when present (may differ from `projectStats.unitCount`). */
  indexRowCount?: number;
  /** Tool payload来源，便于解释查询是否命中了统一读模型。 */
  source?: 'timeline_index' | 'segment_meta' | 'scope_stats_snapshot' | 'segment_quality_snapshot' | 'hybrid';
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
  /** Current timeline read-model epoch; used to reject stale pending tool confirmations. */
  getTimelineReadModelEpoch?: () => number | undefined;
  streamPersistIntervalMs?: number;
  firstChunkTimeoutMs?: number;
  autoProbeIntervalMs?: number;
  autoConnectionProbeEnabled?: boolean;
  embeddingSearchService?: EmbeddingSearchService;
}
