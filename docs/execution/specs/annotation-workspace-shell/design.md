---
title: annotation-workspace-shell design
doc_type: execution-spec-design
status: active
owner: annotation
last_reviewed: 2026-09-04
source_of_truth: annotation-workspace-shell-spec
depends_on:
  - ./requirements.md
  - ../../plans/标注页与词典页开发路线图-2026-04-25.md
  - ../../../adr/0020-unscoped-canonical-unit-transcription-lane-read-scope.md
---

# Design — Annotation Workspace Shell (B4a-1)

## 1. 成熟方案扫描 / Research

- 仓库既有：`CorpusLibraryPage` flag 关占位；`annotationLaneReadScope` 已 re-export ADR-0020；`LinguisticService.units.listByTextId` + `listTokensByUnitIds`；键盘表已冻结于标注路线图 M0。禁止复用 `useTranscriptionAnnotationController`（绑转写 overlap/toast）。
- 同类产品：FLEx / Plaid Analyze 用 Tab 走格子、Ctrl+Enter 确认并跳下一词；ELAN 标注页是时间轴不是 IGT 矩阵。Leipzig Glossing Rules 要求词–gloss 逐项对应。
- 业内：Web IGT 用 CSS inline-grid/flex 词柱对齐（r12a），**不要** ContentEditable；路线图已拒绝 leipzig.js 默认依赖，仅对齐失败时再 Spike。
- 公认不可行：把标注多选镜像转写 `selectedUnitIds`；在 Orchestrator 叠 IGT；用 `unit.layerId === laneId` 滤 canonical（ADR-0020 禁止）。
- 潜在的坑：ChatWindow hotspot 96%，零触及；虚拟列表与行内 wavesurfer 是 M1 后护栏，本切片不做。
- 决定：**适配** 语料页 flag 壳 + ADR-0020 读入口；**自研** 键盘 reduce 纯函数；**复用** token 只读列表拼 gloss 行；**拒绝** leipzig.js / react-virtual / 转写 annotation controller。

## 2. 架构选择

- 落位：`derived`（lane 投影 + IGT 行）+ `state`（焦点/模式）+ 页面组装
- 方案 A：独立 `useAnnotationWorkspaceController` + 只读 IGT — **选 A**
- 拒绝：注入 `useTranscriptionAnnotationController`；B4a-1 就做可写 gloss

## 3. 落位清单

| 文件 | 职责 | 复杂度 |
| --- | --- | --- |
| `annotationKeyboardMachine.ts` | M0 键盘 reduce | < 80 |
| `annotationLaneUnitProjection.ts` | media + lane 投影 | < 80 |
| `useAnnotationWorkspaceController.ts` | 读列表 / 焦点 | < 220 / < 12 hooks |
| `AnnotationWorkspace.tsx` / CSS | 只读 IGT；无第 3 层 border | < 180 |
| `AnnotationPage.tsx` | flag 装配 | < 40 |

约束自查：无 ChatWindow；无 `src/features/`；面板最多 2 层 border。

## 4. ADR 引用

- ADR-0020：按轨读必须走 `resolveCanonicalUnitForTranscriptionLaneRow`
- 新建 ADR：否

## 5. Feature flag

- `annotationPageEnabled` / `VITE_ANNOTATION_PAGE_ENABLED`
- 默认 `false`（全部环境）

## 6. 失败模式 / 兼容性

- flag 关：占位页与现网一致
- 无 text 范围：空态，引导回转写
- `Ctrl+Enter` 无保存：不跳行（与 M0「保存失败不跳行」同形）
- 回滚：关 flag

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| typecheck | `npm run typecheck` | 0 errors |
| 单元测试 | `npx vitest run src/pages/annotation/annotationKeyboardMachine.test.ts src/pages/annotation/annotationLaneUnitProjection.test.ts src/pages/AnnotationPage.test.tsx src/pages/FeatureAvailabilityPage.layoutGuard.test.ts src/ai/config/featureFlags.environmentMatrix.test.ts` | pass |
| 守卫 | architecture-guard / docs | OK |
