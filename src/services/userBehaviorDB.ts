/**
 * userBehaviorDB — 用户行为数据持久化（独立 Dexie 实例）
 *
 * 与主 JieyuDB 分离，避免行为数据污染核心语料库。
 * 包含：
 *   - 原始操作记录（每条 action 独立存储）
 *   - 聚合后的用户画像快照
 *
 * @see 解语语音智能体架构设计方案 v2.0 §P0
 */

import Dexie, { type Table } from 'dexie';
import type { ActionId } from './IntentRouter';

// ── Document Types ─────────────────────────────────────────────────────────

/** Raw action execution record — one row per action invocation. */
export interface ActionRecordDoc {
  id?: number; // auto-increment
  actionId: ActionId;
  /** Duration in milliseconds (for navigation/editing actions). */
  durationMs: number;
  timestamp: number;
  sessionId: string;
  /** Page or context where action was invoked. */
  page: 'transcription' | 'glossing' | 'settings' | 'other';
  /** Whether this action was AI-assisted (e.g., auto_gloss). */
  aiAssisted: boolean;
  /** Confidence score if from voice command (0-1). */
  voiceConfidence: number | null;
  /** True if user had to confirm this action (safe mode / fuzzy match). */
  requiredConfirmation: boolean;
}

/** Aggregated user behavior profile snapshot. */
export interface UserBehaviorProfileDoc {
  id: string; // always 'current'
  actionFrequencies: Partial<Record<ActionId, number>>;
  actionDurationsMs: Partial<Record<ActionId, number>>;
  fatigueScore: number;
  speakingRateTrend: 'accelerating' | 'stable' | 'decelerating';
  pauseFrequencyTrend: 'increasing' | 'stable' | 'decreasing';
  lastBreakAt: number;
  preferences: {
    preferredMode: 'command' | 'dictation' | 'analysis';
    safeModeDefault: boolean;
    wakeWordEnabled: boolean;
    preferredEngine: 'web-speech' | 'whisper-local' | 'commercial';
    preferredLang: string | null;
    confirmationThreshold: 'always' | 'destructive' | 'never';
  };
  taskDurationsMs: Partial<Record<string, number>>;
  usageTimeDistribution: number[];
  totalSessions: number;
  lastSessionAt: number;
  updatedAt: number;
}

/** Task phase duration record. */
export interface TaskPhaseRecordDoc {
  id?: number;
  phase: 'importing' | 'transcribing' | 'annotating' | 'translating' | 'reviewing' | 'exporting';
  startedAt: number;
  endedAt: number;
  segmentsProcessed: number;
  sessionId: string;
}

/** Difficult segment record — segments where user spent abnormal time. */
export interface DifficultSegmentDoc {
  id?: number;
  segmentId: string;
  editCount: number;
  revertCount: number;
  dwellTimeMs: number;
  aiAssistanceRequested: boolean;
  difficultyScore: number; // 0-1, computed
  sessionId: string;
  recordedAt: number;
}

// ── Database Class ──────────────────────────────────────────────────────────

const BEHAVIOR_DB_NAME = 'jieyu-user-behavior';

class UserBehaviorDexie extends Dexie {
  actionRecords!: Table<ActionRecordDoc>;
  userBehaviorProfiles!: Table<UserBehaviorProfileDoc>;
  taskPhaseRecords!: Table<TaskPhaseRecordDoc>;
  difficultSegments!: Table<DifficultSegmentDoc>;

  constructor() {
    super(BEHAVIOR_DB_NAME);

    this.version(1).stores({
      // actionRecords: auto-increment id, indexed by actionId and timestamp
      actionRecords: '++id, actionId, timestamp, sessionId, page, [timestamp+sessionId]',
      // userBehaviorProfiles: singleton, id='current'
      userBehaviorProfiles: 'id',
      // taskPhaseRecords: track time spent in each task phase
      taskPhaseRecords: '++id, phase, startedAt, sessionId',
      // difficultSegments: track segments that took unusually long
      difficultSegments: '++id, segmentId, sessionId, difficultyScore, recordedAt',
    });
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────

let _instance: UserBehaviorDexie | null = null;

export function getUserBehaviorDB(): UserBehaviorDexie {
  if (!_instance) {
    _instance = new UserBehaviorDexie();
  }
  return _instance;
}

export const userBehaviorDB = getUserBehaviorDB();

// ── Convenience helpers ────────────────────────────────────────────────────

/**
 * Persist a single action record.
 * Called frequently — errors are silently ignored to avoid impacting UX.
 */
export async function recordActionToDB(record: Omit<ActionRecordDoc, 'id'>): Promise<void> {
  try {
    await userBehaviorDB.actionRecords.add(record as ActionRecordDoc);
  } catch {
    // IndexedDB unavailable — silently skip
  }
}

/**
 * Load the current user behavior profile from DB.
 */
export async function loadBehaviorProfile(): Promise<UserBehaviorProfileDoc | undefined> {
  try {
    return await userBehaviorDB.userBehaviorProfiles.get('current');
  } catch {
    return undefined;
  }
}

/**
 * Persist the current user behavior profile to DB.
 */
export async function saveBehaviorProfile(profile: UserBehaviorProfileDoc): Promise<void> {
  try {
    await userBehaviorDB.userBehaviorProfiles.put({ ...profile, updatedAt: Date.now() });
  } catch {
    // IndexedDB unavailable — silently skip
  }
}

/**
 * Prune old action records to prevent unbounded growth.
 * Keeps the most recent MAX_RECORDS records.
 */
const MAX_RECORDS = 10_000;

export async function pruneOldRecords(): Promise<void> {
  try {
    const count = await userBehaviorDB.actionRecords.count();
    if (count <= MAX_RECORDS) return;

    // Delete oldest records beyond MAX_RECORDS
    const oldestToKeep = await userBehaviorDB.actionRecords
      .orderBy('timestamp')
      .reverse()
      .limit(MAX_RECORDS)
      .last();

    if (oldestToKeep) {
      await userBehaviorDB.actionRecords
        .where('timestamp')
        .below(oldestToKeep.timestamp)
        .delete();
    }
  } catch {
    // Silently skip
  }
}

/**
 * Get action records for a time range.
 */
export async function getActionRecordsInRange(
  startMs: number,
  endMs: number,
): Promise<ActionRecordDoc[]> {
  try {
    return await userBehaviorDB.actionRecords
      .where('timestamp')
      .between(startMs, endMs)
      .toArray();
  } catch {
    return [];
  }
}

/**
 * Record a task phase completion.
 */
export async function recordTaskPhase(record: Omit<TaskPhaseRecordDoc, 'id'>): Promise<void> {
  try {
    await userBehaviorDB.taskPhaseRecords.add(record as TaskPhaseRecordDoc);
  } catch {
    // Silently skip
  }
}

/**
 * Record a difficult segment.
 */
export async function recordDifficultSegment(record: Omit<DifficultSegmentDoc, 'id'>): Promise<void> {
  try {
    await userBehaviorDB.difficultSegments.add(record as DifficultSegmentDoc);
  } catch {
    // Silently skip
  }
}

/**
 * Get task phase records for a time range.
 */
export async function getTaskPhaseRecordsInRange(
  startMs: number,
  endMs: number,
): Promise<TaskPhaseRecordDoc[]> {
  try {
    return await userBehaviorDB.taskPhaseRecords
      .where('startedAt')
      .between(startMs, endMs)
      .toArray();
  } catch {
    return [];
  }
}

/**
 * Get difficult segments for a time range.
 */
export async function getDifficultSegmentsInRange(
  startMs: number,
  endMs: number,
): Promise<DifficultSegmentDoc[]> {
  try {
    return await userBehaviorDB.difficultSegments
      .where('recordedAt')
      .between(startMs, endMs)
      .toArray();
  } catch {
    return [];
  }
}
