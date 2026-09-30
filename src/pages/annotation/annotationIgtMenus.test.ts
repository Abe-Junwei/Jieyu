import { describe, expect, it } from 'vitest';
import type { AnnotationLineId } from './annotationIgtLines';
import { buildAnnotationLineMenuItems } from './annotationIgtMenus';

const lines = ['source', 'word', 'gloss', 'pos', 'translation'] as const;

function menuIds(
  lineId: AnnotationLineId,
  languageLines?: { key: string; label: string }[],
): Array<string | undefined> {
  return buildAnnotationLineMenuItems({
    locale: 'zh-CN',
    unitId: 'u1',
    lineId,
    lines,
    onGlossLanguageDraft: () => undefined,
    ...(languageLines ? { languageLines } : {}),
    onMove: () => undefined,
    onRemove: () => undefined,
    onAdd: () => undefined,
  }).flatMap((item) => [item.testId, ...(item.children ?? []).map((child) => child.testId)]);
}

describe('buildAnnotationLineMenuItems', () => {
  it('lets each line open only the actions that line allows', () => {
    expect(menuIds('source').filter((id) => id !== undefined)).toEqual([
      'annotation-igt-add-line-morphForm-u1',
      'annotation-igt-add-line-lemma-u1',
      'annotation-igt-add-line-literal-u1',
      'annotation-igt-add-gloss-language-u1',
    ]);
    expect(menuIds('word').filter((id) => id !== undefined)).toEqual([
      'annotation-igt-line-down-word-u1',
      'annotation-igt-add-line-morphForm-u1',
      'annotation-igt-add-line-lemma-u1',
      'annotation-igt-add-line-literal-u1',
      'annotation-igt-add-gloss-language-u1',
    ]);
    expect(menuIds('gloss').filter((id) => id !== undefined)).toEqual([
      'annotation-igt-line-up-gloss-u1',
      'annotation-igt-line-down-gloss-u1',
      'annotation-igt-remove-line-gloss-u1',
      'annotation-igt-add-line-morphForm-u1',
      'annotation-igt-add-line-lemma-u1',
      'annotation-igt-add-line-literal-u1',
      'annotation-igt-add-gloss-language-u1',
    ]);
    expect(menuIds('pos').filter((id) => id !== undefined)).toEqual([
      'annotation-igt-line-up-pos-u1',
      'annotation-igt-remove-line-pos-u1',
      'annotation-igt-add-line-morphForm-u1',
      'annotation-igt-add-line-lemma-u1',
      'annotation-igt-add-line-literal-u1',
      'annotation-igt-add-gloss-language-u1',
    ]);
    expect(menuIds('translation').filter((id) => id !== undefined)).toEqual([
      'annotation-igt-add-line-morphForm-u1',
      'annotation-igt-add-line-lemma-u1',
      'annotation-igt-add-line-literal-u1',
      'annotation-igt-add-gloss-language-u1',
    ]);
  });

  it('offers another translation layer while one translation line is already shown', () => {
    expect(
      menuIds('translation', [{ key: 'translation:trl-en', label: '译文 · en' }]).filter(
        (id) => id !== undefined,
      ),
    ).toContain('annotation-igt-add-line-translation:trl-en-u1');
  });

  it('moves a line onto its neighbor in the same band', () => {
    const moved: string[] = [];
    const [up] = buildAnnotationLineMenuItems({
      locale: 'zh-CN',
      unitId: 'u1',
      lineId: 'gloss',
      lines,
      onMove: (from, to) => moved.push(`${from}->${to}`),
    });
    up?.onClick?.();
    expect(moved).toEqual(['gloss->word']);
  });
});
