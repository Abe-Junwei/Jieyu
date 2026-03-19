/**
 * TaskPhaseDetector — 任务阶段自动识别
 *
 * 根据用户的操作序列自动推断当前所处的工作阶段：
 * importing → transcribing → annotating → translating → reviewing → exporting
 *
 * 检测逻辑：
 *  - 观察 action 类型和频率
 *  - 阶段切换时触发事件，供报告系统和 AI 使用
 *
 * @see 解语语音智能体架构设计方案 v2.0 §P0
 */

import type { ActionId } from './IntentRouter';
import { recordTaskPhase } from './userBehaviorDB';

export type TaskPhase =
  | 'importing'    // 导入音视频、创建项目
  | 'transcribing' // 听写/转写阶段
  | 'annotating'   // IGT 标注（gloss、morpheme 等）
  | 'translating'  // 翻译阶段
  | 'reviewing'    // 审校/润色
  | 'exporting';   // 导出阶段

interface PhaseIndicator {
  phase: TaskPhase;
  confidence: number; // 0-1
  reason: string;
}

// Keywords in AI tool calls that indicate phase
const PHASE_TOOL_KEYWORDS: Record<TaskPhase, string[]> = {
  importing: ['import', 'load', 'create_project'],
  transcribing: ['transcribe', 'create_transcription_segment', 'set_transcription_text'],
  annotating: ['auto_gloss', 'set_gloss_text', 'create_transcription_layer'],
  translating: ['set_translation_text', 'translate'],
  reviewing: ['review', 'confirm', 'approve'],
  exporting: ['export', 'save', 'download'],
};

class TaskPhaseDetector {
  private _currentPhase: TaskPhase = 'transcribing';
  private _phaseStartTime = Date.now();
  private _segmentsProcessedInPhase = 0;
  private _actionCountsInPhase: Partial<Record<ActionId, number>> = {};
  private _sessionId: string;
  private _listeners: Set<(phase: TaskPhase, indicators: PhaseIndicator) => void> = new Set();

  constructor(sessionId: string) {
    this._sessionId = sessionId;
  }

  /** Get the current detected phase. */
  get currentPhase(): TaskPhase {
    return this._currentPhase;
  }

  /** Get how long (ms) the current phase has been active. */
  get phaseDurationMs(): number {
    return Date.now() - this._phaseStartTime;
  }

  /**
   * Feed an action into the detector.
   * Called after each executeAction().
   */
  onAction(actionId: ActionId): void {
    // Count action occurrences in current phase
    this._actionCountsInPhase[actionId] = (this._actionCountsInPhase[actionId] ?? 0) + 1;

    // Detect phase change
    const detected = this._detectPhase();
    if (detected.phase !== this._currentPhase && detected.confidence > 0.6) {
      this._transitionTo(detected.phase);
    }
  }

  /**
   * Feed a tool call name into the detector.
   * Called after AI tool execution.
   */
  onToolCall(toolName: string): void {
    for (const [phase, keywords] of Object.entries(PHASE_TOOL_KEYWORDS)) {
      if (keywords.some((kw) => toolName.toLowerCase().includes(kw))) {
        const detected: PhaseIndicator = {
          phase: phase as TaskPhase,
          confidence: 0.7,
          reason: `tool call: ${toolName}`,
        };
        if (detected.phase !== this._currentPhase && detected.confidence > 0.6) {
          this._transitionTo(detected.phase);
        }
        break;
      }
    }
  }

  /**
   * Increment segment count when a new segment is created/processed.
   */
  onSegmentProcessed(): void {
    this._segmentsProcessedInPhase += 1;
  }

  /**
   * Subscribe to phase change events.
   */
  onPhaseChange(callback: (phase: TaskPhase, indicators: PhaseIndicator) => void): () => void {
    this._listeners.add(callback);
    return () => { this._listeners.delete(callback); };
  }

  private _detectPhase(): PhaseIndicator {
    const annotatingCount = (this._actionCountsInPhase['markSegment'] ?? 0);
    const reviewingCount =
      (this._actionCountsInPhase['undo'] ?? 0) +
      (this._actionCountsInPhase['redo'] ?? 0);
    const transcribingCount =
      (this._actionCountsInPhase['navNext'] ?? 0) +
      (this._actionCountsInPhase['navPrev'] ?? 0);

    if (transcribingCount > annotatingCount * 2 && transcribingCount > 3) {
      return { phase: 'transcribing', confidence: 0.7, reason: 'nav-heavy pattern' };
    }

    if (annotatingCount > 3) {
      return { phase: 'annotating', confidence: 0.8, reason: 'markSegment actions' };
    }

    if (reviewingCount > annotatingCount && reviewingCount > 2) {
      return { phase: 'reviewing', confidence: 0.75, reason: 'undo/redo heavy' };
    }

    if (this._segmentsProcessedInPhase === 0) {
      return { phase: 'importing', confidence: 0.5, reason: 'no segments yet' };
    }

    return { phase: this._currentPhase, confidence: 1.0, reason: 'no change' };
  }

  private _transitionTo(newPhase: TaskPhase): void {
    // Record the completed phase to DB
    void recordTaskPhase({
      phase: this._currentPhase,
      startedAt: this._phaseStartTime,
      endedAt: Date.now(),
      segmentsProcessed: this._segmentsProcessedInPhase,
      sessionId: this._sessionId,
    });

    // Notify listeners
    const indicators = this._detectPhase();
    this._listeners.forEach((cb) => cb(newPhase, indicators));

    // Reset counters for new phase
    this._currentPhase = newPhase;
    this._phaseStartTime = Date.now();
    this._segmentsProcessedInPhase = 0;
    this._actionCountsInPhase = {};
  }

  /**
   * Force a phase transition (e.g., user explicitly switches to translating mode).
   */
  forcePhase(phase: TaskPhase): void {
    if (phase !== this._currentPhase) {
      this._transitionTo(phase);
    }
  }

  /** Get a summary of the current phase state. */
  getState(): {
    phase: TaskPhase;
    durationMs: number;
    segmentsProcessed: number;
    actionCounts: Partial<Record<ActionId, number>>;
  } {
    return {
      phase: this._currentPhase,
      durationMs: this.phaseDurationMs,
      segmentsProcessed: this._segmentsProcessedInPhase,
      actionCounts: { ...this._actionCountsInPhase },
    };
  }
}

export { TaskPhaseDetector };
