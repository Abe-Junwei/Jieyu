// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearConversationSummaryMemory,
  loadSessionMemory,
  patchSessionMemoryPreferences,
  setSessionMemoryMessagePinned,
  updateConversationSummaryMemory,
} from './sessionMemory';

describe('sessionMemory P2 helpers', () => {
  beforeEach(() => {
    window.localStorage.clear();
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
        lastIntent: 'utterance.search',
        lastQuery: '  你好  ',
        lastResultUtteranceIds: ['utt-1', '', 'utt-2'],
      },
    }));
    const loaded = loadSessionMemory();
    expect(loaded.localToolState?.lastIntent).toBe('utterance.search');
    expect(loaded.localToolState?.lastQuery).toBe('你好');
    expect(loaded.localToolState?.lastResultUtteranceIds).toEqual(['utt-1', 'utt-2']);
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

  it('toggles pinned message IDs in session memory', () => {
    const pinned = setSessionMemoryMessagePinned({}, 'msg-1', true);
    expect(pinned.pinnedMessageIds).toEqual(['msg-1']);

    const withSecond = setSessionMemoryMessagePinned(pinned, 'msg-2', true);
    expect(withSecond.pinnedMessageIds).toEqual(['msg-1', 'msg-2']);

    const unpinned = setSessionMemoryMessagePinned(withSecond, 'msg-1', false);
    expect(unpinned.pinnedMessageIds).toEqual(['msg-2']);
  });
});
