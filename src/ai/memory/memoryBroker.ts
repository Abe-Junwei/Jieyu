import type { AiSessionMemory } from '../chat/chatDomain.types';
import { trimTextToMax } from '../chat/historyTrim';

export type MemoryChunkSource = 'session' | 'project';
export type MemorySuppressionReason = 'duplicate' | 'budget';

export interface ProjectMemoryCandidate {
  refId: string;
  text: string;
  score: number;
  updatedAt?: string;
  why?: string;
}

export interface ProjectMemoryStore {
  recall(input: { query: string; limit: number }): Promise<readonly ProjectMemoryCandidate[]>;
}

export interface MemoryChunk {
  source: MemoryChunkSource;
  refId: string;
  text: string;
  score: number;
  why: string;
  freshnessDays: number | null;
  estimatedTokens: number;
  suppressedBy?: MemorySuppressionReason;
}

export interface ResolveMemoryBrokerInput {
  query: string;
  tokenBudget: number;
  sessionMemory?: AiSessionMemory;
  projectMemoryStore?: ProjectMemoryStore;
  alreadySurfacedRefs?: readonly string[];
  now?: Date;
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.trim().length / 4));
}

function tokenize(text: string): string[] {
  const lowered = text.toLowerCase();
  const cjkChars = lowered.match(/[\u4e00-\u9fff]/g) ?? [];
  const latinWords = lowered.split(/[^\p{L}\p{N}]+/u).filter((item) => item.length >= 2);
  return [...new Set([...cjkChars, ...latinWords])];
}

function lexicalScore(queryTokens: readonly string[], text: string): number {
  if (queryTokens.length === 0) return 0;
  const lowered = text.toLowerCase();
  const hits = queryTokens.filter((token) => lowered.includes(token)).length;
  return hits / queryTokens.length;
}

function freshnessDaysFrom(raw: string | undefined, now: Date): number | null {
  if (!raw) return null;
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((now.getTime() - timestamp) / 86_400_000));
}

function normalizeCandidateText(text: string): string {
  return trimTextToMax(text.trim().replace(/\s+/g, ' '), 720);
}

function sessionCandidates(memory: AiSessionMemory | undefined, queryTokens: readonly string[], now: Date): MemoryChunk[] {
  if (!memory) return [];
  const chunks: MemoryChunk[] = [];
  const push = (refId: string, text: string, why: string, createdAt?: string): void => {
    const normalized = normalizeCandidateText(text);
    if (!normalized) return;
    const score = Math.min(1, 0.55 + lexicalScore(queryTokens, normalized) * 0.45);
    chunks.push({ source: 'session', refId, text: normalized, score, why, freshnessDays: freshnessDaysFrom(createdAt, now), estimatedTokens: estimateTokens(normalized) });
  };
  push('session:rolling-summary', memory.conversationSummary ?? '', 'rolling conversation summary');
  for (const entry of memory.summaryChain?.slice(-3) ?? []) {
    push(`session:summary:${entry.id}`, entry.summary, 'recent summary-chain entry', entry.createdAt);
  }
  for (const [index, fact] of (memory.projectFacts ?? []).entries()) {
    push(`session:project-fact:${index}`, fact.fact, `project fact from ${fact.source}`, fact.createdAt);
  }
  return chunks;
}

async function projectCandidates(store: ProjectMemoryStore | undefined, query: string, now: Date): Promise<MemoryChunk[]> {
  if (!store) return [];
  const rows = await store.recall({ query, limit: 12 });
  return rows
    .map((row): MemoryChunk | null => {
      const text = normalizeCandidateText(row.text);
      if (!text) return null;
      return { source: 'project' as const, refId: row.refId, text, score: Math.max(0, Math.min(1, row.score)), why: row.why ?? 'project memory recall', freshnessDays: freshnessDaysFrom(row.updatedAt, now), estimatedTokens: estimateTokens(text) };
    })
    .filter((row): row is MemoryChunk => row !== null);
}

export async function resolveMemoryBroker(input: ResolveMemoryBrokerInput): Promise<MemoryChunk[]> {
  const query = input.query.trim();
  if (!query || input.tokenBudget <= 0) return [];
  const now = input.now ?? new Date();
  const queryTokens = tokenize(query);
  const surfaced = new Set((input.alreadySurfacedRefs ?? []).map((ref) => ref.trim()).filter(Boolean));
  const candidates = [
    ...sessionCandidates(input.sessionMemory, queryTokens, now),
    ...await projectCandidates(input.projectMemoryStore, query, now),
  ].sort((a, b) => b.score - a.score || a.estimatedTokens - b.estimatedTokens);
  const seen = new Set<string>();
  let remaining = Math.max(0, Math.floor(input.tokenBudget));
  return candidates.map((candidate) => {
    const duplicate = seen.has(candidate.refId) || surfaced.has(candidate.refId);
    seen.add(candidate.refId);
    if (duplicate) return { ...candidate, suppressedBy: 'duplicate' as const };
    if (candidate.estimatedTokens > remaining) return { ...candidate, suppressedBy: 'budget' as const };
    remaining -= candidate.estimatedTokens;
    return candidate;
  });
}

export function formatMemoryBrokerContext(chunks: readonly MemoryChunk[]): string {
  const selected = chunks.filter((chunk) => chunk.suppressedBy === undefined);
  if (selected.length === 0) return '';
  const lines = selected.map((chunk, index) => {
    const freshness = chunk.freshnessDays === null ? 'unknown' : `${chunk.freshnessDays}d`;
    return `[${index + 1}] (${chunk.source}:${chunk.refId}; score=${chunk.score.toFixed(2)}; freshness=${freshness}; why=${chunk.why}) ${chunk.text}`;
  });
  return `[MEMORY_BROKER_CONTEXT]\n${lines.join('\n')}`;
}
