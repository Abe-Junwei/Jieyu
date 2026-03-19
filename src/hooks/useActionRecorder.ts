/**
 * useActionRecorder — 操作记录 Hook
 *
 * 将 KeybindingService 的 executeAction 包装为带计时的版本，
 * 自动记录每一次操作到 GlobalContextService + UserBehaviorStore。
 *
 * 使用方式：
 *   const { executeAction } = useActionRecorder({
 *     executeAction: originalExecuteAction,
 *     sessionId: currentSessionId,
 *     page: 'transcription',
 *   });
 *
 * @see 解语语音智能体架构设计方案 v2.0 §P0
 */

import { useCallback } from 'react';
import { userBehaviorStore } from '../services/UserBehaviorStore';
import type { ActionId } from '../services/IntentRouter';

export interface UseActionRecorderOptions {
  /** The original executeAction function from KeybindingService. */
  executeAction: (actionId: ActionId) => void;
  /** Unique identifier for the current user session. */
  sessionId: string;
  /** Which page the action was performed on. */
  page?: 'transcription' | 'glossing' | 'settings' | 'other';
  /**
   * If the action was triggered by an AI suggestion (vs direct user action).
   * AI-assisted actions are tracked separately for adoption rate analysis.
   */
  aiAssisted?: boolean;
  /**
   * Voice command confidence if the action came from voice input (0-1).
   */
  voiceConfidence?: number | null;
  /**
   * Whether this action required user confirmation (e.g., destructive in safe mode,
   * or fuzzy match).
   */
  requiredConfirmation?: boolean;
}

export interface UseActionRecorderReturn {
  /**
   * Wrapped executeAction — call this instead of the raw executeAction.
   * Automatically records timing and metadata to the behavior store.
   */
  executeAction: (actionId: ActionId) => void;
  /**
   * Directly record an action with custom duration (for async operations
   * where you want to manually measure time).
   */
  recordAction: (actionId: ActionId, durationMs: number) => void;
}

/**
 * Hook that wraps executeAction with automatic timing and metadata recording.
 *
 * For synchronous actions (e.g., navPrev, playPause):
 *   Wrapped executeAction records the time from call to completion automatically.
 *
 * For asynchronous actions (e.g., auto_gloss which involves LLM call):
 *   Use `recordAction(actionId, durationMs)` to manually record the duration.
 */
export function useActionRecorder(options: UseActionRecorderOptions): UseActionRecorderReturn {
  const {
    executeAction: originalExecuteAction,
    sessionId,
    page = 'transcription',
    aiAssisted = false,
    voiceConfidence = null,
    requiredConfirmation = false,
  } = options;

  /**
   * Wrapped executeAction that auto-records timing.
   * Duration is measured from call to when the microtask queue drains.
   * For async operations (LLM calls), use `recordAction()` separately.
   */
  const executeAction = useCallback(
    (actionId: ActionId) => {
      const startTime = performance.now();

      // Call the original action
      originalExecuteAction(actionId);

      // Measure duration until the call stack clears
      queueMicrotask(() => {
        const duration = performance.now() - startTime;

        userBehaviorStore.recordAction({
          actionId,
          durationMs: Math.round(duration),
          sessionId,
          page,
          aiAssisted,
          voiceConfidence,
          requiredConfirmation,
        });
      });
    },
    [originalExecuteAction, sessionId, page, aiAssisted, voiceConfidence, requiredConfirmation],
  );

  /**
   * Manually record an action with a specific duration.
   * Use this for async operations where the duration spans multiple frames/seconds.
   *
   * @example
   *   const start = performance.now();
   *   await autoGlossUtterance(segmentId);
   *   recordAction('autoGloss', performance.now() - start);
   */
  const recordAction = useCallback(
    (actionId: ActionId, durationMs: number) => {
      userBehaviorStore.recordAction({
        actionId,
        durationMs: Math.round(durationMs),
        sessionId,
        page,
        aiAssisted,
        voiceConfidence,
        requiredConfirmation,
      });
    },
    [sessionId, page, aiAssisted, voiceConfidence, requiredConfirmation],
  );

  return { executeAction, recordAction };
}

/**
 * Helper to get or create a stable session ID for the current browser session.
 * Stored in sessionStorage so it survives page navigations but not across tabs.
 */
export function getOrCreateSessionId(): string {
  const SESSION_KEY = 'jieyu.voice.sessionId';
  let sessionId = sessionStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, sessionId);
  }
  return sessionId;
}
