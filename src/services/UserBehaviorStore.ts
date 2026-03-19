/**
 * UserBehaviorStore — 用户画像持久化层
 *
 * 桥接 GlobalContextService（内存）和 userBehaviorDB（IndexedDB）。
 * 职责：
 *  - 启动时从 IndexedDB 恢复用户画像到 GlobalContextService
 *  - 监听 GlobalContextService 的变化，同步持久化到 IndexedDB
 *  - 定期批量写入 action records（避免频繁 IO）
 *
 * @see 解语语音智能体架构设计方案 v2.0 §P0
 */

import { globalContext } from './GlobalContextService';
import {
  loadBehaviorProfile,
  saveBehaviorProfile,
  recordActionToDB,
  pruneOldRecords,
  type UserBehaviorProfileDoc,
} from './userBehaviorDB';
import type { ActionId } from './IntentRouter';

class UserBehaviorStore {
  private static _instance: UserBehaviorStore | null = null;

  static getInstance(): UserBehaviorStore {
    if (!UserBehaviorStore._instance) {
      UserBehaviorStore._instance = new UserBehaviorStore();
    }
    return UserBehaviorStore._instance;
  }

  private _initialized = false;
  /** Batch buffer for action records before flushing to IndexedDB. */
  private _actionBuffer: Array<{
    actionId: ActionId;
    durationMs: number;
    sessionId: string;
    page: 'transcription' | 'glossing' | 'settings' | 'other';
    aiAssisted: boolean;
    voiceConfidence: number | null;
    requiredConfirmation: boolean;
  }> = [];
  private _flushTimer: ReturnType<typeof setTimeout> | null = null;
  private _flushIntervalMs = 5000; // flush every 5s
  private _unsubscribers: Array<() => void> = [];

  // Prevent direct construction
  private constructor() {}

  /** Initialize: load profile from DB and subscribe to changes. */
  async init(): Promise<void> {
    if (this._initialized) return;
    this._initialized = true;

    // 1. Load persisted profile from IndexedDB
    const saved = await loadBehaviorProfile();
    if (saved) {
      globalContext.setBehaviorProfile(profileFromDoc(saved));
    }

    // 2. Subscribe to in-memory profile changes → persist to DB
    const unsubProfile = globalContext.onProfileChange(() => {
      void saveBehaviorProfile(profileToDoc(globalContext.getBehaviorProfile()));
    });
    this._unsubscribers.push(unsubProfile);

    // 3. Start periodic flush for action buffer
    this._startFlushTimer();

    // 4. Prune old records on startup (async, non-blocking)
    void pruneOldRecords();
  }

  /**
   * Record a single action.
   * Buffered — writes to IndexedDB every _flushIntervalMs.
   */
  recordAction(params: {
    actionId: ActionId;
    durationMs: number;
    sessionId: string;
    page?: 'transcription' | 'glossing' | 'settings' | 'other';
    aiAssisted?: boolean;
    voiceConfidence?: number | null;
    requiredConfirmation?: boolean;
  }): void {
    const {
      actionId,
      durationMs,
      sessionId,
      page = 'transcription',
      aiAssisted = false,
      voiceConfidence = null,
      requiredConfirmation = false,
    } = params;

    // Update in-memory profile (fast path)
    globalContext.recordAction(actionId, durationMs, sessionId);

    // Buffer for IndexedDB (batch write)
    this._actionBuffer.push({
      actionId,
      durationMs,
      sessionId,
      page,
      aiAssisted,
      voiceConfidence,
      requiredConfirmation,
    });

    // Trigger immediate flush if buffer is getting large
    if (this._actionBuffer.length >= 50) {
      void this.flush();
    }
  }

  /**
   * Force flush the action buffer to IndexedDB.
   */
  async flush(): Promise<void> {
    if (this._actionBuffer.length === 0) return;

    const batch = this._actionBuffer.splice(0, this._actionBuffer.length);

    await Promise.allSettled(
      batch.map((record) =>
        recordActionToDB({
          ...record,
          timestamp: Date.now(),
        }),
      ),
    );
  }

  private _startFlushTimer(): void {
    this._flushTimer = setInterval(() => {
      void this.flush();
    }, this._flushIntervalMs);
  }

  /** Cleanup — call when app unloads. */
  dispose(): void {
    if (this._flushTimer !== null) {
      clearInterval(this._flushTimer);
      this._flushTimer = null;
    }
    this._unsubscribers.forEach((unsub) => unsub());
    this._unsubscribers = [];
    void this.flush(); // final flush
    this._initialized = false;
  }
}

// ── Mappers (Doc ↔ Domain) ───────────────────────────────────────────────────

function profileFromDoc(doc: UserBehaviorProfileDoc) {
  return {
    actionFrequencies: doc.actionFrequencies,
    actionDurations: doc.actionDurationsMs,
    fatigue: {
      score: doc.fatigueScore,
      speakingRateTrend: doc.speakingRateTrend,
      pauseFrequencyTrend: doc.pauseFrequencyTrend,
      lastBreakAt: doc.lastBreakAt,
    },
    preferences: doc.preferences,
    taskDurations: doc.taskDurationsMs,
    usageTimeDistribution: doc.usageTimeDistribution,
    totalSessions: doc.totalSessions,
    lastSessionAt: doc.lastSessionAt,
  };
}

function profileToDoc(profile: ReturnType<typeof globalContext.getBehaviorProfile>): UserBehaviorProfileDoc {
  return {
    id: 'current',
    actionFrequencies: profile.actionFrequencies,
    actionDurationsMs: profile.actionDurations,
    fatigueScore: profile.fatigue.score,
    speakingRateTrend: profile.fatigue.speakingRateTrend,
    pauseFrequencyTrend: profile.fatigue.pauseFrequencyTrend,
    lastBreakAt: profile.fatigue.lastBreakAt,
    preferences: profile.preferences,
    taskDurationsMs: profile.taskDurations,
    usageTimeDistribution: profile.usageTimeDistribution,
    totalSessions: profile.totalSessions,
    lastSessionAt: profile.lastSessionAt,
    updatedAt: Date.now(),
  };
}

// ── Singleton export ────────────────────────────────────────────────────────

export const userBehaviorStore = UserBehaviorStore.getInstance();
