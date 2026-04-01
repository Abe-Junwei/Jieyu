/**
 * RiskDetector - proactive risk checks before destructive operations.
 *
 * Detects likely risks and returns warnings before the action is executed.
 */

import type { ActionId } from './IntentRouter';

// ── Types ─────────────────────────────────────────────────────────────────────

export type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

export interface RiskAssessment {
  level: RiskLevel;
  reasons: string[];
  /** If true, this action should be blocked or require explicit confirmation */
  requiresExplicitConfirm: boolean;
  /** Suggested alternative action (if applicable) */
  alternativeSuggestion?: string | undefined;
}

export interface RiskDetectorContext {
  /** Segment ID targeted by the current action, if any. */
  targetSegmentId?: string | null | undefined;
  /** Target time position in seconds, if any. */
  targetTimeSeconds?: number | null | undefined;
  /** Total segment count. */
  totalSegments: number;
  /** Currently selected segment ID. */
  currentSegmentId?: string | null | undefined;
  /** Target segment duration in seconds. */
  targetDurationSeconds?: number | null | undefined;
  /** Whether the target segment is the first segment. */
  isFirstSegment?: boolean | undefined;
  /** Whether the target segment is the last segment. */
  isLastSegment?: boolean | undefined;
  /** User fatigue score between 0 and 1. */
  fatigueScore?: number | undefined;
  /** Whether safe mode is enabled. */
  safeMode?: boolean | undefined;
  /** Number of recent destructive operations. */
  recentDestructiveCount?: number | undefined;
  /** STT confidence score between 0 and 1. */
  confidence?: number | undefined;
}

// ── Risk Rules ─────────────────────────────────────────────────────────────────

interface RiskRule {
  check: (ctx: RiskDetectorContext, actionId: ActionId) => boolean;
  level: RiskLevel;
  reason: string;
  requiresExplicitConfirm?: boolean;
  alternativeSuggestion?: (ctx: RiskDetectorContext) => string | undefined;
}

const RISK_RULES: RiskRule[] = [
  // Critical: deleting the only segment
  {
    check: (ctx) => ctx.totalSegments === 1,
    level: 'critical',
    reason: '\u8fd9\u662f\u552f\u4e00\u7684\u53e5\u6bb5\uff0c\u5220\u9664\u540e\u5c06\u65e0\u6cd5\u6062\u590d',
    requiresExplicitConfirm: true,
    alternativeSuggestion: () => '\u5efa\u8bae\u5148\u65b0\u5efa\u4e00\u4e2a\u53e5\u6bb5\u518d\u5220\u9664\u5f53\u524d\u5185\u5bb9',
  },
  // Critical: merge first or last segment (loses position context)
  {
    check: (ctx, actionId) =>
      (actionId === 'mergePrev' && ctx.isFirstSegment === true) ||
      (actionId === 'mergeNext' && ctx.isLastSegment === true),
    level: 'high',
    reason: '\u5408\u5e76\u8fb9\u754c\u53e5\u6bb5\u53ef\u80fd\u4e22\u5931\u4f4d\u7f6e\u4fe1\u606f\uff0c\u4e14\u65e0\u6cd5\u64a4\u9500',
    requiresExplicitConfirm: true,
    alternativeSuggestion: (ctx) =>
      ctx.isFirstSegment ? '\u5efa\u8bae\u5148\u5207\u6362\u5230\u7b2c\u4e8c\u53e5\u6bb5\uff0c\u518d\u5408\u5e76\u5230\u4e0a\u4e00\u4e2a' : '\u5efa\u8bae\u5148\u5207\u6362\u5230\u5012\u6570\u7b2c\u4e8c\u53e5\u6bb5\uff0c\u518d\u5408\u5e76\u4e0b\u4e00\u4e2a',
  },
  // High: very short segment (< 0.3s)
  {
    check: (ctx) =>
      ctx.targetDurationSeconds != null && ctx.targetDurationSeconds < 0.3,
    level: 'high',
    reason: '\u76ee\u6807\u53e5\u6bb5\u65f6\u957f\u8fc7\u77ed\uff08<0.3s\uff09\uff0c\u53ef\u80fd\u662f\u8bef\u8bc6\u522b\u5bfc\u81f4',
    requiresExplicitConfirm: true,
    alternativeSuggestion: () => '\u5efa\u8bae\u5148\u786e\u8ba4\u8be5\u65f6\u95f4\u70b9\u786e\u5b9e\u5b58\u5728\u6709\u6548\u8bed\u97f3',
  },
  // Medium: low STT confidence
  {
    check: (ctx) => ctx.confidence !== undefined && ctx.confidence < 0.6,
    level: 'medium',
    reason: '\u8bed\u97f3\u8bc6\u522b\u7f6e\u4fe1\u5ea6\u8f83\u4f4e\uff0c\u64cd\u4f5c\u53ef\u80fd\u4e0d\u662f\u7528\u6237\u672c\u610f',
    requiresExplicitConfirm: true,
  },
  // Medium: fatigue + destructive action
  {
    check: (ctx) =>
      ctx.fatigueScore !== undefined && ctx.fatigueScore > 0.7 &&
      ctx.recentDestructiveCount !== undefined && ctx.recentDestructiveCount >= 2,
    level: 'medium',
    reason: '\u60a8\u76ee\u524d\u75b2\u52b3\u5ea6\u8f83\u9ad8\uff0c\u5efa\u8bae\u4f11\u606f\u540e\u518d\u7ee7\u7eed\u590d\u6742\u64cd\u4f5c',
    requiresExplicitConfirm: false,
  },
  // Medium: consecutive destructive operations
  {
    check: (ctx) =>
      ctx.recentDestructiveCount !== undefined && ctx.recentDestructiveCount >= 3,
    level: 'medium',
    reason: '\u5df2\u8fde\u7eed\u6267\u884c\u591a\u6b21\u7834\u574f\u6027\u64cd\u4f5c\uff0c\u5efa\u8bae\u7a0d\u4f5c\u505c\u987f\u786e\u8ba4',
    requiresExplicitConfirm: false,
  },
  // Low: only two segments left
  {
    check: (ctx, actionId) =>
      (actionId === 'mergePrev' || actionId === 'mergeNext') && ctx.totalSegments <= 2,
    level: 'low',
    reason: '\u53ea\u5269\u4e24\u4e2a\u53e5\u6bb5\uff0c\u5408\u5e76\u540e\u5c06\u53d8\u4e3a\u4e00\u4e2a',
    requiresExplicitConfirm: false,
  },
  // Low: split very long segment (> 30s)
  {
    check: (ctx, actionId) =>
      actionId === 'splitSegment' &&
      ctx.targetDurationSeconds != null && ctx.targetDurationSeconds > 30,
    level: 'low',
    reason: '\u539f\u53e5\u6bb5\u8f83\u957f\uff0c\u5206\u5272\u540e\u4e24\u4e2a\u53e5\u6bb5\u90fd\u4f1a\u6bd4\u8f83\u957f',
    requiresExplicitConfirm: false,
  },
];

// ── Destructive Actions ───────────────────────────────────────────────────────

const DESTRUCTIVE_ACTIONS: ReadonlySet<ActionId> = new Set([
  'deleteSegment',
  'mergePrev',
  'mergeNext',
  'splitSegment',
]);

const UNDOABLE_DESTRUCTIVE: ReadonlySet<ActionId> = new Set([
  'deleteSegment',
  'mergePrev',
  'mergeNext',
  'splitSegment',
]);

// ── RiskDetector ─────────────────────────────────────────────────────────────

export class RiskDetector {
  assess(actionId: ActionId, ctx: RiskDetectorContext): RiskAssessment {
    const matchedRules = RISK_RULES.filter((rule) => rule.check(ctx, actionId));

    if (matchedRules.length === 0) {
      return { level: 'none', reasons: [], requiresExplicitConfirm: false };
    }

    const levelPriority: Record<RiskLevel, number> = {
      none: 0, low: 1, medium: 2, high: 3, critical: 4,
    };

    matchedRules.sort((a, b) => levelPriority[b.level] - levelPriority[a.level]);
    const top = matchedRules[0]!;

    const requiresExplicitConfirm =
      top.requiresExplicitConfirm === true ||
      (ctx.safeMode === true && DESTRUCTIVE_ACTIONS.has(actionId));

    return {
      level: top.level,
      reasons: matchedRules.map((r) => r.reason),
      requiresExplicitConfirm,
      alternativeSuggestion: top.alternativeSuggestion?.(ctx),
    };
  }

  isDestructive(actionId: ActionId): boolean {
    return DESTRUCTIVE_ACTIONS.has(actionId);
  }

  isUndoable(actionId: ActionId): boolean {
    return UNDOABLE_DESTRUCTIVE.has(actionId);
  }

  static buildContext(params: {
    targetSegmentId?: string | null;
    targetTimeSeconds?: number | null;
    totalSegments: number;
    currentSegmentId?: string | null;
    segments?: Array<{ id: string; audioTimeRange: [number, number] | null }>;
    fatigueScore?: number;
    safeMode?: boolean;
    recentDestructiveCount?: number;
    confidence?: number;
  }): RiskDetectorContext {
    const { targetSegmentId, targetTimeSeconds, totalSegments, currentSegmentId, segments, fatigueScore, safeMode, recentDestructiveCount, confidence } = params;

    let targetDurationSeconds: number | null | undefined;
    let isFirstSegment = false;
    let isLastSegment = false;

    if (targetSegmentId && segments) {
      const segIndex = segments.findIndex((s) => s.id === targetSegmentId);
      if (segIndex >= 0) {
        const seg = segments[segIndex];
        if (seg?.audioTimeRange) {
          targetDurationSeconds = seg.audioTimeRange[1] - seg.audioTimeRange[0];
        }
        isFirstSegment = segIndex === 0;
        isLastSegment = segIndex === segments.length - 1;
      }
    }

    return {
      targetSegmentId: targetSegmentId ?? null,
      targetTimeSeconds: targetTimeSeconds ?? null,
      totalSegments,
      currentSegmentId: currentSegmentId ?? null,
      targetDurationSeconds,
      isFirstSegment,
      isLastSegment,
      fatigueScore,
      safeMode,
      recentDestructiveCount,
      confidence,
    };
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────

let _instance: RiskDetector | null = null;

export function getRiskDetector(): RiskDetector {
  if (!_instance) {
    _instance = new RiskDetector();
  }
  return _instance;
}
