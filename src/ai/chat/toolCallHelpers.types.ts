import type {
  AiChatToolCall,
  AiToolDecisionMode,
  AiMemoryRecallShapeTelemetry,
} from './chatDomain.types';
import type { AiToolFeedbackStyle } from '../providers/providerCatalog';

export type ToolPlannerClarifyReason =
  | 'missing-unit-target'
  | 'missing-split-position'
  | 'missing-translation-layer-target'
  | 'missing-layer-link-target'
  | 'missing-layer-target'
  | 'missing-language-target';

type ToolPlannerDecision = 'resolved' | 'clarify';

export interface ToolPlannerResult {
  decision: ToolPlannerDecision;
  call: AiChatToolCall;
  reason?: ToolPlannerClarifyReason;
}

export type ToolIntentDecision = 'execute' | 'clarify' | 'ignore' | 'cancel';

export interface ToolIntentAssessment {
  decision: ToolIntentDecision;
  score: number;
  hasExecutionCue: boolean;
  hasActionVerb: boolean;
  hasActionTarget: boolean;
  hasExplicitId: boolean;
  hasMetaQuestion: boolean;
  hasTechnicalDiscussion: boolean;
  intentCandidates?: Array<{ decision: ToolIntentDecision; confidence: number; why: string }>;
  confidence?: number;
  margin?: number;
  confidenceGate?: {
    triggered: boolean;
    threshold: number;
    marginThreshold: number;
    reason?: string;
  };
}

export interface ToolIntentAssessmentOptions {
  allowDeicticExecution?: boolean;
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
  memoryRecallShape?: AiMemoryRecallShapeTelemetry;
}

export interface ToolIntentAuditMetadata {
  schemaVersion: 1;
  phase: 'intent';
  requestId: string;
  assistantMessageId: string;
  toolCall: AiChatToolCall;
  context: ToolAuditContext;
  /** P1: deduped `formatEvidenceSourceRefForAudit` keys for evidence / segment joins (see `evidenceSourceRef.ts`). */
  evidenceSourceRefs?: string[];
}

export interface ToolDecisionAuditMetadata {
  schemaVersion: 1;
  phase: 'decision';
  requestId: string;
  assistantMessageId: string;
  source: 'human' | 'ai' | 'system';
  toolCall: AiChatToolCall;
  context: ToolAuditContext;
  executed: boolean;
  outcome: string;
  memoryRecallShape?: AiMemoryRecallShapeTelemetry;
  message?: string;
  reason?: string;
  durationMs?: number;
  executionProgress?: {
    appliedCount: number;
    totalCount: number;
    partial: boolean;
  };
  proposeRollback?: {
    attempted: boolean;
    ok: boolean;
    errorCount: number;
  };
  /** P1: deduped `formatEvidenceSourceRefForAudit` keys for evidence / segment joins (see `evidenceSourceRef.ts`). */
  evidenceSourceRefs?: string[];
}
