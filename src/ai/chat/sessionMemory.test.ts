// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildUserDirectivePrompt } from './userDirectivePrompt';
import { buildSessionMemoryPromptDigest, clearConversationSummaryMemory, deactivateSessionDirective, loadSessionMemory, patchSessionMemoryPreferences, pruneDirectiveLedgerBySourceMessage, setSessionMemoryMessagePinned, updateConversationSummaryMemory } from './sessionMemory';

describe('sessionMemory P2 helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-25T00:00:00.000Z'));
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('patches layered preferences and keeps legacy flat aliases', () => {
    const next = patchSessionMemoryPreferences({}, {
      lastLanguage: 'cmn',
      lastLayerId: 'layer-a',
      lastToolName: 'delete_layer',
    });

    expect(next.preferences?.lastLanguage).toBe('cmn');
    expect(next.preferences?.lastLayerId).toBe('layer-a');
    expect(next.preferences?.lastToolName).toBe('delete_layer');
    expect(next.lastLanguage).toBe('cmn');
    expect(next.lastLayerId).toBe('layer-a');
    expect(next.lastToolName).toBe('delete_layer');
  });

  it('loads legacy storage into layered preferences', () => {
    window.localStorage.setItem('jieyu.aiChat.sessionMemory', JSON.stringify({
      lastLanguage: 'eng',
      lastToolName: 'set_transcription_text',
    }));

    const loaded = loadSessionMemory();
    expect(loaded.preferences?.lastLanguage).toBe('eng');
    expect(loaded.preferences?.lastToolName).toBe('set_transcription_text');
  });

  it('normalizes local tool state from storage', () => {
    window.localStorage.setItem('jieyu.aiChat.sessionMemory', JSON.stringify({
      localToolState: {
        lastIntent: 'unit.search',
        lastQuery: '  你好  ',
        lastResultUnitIds: ['utt-1', '', 'utt-2'],
      },
    }));
    const loaded = loadSessionMemory();
    expect(loaded.localToolState?.lastIntent).toBe('unit.search');
    expect(loaded.localToolState?.lastQuery).toBe('你好');
    expect(loaded.localToolState?.lastResultUnitIds).toEqual(['utt-1', 'utt-2']);
  });

  it('normalizes pending agent loop checkpoint from storage', () => {
    window.localStorage.setItem('jieyu.aiChat.sessionMemory', JSON.stringify({
      pendingAgentLoopCheckpoint: {
        kind: 'token_budget_warning',
        originalUserText: '  how many speakers are there in the project  ',
        continuationInput: '  __LOCAL_TOOL_RESULT__  ',
        step: 1.9,
      },
    }));
    const loaded = loadSessionMemory();
    expect(loaded.pendingAgentLoopCheckpoint).toMatchObject({
      kind: 'token_budget_warning',
      originalUserText: 'how many speakers are there in the project',
      continuationInput: '__LOCAL_TOOL_RESULT__',
      step: 1,
    });
  });

  it('normalizes persisted semantic stats frame from storage', () => {
    window.localStorage.setItem('jieyu.aiChat.sessionMemory', JSON.stringify({
      localToolState: {
        lastIntent: 'stats.get',
        lastScope: 'project',
        lastFrame: {
          domain: 'project_stats',
          questionKind: 'count',
          metric: 'speaker_count',
          metricCategory: 'total',
          scope: 'project',
          isQualityGapQuestion: false,
          source: 'tool',
        },
      },
    }));
    const loaded = loadSessionMemory();
    expect(loaded.localToolState?.lastIntent).toBe('stats.get');
    expect(loaded.localToolState?.lastFrame).toMatchObject({
      domain: 'project_stats',
      questionKind: 'count',
      metric: 'speaker_count',
      metricCategory: 'total',
      scope: 'project',
      isQualityGapQuestion: false,
    });
  });

  it('updates and clears conversation summary memory', () => {
    const withSummary = updateConversationSummaryMemory({}, 'summary text', 8, {
      similarityScore: 0.72,
      qualityWarningThreshold: 0.85,
      generatedAt: '2026-04-12T12:00:00.000Z',
    });
    expect(withSummary.conversationSummary).toBe('summary text');
    expect(withSummary.summaryTurnCount).toBe(8);
    const latestSummary = withSummary.summaryChain?.[withSummary.summaryChain.length - 1];
    expect(latestSummary?.summary).toBe('summary text');
    expect(withSummary.summaryQualityWarning?.similarity).toBe(0.72);

    const cleared = clearConversationSummaryMemory(withSummary);
    expect(cleared.conversationSummary).toBeUndefined();
    expect(cleared.summaryTurnCount).toBe(0);
    expect(cleared.summaryChain).toBeUndefined();
    expect(cleared.summaryQualityWarning).toBeUndefined();
  });

  it('builds a compact session-memory digest for tier-2 prompt context', () => {
    const memory = updateConversationSummaryMemory({}, '用户关注漏译与对齐', 4, { similarityScore: 0.9 });
    const digest = buildSessionMemoryPromptDigest(memory, 500);
    expect(digest).toContain('rollingSummary=');
    expect(digest).toContain('用户关注漏译与对齐');

    const withChain = updateConversationSummaryMemory(
      { summaryChain: [{ id: 'a', summary: 'older theme', coveredTurnCount: 2, createdAt: '2026-01-01' }] },
      'newer theme',
      3,
    );
    const chainDigest = buildSessionMemoryPromptDigest(withChain, 400);
    expect(chainDigest).toContain('earlierSummaries=');
  });

  it('prunes expired session directives and ledger entries when loading', () => {
    window.localStorage.setItem('jieyu.aiChat.sessionMemory', JSON.stringify({
      sessionDirectives: [
        {
          id: 'expired-dir',
          text: '过期的本轮规则',
          category: 'session',
          createdAt: '1970-01-01T00:00:00.000Z',
          expiresAt: '1970-01-01T00:00:00.000Z',
          source: 'background_extracted',
        },
      ],
      directiveLedger: [
        {
          id: 'expired-ledger',
          category: 'session',
          scope: 'session',
          text: '过期的本轮规则',
          action: 'accepted',
          source: 'background_extracted',
          confidence: 0.9,
          createdAt: '1970-01-01T00:00:00.000Z',
          expiresAt: '1970-01-01T00:00:00.000Z',
        },
      ],
    }));
    const loaded = loadSessionMemory();
    expect(loaded.sessionDirectives).toBeUndefined();
    expect(loaded.directiveLedger).toBeUndefined();
  });

  it('toggles pinned message IDs in session memory', () => {
    const pinned = setSessionMemoryMessagePinned({}, 'msg-1', true);
    expect(pinned.pinnedMessageIds).toEqual(['msg-1']);

    const withSecond = setSessionMemoryMessagePinned(pinned, 'msg-2', true);
    expect(withSecond.pinnedMessageIds).toEqual(['msg-1', 'msg-2']);

    const unpinned = setSessionMemoryMessagePinned(withSecond, 'msg-1', false);
    expect(unpinned.pinnedMessageIds).toEqual(['msg-2']);
  });

  it('deactivates a session directive and marks accepted ledger entry superseded', () => {
    const memory = {
      sessionDirectives: [
        {
          id: 'dir-1',
          text: '本轮只审查',
          category: 'session' as const,
          createdAt: '2026-04-25T00:00:00.000Z',
          source: 'user_explicit' as const,
        },
      ],
      directiveLedger: [
        {
          id: 'dir-1',
          category: 'session' as const,
          scope: 'session' as const,
          text: '本轮只审查',
          action: 'accepted' as const,
          source: 'user_explicit' as const,
          confidence: 0.9,
          createdAt: '2026-04-25T00:00:00.000Z',
        },
      ],
    };
    const next = deactivateSessionDirective(memory, 'dir-1');
    expect(next.sessionDirectives).toBeUndefined();
    expect(next.directiveLedger?.[0]).toMatchObject({
      id: 'dir-1',
      action: 'superseded',
      supersededBy: 'dir-1_deactivated',
    });
  });

  it('prunes directive ledger and refs by source message id', () => {
    const memory = {
      sessionDirectives: [
        {
          id: 'dir-a',
          text: '请用英文',
          category: 'response' as const,
          createdAt: '2026-04-25T00:00:00.000Z',
          source: 'pinned_message' as const,
          sourceMessageId: 'msg-1',
        },
        {
          id: 'dir-b',
          text: '不要删除',
          category: 'safety' as const,
          createdAt: '2026-04-25T00:00:00.000Z',
          source: 'user_explicit' as const,
          sourceMessageId: 'msg-2',
        },
      ],
      directiveLedger: [
        {
          id: 'dir-a',
          category: 'response' as const,
          scope: 'long_term' as const,
          text: '请用英文',
          action: 'accepted' as const,
          source: 'pinned_message' as const,
          confidence: 0.9,
          createdAt: '2026-04-25T00:00:00.000Z',
          sourceMessageId: 'msg-1',
        },
        {
          id: 'dir-b',
          category: 'safety' as const,
          scope: 'long_term' as const,
          text: '不要删除',
          action: 'accepted' as const,
          source: 'user_explicit' as const,
          confidence: 0.9,
          createdAt: '2026-04-25T00:00:00.000Z',
          sourceMessageId: 'msg-2',
        },
      ],
      pinnedDirectiveRefs: ['dir-a', 'dir-b'],
    };
    const next = pruneDirectiveLedgerBySourceMessage(memory, 'msg-1');
    expect(next.directiveLedger).toHaveLength(1);
    expect(next.directiveLedger?.[0]?.id).toBe('dir-b');
    expect(next.sessionDirectives).toHaveLength(1);
    expect(next.sessionDirectives?.[0]?.id).toBe('dir-b');
    expect(next.pinnedDirectiveRefs).toEqual(['dir-b']);
  });

  it('deactivates ledger-only long_term response preference: clears preferences and prompt lines', () => {
    const memory = {
      responsePreferences: { style: 'concise' as const },
      directiveLedger: [
        {
          id: 'dir-st',
          category: 'response' as const,
          scope: 'long_term' as const,
          text: '简洁',
          action: 'accepted' as const,
          source: 'user_explicit' as const,
          confidence: 0.88,
          createdAt: '2026-04-25T00:00:00.000Z',
          targetPath: 'responsePreferences.style',
          value: 'concise',
        },
      ],
    };
    const next = deactivateSessionDirective(memory, 'dir-st');
    expect(next.sessionDirectives).toBeUndefined();
    expect(next.responsePreferences).toBeUndefined();
    expect(next.directiveLedger?.[0]).toMatchObject({
      id: 'dir-st',
      action: 'superseded',
      supersededBy: 'dir-st_deactivated',
    });
    const prompt = buildUserDirectivePrompt(next);
    expect(prompt).toBe('');
  });

  it('deactivates terminology ledger entry: removes matching terminology pair', () => {
    const memory = {
      terminologyPreferences: [
        { source: 'foo', target: 'bar', createdAt: '2026-04-25T00:00:00.000Z' },
      ],
      directiveLedger: [
        {
          id: 'term-1',
          category: 'terminology' as const,
          scope: 'long_term' as const,
          text: '用 bar 指代 foo',
          action: 'accepted' as const,
          source: 'user_explicit' as const,
          confidence: 0.9,
          createdAt: '2026-04-25T00:00:00.000Z',
          targetPath: 'terminologyPreferences',
          value: 'foo=>bar',
        },
      ],
    };
    const next = deactivateSessionDirective(memory, 'term-1');
    expect(next.terminologyPreferences).toBeUndefined();
    expect(next.directiveLedger?.[0]?.action).toBe('superseded');
  });

  it('does not clear preference if current value was superseded by a newer value', () => {
    const memory = {
      responsePreferences: { language: 'zh-CN' as const },
      directiveLedger: [
        {
          id: 'old-lang',
          category: 'response' as const,
          scope: 'long_term' as const,
          text: '用英文',
          action: 'accepted' as const,
          source: 'user_explicit' as const,
          confidence: 0.9,
          createdAt: '2026-04-25T00:00:00.000Z',
          targetPath: 'responsePreferences.language',
          value: 'en',
        },
      ],
    };
    const next = deactivateSessionDirective(memory, 'old-lang');
    expect(next.responsePreferences?.language).toBe('zh-CN');
    expect(next.directiveLedger?.[0]?.action).toBe('superseded');
  });

  it('removes pinnedDirectiveRefs when deactivating that directive id', () => {
    const memory = {
      pinnedDirectiveRefs: ['dir-pinned', 'other'],
      directiveLedger: [
        {
          id: 'dir-pinned',
          category: 'response' as const,
          scope: 'long_term' as const,
          text: 'x',
          action: 'accepted' as const,
          source: 'user_explicit' as const,
          confidence: 0.9,
          createdAt: '2026-04-25T00:00:00.000Z',
          targetPath: 'responsePreferences.format',
          value: 'bullets',
        },
      ],
      responsePreferences: { format: 'bullets' as const },
    };
    const next = deactivateSessionDirective(memory, 'dir-pinned');
    expect(next.pinnedDirectiveRefs).toEqual(['other']);
  });
});
