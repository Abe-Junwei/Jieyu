---
title: annotation-retokenize requirements
doc_type: execution-spec-requirements
status: active
owner: annotation
last_reviewed: 2026-09-14
source_of_truth: annotation-retokenize-spec
depends_on:
  - ../annotation-m1-open/requirements.md
  - ../../plans/标注页与词典页开发路线图-2026-04-25.md
---

# Requirements — Annotation Retokenize (B4f)

## 1. What & Why

- **要做什么**：在 `/annotation` 对当前句段做二次自动分词：先预览建议词列，确认后才写入。默认保守模式。
- **为什么现在做**：M1 已开放 IGT；子计划与 ADR-0022 把二次分词列为 M1 余量；人工切分已有，缺自动候选。
- **不做什么**：不覆盖已有 POS/gloss/词素/词典链接或脏草稿的 `unit_tokens`；不做强制覆盖/快照回滚；不改转写文本/时间码；不接 ChatWindow；不新 flag；不新 Dexie 表；不引入分词模型依赖。

## 2. 用户场景（≤ 3 条）

1. 句段原文是未标注的整句 token，预览后确认，按 Unicode 词边界切成多词并 readback。
2. 句段已有 gloss/POS/词素/链接或脏草稿时，确认只写入 pending `analysis_graph_candidate`（`alternativeAnalysis`），现有词不变。
3. 建议与当前词列相同则不写库。

## 3. 验收标准（可测）

- [x] 预览零写入
- [x] 无人工痕迹时确认写 `unit_tokens` 后 list readback 等于建议词列
- [x] 有人工痕迹时确认不改 token，只留下 pending candidate
- [x] 空原文或建议不变：不写库

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Helper | `src/pages/annotation/annotationRetokenize.ts` | 新增 |
| Controller | `src/pages/useAnnotationRetokenizeController.ts` | 新增 |
| UI / i18n | `AnnotationIgtUnitExtras` / dict | 装配 |
| Graph | `src/annotation/analysisGraphConfirmation.ts` | 复用 submit |
| 测试 | `annotationRetokenize.test.ts` + `AnnotationPage.test.tsx` | 新增 / 修改 |

## 5. 已知风险与依赖

- ADR-0022：自动分词只能出 `alternativeAnalysis` / pending；覆盖人工须审核或强制模式（本切片不做强制）。
- workspace controller 已近上限：分词不得再往里堆。
- `Intl.Segmenter` 特性检测；无则空白切分。
