/**
 * ConversationalState — 多轮对话状态管理
 *
 * 维护语音助手在单个 session 中的多轮交互上下文。
 * 核心职责：
 *  - 追踪最近的对话轮次（最近 N 条 transcript + intent）
 *  - 维护指代消解上下文（如"刚才标记的句子"、"上一个"等指代词）
 *  - 记录活跃的槽位填充状态（multi-step 操作进行中）
 *  - 检测对话模式（是否进入连续指令模式、闲聊模式等）
 *
 * 与 IntentRouter 的区别：
 *  - IntentRouter 负责单轮意图分类（text → intent）
 *  - ConversationalState 负责跨轮次状态（session-level memory）
 *
 * @see 解语-语音智能体架构设计方案 v2.5 §阶段3
 */

import type { ActionId, VoiceIntent } from './IntentRouter';

// ── Types ────────────────────────────────────────────────────────────────────

export type ConversationTurnMode =
  | 'command'      // 单条指令即执行 | single command, execute immediately
  | 'multi-step'   // 多步操作进行中（如连续标注）| multi-step operation in progress
  | 'chat'         // 闲聊/问答模式 | chat / Q&A mode
  | 'dictation'    // 听写模式 | dictation mode
  | 'idle';        // 无活跃上下文 | no active context

export interface ConversationTurn {
  /** 本轮原始转写文本 */
  transcript: string;
  /** 解析后的意图 */
  intent: VoiceIntent;
  /** 时间戳 */
  timestamp: number;
  /** 本轮执行的动作（actionId） */
  executedAction: ActionId | null;
  /** 本轮执行的工具名称（tool intent 时） */
  executedTool: string | null;
}

export interface SlotFillContext {
  /** 槽位名称 */
  slotName: string;
  /** 已填充的值 */
  value: string;
  /** 是否完成 */
  filled: boolean;
  /** 创建时间 */
  createdAt: number;
}

export interface ConversationalState {
  /** session 启动时间 */
  sessionStartedAt: number;
  /** 所有对话轮次 */
  turns: ConversationTurn[];
  /** 当前活跃的指代消解上下文 */
  referentContext: {
    /** 最近一次操作的 target segment ID */
    lastTargetSegmentId: string | null;
    /** 最近一次操作的 target segment 索引 */
    lastTargetSegmentIndex: number | null;
    /** 近期被引用的 segment ID 列表（用于"上一个""下一个"等） */
    recentSegmentIds: string[];
  };
  /** 活跃的槽位填充上下文（multi-step 操作进行中） */
  activeSlotFills: SlotFillContext[];
  /** 当前对话模式 */
  mode: ConversationTurnMode;
  /** 连续 command 计数（连续多少条 command 未打断） */
  consecutiveCommandCount: number;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

const MAX_TURNS = 50;          // 保留最近 50 轮 | keep last 50 turns
const MAX_RECENT_SEGMENTS = 10; // 保留最近 10 个 segment 引用

function createDefaultState(): ConversationalState {
  return {
    sessionStartedAt: Date.now(),
    turns: [],
    referentContext: {
      lastTargetSegmentId: null,
      lastTargetSegmentIndex: null,
      recentSegmentIds: [],
    },
    activeSlotFills: [],
    mode: 'idle',
    consecutiveCommandCount: 0,
  };
}

// ── ConversationalStateManager ─────────────────────────────────────────────────

export class ConversationalStateManager {
  private _state: ConversationalState = createDefaultState();

  /** Get current state (read-only copy) */
  get state(): ConversationalState {
    return { ...this._state };
  }

  /** Get recent turns (last N) */
  getRecentTurns(n = 8): ConversationTurn[] {
    return this._state.turns.slice(-n);
  }

  /** Get current mode */
  get mode(): ConversationTurnMode {
    return this._state.mode;
  }

  /** Get referent for "刚才" / "上一个" style references */
  getLastTarget(): { segmentId: string | null; segmentIndex: number | null } {
    return {
      segmentId: this._state.referentContext.lastTargetSegmentId,
      segmentIndex: this._state.referentContext.lastTargetSegmentIndex,
    };
  }

  /**
   * Record a new turn in the conversation.
   * Call this after each STT result is processed (before executing the intent).
   */
  recordTurn(params: {
    transcript: string;
    intent: VoiceIntent;
    executedAction?: ActionId | null;
    executedTool?: string | null;
    targetSegmentId?: string | null;
    targetSegmentIndex?: number | null;
  }): void {
    const turn: ConversationTurn = {
      transcript: params.transcript,
      intent: params.intent,
      timestamp: Date.now(),
      executedAction: params.executedAction ?? null,
      executedTool: params.executedTool ?? null,
    };

    this._state.turns.push(turn);

    // Trim to max size
    if (this._state.turns.length > MAX_TURNS) {
      this._state.turns = this._state.turns.slice(-MAX_TURNS);
    }

    // Update referent context if a segment was targeted
    if (params.targetSegmentId) {
      this._state.referentContext.lastTargetSegmentId = params.targetSegmentId;
      this._state.referentContext.lastTargetSegmentIndex = params.targetSegmentIndex ?? null;
      this._state.referentContext.recentSegmentIds = [
        params.targetSegmentId,
        ...this._state.referentContext.recentSegmentIds.filter((id) => id !== params.targetSegmentId),
      ].slice(0, MAX_RECENT_SEGMENTS);
    }

    // Update mode based on intent type
    this._updateMode(params.intent);

    // Update consecutive command count
    if (params.intent.type === 'action') {
      this._state.consecutiveCommandCount += 1;
    } else {
      this._state.consecutiveCommandCount = 0;
    }
  }

  /**
   * Resolve a referent pronoun like "刚才", "上一个", "这个".
   * Returns the likely intended segment ID or index, or null if unknown.
   */
  resolveReferent(pronoun: string): { segmentId: string | null; segmentIndex: number | null } {
    const p = pronoun.trim().toLowerCase();

    // "这个" / "当前" / "这句" → lastTargetSegment
    if (/^(这个|当前|这句|这句|这句话)/.test(p)) {
      return { segmentId: this._state.referentContext.lastTargetSegmentId, segmentIndex: this._state.referentContext.lastTargetSegmentIndex };
    }

    // "上一个" / "前一个" / "上一个" → recentSegmentIds[1] (0 is current)
    if (/^(上一|前|previous)/.test(p)) {
      const recent = this._state.referentContext.recentSegmentIds;
      if (recent.length >= 2) {
        return { segmentId: recent[1] ?? null, segmentIndex: null };
      }
      if (recent.length === 1) {
        return { segmentId: recent[0] ?? null, segmentIndex: null };
      }
    }

    // "下一个" / "后一个" → look ahead (not stored, return null)
    if (/^(下一|后|next)/.test(p)) {
      return { segmentId: null, segmentIndex: null };
    }

    // "刚才" / "刚才那个" → last target
    if (/^(刚才|刚刚|刚才的)/.test(p)) {
      return { segmentId: this._state.referentContext.lastTargetSegmentId, segmentIndex: this._state.referentContext.lastTargetSegmentIndex };
    }

    return { segmentId: null, segmentIndex: null };
  }

  /**
   * Start a slot-fill context for a multi-step operation.
   */
  startSlotFill(slotName: string, initialValue = ''): SlotFillContext {
    const ctx: SlotFillContext = {
      slotName,
      value: initialValue,
      filled: false,
      createdAt: Date.now(),
    };
    this._state.activeSlotFills.push(ctx);
    return ctx;
  }

  /**
   * Update a slot-fill context value.
   */
  updateSlotFill(slotName: string, value: string, filled = false): void {
    const ctx = this._state.activeSlotFills.find((s) => s.slotName === slotName);
    if (ctx) {
      ctx.value = value;
      ctx.filled = filled;
    }
  }

  /**
   * Clear a slot-fill context after completion.
   */
  clearSlotFill(slotName: string): void {
    this._state.activeSlotFills = this._state.activeSlotFills.filter((s) => s.slotName !== slotName);
  }

  /**
   * Get active slot fill for a slot name.
   */
  getActiveSlotFill(slotName: string): SlotFillContext | undefined {
    return this._state.activeSlotFills.find((s) => s.slotName === slotName);
  }

  /**
   * Check if we're in a multi-step operation.
   */
  isInMultiStep(): boolean {
    return this._state.activeSlotFills.length > 0 && !this._state.activeSlotFills.every((s) => s.filled);
  }

  /**
   * Reset state for a new session.
   */
  reset(): void {
    this._state = createDefaultState();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _updateMode(intent: VoiceIntent): void {
    switch (intent.type) {
      case 'action':
        this._state.mode = 'command';
        break;
      case 'tool':
        this._state.mode = 'multi-step';
        break;
      case 'slot-fill':
        this._state.mode = 'multi-step';
        break;
      case 'dictation':
        this._state.mode = 'dictation';
        break;
      case 'chat':
        if (this._state.consecutiveCommandCount > 3) {
          this._state.mode = 'command';
        } else {
          this._state.mode = 'chat';
        }
        break;
    }
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────

let _instance: ConversationalStateManager | null = null;

export function getConversationalStateManager(): ConversationalStateManager {
  if (!_instance) {
    _instance = new ConversationalStateManager();
  }
  return _instance;
}

export function createConversationalStateManager(): ConversationalStateManager {
  _instance = new ConversationalStateManager();
  return _instance;
}
