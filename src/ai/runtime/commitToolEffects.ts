/**
 * A10.3 — unique session/localToolState commit point after a tool result.
 * Does not write projectFacts / long-term memory.
 */

import { patchSessionMemoryPreferences } from '../chat/sessionMemory';
import type { AiChatToolName, AiSessionMemory } from '../chat/chatDomain.types';
import type { LocalContextToolCall } from '../chat/localContextToolTypes';
import { buildLocalToolStatePatchFromCallResult } from '../chat/resolvers/statePatch';

export interface CommitToolEffectsContext {
  sessionMemory: AiSessionMemory;
  updateSessionMemory: (nextMemory: AiSessionMemory) => void;
  persistSessionMemory: (memory: AiSessionMemory) => void;
}

export type CommitToolEffectsInput =
  | {
      kind: 'chat_tool';
      toolName: AiChatToolName;
      language?: string;
      layerId?: string;
    }
  | {
      kind: 'local_context';
      callResults: ReadonlyArray<{
        call: LocalContextToolCall;
        ok: boolean;
        result: unknown;
      }>;
    };

export function applyChatToolPreferenceEffects(
  sessionMemory: AiSessionMemory,
  toolName: AiChatToolName,
  language?: string,
  layerId?: string,
): AiSessionMemory {
  let next: AiSessionMemory = patchSessionMemoryPreferences(
    { ...sessionMemory, lastToolName: toolName },
    { lastToolName: toolName },
  );
  if (language) {
    next = patchSessionMemoryPreferences(
      { ...next, lastLanguage: language },
      { lastLanguage: language },
    );
  }
  if (layerId) {
    next = patchSessionMemoryPreferences(
      { ...next, lastLayerId: layerId },
      { lastLayerId: layerId },
    );
  }
  return next;
}

export function applyLocalContextToolEffects(
  sessionMemory: AiSessionMemory,
  callResults: ReadonlyArray<{
    call: LocalContextToolCall;
    ok: boolean;
    result: unknown;
  }>,
): AiSessionMemory {
  const base = sessionMemory.localToolState ?? {
    updatedAt: new Date().toISOString(),
  };
  const merged = { ...base };
  for (const item of callResults) {
    const patch = buildLocalToolStatePatchFromCallResult(item.call, {
      ok: item.ok,
      result: item.result,
    });
    if (patch.lastIntent) merged.lastIntent = patch.lastIntent;
    if (patch.lastQuery) merged.lastQuery = patch.lastQuery;
    if (patch.clearLastQuery) delete merged.lastQuery;
    if (patch.lastScope) merged.lastScope = patch.lastScope;
    if (patch.lastFrame) merged.lastFrame = patch.lastFrame;
    if (patch.lastResultUnitIds !== undefined) {
      merged.lastResultUnitIds = patch.lastResultUnitIds;
    }
  }
  merged.updatedAt = new Date().toISOString();
  return {
    ...sessionMemory,
    localToolState: merged,
  };
}

export function commitToolEffects(
  ctx: CommitToolEffectsContext,
  input: CommitToolEffectsInput,
): AiSessionMemory {
  const previousFacts = ctx.sessionMemory.projectFacts;
  const next =
    input.kind === 'chat_tool'
      ? applyChatToolPreferenceEffects(
          ctx.sessionMemory,
          input.toolName,
          input.language,
          input.layerId,
        )
      : applyLocalContextToolEffects(ctx.sessionMemory, input.callResults);

  if (next.projectFacts !== previousFacts) {
    throw new Error('commitToolEffects must not write projectFacts');
  }

  ctx.updateSessionMemory(next);
  ctx.persistSessionMemory(next);
  return next;
}
