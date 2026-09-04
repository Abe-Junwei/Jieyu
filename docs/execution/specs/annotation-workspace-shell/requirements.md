---
title: annotation-workspace-shell requirements
doc_type: execution-spec-requirements
status: active
owner: annotation
last_reviewed: 2026-09-04
source_of_truth: annotation-workspace-shell-spec
---

# Requirements — Annotation Workspace Shell (B4a-1)

## 1. What & Why

- **要做什么**：给 `/annotation` 加 flag 关占位 / flag 开只读 IGT 列表 + 键盘状态机骨架。按轨读走 `annotationLaneReadScope`。
- **为什么现在做**：P0-3 上半；B4a-2 编辑保存需要可渲染的行与焦点模型。
- **不做什么**：不写 `layer_units` / `unit_tokens`；不做 POS/gloss 可编辑输入（B4a-2）；不接行内播放/波形；不上 `@tanstack/react-virtual` / leipzig.js；不注入转写 hotspot controller；不接 AI / ChatWindow。

## 2. 用户场景（≤ 3 条）

1. Flag 关：`/annotation` 仍是 `FeatureAvailabilityPanel`。
2. Flag 开、有 text 范围：看到当前 media 的 IGT 行（原文 / token gloss / 译文占位），可深链回转写。
3. 行聚焦时 `Space` 记播放意图但不播；`Enter` 进入输入态后 `Space` 不当播放。

## 3. 验收标准（可测）

- [ ] `annotationPageEnabled` 默认 `false`；flag 关 DOM 仍为占位面板
- [ ] 列表不按 `unit.layerId === laneId` 自行过滤，走 `resolveCanonicalUnitForTranscriptionLaneRow`
- [ ] 键盘纯函数覆盖 M0 表：row `Space`→playToggle；input `Space`→insertSpace；无建议 `Tab`→moveNext；`Enter`→commitStay；`Ctrl+Enter`→commitNext 且不跳行
- [ ] 不改 ChatWindow；`check:architecture-guard` 无新增 hotspot

## 4. 受影响代码地图

| 类别 | 文件 | 改动 |
| --- | --- | --- |
| 页面 | `AnnotationPage.tsx` | flag 装配 |
| Controller | `useAnnotationWorkspaceController.ts` | 只读列表 + 键盘 |
| Helper | `annotationKeyboardMachine.ts` / `annotationLaneUnitProjection.ts` | 纯函数 |
| UI / CSS | `AnnotationWorkspace.tsx` / `annotation-workspace.css` | IGT 行 |
| Flag / i18n | `featureFlags.ts` / `dictKeys` | 新增 |

## 5. 已知风险与依赖

- layout guard 仍要求 `AnnotationPage.tsx` 含 `FeatureAvailabilityPanel` 与 feature-availability.css。
- Controller 不加到转写页；回滚：关 flag。
