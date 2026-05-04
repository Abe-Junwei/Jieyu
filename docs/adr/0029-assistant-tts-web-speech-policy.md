---
title: ADR-0029 — 助手 TTS（Web Speech）产品边界与治理
doc_type: adr
status: proposed
owner: repo
last_reviewed: 2026-05-01
source_of_truth: decision
depends_on:
  - ./0028-assistant-multimodal-orchestration-local-first.md
---

# ADR-0029：助手 TTS（Web Speech）产品边界与治理

## 背景

ADR-0028 将 **TTS** 列为助手多模态编排的开放项：与聊天输出挂钩、受同一对话态约束。当前实现以浏览器 **`speechSynthesis`** 为主路径（`assistantWebSpeechTts`、用户偏好 `assistantTtsEnabled`、流式开始/结束时 `stopAssistantWebSpeechTts` 等）。尚未有单独 ADR 固化 **缺省开关、降级、CSP/许可、与对话态互斥** 的产品与工程边界。

## 决策（草案，待产品确认后改为 accepted）

1. **引擎范围（v1）**：桌面端以 **Web Speech API `speechSynthesis`** 为唯一内置引擎；不在本 ADR 承诺离线语音包或第三方 TTS SDK。
2. **默认与降级**：默认 **关** 或 **关+首次明示** 由产品拍板；宿主不支持或 `speechSynthesis` 不可用时 **静默跳过**（已有 `isAssistantWebSpeechTtsSupported` 模式），不得阻塞发送/流式主链。
3. **与对话态互斥**：朗读进行中，**新助手流式开始**须 `stopAssistantWebSpeechTts`（与现有 Hook 行为一致）；与 `assistantDialogueState` 的 pending tool / 确认态关系在实现锚点文档中交叉引用，不在本 ADR 重复定义状态机。
4. **观测与隐私**：不在 TTS 文本路径写入超出聊天区已展示内容的额外遥测；若未来增加「朗读片段哈希」类指标，须单独门禁与 DPA 审查。

## 影响

- 代码：`src/utils/assistantWebSpeechTts.ts`、`useVoiceInteraction` / `useVoiceAgentStartController` 中与 TTS 相关的启停、偏好读写。
- 文档：`docs/architecture/桌面端浏览器支持策略.md` 须交叉引用本 ADR 的 CSP / autoplay 注意点（落地时补链）。

## 被放弃的备选方案

- **默认强制开启 TTS**：与「不阻断主链」及可访问性预期冲突。
- **在未定义互斥规则前接入第二 TTS 引擎**：增加矩阵与测试成本，推迟到本 ADR `accepted` 后独立变更。

## 后续回顾点

- 是否将默认策略调整为「首次开启前教育 + 显式 opt-in」。
- 是否与桌面壳（Electron）共享同一 TTS 策略表。
