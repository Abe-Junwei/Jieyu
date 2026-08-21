---
title: ADR-0033 — 分析页承接向量与统计，转写页不再用 AI 右栏
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-08-21
source_of_truth: decision-record
---

# ADR-0033：分析页是受限工作台；转写轴铺满

## 背景

ADR-0032 把对话收进浮窗后，转写右栏仍挂向量 / 统计 / 声学，占用时间轴宽度。这三件事入口不同：语料索引适合独立页；相似句是句段动词；声学必须对着波形。

ADR-0002 仍成立：转写是唯一开放工作台。本 ADR 不把 `/analysis` 升格为产品级开放工作台，只把它从说明页改成**受限工作台**，复用已有 `AnalysisRuntime`，不复制 ReadyWorkspace 编排器。

## 决策

1. **顶栏 `/analysis`** 是向量索引、任务表、语料统计的主入口。深链 `textId` / `mediaId` / `unitId` / `tab` / `intent=similar`，跳回转写用 `buildTranscriptionDeepLinkHref`。
2. **右键只加「检索相似句」**，深链到 `/analysis?tab=embedding&…&intent=similar`。不加「打开分析工作台」。
3. **声学检查留在转写页**：底栏开关打开全宽检查条，占高度不占 `--transcription-ai-visible-width`。不迁到 `/analysis`（该页无波形）。
4. **转写页不再挂 AI 右栏与折叠把手**。可见宽度恒为 `0`。对话仍只在浮窗（ADR-0032）。

## 影响

- `AnalysisPage` 装配 `TranscriptionPageAnalysisRuntime`（`visibleTabs`: embedding / stats）。
- `TranscriptionPage.ReadyWorkspaceLayout` 卸掉 `AiSidebar` / `AiPanelHandle`；底栏挂声学检查条。
- 分析页不是第二套转写工作台，不嵌波形。

## 被放弃的备选方案

- 分析 FAB 与聊天 FAB 并列。
- 把分析页做成带嵌套波形的第二转写台。
- 把分析塞回聊天窗。
- 恢复 380px AI 停靠栏。

## 后续回顾点

- 声学检查条若不够用，再考虑临时浮层，而不是右栏。
- 若分析页要成为开放工作台，须满足独立工作台开放门槛后再 supersede ADR-0002。
