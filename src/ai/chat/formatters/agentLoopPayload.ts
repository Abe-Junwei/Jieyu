/**
 * agentLoopPayload — Agent loop multi-step payload budget control and truncation
 * Extracted from localContextToolFormatters.ts
 */

import {
  AI_AGENT_LOOP_DEEP_STRING_MAX_CHARS_PASS1,
  AI_AGENT_LOOP_DEEP_STRING_MAX_CHARS_PASS2,
  AI_AGENT_LOOP_MATCH_TRANSCRIPTION_PREVIEW_MAX_CHARS,
  AI_AGENT_LOOP_PAYLOAD_SHRINK_MAX_STEPS,
  AI_AGENT_LOOP_USER_REQUEST_MAX_CHARS,
  AI_LOCAL_TOOL_RESULT_CHAR_BUDGET,
} from '../../../hooks/ai/useAiChat.config';
import { createMetricTags, recordMetric } from '../../../observability/metrics';
import type { LocalContextToolResult } from '../localContextToolTypes';

/** @see AI_LOCAL_TOOL_RESULT_CHAR_BUDGET in `useAiChat.config.ts` */
const LOCAL_TOOL_RESULT_CHAR_BUDGET = AI_LOCAL_TOOL_RESULT_CHAR_BUDGET;

/** Appended when a local tool result summary is truncated for length. */
export const TOOL_RESULT_TRUNCATION_WARNING =
  '\n\nNote: some internal details were omitted because the result was too long. 如需更具体结果，请告诉我缩小查询范围。';

export function applyLocalToolResultCharBudget(
  payload: string,
  meta: { scope: 'single' | 'batch' | 'agent_loop'; toolName?: string },
): { limitedPayload: string; truncated: boolean } {
  const truncated = payload.length > LOCAL_TOOL_RESULT_CHAR_BUDGET;
  if (truncated) {
    recordMetric({
      id: 'ai.local_tool_result_truncated',
      value: 1,
      tags: createMetricTags('localContextTools', {
        scope: meta.scope,
        ...(meta.toolName !== undefined ? { toolName: meta.toolName } : {}),
        payloadChars: payload.length,
      }),
    });
  }
  const limitedPayload = truncated
    ? `${payload.slice(0, LOCAL_TOOL_RESULT_CHAR_BUDGET)}...`
    : payload;
  return { limitedPayload, truncated };
}

function cloneLocalToolResultsForAgentLoop(
  results: LocalContextToolResult[],
): LocalContextToolResult[] {
  return JSON.parse(JSON.stringify(results)) as LocalContextToolResult[];
}

function agentLoopContinuationPayloadJson(
  cappedUserRequest: string,
  results: LocalContextToolResult[],
  step: number,
): string {
  return JSON.stringify({
    type: 'local_tool_result',
    step,
    originalUserRequest: cappedUserRequest,
    results,
  });
}

function truncateMatchTranscriptionsForAgentLoop(results: LocalContextToolResult[]): boolean {
  let changed = false;
  for (const item of results) {
    if (
      !item.ok ||
      item.result === null ||
      typeof item.result !== 'object' ||
      Array.isArray(item.result)
    )
      continue;
    const body = item.result as Record<string, unknown>;
    const matches = body.matches;
    if (!Array.isArray(matches)) continue;
    for (const m of matches) {
      if (!m || typeof m !== 'object' || Array.isArray(m)) continue;
      const row = m as Record<string, unknown>;
      const t = row.transcription;
      if (typeof t === 'string' && t.length > AI_AGENT_LOOP_MATCH_TRANSCRIPTION_PREVIEW_MAX_CHARS) {
        row.transcription = `${t.slice(0, AI_AGENT_LOOP_MATCH_TRANSCRIPTION_PREVIEW_MAX_CHARS)}…`;
        changed = true;
      }
    }
  }
  return changed;
}

function popLongestMatchesRowForAgentLoop(results: LocalContextToolResult[]): boolean {
  let bestIdx = -1;
  let bestLen = -1;
  for (let i = 0; i < results.length; i += 1) {
    const item = results[i]!;
    if (
      !item.ok ||
      item.result === null ||
      typeof item.result !== 'object' ||
      Array.isArray(item.result)
    )
      continue;
    const matches = (item.result as Record<string, unknown>).matches;
    if (Array.isArray(matches) && matches.length > bestLen) {
      bestLen = matches.length;
      bestIdx = i;
    }
  }
  if (bestIdx < 0 || bestLen <= 0) return false;
  const matches = (results[bestIdx]!.result as Record<string, unknown>).matches as unknown[];
  matches.pop();
  return true;
}

function truncateDeepStringsForAgentLoop(value: unknown, maxLen: number): void {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const el of value) truncateDeepStringsForAgentLoop(el, maxLen);
    return;
  }
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (typeof v === 'string' && v.length > maxLen) {
      obj[key] = `${v.slice(0, maxLen)}…`;
    } else {
      truncateDeepStringsForAgentLoop(v, maxLen);
    }
  }
}

/**
 * Fits `local_tool_result` JSON (agent loop continuation) under {@link LOCAL_TOOL_RESULT_CHAR_BUDGET}
 * while keeping valid JSON: trim `matches[].transcription`, drop tail `matches`, then deep-string trim.
 * Records `ai.local_tool_result_truncated` when any shrink was applied.
 */
export function buildAgentLoopContinuationToolPayload(
  originalUserText: string,
  localToolResults: LocalContextToolResult[],
  step: number,
  charBudget = LOCAL_TOOL_RESULT_CHAR_BUDGET,
): {
  payloadJson: string;
  truncated: boolean;
  originalPayloadChars: number;
  cappedUserRequest: string;
} {
  const cappedUserRequest =
    originalUserText.length <= AI_AGENT_LOOP_USER_REQUEST_MAX_CHARS
      ? originalUserText
      : `${originalUserText.slice(0, AI_AGENT_LOOP_USER_REQUEST_MAX_CHARS)}…`;
  const userRequestWasCapped = cappedUserRequest !== originalUserText;

  const working = cloneLocalToolResultsForAgentLoop(localToolResults);
  const originalPayloadChars = agentLoopContinuationPayloadJson(
    cappedUserRequest,
    working,
    step,
  ).length;
  if (originalPayloadChars <= charBudget) {
    if (userRequestWasCapped) {
      recordMetric({
        id: 'ai.local_tool_result_truncated',
        value: 1,
        tags: createMetricTags('localContextTools', {
          scope: 'agent_loop',
          payloadChars: originalPayloadChars,
        }),
      });
    }
    return {
      payloadJson: agentLoopContinuationPayloadJson(cappedUserRequest, working, step),
      truncated: userRequestWasCapped,
      originalPayloadChars,
      cappedUserRequest,
    };
  }

  let truncated = userRequestWasCapped;
  let steps = 0;
  while (
    agentLoopContinuationPayloadJson(cappedUserRequest, working, step).length > charBudget &&
    steps < AI_AGENT_LOOP_PAYLOAD_SHRINK_MAX_STEPS
  ) {
    steps += 1;
    truncated = true;
    if (truncateMatchTranscriptionsForAgentLoop(working)) continue;
    if (popLongestMatchesRowForAgentLoop(working)) continue;
    break;
  }

  if (agentLoopContinuationPayloadJson(cappedUserRequest, working, step).length > charBudget) {
    truncated = true;
    truncateDeepStringsForAgentLoop(working, AI_AGENT_LOOP_DEEP_STRING_MAX_CHARS_PASS1);
  }
  if (agentLoopContinuationPayloadJson(cappedUserRequest, working, step).length > charBudget) {
    truncateDeepStringsForAgentLoop(working, AI_AGENT_LOOP_DEEP_STRING_MAX_CHARS_PASS2);
  }

  const finalJson = agentLoopContinuationPayloadJson(cappedUserRequest, working, step);
  if (finalJson.length > charBudget) {
    truncated = true;
    const minimal: LocalContextToolResult[] = working.map((r) => ({
      ok: r.ok,
      name: r.name,
      result: r.ok ? { _agentLoopPayloadTooLarge: true, tool: r.name } : r.result,
      ...(r.error !== undefined ? { error: r.error } : {}),
    }));
    const fallbackJson = agentLoopContinuationPayloadJson(cappedUserRequest, minimal, step);
    recordMetric({
      id: 'ai.local_tool_result_truncated',
      value: 1,
      tags: createMetricTags('localContextTools', {
        scope: 'agent_loop',
        payloadChars: originalPayloadChars,
      }),
    });
    return { payloadJson: fallbackJson, truncated, originalPayloadChars, cappedUserRequest };
  }

  if (truncated) {
    recordMetric({
      id: 'ai.local_tool_result_truncated',
      value: 1,
      tags: createMetricTags('localContextTools', {
        scope: 'agent_loop',
        payloadChars: originalPayloadChars,
      }),
    });
  }

  return { payloadJson: finalJson, truncated, originalPayloadChars, cappedUserRequest };
}
