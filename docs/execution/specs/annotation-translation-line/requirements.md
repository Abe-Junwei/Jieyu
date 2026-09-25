---
title: annotation-translation-line requirements
doc_type: execution-spec-requirements
status: active
owner: annotation
last_reviewed: 2026-09-25
source_of_truth: annotation-translation-line-spec
depends_on:
  - ../annotation-validator-panel/requirements.md
---

# Requirements — Annotation Translation Line

## 1. What & Why

- **要做什么**：`/annotation` 的 IGT 译文行显示该句段在翻译层上已有的文本。
- **为什么现在做**：译文行一直写死为空，有翻译层内容时也显示「暂无译文」。
- **不做什么**：编辑译文；按时间重叠去对另一条 unit；M2 typed relation；新 flag。

## 2. 用户场景（≤ 3 条）

1. 句段在翻译层有文本时，IGT 译文行显示这句文本。
2. 没有翻译层，或该层没有文本时，仍显示「暂无译文」。
3. 音频模态的翻译内容不显示在译文行。

## 3. 验收标准（可测）

- [x] 翻译层文本出现在对应 IGT 行
- [x] 无翻译层时仍是空译文文案
- [x] 音频模态不进入译文行
- [x] 不写译文、不改转写文本

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Read | `linguisticServiceTextTimelineOps.ts` | 按 unit id 批量读内容 |
| Pure | `annotationTranslationText.ts` | 选出翻译层文本 |
| Controller | `useAnnotationWorkspaceController.ts` | 把文本交给行模型 |
| 测试 | picker + AnnotationPage | 新增 |
