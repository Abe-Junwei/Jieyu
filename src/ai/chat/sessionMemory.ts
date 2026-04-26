import { createLogger } from '../../observability/logger';
import type { AiSessionMemory, AiUserDirectiveLedgerEntry } from './chatDomain.types';
import { trimTextToMax } from './historyTrim';

const AI_SESSION_MEMORY_STORAGE_KEY = 'jieyu.aiChat.sessionMemory';
const log = createLogger('aiChatSessionMemory');
const MAX_SUMMARY_CHAIN_LENGTH = 24;
const MAX_PINNED_MESSAGE_IDS = 80;
const MAX_PINNED_MESSAGE_DIGESTS = 24;
const MAX_DIRECTIVE_LEDGER_LENGTH = 80;
const MAX_SESSION_DIRECTIVES = 24;
const MAX_TERMINOLOGY_PREFERENCES = 80;
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

function normalizePinnedMessageDigests(memory: AiSessionMemory): AiSessionMemory['pinnedMessageDigests'] {
  const digests = memory.pinnedMessageDigests;
  if (!Array.isArray(digests) || digests.length === 0) return undefined;
  const pinned = new Set(memory.pinnedMessageIds ?? []);
  const seen = new Set<string>();
  const normalized = digests
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const messageId = typeof item.messageId === 'string' ? item.messageId.trim() : '';
      const content = typeof item.content === 'string' ? trimTextToMax(item.content.trim(), 500) : '';
      const role = item.role === 'user' || item.role === 'assistant' ? item.role : undefined;
      if (!messageId || !content || !role || seen.has(messageId)) return null;
      if (pinned.size > 0 && !pinned.has(messageId)) return null;
      seen.add(messageId);
      return {
        messageId,
        role,
        content,
        createdAt: typeof item.createdAt === 'string' && item.createdAt.trim() ? item.createdAt : nowIso(),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .slice(-MAX_PINNED_MESSAGE_DIGESTS);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeResponsePreferences(memory: AiSessionMemory): AiSessionMemory['responsePreferences'] {
  const preferences = memory.responsePreferences;
  if (!preferences || typeof preferences !== 'object') return undefined;
  const language = preferences.language === 'auto' || preferences.language === 'zh-CN' || preferences.language === 'en'
    ? preferences.language
    : undefined;
  const style = preferences.style === 'concise' || preferences.style === 'detailed'
    ? preferences.style
    : undefined;
  const format = preferences.format === 'bullets'
    || preferences.format === 'prose'
    || preferences.format === 'steps'
    || preferences.format === 'evidence_first'
    ? preferences.format
    : undefined;
  const evidenceRequired = typeof preferences.evidenceRequired === 'boolean' ? preferences.evidenceRequired : undefined;
  const normalized = {
    ...(language ? { language } : {}),
    ...(style ? { style } : {}),
    ...(format ? { format } : {}),
    ...(evidenceRequired !== undefined ? { evidenceRequired } : {}),
  };
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeToolPreferences(memory: AiSessionMemory): AiSessionMemory['toolPreferences'] {
  const preferences = memory.toolPreferences;
  if (!preferences || typeof preferences !== 'object') return undefined;
  const defaultScope = preferences.defaultScope === 'project'
    || preferences.defaultScope === 'current_track'
    || preferences.defaultScope === 'current_scope'
    ? preferences.defaultScope
    : undefined;
  const autoExecute = preferences.autoExecute === 'allow'
    || preferences.autoExecute === 'ask_first'
    || preferences.autoExecute === 'never'
    ? preferences.autoExecute
    : undefined;
  const preferLocalReads = typeof preferences.preferLocalReads === 'boolean' ? preferences.preferLocalReads : undefined;
  const normalized = {
    ...(defaultScope ? { defaultScope } : {}),
    ...(autoExecute ? { autoExecute } : {}),
    ...(preferLocalReads !== undefined ? { preferLocalReads } : {}),
  };
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeSafetyPreferences(memory: AiSessionMemory): AiSessionMemory['safetyPreferences'] {
  const preferences = memory.safetyPreferences;
  if (!preferences || typeof preferences !== 'object') return undefined;
  const normalized = {
    ...(typeof preferences.denyDestructive === 'boolean' ? { denyDestructive: preferences.denyDestructive } : {}),
    ...(typeof preferences.denyBatch === 'boolean' ? { denyBatch: preferences.denyBatch } : {}),
    ...(typeof preferences.requireImpactPreview === 'boolean' ? { requireImpactPreview: preferences.requireImpactPreview } : {}),
  };
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeTerminologyPreferences(memory: AiSessionMemory): AiSessionMemory['terminologyPreferences'] {
  const preferences = memory.terminologyPreferences;
  if (!Array.isArray(preferences) || preferences.length === 0) return undefined;
  const seen = new Set<string>();
  const normalized = preferences
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const source = typeof item.source === 'string' ? item.source.trim() : '';
      const target = typeof item.target === 'string' ? item.target.trim() : '';
      if (!source || !target) return null;
      const key = `${source.toLocaleLowerCase()}=>${target.toLocaleLowerCase()}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return {
        source,
        target,
        createdAt: typeof item.createdAt === 'string' && item.createdAt.trim() ? item.createdAt : nowIso(),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .slice(-MAX_TERMINOLOGY_PREFERENCES);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeSessionDirectives(memory: AiSessionMemory): AiSessionMemory['sessionDirectives'] {
  const directives = memory.sessionDirectives;
  if (!Array.isArray(directives) || directives.length === 0) return undefined;
  const nowMs = Date.now();
  const nowIsoString = new Date(nowMs).toISOString();
  const normalized = directives
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : '';
      const text = typeof item.text === 'string' ? item.text.trim() : '';
      const category = item.category === 'response'
        || item.category === 'tool'
        || item.category === 'safety'
        || item.category === 'terminology'
        || item.category === 'session'
        ? item.category
        : undefined;
      const source = item.source === 'user_explicit' || item.source === 'background_extracted' || item.source === 'pinned_message'
        ? item.source
        : undefined;
      if (!id || !text || !category || !source) return null;
      return {
        id,
        text: trimTextToMax(text, 500),
        category,
        createdAt: typeof item.createdAt === 'string' && item.createdAt.trim() ? item.createdAt : nowIso(),
        source,
        ...(typeof item.expiresAt === 'string' && item.expiresAt.trim() ? { expiresAt: item.expiresAt } : {}),
        ...(typeof item.sourceMessageId === 'string' && item.sourceMessageId.trim() ? { sourceMessageId: item.sourceMessageId.trim() } : {}),
      };
    })
    .filter((item) => {
      if (!item) return false;
      if (!item.expiresAt) return true;
      if (item.expiresAt.length >= 20 && item.expiresAt <= nowIsoString) return false;
      const expiresMs = Date.parse(item.expiresAt);
      return !Number.isFinite(expiresMs) || expiresMs > nowMs;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .slice(-MAX_SESSION_DIRECTIVES);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeDirectiveLedger(memory: AiSessionMemory): AiSessionMemory['directiveLedger'] {
  const entries = memory.directiveLedger;
  if (!Array.isArray(entries) || entries.length === 0) return undefined;
  const nowMs = Date.now();
  const nowIsoString = new Date(nowMs).toISOString();
  const normalized = entries
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const id = typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : '';
      const text = typeof entry.text === 'string' ? entry.text.trim() : '';
      const category = entry.category === 'response'
        || entry.category === 'tool'
        || entry.category === 'safety'
        || entry.category === 'terminology'
        || entry.category === 'session'
        ? entry.category
        : undefined;
      const scope = entry.scope === 'session' || entry.scope === 'long_term' ? entry.scope : undefined;
      const action = entry.action === 'accepted'
        || entry.action === 'ignored'
        || entry.action === 'downgraded'
        || entry.action === 'superseded'
        ? entry.action
        : undefined;
      const source = entry.source === 'user_explicit' || entry.source === 'background_extracted' || entry.source === 'pinned_message'
        ? entry.source
        : undefined;
      if (!id || !text || !category || !scope || !action || !source) return null;
      const confidence = typeof entry.confidence === 'number' && Number.isFinite(entry.confidence)
        ? Math.max(0, Math.min(1, entry.confidence))
        : 0;
      return {
        id,
        category,
        scope,
        text: trimTextToMax(text, 500),
        action,
        source,
        confidence,
        createdAt: typeof entry.createdAt === 'string' && entry.createdAt.trim() ? entry.createdAt : nowIso(),
        ...(typeof entry.targetPath === 'string' && entry.targetPath.trim() ? { targetPath: entry.targetPath.trim() } : {}),
        ...(typeof entry.value === 'string' || typeof entry.value === 'boolean' ? { value: entry.value } : {}),
        ...(typeof entry.sourceMessageId === 'string' && entry.sourceMessageId.trim() ? { sourceMessageId: entry.sourceMessageId.trim() } : {}),
        ...(typeof entry.expiresAt === 'string' && entry.expiresAt.trim() ? { expiresAt: entry.expiresAt } : {}),
        ...(typeof entry.supersededBy === 'string' && entry.supersededBy.trim() ? { supersededBy: entry.supersededBy.trim() } : {}),
        ...(typeof entry.reason === 'string' && entry.reason.trim() ? { reason: entry.reason.trim() } : {}),
      };
    })
    .filter((entry) => {
      if (!entry) return false;
      if (!entry.expiresAt) return true;
      if (entry.expiresAt.length >= 20 && entry.expiresAt <= nowIsoString) return false;
      const expiresMs = Date.parse(entry.expiresAt);
      return !Number.isFinite(expiresMs) || expiresMs > nowMs;
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .slice(-MAX_DIRECTIVE_LEDGER_LENGTH);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeLocalToolState(memory: AiSessionMemory): AiSessionMemory['localToolState'] {
  const state = memory.localToolState;
  if (!state || typeof state !== 'object') return undefined;
  const lastIntent = state.lastIntent;
  const normalizedIntent = lastIntent === 'unit.list'
    || lastIntent === 'unit.search'
    || lastIntent === 'unit.detail'
    || lastIntent === 'stats.get'
    ? lastIntent
    : undefined;
  const lastQuery = typeof state.lastQuery === 'string' && state.lastQuery.trim().length > 0
    ? state.lastQuery.trim()
    : undefined;
  const lastResultUnitIds = Array.isArray(state.lastResultUnitIds)
    ? state.lastResultUnitIds
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim())
      .slice(0, 200)
    : undefined;
  const normalizedScope = state.lastScope === 'project'
    || state.lastScope === 'current_track'
    || state.lastScope === 'current_scope'
    ? state.lastScope
    : undefined;
  const lastFrame = state.lastFrame;
  const normalizedFrame = lastFrame && typeof lastFrame === 'object'
    ? {
        ...(lastFrame.domain === 'units' || lastFrame.domain === 'project_stats'
          ? { domain: lastFrame.domain }
          : {}),
        ...(lastFrame.questionKind === 'count'
          || lastFrame.questionKind === 'list'
          || lastFrame.questionKind === 'search'
          || lastFrame.questionKind === 'detail'
          ? { questionKind: lastFrame.questionKind }
          : {}),
        ...(lastFrame.metric === 'unit_count'
          || lastFrame.metric === 'speaker_count'
          || lastFrame.metric === 'translation_layer_count'
          || lastFrame.metric === 'ai_confidence_avg'
          || lastFrame.metric === 'untranscribed_count'
          || lastFrame.metric === 'missing_speaker_count'
          ? { metric: lastFrame.metric }
          : {}),
        ...(lastFrame.metricCategory === 'total' || lastFrame.metricCategory === 'gap'
          ? { metricCategory: lastFrame.metricCategory }
          : {}),
        ...(lastFrame.scope === 'project'
          || lastFrame.scope === 'current_track'
          || lastFrame.scope === 'current_scope'
          ? { scope: lastFrame.scope }
          : {}),
        ...(typeof lastFrame.isQualityGapQuestion === 'boolean'
          ? { isQualityGapQuestion: lastFrame.isQualityGapQuestion }
          : {}),
        ...(lastFrame.source === 'user' || lastFrame.source === 'inferred' || lastFrame.source === 'tool'
          ? { source: lastFrame.source }
          : {}),
        updatedAt: typeof lastFrame.updatedAt === 'string' && lastFrame.updatedAt.trim().length > 0
          ? lastFrame.updatedAt
          : nowIso(),
      }
    : undefined;
  const hasNormalizedFrame = normalizedFrame
    && Object.keys(normalizedFrame).some((key) => key !== 'updatedAt');
  if (!normalizedIntent && !lastQuery && !normalizedScope && (!lastResultUnitIds || lastResultUnitIds.length === 0) && !hasNormalizedFrame) {
    return undefined;
  }
  return {
    ...(normalizedIntent ? { lastIntent: normalizedIntent } : {}),
    ...(lastQuery ? { lastQuery } : {}),
    ...(lastResultUnitIds && lastResultUnitIds.length > 0 ? { lastResultUnitIds } : {}),
    ...(normalizedScope ? { lastScope: normalizedScope } : {}),
    ...(hasNormalizedFrame ? { lastFrame: normalizedFrame } : {}),
    updatedAt: typeof state.updatedAt === 'string' && state.updatedAt.trim().length > 0
      ? state.updatedAt
      : nowIso(),
  };
}

function normalizePendingAgentLoopCheckpoint(memory: AiSessionMemory): AiSessionMemory['pendingAgentLoopCheckpoint'] {
  const checkpoint = memory.pendingAgentLoopCheckpoint;
  if (!checkpoint || typeof checkpoint !== 'object') return undefined;
  const kind = checkpoint.kind === 'token_budget_warning' ? checkpoint.kind : undefined;
  const originalUserText = typeof checkpoint.originalUserText === 'string' ? checkpoint.originalUserText.trim() : '';
  const continuationInput = typeof checkpoint.continuationInput === 'string' ? checkpoint.continuationInput.trim() : '';
  const step = typeof checkpoint.step === 'number' && Number.isFinite(checkpoint.step)
    ? Math.max(1, Math.floor(checkpoint.step))
    : undefined;
  if (!kind || !originalUserText || !continuationInput || step === undefined) {
    return undefined;
  }
  return {
    kind,
    originalUserText,
    continuationInput,
    step,
    ...(typeof checkpoint.estimatedRemainingTokens === 'number' && Number.isFinite(checkpoint.estimatedRemainingTokens)
      ? { estimatedRemainingTokens: Math.max(0, Math.floor(checkpoint.estimatedRemainingTokens)) }
      : {}),
    createdAt: typeof checkpoint.createdAt === 'string' && checkpoint.createdAt.trim().length > 0
      ? checkpoint.createdAt
      : nowIso(),
  };
}

function normalizeSessionMemory(memory: AiSessionMemory): AiSessionMemory {
  // Migrate legacy top-level fields (lastLanguage, etc.) into preferences,
  // then re-project them back to the top level for backward compatibility.
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
  const normalizedPinnedMessageDigests = normalizePinnedMessageDigests(memory);
  const normalizedResponsePreferences = normalizeResponsePreferences(memory);
  const normalizedToolPreferences = normalizeToolPreferences(memory);
  const normalizedSafetyPreferences = normalizeSafetyPreferences(memory);
  const normalizedTerminologyPreferences = normalizeTerminologyPreferences(memory);
  const normalizedSessionDirectives = normalizeSessionDirectives(memory);
  const normalizedDirectiveLedger = normalizeDirectiveLedger(memory);
  const normalizedLocalToolState = normalizeLocalToolState(memory);
  const normalizedPendingAgentLoopCheckpoint = normalizePendingAgentLoopCheckpoint(memory);
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

  // Strip legacy top-level shorthand fields before spreading, so the
  // authoritative values always come from mergedPreferences (lines below).
  const {
    lastLanguage: _ll, lastToolName: _lt, lastLayerId: _lli, adaptiveInputProfile: _aip,
    summaryChain: _summaryChain,
    pinnedMessageIds: _pinnedMessageIds,
    pinnedMessageDigests: _pinnedMessageDigests,
    pinnedDirectiveRefs: _pinnedDirectiveRefs,
    responsePreferences: _responsePreferences,
    toolPreferences: _toolPreferences,
    safetyPreferences: _safetyPreferences,
    terminologyPreferences: _terminologyPreferences,
    sessionDirectives: _sessionDirectives,
    directiveLedger: _directiveLedger,
    localToolState: _localToolState,
    pendingAgentLoopCheckpoint: _pendingAgentLoopCheckpoint,
    summaryQualityWarning: _summaryQualityWarning,
    ...baseMemory
  } = memory;

  return {
    ...baseMemory,
    ...(hasPreferences ? { preferences: mergedPreferences } : {}),
    ...(normalizedSummaryChain !== undefined ? { summaryChain: normalizedSummaryChain } : {}),
    ...(normalizedPinnedMessageIds !== undefined ? { pinnedMessageIds: normalizedPinnedMessageIds } : {}),
    ...(normalizedPinnedMessageDigests !== undefined ? { pinnedMessageDigests: normalizedPinnedMessageDigests } : {}),
    ...(Array.isArray(memory.pinnedDirectiveRefs) && memory.pinnedDirectiveRefs.length > 0
      ? { pinnedDirectiveRefs: [...new Set(memory.pinnedDirectiveRefs.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()))].slice(-MAX_PINNED_MESSAGE_DIGESTS) }
      : {}),
    ...(normalizedResponsePreferences !== undefined ? { responsePreferences: normalizedResponsePreferences } : {}),
    ...(normalizedToolPreferences !== undefined ? { toolPreferences: normalizedToolPreferences } : {}),
    ...(normalizedSafetyPreferences !== undefined ? { safetyPreferences: normalizedSafetyPreferences } : {}),
    ...(normalizedTerminologyPreferences !== undefined ? { terminologyPreferences: normalizedTerminologyPreferences } : {}),
    ...(normalizedSessionDirectives !== undefined ? { sessionDirectives: normalizedSessionDirectives } : {}),
    ...(normalizedDirectiveLedger !== undefined ? { directiveLedger: normalizedDirectiveLedger } : {}),
    ...(normalizedLocalToolState !== undefined ? { localToolState: normalizedLocalToolState } : {}),
    ...(normalizedPendingAgentLoopCheckpoint !== undefined ? { pendingAgentLoopCheckpoint: normalizedPendingAgentLoopCheckpoint } : {}),
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

/**
 * Revert side effects in preferences that were applied for an accepted ledger line.
 * Only removes a field (or terminology row) when the current value still matches that entry
 * (so a superseding preference does not get wiped by mistake).
 */
function stripPreferencesForDeactivatedEntry(memory: AiSessionMemory, entry: AiUserDirectiveLedgerEntry): AiSessionMemory {
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
      (item) => !(item.source.toLowerCase() === sourceTerm.toLowerCase() && item.target === targetTerm),
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
      return normalizeSessionMemory({ ...memory, responsePreferences: next as NonNullable<AiSessionMemory['responsePreferences']> });
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
      return normalizeSessionMemory({ ...memory, toolPreferences: next as NonNullable<AiSessionMemory['toolPreferences']> });
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
      return normalizeSessionMemory({ ...memory, safetyPreferences: next as NonNullable<AiSessionMemory['safetyPreferences']> });
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

export function deactivateSessionDirective(memory: AiSessionMemory, directiveId: string): AiSessionMemory {
  const normalizedDirectiveId = directiveId.trim();
  if (!normalizedDirectiveId) return normalizeSessionMemory(memory);
  const accepted = (memory.directiveLedger ?? []).find(
    (e) => e.id === normalizedDirectiveId && e.action === 'accepted',
  );
  const work: AiSessionMemory = accepted
    ? stripPreferencesForDeactivatedEntry(memory, accepted)
    : memory;
  const nextSessionDirectives = (work.sessionDirectives ?? [])
    .filter((item) => item.id !== normalizedDirectiveId);
  const nextDirectiveLedger = (work.directiveLedger ?? []).map((entry) => (
    entry.id === normalizedDirectiveId && entry.action === 'accepted'
      ? { ...entry, action: 'superseded' as const, supersededBy: `${normalizedDirectiveId}_deactivated` }
      : entry
  ));
  const nextPinnedDirectiveRefs = (work.pinnedDirectiveRefs ?? [])
    .filter((ref) => ref !== normalizedDirectiveId);
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

export function pruneDirectiveLedgerBySourceMessage(memory: AiSessionMemory, sourceMessageId: string): AiSessionMemory {
  const normalizedMessageId = sourceMessageId.trim();
  if (!normalizedMessageId) return normalizeSessionMemory(memory);
  const nextDirectiveLedger = (memory.directiveLedger ?? [])
    .filter((entry) => entry.sourceMessageId !== normalizedMessageId);
  const nextSessionDirectives = (memory.sessionDirectives ?? [])
    .filter((directive) => directive.sourceMessageId !== normalizedMessageId);
  const nextPinnedDirectiveRefs = (memory.pinnedDirectiveRefs ?? [])
    .filter((directiveId) => nextDirectiveLedger.some((entry) => entry.id === directiveId));
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

/**
 * Compact session-memory slice for tier-2 prompt context (Phase 14).
 * Prefer `conversationSummary`; add prior chain tails only when they add new wording.
 */
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
