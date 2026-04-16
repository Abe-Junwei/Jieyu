/**
 * CommandResolver 测试 | CommandResolver tests
 *
 * 验证本地指令解析器的匹配和未匹配行为。
 */

import { describe, it, expect } from 'vitest';
import { resolveCommand } from './CommandResolver';

describe('CommandResolver', () => {
  // ── 句段操作 | Segment operations ──

  it.each([
    '删除当前句段',
    '删除这个句段',
    '删掉这条',
    '请帮我删除当前句段',
    'delete this segment',
  ])('should resolve "%s" to delete_transcription_segment', (text) => {
    const result = resolveCommand(text);
    expect(result).not.toBeNull();
    expect(result!.call.name).toBe('delete_transcription_segment');
    expect(result!.localMatch).toBe(true);
  });

  it.each([
    '移除现在所有分段',
    '删除全部句段',
    'delete all segments',
  ])('should resolve "%s" to batch delete_transcription_segment skeleton', (text) => {
    const result = resolveCommand(text);
    expect(result).not.toBeNull();
    expect(result!.call.name).toBe('delete_transcription_segment');
    expect(result!.call.arguments).toEqual({});
  });

  it.each([
    ['删除第五个句段', { segmentIndex: 5 }],
    ['删除第一个句段', { segmentIndex: 1 }],
    ['删除第一条句段', { segmentIndex: 1 }],
    ['删除前一个句段', { segmentPosition: 'previous' }],
    ['删除后一个句段', { segmentPosition: 'next' }],
    ['删除倒数第二个句段', { segmentPosition: 'penultimate' }],
    ['删除中间那个句段', { segmentPosition: 'middle' }],
    ['删除最后一个句段', { segmentPosition: 'last' }],
    ['delete the fifth segment', { segmentIndex: 5 }],
    ['delete the first segment', { segmentIndex: 1 }],
    ['delete the previous segment', { segmentPosition: 'previous' }],
    ['delete the last segment', { segmentPosition: 'last' }],
  ])('should resolve "%s" to delete_transcription_segment with selector', (text, expectedArgs) => {
    const result = resolveCommand(text);
    expect(result).not.toBeNull();
    expect(result!.call.name).toBe('delete_transcription_segment');
    expect(result!.call.arguments).toEqual(expectedArgs);
  });

  it.each([
    '新建句段',
    '创建一个句段',
    '插入句段',
    'create segment',
  ])('should resolve "%s" to create_transcription_segment', (text) => {
    const result = resolveCommand(text);
    expect(result).not.toBeNull();
    expect(result!.call.name).toBe('create_transcription_segment');
  });

  it.each([
    '切分句段',
    '分割当前句段',
    'split',
  ])('should resolve "%s" to split_transcription_segment (split)', (text) => {
    const result = resolveCommand(text);
    expect(result).not.toBeNull();
    expect(result!.call.name).toBe('split_transcription_segment');
  });

  it.each([
    '和前一句段合并',
    '向前合并句段',
    'merge previous segment',
  ])('should resolve "%s" to merge_prev', (text) => {
    const result = resolveCommand(text);
    expect(result).not.toBeNull();
    expect(result!.call.name).toBe('merge_prev');
  });

  it.each([
    '和后一句段合并',
    '向后合并句段',
    'merge next segment',
  ])('should resolve "%s" to merge_next', (text) => {
    const result = resolveCommand(text);
    expect(result).not.toBeNull();
    expect(result!.call.name).toBe('merge_next');
  });

  it.each([
    '合并两个句段',
    '合并选中句段',
    'merge selected segments',
  ])('should resolve "%s" to merge_transcription_segments', (text) => {
    const result = resolveCommand(text);
    expect(result).not.toBeNull();
    expect(result!.call.name).toBe('merge_transcription_segments');
  });

  // ── 自动标注 | Auto gloss ──

  it.each([
    '自动标注',
    '自动gloss',
    'auto gloss',
    '请帮我自动标注',
  ])('should resolve "%s" to auto_gloss_unit', (text) => {
    const result = resolveCommand(text);
    expect(result).not.toBeNull();
    expect(result!.call.name).toBe('auto_gloss_unit');
  });

  // ── 清空翻译 | Clear translation ──

  it.each([
    '清空翻译',
    '清除翻译文本',
    'clear translation',
  ])('should resolve "%s" to clear_translation_segment', (text) => {
    const result = resolveCommand(text);
    expect(result).not.toBeNull();
    expect(result!.call.name).toBe('clear_translation_segment');
  });

  it('should resolve "把第五个句段转写改为你好" with selector + text argument', () => {
    const result = resolveCommand('把第五个句段转写改为你好');
    expect(result).not.toBeNull();
    expect(result!.call.name).toBe('set_transcription_text');
    expect(result!.call.arguments).toEqual({ segmentIndex: 5, text: '你好' });
  });

  it('should resolve "set the fifth segment transcription to hello" with selector + text argument', () => {
    const result = resolveCommand('set the fifth segment transcription to hello');
    expect(result).not.toBeNull();
    expect(result!.call.name).toBe('set_transcription_text');
    expect(result!.call.arguments).toEqual({ segmentIndex: 5, text: 'hello' });
  });

  it('should resolve "清空最后一个句段翻译" with selector', () => {
    const result = resolveCommand('清空最后一个句段翻译');
    expect(result).not.toBeNull();
    expect(result!.call.name).toBe('clear_translation_segment');
    expect(result!.call.arguments).toEqual({ segmentPosition: 'last' });
  });

  it('should resolve "clear translation of the last segment" with selector', () => {
    const result = resolveCommand('clear translation of the last segment');
    expect(result).not.toBeNull();
    expect(result!.call.name).toBe('clear_translation_segment');
    expect(result!.call.arguments).toEqual({ segmentPosition: 'last' });
  });

  // ── 层操作 | Layer operations ──

  it('should resolve "创建日语转写层" with languageId and languageQuery', () => {
    const result = resolveCommand('创建日语转写层');
    expect(result).not.toBeNull();
    expect(result!.call.name).toBe('create_transcription_layer');
    expect(result!.call.arguments.languageId).toBe('jpn');
    expect(result!.call.arguments.languageQuery).toBe('日语');
  });

  it('does not treat quantifier as language in "新建一个转写层"', () => {
    const result = resolveCommand('新建一个转写层');
    expect(result).not.toBeNull();
    expect(result!.call.name).toBe('create_transcription_layer');
    expect(result!.call.arguments.languageId).toBeUndefined();
    expect(result!.call.arguments.languageQuery).toBeUndefined();
  });

  it('should resolve "新建英语翻译层" with languageId and languageQuery', () => {
    const result = resolveCommand('新建英语翻译层');
    expect(result).not.toBeNull();
    expect(result!.call.name).toBe('create_translation_layer');
    expect(result!.call.arguments.languageId).toBe('eng');
    expect(result!.call.arguments.languageQuery).toBe('英语');
  });

  // 多语言覆盖 | Multi-language coverage for create-layer commands
  it.each([
    ['创建英文转写层', 'create_transcription_layer', '英文', 'eng'],
    ['新建法语转写层', 'create_transcription_layer', '法语', 'fra'],
    ['创建韩语转写层', 'create_transcription_layer', '韩语', 'kor'],
    ['创建粤语转写层', 'create_transcription_layer', '粤语', 'yue'],
    ['创建西班牙语翻译层', 'create_translation_layer', '西班牙语', 'spa'],
    ['create English transcription layer', 'create_transcription_layer', 'English', 'eng'],
    ['add French translation layer', 'create_translation_layer', 'French', 'fra'],
  ])('should resolve "%s" → %s with languageId "%s"', (input, toolName, lang, code) => {
    const result = resolveCommand(input);
    expect(result).not.toBeNull();
    expect(result!.call.name).toBe(toolName);
    expect(result!.call.arguments.languageId).toBe(code);
    expect(result!.call.arguments.languageQuery).toBe(lang);
  });

  it('keeps ambiguous language in clarify state for "新增中文翻译层"', () => {
    const result = resolveCommand('新增中文翻译层');
    expect(result).not.toBeNull();
    expect(result!.call.name).toBe('create_translation_layer');
    expect(result!.call.arguments.languageId).toBeUndefined();
    expect(result!.call.arguments.languageQuery).toBeUndefined();
  });

  it('should resolve "删除转写层" to delete_layer with layerType', () => {
    const result = resolveCommand('删除转写层');
    expect(result).not.toBeNull();
    expect(result!.call.name).toBe('delete_layer');
    expect(result!.call.arguments.layerType).toBe('transcription');
  });

  it('should resolve "删除翻译层" to delete_layer with layerType', () => {
    const result = resolveCommand('删除翻译层');
    expect(result).not.toBeNull();
    expect(result!.call.name).toBe('delete_layer');
    expect(result!.call.arguments.layerType).toBe('translation');
  });

  it.each([
    '关联翻译层',
    'link translation layer',
  ])('should resolve "%s" to link_translation_layer', (text) => {
    const result = resolveCommand(text);
    expect(result).not.toBeNull();
    expect(result!.call.name).toBe('link_translation_layer');
  });

  it.each([
    '解除翻译层',
    '断开翻译层',
    'unlink translation layer',
  ])('should resolve "%s" to unlink_translation_layer', (text) => {
    const result = resolveCommand(text);
    expect(result).not.toBeNull();
    expect(result!.call.name).toBe('unlink_translation_layer');
  });

  // ── 文本写入（带 text 参数）| Text write with text argument ──

  it('should resolve "转写改为你好" with text argument', () => {
    const result = resolveCommand('转写改为你好');
    expect(result).not.toBeNull();
    expect(result!.call.name).toBe('set_transcription_text');
    expect(result!.call.arguments.text).toBe('你好');
  });

  it('should resolve "把转写写入hello world" with text argument', () => {
    const result = resolveCommand('把转写写入hello world');
    expect(result).not.toBeNull();
    expect(result!.call.name).toBe('set_transcription_text');
    expect(result!.call.arguments.text).toBe('hello world');
  });

  // ── 语音指令前缀剥离 | Voice prefix stripping ──

  it('should strip [语音指令] prefix and still match', () => {
    const result = resolveCommand('[语音指令] 自动标注');
    expect(result).not.toBeNull();
    expect(result!.call.name).toBe('auto_gloss_unit');
  });

  // ── 不应命中的输入 | Should NOT match ──

  it.each([
    '你好',
    '这个层的标注效果怎么样？',
    '什么是转写？',
    '帮我分析一下这段音频',
    '',
    'a',
    '解释一下 delete_layer 的用法',
  ])('should return null for ambiguous/chat text: "%s"', (text) => {
    expect(resolveCommand(text)).toBeNull();
  });

  // ── ID 参数不由 resolver 填充 | IDs are NOT filled by resolver ──

  it('should not include unitId or layerId in resolved call', () => {
    const result = resolveCommand('删除当前句段');
    expect(result).not.toBeNull();
    expect(result!.call.arguments.unitId).toBeUndefined();
    expect(result!.call.arguments.layerId).toBeUndefined();
  });
});
