// @vitest-environment jsdom

import { describe, expect, it, beforeEach } from 'vitest';
import {
  appendProjectAiMemory,
  clearProjectAiMemory,
  exportProjectAiMemory,
  importProjectAiMemory,
  readProjectAiMemory,
  getProjectAiMemoryUserPreferences,
  type ProjectAiMemoryEntry,
} from './projectAiMemory';

const TEST_PROJECT = 'test-project-001';

beforeEach(() => {
  clearProjectAiMemory(TEST_PROJECT);
});

describe('projectAiMemory', () => {
  it('reads empty array when no memory exists', () => {
    expect(readProjectAiMemory(TEST_PROJECT)).toEqual([]);
  });

  it('appends entries and reads them back', () => {
    const written = appendProjectAiMemory(TEST_PROJECT, [
      { content: 'prefer concise answers', category: 'user_preference', confidence: 0.9 },
    ]);
    expect(written).toBe(1);
    const entries = readProjectAiMemory(TEST_PROJECT);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.content).toBe('prefer concise answers');
    expect(entries[0]?.category).toBe('user_preference');
    expect(entries[0]?.ttlDays).toBe(90);
  });

  it('deduplicates by content case-insensitively', () => {
    appendProjectAiMemory(TEST_PROJECT, [
      { content: 'prefer concise', category: 'user_preference', confidence: 0.9 },
    ]);
    const written = appendProjectAiMemory(TEST_PROJECT, [
      { content: 'PREFER CONCISE', category: 'user_preference', confidence: 0.8 },
    ]);
    expect(written).toBe(0);
    expect(readProjectAiMemory(TEST_PROJECT)).toHaveLength(1);
  });

  it('assigns default TTL per category', () => {
    appendProjectAiMemory(TEST_PROJECT, [
      { content: 'pref-a', category: 'user_preference', confidence: 0.9 },
      { content: 'pat-b', category: 'workflow_pattern', confidence: 0.9 },
      { content: 'rej-c', category: 'rejected_suggestion', confidence: 0.9 },
    ]);
    const entries = readProjectAiMemory(TEST_PROJECT);
    expect(entries.find((e) => e.content === 'pref-a')?.ttlDays).toBe(90);
    expect(entries.find((e) => e.content === 'pat-b')?.ttlDays).toBe(30);
    expect(entries.find((e) => e.content === 'rej-c')?.ttlDays).toBe(7);
  });

  it('evicts expired entries on read', () => {
    // Manually inject an expired entry
    const expiredEntry: ProjectAiMemoryEntry = {
      id: 'exp-001',
      content: 'old fact',
      category: 'user_preference',
      confidence: 0.9,
      createdAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
      ttlDays: 90,
    };
    const key = 'jieyu.ai.memory.test-project-001.v1';
    window.localStorage.setItem(key, JSON.stringify({
      schemaVersion: 1,
      projectId: TEST_PROJECT,
      entries: [expiredEntry],
      updatedAt: new Date().toISOString(),
    }));
    expect(readProjectAiMemory(TEST_PROJECT)).toEqual([]);
  });

  it('caps entries at 500 by evicting lowest score', () => {
    const inputs = Array.from({ length: 510 }, (_, i) => ({
      content: `fact-${i}`,
      category: 'workflow_pattern' as const,
      confidence: i < 10 ? 0.1 : 0.9,
    }));
    appendProjectAiMemory(TEST_PROJECT, inputs);
    const entries = readProjectAiMemory(TEST_PROJECT);
    expect(entries.length).toBeLessThanOrEqual(500);
    // Low-confidence entries should be evicted first
    expect(entries.some((e) => e.content.startsWith('fact-0') && e.confidence === 0.1)).toBe(false);
  });

  it('clears all entries for a project', () => {
    appendProjectAiMemory(TEST_PROJECT, [
      { content: 'to be cleared', category: 'user_preference', confidence: 0.9 },
    ]);
    clearProjectAiMemory(TEST_PROJECT);
    expect(readProjectAiMemory(TEST_PROJECT)).toEqual([]);
  });

  it('exports and imports memory snapshot', () => {
    appendProjectAiMemory(TEST_PROJECT, [
      { content: 'export-me', category: 'user_preference', confidence: 0.9 },
    ]);
    const exported = exportProjectAiMemory(TEST_PROJECT);
    expect(exported).not.toBeNull();
    expect(exported?.entries.length).toBe(1);

    clearProjectAiMemory(TEST_PROJECT);
    const imported = importProjectAiMemory(TEST_PROJECT, exported);
    expect(imported).toBe(1);
    expect(readProjectAiMemory(TEST_PROJECT)[0]?.content).toBe('export-me');
  });

  it('skips import when schema version mismatches', () => {
    const result = importProjectAiMemory(TEST_PROJECT, { schemaVersion: 999, entries: [] });
    expect(result).toBe(0);
  });

  it('returns user preferences sorted by recency', () => {
    // Manually inject entries with staggered timestamps to avoid same-ms collision
    const key = 'jieyu.ai.memory.test-project-001.v1';
    const now = Date.now();
    window.localStorage.setItem(key, JSON.stringify({
      schemaVersion: 1,
      projectId: TEST_PROJECT,
      entries: [
        { id: 'a1', content: 'older', category: 'user_preference', confidence: 0.9, createdAt: new Date(now - 2000).toISOString(), ttlDays: 90 },
        { id: 'a2', content: 'newer', category: 'user_preference', confidence: 0.9, createdAt: new Date(now - 1000).toISOString(), ttlDays: 90 },
        { id: 'a3', content: 'not-pref', category: 'workflow_pattern', confidence: 0.9, createdAt: new Date(now).toISOString(), ttlDays: 30 },
      ],
      updatedAt: new Date(now).toISOString(),
    }));
    const prefs = getProjectAiMemoryUserPreferences(TEST_PROJECT);
    expect(prefs).toEqual(['newer', 'older']);
  });

  it('clips confidence to [0, 1]', () => {
    appendProjectAiMemory(TEST_PROJECT, [
      { content: 'over', category: 'user_preference', confidence: 1.5 },
      { content: 'under', category: 'user_preference', confidence: -0.5 },
    ]);
    const entries = readProjectAiMemory(TEST_PROJECT);
    expect(entries.find((e) => e.content === 'over')?.confidence).toBe(1);
    expect(entries.find((e) => e.content === 'under')?.confidence).toBe(0);
  });
});
