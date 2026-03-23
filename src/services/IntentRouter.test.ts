// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { toBcp47, toIso639_3, knownIso639_3Codes, resolveLanguageQuery } from '../utils/langMapping';
import {
  routeIntent,
  collectAlternativeIntents,
  LOW_CONFIDENCE_THRESHOLD,
  isDestructiveAction,
  shouldConfirmFuzzyAction,
  getActionLabel,
  createVoiceSession,
  exportReplaySequence,
  learnVoiceIntentAliasFromMap,
  learnVoiceIntentAlias,
  bumpAliasUsage,
  pruneStaleVoiceAliases,
  loadVoiceAliasMetaMap,
  saveVoiceIntentAliasMap,
  clearVoiceAliasLearningLog,
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

  describe('resolveLanguageQuery', () => {
    it('resolves newly-added China language aliases', () => {
      expect(resolveLanguageQuery('客家话')).toBe('hak');
      expect(resolveLanguageQuery('赣语')).toBe('gan');
      expect(resolveLanguageQuery('晋语')).toBe('cjy');
      expect(resolveLanguageQuery('壮文')).toBe('zha');
      expect(resolveLanguageQuery('满语')).toBe('mnc');
      expect(resolveLanguageQuery('哈萨克语')).toBe('kaz');
    });
  });
});

// ── IntentRouter tests ──

describe('IntentRouter', () => {
  describe('routeIntent — command mode', () => {
    it('matches Chinese playback commands', () => {
      expect(routeIntent('播放')).toEqual({ type: 'action', actionId: 'playPause', confidence: 1, raw: '播放' });
      expect(routeIntent('暂停')).toEqual({ type: 'action', actionId: 'playPause', confidence: 1, raw: '暂停' });
      expect(routeIntent('停')).toEqual({ type: 'action', actionId: 'playPause', confidence: 1, raw: '停' });
    });

    it('matches English playback commands', () => {
      expect(routeIntent('play')).toEqual({ type: 'action', actionId: 'playPause', confidence: 1, raw: 'play' });
      expect(routeIntent('pause')).toEqual({ type: 'action', actionId: 'playPause', confidence: 1, raw: 'pause' });
    });

    it('matches colloquial playback via fuzzy rules without relying on a single-character keyword', () => {
      expect(routeIntent('播放一下')).toEqual({ type: 'action', actionId: 'playPause', confidence: 0.35, raw: '播放一下', fromFuzzy: true });
    });

    it('matches navigation commands', () => {
      expect(routeIntent('上一个')).toEqual({ type: 'action', actionId: 'navPrev', confidence: 1, raw: '上一个' });
      expect(routeIntent('下一个')).toEqual({ type: 'action', actionId: 'navNext', confidence: 1, raw: '下一个' });
      expect(routeIntent('上一句')).toEqual({ type: 'action', actionId: 'navPrev', confidence: 1, raw: '上一句' });
      expect(routeIntent('下一段')).toEqual({ type: 'action', actionId: 'navNext', confidence: 1, raw: '下一段' });
    });

    it('matches editing commands', () => {
      expect(routeIntent('删除')).toEqual({ type: 'action', actionId: 'deleteSegment', confidence: 1, raw: '删除' });
      expect(routeIntent('撤销')).toEqual({ type: 'action', actionId: 'undo', confidence: 1, raw: '撤销' });
      expect(routeIntent('重做')).toEqual({ type: 'action', actionId: 'redo', confidence: 1, raw: '重做' });
      expect(routeIntent('标记')).toEqual({ type: 'action', actionId: 'markSegment', confidence: 1, raw: '标记' });
      expect(routeIntent('取消')).toEqual({ type: 'action', actionId: 'cancel', confidence: 1, raw: '取消' });
      expect(routeIntent('分割')).toEqual({ type: 'action', actionId: 'splitSegment', confidence: 1, raw: '分割' });
    });

    it('matches merge commands', () => {
      expect(routeIntent('合并上一个')).toEqual({ type: 'action', actionId: 'mergePrev', confidence: 1, raw: '合并上一个' });
      expect(routeIntent('合并下一个')).toEqual({ type: 'action', actionId: 'mergeNext', confidence: 1, raw: '合并下一个' });
    });

    it('matches view commands', () => {
      expect(routeIntent('搜索')).toEqual({ type: 'action', actionId: 'search', confidence: 1, raw: '搜索' });
      expect(routeIntent('备注')).toEqual({ type: 'action', actionId: 'toggleNotes', confidence: 1, raw: '备注' });
    });

    it('strips trailing punctuation before matching', () => {
      expect(routeIntent('播放。')).toEqual({ type: 'action', actionId: 'playPause', confidence: 1, raw: '播放。' });
      expect(routeIntent('删除！')).toEqual({ type: 'action', actionId: 'deleteSegment', confidence: 1, raw: '删除！' });
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

    it('prefers alias map before exact and fuzzy rules', () => {
      const result = routeIntent('开始', 'command', {
        aliasMap: {
          '开始': 'playPause',
        },
      });
      expect(result).toEqual({ type: 'action', actionId: 'playPause', confidence: 1, raw: '开始', fromAlias: true });
    });

    it('suppresses pure-English fuzzy keywords when locale is zh', () => {
      const result = routeIntent('please next', 'command', {
        detectedLang: 'zh-CN',
      });
      expect(result.type).toBe('chat');
    });

    it('falls back to chat for unmatched input', () => {
      const result = routeIntent('今天天气怎么样');
      expect(result.type).toBe('chat');
      if (result.type === 'chat') {
        expect(result.text).toBe('今天天气怎么样');
      }
    });

    it('does not trigger low-risk fuzzy actions on ambiguous single-character utterances', () => {
      expect(routeIntent('开')).toEqual({ type: 'chat', text: '开', raw: '开' });
      expect(routeIntent('上')).toEqual({ type: 'chat', text: '上', raw: '上' });
      expect(routeIntent('下')).toEqual({ type: 'chat', text: '下', raw: '下' });
    });

    it('returns chat intent for empty input', () => {
      expect(routeIntent('')).toEqual({ type: 'chat', text: '', raw: '', confidence: 0 });
      expect(routeIntent('   ')).toEqual({ type: 'chat', text: '', raw: '   ', confidence: 0 });
    });

    it('treats missing stt confidence as neutral instead of max confidence', () => {
      const result = routeIntent('播放一下', 'command');
      expect(result).toEqual({ type: 'action', actionId: 'playPause', confidence: 0.35, raw: '播放一下', fromFuzzy: true });
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

  describe('shouldConfirmFuzzyAction', () => {
    it('requires confirmation for risky fuzzy actions only', () => {
      expect(shouldConfirmFuzzyAction('deleteSegment')).toBe(true);
      expect(shouldConfirmFuzzyAction('mergePrev')).toBe(true);
      expect(shouldConfirmFuzzyAction('splitSegment')).toBe(true);
    });

    it('does not require confirmation for low-risk fuzzy actions', () => {
      expect(shouldConfirmFuzzyAction('playPause')).toBe(false);
      expect(shouldConfirmFuzzyAction('navPrev')).toBe(false);
      expect(shouldConfirmFuzzyAction('search')).toBe(false);
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
          intent: { type: 'action', actionId: 'playPause', confidence: 0.95, raw: '播放' },
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
          intent: { type: 'action', actionId: 'deleteSegment', confidence: 0.91, raw: '删除' },
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

  describe('learnVoiceIntentAliasFromMap', () => {
    it('adds new alias when key is empty in map', () => {
      const learned = learnVoiceIntentAliasFromMap({}, '开始', 'playPause');
      expect(learned.applied).toBe(true);
      expect(learned.reason).toBe('updated');
      expect(learned.aliasMap['开始']).toBe('playPause');
    });

    it('keeps existing alias when conflicting action tries to overwrite', () => {
      const learned = learnVoiceIntentAliasFromMap(
        { '开始': 'playPause' },
        '开始',
        'deleteSegment',
      );
      expect(learned.applied).toBe(false);
      expect(learned.reason).toBe('conflict');
      expect(learned.aliasMap['开始']).toBe('playPause');
    });
  });

  // ── P3: Alias lifespan management | 别名生命周期管理 ──
  describe('alias metadata — bumpAliasUsage', () => {
    afterEach(() => {
      saveVoiceIntentAliasMap({});
      localStorage.removeItem('jieyu.voice.intent.aliases.meta');
      clearVoiceAliasLearningLog();
    });

    it('creates meta entry on first bump', () => {
      saveVoiceIntentAliasMap({ '开始': 'playPause' });
      bumpAliasUsage('开始');
      const meta = loadVoiceAliasMetaMap();
      expect(meta['开始']).toBeDefined();
      expect(meta['开始']!.usageCount).toBe(1);
      expect(meta['开始']!.lastUsedAt).toBeGreaterThan(0);
    });

    it('increments usageCount on subsequent bumps', () => {
      saveVoiceIntentAliasMap({ '开始': 'playPause' });
      bumpAliasUsage('开始');
      bumpAliasUsage('开始');
      const meta = loadVoiceAliasMetaMap();
      expect(meta['开始']!.usageCount).toBe(2);
    });

    it('normalizes phrase to lowercase key', () => {
      saveVoiceIntentAliasMap({ 'play now': 'playPause' });
      bumpAliasUsage('Play Now');
      const meta = loadVoiceAliasMetaMap();
      expect(meta['play now']).toBeDefined();
      expect(meta['play now']!.usageCount).toBe(1);
    });

    it('ignores empty phrase', () => {
      bumpAliasUsage('  ');
      const meta = loadVoiceAliasMetaMap();
      expect(Object.keys(meta)).toHaveLength(0);
    });
  });

  describe('alias metadata — pruneStaleVoiceAliases', () => {
    afterEach(() => {
      saveVoiceIntentAliasMap({});
      localStorage.removeItem('jieyu.voice.intent.aliases.meta');
      clearVoiceAliasLearningLog();
    });

    it('removes alias entries older than maxAgeDays', () => {
      saveVoiceIntentAliasMap({ '老命令': 'playPause', '新命令': 'undo' });
      const staleTime = Date.now() - 31 * 24 * 60 * 60 * 1000;
      localStorage.setItem('jieyu.voice.intent.aliases.meta', JSON.stringify({
        '老命令': { learnedAt: staleTime, lastUsedAt: staleTime, usageCount: 1 },
        '新命令': { learnedAt: Date.now(), lastUsedAt: Date.now(), usageCount: 3 },
      }));

      const pruned = pruneStaleVoiceAliases(30);
      expect(pruned).toBe(1);

      const meta = loadVoiceAliasMetaMap();
      expect(meta['老命令']).toBeUndefined();
      expect(meta['新命令']).toBeDefined();
    });

    it('preserves recently used aliases', () => {
      saveVoiceIntentAliasMap({ '播放': 'playPause' });
      localStorage.setItem('jieyu.voice.intent.aliases.meta', JSON.stringify({
        '播放': { learnedAt: Date.now(), lastUsedAt: Date.now(), usageCount: 10 },
      }));
      const pruned = pruneStaleVoiceAliases(30);
      expect(pruned).toBe(0);
    });

    it('treats alias with no meta as stale', () => {
      // Simulate pre-P3 alias map (no meta)
      saveVoiceIntentAliasMap({ '老别名': 'undo' });
      localStorage.removeItem('jieyu.voice.intent.aliases.meta');
      const pruned = pruneStaleVoiceAliases(0); // 0 days = anything stale
      expect(pruned).toBe(1);
    });

    it('returns 0 when nothing to prune', () => {
      saveVoiceIntentAliasMap({});
      const pruned = pruneStaleVoiceAliases(30);
      expect(pruned).toBe(0);
    });
  });

  describe('learnVoiceIntentAlias — creates meta entry', () => {
    afterEach(() => {
      saveVoiceIntentAliasMap({});
      localStorage.removeItem('jieyu.voice.intent.aliases.meta');
      clearVoiceAliasLearningLog();
    });

    it('initializes meta with learnedAt when alias is first learned', () => {
      const before = Date.now();
      learnVoiceIntentAlias('开始吧', 'playPause');
      const meta = loadVoiceAliasMetaMap();
      const entry = meta['开始吧'];
      expect(entry).toBeDefined();
      expect(entry!.learnedAt).toBeGreaterThanOrEqual(before);
      expect(entry!.usageCount).toBe(0);
    });
  });

  describe('routeIntent — fromAlias flag', () => {
    it('sets fromAlias=true when alias map matched', () => {
      const intent = routeIntent('开始', 'command', {
        aliasMap: { '开始': 'undo' },
      });
      if (intent.type !== 'action') throw new Error('expected action');
      expect(intent.fromAlias).toBe(true);
      expect(intent.actionId).toBe('undo');
    });

    it('does not set fromAlias for rule-based match', () => {
      const intent = routeIntent('播放', 'command');
      if (intent.type !== 'action') throw new Error('expected action');
      expect(intent.fromAlias).toBeUndefined();
    });
  });

  // ── collectAlternativeIntents | 消歧备选采集 ──────────────────────────────
  describe('collectAlternativeIntents', () => {
    it('returns empty for empty text', () => {
      expect(collectAlternativeIntents('', null, 0.5)).toEqual([]);
    });

    it('excludes the primary actionId from results', () => {
      // "停" matches fuzzy rule for "playPause"; verify it's excluded when primary
      const alts = collectAlternativeIntents('停止播放', 'playPause', 0.5);
      expect(alts.every((a) => a.actionId !== 'playPause')).toBe(true);
    });

    it('returns at most maxAlternatives candidates', () => {
      // Use a keyword that could match broadly; cap at 2
      const alts = collectAlternativeIntents('播放下一个', null, 0.9, 2);
      expect(alts.length).toBeLessThanOrEqual(2);
    });

    it('each alternative has fromFuzzy and lowered confidence', () => {
      const alts = collectAlternativeIntents('停', null, 0.8);
      for (const alt of alts) {
        expect(alt.fromFuzzy).toBe(true);
        expect(alt.confidence).toBeLessThan(0.8);
        expect(alt.confidence).toBeGreaterThan(0);
      }
    });

    it('LOW_CONFIDENCE_THRESHOLD is a number between 0 and 1', () => {
      expect(LOW_CONFIDENCE_THRESHOLD).toBeGreaterThan(0);
      expect(LOW_CONFIDENCE_THRESHOLD).toBeLessThan(1);
    });
  });
});
