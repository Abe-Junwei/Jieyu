/**
 * RiskDetector — 主动风险检测
 *
 * 在执行破坏性操作之前，主动检测潜在风险并提供警告。
 * 风险类型：
 *  - 数据丢失风险（删除最后一个/唯一句段）
 *  - 不可逆操作（大规模合并/分割）
 *  - 上下文丢失（操作目标已被删除）
 *  - 疲劳干扰（用户处于高疲劳状态时执行复杂操作）
 *
 * @see 解语-语音智能体架构设计方案 v2.5 §阶段3
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
  /** 当前操作涉及的 segment ID（若有） */
  targetSegmentId?: string | null | undefined;
  /** 当前操作涉及的时间点（秒） */
  targetTimeSeconds?: number | null | undefined;
  /** 总句段数 */
  totalSegments: number;
  /** 当前选中句段 ID */
  currentSegmentId?: string | null | undefined;
  /** 目标 segment 的时长（秒） */
  targetDurationSeconds?: number | null | undefined;
  /** 是否是第一句段 */
  isFirstSegment?: boolean | undefined;
  /** 是否是最后一句段 */
  isLastSegment?: boolean | undefined;
  /** 用户疲劳分数（0-1） */
  fatigueScore?: number | undefined;
  /** 是否在安全模式 */
  safeMode?: boolean | undefined;
  /** 连续 destructive 操作计数 */
  recentDestructiveCount?: number | undefined;
  /** STT 置信度（0-1） */
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
    reason: '这是唯一的句段，删除后将无法恢复',
    requiresExplicitConfirm: true,
    alternativeSuggestion: () => '建议先新建一个句段再删除当前内容',
  },
  // Critical: merge first or last segment (loses position context)
  {
    check: (ctx, actionId) =>
      (actionId === 'mergePrev' && ctx.isFirstSegment === true) ||
      (actionId === 'mergeNext' && ctx.isLastSegment === true),
    level: 'high',
    reason: '合并边界句段可能丢失位置信息，且无法撤销',
    requiresExplicitConfirm: true,
    alternativeSuggestion: (ctx) =>
      ctx.isFirstSegment ? '建议先切换到第二句段，再合并到上一个' : '建议先切换到倒数第二句段，再合并下一个',
  },
  // High: very short segment (< 0.3s)
  {
    check: (ctx) =>
      ctx.targetDurationSeconds != null && ctx.targetDurationSeconds < 0.3,
    level: 'high',
    reason: '目标句段时长过短（<0.3s），可能是误识别导致',
    requiresExplicitConfirm: true,
    alternativeSuggestion: () => '建议先确认该时间点确实存在有效语音',
  },
  // Medium: low STT confidence
  {
    check: (ctx) => ctx.confidence !== undefined && ctx.confidence < 0.6,
    level: 'medium',
    reason: '语音识别置信度较低，操作可能不是用户本意',
    requiresExplicitConfirm: true,
  },
  // Medium: fatigue + destructive action
  {
    check: (ctx) =>
      ctx.fatigueScore !== undefined && ctx.fatigueScore > 0.7 &&
      ctx.recentDestructiveCount !== undefined && ctx.recentDestructiveCount >= 2,
    level: 'medium',
    reason: '您目前疲劳度较高，建议休息后再继续复杂操作',
    requiresExplicitConfirm: false,
  },
  // Medium: consecutive destructive operations
  {
    check: (ctx) =>
      ctx.recentDestructiveCount !== undefined && ctx.recentDestructiveCount >= 3,
    level: 'medium',
    reason: '已连续执行多次破坏性操作，建议稍作停顿确认',
    requiresExplicitConfirm: false,
  },
  // Low: only two segments left
  {
    check: (ctx, actionId) =>
      (actionId === 'mergePrev' || actionId === 'mergeNext') && ctx.totalSegments <= 2,
    level: 'low',
    reason: '只剩两个句段，合并后将变为一个',
    requiresExplicitConfirm: false,
  },
  // Low: split very long segment (> 30s)
  {
    check: (ctx, actionId) =>
      actionId === 'splitSegment' &&
      ctx.targetDurationSeconds != null && ctx.targetDurationSeconds > 30,
    level: 'low',
    reason: '原句段较长，分割后两个句段都会比较长',
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
