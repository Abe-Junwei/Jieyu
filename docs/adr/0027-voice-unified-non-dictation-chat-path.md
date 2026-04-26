---
title: ADR-0027 — 非听写语音与文字统一走 AI 聊天主链
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-04-26
source_of_truth: decision
---

# ADR-0027：非听写语音与文字统一走 AI 聊天主链

## 背景

转写页存在听写、指令（command）、分析（analysis）等语音形态。听写必须保持独立写入链；command 与 analysis 若与文字输入的 AI 助手分叉，则确认门禁、工具与回归成本倍增。

## 决策

1. **听写（dictation）**独立：不合并进 AI 聊天发送路径。
2. **非听写（command / analysis）**与文字输入共用同一套理解与执行主链：本地 action 快路径保留；需模型参与的内容统一进入 `sendToAiChat` / `aiChatSend`。
3. **无功能开关、无旧分流**：`mode !== 'dictation'` 时启用 LLM 回退与模糊规则等非听写路由；行为以当前代码为唯一事实源。

## 影响

- 模块：`voiceIntentResolution`、`IntentRouter`、`useVoiceAgentResultHandler`、`useVoiceInteraction`、`useTranscriptionAssistantController`、`VoiceIntentLlmResolver` 配置。
- 行为数据：`ActionRecordDoc.inputModality` 为必填（`'voice' | 'text'`），语音代理触发的动作记为 `voice`。

## 被放弃的备选方案

- **环境开关分阶段放量**：在「无兼容、无历史数据」前提下移除，降低配置面与测试矩阵。
- **analysis 独立模型链**：与产品目标不一致。

## 后续回顾点

- 若未来需再次灰度新变体，应使用**新**开关名与 ADR，避免复活本决策已删除的语义。

## 现状事实与文件清单

见 `docs/architecture/voice-unified-chat-path.md`。
