/**
 * voiceIntentUi 单元测试
 * voiceIntentUi unit tests.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { getActionLabel, getVoiceAliasLearningReasonLabel, loadVoiceAliasLearningLog, clearVoiceAliasLearningLog, appendVoiceAliasLearningLog, type VoiceAliasLearningLogEntry } from './voiceIntentUi';

const STORAGE_KEY = 'jieyu.voice.intent.aliasLearningLog';

describe('voiceIntentUi', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // ── getActionLabel ────────────────────────────────────────────────────

  describe('getActionLabel', () => {
    it('returns non-empty string for valid actionId', () => {
      const label = getActionLabel('playPause');
      expect(label).toBeTruthy();
      expect(typeof label).toBe('string');
    });

    it('returns label for different actionIds', () => {
      const ids = ['undo', 'redo', 'search', 'toggleVoice'] as const;
      for (const id of ids) {
        expect(getActionLabel(id)).toBeTruthy();
      }
    });

    it('accepts explicit locale', () => {
      const labelZh = getActionLabel('playPause', 'zh-CN');
      const labelEn = getActionLabel('playPause', 'en-US');
      // 两种 locale 都应返回非空字符串 | Both locales should return non-empty
      expect(labelZh).toBeTruthy();
      expect(labelEn).toBeTruthy();
    });
  });

  // ── getVoiceAliasLearningReasonLabel ──────────────────────────────────

  describe('getVoiceAliasLearningReasonLabel', () => {
    it('returns label for each reason', () => {
      const reasons = ['empty', 'updated', 'unchanged', 'conflict'] as const;
      for (const reason of reasons) {
        const label = getVoiceAliasLearningReasonLabel(reason);
        expect(label).toBeTruthy();
      }
    });
  });

  // ── localStorage log CRUD ─────────────────────────────────────────────

  describe('loadVoiceAliasLearningLog', () => {
    it('returns empty array when no data', () => {
      expect(loadVoiceAliasLearningLog()).toEqual([]);
    });

    it('returns empty array for invalid JSON', () => {
      localStorage.setItem(STORAGE_KEY, 'not-json');
      expect(loadVoiceAliasLearningLog()).toEqual([]);
    });

    it('returns empty array for non-array JSON', () => {
      localStorage.setItem(STORAGE_KEY, '{"foo": 1}');
      expect(loadVoiceAliasLearningLog()).toEqual([]);
    });

    it('filters out invalid entries', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([
        { timestamp: 1, phrase: 'hi', actionId: 'playPause', reason: 'empty' },
        { bad: true },
        null,
      ]));
      const log = loadVoiceAliasLearningLog();
      expect(log).toHaveLength(1);
      expect(log[0]!.phrase).toBe('hi');
    });
  });

  describe('appendVoiceAliasLearningLog', () => {
    it('appends entry to empty log', () => {
      const entry: VoiceAliasLearningLogEntry = {
        timestamp: Date.now(),
        phrase: 'test',
        actionId: 'undo',
        reason: 'empty',
      };
      appendVoiceAliasLearningLog(entry);
      const log = loadVoiceAliasLearningLog();
      expect(log).toHaveLength(1);
      expect(log[0]!.actionId).toBe('undo');
    });

    it('trims to max 50 entries', () => {
      for (let i = 0; i < 55; i++) {
        appendVoiceAliasLearningLog({
          timestamp: i,
          phrase: `p${i}`,
          actionId: 'redo',
          reason: 'updated',
        });
      }
      const log = loadVoiceAliasLearningLog();
      expect(log).toHaveLength(50);
      // 最老的 5 条应被移除 | Oldest 5 should be removed
      expect(log[0]!.timestamp).toBe(5);
    });
  });

  describe('clearVoiceAliasLearningLog', () => {
    it('clears all entries', () => {
      appendVoiceAliasLearningLog({
        timestamp: 1,
        phrase: 'a',
        actionId: 'search',
        reason: 'empty',
      });
      expect(loadVoiceAliasLearningLog()).toHaveLength(1);
      clearVoiceAliasLearningLog();
      expect(loadVoiceAliasLearningLog()).toHaveLength(0);
    });

    it('no-op when already empty', () => {
      clearVoiceAliasLearningLog();
      expect(loadVoiceAliasLearningLog()).toHaveLength(0);
    });
  });
});
