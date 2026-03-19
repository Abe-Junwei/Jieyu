import { describe, it, expect } from 'vitest';
import { toBcp47, toIso639_3, knownIso639_3Codes } from '../utils/langMapping';
import {
  routeIntent,
  isDestructiveAction,
  getActionLabel,
  createVoiceSession,
  exportReplaySequence,
} from './IntentRouter';

// ── langMapping tests ──

describe('langMapping', () => {
  describe('toBcp47', () => {
    it('maps common ISO 639-3 codes correctly', () => {
      expect(toBcp47('cmn')).toBe('zh-CN');
      expect(toBcp47('jpn')).toBe('ja-JP');
      expect(toBcp47('eng')).toBe('en-US');
      expect(toBcp47('fra')).toBe('fr-FR');
      expect(toBcp47('yue')).toBe('zh-HK');
    });

    it('is case-insensitive', () => {
      expect(toBcp47('CMN')).toBe('zh-CN');
      expect(toBcp47('Jpn')).toBe('ja-JP');
    });

    it('returns input unchanged for unknown codes', () => {
      expect(toBcp47('xyz')).toBe('xyz');
      expect(toBcp47('tok')).toBe('tok');
    });
  });

  describe('toIso639_3', () => {
    it('finds ISO 639-3 for exact BCP-47 match', () => {
      expect(toIso639_3('zh-CN')).toBe('cmn');
      expect(toIso639_3('ja-JP')).toBe('jpn');
      expect(toIso639_3('en-US')).toBe('eng');
    });

    it('returns undefined for unknown BCP-47', () => {
      expect(toIso639_3('xx-XX')).toBeUndefined();
    });
  });

  describe('knownIso639_3Codes', () => {
    it('returns a non-empty list', () => {
      const codes = knownIso639_3Codes();
      expect(codes.length).toBeGreaterThan(20);
      expect(codes).toContain('cmn');
      expect(codes).toContain('eng');
    });
  });
});

// ── IntentRouter tests ──

describe('IntentRouter', () => {
  describe('routeIntent — command mode', () => {
    it('matches Chinese playback commands', () => {
      expect(routeIntent('播放')).toEqual({ type: 'action', actionId: 'playPause', raw: '播放' });
      expect(routeIntent('暂停')).toEqual({ type: 'action', actionId: 'playPause', raw: '暂停' });
      expect(routeIntent('停')).toEqual({ type: 'action', actionId: 'playPause', raw: '停' });
    });

    it('matches English playback commands', () => {
      expect(routeIntent('play')).toEqual({ type: 'action', actionId: 'playPause', raw: 'play' });
      expect(routeIntent('pause')).toEqual({ type: 'action', actionId: 'playPause', raw: 'pause' });
    });

    it('matches navigation commands', () => {
      expect(routeIntent('上一个')).toEqual({ type: 'action', actionId: 'navPrev', raw: '上一个' });
      expect(routeIntent('下一个')).toEqual({ type: 'action', actionId: 'navNext', raw: '下一个' });
      expect(routeIntent('上一句')).toEqual({ type: 'action', actionId: 'navPrev', raw: '上一句' });
      expect(routeIntent('下一段')).toEqual({ type: 'action', actionId: 'navNext', raw: '下一段' });
    });

    it('matches editing commands', () => {
      expect(routeIntent('删除')).toEqual({ type: 'action', actionId: 'deleteSegment', raw: '删除' });
      expect(routeIntent('撤销')).toEqual({ type: 'action', actionId: 'undo', raw: '撤销' });
      expect(routeIntent('重做')).toEqual({ type: 'action', actionId: 'redo', raw: '重做' });
      expect(routeIntent('标记')).toEqual({ type: 'action', actionId: 'markSegment', raw: '标记' });
      expect(routeIntent('取消')).toEqual({ type: 'action', actionId: 'cancel', raw: '取消' });
      expect(routeIntent('分割')).toEqual({ type: 'action', actionId: 'splitSegment', raw: '分割' });
    });

    it('matches merge commands', () => {
      expect(routeIntent('合并上一个')).toEqual({ type: 'action', actionId: 'mergePrev', raw: '合并上一个' });
      expect(routeIntent('合并下一个')).toEqual({ type: 'action', actionId: 'mergeNext', raw: '合并下一个' });
    });

    it('matches view commands', () => {
      expect(routeIntent('搜索')).toEqual({ type: 'action', actionId: 'search', raw: '搜索' });
      expect(routeIntent('备注')).toEqual({ type: 'action', actionId: 'toggleNotes', raw: '备注' });
    });

    it('strips trailing punctuation before matching', () => {
      expect(routeIntent('播放。')).toEqual({ type: 'action', actionId: 'playPause', raw: '播放。' });
      expect(routeIntent('删除！')).toEqual({ type: 'action', actionId: 'deleteSegment', raw: '删除！' });
    });

    it('matches tool intents', () => {
      const result = routeIntent('自动标注');
      expect(result.type).toBe('tool');
      if (result.type === 'tool') {
        expect(result.toolName).toBe('auto_gloss_utterance');
      }
    });

    it('matches translation tool intent with target language', () => {
      const result = routeIntent('翻译成英语');
      expect(result.type).toBe('tool');
      if (result.type === 'tool') {
        expect(result.toolName).toBe('set_translation_text');
        expect(result.params['targetLang']).toBe('英语');
      }
    });

    it('matches slot-fill intents', () => {
      const result = routeIntent('文本是你好世界');
      expect(result.type).toBe('slot-fill');
      if (result.type === 'slot-fill') {
        expect(result.slotName).toBe('text');
        expect(result.value).toBe('你好世界');
      }
    });

    it('falls back to chat for unmatched input', () => {
      const result = routeIntent('今天天气怎么样');
      expect(result.type).toBe('chat');
      if (result.type === 'chat') {
        expect(result.text).toBe('今天天气怎么样');
      }
    });

    it('returns chat intent for empty input', () => {
      expect(routeIntent('')).toEqual({ type: 'chat', text: '', raw: '' });
      expect(routeIntent('   ')).toEqual({ type: 'chat', text: '', raw: '   ' });
    });
  });

  describe('routeIntent — dictation mode', () => {
    it('matches action commands even in dictation mode', () => {
      // Control commands (playback, navigation) should still work in dictation mode
      const result = routeIntent('播放', 'dictation');
      expect(result.type).toBe('action');
      if (result.type === 'action') {
        expect(result.actionId).toBe('playPause');
      }
    });

    it('treats plain dictation text as dictation type', () => {
      const result = routeIntent('这是一段很长的文字内容', 'dictation');
      expect(result.type).toBe('dictation');
    });

    it('matches exit-dictation command in dictation mode', () => {
      const result = routeIntent('退出听写', 'dictation');
      expect(result.type).toBe('action');
      if (result.type === 'action') {
        expect(result.actionId).toBe('cancel');
      }
    });
  });

  describe('routeIntent — analysis mode', () => {
    it('still matches known actions', () => {
      expect(routeIntent('播放', 'analysis').type).toBe('action');
    });

    it('routes unmatched text to chat', () => {
      const result = routeIntent('分析一下这个句子的语法结构', 'analysis');
      expect(result.type).toBe('chat');
    });
  });

  describe('isDestructiveAction', () => {
    it('identifies destructive actions', () => {
      expect(isDestructiveAction('deleteSegment')).toBe(true);
      expect(isDestructiveAction('mergePrev')).toBe(true);
      expect(isDestructiveAction('mergeNext')).toBe(true);
      expect(isDestructiveAction('splitSegment')).toBe(true);
    });

    it('does not flag non-destructive actions', () => {
      expect(isDestructiveAction('playPause')).toBe(false);
      expect(isDestructiveAction('navPrev')).toBe(false);
      expect(isDestructiveAction('undo')).toBe(false);
    });
  });

  describe('getActionLabel', () => {
    it('returns Chinese labels for known actions', () => {
      expect(getActionLabel('playPause')).toBe('播放/暂停');
      expect(getActionLabel('deleteSegment')).toBe('删除句段');
      expect(getActionLabel('undo')).toBe('撤销');
    });
  });

  describe('createVoiceSession', () => {
    it('creates a session with a unique id', () => {
      const s1 = createVoiceSession();
      const s2 = createVoiceSession();
      expect(s1.id).toBeTruthy();
      expect(s2.id).toBeTruthy();
      expect(s1.id).not.toBe(s2.id);
    });

    it('initializes with empty entries and command mode', () => {
      const s = createVoiceSession();
      expect(s.entries).toEqual([]);
      expect(s.mode).toBe('command');
      expect(s.startedAt).toBeGreaterThan(0);
    });
  });

  describe('exportReplaySequence', () => {
    it('exports replayable action entries only', () => {
      const s = createVoiceSession();
      s.entries = [
        {
          timestamp: 1000,
          sttText: '播放',
          confidence: 0.95,
          intent: { type: 'action', actionId: 'playPause', raw: '播放' },
        },
        {
          timestamp: 1100,
          sttText: '自动标注',
          confidence: 0.88,
          intent: { type: 'tool', toolName: 'auto_gloss_utterance', params: {}, raw: '自动标注' },
        },
        {
          timestamp: 1200,
          sttText: '删除',
          confidence: 0.91,
          intent: { type: 'action', actionId: 'deleteSegment', raw: '删除' },
        },
      ];

      const replay = exportReplaySequence(s);
      expect(replay).toEqual([
        {
          actionId: 'playPause',
          label: '播放/暂停',
          timestamp: 1000,
          confidence: 0.95,
          sourceText: '播放',
        },
        {
          actionId: 'deleteSegment',
          label: '删除句段',
          timestamp: 1200,
          confidence: 0.91,
          sourceText: '删除',
        },
      ]);
    });

    it('returns empty array when no action intent exists', () => {
      const s = createVoiceSession();
      s.entries = [
        {
          timestamp: 1300,
          sttText: '分析一下',
          confidence: 0.8,
          intent: { type: 'chat', text: '分析一下', raw: '分析一下' },
        },
      ];
      expect(exportReplaySequence(s)).toEqual([]);
    });
  });
});
