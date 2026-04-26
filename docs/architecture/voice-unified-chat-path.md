---
title: 语音非听写统一聊天路径（现状）
doc_type: architecture
status: active
owner: repo
last_reviewed: 2026-04-26
source_of_truth: current-state
---

# 语音非听写统一聊天路径（现状）

## 目标状态

| 形态 | 主链 |
|------|------|
| dictation | 独立 STT → `insertDictation` / 听写流水线 |
| command / analysis | 规则 + LLM（`mode !== 'dictation'` 时）→ `action` 本地执行 / `chat`·`tool`·`slot-fill` 与文字一致走 AI 聊天 |

架构决策见 [ADR-0027](../adr/0027-voice-unified-non-dictation-chat-path.md)。

## 功能开关

无。非听写统一路径为**唯一**实现（见 ADR-0027）。

## 关键代码路径（文件级）

| 文件 | 职责 |
|------|------|
| `src/services/voiceIntentResolution.ts` | `chat` 意图下：`mode !== 'dictation'` 则尝试 LLM 回退 |
| `src/services/IntentRouter.ts` | `routeIntent`；非听写模式启用模糊规则 |
| `src/hooks/useVoiceAgentResultHandler.ts` | STT final → 解析 → dictation vs `sendToAiChat`；`userBehaviorStore.recordAction(..., inputModality: 'voice')` |
| `src/hooks/useVoiceInteraction.ts` | `sendToAiChat` → `aiChatSend`；分析写回 |
| `src/pages/useTranscriptionAssistantController.ts` | `handleResolveVoiceIntentWithLlm` / `handleVoiceDictation` |
| `src/ai/config/voiceIntentResolver.ts` | LLM `modePrompts` |
| `src/services/VoiceIntentLlmResolver.ts` | LLM 调用与 JSON 解析 |
| `src/services/userBehaviorDB.ts` | `ActionRecordDoc.inputModality` 必填 |
| `src/services/transcriptionKeyboardActionTelemetry.ts` | 转写页**键盘**快捷键命中后写入 `inputModality: 'text'`（与语音 `voice` 区分） |
| `src/hooks/useKeybindingActions.ts` | 全局 / 波形区快捷键分发处调用上述打点（**不**经过语音 `executeAction`） |
| `src/pages/transcriptionToolbarProps.ts` | 波形工具栏点击（播放/±10s 跳转/循环/撤销重做/备注/复核/自动分段/删音频或项目）同上打点 |

## 发布与验证

见 [voice-unified-chat-path-rollout.md](../execution/release-gates/voice-unified-chat-path-rollout.md)（指标与 QA 抽检、自动化命令索引；无「关 FF 回滚」路径）。  
合入前快捷自检：`npm run check:voice-agent-pre-merge`（含 ActionId 注册契约，见 [`transcription-voice-action-id-registry-contract.md`](./transcription-voice-action-id-registry-contract.md)）。  
手工留痕脚本与记录模板：[`手工验收执行脚本-非听写语音统一主链-ADR0027-2026-04-26.md`](../execution/archive/manual-validation/手工验收执行脚本-非听写语音统一主链-ADR0027-2026-04-26.md)。
