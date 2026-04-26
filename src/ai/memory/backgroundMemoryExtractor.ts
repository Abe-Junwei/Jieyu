import type { BackgroundToolSandboxDecision } from '../sandbox/backgroundToolSandbox';

export const BACKGROUND_MEMORY_EXTRACTOR_SCHEMA_VERSION = 1;

export interface BackgroundMemoryExtractionInput {
  conversationId: string;
  assistantMessageId: string;
  userText: string;
  assistantText: string;
  actorId: string;
  schemaVersion?: number;
  mainChainMemoryWritten?: boolean;
}

export interface ExtractedMemoryFact {
  fact: string;
  confidence: number;
}

export interface BackgroundMemoryExtractionAudit {
  taskId: string;
  actorId: string;
  status: 'scheduled' | 'merged' | 'completed' | 'skipped' | 'failed';
  inputRange: {
    conversationId: string;
    assistantMessageIds: string[];
  };
  writtenCount: number;
  durationMs: number;
  schemaVersion: number;
  skippedReason?: 'disabled' | 'main-chain-memory-written' | 'schema-version-mismatch' | 'sandbox-denied' | 'empty-extraction';
  errorMessage?: string;
}

export interface BackgroundMemoryExtractorOptions {
  enabled: boolean;
  actorId: string;
  sandboxDecision?: BackgroundToolSandboxDecision;
  extractFacts: (input: BackgroundMemoryExtractionInput) => Promise<readonly ExtractedMemoryFact[]> | readonly ExtractedMemoryFact[];
  writeFacts: (facts: readonly ExtractedMemoryFact[], input: BackgroundMemoryExtractionInput) => Promise<number> | number;
  now?: () => number;
}

interface PendingRun {
  taskId: string;
  input: BackgroundMemoryExtractionInput;
  assistantMessageIds: string[];
}

function newTaskId(now: number): string {
  return `bgmem_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function mergeInput(current: BackgroundMemoryExtractionInput, next: BackgroundMemoryExtractionInput): BackgroundMemoryExtractionInput {
  return {
    ...next,
    userText: [current.userText, next.userText].filter((text) => text.trim()).join('\n\n'),
    assistantText: [current.assistantText, next.assistantText].filter((text) => text.trim()).join('\n\n'),
  };
}

function auditBase(task: PendingRun, status: BackgroundMemoryExtractionAudit['status'], now: number, startedAt: number): BackgroundMemoryExtractionAudit {
  return {
    taskId: task.taskId,
    actorId: task.input.actorId,
    status,
    inputRange: {
      conversationId: task.input.conversationId,
      assistantMessageIds: task.assistantMessageIds,
    },
    writtenCount: 0,
    durationMs: Math.max(0, now - startedAt),
    schemaVersion: BACKGROUND_MEMORY_EXTRACTOR_SCHEMA_VERSION,
  };
}

export class BackgroundMemoryExtractor {
  private pending: PendingRun | null = null;

  constructor(private readonly options: BackgroundMemoryExtractorOptions) {}

  schedule(input: BackgroundMemoryExtractionInput): BackgroundMemoryExtractionAudit {
    const now = this.options.now?.() ?? Date.now();
    const taskInput = { ...input, actorId: input.actorId || this.options.actorId };
    const task: PendingRun = {
      taskId: this.pending?.taskId ?? newTaskId(now),
      input: this.pending ? mergeInput(this.pending.input, taskInput) : taskInput,
      assistantMessageIds: [...(this.pending?.assistantMessageIds ?? []), taskInput.assistantMessageId],
    };
    this.pending = task;
    return auditBase(task, this.pending.assistantMessageIds.length > 1 ? 'merged' : 'scheduled', now, now);
  }

  async flush(): Promise<BackgroundMemoryExtractionAudit | null> {
    const task = this.pending;
    if (!task) return null;
    this.pending = null;
    const startedAt = this.options.now?.() ?? Date.now();
    const finish = (status: BackgroundMemoryExtractionAudit['status'], skippedReason?: BackgroundMemoryExtractionAudit['skippedReason']): BackgroundMemoryExtractionAudit => ({
      ...auditBase(task, status, this.options.now?.() ?? Date.now(), startedAt),
      ...(skippedReason ? { skippedReason } : {}),
    });
    if (!this.options.enabled) return finish('skipped', 'disabled');
    if (task.input.mainChainMemoryWritten) return finish('skipped', 'main-chain-memory-written');
    if ((task.input.schemaVersion ?? BACKGROUND_MEMORY_EXTRACTOR_SCHEMA_VERSION) !== BACKGROUND_MEMORY_EXTRACTOR_SCHEMA_VERSION) {
      return finish('skipped', 'schema-version-mismatch');
    }
    if (this.options.sandboxDecision && this.options.sandboxDecision.action !== 'allow') return finish('skipped', 'sandbox-denied');
    try {
      const facts = await this.options.extractFacts(task.input);
      if (facts.length === 0) return finish('skipped', 'empty-extraction');
      const writtenCount = await this.options.writeFacts(facts, task.input);
      return { ...finish('completed'), writtenCount: Math.max(0, Math.floor(writtenCount)) };
    } catch (error) {
      return {
        ...finish('failed'),
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
