import { describe, expect, it } from 'vitest';
import { shouldRetrieve } from './ragReflection';

describe('shouldRetrieve', () => {
  // ── SKIP cases ────────────────────────────────────────────────────────────
  describe('skip — 闲聊和纯操作指令 | greetings and pure commands', () => {
    it.each([
      '你好',
      '您好！',
      'Hello',
      'hi there',
      '谢谢',
      '感谢！',
      'Thanks',
      'thank you',
      '设置一下',
      '打开吧',
      '关闭请',
      '暂停',
      '播放吧',
    ])('"%s" → skip', (text) => {
      expect(shouldRetrieve(text)).toBe('skip');
    });

    it('空字符串 → skip | empty string returns skip', () => {
      expect(shouldRetrieve('')).toBe('skip');
      expect(shouldRetrieve('   ')).toBe('skip');
    });
  });

  // ── FORCE cases ───────────────────────────────────────────────────────────
  describe('force — 明确需要语料库上下文 | requires corpus context', () => {
    it.each([
      '帮我查找上次录的语段',
      '搜索一下笔记里的内容',
      '之前有没有标注过这个词',
      '在PDF里找一下这个术语',
      '这个词条是什么意思，查一下文档',
      '引用一下原文中的描述',
      '上次转写的内容是什么',
      'search for the unit about phonology',
      'look up the PDF annotation',
      '来源是哪个语料？',
    ])('"%s" → force', (text) => {
      expect(shouldRetrieve(text)).toBe('force');
    });
  });

  // ── DEFAULT (retrieve) cases ──────────────────────────────────────────────
  describe('retrieve — 默认执行检索 | default retrieval for uncertain inputs', () => {
    it.each([
      '这个语言的语音系统怎么描述？',
      '解释一下元音和谐的概念',
      'What is the difference between phoneme and allophone?',
      '如何标记疑问语调',
      '翻译这段话的意思',
      '这个词有几个音节',
    ])('"%s" → retrieve', (text) => {
      expect(shouldRetrieve(text)).toBe('retrieve');
    });
  });
});
