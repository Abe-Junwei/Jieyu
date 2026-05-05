---
title: ADR-0029 — 助手 TTS（Web Speech）产品边界与治理
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-05-02
source_of_truth: decision
depends_on:
  - ./0028-assistant-multimodal-orchestration-local-first.md
---

# ADR-0029：助手 TTS（Web Speech）产品边界与治理

## 背景

ADR-0028 将 **TTS** 列为助手多模态编排的开放项：与聊天输出挂钩、受同一对话态约束。当前实现以浏览器 **`speechSynthesis`** 为主路径（`assistantWebSpeechTts`、用户偏好 `assistantTtsEnabled`、流式开始/结束时 `stopAssistantWebSpeechTts` 等）。本 ADR 固化 **缺省开关、降级提示、CSP/许可注意点、与对话态互斥** 的产品与工程边界（拍板见 [`AI语音拍板项-TTS-发布门禁-键入路由-2026-05-02.md`](../execution/plans/AI语音拍板项-TTS-发布门禁-键入路由-2026-05-02.md)）。

## 决策（已拍板，2026-05-02）

1. **引擎范围（v1）**：桌面端以 **Web Speech API `speechSynthesis`** 为唯一内置引擎；不在本 ADR 承诺离线语音包或第三方 TTS SDK。
2. **默认**：用户偏好 **`assistantTtsEnabled` 默认关**，须在设置中显式开启后才尝试朗读。
3. **宿主不支持时的行为**：`isAssistantWebSpeechTtsSupported()` 为假时 **不得** 阻塞发送/流式主链；对用户给出 **弱提示（toast，同一会话周期内至多一次）**，文案复用设置项说明键 `transcription.voiceWidget.settings.assistantTtsUnsupported`。
4. **与对话态互斥**：朗读进行中，**新助手流式开始**须 `stopAssistantWebSpeechTts`（与现有 Hook 行为一致）；与 `assistantDialogueState` 的 pending tool / 确认态关系在实现锚点文档中交叉引用，不在本 ADR 重复定义状态机。
5. **观测与隐私**：不在 TTS 文本路径写入超出聊天区已展示内容的额外遥测；若未来增加「朗读片段哈希」类指标，须单独门禁与 DPA 审查。

## 影响

- 代码：`src/utils/assistantWebSpeechTts.ts`、`useVoiceInteraction` / `useVoiceAgentStartController` 中与 TTS 相关的启停、偏好读写。
- 文档：`docs/architecture/桌面端浏览器支持策略.md` 交叉引用本 ADR（CSP / `speechSynthesis` 可用性以特性检测为准）。

## 被放弃的备选方案

- **默认强制开启 TTS**：与「不阻断主链」及可访问性预期冲突。
- **在未定义互斥规则前接入第二 TTS 引擎**：增加矩阵与测试成本，推迟到本 ADR `accepted` 后独立变更。

## 后续回顾点

- 是否将默认策略调整为「首次进入助手区教育 + 显式 opt-in」（当前为设置内显式开启）。
- 是否与桌面壳（Electron）共享同一 TTS 策略表。
