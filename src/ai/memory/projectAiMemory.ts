/**
 * PR-11: Project-level AI memory persistence (localStorage).
 * Namespace: jieyu.ai.memory.<projectId>.v1
 * TTL: user_preference=90d, workflow_pattern=30d, rejected_suggestion=7d
 * Cap: 500 entries per project, evicted by confidence + recency.
 */

type ProjectAiMemoryCategory = 'user_preference' | 'workflow_pattern' | 'rejected_suggestion';

export interface ProjectAiMemoryEntry {
  id: string;
  content: string;
  category: ProjectAiMemoryCategory;
  confidence: number;
  createdAt: string;
  ttlDays: number;
}

export interface ProjectAiMemorySnapshot {
  schemaVersion: 1;
  projectId: string;
  entries: ProjectAiMemoryEntry[];
  updatedAt: string;
}

const MEMORY_KEY_PREFIX = 'jieyu.ai.memory.';
const MEMORY_SCHEMA_VERSION = 1;
const MAX_ENTRIES_PER_PROJECT = 500;

const DEFAULT_TTL_DAYS: Record<ProjectAiMemoryCategory, number> = {
  user_preference: 90,
  workflow_pattern: 30,
  rejected_suggestion: 7,
};

function buildMemoryKey(projectId: string): string {
  return `${MEMORY_KEY_PREFIX}${projectId}.v${MEMORY_SCHEMA_VERSION}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function isExpired(entry: ProjectAiMemoryEntry): boolean {
  const created = new Date(entry.createdAt).getTime();
  if (Number.isNaN(created)) return true;
  const ttlMs = entry.ttlDays * 24 * 60 * 60 * 1000;
  return Date.now() - created > ttlMs;
}

function computeEvictionScore(entry: ProjectAiMemoryEntry): number {
  const ageMs = Date.now() - new Date(entry.createdAt).getTime();
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  // Lower score = more likely to be evicted; combine inverse confidence with age
  return entry.confidence * 100 - ageDays;
}

function gcEntries(entries: ProjectAiMemoryEntry[]): ProjectAiMemoryEntry[] {
  // Step 1: remove expired
  let alive = entries.filter((e) => !isExpired(e));
  // Step 2: cap by max entries, evict lowest score
  if (alive.length > MAX_ENTRIES_PER_PROJECT) {
    alive = alive
      .slice()
      .sort((a, b) => computeEvictionScore(b) - computeEvictionScore(a))
      .slice(0, MAX_ENTRIES_PER_PROJECT);
  }
  return alive;
}

function readRaw(projectId: string): ProjectAiMemorySnapshot | null {
  if (typeof window === 'undefined') return null;
  const key = buildMemoryKey(projectId);
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ProjectAiMemorySnapshot;
    if (parsed.schemaVersion !== MEMORY_SCHEMA_VERSION) return null;
    if (parsed.projectId !== projectId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeRaw(snapshot: ProjectAiMemorySnapshot): void {
  if (typeof window === 'undefined') return;
  const key = buildMemoryKey(snapshot.projectId);
  window.localStorage.setItem(key, JSON.stringify(snapshot));
}

export function readProjectAiMemory(projectId: string): ProjectAiMemoryEntry[] {
  const snapshot = readRaw(projectId);
  if (!snapshot) return [];
  return gcEntries(snapshot.entries);
}

export function appendProjectAiMemory(
  projectId: string,
  entries: Omit<ProjectAiMemoryEntry, 'id' | 'createdAt' | 'ttlDays'>[],
): number {
  if (typeof window === 'undefined') return 0;
  const snapshot = readRaw(projectId);
  const existing = snapshot ? snapshot.entries : [];
  const seen = new Set(existing.map((e) => e.content.toLocaleLowerCase()));

  const additions: ProjectAiMemoryEntry[] = [];
  for (const input of entries) {
    const content = input.content.trim();
    if (!content) continue;
    const key = content.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    additions.push({
      id: `pam_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      content,
      category: input.category,
      confidence: Math.max(0, Math.min(1, input.confidence)),
      createdAt: nowIso(),
      ttlDays: DEFAULT_TTL_DAYS[input.category] ?? 30,
    });
  }

  if (additions.length === 0) return 0;
  const nextEntries = gcEntries([...existing, ...additions]);
  writeRaw({
    schemaVersion: MEMORY_SCHEMA_VERSION,
    projectId,
    entries: nextEntries,
    updatedAt: nowIso(),
  });
  return additions.length;
}

export function clearProjectAiMemory(projectId: string): void {
  if (typeof window === 'undefined') return;
  const key = buildMemoryKey(projectId);
  window.localStorage.removeItem(key);
}

export function exportProjectAiMemory(projectId: string): ProjectAiMemorySnapshot | null {
  const snapshot = readRaw(projectId);
  if (!snapshot) return null;
  return {
    ...snapshot,
    entries: gcEntries(snapshot.entries),
  };
}

export function importProjectAiMemory(projectId: string, data: unknown): number {
  if (typeof data !== 'object' || data === null) return 0;
  const candidate = data as Partial<ProjectAiMemorySnapshot>;
  if (candidate.schemaVersion !== MEMORY_SCHEMA_VERSION) return 0;
  if (!Array.isArray(candidate.entries)) return 0;
  const validEntries = candidate.entries.filter((e): e is ProjectAiMemoryEntry => {
    if (typeof e !== 'object' || e === null) return false;
    return (
      typeof e.id === 'string' &&
      typeof e.content === 'string' &&
      typeof e.confidence === 'number' &&
      typeof e.createdAt === 'string' &&
      typeof e.ttlDays === 'number' &&
      (e.category === 'user_preference' || e.category === 'workflow_pattern' || e.category === 'rejected_suggestion')
    );
  });
  if (validEntries.length === 0) return 0;
  const nextEntries = gcEntries(validEntries);
  writeRaw({
    schemaVersion: MEMORY_SCHEMA_VERSION,
    projectId,
    entries: nextEntries,
    updatedAt: nowIso(),
  });
  return nextEntries.length;
}

export function getProjectAiMemoryUserPreferences(projectId: string): string[] {
  const entries = readProjectAiMemory(projectId);
  return entries
    .filter((e) => e.category === 'user_preference')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((e) => e.content);
}
