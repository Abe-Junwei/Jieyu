import type { BackgroundMemoryExtractionAudit, BackgroundMemoryExtractionInput, ExtractedMemoryFact } from '../ai/memory/backgroundMemoryExtractor';
import { BackgroundMemoryExtractor } from '../ai/memory/backgroundMemoryExtractor';
import type { AiSessionMemory } from '../ai/chat/chatDomain.types';
import { extractUserDirectives } from '../ai/memory/userDirectiveExtractor';
import { applyUserDirectivesToSessionMemory, summarizeDirectiveApplication, type UserDirectiveApplicationResult } from '../ai/memory/userDirectiveRegistry';
import type { AuditLogDocType } from '../db/types';
import { newAuditLogId, nowIso } from './useAiChat.helpers';

const MAX_BACKGROUND_FACTS = 24;
const MAX_FACT_CHARS = 240;

export interface AiChatBackgroundMemoryRuntime {
  extractor: BackgroundMemoryExtractor;
  getLastDirectiveApplication: () => UserDirectiveApplicationResult | null;
}

export interface CreateAiChatBackgroundMemoryRuntimeParams {
  enabled: boolean;
  getSessionMemory: () => AiSessionMemory;
  setSessionMemory: (next: AiSessionMemory) => void;
  persistSessionMemory: (next: AiSessionMemory) => void;
}

function normalizeFactText(input: string): string {
  return input.trim().replace(/\s+/g, ' ').slice(0, MAX_FACT_CHARS);
}

function extractExplicitMemoryFact(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const patterns = [
    /^(?:请)?记住[：:\s]+(.+)$/u,
    /^以后(?:请)?(?:都)?(?:用|使用|按|优先|保持)[：:\s]*(.+)$/u,
    /^(?:我的)?偏好(?:是|为|：|:|\s)+(.+)$/u,
    /^remember(?: that)?[\s:]+(.+)$/iu,
    /^please remember(?: that)?[\s:]+(.+)$/iu,
    /^my preference is[\s:]+(.+)$/iu,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    const fact = match?.[1]?.trim();
    if (fact) return normalizeFactText(fact);
  }
  return null;
}

export function extractBackgroundMemoryFacts(input: BackgroundMemoryExtractionInput): readonly ExtractedMemoryFact[] {
  const directiveLines = new Set(
    extractUserDirectives({ userText: input.userText, source: 'background_extracted' })
      .map((directive) => directive.text.toLocaleLowerCase()),
  );
  const candidates = input.userText
    .split(/\n+/)
    .map((line) => {
      const fact = extractExplicitMemoryFact(line);
      if (!fact) return null;
      return directiveLines.has(fact.toLocaleLowerCase()) ? null : fact;
    })
    .filter((fact): fact is string => !!fact);

  const seen = new Set<string>();
  const facts: ExtractedMemoryFact[] = [];
  for (const fact of candidates) {
    const key = fact.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    facts.push({ fact, confidence: 0.78 });
  }
  return facts.slice(0, 5);
}

export function appendBackgroundFactsToSessionMemory(
  memory: AiSessionMemory,
  facts: readonly ExtractedMemoryFact[],
  createdAt = nowIso(),
): { nextMemory: AiSessionMemory; writtenCount: number } {
  const existingFacts = memory.projectFacts ?? [];
  const seen = new Set(existingFacts.map((item) => normalizeFactText(item.fact).toLocaleLowerCase()));
  const additions = facts
    .map((item) => normalizeFactText(item.fact))
    .filter((fact) => {
      if (!fact) return false;
      const key = fact.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((fact) => ({ fact, source: 'background-extracted' as const, createdAt }));

  if (additions.length === 0) return { nextMemory: memory, writtenCount: 0 };
  const nextFacts = [...existingFacts, ...additions].slice(-MAX_BACKGROUND_FACTS);
  return {
    nextMemory: {
      ...memory,
      projectFacts: nextFacts,
    },
    writtenCount: additions.length,
  };
}

export function createAiChatBackgroundMemoryRuntime(params: CreateAiChatBackgroundMemoryRuntimeParams): AiChatBackgroundMemoryRuntime {
  let lastDirectiveApplication: UserDirectiveApplicationResult | null = null;
  const extractor = new BackgroundMemoryExtractor({
    enabled: params.enabled,
    actorId: 'ai-chat',
    extractFacts: extractBackgroundMemoryFacts,
    writeFacts: (facts, input) => {
      const directives = extractUserDirectives({
        userText: input.userText,
        source: 'background_extracted',
        sourceMessageId: input.assistantMessageId,
      });
      lastDirectiveApplication = applyUserDirectivesToSessionMemory(params.getSessionMemory(), directives);
      const { nextMemory, writtenCount } = appendBackgroundFactsToSessionMemory(lastDirectiveApplication.nextMemory, facts);
      if (writtenCount > 0) {
        params.setSessionMemory(nextMemory);
        params.persistSessionMemory(nextMemory);
      } else if (lastDirectiveApplication.ledgerEntries.length > 0) {
        params.setSessionMemory(lastDirectiveApplication.nextMemory);
        params.persistSessionMemory(lastDirectiveApplication.nextMemory);
      }
      return writtenCount + lastDirectiveApplication.ledgerEntries.length;
    },
  });
  return {
    extractor,
    getLastDirectiveApplication: () => lastDirectiveApplication,
  };
}

export function scheduleAndFlushBackgroundMemory(
  runtime: AiChatBackgroundMemoryRuntime,
  input: BackgroundMemoryExtractionInput,
  insertAuditLog: (entry: AuditLogDocType) => Promise<unknown>,
): void {
  const scheduleAudit = runtime.extractor.schedule(input);
  void insertAuditLog(buildBackgroundMemoryAuditLog(scheduleAudit));
  void flushBackgroundMemoryExtractor(runtime, insertAuditLog);
}

export function buildBackgroundMemoryAuditLog(
  audit: BackgroundMemoryExtractionAudit,
  directiveApplication?: UserDirectiveApplicationResult | null,
): AuditLogDocType {
  const directiveSummary = directiveApplication ? summarizeDirectiveApplication(directiveApplication) : null;
  return {
    id: newAuditLogId(),
    collection: 'ai_messages',
    documentId: audit.inputRange.conversationId,
    action: 'update',
    field: 'ai_background_memory_extraction',
    newValue: audit.status,
    source: 'ai',
    timestamp: nowIso(),
    requestId: audit.taskId,
    ...(audit.status === 'completed' ? { oldValue: 'scheduled' } : {}),
    metadataJson: JSON.stringify({
      schemaVersion: audit.schemaVersion,
      phase: 'background_memory_extraction',
      taskId: audit.taskId,
      actorId: audit.actorId,
      status: audit.status,
      inputRange: audit.inputRange,
      writtenCount: audit.writtenCount,
      durationMs: audit.durationMs,
      ...(directiveSummary ? { directiveSummary } : {}),
      ...(audit.skippedReason ? { skippedReason: audit.skippedReason } : {}),
      ...(audit.errorMessage ? { errorMessage: audit.errorMessage } : {}),
    }),
  };
}

export function buildUserDirectiveAuditLogs(
  directiveApplication: UserDirectiveApplicationResult | null,
  documentId: string,
): AuditLogDocType[] {
  if (!directiveApplication || directiveApplication.ledgerEntries.length === 0) return [];
  const summary = summarizeDirectiveApplication(directiveApplication);
  const timestamp = nowIso();
  return [
    {
      id: newAuditLogId(),
      collection: 'ai_messages',
      documentId,
      action: 'update',
      field: 'ai_user_directive_extraction',
      newValue: `extracted:${summary.extractedCount}`,
      source: 'ai',
      timestamp,
      requestId: `directive_extract_${timestamp}`,
      metadataJson: JSON.stringify({
        schemaVersion: 1,
        phase: 'user_directive_extraction',
        summary,
        ledgerEntries: directiveApplication.ledgerEntries,
      }),
    },
    {
      id: newAuditLogId(),
      collection: 'ai_messages',
      documentId,
      action: 'update',
      field: 'ai_user_directive_application',
      newValue: `accepted:${summary.acceptedCount};ignored:${summary.ignoredCount};downgraded:${summary.downgradedCount};superseded:${summary.supersededCount}`,
      source: 'ai',
      timestamp,
      requestId: `directive_${timestamp}`,
      metadataJson: JSON.stringify({
        schemaVersion: 1,
        phase: 'user_directive_application',
        summary,
        ledgerEntries: directiveApplication.ledgerEntries,
      }),
    },
  ];
}

export async function flushBackgroundMemoryExtractor(
  runtime: AiChatBackgroundMemoryRuntime,
  insertAuditLog: (entry: AuditLogDocType) => Promise<unknown>,
): Promise<void> {
  const result = await runtime.extractor.flush();
  if (!result) return;
  const directiveApplication = runtime.getLastDirectiveApplication();
  await insertAuditLog(buildBackgroundMemoryAuditLog(result, directiveApplication));
  for (const entry of buildUserDirectiveAuditLogs(directiveApplication, result.inputRange.conversationId)) {
    await insertAuditLog(entry);
  }
}
