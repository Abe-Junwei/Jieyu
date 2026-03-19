/**
 * AttentionTracker — 注意力热力图追踪
 *
 * 追踪用户在各个句段上的停留时间和操作密度，
 * 识别"困难句段"（dwell time 高、edit count 高、AI assistance 请求多）。
 *
 * 数据用于：
 *  - 工作报告中的"需要关注的句段"
 *  - AI 主动建议（"这段比较难，要不要跳过？"）
 *  - 项目记忆（自动记住困难模式）
 *
 * @see 解语语音智能体架构设计方案 v2.0 §P0
 */

import { recordDifficultSegment } from './userBehaviorDB';

export interface SegmentAttention {
  segmentId: string;
  dwellTimeMs: number;
  editCount: number;
  revertCount: number;
  aiAssistanceRequested: boolean;
  lastAccessedAt: number;
}

export interface DifficultSegmentResult {
  segmentId: string;
  editCount: number;
  revertCount: number;
  dwellTimeMs: number;
  aiAssistanceRequested: boolean;
  difficultyScore: number; // 0-1
}

/** Difficulty score weights */
const WEIGHTS = {
  dwellTime: 0.3,
  editCount: 0.35,
  revertCount: 0.2,
  aiAssistance: 0.15,
};

/** Expected average dwell time per segment (ms) */
const EXPECTED_DWELL_TIME_MS = 30_000;

class AttentionTracker {
  private _sessionId: string;
  private _activeSegmentId: string | null = null;
  private _activeSegmentStart: number | null = null;
  private _segmentAttention: Map<string, SegmentAttention> = new Map();
  private _difficultyThreshold = 0.65;
  private _listeners: Set<(segmentId: string, attention: SegmentAttention) => void> = new Set();

  constructor(sessionId: string) {
    this._sessionId = sessionId;
  }

  /**
   * Called when user focuses on a segment (e.g., via navNext, click, select).
   * Automatically closes the timer on the previously active segment.
   */
  onSegmentFocus(segmentId: string): void {
    if (this._activeSegmentId !== null && this._activeSegmentStart !== null) {
      const elapsed = Date.now() - this._activeSegmentStart;
      const existing = this._segmentAttention.get(this._activeSegmentId);
      if (existing) {
        existing.dwellTimeMs += elapsed;
        existing.lastAccessedAt = Date.now();
      }
    }

    this._activeSegmentId = segmentId;
    this._activeSegmentStart = Date.now();

    if (!this._segmentAttention.has(segmentId)) {
      this._segmentAttention.set(segmentId, {
        segmentId,
        dwellTimeMs: 0,
        editCount: 0,
        revertCount: 0,
        aiAssistanceRequested: false,
        lastAccessedAt: Date.now(),
      });
    }
  }

  /** Called when a segment is edited. */
  onSegmentEdit(segmentId?: string): void {
    const target = segmentId ?? this._activeSegmentId;
    if (!target) return;

    const attention = this._segmentAttention.get(target) ?? this._initSegment(target);
    attention.editCount += 1;
    this._segmentAttention.set(target, attention);
    this._notifyIfDifficult(target, attention);
  }

  /** Called when user reverts an edit (undo operation). */
  onSegmentRevert(segmentId?: string): void {
    const target = segmentId ?? this._activeSegmentId;
    if (!target) return;

    const attention = this._segmentAttention.get(target) ?? this._initSegment(target);
    attention.revertCount += 1;
    this._segmentAttention.set(target, attention);
  }

  /** Called when user requests AI assistance for a segment. */
  onAIAssistance(segmentId?: string): void {
    const target = segmentId ?? this._activeSegmentId;
    if (!target) return;

    const attention = this._segmentAttention.get(target) ?? this._initSegment(target);
    attention.aiAssistanceRequested = true;
    this._segmentAttention.set(target, attention);
  }

  /** Subscribe to segment attention updates. */
  onAttentionChange(
    callback: (segmentId: string, attention: SegmentAttention) => void,
  ): () => void {
    this._listeners.add(callback);
    return () => { this._listeners.delete(callback); };
  }

  /**
   * Get all segments sorted by difficulty score (descending).
   * Only includes segments with score >= _difficultyThreshold.
   */
  getDifficultSegments(topK = 10): DifficultSegmentResult[] {
    const results: DifficultSegmentResult[] = [];

    for (const [segmentId, attention] of this._segmentAttention) {
      if (attention.dwellTimeMs < 5_000) continue; // Skip accidental focus

      results.push({
        segmentId,
        editCount: attention.editCount,
        revertCount: attention.revertCount,
        dwellTimeMs: attention.dwellTimeMs,
        aiAssistanceRequested: attention.aiAssistanceRequested,
        difficultyScore: this._computeDifficultyScore(attention),
      });
    }

    return results
      .filter((r) => r.difficultyScore >= this._difficultyThreshold)
      .sort((a, b) => b.difficultyScore - a.difficultyScore)
      .slice(0, topK);
  }

  /** Persist difficult segments to IndexedDB. Call at session end. */
  async persistDifficultSegments(): Promise<void> {
    const difficult = this.getDifficultSegments(20);
    await Promise.allSettled(
      difficult.map((seg) =>
        recordDifficultSegment({
          segmentId: seg.segmentId,
          editCount: seg.editCount,
          revertCount: seg.revertCount,
          dwellTimeMs: seg.dwellTimeMs,
          aiAssistanceRequested: seg.aiAssistanceRequested,
          difficultyScore: seg.difficultyScore,
          sessionId: this._sessionId,
          recordedAt: Date.now(),
        }),
      ),
    );
  }

  /** Flush remaining dwell time for active segment. Call at session end. */
  flush(): void {
    if (this._activeSegmentId !== null && this._activeSegmentStart !== null) {
      const elapsed = Date.now() - this._activeSegmentStart;
      const existing = this._segmentAttention.get(this._activeSegmentId);
      if (existing) {
        existing.dwellTimeMs += elapsed;
        existing.lastAccessedAt = Date.now();
      }
      this._activeSegmentId = null;
      this._activeSegmentStart = null;
    }
  }

  private _initSegment(segmentId: string): SegmentAttention {
    const attention: SegmentAttention = {
      segmentId,
      dwellTimeMs: 0,
      editCount: 0,
      revertCount: 0,
      aiAssistanceRequested: false,
      lastAccessedAt: Date.now(),
    };
    this._segmentAttention.set(segmentId, attention);
    return attention;
  }

  private _computeDifficultyScore(attention: SegmentAttention): number {
    const dwellRatio = Math.min(attention.dwellTimeMs / EXPECTED_DWELL_TIME_MS, 3);
    const maxEdits = 10;
    const maxReverts = 5;

    const score =
      WEIGHTS.dwellTime * Math.min(dwellRatio, 1) +
      WEIGHTS.editCount * Math.min(attention.editCount / maxEdits, 1) +
      WEIGHTS.revertCount * Math.min(attention.revertCount / maxReverts, 1) +
      WEIGHTS.aiAssistance * (attention.aiAssistanceRequested ? 1 : 0);

    return Math.min(1, Math.max(0, score));
  }

  private _notifyIfDifficult(segmentId: string, attention: SegmentAttention): void {
    if (this._computeDifficultyScore(attention) >= this._difficultyThreshold) {
      this._listeners.forEach((cb) => cb(segmentId, attention));
    }
  }
}

export { AttentionTracker };
