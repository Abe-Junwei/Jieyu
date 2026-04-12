import { createLogger } from '../../observability/logger';
import type { AiSessionMemory } from '../../hooks/useAiChat';

const AI_SESSION_MEMORY_STORAGE_KEY = 'jieyu.aiChat.sessionMemory';
const log = createLogger('aiChatSessionMemory');
const MAX_SUMMARY_CHAIN_LENGTH = 24;
const MAX_PINNED_MESSAGE_IDS = 80;
const SUMMARY_WARNING_DEFAULT_THRESHOLD = 0.85;

function nowIso(): string {
  return new Date().toISOString();
}

function newSummaryEntryId(): string {
  return `sum_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeSummaryChain(memory: AiSessionMemory): AiSessionMemory['summaryChain'] {
  const chain = memory.summaryChain;
  if (!Array.isArray(chain) || chain.length === 0) return undefined;

  const normalized = chain
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const summary = typeof entry.summary === 'string' ? entry.summary.trim() : '';
      if (!summary) return null;
      const coveredTurnCount = typeof entry.coveredTurnCount === 'number' && Number.isFinite(entry.coveredTurnCount)
        ? Math.max(0, Math.floor(entry.coveredTurnCount))
        : 0;
      return {
        id: typeof entry.id === 'string' && entry.id.trim().length > 0 ? entry.id : newSummaryEntryId(),
        summary,
        coveredTurnCount,
        createdAt: typeof entry.createdAt === 'string' && entry.createdAt.trim().length > 0 ? entry.createdAt : nowIso(),
        ...(typeof entry.similarityScore === 'number' && Number.isFinite(entry.similarityScore)
          ? { similarityScore: entry.similarityScore }
          : {}),
        ...(entry.qualityWarning === true ? { qualityWarning: true } : {}),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .slice(-MAX_SUMMARY_CHAIN_LENGTH);

  return normalized.length > 0 ? normalized : undefined;
}

function normalizePinnedMessageIds(memory: AiSessionMemory): string[] | undefined {
  const ids = memory.pinnedMessageIds;
  if (!Array.isArray(ids) || ids.length === 0) return undefined;

  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of ids) {
    if (typeof raw !== 'string') continue;
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
  }
  if (normalized.length === 0) return undefined;
  return normalized.slice(-MAX_PINNED_MESSAGE_IDS);
}

function normalizeSessionMemory(memory: AiSessionMemory): AiSessionMemory {
  const mergedPreferences = {
    ...(memory.preferences ?? {}),
    ...(memory.lastLanguage !== undefined ? { lastLanguage: memory.lastLanguage } : {}),
    ...(memory.lastToolName !== undefined ? { lastToolName: memory.lastToolName } : {}),
    ...(memory.lastLayerId !== undefined ? { lastLayerId: memory.lastLayerId } : {}),
    ...(memory.adaptiveInputProfile !== undefined ? { adaptiveInputProfile: memory.adaptiveInputProfile } : {}),
  };

  const hasPreferences = Object.keys(mergedPreferences).length > 0;
  const normalizedSummaryChain = normalizeSummaryChain(memory);
  const normalizedPinnedMessageIds = normalizePinnedMessageIds(memory);
  const normalizedSummaryQualityWarning = memory.summaryQualityWarning
    && typeof memory.summaryQualityWarning.similarity === 'number'
    && Number.isFinite(memory.summaryQualityWarning.similarity)
    ? {
        similarity: memory.summaryQualityWarning.similarity,
        threshold: typeof memory.summaryQualityWarning.threshold === 'number' && Number.isFinite(memory.summaryQualityWarning.threshold)
          ? memory.summaryQualityWarning.threshold
          : SUMMARY_WARNING_DEFAULT_THRESHOLD,
        generatedAt: typeof memory.summaryQualityWarning.generatedAt === 'string' && memory.summaryQualityWarning.generatedAt.trim().length > 0
          ? memory.summaryQualityWarning.generatedAt
          : nowIso(),
        coveredTurnCount: typeof memory.summaryQualityWarning.coveredTurnCount === 'number' && Number.isFinite(memory.summaryQualityWarning.coveredTurnCount)
          ? Math.max(0, Math.floor(memory.summaryQualityWarning.coveredTurnCount))
          : 0,
      }
    : undefined;

  return {
    ...memory,
    ...(hasPreferences ? { preferences: mergedPreferences } : {}),
    ...(normalizedSummaryChain !== undefined ? { summaryChain: normalizedSummaryChain } : {}),
    ...(normalizedPinnedMessageIds !== undefined ? { pinnedMessageIds: normalizedPinnedMessageIds } : {}),
    ...(normalizedSummaryQualityWarning !== undefined ? { summaryQualityWarning: normalizedSummaryQualityWarning } : {}),
    ...(mergedPreferences.lastLanguage !== undefined ? { lastLanguage: mergedPreferences.lastLanguage } : {}),
    ...(mergedPreferences.lastToolName !== undefined ? { lastToolName: mergedPreferences.lastToolName } : {}),
    ...(mergedPreferences.lastLayerId !== undefined ? { lastLayerId: mergedPreferences.lastLayerId } : {}),
    ...(mergedPreferences.adaptiveInputProfile !== undefined
      ? { adaptiveInputProfile: mergedPreferences.adaptiveInputProfile }
      : {}),
  };
}

export function patchSessionMemoryPreferences(
  memory: AiSessionMemory,
  patch: Partial<NonNullable<AiSessionMemory['preferences']>>,
): AiSessionMemory {
  return normalizeSessionMemory({
    ...memory,
    preferences: {
      ...(memory.preferences ?? {}),
      ...patch,
    },
  });
}

export function updateConversationSummaryMemory(
  memory: AiSessionMemory,
  conversationSummary: string,
  summaryTurnCount: number,
  options?: {
    similarityScore?: number;
    qualityWarningThreshold?: number;
    generatedAt?: string;
  },
): AiSessionMemory {
  const normalizedSummary = conversationSummary.trim();
  if (!normalizedSummary) {
    return clearConversationSummaryMemory(memory);
  }

  const generatedAt = options?.generatedAt ?? nowIso();
  const similarityScore = options?.similarityScore;
  const qualityWarningThreshold = options?.qualityWarningThreshold ?? SUMMARY_WARNING_DEFAULT_THRESHOLD;
  const shouldWarn = typeof similarityScore === 'number' && Number.isFinite(similarityScore) && similarityScore < qualityWarningThreshold;
  const normalizedTurnCount = Number.isFinite(summaryTurnCount) ? Math.max(0, Math.floor(summaryTurnCount)) : 0;
  const { summaryQualityWarning: _ignoredWarning, ...restMemory } = memory;

  const nextSummaryChain = [
    ...(memory.summaryChain ?? []),
    {
      id: newSummaryEntryId(),
      summary: normalizedSummary,
      coveredTurnCount: normalizedTurnCount,
      createdAt: generatedAt,
      ...(typeof similarityScore === 'number' && Number.isFinite(similarityScore) ? { similarityScore } : {}),
      ...(shouldWarn ? { qualityWarning: true } : {}),
    },
  ].slice(-MAX_SUMMARY_CHAIN_LENGTH);

  return normalizeSessionMemory({
    ...restMemory,
    conversationSummary: normalizedSummary,
    summaryTurnCount: normalizedTurnCount,
    summaryChain: nextSummaryChain,
    ...(shouldWarn
      ? {
          summaryQualityWarning: {
            similarity: similarityScore,
            threshold: qualityWarningThreshold,
            generatedAt,
            coveredTurnCount: normalizedTurnCount,
          },
        }
      : {}),
  });
}

export function setSessionMemoryMessagePinned(
  memory: AiSessionMemory,
  messageId: string,
  pinned: boolean,
): AiSessionMemory {
  const normalizedMessageId = messageId.trim();
  if (!normalizedMessageId) return normalizeSessionMemory(memory);
  const pinnedSet = new Set(memory.pinnedMessageIds ?? []);
  if (pinned) {
    pinnedSet.add(normalizedMessageId);
  } else {
    pinnedSet.delete(normalizedMessageId);
  }

  if (pinnedSet.size === 0) {
    const { pinnedMessageIds: _ignoredPinnedMessageIds, ...restMemory } = memory;
    return normalizeSessionMemory(restMemory);
  }

  return normalizeSessionMemory({
    ...memory,
    pinnedMessageIds: Array.from(pinnedSet),
  });
}

export function clearConversationSummaryMemory(memory: AiSessionMemory): AiSessionMemory {
  const {
    conversationSummary: _ignoredConversationSummary,
    summaryChain: _ignoredSummaryChain,
    summaryQualityWarning: _ignoredSummaryWarning,
    pinnedMessageIds: _ignoredPinnedMessageIds,
    ...restMemory
  } = memory;
  return normalizeSessionMemory({
    ...restMemory,
    summaryTurnCount: 0,
  });
}

export function loadSessionMemory(): AiSessionMemory {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(AI_SESSION_MEMORY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as AiSessionMemory;
    if (!parsed || typeof parsed !== 'object') return {};
    return normalizeSessionMemory(parsed);
  } catch (error) {
    log.warn('Failed to load AI session memory, fallback to empty state', {
      storageKey: AI_SESSION_MEMORY_STORAGE_KEY,
      error: error instanceof Error ? error.message : String(error),
    });
    return {};
  }
}

export function persistSessionMemory(mem: AiSessionMemory): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(AI_SESSION_MEMORY_STORAGE_KEY, JSON.stringify(normalizeSessionMemory(mem)));
  } catch (error) {
    log.warn('Failed to persist AI session memory', {
      storageKey: AI_SESSION_MEMORY_STORAGE_KEY,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
