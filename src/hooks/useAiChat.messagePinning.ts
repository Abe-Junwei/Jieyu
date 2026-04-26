import { setSessionMemoryMessagePinned } from '../ai/chat/sessionMemory';
import { applyUserDirectivesToSessionMemory } from '../ai/memory/userDirectiveRegistry';
import { extractUserDirectives } from '../ai/memory/userDirectiveExtractor';
import type { AiSessionMemory, UiChatMessage } from './useAiChat.types';
import { nowIso } from './useAiChat.helpers';

type ResponseLanguage = 'auto' | 'zh-CN' | 'en';
type ResponseStyle = 'concise' | 'detailed';
type ResponseFormat = 'bullets' | 'prose' | 'steps' | 'evidence_first';
type ToolScope = 'project' | 'current_track' | 'current_scope';
type ToolAutoExecute = 'allow' | 'ask_first' | 'never';

function isResponseLanguage(value: unknown): value is ResponseLanguage {
  return value === 'auto' || value === 'zh-CN' || value === 'en';
}

function isResponseStyle(value: unknown): value is ResponseStyle {
  return value === 'concise' || value === 'detailed';
}

function isResponseFormat(value: unknown): value is ResponseFormat {
  return value === 'bullets' || value === 'prose' || value === 'steps' || value === 'evidence_first';
}

function isToolScope(value: unknown): value is ToolScope {
  return value === 'project' || value === 'current_track' || value === 'current_scope';
}

function isToolAutoExecute(value: unknown): value is ToolAutoExecute {
  return value === 'allow' || value === 'ask_first' || value === 'never';
}

function rebuildDirectivePreferencesFromLedger(memory: AiSessionMemory): AiSessionMemory {
  const entries = memory.directiveLedger ?? [];
  const response: {
    language?: ResponseLanguage;
    style?: ResponseStyle;
    format?: ResponseFormat;
    evidenceRequired?: boolean;
  } = {};
  const tool: {
    defaultScope?: ToolScope;
    autoExecute?: ToolAutoExecute;
    preferLocalReads?: boolean;
  } = {};
  const safety: NonNullable<AiSessionMemory['safetyPreferences']> = {};
  const terminology: NonNullable<AiSessionMemory['terminologyPreferences']> = [];

  for (const entry of entries) {
    if (entry.action !== 'accepted' || !entry.targetPath) continue;
    if (entry.targetPath === 'responsePreferences.language' && isResponseLanguage(entry.value)) response.language = entry.value;
    if (entry.targetPath === 'responsePreferences.style' && isResponseStyle(entry.value)) response.style = entry.value;
    if (entry.targetPath === 'responsePreferences.format' && isResponseFormat(entry.value)) response.format = entry.value;
    if (entry.targetPath === 'responsePreferences.evidenceRequired' && typeof entry.value === 'boolean') response.evidenceRequired = entry.value;
    if (entry.targetPath === 'toolPreferences.defaultScope' && isToolScope(entry.value)) tool.defaultScope = entry.value;
    if (entry.targetPath === 'toolPreferences.autoExecute' && isToolAutoExecute(entry.value)) tool.autoExecute = entry.value;
    if (entry.targetPath === 'toolPreferences.preferLocalReads' && typeof entry.value === 'boolean') tool.preferLocalReads = entry.value;
    if (entry.targetPath === 'safetyPreferences.denyDestructive' && typeof entry.value === 'boolean') safety.denyDestructive = entry.value;
    if (entry.targetPath === 'safetyPreferences.denyBatch' && typeof entry.value === 'boolean') safety.denyBatch = entry.value;
    if (entry.targetPath === 'safetyPreferences.requireImpactPreview' && typeof entry.value === 'boolean') safety.requireImpactPreview = entry.value;
    if (entry.targetPath === 'terminologyPreferences' && typeof entry.value === 'string') {
      const [source, target] = entry.value.split('=>');
      if (source && target) {
        const sourceTrimmed = source.trim();
        const targetTrimmed = target.trim();
        if (sourceTrimmed && targetTrimmed) {
          const existingIdx = terminology.findIndex((item) => item.source.toLocaleLowerCase() === sourceTrimmed.toLocaleLowerCase());
          const nextItem = { source: sourceTrimmed, target: targetTrimmed, createdAt: entry.createdAt };
          if (existingIdx >= 0) terminology[existingIdx] = nextItem;
          else terminology.push(nextItem);
        }
      }
    }
  }

  const {
    responsePreferences: _responsePreferences,
    toolPreferences: _toolPreferences,
    safetyPreferences: _safetyPreferences,
    terminologyPreferences: _terminologyPreferences,
    ...restMemory
  } = memory;
  return {
    ...restMemory,
    ...(Object.keys(response).length > 0 ? { responsePreferences: response } : {}),
    ...(Object.keys(tool).length > 0 ? { toolPreferences: tool } : {}),
    ...(Object.keys(safety).length > 0 ? { safetyPreferences: safety } : {}),
    ...(terminology.length > 0 ? { terminologyPreferences: terminology.slice(-80) } : {}),
  };
}

function stripPinnedMessageDirectiveEffects(memory: AiSessionMemory): AiSessionMemory {
  const directiveLedger = (memory.directiveLedger ?? []).filter((entry) => entry.source !== 'pinned_message');
  const sessionDirectives = (memory.sessionDirectives ?? []).filter((entry) => entry.source !== 'pinned_message');
  const {
    directiveLedger: _directiveLedger,
    sessionDirectives: _sessionDirectives,
    pinnedDirectiveRefs: _pinnedDirectiveRefs,
    responsePreferences: _responsePreferences,
    toolPreferences: _toolPreferences,
    safetyPreferences: _safetyPreferences,
    terminologyPreferences: _terminologyPreferences,
    ...restMemory
  } = memory;
  const baseline: AiSessionMemory = {
    ...restMemory,
    ...(directiveLedger.length > 0 ? { directiveLedger } : {}),
    ...(sessionDirectives.length > 0 ? { sessionDirectives } : {}),
  };
  return rebuildDirectivePreferencesFromLedger(baseline);
}

export function resolvePinnedMessageSessionMemory(
  memory: AiSessionMemory,
  messages: readonly UiChatMessage[],
  messageId: string,
): AiSessionMemory {
  const normalizedMessageId = messageId.trim();
  if (!normalizedMessageId) return memory;
  const currentlyPinned = (memory.pinnedMessageIds ?? []).includes(normalizedMessageId);
  let nextMemory = setSessionMemoryMessagePinned(memory, normalizedMessageId, !currentlyPinned);
  if (!currentlyPinned) {
    const message = messages.find((item) => item.id === normalizedMessageId);
    if (!message) return nextMemory;
    nextMemory = {
      ...nextMemory,
      pinnedMessageDigests: [
        ...(nextMemory.pinnedMessageDigests ?? []).filter((item) => item.messageId !== normalizedMessageId),
        { messageId: normalizedMessageId, role: message.role, content: message.content, createdAt: nowIso() },
      ].slice(-24),
    };
    if (message.role !== 'user') return nextMemory;
    const application = applyUserDirectivesToSessionMemory(nextMemory, extractUserDirectives({
      userText: message.content,
      source: 'pinned_message',
      sourceMessageId: normalizedMessageId,
    }));
    return {
      ...application.nextMemory,
      pinnedDirectiveRefs: [
        ...(application.nextMemory.pinnedDirectiveRefs ?? []),
        ...application.ledgerEntries.filter((entry) => entry.action === 'accepted').map((entry) => entry.id),
      ].slice(-24),
    };
  }
  const memoryWithoutPinned = stripPinnedMessageDirectiveEffects({
    ...nextMemory,
    pinnedMessageDigests: (nextMemory.pinnedMessageDigests ?? []).filter((item) => item.messageId !== normalizedMessageId),
  });
  const pinnedIds = new Set(memoryWithoutPinned.pinnedMessageIds ?? []);
  const messageById = new Map(messages.map((item) => [item.id, item] as const));
  const replayInputs = (memoryWithoutPinned.pinnedMessageDigests ?? [])
    .filter((item) => item.role === 'user' && pinnedIds.has(item.messageId))
    .map((item) => ({ messageId: item.messageId, content: item.content }));
  for (const pinnedId of pinnedIds) {
    if (replayInputs.some((item) => item.messageId === pinnedId)) continue;
    const fallbackMessage = messageById.get(pinnedId);
    if (!fallbackMessage || fallbackMessage.role !== 'user') continue;
    replayInputs.push({ messageId: pinnedId, content: fallbackMessage.content });
  }
  let rebuiltMemory = memoryWithoutPinned;
  for (const replayInput of replayInputs) {
    const application = applyUserDirectivesToSessionMemory(rebuiltMemory, extractUserDirectives({
      userText: replayInput.content,
      source: 'pinned_message',
      sourceMessageId: replayInput.messageId,
    }));
    rebuiltMemory = {
      ...application.nextMemory,
      pinnedDirectiveRefs: [
        ...(application.nextMemory.pinnedDirectiveRefs ?? []),
        ...application.ledgerEntries.filter((entry) => entry.action === 'accepted').map((entry) => entry.id),
      ].slice(-24),
    };
  }
  return rebuiltMemory;
}
