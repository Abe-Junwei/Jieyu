---
title: annotation-token-edit design
doc_type: execution-spec-design
status: active
owner: annotation
last_reviewed: 2026-09-04
source_of_truth: annotation-token-edit-spec
depends_on:
  - ./requirements.md
  - ../annotation-workspace-shell/design.md
  - ../../plans/标注页与词典页开发路线图-2026-04-25.md
---

# Design — Annotation Token Edit (B4a-2)

## 1. 成熟方案扫描 / Research

- 仓库既有：`LinguisticService.units.updateTokenPos` / `updateTokenGloss` 已写 `unit_tokens`；`useTranscriptionTokenActions` 只是转写 `unit.words` 乐观补丁，标注页无 `setUnits`。`useTranscriptionAnnotationController` 是 overlap toast，不是 POS/gloss。B4a-1 键盘表已冻结 Enter=commitStay、Ctrl+Enter=commitNext（机内不跳行）。
- 同类产品：Plaid Analyze 用受控格子；Tab 走格，Ctrl+Enter 确认整词并跳下一词。FLEx 词间标注写 lexicon+IGT，不另起一套 token 表。Leipzig Glossing Rules 要求词–gloss 对齐。
- 业内：Web IGT 用 CSS inline-grid 对齐；React 受控 input，不用 ContentEditable。路线图已拒绝 leipzig.js 作编辑器。
- 公认不可行：ContentEditable IGT；把 gloss 写成 `layer_units` contentRole；从标注页调用 AI `annotationAdapters` / `AutoGlossService.glossUnit`；挂转写 hotspot controller。
- 潜在的坑：服务默认 gloss lang=`eng` 与页面 `default` 展示分裂；输入态若 `preventDefault` Space 会禁空格；`commitNext` 必须等 write+readback 成功；ChatWindow 96% hotspot。
- 决定：**复用** `unit_tokens` 写 API + B4a-1 键盘 reduce；**适配** 脏草稿覆盖展示值、成功后再跳行；**自研** 最小草稿/readback 纯函数。POS 下拉推迟到有词类集。不新增依赖。

## 2. 架构选择

- 落位：`state`（草稿）+ `actions`（保存）+ `derived`（展示值）
- 选 A：独立 annotation helper 调 LinguisticService，query refetch readback
- 拒绝：复用 `useTranscriptionTokenActions`（绑 `setUnits`）；B4a-2 做 morpheme/Validator

## 3. 落位清单

| 文件 | 职责 | 复杂度 |
| --- | --- | --- |
| `annotationTokenDrafts.ts` | 脏字段 + gloss lang | < 80 |
| `saveAnnotationIgtRowTokens.ts` | 写 POS/gloss → listTokens readback | < 90 |
| `useAnnotationWorkspaceController.ts` | 草稿/提交/键盘接线 | < 280 / ≤ 12 hooks |
| `AnnotationWorkspace.tsx` + CSS | 受控 POS/gloss；无第 3 层容器 border | 增量 < 80 |

约束自查：无 ChatWindow；无 `src/features/`；原生 input 边框不计入容器层。

## 4. ADR 引用

- ADR-0020 读范围不变；token 写仍走 `unit_tokens`
- 新建 ADR：否

## 5. Feature flag

- 沿用 `annotationPageEnabled`，默认 `false`

## 6. 失败模式 / 兼容性

- 保存失败：提示错误，焦点不跳
- 无脏字段的 Ctrl+Enter：视为成功并跳行
- 回滚：关 flag

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| typecheck | `npm run typecheck` | 0 errors |
| 单元 / 持久化 | `npx vitest run src/pages/annotation/annotationTokenDrafts.test.ts src/pages/annotation/saveAnnotationIgtRowTokens.test.ts src/pages/annotation/annotationKeyboardMachine.test.ts src/pages/AnnotationPage.test.tsx` | pass；含写→readback |
| 守卫 | architecture-guard / docs / workflow | OK |
| E2E | 默认 flag 关，Vite 编译期开关；本切片以 Dexie vitest 为持久化证据 | — |
