---
title: annotation-translation-line design
doc_type: execution-spec-design
status: active
owner: annotation
last_reviewed: 2026-09-25
source_of_truth: annotation-translation-line-spec
depends_on:
  - ./requirements.md
---

# Design — Annotation Translation Line

## 1. 成熟方案扫描 / Research

- 仓库既有：`buildAnnotationIgtRows` 把 `translation` 写死成空字符串。IGT LaTeX 导出用同一 `unitId` 加上翻译层 `layerId` 去 `layer_unit_contents` 取文本，并跳过非 text 模态（`transcriptionIgtLatexExport.ts`）。批量读取已有 `listUnitTextsByUnits`。
- 同类产品：ELAN / FLEx IGT 的 free translation 是句段上的另一层文本，不另造一条时间重叠的句段。
- 业内：Leipzig IGT 的 `\glt` 是该例句的自由翻译，和原文同一条记录。
- 公认不可行：在标注页再写一套译文编辑；用起止时间猜测哪条翻译 unit 对齐；把转写层文本当成译文。
- 潜在的坑：同一句段若有多条文本，应保留最新的一条。`listUnitTextsByUnits` 按更新时间新到旧排序，选择器保留第一条。
- 决定：**复用** LaTeX 导出的配对：同一 unit、翻译层、text 模态。只读。无新 flag。

## 2. 架构选择

- 落位：既有 workspace query 多读一批内容；选择逻辑是纯函数
- 拒绝：新 controller；译文写入；时间重叠对齐

## 3. 落位清单

| 文件 | 职责 |
| --- | --- |
| `annotationTranslationText.ts` | 选出每个 unit 的译文 |
| `useAnnotationWorkspaceController.ts` | 读取并传入行模型 |
| `linguisticServiceTextTimelineOps.ts` | 批量读内容 |

## 4. ADR 引用

- 无新 ADR。读模型仍按转写轨投影句段。

## 5. Feature flag

- 无。

## 6. 失败模式 / 兼容性

- 没有翻译层或没有文本时，译文行保持空文案。
- 音频内容不显示。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| 单元 | picker + AnnotationPage | pass |
| typecheck | `npm run typecheck` | 0 errors |
