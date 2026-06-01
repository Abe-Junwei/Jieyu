import type { AiSessionMemory, AiUserDirectiveLedgerEntry } from './chatDomain.types';
import { trimTextToMax } from './historyTrim';
import {
  normalizeSessionMemory,
  nowIso,
  newSummaryEntryId,
  SESSION_MEMORY_MAX_SUMMARY_CHAIN_LENGTH as MAX_SUMMARY_CHAIN_LENGTH,
  SESSION_MEMORY_SUMMARY_WARNING_DEFAULT_THRESHOLD as SUMMARY_WARNING_DEFAULT_THRESHOLD,
} from './sessionMemoryNormalize';

export {
  bindSessionMemoryConversation,
  loadSessionMemory,
  loadSessionMemoryAsync,
  persistSessionMemory,
  persistSessionMemoryAsync,
  resetSessionMemoryStoreForTests,
} from './sessionMemoryStore';

export { normalizeSessionMemory } from './sessionMemoryNormalize';

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
  const qualityWarningThreshold =
    options?.qualityWarningThreshold ?? SUMMARY_WARNING_DEFAULT_THRESHOLD;
  const shouldWarn =
    typeof similarityScore === 'number' &&
    Number.isFinite(similarityScore) &&
    similarityScore < qualityWarningThreshold;
  const normalizedTurnCount = Number.isFinite(summaryTurnCount)
    ? Math.max(0, Math.floor(summaryTurnCount))
    : 0;
  const { summaryQualityWarning: _ignoredWarning, ...restMemory } = memory;

  const nextSummaryChain = [
    ...(memory.summaryChain ?? []),
    {
      id: newSummaryEntryId(),
      summary: normalizedSummary,
      coveredTurnCount: normalizedTurnCount,
      createdAt: generatedAt,
      ...(typeof similarityScore === 'number' && Number.isFinite(similarityScore)
        ? { similarityScore }
        : {}),
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

function stripPreferencesForDeactivatedEntry(
  memory: AiSessionMemory,
  entry: AiUserDirectiveLedgerEntry,
): AiSessionMemory {
  if (entry.action !== 'accepted') return memory;
  if (entry.category === 'session') {
    return memory;
  }
  if (entry.category === 'terminology' || entry.targetPath === 'terminologyPreferences') {
    if (typeof entry.value !== 'string' || !entry.value.includes('=>')) {
      return memory;
    }
    const idx = entry.value.indexOf('=>');
    const sourceTerm = entry.value.slice(0, idx).trim();
    const targetTerm = entry.value.slice(idx + 2).trim();
    if (!sourceTerm || !targetTerm) {
      return memory;
    }
    const prev = memory.terminologyPreferences ?? [];
    const next = prev.filter(
      (item) =>
        !(item.source.toLowerCase() === sourceTerm.toLowerCase() && item.target === targetTerm),
    );
    if (next.length === prev.length) {
      return memory;
    }
    return normalizeSessionMemory({ ...memory, terminologyPreferences: next });
  }
  const targetPath = entry.targetPath?.trim() ?? '';
  if (!targetPath || !targetPath.includes('.')) {
    return memory;
  }
  if (entry.value === undefined) {
    return memory;
  }

  const matchesCurrent = (current: unknown): boolean => {
    if (current === undefined) return false;
    if (typeof entry.value === 'boolean' && typeof current === 'boolean') {
      return current === entry.value;
    }
    if (typeof entry.value === 'string' && typeof current === 'string') {
      return current === entry.value;
    }
    return String(current) === String(entry.value);
  };

  if (entry.category === 'response' || targetPath.startsWith('responsePreferences.')) {
    const key = targetPath.replace('responsePreferences.', '') as string;
    const current = (memory.responsePreferences as Record<string, unknown> | undefined)?.[key];
    if (!matchesCurrent(current)) {
      return memory;
    }
    const next = { ...(memory.responsePreferences ?? {}) } as Record<string, unknown>;
    delete next[key];
    if (Object.keys(next).length > 0) {
      return normalizeSessionMemory({
        ...memory,
        responsePreferences: next as NonNullable<AiSessionMemory['responsePreferences']>,
      });
    }
    const { responsePreferences: _r, ...rest } = memory;
    return normalizeSessionMemory({ ...rest });
  }
  if (entry.category === 'tool' || targetPath.startsWith('toolPreferences.')) {
    const key = targetPath.replace('toolPreferences.', '') as string;
    const current = (memory.toolPreferences as Record<string, unknown> | undefined)?.[key];
    if (!matchesCurrent(current)) {
      return memory;
    }
    const next = { ...(memory.toolPreferences ?? {}) } as Record<string, unknown>;
    delete next[key];
    if (Object.keys(next).length > 0) {
      return normalizeSessionMemory({
        ...memory,
        toolPreferences: next as NonNullable<AiSessionMemory['toolPreferences']>,
      });
    }
    const { toolPreferences: _t, ...rest } = memory;
    return normalizeSessionMemory({ ...rest });
  }
  if (entry.category === 'safety' || targetPath.startsWith('safetyPreferences.')) {
    const key = targetPath.replace('safetyPreferences.', '') as string;
    const current = (memory.safetyPreferences as Record<string, unknown> | undefined)?.[key];
    if (!matchesCurrent(current)) {
      return memory;
    }
    const next = { ...(memory.safetyPreferences ?? {}) } as Record<string, unknown>;
    delete next[key];
    if (Object.keys(next).length > 0) {
      return normalizeSessionMemory({
        ...memory,
        safetyPreferences: next as NonNullable<AiSessionMemory['safetyPreferences']>,
      });
    }
    const { safetyPreferences: _s, ...rest } = memory;
    return normalizeSessionMemory({ ...rest });
  }
  return memory;
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
    const {
      pinnedMessageIds: _ignoredPinnedMessageIds,
      pinnedMessageDigests: _ignoredPinnedMessageDigests,
      pinnedDirectiveRefs: _ignoredPinnedDirectiveRefs,
      ...restMemory
    } = memory;
    return normalizeSessionMemory(restMemory);
  }

  return normalizeSessionMemory({
    ...memory,
    pinnedMessageIds: Array.from(pinnedSet),
  });
}

export function deactivateSessionDirective(
  memory: AiSessionMemory,
  directiveId: string,
): AiSessionMemory {
  const normalizedDirectiveId = directiveId.trim();
  if (!normalizedDirectiveId) return normalizeSessionMemory(memory);
  const accepted = (memory.directiveLedger ?? []).find(
    (e) => e.id === normalizedDirectiveId && e.action === 'accepted',
  );
  const work: AiSessionMemory = accepted
    ? stripPreferencesForDeactivatedEntry(memory, accepted)
    : memory;
  const nextSessionDirectives = (work.sessionDirectives ?? []).filter(
    (item) => item.id !== normalizedDirectiveId,
  );
  const nextDirectiveLedger = (work.directiveLedger ?? []).map((entry) =>
    entry.id === normalizedDirectiveId && entry.action === 'accepted'
      ? {
          ...entry,
          action: 'superseded' as const,
          supersededBy: `${normalizedDirectiveId}_deactivated`,
        }
      : entry,
  );
  const nextPinnedDirectiveRefs = (work.pinnedDirectiveRefs ?? []).filter(
    (ref) => ref !== normalizedDirectiveId,
  );
  const {
    sessionDirectives: _ignoredSessionDirectives,
    directiveLedger: _ignoredDirectiveLedger,
    pinnedDirectiveRefs: _ignoredPinnedDirectiveRefs,
    ...restMemory
  } = work;
  return normalizeSessionMemory({
    ...restMemory,
    ...(nextSessionDirectives.length > 0 ? { sessionDirectives: nextSessionDirectives } : {}),
    ...(nextDirectiveLedger.length > 0 ? { directiveLedger: nextDirectiveLedger } : {}),
    ...(nextPinnedDirectiveRefs.length > 0 ? { pinnedDirectiveRefs: nextPinnedDirectiveRefs } : {}),
  });
}

export function pruneDirectiveLedgerBySourceMessage(
  memory: AiSessionMemory,
  sourceMessageId: string,
): AiSessionMemory {
  const normalizedMessageId = sourceMessageId.trim();
  if (!normalizedMessageId) return normalizeSessionMemory(memory);
  const nextDirectiveLedger = (memory.directiveLedger ?? []).filter(
    (entry) => entry.sourceMessageId !== normalizedMessageId,
  );
  const nextSessionDirectives = (memory.sessionDirectives ?? []).filter(
    (directive) => directive.sourceMessageId !== normalizedMessageId,
  );
  const nextPinnedDirectiveRefs = (memory.pinnedDirectiveRefs ?? []).filter((directiveId) =>
    nextDirectiveLedger.some((entry) => entry.id === directiveId),
  );
  const {
    directiveLedger: _ignoredDirectiveLedger,
    sessionDirectives: _ignoredSessionDirectives,
    pinnedDirectiveRefs: _ignoredPinnedDirectiveRefs,
    ...restMemory
  } = memory;
  return normalizeSessionMemory({
    ...restMemory,
    ...(nextDirectiveLedger.length > 0 ? { directiveLedger: nextDirectiveLedger } : {}),
    ...(nextSessionDirectives.length > 0 ? { sessionDirectives: nextSessionDirectives } : {}),
    ...(nextPinnedDirectiveRefs.length > 0 ? { pinnedDirectiveRefs: nextPinnedDirectiveRefs } : {}),
  });
}

export function buildSessionMemoryPromptDigest(memory: AiSessionMemory, maxChars: number): string {
  if (maxChars <= 0) return '';
  const rolling = memory.conversationSummary?.trim();
  const chain = memory.summaryChain;
  const parts: string[] = [];
  if (rolling) {
    parts.push(`rollingSummary=${rolling}`);
  }
  if (chain && chain.length > 0) {
    const tail = chain.slice(-2);
    const tailText = tail
      .map((e) => e.summary.trim())
      .filter(Boolean)
      .join(' | ');
    if (tailText && tailText !== rolling) {
      parts.push(`earlierSummaries=${tailText}`);
    }
  }
  const pinned = memory.pinnedMessageDigests
    ?.filter((item) => item.role === 'user')
    .slice(-3)
    .map((item) => item.content.trim())
    .filter(Boolean)
    .join(' | ');
  if (pinned) {
    parts.push(`pinnedUserDirectives=${pinned}`);
  }
  if (parts.length === 0) return '';
  return trimTextToMax(parts.join('\n'), maxChars);
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
