---
title: annotation-retokenize design
doc_type: execution-spec-design
status: active
owner: annotation
last_reviewed: 2026-09-14
source_of_truth: annotation-retokenize-spec
depends_on:
  - ./requirements.md
  - ../annotation-morpheme-edit/design.md
  - ../../../adr/0022-annotation-analysis-graph-typed-relations.md
---

# Design — Annotation Retokenize (B4f)

## 1. 成熟方案扫描 / Research

- 仓库既有：B4b `splitMergeAnnotationTokens` 手动切/并；`submitAnalysisGraphCandidate` pending 生命周期；`sliceAssistantStreamText` 已用 `Intl.Segmenter` + `\S+` 回退；AutoGloss 预览零写入再确认。
- 同类产品：FLEx 词切分尊重已确认 wordform，Guess/Parse 不静默覆盖；ELAN Tokenize 是独立层；Flibl 按书写系统 word-forming 字符切 ELAN→FLEx，不改已有 FLEx 分析。
- 业内：UAX #29 词边界；TC39 `Intl.Segmenter({granularity:'word'})` + `isWordLike`；MDN 明确 `split(' ')` 对无空格文种错误。
- 公认不可行：自训分词模型；静默 `removeToken` 级联抹掉 gloss；把逻辑塞进 workspace / ChatWindow；为 B4f 新 Dexie 版本。
- 潜在的坑：`removeToken` 级联 morpheme/link；jsdom Segmenter 与浏览器略有差；candidate `displayGloss` 不能空；fixture id ≤ 128。
- 决定：**复用** LinguisticService token API + `submitAnalysisGraphCandidate`；**适配** UAX #29 Segmenter（与 stream helper 同策略）；**自研** 保守 apply 分流。不新增依赖。

## 2. 架构选择

- 落位：`derived`（建议词列）+ `actions`（确认写 token 或 candidate）
- 选 A：sibling `useAnnotationRetokenizeController` + 纯函数；workspace 只装配
- 拒绝：挂进 morphology controller；强制覆盖+undo 栈（另切片）

## 3. 落位清单

| 文件 | 职责 | 复杂度 |
| --- | --- | --- |
| `annotationRetokenize.ts` | 切分、人工痕迹判断、写 token 或 candidate | < 180 |
| `useAnnotationRetokenizeController.ts` | preview/apply 状态 | < 140 / ≤ 8 |
| `AnnotationIgtUnitExtras.tsx` | 预览/采纳按钮 | 增量 |

约束自查：无 ChatWindow；无 `src/features/`；不新增容器 border。

## 4. ADR 引用

- ADR-0022：自动分词 → pending `alternativeAnalysis`；不覆盖 `manualConfirmed` 式人工痕迹
- 新建 ADR：否

## 5. Feature flag

- 沿用 `annotationPageEnabled`（已默认 true）
- 无新 flag

## 6. 失败模式 / 兼容性

- 无 Segmenter：空白切分
- 有人工痕迹：只写 pending candidate
- 回滚：revert PR；candidate 可 reject

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| typecheck | `npm run typecheck` | 0 errors |
| 持久化 | Dexie vitest retokenize readback / candidate | pass |
| 守卫 | architecture-guard / docs / workflow / r1-r8 | OK |
