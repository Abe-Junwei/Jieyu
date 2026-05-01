---
title: ADR-0028 — 助手多模态编排（工具真执行、共用对话态、本地优先、TTS）
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-04-30
source_of_truth: decision
supersedes_notes: |
  澄清并扩展 ADR-0027：0027 规定非听写语音与文字共用 AI 聊天主链；
  本 ADR 明确「打字不强制经过与语音相同的预路由层」，统一收敛在编排层（对话态、工具、副产物呈现）。
---

# ADR-0028：助手多模态编排（工具真执行、共用对话态、本地优先、TTS）

## 背景

成熟 AI 产品在「语音 / 文字」上要求：**同一套对话状态与工具执行语义**，避免「说得通、打不通」或工具仅伪装成聊天。仓库内仍存在未挂载的 `VoiceAgentService` 与 Hook 路径并行实现的风险，需定调收敛策略。

## 决策

### 1. 编排层统一，输入路径允许非对称

- **收敛目标**：**对话状态机（澄清、确认、消歧、多轮槽位）**、**工具（tool）注册与执行**、以及 **AI 回复的可观测副产物**（含未来将涉及的 **TTS**）共用**单一编排事实源**。
- **输入路径**：**语音**经 STT → 现有意图/路由链（含本地 action 快路径与需模型时的聊天主链，与 ADR-0027 一致）。**打字**进入助手时 **不强制** 先经过与语音相同的 `IntentRouter` 预分层；以用户直接键入的语义为主链输入。
- **解读**：「统一」指 **执行与状态**，不要求 **键入与口述在同一前置 NLU 漏斗**。

### 2. 工具调用按成熟产品形态

- **工具必须有独立执行路径**（注册表 → 执行 → 结果回传/失败处理）；允许向聊天区同步**说明性**文本，但 **不得以「伪造一条用户 Chat」作为 tool 的唯一或主要执行机制**。
- 语音侧若曾将 `tool` 意图简化为带前缀的 `sendToAiChat`，视为待偿还技术债，须迁移到与文字侧共用的 tool 层。

### 3. VoiceAgentService 的策略（建议定稿为「提取后退役生产路径」）

- **生产运行时**以当前 **Hook 栈 + `VoiceInputService` + `useVoiceAgentResultHandler`（及后续抽出的共用编排模块）** 为唯一挂载入口。
- **`VoiceAgentService` 单例及未使用的 `createVoiceAgentService`**：**不得**再承载与 Hook 路径重复的分发逻辑；实施上分阶段：
  1. 将 `VoiceAgentService.commandBridge` 中与产品仍相关的语义（如混合意图门控、记忆检测、与 tool 对齐的分发）**迁入**与 React 无关的共享模块，由 **单一** `finalizeUtterance` / `dispatchAssistantIntent` 类入口调用；
  2. 删除或收缩 `VoiceAgentService` 在生产中的并行实现，**保留**仅限单测/将来无 UI 宿主时可通过薄适配层复用同一共享模块（避免双份 `switch` 长期存活）。

### 4. 体验与基础设施取向

- **TTS**：纳入产品范围；与聊天/助手输出挂钩，受同一编排与对话态约束（具体引擎与离线策略在实现方案中落地，优先不阻断本地优先原则）。
- **共用 dialogue 状态**：语音触发的确认/消歧与打字侧触发的同类交互 **读写同一状态源**（由编排层暴露，UI 仅绑定）。
- **本地优先**：在 STT、小模型、可本地工具与缓存策略上 **优先本地可用性**；云端能力为增强路径，须有降级与显式用户预期（与桌面端策略一致）。

### 5. 文档

- 本 ADR 为「多模态编排 + 工具 + VoiceAgentService 收敛」的裁决来源；与 ADR-0027 **并存**：0027 管「非听写走聊天主链」，0028 管「编排/工具/对话态/本地优先/TTS」及 **打字不强制预路由**。

## 影响

- 代码：`useVoiceAgentResultHandler`、`VoiceAgentService.*`、`ChatOrchestrator` / `useAiChat`、未来共用的 dialogue/tool 模块；架构守卫与结构测试随 `VoiceAgentService` 收缩而更新。
- 测试：针对「同一会话内语音与键入」的 dialogue 与 tool **契约测试**。
- 观测：`inputModality` 等字段继续区分来源，但 **状态机与 tool 语义** 不分叉。

## 被放弃的备选方案

- **长期维护两条完整 dispatch 实现**（Hook + `VoiceAgentService` 全量并行）：与「成熟产品一致性」冲突。
- **仅用聊天消息模拟 tool**：与决策 §2 冲突。

## 后续回顾点

- TTS 缺省开关、离线包大小与 CSP/许可是否需单独 ADR。
- 若未来要求「键入也走统一预路由」，应新增 ADR 显式 supersede 本 ADR §1 第二句。
