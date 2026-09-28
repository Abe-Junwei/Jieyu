import { describe, expect, it } from 'vitest';
import { t, tf, type DictKey } from '../i18n';
import {
  composeAnnotationImportLosses,
  formatAnnotationImportDone,
  formatLexiconImportNotice,
} from './interchangeLossReport';

const translate = (key: string, params?: Record<string, string | number>) =>
  params ? tf('zh-CN', key as DictKey, params) : t('zh-CN', key as DictKey);

describe('formatAnnotationImportDone', () => {
  it('keeps the existing EAF sentences and stays at the segment count when nothing was lost', () => {
    const quiet = formatAnnotationImportDone({
      segmentCount: 2,
      tierCount: 0,
      losses: [],
      constraintRepairCount: 0,
      constraintWarningCount: 0,
      hostRecoveryWarningCount: 0,
      translate,
    });
    expect(quiet).toBe('已导入 2 条句段。');

    const noisy = formatAnnotationImportDone({
      segmentCount: 1,
      tierCount: 0,
      losses: composeAnnotationImportLosses({
        parserLosses: [{ code: 'unrecognized-time-unit' }],
        missingMediaFilename: 'missing.wav',
        unmatchedRefCount: 1,
        skippedIndependentTierSegmentCount: 3,
        droppedTranslationSegmentCount: 2,
        appendedWithoutId: false,
      }),
      constraintRepairCount: 0,
      constraintWarningCount: 0,
      hostRecoveryWarningCount: 0,
      translate,
    });
    expect(noisy).toContain('有 3 条独立层语段因缺少媒体而未导入。');
    expect(noisy).toContain('有 2 条附加层条目因时间未对齐主层而未导入。');
    expect(noisy).toContain('本项目里没有音频文件 missing.wav。语段已导入，未附带媒体。');
    expect(noisy).toContain('EAF 时间单位无法识别，已按毫秒读取。');
    expect(noisy).toContain('有 1 条引用对不上父标注，没有改用时间对齐。');
    expect(noisy).not.toContain('追加');
  });

  it('reports an append only when the handler says the text already had segments', () => {
    const losses = composeAnnotationImportLosses({
      unmatchedRefCount: 0,
      skippedIndependentTierSegmentCount: 0,
      droppedTranslationSegmentCount: 0,
      appendedWithoutId: true,
      appendedCount: 4,
    });
    const message = formatAnnotationImportDone({
      segmentCount: 4,
      tierCount: 0,
      losses,
      constraintRepairCount: 0,
      constraintWarningCount: 0,
      hostRecoveryWarningCount: 0,
      translate,
    });
    expect(message).toContain('这次又追加了 4 条没有稳定标注 id 的内容');
  });
});

describe('formatLexiconImportNotice', () => {
  it('names the unmapped codes and the stable-id losses', () => {
    const message = formatLexiconImportNotice(
      [{ code: 'note' }, { code: 'reversal' }],
      [{ code: 'no-stable-id', count: 1 }],
      translate,
    );
    expect(message).toContain('注释');
    expect(message).toContain('逆序');
    expect(message).toContain('另有 2 条 LIFT 内容未进入词条');
    expect(message).toContain('有 1 条没有稳定 id，已新建。');
  });

  it('is empty when every field was written', () => {
    expect(formatLexiconImportNotice([], [], translate)).toBe('');
  });
});
