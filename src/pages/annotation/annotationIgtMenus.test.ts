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
    ]);
    expect(menuIds('word').filter((id) => id !== undefined)).toEqual([
      'annotation-igt-line-down-word-u1',
      'annotation-igt-add-line-morphForm-u1',
      'annotation-igt-add-line-lemma-u1',
      'annotation-igt-add-line-literal-u1',
    ]);
    expect(menuIds('gloss').filter((id) => id !== undefined)).toEqual([
      'annotation-igt-line-up-gloss-u1',
      'annotation-igt-line-down-gloss-u1',
      'annotation-igt-remove-line-gloss-u1',
      'annotation-igt-add-line-morphForm-u1',
      'annotation-igt-add-line-lemma-u1',
      'annotation-igt-add-line-literal-u1',
    ]);
    expect(menuIds('pos').filter((id) => id !== undefined)).toEqual([
      'annotation-igt-line-up-pos-u1',
      'annotation-igt-remove-line-pos-u1',
      'annotation-igt-add-line-morphForm-u1',
      'annotation-igt-add-line-lemma-u1',
      'annotation-igt-add-line-literal-u1',
    ]);
    expect(menuIds('translation').filter((id) => id !== undefined)).toEqual([
      'annotation-igt-add-line-morphForm-u1',
      'annotation-igt-add-line-lemma-u1',
      'annotation-igt-add-line-literal-u1',
    ]);
  });

  it('keeps a free gloss language field when the project has no working languages', () => {
    const ids = buildAnnotationLineMenuItems({
      locale: 'zh-CN',
      unitId: 'u1',
      lineId: 'gloss',
      lines,
      onAdd: () => undefined,
      onGlossLanguageDraft: () => undefined,
    }).flatMap((item) => [item.testId, ...(item.children ?? []).map((child) => child.testId)]);
    expect(ids).toContain('annotation-igt-add-gloss-language-u1');
  });

  it('offers another translation layer while one translation line is already shown', () => {
    expect(
      menuIds('translation', [{ key: 'translation:trl-en', label: '译文 · en' }]).filter(
        (id) => id !== undefined,
      ),
    ).toContain('annotation-igt-add-line-translation:trl-en-u1');
  });

  it('picks a working language for the line with a dot on the current one', () => {
    const language = buildAnnotationLineMenuItems({
      locale: 'zh-CN',
      unitId: 'u1',
      lineId: 'gloss',
      lines,
      workingLanguageIds: ['eng', 'zho'],
      languageByLine: { gloss: 'eng' },
      onAssignLanguage: () => undefined,
      onAdd: () => undefined,
    }).find((item) => item.children?.some((child) => child.selectionVariant === 'dot'));
    expect(
      language?.children?.map((child) => ({
        label: child.label,
        variant: child.selectionVariant,
        state: child.selectionState,
      })),
    ).toEqual([
      { label: 'eng', variant: 'dot', state: 'selected' },
      { label: 'zho', variant: 'dot', state: 'unselected' },
    ]);
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
