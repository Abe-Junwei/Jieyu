---
title: ADR-0032 — 转写页 AI 对话仅浮窗
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-08-21
source_of_truth: decision-record
---

# ADR-0032：转写页 AI 对话仅浮窗

## 背景

转写页同时挂载右侧 `TranscriptionPageAiSidebar` 的助手 Tab 与 `TranscriptionPageChatWindow`，各有一棵 `AiChatCard`。语音抽屉只在侧栏。主表面是多层时间轴：需要铺满宽度，对话是偶尔问。

## 决策

1. **对话唯一宿主**是浮动聊天窗。窗内挂载 `TranscriptionPageAssistantRuntime`（含语音抽屉），`showHeader={false}`，顶栏仍由窗头绘制。
2. **右侧栏不再承担分析。** 向量 / 统计迁到受限工作台 `/analysis`（ADR-0033）。本条被 ADR-0033 supersede。
3. **工具确认**打开浮窗，不展开分析栏、不抢时间轴宽度。
4. **停靠 ⇄ 浮窗两套壳**（`docs/execution/specs/ai-assistant-presentation-modes/`）延后；关闭浮窗不等于收回侧栏。

## 影响

- `TranscriptionPage.ChatWindow.tsx`：唯一 `AssistantRuntime` / `AiChatCard`。
- `useReadyWorkspaceRenderController`：pending tool 打开浮窗，不展开右栏。
- 分析右栏与折叠把手已拆除，见 ADR-0033。

## 被放弃的备选方案

- **只侧栏**：常驻让宽，与「轴要铺满、偶尔问」相反。
- **同一会话两套壳**：适合边看边改；本轮不付互斥挂载与 Dock/Pop-out 成本。
- **现状双挂载**：两棵树、语音只在栏里，无产品优势。

## 后续回顾点

- 临时放大已落地：放大填满视口留白，不写入默认尺寸；关闭或刷新后回到上次普通窗几何。
- 浮窗默认只留窗头（标题 / 状态 / 设置 / 最小 / 放大 / 关闭）+ 消息 + 输入；摘要、Run 时间线、指标、Prompt Lab、决策回放不再占主列。语料范围条仍在窗内。
- 停靠 ⇄ 浮窗两套壳仍延后，见 `docs/execution/specs/ai-assistant-presentation-modes/`。
- 分析表面已迁出右栏，见 [ADR-0033](./0033-analysis-restricted-workspace-no-transcription-dock.md)。
